# Item 32 — Health checks agendados no servidor, com eventos via SSE

> Especificação de implementação do item 32 da lista de sugestões de melhorias (arquivo local `sugestoes-de-melhorias.md`, ignorado pelo git — por isso a proposta original está resumida na seção 1).
> Este documento é a fonte para a implementação: as decisões abaixo já foram tomadas e não devem ser reabertas sem conversar.

## 1. Contexto

Hoje o monitoramento só existe enquanto alguém está com a aba aberta: o frontend mantém um ticker por ambiente ([index.html `startAuto()`](../frontend/index.html)), dispara `POST /applications/:env/sync` e a API checa as aplicações sob demanda, com o resultado cacheado no Redis (`sync:<env>`, `SYNC_CACHE_TTL`).

Proposta original do item 32: mover o agendamento dos health checks para o servidor, já que hoje só há monitoramento enquanto alguém está com a aba aberta; isso viabiliza histórico, uptime, latência e alertas no servidor (itens 33 a 37).

Depois desta mudança:

- a **API** checa os três ambientes sozinha, em intervalo fixo, sem depender de navegador;
- cada resultado é **publicado assim que o check daquela aplicação termina**, num novo endpoint SSE `GET /applications/events`;
- o frontend **não tem mais timer**: só escuta o SSE, mostra a hora da última verificação e mantém o botão "Sincronizar", que força um ciclo.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Transporte | SSE (`text/event-stream`), um único stream com os três ambientes. |
| Implantação | **Uma instância** da API. Agendador e fan-out SSE em memória, no processo. Várias réplicas checariam em dobro — limitação documentada, fora de escopo. |
| Rota de sync forçado | Mantém `POST /applications/:env/sync`. |
| Resposta do sync forçado | **202 imediato**; resultados chegam só pelo SSE. |
| Sync forçado com ciclo em andamento | **Junta-se** ao ciclo atual (não dispara outro). |
| Agenda | Grade fixa por ambiente: `bootAt + offset + n · HEALTH_CHECK_INTERVAL_S`. |
| Offsets no boot | Produção **0 s**, homologação **10 s**, desenvolvimento **20 s** (constante no código). |
| Sync forçado e a grade | Roda na hora e **cancela apenas o próximo horário agendado**; o seguinte volta à grade original. A defasagem entre ambientes nunca se perde. |
| Intervalo | Uma variável global `HEALTH_CHECK_INTERVAL_S`, padrão **30**, mínimo 5. |
| Estado (último status, último ciclo) | **Apenas no Redis**. Redis fora → os checks seguem, sem detecção de mudança (todo resultado conta como mudança), snapshot sai vazio. |
| Estado inicial do cliente | Evento `snapshot` na conexão (e em toda reconexão). |
| Filtro | `?changes=true` → só apps cujo `status` mudou; `?changes=false` ou ausente → todo check. O evento de fim de ciclo vem sempre. Sem filtro de ambiente. |
| Campos do evento por app | `id`, `name`, `env`, `status`, `latencyMs`, `limitMs` (só em `degraded`), `checkedAt`. |
| Evento de início de ciclo | Não existe. |
| App recém-criada | **Não** é checada na hora; entra no próximo ciclo do ambiente. |
| Cache do `/sync` | **Removido**: `SYNC_CACHE_TTL`, chave `sync:<env>` e `?fresh=1` saem. `apps:<env>` continua. |
| Frontend | Sai o timer, o seletor de periodicidade e as contagens regressivas. Mostra só a "última verificação" do ambiente na tela (a próxima não é exibida, embora a API mande `nextCheckAt`). Mantém "Sincronizar". |
| SSE caiu | Tempestade (`markApiDown()`) se não reconectar em ~5 s. O `snapshot` da reconexão limpa. |

## 3. Visão geral

```
                    ┌──────────────── API (processo único) ────────────────┐
 boot ─▶ scheduler ─┤ timer por ambiente (grade fixa)                      │
                    │   └─▶ runCycle(env, trigger)                         │
 POST /:env/sync ──▶│         ├─ listApps(env)       (Redis apps:<env> / Mongo)
                    │         ├─ getStatuses(env)    (Redis status:<env>)  │
                    │         ├─ mapLimit(checkHealth) ─ a cada resultado: │
                    │         │     setStatus → events.publish('status')   │
                    │         └─ fim: setCycle → events.publish('cycle')   │
                    │                                                      │
 GET /events ──────▶│ events: assinantes SSE em memória                    │
                    └──────────────────────────────────────────────────────┘
```

Módulos (todos em `api/src/`):

