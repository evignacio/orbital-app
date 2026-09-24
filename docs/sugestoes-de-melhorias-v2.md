# Sugestões de melhorias — Orbital (v2)

Análise feita em 23/09/2026 sobre o commit `c0f8399`, cobrindo API, frontend, infraestrutura, CI e documentação. Parte da [v1](sugestoes-de-melhorias.md) (22/09/2026, commit `955b58b`): os itens que a v1 viu resolvidos saíram daqui, os que continuam abertos foram reconferidos no código atual e renumerados, e os novos estão marcados com 🆕.

Quando um item diz **verificado**, ele foi reproduzido na stack local (`docker-compose.local.yml`) com `curl` ou no navegador. Os demais vêm da leitura do código.

**Prioridade:** 🔴 alta · 🟠 média · 🟢 baixa
**Origem:** 🆕 novo na v2 · (v1 #N) já estava na v1

---

## Resumo

| Seção | Itens | 🆕 | 🔴 | 🟠 | 🟢 |
|---|---|---|---|---|---|
| 1. Bugs e correção | 1–11 | 6 | 2 | 5 | 4 |
| 2. Segurança | 12–22 | 5 | 3 | 5 | 3 |
| 3. Arquitetura | 23–27 | 3 | 1 | 2 | 2 |
| 4. Performance | 28–33 | 6 | — | 1 | 5 |
| 5. Legibilidade e qualidade de código | 34–43 | 5 | — | 4 | 6 |
| 6. Acessibilidade | 44–47 | 3 | — | 2 | 2 |
| 7. Testes, CI e operação | 48–52 | 3 | — | 2 | 3 |
| 8. Documentação | 53 | — | — | — | 1 |
| 9. Funcionalidades | 54–80 | 10 | 3 | 10 | 14 |

### O que a v1 já resolveu

Dos 50 itens da v1, 11 foram resolvidos: frontend acessível de qualquer host (#1), "tempestade" quando a API cai (#2), invalidação do cache no cadastro e na remoção (#3), toda a seção de performance (#25–31) e o estado degradado por latência (#35). Os 39 restantes continuam valendo e aparecem abaixo com a referência (v1 #N). Dois deles avançaram em parte: o SRI do d3 (#14) e a latência por check (#34).

---

## 1. Bugs e problemas de correção

1. ✅ 🔴 🆕 **A lista de aplicações nunca é recarregada depois que a página abre.** O `GET /applications` roda só no `componentDidMount` ([index.html:446](../frontend/index.html#L446)), e o `/sync` atualiza status, nunca a lista. Isso tem dois efeitos:
   - se a página abre com a API fora, a tempestade passa ([index.html:552](../frontend/index.html#L552)), mas a lista continua sendo a do cache, ou vazia na primeira visita. Com a lista vazia, a órbita fica vazia e os contadores e o título ficam zerados: uma queda real só aparece como notificação (se a aba estiver fora de foco) até alguém recarregar;
   - aplicações cadastradas ou removidas por outra pessoa, ou em outra aba, não aparecem nem somem. As removidas continuam girando com o último status conhecido.

   Sugestão: recarregar a lista quando a tempestade termina e sempre que os IDs devolvidos pelo `/sync` não baterem com os do ambiente.

   **✅ Resolvido:** o `loadApps()` (GET /applications, com requisição compartilhada entre chamadas simultâneas) roda na carga, quando a tempestade passa e sempre que os IDs devolvidos pelo `/sync` não batem com os do ambiente, e o `applyApps()` troca a lista, regrava o `orbital-apps-v1` e limpa status, latência, `downSeen` e seleção de IDs que sumiram; validado no navegador inserindo e apagando um documento direto no Mongo (a aplicação apareceu em ~4 s e sumiu em ~20 s, sem recarregar) e abrindo a primeira visita com a API parada, que carregou as 10 aplicações assim que a API voltou.
2. ✅ 🔴 (v1 #4) **O `withCache` roda os checks duas vezes se a escrita no Redis falha, e não deduplica requisições simultâneas** ([cache.js:38](../api/src/cache.js#L38)). 🆕 Há um agravante: com `SYNC_CACHE_TTL=0` ou um valor não numérico, o `parseInt` gera `0` ou `NaN`, o `setex` falha sempre e **todo** `/sync` passa a disparar os checks em dobro. Sugestões:
   - separar o `try` do cache do `fn()`;
   - guardar a promise em andamento por chave (single-flight no processo) e usar `SET NX` como trava quando houver mais de uma réplica;
   - validar o TTL na inicialização (item 25).

   **✅ Resolvido:** o `withCache` agora trata leitura e escrita no Redis em `try`s próprios (falha de cache nunca reexecuta o `fn()`), deduplica execuções simultâneas por chave com um `Map` de promises (single-flight no processo; o `SET NX` entre réplicas ficou de fora) e trata TTL `<= 0` como "sem cache" (o TTL é validado no `config.js`); validado com instrumentação temporária mostrando 1 execução para 5 `/sync` simultâneos, e 1 execução por rodada com Redis somente leitura (`READONLY`), com Redis inacessível e com `SYNC_CACHE_TTL=0`.
   **✅ Ajuste pós-revisão:** o `invalidate()` passou a incrementar uma geração por chave e a descartar a execução em andamento, então um check iniciado antes de um cadastro ou remoção não é mais compartilhado nem grava resultado desatualizado no cache; validado com um sync em andamento seguido de POST e novo sync, que já trouxe a aplicação nova.
3. ✅ 🟠 🆕 **O botão "Sincronizar" devolve o cache, não uma checagem nova.** Ele chama o mesmo `/sync`, que responde do Redis por até `SYNC_CACHE_TTL` segundos (13 no compose local). Na prática, é comum ele devolver o resultado que o ciclo automático, desta ou de outra aba, buscou poucos segundos antes, enquanto o README promete "checagem imediata fora do ciclo automático". Duas saídas:
   - um `POST /applications/:env/sync?fresh=1` que pula a leitura do cache, mas continua passando pelo single-flight (item 2) e pelo rate limit (item 17);
   - o "checar agora" por aplicação do painel de detalhes (item 54).

   **✅ Resolvido (API):** `POST /applications/:env/sync?fresh=1` pula a leitura do cache, mas continua passando pelo single-flight e grava o resultado novo no Redis; validado com 4 requisições `?fresh=1` simultâneas logo após um cache hit (2 ms), que dispararam uma única checagem nova (~550 ms).
   **✅ Resolvido (frontend):** o "Sincronizar" (e o "Tentar agora" da tempestade) chama `syncEnv(env, true)`, que manda `POST /sync?fresh=1`, enquanto o ciclo automático continua sem o parâmetro; validado no resource timing do navegador, com os três syncs automáticos sem `?fresh` e o clique gerando `/applications/production/sync?fresh=1`.
4. ✅ 🟠 (v1 #5) **Cadastro e remoção não conferem a resposta da API.** Continua igual:
   - o POST não confere `r.ok`, e um 400 ou 500 põe na lista uma aplicação com `id: undefined` ([index.html:1222](../frontend/index.html#L1222));
   - o DELETE ignora a falha e tira a aplicação da tela, e ela volta no reload ([index.html:1175](../frontend/index.html#L1175)).

   🆕 Também não há estado de envio. Um duplo clique em "Lançar em órbita" cadastra a aplicação duas vezes, e, quando o POST falha, o modal fica parado sem mensagem. Sugestão: usar o `apiFetch` também no POST e no DELETE, desabilitar o botão durante o envio e mostrar o erro dentro do modal.

   **✅ Resolvido:** POST e DELETE passam pelo `apiFetch` (que confere `r.ok`, trata 204 e leva o status e a mensagem `error` da API), o cadastro rejeita resposta sem `id`, fica travado durante o envio ("Lançando…", botão desabilitado e flag contra duplo clique) e mostra o erro dentro do modal, e a remoção só sai da tela se o DELETE der certo (404 conta como já removida), senão mostra o erro no modal com "Tentar de novo"; validado no navegador com a API parada (erro no modal nos dois fluxos, aplicação mantida) e, com a API no ar, três cliques seguidos em "Lançar em órbita" gerando um único POST e um único documento no Mongo, depois removido pela tela.
5. ✅ 🟠 🆕 **As notificações não funcionam sem HTTPS fora de `localhost`, e a mensagem culpa o usuário.** A Notifications API exige contexto seguro. Acessando por `http://<servidor>`, que é o único modo oferecido pelo `docker-compose.prod.yml`, o navegador nega a permissão ou nem expõe a API. O painel então diz "Permissão bloqueada no navegador. Libere nas configurações do site." ([index.html:1003](../frontend/index.html#L1003), [index.html:112](../frontend/index.html#L112)), e liberar nas configurações não resolve. Sugestão: testar `window.isSecureContext` e dizer que os alertas exigem HTTPS; servir o painel com TLS (item 18).
   **✅ Resolvido:** o painel testa `window.isSecureContext` e `'Notification' in window`: sem contexto seguro, o aviso aparece já ao abrir o painel e diz que os alertas exigem HTTPS (sem o navegador nem pedir permissão), sem a API diz que o navegador não oferece notificações, e só a permissão negada mantém a mensagem das configurações do site; validado abrindo o painel por `http://192.168.0.21` (`isSecureContext: false`, aviso de HTTPS) e por `http://localhost` (sem aviso).
6. ✅ 🟠 (v1 #6) **Os valores padrão divergem entre o código e a documentação:**
   - `SYNC_CACHE_TTL`: o código assume 3 ([applications.js:6](../api/src/routes/applications.js#L6)), mas o `.env.example` e o README dizem 13 (continua da v1);
   - 🆕 `MONGO_DB`: o README diz que o padrão é `orbital` ([README.md:126](../README.md#L126)), mas o código passa `undefined` para `client.db()` ([db.js:21](../api/src/db.js#L21)), e o driver usa o banco `test`. Sem `.env`, a API lê um banco vazio e não reclama.

   Sugestão: um `config.js` único que define os padrões e falha na inicialização se algum valor vier inválido (item 25).

   **✅ Resolvido:** criado `api/src/config.js`, que lê e valida todas as variáveis uma única vez (padrões `SYNC_CACHE_TTL=13`, `MONGO_DB=orbital` etc.) e é usado por `db.js`, `cache.js`, rotas e `index.js`; validado com `docker run` mostrando os padrões, `SYNC_CACHE_TTL=abc`/`-5` rejeitados e `HEALTH_CHECK_CONCURRENCY=0` derrubando a inicialização com `Configuration error: …` e código de saída 1.
7. ✅ 🟠 (v1 #7) **O status na inicialização pode ser antigo, e IDs órfãos se acumulam.** Continua: o `orbital-status-v1` aparece como atual mesmo que tenha dias. O `confirmRemove` limpa `apps`, `downSeen` e `latency`, mas não o `status` ([index.html:1176](../frontend/index.html#L1176)). Sugestões:
   - gravar `{ status, ts }` e, passados alguns minutos, mostrar como "último conhecido", com o mesmo visual da tempestade;
   - descartar IDs que não estão na lista.

   **✅ Resolvido:** o `orbital-status-v1` passou a ser `{ status, ts }` (o formato antigo é lido como `ts = 0`), status com mais de 5 min na carga aparece como "último conhecido" com o visual da tempestade (planetas cinza tracejados, badges `ÚLTIMO: …`, contadores apagados e a data na dica da órbita) até o primeiro sync, o `confirmRemove` limpa também o `status` e os IDs fora da lista são descartados na carga e a cada recarga da lista; validado no navegador com o formato antigo, com um `ts` de 1 h atrás e com um de 1 min atrás, e com um ID órfão que sumiu do localStorage.
8. ✅ 🟢 🆕 **A mensagem de lista vazia está errada durante a tempestade.** Na primeira visita com a API fora, a lista diz "Nenhuma aplicação em órbita ainda. Use o botão + para lançar a primeira." ([index.html:1117](../frontend/index.html#L1117)), e o + leva a um cadastro que falha sem aviso (item 4). Com `apiDown` e a lista vazia, a mensagem certa é "Não foi possível carregar as aplicações".
   **✅ Resolvido:** com `apiDown` e a lista do ambiente vazia, a mensagem passa a ser "Não foi possível carregar as aplicações. Tentando reconectar a cada ciclo."; validado no navegador limpando o localStorage e abrindo o painel com a API parada.
9. ✅ 🟢 🆕 **O seed roda duas vezes (verificado).** O `mongo-seed.js` é montado direto em `docker-entrypoint-initdb.d` e também é chamado pelo `01-init.sh` ([docker-compose.local.yml:6](../docker-compose.local.yml#L6)). O `.sh` grava em `orbital`. O `.js`, executado pelo entrypoint sem `MONGO_INITDB_DATABASE`, grava em `test`, e a stack local tem um banco `test` com as mesmas três collections. Sugestão: montar o seed fora de `docker-entrypoint-initdb.d` (por exemplo, `/seed/mongo-seed.js`), ou apagar o `.sh` e definir `MONGO_INITDB_DATABASE=orbital`.
   **✅ Resolvido:** o `mongo-init.sh` foi removido e o serviço `mongo` do `docker-compose.local.yml` passou a definir `MONGO_INITDB_DATABASE=orbital`, então o entrypoint roda o `mongo-seed.js` uma única vez, no banco certo (os outros composes não sobem Mongo); validado com um `mongo:7` descartável, sem volume persistente, cujo log mostra uma só execução do seed e cujos bancos são apenas `admin`, `config`, `local` e `orbital` (4/4/2 aplicações, sem banco `test`).
10. ✅ 🟢 (v1 #8) **O `waitForD3` tenta de novo para sempre** se o CDN falhar, sem aviso na tela ([index.html:687](../frontend/index.html#L687)). Com o d3 servido pelo próprio nginx (item 24), o risco quase some. Mesmo assim, vale desistir depois de uns 10 s e mostrar um aviso no painel da órbita.
   **✅ Resolvido:** o `waitForD3` desiste depois de 10 s (`D3_TIMEOUT`) e mostra "Órbita indisponível" no painel da órbita, avisando que a lista continua funcionando; validado com o hash SRI do d3 alterado temporariamente (o navegador bloqueou o script e o aviso apareceu entre 5 e 11 s), revertido em seguida.
11. ✅ 🟢 🆕 **As chaves do Redis não têm prefixo** (`sync:production`). Num Redis compartilhado em produção, elas podem colidir com as de outro sistema. Basta `keyPrefix: "orbital:"` na criação do cliente ([cache.js:9](../api/src/cache.js#L9)).
   **✅ Resolvido:** o cliente ioredis do `cache.js` passou a usar `keyPrefix: "orbital:"`; validado com `redis-cli --scan`, que depois de um `/sync` mostra apenas `orbital:sync:production` (TTL 13).

## 2. Segurança

12. 🔴 (v1 #10) **POST e DELETE não têm autenticação, e o CORS aceita qualquer origem (verificado).** Um preflight de `DELETE` com `Origin: https://evil.example` recebe `204` com a origem refletida ([index.js:9](../api/src/index.js#L9)). Ou seja, qualquer site aberto por alguém da rede pode apagar aplicações. 🆕 Como o frontend passou a chamar `/api` pelo mesmo host (v1 #1), o CORS perdeu a função: **dá para remover o middleware inteiro hoje**, sem efeito no painel. A autenticação continua necessária (token, ou SSO/OIDC no nginx com `auth_request` ou oauth2-proxy), com registro de quem cadastrou e quem removeu.
13. 🔴 🆕 **A porta 3001 da API é publicada nos dois composes** ([docker-compose.prod.yml:4](../docker-compose.prod.yml#L4), [docker-compose.local.yml:16](../docker-compose.local.yml#L16)). O painel já fala com a API pelo nginx, então a porta só serve para contorná-lo, e com ele qualquer controle que se coloque lá (autenticação, rate limit, headers). Sugestão: tirar o `ports` da API em produção, porque a rede interna do compose basta, e no local publicar só em `127.0.0.1:3001`.
14. 🔴 (v1 #11) **SSRF.** Continua: a API busca qualquer URL cadastrada. 🆕 Há dois detalhes que a sugestão da v1 não cobria:
   - o `fetch` segue redirects por padrão ([applications.js:60](../api/src/routes/applications.js#L60)), então validar só a URL cadastrada não basta, porque um `https://externo` pode redirecionar para `http://169.254.169.254/`. A saída é usar `redirect: "manual"` e tratar o 3xx como resposta, ou validar cada salto;
   - monitorar serviços internos é o objetivo da ferramenta (o seed usa `*.interno`), então bloquear todo IP privado quebra o produto. O bloqueio certo cobre esquemas que não sejam http/https, metadados de nuvem (`169.254.169.254`, `fd00:ec2::254`), loopback e os serviços do próprio compose (`redis`, `mongo`, `api`), mais uma allowlist de domínios ou CIDRs configurável por variável de ambiente. A checagem tem de acontecer na resolução de DNS (um `lookup` próprio num `Agent` do undici); senão, um DNS rebinding passa por ela.
15. 🟠 (v1 #12) **O servidor não valida a entrada.** Continua ([applications.js:117](../api/src/routes/applications.js#L117)). 🆕 O risco do `swaggerUrl: "javascript:…"` é real: o React 18.3 que o `support.js` carrega só avisa sobre URLs `javascript:` em desenvolvimento e as renderiza normalmente em produção. O `url()` do formulário ([index.html:1217](../frontend/index.html#L1217)) protege apenas quem cadastra pela tela. As sugestões são as da v1:
   - validar com um schema (zod ou joi);
   - limitar o tamanho no `express.json`;
   - aceitar só `http(s)` nas duas URLs;
   - criar um índice único para o nome em cada ambiente.
16. 🟠 (v1 #13) **Os erros vazam detalhes internos (verificado).** 🆕 Além do `err.message` devolvido em todas as rotas, um JSON malformado recebe a página de erro padrão do Express **com o stack trace e caminhos do container** (`/app/node_modules/body-parser/...`). Isso acontece porque o `NODE_ENV` não é `production` e não há middleware de erro. Sugestão: um middleware de erro no fim da cadeia, que loga o erro e devolve `{ error: "Erro interno" }`, e `NODE_ENV=production` na imagem.
17. 🟠 🆕 **Não há rate limit.** Cada `POST /sync` pode disparar dezenas de requisições de saída. O cache só protege dentro do TTL, e o `?fresh=1` do item 3 tiraria até essa proteção. O cadastro também não tem limite. Sugestão: `limit_req_zone` no nginx para `/api/` (por exemplo, 5 req/s por IP, com burst), com um limite mais baixo para os métodos de escrita. Isso só funciona se a porta 3001 for fechada (item 13).
18. 🟠 🆕 **Não há HTTPS.** O nginx escuta só na porta 80, e o compose de produção não prevê TLS. Além das notificações (item 5), a autenticação do item 12 passaria em texto puro. Sugestão: terminar o TLS no nginx (ou documentar o proxy reverso que fica na frente), redirecionar a 80 para a 443 e ativar o HTTP/2 junto.
19. 🟠 🆕 **O Node 20 está sem suporte desde 30/04/2026** ([api/Dockerfile:1](../api/Dockerfile#L1)), então a imagem não recebe mais correções de segurança. Sugestão: `node:24-alpine` (LTS), com o Dependabot do item 52 para não repetir.
20. 🟢 (v1 #14) **Container e nginx precisam de endurecimento.** Continua:
   - a API roda como root (verificado: `uid 0`). Faltam `USER node` e `NODE_ENV=production`;
   - o nginx não envia headers de segurança. 🆕 Um cuidado ao montar a CSP: o dc-runtime executa o script do componente com `new Function` ([support.js:842](../frontend/support.js#L842)), então o `script-src` precisa de `'unsafe-eval'`, além de `unpkg.com` e `cdn.jsdelivr.net` enquanto o item 24 não for feito. Ainda assim, valem `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'` e `Permissions-Policy`;
   - 🆕 as respostas anunciam as versões `Server: nginx/1.27.5` e `X-Powered-By: Express` (verificado). A correção é `server_tokens off;` no nginx e `app.disable("x-powered-by")` na API.
21. 🟢 (v1 #15) **Três `.DS_Store` continuam versionados**, e o commit `67a797f` até atualizou um deles. Basta `git rm --cached` nos três e `.DS_Store` no `.gitignore`.
22. 🟢 🆕 **As Actions de terceiros estão fixadas por tag** (`mathieudutour/github-tag-action@v6.2`, `ncipollo/release-action@v1`), num workflow com `contents: write` ([release.yml:20](../.github/workflows/release.yml#L20)). Uma tag pode ser movida pelo dono do repositório. Fixar pelo SHA do commit.

## 3. Arquitetura

23. 🔴 (v1 #32) **Mover o agendamento dos health checks para o servidor.** Continua sendo a mudança de maior impacto. Hoje só existe monitoramento com uma aba aberta, e cada aba aberta dispara 3 `POST /sync` por ciclo. Um desenho que cabe no processo atual da API:
   - um agendador por ambiente roda os checks. Com mais de uma réplica, só executa quem pegar a trava `SET orbital:lock:<env> NX PX`;
   - os resultados vão para uma collection time-series (`checks`) e para um documento com o status atual de cada aplicação;
   - o frontend lê `GET /status` e recebe as mudanças por SSE (`GET /events`), que é mais simples que WebSocket e passa pelo nginx com `proxy_buffering off`;
   - somem o contador por ambiente e o `orbital-counters-v1`, e o "Sincronizar" vira "checar agora" (item 3).

   Isso libera os itens 64 a 67. 🆕 Se o agendador demorar, há um passo intermediário barato: um único `POST /applications/sync` que devolve os três ambientes e troca as 3 requisições por ciclo por uma.
24. 🟠 🆕 **O painel depende de três CDNs de terceiros para abrir.** O React vem do `unpkg.com` (injetado pelo `support.js`), o d3 do `cdn.jsdelivr.net` e as fontes do Google. Se qualquer um deles cair ou for bloqueado pelo proxy da empresa, o monitor não abre, e ele é justamente a ferramenta que deveria continuar de pé. As fontes do Google ainda enviam o IP de cada visitante ao Google, o que é um ponto de atenção para a LGPD. Sugestão: servir tudo pelo próprio nginx (`frontend/vendor/`). O `support.js` já prevê isso: antes de ir ao CDN, ele procura a URL em `window.__resources` e, se houver um caminho local, usa esse caminho ([support.js:1149](../frontend/support.js#L1149)). As fontes passam a ser `@font-face` com arquivos `woff2` locais.
25. 🟠 🆕 **A API inteira está num arquivo de rotas.** O `routes/applications.js` mistura leitura de configuração, acesso ao Mongo, o health check, um utilitário genérico (`mapLimit`) e o mesmo tratamento de erro repetido em cada rota. Uma divisão possível:
   - `config.js`: lê e valida as variáveis uma única vez (resolve o item 6);
   - `services/health.js`: `checkHealth` e `mapLimit`, que ficam testáveis sem Express nem Mongo;
   - `repositories/applications.js`: o acesso ao Mongo (facilita o item 26);
   - rotas enxutas e um middleware de erro.

   Migrar para o Express 5 também elimina os cinco `try/catch` iguais, porque ele repassa ao middleware de erro as promises rejeitadas pelos handlers `async`.
26. 🟢 (v1 #23) **Uma collection só, com o campo `env`.** Continua: as três collections quase idênticas (`applications_<env>`) obrigam a validar e mapear o ambiente em toda rota, e mover uma aplicação de ambiente significa apagar e recriar. Uma collection `applications` com `env` indexado, mais o índice único `{ env, name }` do item 15, simplifica isso. A migração é um script que roda uma vez.
27. 🟢 🆕 **Modularizar o frontend dentro das regras do dc-runtime.** O `index.html` tem 1243 linhas, 820 delas numa única classe. O que não depende de `this` pode ir para arquivos `.js` comuns carregados antes, como o d3, expostos num `window.Orbital`: `THEMES`, `apiFetch`, `fromApi`/`toApi`, `cloudSvg`, `clockLabel`/`agoLabel`, as fábricas de estilo e o desenho do céu. O componente fica menor e essas partes ganham testes com `node --test` (item 48). O custo são algumas requisições a mais, compensadas pelo HTTP/2 (item 18) e pelo cache do nginx.

## 4. Performance

28. ✅ 🟠 🆕 **Cada render reaplica o tema inteiro (verificado).** O `rootRef` é uma arrow function nova a cada `renderVals()` ([index.html:1061](../frontend/index.html#L1061)). Quando a função do ref muda, o React chama o callback de novo, e esse callback chama `applyTheme()`. Assim, a cada `setState` (cada tecla na busca, cada popover aberto, cada sync, que são 3 por ciclo), o painel:
   - reescreve as 69 propriedades inline da raiz;
   - força um cálculo de estilo síncrono com `getComputedStyle` ([index.html:683](../frontend/index.html#L683));
   - invalida o estilo da árvore toda, porque as variáveis CSS são herdadas;
   - reagenda o timer do `applySky()`.

   No navegador, abrir e fechar o popover de periodicidade chamou `getComputedStyle` duas vezes. Sugestão: criar os callbacks de ref uma vez só, como campos da classe (igual ao `checkAll`), e chamar `applyTheme()` apenas quando o tema ou a tempestade mudam. `cloudsRef`, `stormRef`, `orbitRef` e `countdownRef` têm o mesmo problema e hoje só são baratos por causa das guardas.

   **✅ Resolvido:** os sete callbacks de ref (`rootRef`, `starsRef`, `cloudsRef`, `stormRef`, `cometRef`, `countdownRef`, `orbitRef`) viraram campos da classe criados uma vez, e o `applyTheme()` passou a rodar só na montagem da raiz e quando o tema ou a tempestade mudam; no navegador, abrir/fechar o popover de periodicidade e digitar 3 vezes na busca caiu de 5 chamadas a `getComputedStyle` para 0, com troca de tema, tempestade (API parada e religada), busca, filtros e modais conferidos.
29. ✅ 🟢 🆕 **O `GET /applications` só começa depois que o React chega do unpkg.** No resource timing do navegador, a chamada à API é a última da fila: ela espera o `support.js`, o React, o ReactDOM e a inicialização do runtime, e só então soma a própria latência. Sugestão: `<link rel="preload" href="/api/applications" as="fetch" crossorigin="anonymous">` no `<head>` real (não no `<helmet>`, que só é injetado depois da inicialização). O `fetch` do `componentDidMount` reaproveita a resposta. Com o item 24 feito, vale um `preload` do React também.

   **✅ Resolvido:** o `<link rel="preload" href="/api/applications" as="fetch" crossorigin="anonymous">` entrou no `<head>` real, antes do `support.js` (mesma URL relativa, modo cors e credenciais same-origin do `apiFetch`); no resource timing a lista passou a sair aos ~15 ms, junto com o `support.js`, com uma única entrada (`link`) e nenhuma segunda requisição do `loadApps()`, sem aviso de preload não usado, e com a API parada o 502 do preload também é reaproveitado e acende a tempestade.
30. ✅ 🟢 🆕 **O HTML é pedido duas vezes a cada carga (verificado).** Sem `window.__resources`, o `support.js` refaz `fetch(location.href)` para reler o template ([support.js:159](../frontend/support.js#L159)). Como o `index.html` é `no-cache`, o custo é uma revalidação (304, uns 300 B) e um segundo parse de 80 KB. Definir `window.__resources` (item 24) desliga esse refetch. Porém, o motivo dele não está documentado, e o fonte do runtime não está no repositório, então é preciso testar eventos e `ref`s antes de adotar.

   **✅ Resolvido:** um `<script>window.__resources = window.__resources || {};</script>` antes do `support.js` desliga o refetch sem mudar nada além disso (o runtime só consulta o mapa para trocar URLs, e um mapa vazio mantém React, ReactDOM e folhas do `<helmet>` nas URLs originais); o refetch servia para reler o template do texto cru, e a comparação no navegador do template lido do DOM com o do texto cru, normalizado como o runtime faz (`sc-camel-*` e `EVENT_MAP`), deu 252 nós e 0 diferenças; o resource timing deixou de mostrar o segundo `fetch` do HTML, e eventos, refs (countdown, órbita, `ResizeObserver`), `sc-for`, `sc-if`, `<helmet>`, tema, tempestade, busca, filtros, popovers e os modais de cadastro e remoção (com um cadastro e uma remoção reais) continuaram funcionando.
31. ✅ 🟢 🆕 **As fontes são pedidas em duplicidade.** O `styles.css` do design system faz `@import` do Inter 400–700, e o `<helmet>` pede de novo o Inter 400–600 junto com a JetBrains Mono ([index.html:18](../frontend/index.html#L18)). São duas folhas de estilo do Google, e a do `@import` só é descoberta depois que o `styles.css` chega. As fontes locais do item 24 resolvem isso; até lá, o `<helmet>` pode pedir só a JetBrains Mono. O `_ds_bundle.js` também é carregado à toa: é um bundle vazio (`"components": []`).

   **✅ Resolvido:** o `<helmet>` passou a pedir só a JetBrains Mono (o Inter segue vindo do `@import` do `styles.css`) e deixou de carregar o `_ds_bundle.js`, que só criava o namespace vazio `Nocturne_noctur` e não é referenciado por nada; no resource timing ficaram uma folha de fontes por família e nenhum pedido do bundle, com Inter 400/500 e JetBrains Mono 400 carregadas e a tela, a troca de tema, a busca, os filtros, o popover e os modais sem mudança.
32. ✅ 🟢 🆕 **As 160 estrelas são animadas uma a uma.** Cada `circle` do céu tem a própria animação CSS de opacidade ([index.html:719](../frontend/index.html#L719)), e em SVG isso tende a repintar a camada inteira a cada quadro enquanto o tema escuro está ativo. Vale medir antes (DevTools → Rendering → Paint flashing, ou a aba Performance). Se confirmar, dá para agrupar as estrelas em 3 ou 4 `<g>` com fases diferentes (4 animações em vez de 160) ou desenhá-las num `<canvas>`. A chuva da tempestade segue o mesmo padrão, com 140 `div`s.

   **✅ Resolvido:** as estrelas foram divididas em 4 `<g>` de 40, cada grupo com ritmo e fase próprios (4 s a 8,5 s) e cada estrela com uma opacidade base aleatória para disfarçar o sincronismo, e a chuva virou 4 camadas de 200vh que descem 100vh por ciclo com as gotas repetidas na metade de baixo (laço sem emenda, mesma densidade de 140 gotas na tela); no navegador, `document.getAnimations().length` caiu de 165 para 9 com o céu calmo e de 315 para 23 na tempestade, com estrelas pausadas no tema claro, chuva pausada depois que o céu abre e o visual conferido por captura de tela nos dois temas.
33. ✅ 🟢 🆕 **Redimensionar a janela refaz o esqueleto da órbita a cada evento.** O `ResizeObserver` chama `drawOrbits()` a cada mudança de tamanho ([index.html:1080](../frontend/index.html#L1080)), então arrastar a janela recria o SVG dezenas de vezes. Agrupar as chamadas com `requestAnimationFrame` ou com um debounce de uns 100 ms resolve.

   **✅ Resolvido:** o `ResizeObserver` passou a agendar o redesenho com um debounce de `RESIZE_DEBOUNCE_MS` (100 ms), que confere o tamanho só quando o arrasto para e é cancelado no `componentWillUnmount`; no navegador, 30 mudanças de largura em 30 quadros seguidos recriaram o SVG da órbita 1 vez (antes, 30) e 4 redimensionamentos seguidos da janela, 1 vez, sempre com o `viewBox` final igual ao tamanho do painel, inclusive durante a tempestade.

## 5. Legibilidade e qualidade de código

34. ✅ 🟠 (v1 #16) **A lógica de filtro continua repetida em três lugares:** `select` ([index.html:697](../frontend/index.html#L697)), `updatePlanets` ([index.html:929](../frontend/index.html#L929)) e `renderVals` ([index.html:1041](../frontend/index.html#L1041)). Um `visibleApps()` resolve. 🆕 Com ele, fica claro que o `else` de `select()` nunca executa, porque um planeta clicado na órbita já passou pelo mesmo filtro.
   **✅ Resolvido:** o filtro de ambiente, busca e status virou um único `visibleApps()`, usado por `select`, `updatePlanets` e `renderVals`, e o `else` morto de `select()` saiu; validado no navegador com busca (`check` e sem resultado), chips TODAS/NO AR/FORA, abas de ambiente e paginação mostrando os mesmos itens na lista e na órbita, e o clique no planeta da página 2 de DESENVOLVIMENTO levando a lista para 2/2 com o card selecionado.
35. ✅ 🟠 (v1 #17) **O JS tem cores fixas**, o que contraria o CLAUDE.md e duplica o `THEMES`: `col()` ([index.html:1035](../frontend/index.html#L1035)), `drawOrbits` ([index.html:893](../frontend/index.html#L893)), os traços e rótulos de `paintPlanets` ([index.html:972](../frontend/index.html#L972)), `selBorder`/`selBg`, os anéis e o fundo do `body` em `applyTheme`. 🆕 Não é preciso ler as variáveis com `getComputedStyle`: o SVG aceita `var()` em `style`, inclusive no `stop-color` dos gradientes, e o `paintPlanets` já faz isso com `var(--stale)`. Com as cores em variáveis, trocar o tema deixaria de exigir um redesenho da órbita.
   **✅ Resolvido:** `col()`, os gradientes de brilho, anéis, traços, brilho e rótulos dos planetas, `selBorder`/`selBg` e o fundo do `body` passaram a usar `statusColor()` e os aliases `--idle`, `--orbit-ring`, `--planet-edge`, `--planet-edge-sel`, `--planet-shine`, `--planet-label`, `--sel-line`, `--sel-fill` e `--page-bg` dos dois mapas do `THEMES` (no SVG via `style`, inclusive `stop-color`), mantendo o redesenho ao trocar o tema porque núcleo (sol/lua) e halo (gradiente/cor chapada) mudam de forma, e foi validado comparando no navegador os estilos computados de planetas, anéis, gradientes, núcleo, cards e `body` antes e depois, sem diferença visível nos temas escuro e claro, com e sem tempestade.
36. ✅ 🟠 🆕 **O código usa três vocabulários para as mesmas coisas:**
   - ambiente: `dev`, `development` e `DESENVOLVIMENTO`, espalhados em três tabelas (`ENVS`, `ENV_TO_API`, `API_TO_ENV`), além da lista literal `['dev', 'hml', 'prd']` repetida em `saveCounters` e `startAuto`;
   - status: `healthy`/`degraded`/`unhealthy` na API, `up`/`degraded`/`down` no frontend;
   - campos: `name`/`team`/`healthCheckUrl`/`swaggerUrl` na API e `nome`/`time`/`health`/`swagger` no frontend, com `fromApi`/`toApi` no meio. E `time` (equipe) se confunde com a palavra inglesa *time* em `onTime`, `timeDropOpen` e `timeSuggestions`.

   Sugestão: uma tabela única `ENVS = [{ code: 'dev', api: 'development', label: 'DESENVOLVIMENTO' }]`, e o frontend adotando os nomes de campo e de status da API.

   **✅ Resolvido:** a tabela única `ENVS` (`{ code, api, label }`) passou a gerar `ENV_CODES`, `ENV_TO_API`, `API_TO_ENV` e `envLabel()` no lugar das três tabelas e das listas literais, o frontend adotou os campos `name`/`team`/`healthCheckUrl`/`swaggerUrl` e os status `healthy`/`degraded`/`unhealthy` da API (sem o `toApi`, com o `fromApi` reduzido a acrescentar o `env`, e com `onTime`/`timeDropOpen`/`timeSuggestions` renomeados para `team…`), mantendo as chaves do localStorage e convertendo na leitura o formato antigo (`migrateApp()` para `nome`/`time`/`health`/`swagger` e `migrateStatus()` para `up`/`down`), regravado no formato novo no próximo save, e o CLAUDE.md foi atualizado; validado no navegador carregando o localStorage antigo com a API parada (cache e status antigos exibidos certos na tempestade), com a API no ar e contadores recentes (planetas vermelhos, FORA e título em 4 antes de qualquer sync) e no formato de mapa puro (`ÚLTIMO: FORA DO AR`), uma aplicação fora do ar e depois degradada via `healthCheckUrl` alterado no Mongo e restaurado (planeta vermelho/âmbar, contadores, título de 4 para 5, chips e tooltip de latência), e abas, chips, periodicidade, busca, paginação, clique no planeta, tema, alertas, sugestões de time e cadastro e remoção de uma aplicação de teste com os campos novos, sem erros de JS no console.
37. ✅ 🟠 🆕 **O `renderVals()` tem 215 linhas.** Ele mistura fábricas de estilo, handlers, estado derivado e uma IIFE espalhada no objeto para as sugestões de time ([index.html:1194](../frontend/index.html#L1194)). Sugestões:
   - as fábricas de estilo (`envTab`, `chip`, `rateOpt`, `swTrack`, `swKnob`, `navBtn`) não usam `this` e podem subir para o nível do módulo;
   - o `renderVals` pode juntar o resultado de funções menores, como `toolbarVals()`, `listVals()` e `formVals()`.

   **✅ Resolvido:** o `renderVals()` caiu para 19 linhas que juntam refs fixos com `skyVals()`, `toolbarVals()`, `headerVals()`, `listVals()`, `removeVals()` e `formVals()`, a IIFE das sugestões virou o método `teamVals()`, `confirmRemove` e `submitForm` viraram campos da classe como o `checkAll`, e `envTab`, `chip`, `rateOpt`, `swTrack`, `swKnob`, `navBtn`, `statusText`, `secs` e `stopEvent` subiram para o nível do módulo; validado conferindo por script que as 91 ligações `{{ }}` do template continuam resolvidas e, no navegador, abas, chips, periodicidade, busca, paginação, clique no planeta, tema, painel de alertas, sugestões de time, validação, cadastro de uma aplicação de teste em HOMOLOGAÇÃO (planeta vermelho e contador do título em 5) e sua remoção, com erro "sem contato com a API" enquanto a API estava parada e sucesso no "Tentar de novo", além da tempestade com badges `ÚLTIMO:`, sem erros de JS no console.
38. ✅ 🟢 🆕 **Há botões quase idênticos escritos à mão.** O template repete 3 abas de ambiente, 3 botões de ambiente no formulário, 4 chips de filtro e 3 opções de periodicidade, cada um com seu handler e seu `*Style` no `renderVals` (`envDev`, `envDevStyle`, `rate15`, `rate15Style`…). Um `sc-for` sobre uma lista `{ label, onClick, style }` montada no JS respeita a regra do dc-runtime (argumentos só por closure) e tira umas 30 entradas do `renderVals`.
   **✅ Resolvido:** os 13 botões escritos à mão viraram quatro `sc-for` sobre `envTabs`, `formEnvs`, `filterChips` (da nova constante `FILTERS`) e `rateOptions` (rótulos gerados de `RATE_OPTIONS`), cada item `{ label, style, onClick }` com o argumento preso por closure, o que tirou 26 entradas do `renderVals`; validado no navegador com as abas trocando a órbita e a lista com uma só ativa, os chips filtrando lista e planetas, as periodicidades marcando a ativa e gravando `orbital-rate-v1`, os botões de ambiente do formulário marcando e cadastrando uma aplicação de teste em DESENVOLVIMENTO (depois removida pela interface), além de tema, busca, paginação, clique no planeta, sugestões de time, tempestade e painel de alertas sem erros de JS no console.
39. ✅ 🟢 🆕 **O estilo tipográfico se repete.** `font-family:'JetBrains Mono',monospace` aparece 24 vezes no template, quase sempre com a mesma combinação de tamanho e `letter-spacing`. Sugestão: um alias `--mono` nos dois mapas do `THEMES`, como pede o CLAUDE.md, e constantes JS para os 2 ou 3 estilos de rótulo mono que se repetem, mantendo a regra de não usar classes.
   **✅ Resolvido:** o alias `--mono` entrou nos dois mapas do `THEMES` e substituiu todas as fontes mono literais (template, fábricas de estilo e o "SEM SINAL" do SVG), e as quatro combinações que se repetem viraram as constantes `MONO_CONTROL`, `MONO_SMALL`, `MONO_STAT` e `MONO_EYEBROW`, usadas no template por `{{ }}` seguidas do que muda em cada rótulo; validado no navegador comparando família, tamanho, `letter-spacing`, cor e padding computados de todos os elementos mono (página, periodicidade, alertas, cadastro e remoção) antes e depois, sem diferença, e conferindo o tema claro e o "SEM SINAL" da tempestade.
40. ✅ 🟢 (v1 #18) **Código morto.** Continuam lá `hasSelection`, `selNome`, `selTime`, `selHealth`, `selStatusLabel`, `selDotStyle`, `selSwagger*`, `clearSelection`, e `envLabel`, `envBadgeStyle` e `healthShort` no map de `apps`, além de `--fab-solid` e `--fab-ink`. 🆕 Também são código morto:
   - o retorno de `drawCore()` (`'NUVEM'`, `'SOL'`, `'LUA'`), que ninguém usa;
   - o `theme` que o `renderVals` devolve e o template não usa;
   - o `else` de `select()` (item 34);
   - o `Orbital.dc.html` vazio.

   **✅ Resolvido:** saíram do `renderVals` os `sel*`, `hasSelection`, `clearSelection` e `theme`, do map de `apps` os `envLabel`, `envBadgeStyle` e `healthShort`, dos dois mapas do `THEMES` o `--fab-solid` e o `--fab-ink`, os valores de retorno do `drawCore()` e o `Orbital.dc.html` (com a menção no CLAUDE.md), depois de conferir com `grep` que nada disso aparecia no template nem no JS; validado no navegador com estilos computados idênticos aos de antes nos dois temas (núcleo de sol e lua inclusive), tempestade indo e voltando, busca, filtros, abas, paginação, clique no planeta e modais de cadastro e remoção sem erros no console.
41. ✅ 🟢 (v1 #19) **A validação de ambiente se repete em quatro rotas** ([applications.js:41](../api/src/routes/applications.js#L41)). Um `router.param("env", …)` resolve.
   **✅ Resolvido:** a validação repetida nas quatro rotas virou um único `router.param("env", …)` em `applications.js`; validado com `curl` mostrando 404 com a mesma mensagem para `foo` em `GET /:env`, `POST /:env/sync`, `POST /:env` e `DELETE /:env/:id`, e as rotas com ambiente válido respondendo normalmente (200, 400 de validação do corpo e 400 de id inválido).
42. ✅ 🟢 (v1 #20) **Há números mágicos no código.** Continuam os `15`/`30`/`60` e o `PER = 3`. 🆕 Entram também o timeout de 5000 ms do health check ([applications.js:60](../api/src/routes/applications.js#L60)), que merece virar `HEALTH_CHECK_TIMEOUT_MS`, os 400 ms do buffer de alertas e os 1300 ms do fade da tempestade.
   **✅ Resolvido (API):** o timeout fixo de 5000 ms virou `HEALTH_CHECK_TIMEOUT_MS` (padrão 5000, validado no `config.js`) e foi documentado no `api/.env.example`, no `.env.prod.example` e nas duas tabelas do README; validado com um container avulso com `HEALTH_CHECK_TIMEOUT_MS=50`, em que as aplicações saudáveis passaram a `unhealthy`, e com `HEALTH_CHECK_TIMEOUT_MS=5s` impedindo a inicialização.
   **✅ Resolvido (frontend):** os números soltos do `index.html` viraram constantes nomeadas e comentadas no topo do script (`RATE_OPTIONS`, `DEFAULT_RATE`, `PAGE_SIZE` no lugar do `PER`, `ALERT_BATCH_MS`, `STORM_FADE_MS`, e também `D3_POLL_MS`, `TEST_NOTIF_MS`, `TEAM_BLUR_MS`, `COMET_WAIT_MIN`, `COMET_WAIT_SPREAD` e `COMET_RETRY_JITTER`), com os rótulos `15s`/`30s`/`60s` do template ainda escritos à mão até o item 38; validado no navegador com a paginação de 3 em 3 (DESENVOLVIMENTO em 1/2 e 2/2), as três periodicidades marcando a opção ativa, zerando o contador e gravando `orbital-rate-v1`, a lista de times fechando ~150 ms depois do blur e o `--storm-play` pausando 1308 ms depois de o céu abrir.
43. ✅ 🟢 🆕 **O `componentDidMount` altera `this.state` diretamente** (`this.state.rate = r`, `this.state.sound = true`…) ([index.html:432](../frontend/index.html#L432)). Funciona porque acontece antes do `setState` seguinte, mas quebra se alguém reordenar o código. O certo é montar um objeto e passá-lo ao `setState` que já existe logo abaixo.
   **✅ Resolvido:** o `componentDidMount` junta `rate`, `sound`, `notify` e `lastOk` lidos do localStorage num objeto `prefs` que vai no `setState` que já existia (a chave `orbital-rate-v1` virou a constante `RKEY`), sem nenhuma atribuição direta a `this.state`; validado recarregando a página com `rate=60`, som ligado e `lastok` de 10:11:12 gravados e a API parada, que abriu com 60s marcado e o contador em 56s, o switch de som ligado e a tempestade dizendo "às 10:11:12".

## 6. Acessibilidade

44. 🟠 (v1 #21) **O teclado e os modais continuam com problemas:**
   - o card `<article onClick>` não funciona pelo teclado;
   - o "✕" não tem `aria-label`;
   - os modais não têm `role="dialog"`, não fecham com Esc e não prendem o foco;
   - o modal de cadastro não fecha ao clicar fora;
   - os popovers não fecham ao clicar fora.

   🆕 Os planetas também não recebem foco nem têm nome acessível.
45. 🟠 🆕 **Na órbita, o status é indicado só pela cor, e a cor é verde contra vermelho,** o par mais afetado pelo daltonismo. O card tem texto, mas o planeta não. Sugestão: uma pista de forma além da cor, como anel tracejado ou "×" no planeta fora do ar e anel pulsante no degradado.
46. 🟢 🆕 **Só a chuva e o cometa respeitam o `prefers-reduced-motion`.** Os planetas continuam girando, as estrelas piscando e as nuvens passando. Com a preferência ligada, o ideal é parar o `d3.timer` (planetas em posição fixa) e as animações do céu, o que ainda economiza CPU.
47. 🟢 🆕 **Faltam atributos semânticos simples:**
   - o `<html>` não tem `lang="pt-BR"` ([index.html:2](../frontend/index.html#L2)), então os leitores de tela leem o texto com pronúncia em inglês;
   - as abas de ambiente não têm `role="tablist"` nem `aria-selected`;
   - os chips de filtro não têm `aria-pressed`;
   - os contadores NO AR, DEGRADADO e FORA não têm `aria-live`, então uma queda não é anunciada.

## 7. Testes, CI e operação

48. 🟠 (v1 #22) **Continua sem testes, lint ou CI de build.** Um caminho incremental:
   - `node --test`, sem dependência nova, para `mapLimit` e `checkHealth`, contra um `http.createServer` local que responde 200, 500, devagar ou nunca;
   - as rotas com `supertest` e `mongodb-memory-server`;
   - um teste de fumaça com Playwright contra o compose, incluindo a tempestade (`docker compose stop api`);
   - um job de PR com ESLint, testes, `docker build` das duas imagens e `docker compose config`.
49. 🟠 🆕 **A API não registra nada.** Tirando o `console.log` de inicialização, nenhuma requisição e nenhum erro é logado: as rotas transformam exceções em 500 e seguem em frente. Um problema em produção não deixa rastro. Sugestão: `pino` com `pino-http` (JSON no stdout, que o Docker já coleta), logando o erro com stack no middleware do item 16.
50. 🟢 (v1 #24) **Faltam healthchecks e desligamento controlado nos containers.** Continua:
   - a API não tem um `/health` próprio;
   - o compose não tem `healthcheck`;
   - o `depends_on` não usa `condition: service_healthy`;
   - não há desligamento controlado (SIGTERM fechando Mongo e Redis).

   🆕 A API também sobe e anuncia "running" mesmo sem o Mongo, porque o `connect()` ([db.js:16](../api/src/db.js#L16)) só roda na primeira requisição. O `/health` deveria verificar o Mongo e o Redis.
51. 🟢 🆕 **Todo push na `main` gera uma release**, inclusive commits só de documentação ou de `.DS_Store` ([release.yml:3](../.github/workflows/release.yml#L3)). E a versão do `package.json` (`1.0.0`) nunca acompanha a tag. Sugestão: `paths-ignore` para `docs/**` e `*.md`, e `default_bump: false`, para que só commits `feat:` e `fix:` gerem versão (o `github-tag-action` já entende Conventional Commits).
52. 🟢 🆕 **As dependências não são atualizadas automaticamente.** Imagens (`node:20`, `nginx:1.27`, `mongo:7`, `redis:7`), pacotes npm e Actions só mudam quando alguém se lembra, e foi assim que o Node 20 passou do fim de vida (item 19). Sugestão: Dependabot ou Renovate para `npm`, `docker` e `github-actions`.

## 8. Documentação

53. 🟢 (v1 #9) **A documentação continua inconsistente.** Os problemas da v1 seguem todos abertos:
   - o README mostra o badge de licença MIT, mas a licença é GPL v3 ([README.md:10](../README.md#L10));
   - o `.env.prod.example` é citado no README e no `docker-compose.yml`, mas não existe. Ele pode ser criado a partir do `api/.env.example`;
   - o CLAUDE.md diz que o `docker-compose.yml` tem os mesmos serviços do local, mas ele só tem comentários;
   - o README anuncia um "Painel de detalhes" ([README.md:37](../README.md#L37)). 🆕 A dica da órbita promete o mesmo, "CLIQUE EM UM PLANETA PARA DETALHES" ([index.html:1075](../frontend/index.html#L1075)), mas o clique só destaca o card.

   🆕 E há problemas novos:
   - a tabela do modo local lista o MongoDB em `localhost:27017` e o Redis em `localhost:6379` ([README.md:63](../README.md#L63)), mas o compose não publica essas portas;
   - o padrão de `MONGO_DB` está errado (item 6).

## 9. Funcionalidades

### Novas na v2

54. 🟠 🆕 **Painel de detalhes da aplicação**, que o README e a dica da órbita já prometem. Ao clicar num planeta ou num card, ele mostraria:
   - as URLs de health check e Swagger, com botão de copiar;
   - a latência, o código HTTP e o motivo da última falha;
   - o horário da última checagem e "fora do ar desde…";
   - as ações de **checar agora** (`POST /applications/:env/:id/check`, que resolve o item 3), editar e remover.

   É o lugar natural dos dados dos itens 23 e 65.
55. 🟠 🆕 **Visão em matriz, aplicação × ambiente.** A mesma aplicação costuma existir nos três ambientes (no seed, `checkout-api` e `catalogo-service` estão nos três). Uma tabela compacta, com uma linha por nome e um ponto por ambiente, mostra num relance que algo está "fora só em HML", o que hoje exige trocar de aba. Ela complementa a órbita, sem substituí-la.
56. 🟠 🆕 **Testar a URL antes de lançar.** Um botão no formulário que roda um check avulso, com as mesmas regras de SSRF do item 14, e mostra status e latência. Evita cadastrar uma URL com erro de digitação, que já nasceria vermelha.
57. 🟢 🆕 **Favicon com o status:** um ponto vermelho ou âmbar quando alguma aplicação está fora do ar ou degradada, e a nuvem quando a API cai. Com muitas abas abertas, o título (onde fica o contador) some, mas o favicon continua visível.
58. 🟢 🆕 **Estado na URL e última aba lembrada.** Um link como `?env=hml&filter=down&q=checkout` abre o painel no mesmo recorte e pode ser compartilhado. Hoje o painel sempre abre em PRODUÇÃO, mesmo para quem só usa HML.
59. 🟢 🆕 **Atalhos de teclado:** `/` para a busca, `1`, `2` e `3` para os ambientes, `s` para sincronizar, `n` para nova aplicação e `Esc` para fechar modal e popover (este último faz parte do item 44).
60. 🟢 🆕 **O tema segue o sistema na primeira visita** (`prefers-color-scheme`). Depois disso, vale a escolha feita no switch.
61. 🟢 🆕 **Criticidade por aplicação** (tier 1 a 3): planetas maiores para o que é crítico e uma política de alerta por tier (por exemplo, só o tier 1 bipa). Combina com a metáfora e reduz o ruído.
62. 🟢 🆕 **Desfazer a remoção.** Um toast "Desfazer" por alguns segundos, com remoção lógica no servidor (`deletedAt`), que também serve de trilha de auditoria.
63. 🟢 🆕 **PWA com Web Push**, depois do item 23. O painel fica instalável (bom para o modo TV) e os alertas chegam mesmo com a aba fechada, inclusive no celular.

### Continuam da v1

| # | Prio. | Item | Observação na v2 |
|---|---|---|---|
| 64 | 🔴 | (v1 #33) Histórico e uptime (24h, 7d, 30d) com sparkline | Depende do item 23. |
| 65 | 🔴 | (v1 #34) Mais contexto em cada check | 🆕 Metade pronta: o `/sync` já devolve a latência, mas ela só aparece no tooltip do degradado. Faltam código HTTP, motivo da falha (timeout, DNS, 5xx, conexão recusada), última checagem e "fora do ar desde…". O lugar certo é o painel do item 54. |
| 66 | 🔴 | (v1 #36) Alertas pelo servidor (Slack, Teams, e-mail, webhook) com roteamento por time | Depende do item 23. |
| 67 | 🟠 | (v1 #37) Evitar alarme falso: N falhas seguidas e um retry imediato antes de declarar a queda | Depende do item 23. |
| 68 | 🟠 | (v1 #38) Aviso de recuperação e toast na página quando a aba está em foco | 🆕 Incluir também "API de volta": a queda da API notifica, mas a volta não. |
| 69 | 🟠 | (v1 #39) Checks configuráveis por aplicação: método, código esperado, timeout, headers, autenticação, verificação do corpo | 🆕 Inclui decidir sobre redirects (item 14): hoje um 302 para a tela de login conta como no ar. |
| 70 | 🟠 | (v1 #40) Monitorar a expiração do certificado SSL | — |
| 71 | 🟠 | (v1 #41) Janelas de manutenção e silenciar aplicação | — |
| 72 | 🟠 | (v1 #42) Contador de quedas em cada aba de ambiente | — |
| 73 | 🟠 | (v1 #43) Editar aplicações (PUT/PATCH e tela) | Hoje só dá para editar direto no Mongo. Entra no painel do item 54. |
| 74 | 🟢 | (v1 #44) Linha do tempo de incidentes | — |
| 75 | 🟢 | (v1 #45) Modo TV / quiosque | Combina com o PWA do item 63. |
| 76 | 🟢 | (v1 #46) Filtro e agrupamento por time; contato de plantão | — |
| 77 | 🟢 | (v1 #47) `/metrics` no formato Prometheus | — |
| 78 | 🟢 | (v1 #48) Importar e exportar em lote (JSON/YAML) | — |
| 79 | 🟢 | (v1 #49) Mapa de dependências ("luas") | — |
| 80 | 🟢 | (v1 #50) Escalabilidade da visualização (mais de 30 aplicações; lista de 3 por página) | — |

---

## Ordem sugerida

1. **Correções rápidas que reduzem risco real (horas de trabalho):**
   - item 12, na parte de remover o CORS;
   - item 13, fechar a porta 3001;
   - item 16, middleware de erro e `NODE_ENV`;
   - item 19, subir para o Node 24;
   - item 20, `USER node`, headers e `server_tokens`;
   - itens 21, 9, 6 e 53.
2. **Corrigir o comportamento:** item 1 (recarregar a lista), item 2 (single-flight), item 28 (refs estáveis) e itens 4, 3 e 5.
3. **Segurança de verdade:** autenticação (item 12), SSRF (item 14), validação (item 15), rate limit (item 17) e HTTPS (item 18).
4. **Base para evoluir:** camadas e Express 5 (item 25), testes e CI (item 48), logs (item 49) e Dependabot (item 52).
5. **Agendamento no servidor (item 23)** e o que ele libera: itens 54 e 64 a 67.
