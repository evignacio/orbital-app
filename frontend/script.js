// Lógica do componente Orbital. O dc-runtime (support.js) só lê o TEXTO da tag
// <script data-dc-script> do index.html e o avalia com new Function("DCLogic", …):
// ele ignora src. Por isso este arquivo é um script comum, carregado antes do boot,
// e a classe sai de uma fábrica que recebe o DCLogic do runtime — a tag do
// index.html só faz `const Component = createComponent(DCLogic);`.
const TKEY = 'orbital-theme-v1';
const AKEY = 'orbital-apps-v1';
const SKEY = 'orbital-status-v1';
const NKEY = 'orbital-notify-v1';
const SNDKEY = 'orbital-sound-v1';
const LKEY = 'orbital-lastok-v1';
const COMETKEY = 'orbital-comet-v1';
// Cometa é raro: no máximo COMET_MAX passagens em qualquer janela de 1h.
const COMET_MAX = 2;
const COMET_WINDOW = 3600000;
const API_TIMEOUT = 10000;
// Status gravado há mais que isso aparece como "último conhecido" até o primeiro ciclo do servidor.
const STATUS_STALE_MS = 5 * 60000;
// O d3 vem de CDN: passado esse prazo sem ele, a órbita desiste e avisa.
const D3_TIMEOUT = 10000;
// Redimensionar: espera o arrasto parar antes de refazer o esqueleto da órbita.
const RESIZE_DEBOUNCE_MS = 100;
// Enquanto o d3 não chega do CDN, confere de novo neste intervalo.
const D3_POLL_MS = 120;
// O EventSource reconecta sozinho; só depois deste prazo sem conexão vira tempestade.
const SSE_DOWN_GRACE_MS = 5000;
// Reabertura manual quando o EventSource desiste (resposta que não é event-stream, ex.: 502 do nginx).
const SSE_RETRY_MS = 3000;
// "Sincronizar" volta ao normal sozinho se o cycle do ambiente não chegar neste prazo.
const SCAN_MAX_MS = 30000;
// Cards por página na lista da frota.
const PAGE_SIZE = 3;
// Quedas que chegam dentro desta janela (ex.: vários status do mesmo ciclo) saem num bipe só.
const ALERT_BATCH_MS = 400;
// Pausa as animações da tempestade só depois do fade do céu (transition de 1.2s no template).
const STORM_FADE_MS = 1300;
// A notificação de teste ao ligar os alertas some sozinha depois disso.
const TEST_NOTIF_MS = 6000;
// O blur do campo de time espera o onMouseDown de uma sugestão antes de fechar a lista.
const TEAM_BLUR_MS = 150;
// Intervalo entre tentativas de cometa: de COMET_WAIT_MIN a COMET_WAIT_MIN + COMET_WAIT_SPREAD.
const COMET_WAIT_MIN = 20 * 60000;
const COMET_WAIT_SPREAD = 40 * 60000;
// Com a cota cheia, a próxima tentativa ganha até isto de folga depois que a janela libera.
const COMET_RETRY_JITTER = 10 * 60000;
const CLOUD_BOLT_PATH = 'M156,168H132.53l-14.4,24H144a8,8,0,0,1,6.86,12.12l-24,40a8,8,0,0,1-13.72-8.24L129.87,208H104a8,8,0,0,1-6.86-12.12L113.87,168h-37C48.12,168,24.2,145.07,24,116.36A52.09,52.09,0,0,1,61.35,66.1a4,4,0,0,1,5,4.78A92.48,92.48,0,0,0,64,87.39,8.14,8.14,0,0,0,71.41,96l.6,0a8.18,8.18,0,0,0,8.08-7.72A76,76,0,1,1,156,168Z';
const BOLT_PATH = 'M213.85,125.46l-112,120a8,8,0,0,1-13.69-7l14.66-73.33L45.19,143.49a8,8,0,0,1-3-13l112-120a8,8,0,0,1,13.69,7L153.18,90.9l57.63,21.61a8,8,0,0,1,3,12.95Z';
const BASE_TITLE = 'Orbital - App';
// Tabela única de ambientes: código curto da UI, nome na API/Mongo e rótulo.
// Tudo o que lista ou traduz ambientes deriva daqui.
const ENVS = [
  { code: 'dev', api: 'development', label: 'DESENVOLVIMENTO' },
  { code: 'hml', api: 'staging', label: 'HOMOLOGAÇÃO' },
  { code: 'prd', api: 'production', label: 'PRODUÇÃO' }
];
const ENV_CODES = ENVS.map(e => e.code);
const ENV_TO_API = Object.fromEntries(ENVS.map(e => [e.code, e.api]));
const API_TO_ENV = Object.fromEntries(ENVS.map(e => [e.api, e.code]));
const DEFAULT_ENV = 'prd';
function envLabel(code) { return (ENVS.find(e => e.code === code) || {}).label || ''; }
// Rótulos mono que se repetem: no template entram por {{ }} seguidos do que
// muda em cada um (cor, padding). Terminam em ';' para aceitar a continuação.
const MONO_CONTROL = 'font-family:var(--mono); font-size:12px; letter-spacing:.1em;';   // controles da barra do topo
const MONO_SMALL = 'font-family:var(--mono); font-size:11.5px; letter-spacing:.1em;';   // switches, "Tentar agora"
const MONO_STAT = 'font-family:var(--mono); font-size:11px; letter-spacing:.18em;';     // NO AR / DEGRADADO / FORA do cabeçalho
const MONO_EYEBROW = 'font-family:var(--mono); font-size:11px; letter-spacing:.24em;';  // sobretítulos: FROTA, NOVO LANÇAMENTO, REMOVER
// Relativo: o nginx que serve esta página encaminha /api/ para o container da
// API, então funciona em qualquer host e sem CORS.
const API_BASE = '/api';