| Arquivo | Responsabilidade | Depende de |
|---|---|---|
| `apps.js` (novo) | `ENVIRONMENTS`, `toCollection()`, `serialize()`, `listApps(env)`, `invalidateApps(env)` — saem de `routes/applications.js` para o agendador poder usar. | `db`, `cache`, `config` |
| `status-store.js` (novo) | Último status por app e metadados do último ciclo, no Redis. Nunca rejeita. | `cache` |
| `events.js` (novo) | Barramento em memória de assinantes SSE + formatação de mensagens SSE. Sem I/O além de `res.write`. | — |
| `scheduler.js` (novo) | Grade de horários por ambiente, execução do ciclo, sync forçado, `forget()` (app removida durante o ciclo), `start()`/`stop()`. | `apps`, `status-store`, `events`, `health`, `config`, `logger` |
| `health.js` | Inalterado (`checkHealth`, `mapLimit`). | `config` |
| `cache.js` | Ganha `withRedis()` (ver 4.3). `withCache`/`invalidate` continuam (usados por `apps:<env>`). | `config`, `logger` |
| `routes/applications.js` | Rotas; `/sync` delega ao agendador; nova rota `GET /events`. | `apps`, `scheduler`, `events`, `status-store`, `validation` |
| `index.js` | Também chama `scheduler.start()` e cuida do desligamento. | — |

`app.js` **não** inicia o agendador: os testes de rota carregam `app.js` sem criar timers.

## 4. API

### 4.1 Configuração (`api/src/config.js`)

- **Remover** `syncCacheTtl` (`SYNC_CACHE_TTL`).
- **Adicionar** `healthCheckIntervalS: int("HEALTH_CHECK_INTERVAL_S", 30, 5)`.
- No `index.js`, o log `api started` troca `syncCacheTtl` por `healthCheckIntervalS`.

Se um ciclo levar mais que o intervalo (muitas apps × `HEALTH_CHECK_TIMEOUT_MS` / `HEALTH_CHECK_CONCURRENCY`), os horários que caírem durante ele são pulados com warn (ver 4.5). Não há validação cruzada entre as variáveis.

### 4.2 `apps.js`

Mover de `routes/applications.js`, sem mudar comportamento:

```js
const ENVIRONMENTS = ["development", "staging", "production"];
function toCollection(env) { … }
function serialize(doc) { … }
function listApps(env) { … }          // withCache(`apps:${env}`, APPS_TTL, …)
function invalidateApps(env) { … }    // invalidate(`apps:${env}`)
module.exports = { ENVIRONMENTS, toCollection, serialize, listApps, invalidateApps };
```

`invalidateEnv()` da rota passa a ser `scheduler.forget(env, id)` seguido de `Promise.all([invalidateApps(env), removeStatuses(env, [id])])` no delete e só `invalidateApps(env)` no create (não existe mais `sync:<env>`).

### 4.3 `cache.js` — acesso genérico ao Redis

O `status-store` precisa de comandos de hash, que `withCache` não cobre. Adicionar e exportar:

```js
// Runs fn(redis) and returns its result; on any Redis error logs like the
// other cache operations (only while Redis is believed up) and returns fallback.
async function withRedis(op, key, fn, fallback) {
  try {
    return await fn(await ready());
  } catch (err) {
    cacheFailed(op, key, err);
    return fallback;
  }
}
module.exports = { withCache, invalidate, withRedis };
```

As chaves continuam recebendo o prefixo `orbital:` do cliente.

### 4.4 `status-store.js`

Duas chaves por ambiente, **sem TTL** (são estado, não cache):

| Chave (com prefixo) | Tipo | Conteúdo |
|---|---|---|
| `orbital:status:<env>` | hash | `id → JSON { status, latencyMs, limitMs?, checkedAt }` |
| `orbital:cycle:<env>` | string | JSON do último evento `cycle` daquele ambiente (formato em 4.7) |

```js
getStatuses(env)            // → { [id]: entry }   ({} se Redis falhar)
setStatus(env, id, entry)   // HSET               (ignora falha)
removeStatuses(env, ids)    // HDEL (no-op com lista vazia)
getCycle(env)               // → objeto | null     (null se Redis falhar)
setCycle(env, cycle)        // SET                 (ignora falha)
```

Tudo via `withRedis()`; nenhuma função rejeita. JSON inválido numa entrada é descartado (como ausente).

### 4.5 `scheduler.js`

Estado em memória, por ambiente:

```js
{
  offsetMs,        // 0 / 10000 / 20000
  nextAt,          // epoch ms do próximo horário agendado
  timer,           // setTimeout pendente
  running,         // Promise do ciclo em andamento ou null
  runningInfo,     // { trigger, startedAt } do ciclo em andamento
  removed,         // Set de IDs removidos (DELETE) durante o ciclo em andamento
}
```

Constantes: `STAGGER_MS = 10000` e a ordem `["production", "staging", "development"]` (offset = índice × `STAGGER_MS`). `intervalMs = config.healthCheckIntervalS * 1000`. `bootAt = Date.now()` em `start()`.

**Grade.** O k-ésimo horário de um ambiente é `bootAt + offsetMs + k · intervalMs`. Função auxiliar:

```js
// First grid slot strictly after `t`.
function slotAfter(s, t) {
  const base = bootAt + s.offsetMs;
  if (t < base) return base;
  return base + (Math.floor((t - base) / intervalMs) + 1) * intervalMs;
}
```

O timer é sempre armado por `setTimeout(fire, nextAt - Date.now())` — calculado a partir da grade, nunca acumulando atrasos. Exemplo com intervalo 30 s (tempo desde o boot): produção 0, 30, 60…; homologação 10, 40, 70…; desenvolvimento 20, 50, 80….

