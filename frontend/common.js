// Constantes e helpers compartilhados pelas duas páginas (galáxia em index.html,
// painel em painel.html). Script comum, carregado logo depois do support.js e
// antes do script da página.
const TKEY = 'orbital-theme-v1';
const AKEY = 'orbital-apps-v1';
const SKEY = 'orbital-status-v1';
const NKEY = 'orbital-notify-v1';
const SNDKEY = 'orbital-sound-v1';
const LKEY = 'orbital-lastok-v1';
const COMETKEY = 'orbital-comet-v1';
const EKEY = 'orbital-env-v1';
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
// Só d3-selection + d3-timer são carregados; os dois preenchem window.d3.
function d3Ready() { return !!(window.d3 && window.d3.select && window.d3.timer); }
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
function swTrack(on) {
  return `position:relative; width:38px; height:21px; border-radius:11px; flex:none; transition:background .25s ease, border-color .25s ease; border:1px solid ${on ? 'var(--accent)' : 'var(--line)'}; background:${on ? 'var(--accent-tint)' : 'transparent'}`;
}
function swKnob(on) {
  return `position:absolute; top:2px; left:2px; width:15px; height:15px; border-radius:50%; transition:transform .25s cubic-bezier(.3,.8,.3,1), background .25s ease; background:${on ? 'var(--accent)' : 'var(--faint)'}; transform:translateX(${on ? '17px' : '0'})`;
}

// O frontend usa os nomes de campo e de status da API; só acrescenta o env
// (código curto) a cada aplicação. Os status ficam em STATUS_META/STATUSES.
function fromApi(doc, apiEnv) {
  return { id: doc.id, env: API_TO_ENV[apiEnv], name: doc.name, team: doc.team, healthCheckUrl: doc.healthCheckUrl, swaggerUrl: doc.swaggerUrl || '', orbits: orbitList(doc.orbits) };
}
// Órbitas: agrupamentos derivados das apps (cada uma traz `orbits`, uma lista de
// nomes). A identidade é a chave sem acento, minúscula e com "-" no lugar dos
// espaços — a mesma de api/src/validators/application.validator.js — e é ela que
// vai em painel.html?orbita=. Só strings entram; o que vier de fora vira [].
function orbitKey(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '-');
}
function orbitList(v) { return Array.isArray(v) ? v.filter(o => typeof o === 'string' && o.trim()) : []; }
function inOrbit(app, key) { return app.orbits.some(o => orbitKey(o) === key); }
// Todas as órbitas das apps, uma por chave, com a primeira grafia vista como nome
// e na ordem alfabética da chave (não depende da ordem em que o Mongo devolve).
function collectOrbits(apps) {
  const byKey = new Map();
  apps.forEach(a => a.orbits.forEach(name => {
    const key = orbitKey(name);
    if (key && !byKey.has(key)) byKey.set(key, { key, name: name.trim() });
  }));
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}
// Cores das órbitas só em tons frios (ciano → azul → violeta → orquídea): verde,
// âmbar, vermelho e cinza ficam com os status (--up, --warn, --down, --stale).
const ORBIT_COLORS = {
  dark: ['#9184d9', '#62c6e6', '#df8fe0', '#79b4ec', '#c9a6f0', '#6f86e8', '#a8c8f5', '#b07fd6'],
  light: ['#5b4fb0', '#1d7a99', '#9a3f9a', '#2f6aa8', '#7a4fb0', '#3f55b8', '#4f74a8', '#6a3fa0']
};
// FNV-1a: semente estável a partir de um texto (posição e inclinação de cada órbita).
function hashId(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// As órbitas na ordem em que nasceram, cada uma com suas apps: o id do Mongo
// cresce com o tempo, e a órbita conta a partir da app mais antiga dela. Uma
// órbita nova entra no fim, então nem a cor nem a posição das outras mudam.
function orbitsByBirth(apps) {
  const byKey = new Map();
  [...apps].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).forEach(a => a.orbits.forEach(name => {
    const key = orbitKey(name);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, { key, name: name.trim(), apps: [] });
    byKey.get(key).apps.push(a);
  }));
  return [...byKey.values()];
}
// Cor de cada órbita pela ordem de nascimento (as 8 primeiras nunca repetem).
// A função devolvida, para uma chave que ainda não existe, dá a cor que ela vai ganhar.
function orbitColors(apps, theme) {
  const pal = ORBIT_COLORS[theme];
  const map = new Map(orbitsByBirth(apps).map((o, i) => [o.key, pal[i % pal.length]]));
  return key => map.get(key) || pal[map.size % pal.length];
}
// Núcleo de uma órbita: lua no tema escuro, sol no claro, com raio de 17 (e halo
// até ~34). sel é uma seleção d3 (um ou vários <g>, o painel usa um e a galáxia
// um por órbita); glowId é o filtro de brilho já definido no SVG. Os gradientes
// entram no defs uma vez só.
function appendOrbitCore(sel, defs, light, glowId) {
  if (light) {
    if (defs.select('#coreSun').empty()) {
      const grad = defs.append('radialGradient').attr('id', 'coreSun');
      grad.append('stop').attr('offset', '0%').attr('stop-color', '#fff3d6');
      grad.append('stop').attr('offset', '100%').attr('stop-color', '#f0a83c');
    }
    sel.append('circle').attr('r', 34).attr('fill', 'rgba(240,168,60,.14)');
    sel.append('g').selectAll('line').data(Array.from({ length: 12 }, (_, i) => i)).join('line')
      .attr('x1', d => Math.cos(d * Math.PI / 6) * 21).attr('y1', d => Math.sin(d * Math.PI / 6) * 21)
      .attr('x2', d => Math.cos(d * Math.PI / 6) * 28).attr('y2', d => Math.sin(d * Math.PI / 6) * 28)
      .attr('stroke', '#e8a53c').attr('stroke-width', 1.6).attr('stroke-linecap', 'round').attr('opacity', .7);
    sel.append('circle').attr('r', 17).attr('fill', 'url(#coreSun)').attr('filter', `url(#${glowId})`);
    return;
  }
  if (defs.select('#coreMoon').empty()) {
    const grad = defs.append('radialGradient').attr('id', 'coreMoon').attr('cx', '35%').attr('cy', '32%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#f4f3fb');
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#b9b6cf');
  }
  sel.append('circle').attr('r', 33).attr('fill', 'rgba(199,192,238,.09)');
  sel.append('circle').attr('r', 17).attr('fill', 'url(#coreMoon)').attr('filter', `url(#${glowId})`);
  const craters = [[-5, -4, 3.2], [4.5, 2.5, 4.2], [-2, 7, 2], [7, -6, 2]];
  sel.selectAll('circle.crater').data(craters).join('circle').attr('class', 'crater')
    .attr('cx', d => d[0]).attr('cy', d => d[1]).attr('r', d => d[2])
    .attr('fill', '#9e9ab8').attr('opacity', .45);
}
// Gerador pseudoaleatório com semente (mulberry32): o mesmo desenho a cada carga.
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function reducedMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