// Toda chamada à API aborta após API_TIMEOUT, inclusive POST e DELETE.
function apiSignal() {
  return window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(API_TIMEOUT) : undefined;
}
// Qualquer falha (rede, timeout, 5xx do nginx sem a API) vira exceção: é o
// que acende a tempestade.
// O erro leva o status HTTP e, quando a API manda, a mensagem do corpo
// ({ error }), para o cadastro e a remoção mostrarem o motivo.
async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API_BASE}${path}`, { ...opts, signal: apiSignal() });
  if (!r.ok) {
    let body = null;
    try { body = await r.json(); } catch (e) {}
    const err = new Error((body && body.error) || `HTTP ${r.status}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return r.status === 204 ? null : r.json();
}
function apiErrorMsg(e) {
  if (e && e.name === 'TimeoutError') return 'a API não respondeu a tempo.';
  // 502/503/504 vêm do nginx: a API em si está inacessível.
  if (e && e.status >= 502 && e.status <= 504) return `sem contato com a API (HTTP ${e.status}).`;
  if (e && e.status) return `a API respondeu ${e.status}${e.message && !/^HTTP \d+$/.test(e.message) ? ` (${e.message})` : ''}.`;
  return 'sem contato com a API.';
}
// Validação do cadastro: as mesmas regras de api/src/validation.js, que
// continua sendo a autoridade (um 400 dela também vira erro por campo).
const FIELD_LIMITS = { name: 60, team: 60, url: 2048 };
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
function urlError(v, required) {
  if (!v) return required ? 'Informe a URL.' : '';
  if (v.length > FIELD_LIMITS.url) return `Use no máximo ${FIELD_LIMITS.url} caracteres.`;
  if (CONTROL_CHARS.test(v)) return 'A URL tem caracteres inválidos.';
  // O esquema é obrigatório: sem ele, "qualquer" viraria o host de uma URL válida.
  if (!/^https?:\/\//i.test(v)) return 'A URL deve começar com http:// ou https://';
  let u;
  try { u = new URL(v); } catch (e) { return 'URL inválida.'; }
  if (u.username || u.password) return 'Não inclua usuário ou senha na URL.';
  return '';
}
function textError(v, max, re, format) {
  if (!v) return 'Campo obrigatório.';
  if (v.length < 2 || v.length > max) return `Use de 2 a ${max} caracteres.`;
  if (CONTROL_CHARS.test(v) || !re.test(v)) return format;
  return '';
}
// { value, errors }: value já normalizado (trim), errors
// só com os campos inválidos.
function validateAppForm(f) {
  const value = {
    name: f.name.trim(),
    team: f.team.trim(),
    healthCheckUrl: f.healthCheckUrl.trim(),
    swaggerUrl: f.swaggerUrl.trim()
  };
  const errors = {
    name: textError(value.name, FIELD_LIMITS.name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use letras sem acento, números, ".", "_" ou "-", começando por letra ou número.'),
    team: textError(value.team, FIELD_LIMITS.team, /^[\p{L}\p{N} ._-]+$/u, 'Use letras, números, espaços, ".", "_" ou "-".'),
    healthCheckUrl: urlError(value.healthCheckUrl, true),
    swaggerUrl: urlError(value.swaggerUrl, false)
  };
  Object.keys(errors).forEach(k => { if (!errors[k]) delete errors[k]; });
  return { value, errors };
}
// Só http(s) vira link: protege registros antigos, gravados antes da validação.
function safeHref(v) { return v && /^https?:\/\//i.test(v) ? v : ''; }
function fieldStyle(err, mono) {
  return `padding:11px 13px; border-radius:var(--radius-md); border:1px solid ${err ? 'var(--down)' : 'var(--line)'}; background:var(--field); color:var(--ink); font-size:14px; outline:none${mono ? '; font-family:var(--mono)' : ''}`;
}
// Só d3-selection + d3-timer são carregados; os dois preenchem window.d3.
function d3Ready() { return !!(window.d3 && window.d3.select && window.d3.timer); }
function cloudSvg(scale, fill, shade) {
  return `<svg width="${260 * scale}" height="${104 * scale}" viewBox="0 0 260 104" fill="none">
    <g style="fill:${fill}">
      <ellipse cx="82" cy="66" rx="74" ry="30"/>
      <ellipse cx="104" cy="44" rx="46" ry="34"/>
      <ellipse cx="152" cy="56" rx="52" ry="28"/>
      <ellipse cx="192" cy="68" rx="46" ry="22"/>
    </g>
    <g style="fill:${shade}" opacity=".55">
      <ellipse cx="70" cy="80" rx="58" ry="12"/>
      <ellipse cx="170" cy="80" rx="48" ry="10"/>
    </g>
  </svg>`;
}
// Uma camada de nuvens à deriva dentro de sel (seleção d3), uma div por spec
// ({ top, scale, dur, delay, op }). Devolve as divs para quem chama completar o
// estilo; animation-play-state tem de vir depois, pois o atalho animation o zera.
function appendClouds(sel, specs, fill, shade) {
  return sel.selectAll('div').data(specs).join('div')
    .style('position', 'absolute')
    .style('top', d => d.top + '%')
    .style('left', '0')
    .style('opacity', d => d.op)
    .style('animation', d => `drift ${d.dur}s linear ${d.delay}s infinite`)
    .html(d => cloudSvg(d.scale, fill, shade));
}
function clockLabel(ts) {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString('pt-BR') : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function agoLabel(ts) {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return 'há menos de 1 min';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
}

// Fonte única dos status da API, como ENVS para os ambientes: tone é o prefixo
// das variáveis do THEMES (--up, --up-line, --up-fill), text vai no badge do
// card e chip no chip de filtro e no contador do cabeçalho. A ordem é a da tela.
// A cor sai sempre por variável: no SVG, var() funciona em style (fill, stroke
// e stop-color), não nos atributos de apresentação.
const STATUS_META = {
  healthy: { tone: 'up', text: 'NO AR', chip: 'NO AR' },
  degraded: { tone: 'warn', text: 'DEGRADADO', chip: 'DEGRADADO' },
  unhealthy: { tone: 'down', text: 'FORA DO AR', chip: 'FORA' }
};
// Ainda não checada (status ausente ou desconhecido).
const IDLE_META = { tone: 'idle', text: 'VERIFICANDO' };
const STATUSES = Object.keys(STATUS_META);
// Chips de filtro da lista: [valor de state.filter, rótulo].
const FILTERS = [['all', 'TODAS'], ...STATUSES.map(s => [s, STATUS_META[s].chip])];
function statusMeta(s) { return STATUSES.includes(s) ? STATUS_META[s] : IDLE_META; }
function statusColor(s) { return `var(--${statusMeta(s).tone})`; }
function statusText(s) { return statusMeta(s).text; }
function stopEvent(e) { e.stopPropagation(); }

// Fábricas de estilo: só dependem do argumento, por isso ficam fora da classe.
function envTab(active) {
  return `font-family:var(--mono); font-size:10px; letter-spacing:.14em; padding:7px 12px; border-radius:var(--radius-sm); cursor:pointer; border:1px solid ${active ? 'var(--accent)' : 'transparent'}; background:${active ? 'var(--accent-tint)' : 'transparent'}; color:${active ? 'var(--accent-soft)' : 'var(--muted)'}`;
}
function chip(active) {
  return `font-family:var(--mono); font-size:10.5px; letter-spacing:.14em; padding:6px 11px; border-radius:var(--radius-sm); cursor:pointer; border:1px solid ${active ? 'var(--accent)' : 'var(--line)'}; background:${active ? 'var(--accent-tint)' : 'transparent'}; color:${active ? 'var(--accent-soft)' : 'var(--muted)'}; white-space:nowrap`;
}
function swTrack(on) {
  return `position:relative; width:38px; height:21px; border-radius:11px; flex:none; transition:background .25s ease, border-color .25s ease; border:1px solid ${on ? 'var(--accent)' : 'var(--line)'}; background:${on ? 'var(--accent-tint)' : 'transparent'}`;
}
function swKnob(on) {
  return `position:absolute; top:2px; left:2px; width:15px; height:15px; border-radius:50%; transition:transform .25s cubic-bezier(.3,.8,.3,1), background .25s ease; background:${on ? 'var(--accent)' : 'var(--faint)'}; transform:translateX(${on ? '17px' : '0'})`;
}
function navBtn(enabled) {
  return `width:26px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:var(--radius-sm); font-size:15px; line-height:1; border:1px solid var(--line); background:transparent; color:${enabled ? 'var(--accent-soft)' : 'var(--faint)'}; opacity:${enabled ? 1 : .4}; cursor:${enabled ? 'pointer' : 'default'}`;
}
// Contador do cabeçalho: tone é o de STATUS_META (up, warn, down).
function statCard(tone) {
  return `display:flex; align-items:baseline; gap:8px; padding:8px 14px; border:1px solid var(--${tone}-line); border-radius:var(--radius-md); background:var(--${tone}-fill)`;
}

// O frontend usa os nomes de campo e de status da API; só acrescenta o env
// (código curto) a cada aplicação. Os status ficam em STATUS_META/STATUSES.
function fromApi(doc, apiEnv) {
  return { id: doc.id, env: API_TO_ENV[apiEnv], name: doc.name, team: doc.team, healthCheckUrl: doc.healthCheckUrl, swaggerUrl: doc.swaggerUrl || '' };
}
// localStorage gravado antes da troca de vocabulário (nome/time/health/swagger e
// up/down): convertido na leitura, e regravado no formato novo no próximo save.
const LEGACY_STATUS = { up: 'healthy', down: 'unhealthy' };
// Toda app que entra no estado tem env: quem vem do cache sem ele cai no padrão,
// e daí em diante ninguém precisa de `a.env || DEFAULT_ENV`.
function migrateApp(a) {
  if (!a) return a;
  if (a.name === undefined && a.nome !== undefined) {
    return { id: a.id, env: a.env || DEFAULT_ENV, name: a.nome, team: a.time, healthCheckUrl: a.health, swaggerUrl: a.swagger || '' };
  }
  return a.env ? a : { ...a, env: DEFAULT_ENV };
}
function migrateStatus(map) {
  return Object.fromEntries(Object.entries(map).map(([id, s]) => [id, LEGACY_STATUS[s] || s]).filter(([, s]) => STATUSES.includes(s)));
}
// Tudo o que a montagem lê do localStorage, já convertido. Uma leitura que falha
// (modo privado, JSON corrompido) deixa o resto com os valores padrão.
// notifyAllowed: o alerta salvo só vale se o navegador ainda der permissão.
function readLocalCache(notifyAllowed) {
  const cache = { theme: 'dark', apps: [], status: {}, statusTs: 0, prefs: {} };
  try {
    const theme = localStorage.getItem(TKEY); if (theme === 'light' || theme === 'dark') cache.theme = theme;
    const apps = localStorage.getItem(AKEY); if (apps) cache.apps = (JSON.parse(apps) || []).map(migrateApp);
    const saved = localStorage.getItem(SKEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Formato atual { status, ts }; o antigo era o mapa puro, sem data (conta como antigo).
      if (parsed && parsed.status && typeof parsed.status === 'object') { cache.status = parsed.status; cache.statusTs = parsed.ts || 0; }
      else if (parsed && typeof parsed === 'object') cache.status = parsed;
    }
    if (localStorage.getItem(SNDKEY) === '1') cache.prefs.sound = true;
    if (localStorage.getItem(NKEY) === '1' && notifyAllowed) cache.prefs.notify = true;
    const lastOk = parseInt(localStorage.getItem(LKEY), 10); if (lastOk) cache.prefs.lastOk = lastOk;
  } catch (e) {}
  return cache;
}
// Formulário de cadastro vazio, já no ambiente indicado.
function emptyForm(env) {
  return { name: '', team: '', swaggerUrl: '', healthCheckUrl: '', env };
}
// Corpo JSON de um evento SSE; ilegível vira null e o handler ignora.
function parseEvent(e) {
  try { return JSON.parse(e.data); } catch (err) { return null; }
}
// Só o horário ("14:32:05"): o ícone de relógio e o tooltip dizem o que ele é.
// Antes do primeiro ciclo do ambiente, aguardando.
function cycleLabel(checkedAt) {
  return checkedAt ? new Date(checkedAt).toLocaleTimeString('pt-BR') : 'AGUARDANDO SERVIDOR';
}

const THEMES = {
  dark: {
    '--bg': 'radial-gradient(120% 80% at 50% 0%, var(--color-neutral-800) 0%, var(--color-neutral-900) 45%, var(--color-bg) 100%)',
    '--ink': 'var(--color-text)', '--muted': 'var(--color-neutral-300)', '--faint': 'var(--color-neutral-500)',
    '--line': 'color-mix(in srgb, var(--color-text) 14%, transparent)',
    '--surface': 'color-mix(in srgb, var(--color-text) 5%, transparent)',
    '--panel': 'linear-gradient(180deg, color-mix(in srgb, var(--color-text) 5%, transparent), color-mix(in srgb, var(--color-bg) 50%, transparent))',
    '--dialog': 'var(--color-neutral-900)', '--field': 'var(--color-bg)',
    '--accent': 'var(--color-accent)', '--accent-soft': 'var(--color-accent-200)',
    '--accent-tint': 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
    '--halo': 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
    '--scrim': 'color-mix(in srgb, var(--color-bg) 75%, transparent)',
    '--up': '#6fd39b', '--up-line': 'rgba(111,211,155,.35)', '--up-fill': 'rgba(111,211,155,.08)',
    '--down': '#e8808c', '--down-line': 'rgba(232,128,140,.32)', '--down-fill': 'rgba(232,128,140,.08)',
    '--warn': '#e6b450', '--warn-line': 'rgba(230,180,80,.34)', '--warn-fill': 'rgba(230,180,80,.08)',
    '--fab-bg': 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
    '--fab-glow': '0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent), 0 0 12px color-mix(in srgb, var(--color-accent) 40%, transparent), 0 0 26px color-mix(in srgb, var(--color-accent) 18%, transparent)',
    '--elev-md': 'var(--shadow-md)', '--elev-lg': 'var(--shadow-lg)',
    '--star-opacity': '1', '--cloud-opacity': '0', '--stars-play': 'running', '--clouds-play': 'paused',
    '--storm': '#f0c064', '--storm-line': 'rgba(240,192,100,.4)', '--storm-fill': 'rgba(240,192,100,.09)',
    '--storm-sky': 'linear-gradient(180deg, rgba(8,9,16,.88) 0%, rgba(18,19,30,.7) 50%, rgba(22,24,38,.5) 100%)',
    '--storm-cloud': '#2a2c3e', '--storm-cloud-shade': '#12131c', '--storm-clouds-opacity': '0',
    '--comet-opacity': '1', '--comet-head': '#f6f4ff', '--comet-tail': 'rgba(183,174,232,.75)',
    '--storm-rain': 'rgba(180,190,230,.45)', '--storm-flash': 'rgba(215,220,255,.2)',
    '--stale': '#7a7a92', '--idle': '#6e6e86',
    '--orbit-ring': 'color-mix(in srgb, var(--color-text) 14%, transparent)',
    '--planet-edge': 'rgba(255,255,255,.35)', '--planet-edge-sel': '#ffffff',
    '--planet-shine': 'rgba(255,255,255,.35)', '--planet-label': '#c9c6e0',
    '--sel-line': 'color-mix(in srgb, var(--color-accent) 55%, transparent)',
    '--sel-fill': 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
    '--page-bg': 'var(--color-bg)',
    '--mono': "'JetBrains Mono', monospace"
  },
  light: {
    '--bg': 'linear-gradient(180deg, #bcdcf5 0%, #d6e9f8 40%, #eef4fb 78%, #f6f9fd 100%)',
    '--ink': '#16263a', '--muted': '#4c6480', '--faint': '#7d94ad',
    '--line': 'rgba(22,38,58,.14)', '--surface': 'rgba(255,255,255,.55)',
    '--panel': 'linear-gradient(180deg, rgba(255,255,255,.78), rgba(226,240,251,.55))',
    '--dialog': 'rgba(252,253,255,.98)', '--field': '#ffffff',
    '--accent': '#3d74b8', '--accent-soft': '#255291', '--accent-tint': 'rgba(61,116,184,.12)',
    '--halo': 'rgba(255,205,120,.45)', '--scrim': 'rgba(40,62,88,.34)',
    '--up': '#1c8a58', '--up-line': 'rgba(28,138,88,.34)', '--up-fill': 'rgba(28,138,88,.08)',
    '--down': '#c0384a', '--down-line': 'rgba(192,56,74,.3)', '--down-fill': 'rgba(192,56,74,.07)',
    '--warn': '#9c6400', '--warn-line': 'rgba(156,100,0,.32)', '--warn-fill': 'rgba(156,100,0,.07)',
    '--fab-bg': 'rgba(61,116,184,.14)', '--fab-glow': '0 0 0 1px rgba(61,116,184,.35), 0 0 12px rgba(61,116,184,.3), 0 0 24px rgba(61,116,184,.14)',
    '--elev-md': '0 8px 24px rgba(40,70,105,.16)', '--elev-lg': '0 30px 70px rgba(40,70,105,.24)',
    '--star-opacity': '0', '--cloud-opacity': '1', '--stars-play': 'paused', '--clouds-play': 'running',
    '--storm': '#9a5f00', '--storm-line': 'rgba(154,95,0,.38)', '--storm-fill': 'rgba(255,214,140,.32)',
    '--storm-sky': 'linear-gradient(180deg, rgba(112,124,142,.9) 0%, rgba(160,169,183,.84) 40%, rgba(204,209,217,.8) 100%)',
    '--storm-cloud': '#6c7788', '--storm-cloud-shade': '#4a5463', '--storm-clouds-opacity': '1',
    '--comet-opacity': '0', '--comet-head': '#ffffff', '--comet-tail': 'rgba(255,255,255,.7)',
    '--storm-rain': 'rgba(30,45,70,.4)', '--storm-flash': 'rgba(255,255,255,.55)',
    '--stale': '#8494a8', '--idle': '#7d94ad',
    '--orbit-ring': 'rgba(22,60,100,.22)',
    '--planet-edge': 'rgba(22,38,58,.2)', '--planet-edge-sel': '#255291',
    '--planet-shine': 'rgba(255,255,255,.5)', '--planet-label': '#1c3550',
    '--sel-line': 'rgba(61,116,184,.55)', '--sel-fill': 'rgba(61,116,184,.1)',
    '--page-bg': '#bcdcf5',
    '--mono': "'JetBrains Mono', monospace"
  }
};

// Sob o céu fechado do tema claro, os tons de apoio perdem contraste:
// escurecem enquanto a tempestade durar e voltam aos valores de THEMES depois.
const STORM_OVERRIDES = {
  dark: {},
  light: { '--muted': '#25364b', '--faint': '#3a4d66', '--accent': '#1d4a86', '--accent-soft': '#173d70', '--up': '#0f6b41', '--down': '#9b2233', '--warn': '#7a4d00' }
};

function createComponent(DCLogic) {
  return class Component extends DCLogic {
    state = {
      apps: [], status: {}, formOpen: false, scanning: false, selectedId: null, pendingRemoveId: null, theme: 'dark', query: '', filter: 'all', page: 0, env: DEFAULT_ENV, cycles: {}, teamDropOpen: false,
      notify: false, sound: false, notifyOpen: false, notifyBlocked: false, apiDown: false, lastOk: null,
      staleEnvs: [], submitting: false, formError: '', formErrors: {}, removing: false, removeError: '', d3Failed: false,
      form: emptyForm(DEFAULT_ENV)
    };

    async componentDidMount() {
      // Preferências salvas (prefs) entram no setState abaixo, nunca direto em this.state.
      const { theme, apps, status: cached, statusTs, prefs } = readLocalCache(this.canNotify());
      // O timer e a periodicidade saíram do navegador: limpeza única das chaves antigas.
      try { localStorage.removeItem('orbital-counters-v1'); localStorage.removeItem('orbital-rate-v1'); } catch (e) {}
      // IDs órfãos (aplicação removida em outra aba ou por outra pessoa) saem já na carga.
      const known = new Set(apps.map(a => a.id));
      const status = migrateStatus(Object.fromEntries(Object.entries(cached).filter(([id]) => known.has(id))));
      this.statusTs = statusTs;
      // Status antigo vale por ambiente: cada um sai do "último conhecido" no primeiro snapshot ou ciclo do servidor.
      const staleEnvs = Object.keys(status).length > 0 && Date.now() - statusTs > STATUS_STALE_MS ? ENV_CODES : [];
      this.downSeen = new Set(Object.keys(status).filter(id => status[id] === 'unhealthy'));
      this.onReturn = () => { if (!this.isAway()) this.dismissAlerts(); };
      document.addEventListener('visibilitychange', this.onReturn);
      window.addEventListener('focus', this.onReturn);
      this.setState({ ...prefs, apps, status, theme, staleEnvs }, () => { this.applyTheme(); this.waitForD3(); this.connectEvents(); this.scheduleComet(); this.updateTitle(); });
      if (!(await this.loadApps())) this.markApiDown();
    }

    // GET /applications é a fonte da lista. Roda na carga, quando a tempestade
    // passa e quando o servidor (snapshot, status ou cycle) fala de IDs que a lista
    // não conhece (ou deixa de falar de algum). Chamadas simultâneas dividem a mesma requisição.
    loadApps() {
      if (this.appsReq) return this.appsReq;
      this.appsReq = (async () => {
        try {
          const data = await apiFetch('/applications');
          this.commitApps(Object.entries(data).flatMap(([apiEnv, list]) => list.map(doc => fromApi(doc, apiEnv))));
          return true;
        } catch (e) { return false; }
        finally { this.appsReq = null; }
      })();
      return this.appsReq;
    }
    // Único caminho de uma lista nova para o estado (GET, cadastro, remoção): status
    // e alertas ficam só com IDs que seguem na lista, o cache local é regravado e a
    // seleção / remoção pendente se solta se a app sumiu. `extra` entra no mesmo
    // setState (e pode sobrescrever o calculado); fullRedraw troca o updatePlanets
    // por um redraw (ex.: o ambiente na tela mudou).
    commitApps(apps, extra = {}, fullRedraw = false) {
      const ids = new Set(apps.map(a => a.id));
      const status = Object.fromEntries(Object.entries(this.state.status).filter(([id]) => ids.has(id)));
      [...this.downSeen].forEach(id => { if (!ids.has(id)) this.downSeen.delete(id); });
      try { localStorage.setItem(AKEY, JSON.stringify(apps)); } catch (e) {}
      this.saveStatus(status);
      const { selectedId, pendingRemoveId } = this.state;
      this.setState({
        apps, status,
        selectedId: ids.has(selectedId) ? selectedId : null,
        pendingRemoveId: ids.has(pendingRemoveId) ? pendingRemoveId : null,
        ...extra
      }, () => {
        if (fullRedraw) this.redraw(); else this.updatePlanets();
        this.updateTitle();
      });
    }
    appsIn(env) { return this.state.apps.filter(a => a.env === env); }
    saveStatus(status) {
      try { localStorage.setItem(SKEY, JSON.stringify({ status, ts: this.statusTs || 0 })); } catch (e) {}
    }
    componentWillUnmount() {
      if (this.timer) this.timer.stop();
      if (this.ro) this.ro.disconnect();
      if (this.es) this.es.close();
      clearTimeout(this.esDownTid);
      clearTimeout(this.esRetryTid);
      clearTimeout(this.scanTid);
      clearTimeout(this.alertTid);
      clearTimeout(this.skyTid);
      clearTimeout(this.cometTid);
      clearTimeout(this.resizeTid);
      if (this.onReturn) {
        document.removeEventListener('visibilitychange', this.onReturn);
        window.removeEventListener('focus', this.onReturn);
      }
    }

    // Stream único com os três ambientes. O servidor faz os health checks; aqui só
    // se escuta. O EventSource reconecta sozinho e cada conexão começa por um
    // snapshot, então não há o que repor depois de uma queda. ?changes=true: depois
    // do snapshot só chegam os status que mudaram (o cycle vem sempre); o painel só
    // precisa do campo status.
    connectEvents() {
      clearTimeout(this.esRetryTid);
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
    // Um ciclo do servidor (ou um snapshot que traz o último) data a checagem do
    // ambiente: ele sai do "último conhecido" e o lastOk avança. O ts gravado data o
    // status mais antigo do mapa, então só avança quando nenhum ambiente segue com
    // status da carga — senão um reload o daria por novo. Grava statusTs e o lastOk
    // no localStorage na hora; devolve o pedaço de estado para o setState do evento.
    markEnvChecked(env, checkedAt) {
      const staleEnvs = this.state.staleEnvs.filter(e => e !== env);
      const lastOk = Math.max(this.state.lastOk || 0, checkedAt);
      if (!staleEnvs.length) this.statusTs = lastOk;
      try { localStorage.setItem(LKEY, String(lastOk)); } catch (e) {}
      return { staleEnvs, lastOk };
    }
    // Miolo comum de snapshot, status e cycle. `extra` é o resto do estado que o
    // evento muda (cycles, staleEnvs, lastOk, scanning), gravado no mesmo setState.
    // Receber qualquer coisa do servidor prova que a API voltou: encerra a tempestade.
    applyStatuses(env, results, extra = {}) {
      const { patch, fell, unknown, moved, downSeen } = this.diffStatuses(results);
      this.downSeen = downSeen;
      const cleared = this.state.apiDown;
      if (moved || cleared || Object.keys(extra).length) {
        const nextStatus = { ...this.state.status, ...patch };
        this.saveStatus(nextStatus);
        this.setState({ status: nextStatus, apiDown: false, ...extra }, () => {
          // O céu abrindo muda o núcleo: esqueleto novo. Fora disso, só o
          // ambiente na tela toca a órbita — os outros dois não têm o que redesenhar.
          if (cleared) { this.applySky(); this.redraw(); }
          else if (env === this.state.env) this.updatePlanets();
          this.updateTitle();
        });
      }
      // A lista pode ter mudado enquanto a API estava fora, ou em outra aba.
      if (cleared || unknown) this.loadApps();
      if (fell.length) this.queueAlert(fell);
    }
    // Compara resultados do servidor com o estado, sem alterar nada: patch com os
    // status normalizados, quedas novas (unhealthy ainda fora de downSeen), se algum
    // ID é desconhecido da lista, se algum status mudou, e o downSeen seguinte
    // (cópia: quem aplica decide trocar).
    diffStatuses(results) {
      const known = new Set(this.state.apps.map(a => a.id));
      const downSeen = new Set(this.downSeen);
      const patch = {};
      const fell = [];
      let unknown = false;
      results.forEach(r => {
        // Qualquer valor fora dos conhecidos conta como fora do ar.
        const next = STATUSES.includes(r.status) ? r.status : 'unhealthy';
        patch[r.id] = next;
        if (!known.has(r.id)) unknown = true;
        if (next !== 'unhealthy') { downSeen.delete(r.id); return; }
        if (!downSeen.has(r.id)) { downSeen.add(r.id); fell.push({ id: r.id, name: r.name }); }
      });
      const moved = results.some(r => this.state.status[r.id] !== patch[r.id]);
      return { patch, fell, unknown, moved, downSeen };
    }
    onStatus(data) {
      const env = data && API_TO_ENV[data.env];
      if (!env) return;
      this.applyStatuses(env, [data]);
    }
    onSnapshot(data) {
      const env = data && API_TO_ENV[data.env];
      if (!env || !Array.isArray(data.apps)) return;
      const { cycle } = data;
      const checkedAt = cycle ? Date.parse(cycle.checkedAt) : null;
      const extra = { cycles: { ...this.state.cycles, [env]: checkedAt } };
      if (checkedAt) Object.assign(extra, this.markEnvChecked(env, checkedAt));
      // A conexão voltou: o "Tentar agora" da tempestade cumpriu o papel.
      if (this.state.apiDown && this.state.scanning) { this.endScan(); extra.scanning = false; }
      // App nunca verificada (status null) mantém o status do cache local.
      const listed = new Set(data.apps.map(a => a.id));
      const mine = this.appsIn(env);
      const listStale = listed.size !== mine.length || mine.some(a => !listed.has(a.id));
      this.applyStatuses(env, data.apps.filter(a => a.status !== null), extra);
      if (listStale) this.loadApps();
    }
    // Encerra o controle do "Sincronizando…": o timer de segurança e o ambiente esperado.
    endScan() {
      clearTimeout(this.scanTid);
      this.scanEnv = null;
    }
    onCycle(data) {
      const env = data && API_TO_ENV[data.env];
      if (!env) return;
      const checkedAt = Date.parse(data.checkedAt);
      const extra = {
        cycles: { ...this.state.cycles, [env]: checkedAt },
        ...this.markEnvChecked(env, checkedAt)
      };
      // O fim do ciclo do ambiente sincronizado é o fim do "Sincronizando…", esteja ele na tela ou não.
      if (this.state.scanning && env === this.scanEnv) { this.endScan(); extra.scanning = false; }
      this.applyStatuses(env, [], extra);
      // Número de apps diferente do que o painel conhece: aplicação criada ou removida em outro lugar.
      if (data.checked !== this.appsIn(env).length) this.loadApps();
    }

    // Os status na tela ficam como "último conhecido"; só o céu muda.
    markApiDown() {
      if (this.state.apiDown) return;
      this.setState({ apiDown: true }, () => { this.applySky(); this.redraw(); this.updateTitle(); });
      this.alertApiDown();
    }
    alertApiDown() {
      if (!this.isAway()) return;
      if (this.state.sound) this.beep();
      if (this.state.notify && this.canNotify()) {
        this.showNotif('Tempestade: Orbital perdeu contato com a API', 'Os status do painel ficam desatualizados até a conexão voltar.', 'orbital-api');
      }
    }
    applySky() {
      const el = this.rootEl; if (!el) return;
      const storm = !!this.state.apiDown;
      el.style.setProperty('--calm', storm ? '.15' : '1');
      el.style.setProperty('--storm-on', storm ? '1' : '0');
      const theme = this.state.theme;
      Object.keys(STORM_OVERRIDES[theme]).forEach(k => el.style.setProperty(k, storm ? STORM_OVERRIDES[theme][k] : THEMES[theme][k]));
      // Pausa só depois do fade, senão a chuva congela enquanto o céu abre.
      clearTimeout(this.skyTid);
      if (storm) { el.style.setProperty('--storm-play', 'running'); this.drawStorm(); }
      else this.skyTid = setTimeout(() => el.style.setProperty('--storm-play', 'paused'), STORM_FADE_MS);
    }

    canNotify() { return 'Notification' in window && Notification.permission === 'granted'; }
    isAway() { return document.hidden || !document.hasFocus(); }

    updateTitle() {
      const { apps, status } = this.state;
      if (this.state.apiDown) { document.title = `⛈ API inacessível · ${BASE_TITLE}`; return; }
      const n = apps.filter(a => status[a.id] === 'unhealthy').length;
      document.title = n ? `(${n}) ⚠ ${BASE_TITLE}` : BASE_TITLE;
    }

    // Os 3 ambientes sincronizam em paralelo: agrupa o lote para sair um bipe só.
    queueAlert(hits) {
      this.alertBuf = (this.alertBuf || []).concat(hits);
      clearTimeout(this.alertTid);
      this.alertTid = setTimeout(() => this.flushAlert(), ALERT_BATCH_MS);
    }
    flushAlert() {
      const hits = this.alertBuf || [];
      this.alertBuf = [];
      if (!hits.length || !this.isAway()) return;
      if (this.state.sound) this.beep();
      if (!this.state.notify) return;
      if (!this.canNotify()) {
        // Permissão revogada com a página aberta: desliga o switch em vez de
        // falhar calado, senão o som toca e a notificação nunca aparece.
        try { localStorage.setItem(NKEY, '0'); } catch (e) {}
        this.setState({ notify: false, notifyBlocked: true });
        return;
      }
      hits.forEach(h => this.notifyDown(h));
    }
    notifyDown(hit) {
      const app = this.state.apps.find(a => a.id === hit.id);
      const name = app ? app.name : hit.name;
      if (!name) return;
      const env = app ? envLabel(app.env) : '';
      const body = [app && app.team && `Time: ${app.team}`, env && `Ambiente: ${env}`].filter(Boolean).join('\n');
      // renotify: sem ele, uma notificação de mesma tag substitui a anterior em
      // silêncio — nenhum banner na segunda queda do mesmo app.
      this.showNotif(`${name} saiu de órbita`, body, `orbital-down-${hit.id}`);
    }
    showNotif(title, body, tag) {
      try {
        const n = new Notification(title, { body, tag, renotify: true });
        n.onclick = () => { window.focus(); n.close(); };
        (this.openNotifs = this.openNotifs || []).push(n);
        return n;
      } catch (e) { return null; }
    }
    // Ao voltar, o SO entrega empilhado tudo que retinha com a tela bloqueada.
    // O dashboard já mostra o estado, então o banner antigo só atrapalha.
    dismissAlerts() {
      this.alertBuf = [];
      clearTimeout(this.alertTid);
      (this.openNotifs || []).forEach(n => { try { n.close(); } catch (e) {} });
      this.openNotifs = [];
    }

    ensureAudio() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!this.actx) { try { this.actx = new AC(); } catch (e) { return null; } }
      if (this.actx.state === 'suspended') this.actx.resume();
      return this.actx;
    }
    beep() {
      const ctx = this.ensureAudio();
      if (!ctx) return;
      try {
        const t0 = ctx.currentTime;
        [880, 620].forEach((freq, i) => {
          const at = t0 + i * 0.18;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(at);
          osc.stop(at + 0.18);
        });
      } catch (e) {}
    }

    applyTheme() {
      const el = this.rootEl; if (!el) return;
      const vars = THEMES[this.state.theme];
      Object.keys(vars).forEach(k => el.style.setProperty(k, vars[k]));
      // O body fica fora do rootEl: só enxerga os tokens do :root, não os aliases.
      document.body.style.background = vars['--page-bg'];
      this.applySky();
    }

    waitForD3() {
      if (d3Ready()) { this.drawStars(); this.drawClouds(); this.drawStorm(); this.drawOrbits(); return; }
      if (!this.d3Since) this.d3Since = Date.now();
      // CDN fora ou bloqueado: desiste e avisa no painel, em vez de tentar para sempre.
      if (Date.now() - this.d3Since > D3_TIMEOUT) { this.setState({ d3Failed: true }); return; }
      setTimeout(() => this.waitForD3(), D3_POLL_MS);
    }
    redraw() { if (d3Ready() && this.orbitEl && !this.state.d3Failed) this.drawOrbits(); }
    envApps() { return this.appsIn(this.state.env); }
    // O que a lista e a órbita mostram: o ambiente na tela, pela busca e pelo filtro de status.
    visibleApps() {
      const q = (this.state.query || '').trim().toLowerCase();
      const f = this.state.filter || 'all';
      const st = this.state.status;
      return this.envApps().filter(a => (f === 'all' || st[a.id] === f) && (!q || (a.name + ' ' + a.team).toLowerCase().includes(q)));
    }
    setEnv(env) { this.setState({ env, page: 0, selectedId: null }, () => this.redraw()); }
    select(id, fromOrbit) {
      const next = { selectedId: id };
      // Os planetas saem do mesmo visibleApps() da lista: o clicado está nela, só falta a página.
      if (fromOrbit) {
        const i = this.visibleApps().findIndex(a => a.id === id);
        if (i >= 0) next.page = Math.floor(i / PAGE_SIZE);
      }
      this.setState(next, () => this.updatePlanets());
    }



    drawStars() {
      const el = this.starsEl; if (!el || el.dataset.done) return;
      el.dataset.done = '1';
      const d3 = window.d3;
      const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', '100%').style('display', 'block');
      // 4 grupos com ritmo e fase próprios piscam no lugar de 160 animações, uma
      // por estrela. A opacidade base de cada estrela disfarça que o grupo pisca junto.
      const phases = [{ dur: 4, delay: 0 }, { dur: 5.5, delay: -2.1 }, { dur: 7, delay: -4.6 }, { dur: 8.5, delay: -1.3 }];
      const data = Array.from({ length: 160 }, (_, i) => ({ g: i % phases.length, x: Math.random() * 100, y: Math.random() * 100, r: Math.random() * 1.5 + .4, op: .6 + Math.random() * .4 }));
      svg.selectAll('g').data(phases).join('g')
        .style('animation', d => `twinkle ${d.dur}s ease-in-out ${d.delay}s infinite`)
        // Invisíveis no tema claro: pausadas para não gastar quadro à toa.
        .style('animation-play-state', 'var(--stars-play, running)')
        .selectAll('circle').data((_, gi) => data.filter(d => d.g === gi)).join('circle')
        .attr('cx', d => d.x + '%').attr('cy', d => d.y + '%').attr('r', d => d.r)
        .attr('opacity', d => d.op)
        .attr('fill', d => d.r > 1.4 ? '#cfc9f2' : '#e9e9ed');
    }

    drawClouds() {
      const el = this.cloudsEl; if (!el || el.dataset.done) return;
      el.dataset.done = '1';
      const d3 = window.d3;
      const specs = [
        { top: 6, scale: 1.5, dur: 160, delay: -40, op: .95 },
        { top: 22, scale: .9, dur: 210, delay: -130, op: .75 },
        { top: 44, scale: 1.2, dur: 250, delay: -60, op: .6 },
        { top: 63, scale: .7, dur: 190, delay: -170, op: .5 },
        { top: 78, scale: 1.35, dur: 300, delay: -20, op: .45 }
      ];
      appendClouds(d3.select(el), specs, '#ffffff', '#cfe2f4')
        .style('transform-origin', 'left center')
        .style('animation-play-state', 'var(--clouds-play, running)');
    }

    drawStorm() {
      const el = this.stormEl; if (!el || el.dataset.done || !d3Ready() || !this.state.apiDown) return;
      el.dataset.done = '1';
      const d3 = window.d3;
      const root = d3.select(el);
      const fixed = sel => sel.style('position', 'fixed').style('inset', '0');
      const play = sel => sel.style('animation-play-state', 'var(--storm-play, paused)');
      root.append('div').style('position', 'absolute').style('inset', '0').style('background', 'var(--storm-sky)');
      // Mesmas nuvens do céu claro, só que carregadas e amontoadas no alto.
      const specs = [
        { top: -6, scale: 2.2, dur: 120, delay: -30, op: .95 },
        { top: 2, scale: 1.7, dur: 150, delay: -95, op: .9 },
        { top: -3, scale: 1.9, dur: 135, delay: -70, op: .85 },
        { top: 12, scale: 1.3, dur: 180, delay: -10, op: .7 },
        { top: 26, scale: 1, dur: 210, delay: -150, op: .45 }
      ];
      // No escuro não há nuvens: o céu só escurece, chove e relampeja.
      play(appendClouds(root.append('div').style('opacity', 'var(--storm-clouds-opacity)'), specs, 'var(--storm-cloud)', 'var(--storm-cloud-shade)'));
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      // A chuva cai em 4 camadas, cada uma com sua velocidade, no lugar de 140
      // animações, uma por gota. Cada camada tem 200vh: as gotas da metade de cima
      // se repetem 100vh abaixo, e a camada desce 100vh por ciclo, então o fim do
      // ciclo é idêntico ao começo e o laço não tem emenda.
      const layers = [{ dur: .6, delay: -.2 }, { dur: .75, delay: -.5 }, { dur: .9, delay: -.1 }, { dur: 1.05, delay: -.7 }];
      const drops = Array.from({ length: 140 }, (_, i) => ({ l: i % layers.length, x: Math.random() * 100, y: Math.random() * 100, len: 14 + Math.random() * 18, op: .35 + Math.random() * .65 }));
      play(fixed(root.append('div')).style('transform', 'skewX(-10deg)')
        .selectAll('div').data(layers).join('div')
        .style('position', 'absolute').style('top', '0').style('left', '0').style('width', '100%').style('height', '200vh')
        .style('will-change', 'transform')
        .style('animation', d => `rainLayer ${d.dur}s linear ${d.delay}s infinite`))
        .selectAll('div').data((_, li) => drops.filter(d => d.l === li).flatMap(d => [d, { ...d, y: d.y + 100 }])).join('div')
        .style('position', 'absolute').style('top', d => d.y + 'vh').style('left', d => d.x + '%')
        .style('width', '1px').style('height', d => d.len + 'px').style('opacity', d => d.op)
        .style('background', 'linear-gradient(transparent, var(--storm-rain))');
      play(fixed(root.append('div')).style('background', 'var(--storm-flash)').style('opacity', '0')
        .style('animation', 'lightning 7s linear infinite'));
      // O segundo raio cai no primeiro clarão do ciclo (43%), o outro no segundo (93%).
      const bolts = [{ left: 17, top: 4, size: 64, rot: 8, delay: 0 }, { left: 72, top: 7, size: 46, rot: -6, delay: -3.5 }];
      play(root.append('div').selectAll('div').data(bolts).join('div')
        .style('position', 'fixed').style('left', d => d.left + '%').style('top', d => d.top + '%')
        .style('color', 'var(--storm)').style('opacity', '0')
        .style('transform', d => `rotate(${d.rot}deg)`)
        .style('filter', 'drop-shadow(0 0 14px var(--storm))')
        .style('animation', d => `bolt 7s linear ${d.delay}s infinite`)
        .html(d => `<svg width="${d.size}" height="${d.size}" viewBox="0 0 256 256" fill="currentColor"><path d="${BOLT_PATH}"/></svg>`));
    }

    // Cometa: evento raro do céu escuro, com a API no ar ou não. Sai a cada
    // 20–60 min, e o log no localStorage segura o teto de COMET_MAX por hora
    // mesmo que a página seja recarregada.
    scheduleComet(ms) {
      clearTimeout(this.cometTid);
      const wait = ms ?? COMET_WAIT_MIN + Math.random() * COMET_WAIT_SPREAD;
      this.cometTid = setTimeout(() => this.launchComet(), wait);
    }
    launchComet() {
      const now = Date.now();
      let log = [];
      try { log = (JSON.parse(localStorage.getItem(COMETKEY)) || []).filter(t => now - t < COMET_WINDOW); } catch (e) {}
      if (log.length >= COMET_MAX) {
        // Só volta a tentar depois que o mais antigo sai da janela.
        this.scheduleComet(Math.min(...log) + COMET_WINDOW - now + Math.random() * COMET_RETRY_JITTER);
        return;
      }
      const el = this.cometEl;
      const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Sem plateia (aba escondida, tema claro) não gasta a cota: tenta de novo depois.
      if (!el || !d3Ready() || reduced || this.state.theme !== 'dark' || this.isAway()) { this.scheduleComet(); return; }
      const flip = Math.random() < .5;
      const d = {
        top: 4 + Math.random() * 36,
        rot: flip ? 152 + Math.random() * 20 : 8 + Math.random() * 20,
        len: 100 + Math.random() * 120,
        dur: 2.4 + Math.random() * 1.2
      };
      const lane = window.d3.select(el).append('div')
        .style('position', 'absolute').style('left', '0').style('top', d.top + '%').style('width', '100vw')
        .style('transform', `rotate(${d.rot}deg)`).style('transform-origin', '50% 50%');
      lane.append('div')
        .style('display', 'flex').style('align-items', 'center').style('width', 'max-content').style('opacity', '0')
        .style('animation', `comet ${d.dur}s linear 1 forwards`)
        .on('animationend', () => lane.remove())
        .html(`<div style="width:${d.len}px; height:2px; border-radius:2px; background:linear-gradient(90deg, transparent, var(--comet-tail))"></div>`
          + `<div style="width:5px; height:5px; margin-left:-2px; border-radius:50%; background:var(--comet-head); box-shadow:0 0 8px 2px var(--comet-tail), 0 0 18px 4px var(--comet-tail)"></div>`);
      log.push(now);
      try { localStorage.setItem(COMETKEY, JSON.stringify(log)); } catch (e) {}
      this.scheduleComet();
    }

    drawCore(g, defs, light, storm) {
      if (storm) {
        // A central vira o ícone de tempestade: sem sinal dos planetas.
        g.append('circle').attr('r', 34).style('fill', 'var(--storm-fill)');
        g.append('circle').attr('r', 26).style('fill', 'none').style('stroke', 'var(--storm-line)').attr('stroke-dasharray', '2 4');
        g.append('path').attr('d', CLOUD_BOLT_PATH).attr('transform', 'translate(-17,-19) scale(.133)')
          .style('fill', 'var(--storm)').style('filter', 'drop-shadow(0 0 6px var(--storm-line))')
          .style('animation', 'flicker 4s linear infinite');
        g.append('text').attr('y', 50).attr('text-anchor', 'middle').style('fill', 'var(--storm)')
          .style('font', '500 10px var(--mono)').style('letter-spacing', '.2em').text('SEM SINAL');
        return;
      }
      if (light) {
        const grad = defs.append('radialGradient').attr('id', 'coreSun');
        grad.append('stop').attr('offset', '0%').attr('stop-color', '#fff3d6');
        grad.append('stop').attr('offset', '100%').attr('stop-color', '#f0a83c');
        g.append('circle').attr('r', 34).attr('fill', 'rgba(240,168,60,.14)');
        g.append('g').selectAll('line').data(Array.from({ length: 12 }, (_, i) => i)).join('line')
          .attr('x1', d => Math.cos(d * Math.PI / 6) * 21).attr('y1', d => Math.sin(d * Math.PI / 6) * 21)
          .attr('x2', d => Math.cos(d * Math.PI / 6) * 28).attr('y2', d => Math.sin(d * Math.PI / 6) * 28)
          .attr('stroke', '#e8a53c').attr('stroke-width', 1.6).attr('stroke-linecap', 'round').attr('opacity', .7);
        g.append('circle').attr('r', 17).attr('fill', 'url(#coreSun)').attr('filter', 'url(#oglow)');
        return;
      }
      const grad = defs.append('radialGradient').attr('id', 'coreMoon').attr('cx', '35%').attr('cy', '32%');
      grad.append('stop').attr('offset', '0%').attr('stop-color', '#f4f3fb');
      grad.append('stop').attr('offset', '100%').attr('stop-color', '#b9b6cf');
      g.append('circle').attr('r', 33).attr('fill', 'rgba(199,192,238,.09)');
      g.append('circle').attr('r', 17).attr('fill', 'url(#coreMoon)').attr('filter', 'url(#oglow)');
      const craters = [[-5, -4, 3.2], [4.5, 2.5, 4.2], [-2, 7, 2], [7, -6, 2]];
      g.selectAll('circle.crater').data(craters).join('circle').attr('class', 'crater')
        .attr('cx', d => d[0]).attr('cy', d => d[1]).attr('r', d => d[2])
        .attr('fill', '#9e9ab8').attr('opacity', .45);
    }

    // Esqueleto da órbita: só é refeito quando muda o que ele desenha (tema,
    // tempestade, ambiente, tamanho). Sync, busca e filtro passam por updatePlanets.
    drawOrbits() {
      const el = this.orbitEl; if (!el) return;
      const d3 = window.d3;
      const light = this.state.theme === 'light';
      const storm = this.state.apiDown;
      const W = Math.max(320, el.clientWidth || 860), H = Math.max(280, el.clientHeight || 560);
      d3.select(el).selectAll('svg').remove();
      const svg = d3.select(el).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('display', 'block').style('width', '100%').style('height', '100%');
      const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);

      const defs = svg.append('defs');
      const f = defs.append('filter').attr('id', 'oglow').attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
      f.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'b');
      const m = f.append('feMerge'); m.append('feMergeNode').attr('in', 'b'); m.append('feMergeNode').attr('in', 'SourceGraphic');

      // Brilho dos planetas pré-desenhado: um feGaussianBlur em algo que se move
      // é refeito a cada quadro. O #oglow fica só no núcleo, que é estático.
      [...STATUSES, 'idle'].forEach(k => {
        const gr = defs.append('radialGradient').attr('id', `glow-${k}`);
        gr.append('stop').attr('offset', '35%').style('stop-color', statusColor(k)).attr('stop-opacity', .55);
        gr.append('stop').attr('offset', '100%').style('stop-color', statusColor(k)).attr('stop-opacity', 0);
      });

      const ringsG = g.append('g');
      this.drawCore(g, defs, light, storm);
      const planetsG = g.append('g');
      this.orbit = { W, H, light, storm, ringsG, planetsG };
      this.planetSel = null;
      this.updatePlanets();

      if (!this.t0) this.t0 = Date.now();
      if (!this.timer) this.timer = d3.timer(() => {
        if (!this.planetSel) return;
        const t = (Date.now() - this.t0) / 1000;
        this.planetSel.attr('transform', d => {
          const a = d.phase + t * d.speed;
          return `translate(${Math.cos(a) * d.r},${Math.sin(a) * d.ry})`;
        });
      });
    }

    // Data join: só entram e saem os planetas que mudaram; os demais só são repintados.
    updatePlanets() {
      const o = this.orbit; if (!o) return;
      const { W, H } = o;
      const rMax = Math.min(W / 2 - 46, (H / 2 - 34) / 0.42);
      const nodes = this.visibleApps().map((a, i) => {
        const ring = i % 4;
        const r = rMax * (0.34 + ring * 0.22);
        return { ...a, r, ry: r * 0.42, phase: (i * 2.399) % (Math.PI * 2), speed: 0.32 / (1 + ring * 0.55), size: 9.5 + (ring === 0 ? 2.5 : 0) };
      });

      o.ringsG.selectAll('ellipse').data([...new Set(nodes.map(n => n.r))]).join('ellipse')
        .attr('rx', d => d).attr('ry', d => d * 0.42).attr('fill', 'none')
        .style('stroke', 'var(--orbit-ring)').attr('stroke-dasharray', '3 7');

      this.planetSel = o.planetsG.selectAll('g.planet').data(nodes, d => d.id).join(enter => {
        const node = enter.append('g').attr('class', 'planet').style('cursor', 'pointer')
          .on('click', (e, d) => this.select(d.id, true));
        node.append('circle').attr('class', 'halo');
        node.append('circle').attr('class', 'body');
        node.append('circle').attr('class', 'shine');
        node.append('text').attr('class', 'label').attr('text-anchor', 'middle').style('font', "500 12px 'Inter', sans-serif");
        return node;
      });
      this.paintPlanets();
    }

    // O select() de cada filho propaga o dado atualizado do planeta pelo join.
    paintPlanets() {
      const o = this.orbit, node = this.planetSel; if (!o || !node) return;
      const { light } = o;
      // Status antigo do localStorage (antes do primeiro ciclo do servidor) tem o mesmo visual da tempestade.
      const storm = o.storm || this.state.staleEnvs.includes(this.state.env);
      const st = this.state.status;
      const selId = this.state.selectedId;
      const glow = !light && !storm;
      // Sem contato, a cor seria do último check: fica cinza, apagada e tracejada.
      node.style('opacity', storm ? .55 : null);
      node.select('circle.halo')
        .attr('r', d => d.size + (glow ? 14 : 7))
        .style('fill', d => storm ? 'var(--stale)' : glow ? `url(#glow-${STATUSES.includes(st[d.id]) ? st[d.id] : 'idle'})` : statusColor(st[d.id]))
        .attr('opacity', glow ? 1 : storm ? .08 : .14);
      node.select('circle.body')
        .attr('r', d => d.size)
        .style('fill', d => storm ? 'var(--stale)' : statusColor(st[d.id]))
        .style('stroke', d => selId === d.id ? 'var(--planet-edge-sel)' : 'var(--planet-edge)')
        .attr('stroke-width', d => selId === d.id ? 2.5 : 1)
        .attr('stroke-dasharray', storm ? '2 3' : null);
      node.select('circle.shine')
        .attr('r', d => d.size * .45).attr('cx', d => -d.size * .3).attr('cy', d => -d.size * .3)
        .style('fill', 'var(--planet-shine)');
      node.select('text.label')
        .attr('y', d => d.size + 18).style('fill', 'var(--planet-label)').text(d => d.name);
    }

    // Callbacks de ref criados uma vez só: uma função nova a cada renderVals()
    // faz o React chamar o ref de novo em todo render, e o do rootRef reaplicava
    // o tema inteiro. O tema e a tempestade são reaplicados por quem os muda
    // (toggleTheme, componentDidMount, applySky); aqui só na montagem do elemento.
    rootRef = el => { this.rootEl = el; if (el) this.applyTheme(); };
    starsRef = el => { this.starsEl = el; };
    cloudsRef = el => { this.cloudsEl = el; if (el && d3Ready()) this.drawClouds(); };
    stormRef = el => { this.stormEl = el; if (el) this.drawStorm(); };
    cometRef = el => { this.cometEl = el; };
    orbitRef = el => {
      this.orbitEl = el;
      if (el && !this.ro && window.ResizeObserver) {
        // Arrastar a borda da janela dispara o observer a cada quadro: o esqueleto
        // só é refeito ~100 ms depois do último evento. No meio do arrasto, o
        // viewBox do SVG atual já escala o desenho.
        this.ro = new ResizeObserver(() => {
          clearTimeout(this.resizeTid);
          this.resizeTid = setTimeout(() => {
            const size = `${el.clientWidth}x${el.clientHeight}`;
            if (size === this.orbitSize) return;
            this.orbitSize = size;
            this.redraw();
          }, RESIZE_DEBOUNCE_MS);
        });
        this.ro.observe(el);
      }
    };

    // Pede ao servidor um ciclo agora (202). O resultado chega pelo stream, e o
    // cycle do ambiente encerra o "Sincronizando…" (onCycle).
    checkAll = async () => {
      if (this.state.scanning) return;
      const env = this.state.env;
      // O cycle que encerra o "Sincronizando…" é o deste ambiente, mesmo que a aba mude.
      this.scanEnv = env;
      this.setState({ scanning: true });
      // "Tentar agora" na tempestade: se o navegador desistiu do stream, reabre. Em CONNECTING ele
      // já está tentando sozinho, e reabrir só reiniciaria a tentativa.
      if (!this.es || this.es.readyState === EventSource.CLOSED) this.connectEvents();
      try { await apiFetch(`/applications/${ENV_TO_API[env]}/sync`, { method: 'POST' }); }
      catch (e) { this.endScan(); this.setState({ scanning: false }); this.markApiDown(); return; }
      // O fim chega pelo evento cycle (onCycle); isto só evita ficar preso. Se o cycle chegou
      // antes da resposta do POST, o controle já foi encerrado e não há timer a armar.
      if (this.scanEnv !== env) return;
      clearTimeout(this.scanTid);
      this.scanTid = setTimeout(() => { this.scanEnv = null; this.setState({ scanning: false }); }, SCAN_MAX_MS);
    };

    toggleTheme = () => {
      const theme = this.state.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(TKEY, theme); } catch (e) {}
      this.setState({ theme }, () => { this.applyTheme(); this.redraw(); });
    };

    toggleNotify = async () => {
      if (this.state.notify) {
        try { localStorage.setItem(NKEY, '0'); } catch (e) {}
        this.setState({ notify: false });
        return;
      }
      // Sem contexto seguro (http:// fora de localhost) a API nem existe ou nega sempre.
      if (!window.isSecureContext || !('Notification' in window)) { this.setState({ notifyBlocked: true }); return; }
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm !== 'granted') { this.setState({ notify: false, notifyBlocked: true }); return; }
      try { localStorage.setItem(NKEY, '1'); } catch (e) {}
      // Espelha o bipe de prévia do switch de som: se nada aparecer aqui, o
      // bloqueio é do sistema operacional, não da permissão do site.
      this.setState({ notify: true, notifyBlocked: false }, () => {
        const n = this.showNotif('Alertas ativados', 'É assim que o Orbital avisa quando uma aplicação sai de órbita.', 'orbital-test');
        if (n) setTimeout(() => { try { n.close(); } catch (e) {} }, TEST_NOTIF_MS);
      });
    };

    toggleSound = () => {
      const sound = !this.state.sound;
      try { localStorage.setItem(SNDKEY, sound ? '1' : '0'); } catch (e) {}
      if (sound) this.beep();
      this.setState({ sound });
    };

    // Remoção confirmada no modal: DELETE na API e limpeza local.
    confirmRemove = async () => {
      if (this.removeBusy) return;
      const id = this.state.pendingRemoveId;
      const app = this.state.apps.find(x => x.id === id);
      if (!app) { this.setState({ pendingRemoveId: null, removeError: '' }); return; }
      this.removeBusy = true;
      this.setState({ removing: true, removeError: '' });
      let failure = null;
      try {
        await apiFetch(`/applications/${ENV_TO_API[app.env]}/${id}`, { method: 'DELETE' });
      } catch (e) {
        // 404: já foi removida (outra aba, outra pessoa) — o resultado é o mesmo.
        if (e.status !== 404) failure = e;
      } finally { this.removeBusy = false; }
      if (failure) { this.setState({ removing: false, removeError: `Não foi possível remover: ${apiErrorMsg(failure)}` }); return; }
      this.commitApps(this.state.apps.filter(x => x.id !== id), { removing: false, pendingRemoveId: null });
    };

    // Cadastro: POST na API; a lista só ganha a aplicação com o id devolvido.
    submitForm = async e => {
      e.preventDefault();
      // Duplo clique / Enter repetido: um envio por vez.
      if (this.submitBusy) return;
      const f = this.state.form;
      const { value: payload, errors } = validateAppForm(f);
      if (Object.keys(errors).length) { this.setState({ formErrors: errors, formError: '' }); return; }
      const apiEnv = ENV_TO_API[f.env];
      // Flag de instância: o setState não é síncrono e o segundo clique chegaria antes.
      this.submitBusy = true;
      this.setState({ submitting: true, formError: '', formErrors: {} });
      let created, failure = null;
      try {
        created = await apiFetch(`/applications/${apiEnv}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) { failure = err; }
      finally { this.submitBusy = false; }
      if (failure) {
        // 400 com { fields }: a API recusou campos que passaram aqui; mostra no campo.
        const fields = failure.status === 400 && failure.body && failure.body.fields;
        if (fields && typeof fields === 'object') this.setState({ submitting: false, formErrors: fields, formError: 'A API recusou os dados: revise os campos marcados.' });
        else this.setState({ submitting: false, formError: `Não foi possível cadastrar: ${apiErrorMsg(failure)}` });
        return;
      }
      // Sem id não há como listar (nem remover depois): trata como falha.
      if (!created || !created.id) { this.setState({ submitting: false, formError: 'Não foi possível cadastrar: a API não devolveu o id da aplicação.' }); return; }
      const app = fromApi(created, apiEnv);
      const envChanged = app.env !== this.state.env;
      this.commitApps([...this.state.apps.filter(x => x.id !== app.id), app],
        { submitting: false, formError: '', formErrors: {}, formOpen: false, env: app.env, form: emptyForm(app.env) },
        envChanged);
      // A app nova entra no próximo ciclo do servidor; não há check imediato.
    };

    // O template enxerga um objeto plano só: renderVals junta grupos menores,
    // um por região da tela. Refs e handlers fixos são campos da classe.
    renderVals() {
      return {
        monoControl: MONO_CONTROL, monoSmall: MONO_SMALL, monoStat: MONO_STAT, monoEyebrow: MONO_EYEBROW,
        rootRef: this.rootRef,
        starsRef: this.starsRef,
        cloudsRef: this.cloudsRef,
        stormRef: this.stormRef,
        cometRef: this.cometRef,
        orbitRef: this.orbitRef,
        stop: stopEvent,
        ...this.skyVals(),
        ...this.toolbarVals(),
        ...this.headerVals(),
        ...this.listVals(),
        ...this.removeVals(),
        ...this.formVals()
      };
    }

    // Tempestade, ou status antigo do localStorage no ambiente da tela: aparece como "último conhecido".
    isStale() { return this.state.apiDown || this.state.staleEnvs.includes(this.state.env); }


    // Aviso de tempestade e dica no rodapé da órbita.
    skyVals() {
      const { apiDown, lastOk, d3Failed, scanning } = this.state;
      return {
        apiDown,
        stormMsg: lastOk
          ? `Os status abaixo são da última checagem, às ${clockLabel(lastOk)} (${agoLabel(lastOk)}). Tentando reconectar…`
          : 'Nenhuma checagem foi concluída ainda. Tentando reconectar…',
        retryLabel: scanning ? 'Tentando…' : 'Tentar agora',
        d3Failed,
        orbitHint: this.orbitHint(),
        orbitHintStyle: `position:absolute; left:18px; bottom:14px; font-family:var(--mono); font-size:11px; letter-spacing:.16em; color:${apiDown ? 'var(--storm)' : 'var(--faint)'}`
      };
    }

    // Rodapé da órbita: sem d3 não há órbita; senão, de onde vêm os dados na tela.
    orbitHint() {
      const { d3Failed, apiDown, lastOk } = this.state;
      if (d3Failed) return '';
      if (apiDown) {
        if (!lastOk) return 'SEM CONTATO COM A CENTRAL';
        return `SEM CONTATO COM A CENTRAL · DADOS DE ${new Date(lastOk).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (this.isStale()) {
        const staleTs = this.statusTs;
        return staleTs ? `ÚLTIMO CONHECIDO · DADOS DE ${clockLabel(staleTs)} · SINCRONIZANDO…` : 'ÚLTIMO CONHECIDO · SINCRONIZANDO…';
      }
      return 'CLIQUE EM UM PLANETA PARA DETALHES';
    }

    // Barra do topo: tema, Sincronizar, última/próxima verificação e alertas de queda.
    toolbarVals() {
      const { theme, scanning, notifyOpen, notify, sound, notifyBlocked } = this.state;
      const light = theme === 'light';
      return {
        isLight: light,
        themeLabel: light ? 'LIGHT' : 'DARK',
        trackStyle: swTrack(light),
        knobStyle: swKnob(light),
        toggleTheme: this.toggleTheme,
        scanLabel: scanning ? 'Sincronizando…' : 'Sincronizar',
        checkAll: this.checkAll,
        cycleLabel: cycleLabel(this.state.cycles[this.state.env]),
        notifyOpen,
        toggleNotifyMenu: () => this.setState({ notifyOpen: !this.state.notifyOpen }),
        bellStyle: `display:flex; align-items:center; padding:4px 6px; border:none; background:transparent; cursor:pointer; color:${notify || sound ? 'var(--accent-soft)' : 'var(--muted)'}`,
        notifyOn: notify,
        notifyTrackStyle: swTrack(notify),
        notifyKnobStyle: swKnob(notify),
        toggleNotify: this.toggleNotify,
        soundOn: sound,
        soundTrackStyle: swTrack(sound),
        soundKnobStyle: swKnob(sound),
        toggleSound: this.toggleSound,
        // Sem HTTPS o aviso aparece antes mesmo do clique: nenhuma configuração do site resolve.
        notifyBlocked: notifyBlocked || !window.isSecureContext,
        notifyBlockedMsg: this.notifyBlockedMsg()
      };
    }

    // Por que os alertas não podem ser ligados, da causa mais fundamental à mais comum.
    notifyBlockedMsg() {
      if (!window.isSecureContext) return 'Os alertas exigem HTTPS: o navegador só libera notificações em páginas seguras. Acesse o painel por https://.';
      if (!('Notification' in window)) return 'Este navegador não oferece notificações.';
      return 'Permissão bloqueada no navegador. Libere nas configurações do site.';
    }

    // Cabeçalho: abas de ambiente e contadores de status do ambiente na tela.
    headerVals() {
      const { status, env } = this.state;
      const apps = this.envApps();
      const stale = this.isStale();
      const count = s => apps.filter(a => status[a.id] === s).length;
      return {
        // Argumento só por closure: cada botão leva o próprio onClick.
        envTabs: ENVS.map(({ code, label }) => ({ label, style: envTab(env === code), onClick: () => this.setEnv(code) })),
        // Um contador por status, na ordem e com os rótulos de STATUS_META.
        statCards: STATUSES.map(s => ({ label: STATUS_META[s].chip, count: count(s), color: statusColor(s), style: statCard(STATUS_META[s].tone) })),
        statsTitle: stale ? 'Dados desatualizados' : undefined,
        statsStyle: `display:flex; gap:10px; align-items:center; transition:opacity .6s ease; opacity:${stale ? .45 : 1}`
      };
    }

    // Lista da frota: busca, chips de filtro, paginação e cards.
    listVals() {
      const { status, selectedId, theme, apiDown } = this.state;
      const apps = this.envApps();
      const filter = this.state.filter || 'all';
      const visible = this.visibleApps();
      const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
      const page = Math.min(this.state.page || 0, pages - 1);
      const paged = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      // O que é igual para todos os cards, calculado uma vez por render.
      const ctx = { status, selectedId, apiDown, light: theme === 'light', stale: this.isStale(), staleTs: this.statusTs };
      return {
        totalLabel: `${apps.length} ${apps.length === 1 ? 'APLICAÇÃO' : 'APLICAÇÕES'}`,
        shownLabel: visible.length === apps.length ? '' : `${visible.length} DE ${apps.length}`,
        query: this.state.query || '',
        onQuery: e => this.setState({ query: e.target.value, page: 0 }, () => this.updatePlanets()),
        filterChips: FILTERS.map(([key, label]) => ({ label, style: chip(filter === key), onClick: () => this.setState({ filter: key, page: 0 }, () => this.updatePlanets()) })),
        pageLabel: `${page + 1}/${pages}`,
        prevStyle: navBtn(page > 0),
        nextStyle: navBtn(page < pages - 1),
        prevPage: () => { if (page > 0) this.setState({ page: page - 1 }); },
        nextPage: () => { if (page < pages - 1) this.setState({ page: page + 1 }); },
        isEmpty: visible.length === 0,
        emptyMsg: this.emptyMsg(apps.length, apiDown),
        apps: paged.map(a => this.cardVals(a, ctx))
      };
    }

    // Lista vazia: falha de carga, ambiente sem aplicações ou filtro sem resultado.
    emptyMsg(appCount, apiDown) {
      if (appCount > 0) return 'Nenhuma aplicação corresponde ao filtro.';
      if (apiDown) return 'Não foi possível carregar as aplicações. Tentando reconectar…';
      return 'Nenhuma aplicação em órbita ainda. Use o botão + para lançar a primeira.';
    }

    // Um card da lista: a aplicação mais o que o template precisa para desenhá-lo.
    // Em status antigo (stale) a cor é sempre --stale, e o rótulo ganha "ÚLTIMO:".
    cardVals(a, { status, selectedId, apiDown, light, stale, staleTs }) {
      const s = status[a.id];
      const color = stale ? 'var(--stale)' : statusColor(s);
      const href = safeHref(a.swaggerUrl);
      const selected = selectedId === a.id;
      let statusTitle;
      if (stale && s) statusTitle = staleTs && !apiDown ? `Último status conhecido, de ${clockLabel(staleTs)}` : 'Último status conhecido';
      else if (s === 'degraded') statusTitle = 'Tempo de resposta acima do limite';
      return {
        ...a,
        statusLabel: stale && s ? `ÚLTIMO: ${statusText(s)}` : statusText(s),
        statusTitle,
        dotStyle: `width:11px; height:11px; border-radius:50%; flex:none; background:${color}; box-shadow:0 0 ${light ? 6 : 12}px ${color}`,
        badgeStyle: `font-family:var(--mono); font-size:10px; letter-spacing:.14em; padding:4px 8px; border-radius:var(--radius-sm); color:${color}; background:color-mix(in srgb, ${color} ${stale ? 14 : 12}%, transparent); white-space:nowrap`,
        cardStyle: `position:relative; padding:14px 16px; border-radius:var(--radius-md); cursor:pointer; border:1px solid ${selected ? 'var(--sel-line)' : 'var(--line)'}; background:${selected ? 'var(--sel-fill)' : 'var(--surface)'}`,
        swaggerUrl: href || undefined,
        swaggerStyle: `display:inline-flex; align-items:center; gap:6px; padding:5px 11px; border-radius:var(--radius-sm); text-decoration:none; letter-spacing:.1em; font-size:11px; border:1px solid ${href ? 'var(--accent)' : 'var(--line)'}; color:${href ? 'var(--accent-soft)' : 'var(--faint)'}; ${href ? '' : 'opacity:.45; pointer-events:none;'}`,
        select: () => this.select(a.id),
        remove: e => { e.stopPropagation(); this.setState({ pendingRemoveId: a.id }); }
      };
    }

    // Modal de confirmação de remoção.
    removeVals() {
      const { removing, removeError } = this.state;
      const pending = this.envApps().find(a => a.id === this.state.pendingRemoveId);
      return {
        confirmOpen: !!pending,
        confirmName: pending ? pending.name : '',
        cancelRemove: () => { if (!this.state.removing) this.setState({ pendingRemoveId: null, removeError: '' }); },
        removing,
        hasRemoveError: !!removeError,
        removeError,
        removeLabel: removing ? 'Removendo…' : removeError ? 'Tentar de novo' : 'Remover',
        removeStyle: `flex:1; padding:11px; border-radius:var(--radius-md); border:1px solid var(--down-line); background:var(--down-fill); color:var(--down); font-size:14px; font-weight:500; cursor:${removing ? 'wait' : 'pointer'}; opacity:${removing ? .6 : 1}`,
        confirmRemove: this.confirmRemove
      };
    }

    // Modal de cadastro.
    formVals() {
      const { form, formOpen, submitting, formError, formErrors } = this.state;
      const setF = k => e => this.setFormField(k, e.target.value);
      // Por campo: a mensagem, a flag do sc-if, o estilo do input e aria-invalid.
      // O template lê por caminho: {{ fields.name.err }}, {{ fields.team.style }}…
      const field = (k, mono) => {
        const err = formErrors[k] || '';
        return { err, has: !!err, style: fieldStyle(err, mono), invalid: err ? 'true' : 'false' };
      };
      return {
        formOpen,
        openForm: () => this.setState({ formOpen: true, formError: '', formErrors: {} }),
        closeForm: () => { if (!this.state.submitting) this.setState({ formOpen: false, formError: '', formErrors: {} }); },
        fields: { name: field('name'), team: field('team'), swaggerUrl: field('swaggerUrl', true), healthCheckUrl: field('healthCheckUrl', true) },
        nameMax: FIELD_LIMITS.name, teamMax: FIELD_LIMITS.team, urlMax: FIELD_LIMITS.url,
        fieldErrStyle: 'font-size:12px; line-height:1.4; color:var(--down)',
        submitting,
        hasFormError: !!formError,
        formError,
        submitLabel: submitting ? 'Lançando…' : 'Lançar em órbita',
        submitStyle: `flex:1.4; padding:12px; border-radius:var(--radius-md); border:1px solid var(--accent); background:var(--accent-tint); color:var(--accent-soft); font-size:14px; font-weight:500; cursor:${submitting ? 'wait' : 'pointer'}; opacity:${submitting ? .6 : 1}`,
        formName: form.name, formTeam: form.team, formSwaggerUrl: form.swaggerUrl, formHealthCheckUrl: form.healthCheckUrl,
        onName: setF('name'), onSwaggerUrl: setF('swaggerUrl'), onHealthCheckUrl: setF('healthCheckUrl'),
        formEnvs: ENVS.map(({ code, label }) => ({ label, style: envTab(form.env === code), onClick: () => this.setState({ form: { ...this.state.form, env: code } }) })),
        submit: this.submitForm,
        ...this.teamVals()
      };
    }

    // Campo de time com sugestões tiradas das aplicações já cadastradas.
    teamVals() {
      const tq = (this.state.form.team || '').trim().toLowerCase();
      const allTeams = [...new Set(this.state.apps.map(a => a.team).filter(Boolean))].sort();
      const teamSuggestions = (tq ? allTeams.filter(t => t.toLowerCase().includes(tq)) : allTeams)
        .filter(t => t.toLowerCase() !== tq)
        .map(name => ({ name, select: () => this.setFormField('team', name, { teamDropOpen: false }) }));
      return {
        teamSuggestions,
        teamDropOpen: this.state.teamDropOpen && teamSuggestions.length > 0,
        onTeam: e => this.setFormField('team', e.target.value, { teamDropOpen: true }),
        onTeamFocus: () => this.setState({ teamDropOpen: true }),
        onTeamBlur: () => setTimeout(() => this.setState({ teamDropOpen: false }), TEAM_BLUR_MS)
      };
    }

    // Mudar um campo do cadastro limpa o erro dele: a mensagem só volta no próximo
    // envio. extra vai no mesmo setState (ex.: abrir ou fechar as sugestões de time).
    setFormField(k, value, extra = {}) {
      this.setState({ form: { ...this.state.form, [k]: value }, formErrors: { ...this.state.formErrors, [k]: '' }, ...extra });
    }
  };
}