**Disparo agendado (`fire(env)`):**

1. `nextAt = slotAfter(s, Math.max(Date.now(), s.nextAt))`; rearma o timer. O `Math.max` cobre o timer que dispara alguns milissegundos antes do horário: sem ele `slotAfter` devolveria o próprio horário que está disparando, que seria rearmado e rodaria o ciclo de novo.
2. Se `running` → log `warn("scheduled sync skipped: previous cycle still running", { env })` e sai.
3. Senão → `runCycle(env, "scheduled")` (sem `await` bloqueando o timer).

**Sync forçado (`force(env)`)** — chamado pela rota `POST /:env/sync`:

1. Se `running` → devolve `{ env, trigger: runningInfo.trigger, startedAt: runningInfo.startedAt, nextCheckAt: iso(nextAt), joined: true }`. A grade **não** muda.
2. Senão → cancela o próximo horário: `nextAt = slotAfter(s, Date.now()) + intervalMs`, rearma o timer, inicia `runCycle(env, "manual")` e devolve `{ env, trigger: "manual", startedAt, nextCheckAt: iso(nextAt), joined: false }`.

Exemplo (intervalo 30 s): forçar produção em t=37 roda em 37, cancela o de 60, o próximo é 90. Forçar em t=30,5 com o ciclo de 30 ainda rodando junta-se a ele e o próximo segue 60.

**Ciclo (`runCycle(env, trigger)`):**

```js
async function runCycle(env, trigger) {
  const startedAt = new Date();
  s.runningInfo = { trigger, startedAt: startedAt.toISOString() };
  s.removed = new Set();
  s.running = (async () => {
    const log = baseLog.child({ env });
    const started = performance.now();
    const [apps, previous] = await Promise.all([listApps(env), getStatuses(env)]);
    if (apps.length === 0) log.warn("no applications to check", { env });
    let changed = 0;
    const writes = [];
    const results = await mapLimit(apps, CHECK_CONCURRENCY, async app => {
      const r = await checkHealth(app, log);
      if (s.removed.has(r.id)) return null;                    // removida durante o ciclo
      const entry = { status: r.status, latencyMs: r.latencyMs, checkedAt: new Date().toISOString() };
      if (r.limitMs !== undefined) entry.limitMs = r.limitMs;
      const isChange = previous[r.id]?.status !== r.status;   // sem anterior conta como mudança
      if (isChange) changed++;
      events.publish({ type: "status", changed: isChange, data: { id: r.id, name: r.name, env, ...entry } });
      writes.push(setStatus(env, r.id, entry));               // não segura o evento nem o worker
      return r;
    });
    const checked = results.filter(Boolean);
    // Apps que saíram da lista (removidas, ou editadas direto no Mongo) não ficam no hash.
    const listed = new Set(apps.map(a => a.id));
    writes.push(removeStatuses(env, Object.keys(previous).filter(id => !listed.has(id))));
    const count = st => checked.filter(r => r.status === st).length;
    const cycle = {
      env, trigger,
      checked: checked.length, changed,
      healthy: count("healthy"), degraded: count("degraded"), unhealthy: count("unhealthy"),
      startedAt: startedAt.toISOString(),
      checkedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
      nextCheckAt: new Date(s.nextAt).toISOString(),
    };
    writes.push(setCycle(env, cycle));
    await Promise.all(writes);                                 // nenhuma rejeita (status-store)
    events.publish({ type: "cycle", data: cycle });
    log.info("sync completed", { ...cycle });
  })()
    .catch(err => baseLog.error("sync failed", { env, trigger, err }))
    .finally(() => { s.running = null; s.runningInfo = null; });
  return s.running;
}
```

Observações:

- O evento `status` de cada app sai **dentro** do callback do `mapLimit`, isto é, assim que aquele check termina — sem esperar o ambiente inteiro **nem a gravação no Redis**: o `setStatus` é disparado depois do `publish` e só é aguardado no fim do ciclo (junto com `removeStatuses` e `setCycle`, em paralelo). Com o Redis reconectando, cada chamada pode esperar até 1 s (`READY_TIMEOUT_MS`); gravar antes de publicar atrasaria todo evento e ocuparia os workers.
- **App removida durante o ciclo.** `DELETE /applications/:env/:id` chama `scheduler.forget(env, id)`; se há ciclo rodando no ambiente, o ID entra em `removed` e o resultado dessa app é descartado (não grava no hash, não publica, não entra nas contagens). Sem isso o check em voo traria o status de volta ao Redis e mandaria um `status` de uma app que não existe mais. `removed` é recriado a cada ciclo.
- `nextCheckAt` é lido no **fim** do ciclo: se um sync forçado chegou durante ele (juntou-se), a grade não mudou; se o ciclo é manual, `nextAt` já reflete o horário cancelado.
- Se `listApps` falhar (Mongo fora e `apps:<env>` expirado), o ciclo loga `error("sync failed")`, **não** publica `cycle` nem altera `cycle:<env>`, e o próximo horário segue normal.
- Comparação de mudança é só por `status` (latência diferente não é mudança).
- Redis fora: `getStatuses` devolve `{}` → todo resultado é mudança; `setStatus`/`setCycle` são ignorados. Os eventos continuam saindo normalmente.