// localStorage gravado antes da troca de vocabulário (nome/time/health/swagger e
// up/down): convertido na leitura, e regravado no formato novo no próximo save.
const LEGACY_STATUS = { up: 'healthy', down: 'unhealthy' };
// Toda app que entra no estado tem env e orbits: quem vem do cache sem eles cai
// no padrão, e daí em diante ninguém precisa de `a.env || DEFAULT_ENV`.
function migrateApp(a) {
  if (!a) return a;
  if (a.name === undefined && a.nome !== undefined) {
    return { id: a.id, env: a.env || DEFAULT_ENV, name: a.nome, team: a.time, healthCheckUrl: a.health, swaggerUrl: a.swagger || '', orbits: [] };
  }
  return { ...a, env: a.env || DEFAULT_ENV, orbits: orbitList(a.orbits) };
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
// Corpo JSON de um evento SSE; ilegível vira null e o handler ignora.
function parseEvent(e) {
  try { return JSON.parse(e.data); } catch (err) { return null; }
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
    '--page-bg': 'var(--color-bg)', '--veil': 'var(--color-bg)',
    '--rock-hi': '#8a87a6', '--rock-mid': '#4d4a66', '--rock-lo': '#22212f', '--rock-edge': 'rgba(207,201,242,.28)', '--rock-opacity': '.9',
    '--moon': '#f1efff',
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
    '--page-bg': '#bcdcf5', '--veil': '#e4eff9',
    '--rock-hi': '#a9b7c8', '--rock-mid': '#7e8fa4', '--rock-lo': '#56677d', '--rock-edge': 'rgba(22,38,58,.25)', '--rock-opacity': '.55',
    '--moon': '#ffffff',
    '--mono': "'JetBrains Mono', monospace"
  }
};

// Sob o céu fechado do tema claro, os tons de apoio perdem contraste:
// escurecem enquanto a tempestade durar e voltam aos valores de THEMES depois.
const STORM_OVERRIDES = {
  dark: {},
  light: { '--muted': '#25364b', '--faint': '#3a4d66', '--accent': '#1d4a86', '--accent-soft': '#173d70', '--up': '#0f6b41', '--down': '#9b2233', '--warn': '#7a4d00' }
};