**Interface exportada:**

```js
start()          // bootAt = agora; arma o timer dos três ambientes (produção dispara em 0 ms)
stop()           // limpa todos os timers; ciclos em andamento terminam sozinhos
force(env)       // ver acima
forget(env, id)  // app removida: descarta o resultado dela no ciclo em andamento
nextCheckAt(env) // ISO de nextAt (usado no snapshot quando ainda não há ciclo gravado)
```

Para testes, exportar também uma fábrica `createScheduler({ now, setTimer, clearTimer })` ou usar `jest.useFakeTimers()` com `Date` falso (preferido: fake timers modernos do Jest controlam `Date.now()` e `setTimeout` juntos).

### 4.6 `events.js`

```js
const clients = new Set();   // { res, changesOnly, queue }

function subscribe(res, { changesOnly, hold }) { … return unsubscribe; }  // hold: enfileira até release(res)
function release(res) { … }   // escreve a fila do cliente, em ordem, e passa a entregar ao vivo
function publish({ type, data, changed }) {
  // status: entregue a todos, exceto changesOnly com changed === false
  // cycle:  entregue a todos
}
function send(res, type, data) { res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); }
function closeAll() { for (const c of clients) c.res.end(); clients.clear(); }
function clientCount() { return clients.size; }
```

- `hold`/`release` existem para a rota assinar **antes** de montar os snapshots sem perder o que for publicado nesse intervalo (ver 4.7). O filtro `changesOnly` vale também para o que entra na fila; `unsubscribe` descarta a fila.
- `data` é sempre uma linha só (`JSON.stringify` não gera quebras), então um campo `data:` basta.
- Sem `id:` nos eventos e sem replay via `Last-Event-ID`: a reconexão recebe um `snapshot`, que já é o estado atual.
- Sem controle de backpressure (volume é baixo: dezenas de eventos por ciclo).

### 4.7 Contrato HTTP

#### `POST /applications/:env/sync`

- `:env` validado pelo `router.param("env")` existente (404 para desconhecido).
- Sem query string (`?fresh` deixa de existir; se vier, é ignorado).
- Resposta **202**:

```json
{ "env": "production", "trigger": "manual", "startedAt": "2026-10-05T14:32:07.120Z", "nextCheckAt": "2026-10-05T14:33:00.000Z", "joined": false }
```

- Log do request continua sendo o `request completed` genérico; o `sync completed` sai do agendador ao fim do ciclo.

#### `GET /applications/events`

Query:

| Parâmetro | Valores | Efeito |
|---|---|---|
| `changes` | `true` \| `false` \| ausente | `true`: eventos `status` só de apps cujo status mudou. `false`/ausente: um `status` por app checada. Qualquer outro valor → **400** `{ "error": "Invalid changes parameter. Valid values: true, false" }` (antes de abrir o stream). |

Cabeçalhos de resposta (além dos de CORS já aplicados em `app.js`):

```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

Sequência ao conectar:

1. `res.flushHeaders()`
2. `retry: 3000\n\n`
3. `subscribe(res, { changesOnly, hold: true })` — **antes** dos snapshots, com a entrega retida: o que for publicado enquanto eles são montados fica numa fila.
4. Os três snapshots são montados **em paralelo** e escritos na ordem de `ENVIRONMENTS`, sempre — o filtro `changes` não se aplica a eles.
5. `events.release(res)`: a fila sai logo depois dos snapshots, em ordem, e daí em diante `status` e `cycle` saem conforme publicados. Um evento já refletido no snapshot pode chegar de novo; o cliente trata isso sem efeito (idempotente).
6. Heartbeat: comentário `: ping\n\n` a cada **15 s** (`SSE_HEARTBEAT_MS`), para proxies não derrubarem a conexão ociosa.
7. Em `req.on("close")`: `clearInterval`, `unsubscribe()`.

Se montar o snapshot de um ambiente falhar (Mongo fora sem `apps:<env>` em cache), loga `error("events snapshot failed", { env, err })` e envia o snapshot daquele ambiente com `apps: []` e `cycle: null` — o stream continua aberto.

**Evento `snapshot`:**

```
event: snapshot
data: {"env":"production","apps":[{"id":"64b…01","name":"billing-api","env":"production","status":"healthy","latencyMs":120,"checkedAt":"2026-10-05T14:32:00.412Z"},{"id":"64b…02","name":"auth-api","env":"production","status":null,"latencyMs":null,"checkedAt":null}],"cycle":{…último cycle…},"nextCheckAt":"2026-10-05T14:32:30.000Z"}
```

- `apps` vem de `listApps(env)` (fonte da verdade da lista), cruzado com `getStatuses(env)`; app sem status gravado vai com `status: null`, `latencyMs: null`, `checkedAt: null`.
- `cycle` é `getCycle(env)` ou `null`.
- `nextCheckAt` é `scheduler.nextCheckAt(env)` (sempre presente, mesmo antes do primeiro ciclo).

**Evento `status`:**

```
event: status
data: {"id":"64b…01","name":"billing-api","env":"production","status":"degraded","latencyMs":3412,"limitMs":3000,"checkedAt":"2026-10-05T14:32:30.913Z"}
```

`limitMs` só aparece quando `status` é `degraded`. `latencyMs` é `null` em erro de rede/timeout.

**Evento `cycle`** (fim de cada ciclo, sempre entregue):

```
event: cycle
data: {"env":"production","trigger":"scheduled","checked":4,"changed":1,"healthy":3,"degraded":1,"unhealthy":0,"startedAt":"2026-10-05T14:32:30.002Z","checkedAt":"2026-10-05T14:32:33.415Z","durationMs":3413,"nextCheckAt":"2026-10-05T14:33:00.000Z"}
```

| Campo | Significado |
|---|---|
| `checked` | total de aplicações verificadas |
| `changed` | total com status diferente do anterior (sem anterior conta) |
| `healthy` / `degraded` / `unhealthy` | contagem por status |
| `startedAt` / `checkedAt` | início e fim do ciclo (ISO) — `checkedAt` é a "data da verificação" |
| `durationMs` | duração do ciclo |
| `nextCheckAt` | próximo horário agendado do ambiente |
| `trigger` | `scheduled` ou `manual` |

#### Ordem das rotas

`GET /events` vai no mesmo `router` de `routes/applications.js`. Não conflita com nada: não existe `GET /:env`, e `router.param("env")` só roda em rotas com `:env`.

### 4.8 Logging

- O middleware de log em `app.js` passa a escutar `res.on("close")` em vez de `"finish"`: numa conexão SSE encerrada pelo cliente, `finish` não dispara. `close` dispara uma vez em todas as respostas, então continua sendo **uma linha por request**. Para o SSE, `durationMs` passa a ser o tempo de conexão.
- `sync completed` (info) agora sai a cada ciclo de cada ambiente, com `trigger`. A regra do CLAUDE.md "o sync summary só quando os checks rodam" deixa de se aplicar — eles sempre rodam.
- Novo `warn`: `scheduled sync skipped: previous cycle still running`.
- Novo `error`: `sync failed` (do agendador) e `events snapshot failed`.
- Opcional: `info("events client connected"/"disconnected", { clients })` — **não** implementar; o `request completed` já registra cada conexão.

### 4.9 `index.js` — boot e desligamento

```js
const server = app.listen(PORT, () => { log.info("api started", { … }); scheduler.start(); });

function shutdown(signal) {
  log.info("api stopping", { signal });
  scheduler.stop();
  events.closeAll();          // sem isso server.close() esperaria os streams SSE para sempre
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

## 5. Infraestrutura

### 5.1 nginx (`frontend/nginx.conf`)

Adicionar, **antes** do `location /api/`, um bloco exato para o stream (mesmo resolver e upstream):

```nginx
# SSE: sem buffer (cada evento sai na hora) e sem timeout curto de leitura.
location = /api/applications/events {
    resolver 127.0.0.11 valid=10s ipv6=off;
    set $api_upstream http://api:3001;
    rewrite ^/api/(.*)$ /$1 break;
    proxy_pass $api_upstream;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```

O `location =` compara só o caminho, então `?changes=true` também cai aqui, e o `rewrite … break` mantém a query string porque a substituição não contém `?`. Conferir na validação manual (seção 9, passo 2).

Não incluir `text/event-stream` em `gzip_types`.

### 5.2 Compose e exemplos de env

- `docker-compose.local.yml`: remover `SYNC_CACHE_TTL: "13"`; adicionar `HEALTH_CHECK_INTERVAL_S: "30"`.
- `api/.env.prod.example`: remover `SYNC_CACHE_TTL=13`; adicionar `HEALTH_CHECK_INTERVAL_S=30`.
- `docker-compose.yml` e `docker-compose.prod.yml`: nada (não têm o bloco de environment da API).

## 6. Frontend (`frontend/index.html`)

### 6.1 Remover

- Constantes: `CKEY`, `RKEY`, `RATE_OPTIONS`, `DEFAULT_RATE`, `SYNC_GAP_S`, `ENV_START_DELAY` e o campo `startDelay` de `ENVS` (e o comentário sobre ele).
- Funções de módulo: `rateOpt()`, `parseRates()`.
- Estado: `rates`, `rateOpen`.
- Métodos: `saveCounters`, `rateOf`, `restartCycle`, `startAuto`, `paintCountdown`, `setRate`, `syncEnv` (substituído, ver 6.3), e `this.counters`, `this.autoId`, `this.lastTick`, `this.countdownEl`.
- Template: o `<div style="position:relative">` do seletor de periodicidade (botão `toggleRate`, `countdownRef`, `sc-for rateOptions`) — substituído pelo rótulo de 6.4.
- Em `toolbarVals()`: `rate`, `rateOpen`, `toggleRate`, `rateOptions`; e `rateOpen: false` em `toggleNotifyMenu`.
- `componentDidMount`: a leitura de `RKEY`. No lugar, uma limpeza única: `try { localStorage.removeItem('orbital-counters-v1'); localStorage.removeItem('orbital-rate-v1'); } catch (e) {}`.

### 6.2 Novas constantes e estado

```js
// O EventSource reconecta sozinho; só depois deste prazo sem conexão vira tempestade.
const SSE_DOWN_GRACE_MS = 5000;
// Reabertura manual quando o EventSource desiste (resposta que não é event-stream, ex.: 502 do nginx).
const SSE_RETRY_MS = 3000;
// "Sincronizar" volta ao normal sozinho se o cycle do ambiente não chegar neste prazo.
const SCAN_MAX_MS = 30000;
```

Estado novo: `cycles: {}` — `{ [envCode]: checkedAt }` (ms do `checkedAt` do último ciclo, ou `null`). Não vai para o localStorage.

### 6.3 Conexão SSE

`componentDidMount` troca `this.startAuto()` por `this.connectEvents()`; `componentWillUnmount` fecha `this.es` e limpa `this.esDownTid`, `this.esRetryTid`, `this.scanTid`.

```js
connectEvents() {
  if (this.es) this.es.close();
  const es = this.es = new EventSource(`${API_BASE}/applications/events?changes=true`);
  es.onopen = () => { clearTimeout(this.esDownTid); this.esDownTid = null; };
  es.onerror = () => {
    // Dentro do prazo de graça, quedas curtas (deploy, reinício) não acendem a tempestade.
    if (!this.esDownTid) this.esDownTid = setTimeout(() => { this.esDownTid = null; if (this.es?.readyState !== EventSource.OPEN) this.markApiDown(); }, SSE_DOWN_GRACE_MS);
    // CLOSED: o navegador desistiu (ex.: 502 do nginx sem a API); ele não reconecta sozinho.
    if (es.readyState === EventSource.CLOSED) { clearTimeout(this.esRetryTid); this.esRetryTid = setTimeout(() => this.connectEvents(), SSE_RETRY_MS); }
  };
  es.addEventListener('snapshot', e => this.onSnapshot(parseEvent(e)));
  es.addEventListener('status', e => this.onStatus(parseEvent(e)));
  es.addEventListener('cycle', e => this.onCycle(parseEvent(e)));
}
```

`parseEvent(e)` (módulo): `try { return JSON.parse(e.data); } catch (err) { return null; }`; os handlers ignoram `null`.

O frontend conecta **com** `?changes=true`: depois do snapshot só recebe os status que mudaram (o `cycle` vem sempre). O painel usa só o campo `status`; o tooltip do badge DEGRADADO é o texto fixo "Tempo de resposta acima do limite", sem latência, e o mapa `this.latency` não existe.

O antigo corpo de `syncEnv` se divide assim:

- **`applyStatuses(env, results)`** — o miolo comum: para cada `{ id, name, status, latencyMs, limitMs }`, normaliza `status` (`STATUSES.includes(s) ? s : 'unhealthy'`), faz a lógica de `downSeen`/`fell` e chama `queueAlert(fell)`; grava `status` no estado e via `saveStatus()`; se `apiDown` estava ligado, limpa (`apiDown: false`, `applySky()`, `redraw()`, `loadApps()`); senão, `updatePlanets()` se `env === this.state.env`; sempre `updateTitle()`. Um `id` que não está em `this.state.apps` dispara `loadApps()` (que já é deduplicado por `this.appsReq`).
- **`onStatus(data)`** — `applyStatuses(API_TO_ENV[data.env], [data])`.
- **`onSnapshot(data)`** — env = `API_TO_ENV[data.env]`:
  - apps com `status !== null` vão para `applyStatuses`; as com `null` mantêm o status local (cache do localStorage).
  - Se o conjunto de IDs do snapshot difere do de `envApps` daquele ambiente → `loadApps()`.
  - `cycles[env] = data.cycle ? Date.parse(data.cycle.checkedAt) : null`.
  - Se `data.cycle` existe: sai de `staleEnvs`, atualiza `lastOk` (o maior entre o atual e `checkedAt`) e `LKEY`, e `statusTs` segue a regra atual (só avança quando `staleEnvs` esvazia).
  - Snapshot também limpa `apiDown` (a conexão voltou).
- **`onCycle(data)`** — env = `API_TO_ENV[data.env]`: atualiza `cycles[env]`, remove de `staleEnvs`, `lastOk = Date.parse(data.checkedAt)` (+ `LKEY`), regra do `statusTs`; se `data.checked` difere do número de apps do ambiente → `loadApps()`; se `this.state.scanning && env === this.scanEnv` (o ambiente em que se clicou "Sincronizar", **não** o da aba atual) → encerra o "Sincronizando…" (`endScan()`, `scanning: false`).

Alertas, `downSeen`, `ALERT_BATCH_MS`, contador no título, `degraded` sem alerta — **sem mudança de regra**: só a origem dos resultados mudou. Falhas que aconteceram com o SSE fora chegam no snapshot da reconexão e alertam pela mesma lógica.

### 6.4 "Sincronizar" e o rótulo de verificação

```js
checkAll = async () => {
  if (this.state.scanning) return;
  const env = this.state.env;
  this.scanEnv = env;                      // o cycle que encerra é o deste ambiente, mesmo que a aba mude
  this.setState({ scanning: true });
  // Só reabre o stream se o navegador desistiu (CLOSED); em CONNECTING ele já está tentando.
  if (!this.es || this.es.readyState === EventSource.CLOSED) this.connectEvents();
  try { await apiFetch(`/applications/${ENV_TO_API[env]}/sync`, { method: 'POST' }); }
  catch (e) { this.endScan(); this.setState({ scanning: false }); this.markApiDown(); return; }
  // O fim chega pelo evento cycle (onCycle); isto só evita ficar preso. Se o cycle chegou
  // antes da resposta do POST, endScan() já rodou (scanEnv nulo) e não há timer a armar.
  if (this.scanEnv !== env) return;
  clearTimeout(this.scanTid);
  this.scanTid = setTimeout(() => { this.scanEnv = null; this.setState({ scanning: false }); }, SCAN_MAX_MS);
};
```

`endScan()` faz `clearTimeout(this.scanTid); this.scanEnv = null;`.

No lugar do seletor de periodicidade, um rótulo (sem botão), mantendo o ícone de relógio Phosphor que já está no template:

```html
<span title="Health check feito pelo servidor" style="display:flex; align-items:center; gap:7px; padding:4px 6px; color:var(--muted)">
  <svg …mesmo path do relógio atual…></svg>
  <span style="{{ monoControl }}">{{ cycleLabel }}</span>
</span>
```

Em `toolbarVals()`:

```js
cycleLabel: cycleLabel(this.state.cycles[this.state.env])
```

Função de módulo:

```js
// "Última verificação 14:32:05"; antes do primeiro ciclo do ambiente, aguardando.
function cycleLabel(checkedAt) {
  return checkedAt ? `Última verificação ${new Date(checkedAt).toLocaleTimeString('pt-BR')}` : 'AGUARDANDO SERVIDOR';
}
```

O rótulo só muda com `setState` dos eventos — não há mais nada atualizando por segundo. Trocar de aba de ambiente re-renderiza com o `cycles` do ambiente novo.

### 6.5 Textos que citam o ciclo do navegador

- `stormMsg`: "Tentando reconectar a cada ciclo." → "Tentando reconectar…".
- O resto dos textos ("último conhecido", banner, `ÚLTIMO: …`) continua igual.

## 7. Testes (Jest, `api/test/`)

Seguir as convenções do CLAUDE.md: descrições em pt-BR, `loadFresh()` para módulos com estado, `dotenv` mockado onde `config` é carregado.

| Arquivo | Casos |
|---|---|
| `config.test.js` | `HEALTH_CHECK_INTERVAL_S` padrão 30; aceita 5; rejeita 4, `abc`, negativo. `SYNC_CACHE_TTL` não é mais lido. |
| `cache.test.js` | `withRedis`: devolve o resultado; com erro devolve `fallback` e loga warn uma vez (não loga com Redis já marcado indisponível). |
| `status-store.test.js` (novo) | `getStatuses` faz parse do hash e descarta JSON inválido; `setStatus`/`removeStatuses`/`getCycle`/`setCycle` usam as chaves certas; com Redis falhando, nada rejeita e os reads devolvem `{}`/`null`; `removeStatuses([])` não chama o Redis. |
| `events.test.js` (novo) | `hold`/`release`: fila entregue em ordem, filtro `changesOnly` na fila, `release` só da conexão indicada, `unsubscribe` descarta a fila. `publish('status')` com `changed: false` não chega a `changesOnly`; chega aos demais; `cycle` chega a todos; `unsubscribe` para a entrega; formato `event:/data:` exato; `closeAll` encerra as respostas. |
| `scheduler.test.js` (novo, fake timers) | Offsets: produção roda em 0 ms, homologação em 10 s, desenvolvimento em 20 s; repete a cada intervalo. Evento `status` sai por app **antes** de o ciclo terminar (check lento numa app não atrasa o evento da outra). O `status` sai sem esperar o `setStatus` (Redis lento não atrasa evento nem workers) e o `cycle` só depois das gravações. `forget()` durante o ciclo: a app removida não é gravada, publicada nem contada; sem ciclo em andamento não tem efeito, e não vale para o ciclo seguinte. Timer que dispara antes do horário (relógio adiantado em relação ao timer) não repete o horário. `changed` conta só mudança de status e trata ausência como mudança. `cycle` traz contagens, `durationMs` e `nextCheckAt`. `force()` sem ciclo: roda na hora, `joined: false`, pula só o próximo horário (forçar em 37 s → próximo 90 s com intervalo 30). `force()` com ciclo rodando: `joined: true`, grade intacta. Horário que chega com ciclo rodando é pulado com warn. Apps que saíram da lista são removidas do store. Falha no `listApps` loga error e não publica `cycle`. `stop()` impede novos disparos. |
| `applications.test.js` | `POST /:env/sync` → 202 com o corpo de `force()` (agendador mockado); env inválido → 404. Remover os testes de `withCache` do sync e de `?fresh`. Delete chama `scheduler.forget(env, id)` e `removeStatuses(env, [id])`; create não invalida `sync:`. |
| `events-route.test.js` (novo) | `GET /applications/events`: cabeçalhos SSE; `retry: 3000`; três `snapshot` na ordem de `ENVIRONMENTS`, com `status: null` para app sem status; `?changes=true` filtra `status` sem mudança e mantém `cycle`; `?changes=x` → 400 JSON; fechar a conexão chama `unsubscribe`; falha no `listApps` de um ambiente gera snapshot vazio e loga error; o que é publicado enquanto os snapshots são montados sai logo depois deles; os três snapshots são montados em paralelo. Para ler o stream com Supertest: `.buffer(false)` + `.parse()` customizado que acumula chunks e aborta após N eventos (ou servidor `http` real com `app.listen(0)` e `fetch`). |
| `applications.test.js` (bloco do middleware de log) | Uma linha `request completed` por request também quando o cliente aborta (evento `close`). |

Frontend não tem testes automatizados: validar manualmente (seção 9).

## 8. Documentação a atualizar

- **CLAUDE.md**
  - Parágrafo do `/sync` em "Architecture": agendamento no servidor, grade com offsets 0/10/20 s, `HEALTH_CHECK_INTERVAL_S`, 202, SSE.
  - Tabela de rotas: `POST /applications/:env/sync` → "força um ciclo (202); resultados pelo SSE"; nova linha `GET /applications/events`.
  - Seção de cache Redis: remover `SYNC_CACHE_TTL`/`sync:<env>`; documentar `status:<env>` e `cycle:<env>`.
  - Seção de logging: `close` em vez de `finish`; `sync completed` em todo ciclo.
  - Seção "Environments": remover ticker, `startDelay`, `SYNC_GAP_S`, `restartCycle()`, `orbital-counters-v1`; tabela `ENVS` sem `startDelay`.
  - "Data persistence": remover `orbital-counters-v1` e `orbital-rate-v1` (mencionar a limpeza no load); `orbital-status-v1` vira cache até o snapshot; `orbital-lastok-v1` passa a ser o `checkedAt` do último `cycle`.
  - "Down alerts": a frase sobre `SYNC_GAP_S` vira "os ciclos dos ambientes ficam 10 s defasados no servidor".
  - "Tempestade": origem passa a ser a perda do SSE por mais de `SSE_DOWN_GRACE_MS` (ou falha no `GET /applications`/POST sync).
  - Diagrama: `frontend ──HTTP + SSE──▶ api`; Redis "cache de apps e estado dos checks".
  - Limitação: uma única instância da API.
- **Lista local de sugestões** (`sugestoes-de-melhorias.md`, ignorada pelo git): marcar o item 32 como ✅ resolvido, com resumo de uma linha. É só nota local; não faz parte do repositório.
- **README.md**: se citar `SYNC_CACHE_TTL` ou o intervalo do navegador, atualizar.

## 9. Validação manual

Subir com `docker compose -f docker-compose.local.yml up -d --build` e abrir `http://localhost` (Cmd+Shift+R após rebuild).

1. `curl -N http://localhost/api/applications/events` → três `snapshot`, depois `status`/`cycle` de produção ~0 s, homologação ~10 s, desenvolvimento ~20 s após o boot da API, repetindo a cada 30 s; `: ping` a cada 15 s.
2. `curl -N 'http://localhost/api/applications/events?changes=true'` → só `cycle` enquanto nada muda; derrubar uma app monitorada → aparece um `status` dela.
3. `curl -X POST http://localhost/api/applications/production/sync` → 202 na hora; o stream mostra o ciclo `manual`; o `nextCheckAt` pulou um horário.
4. Painel: sem contagem regressiva; rótulo "Última verificação …" (sem a próxima) troca ao mudar de aba de ambiente; "Sincronizar" fica "Sincronizando…" até o `cycle` chegar.
5. `docker compose -f docker-compose.local.yml stop api` → tempestade em ~5 s; `start api` → o snapshot limpa a tempestade sem recarregar a página.
6. `docker compose -f docker-compose.local.yml stop redis` → checks e eventos continuam; todo `status` conta como mudança; `start redis` → volta a filtrar.
7. Aba em segundo plano + derrubar uma app → notificação e bipe uma única vez.
8. Recarregar a página → nenhum `/sync` é disparado pelo navegador (aba Network).

## 10. Ordem sugerida de implementação

1. `config.js` + testes.
2. `cache.withRedis` + `status-store.js` + testes.
3. `apps.js` (extração sem mudança de comportamento; rodar os testes existentes).
4. `events.js` + testes.
5. `scheduler.js` + testes.
6. Rotas (`POST /:env/sync`, `GET /events`), middleware de log em `close`, `index.js` (start/shutdown) + testes.
7. nginx, compose, `.env.prod.example`.
8. Frontend (remoções, SSE, rótulo, "Sincronizar").
9. Validação manual (seção 9) e documentação (seção 8).

## 11. Fora de escopo

- Várias instâncias da API (lock no Redis / Pub/Sub).
- Histórico e uptime (item 33), código HTTP e motivo da falha nos eventos (item 34), alertas pelo servidor (item 36), N falhas seguidas (item 37).
- Check imediato de app recém-criada.
- Filtro de ambiente no SSE e replay por `Last-Event-ID`.
