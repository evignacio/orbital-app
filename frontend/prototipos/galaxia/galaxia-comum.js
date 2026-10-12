// Base comum dos três protótipos da galáxia: temas, órbitas fictícias,
// planeta (mesmo desenho do drawOrbits do app), switch de tema e FAB.
const SVG_NS = 'http://www.w3.org/2000/svg';

const THEMES = {
  dark: {
    '--bg': 'radial-gradient(120% 80% at 50% 0%, var(--color-neutral-800) 0%, var(--color-neutral-900) 45%, var(--color-bg) 100%)',
    '--ink': 'var(--color-text)', '--muted': 'var(--color-neutral-300)', '--faint': 'var(--color-neutral-500)',
    '--line': 'color-mix(in srgb, var(--color-text) 14%, transparent)',
    '--accent': 'var(--color-accent)', '--accent-soft': 'var(--color-accent-200)',
    '--accent-tint': 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
    '--up': '#6fd39b', '--down': '#e8808c', '--warn': '#e6b450', '--idle': '#6e6e86',
    '--fab-bg': 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
    '--fab-glow': '0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent), 0 0 12px color-mix(in srgb, var(--color-accent) 40%, transparent), 0 0 26px color-mix(in srgb, var(--color-accent) 18%, transparent)',
    '--orbit-ring': 'color-mix(in srgb, var(--color-text) 14%, transparent)',
    '--planet-edge': 'rgba(255,255,255,.35)', '--planet-edge-sel': '#ffffff',
    '--planet-shine': 'rgba(255,255,255,.35)', '--planet-label': '#c9c6e0',
    '--sky-opacity': '1', '--sky-play': 'running',
    '--page-bg': 'var(--color-bg)',
    '--mono': "'JetBrains Mono', monospace"
  },
  light: {
    '--bg': 'linear-gradient(180deg, #bcdcf5 0%, #d6e9f8 40%, #eef4fb 78%, #f6f9fd 100%)',
    '--ink': '#16263a', '--muted': '#4c6480', '--faint': '#7d94ad',
    '--line': 'rgba(22,38,58,.14)',
    '--accent': '#3d74b8', '--accent-soft': '#255291', '--accent-tint': 'rgba(61,116,184,.12)',
    '--up': '#1c8a58', '--down': '#c0384a', '--warn': '#9c6400', '--idle': '#7d94ad',
    '--fab-bg': 'rgba(61,116,184,.14)', '--fab-glow': '0 0 0 1px rgba(61,116,184,.35), 0 0 12px rgba(61,116,184,.3), 0 0 24px rgba(61,116,184,.14)',
    '--orbit-ring': 'rgba(22,60,100,.22)',
    '--planet-edge': 'rgba(22,38,58,.2)', '--planet-edge-sel': '#255291',
    '--planet-shine': 'rgba(255,255,255,.5)', '--planet-label': '#1c3550',
    '--sky-opacity': '0', '--sky-play': 'paused',
    '--page-bg': '#bcdcf5',
    '--mono': "'JetBrains Mono', monospace"
  }
};

const STATUS_COLOR = { healthy: 'var(--up)', degraded: 'var(--warn)', unhealthy: 'var(--down)' };
const statusColor = s => STATUS_COLOR[s] || 'var(--idle)';

// Status da órbita = o pior status entre as aplicações dela.
const ORBITS = [
  { id: 'financeiro',   name: 'Financeiro',   apps: 14, status: 'healthy' },
  { id: 'integracoes',  name: 'Integrações',  apps: 22, status: 'degraded' },
  { id: 'pagamentos',   name: 'Pagamentos',   apps: 18, status: 'unhealthy' },
  { id: 'plataforma',   name: 'Plataforma',   apps: 31, status: 'healthy' },
  { id: 'logistica',    name: 'Logística',    apps: 9,  status: 'healthy' },
  { id: 'atendimento',  name: 'Atendimento',  apps: 7,  status: 'healthy' },
  { id: 'dados',        name: 'Dados',        apps: 12, status: 'degraded' },
  { id: 'seguranca',    name: 'Segurança',    apps: 5,  status: 'healthy' },
  { id: 'marketing',    name: 'Marketing',    apps: 4,  status: null },
  { id: 'rh',           name: 'Pessoas',      apps: 6,  status: 'healthy' }
];
// Tamanho do planeta cresce com a raiz do número de aplicações (área ∝ apps).
const planetSize = (apps, k = 1) => (10 + Math.sqrt(apps) * 3.1) * k;

const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (parent) parent.appendChild(el);
  return el;
}

// Gradientes do halo, pré-desenhados (sem feGaussianBlur em algo que se move).
function glowDefs(svg) {
  const defs = svgEl('defs', {}, svg);
  ['healthy', 'degraded', 'unhealthy', 'idle'].forEach(k => {
    const g = svgEl('radialGradient', { id: `glow-${k}` }, defs);
    svgEl('stop', { offset: '35%', style: `stop-color:${statusColor(k)}`, 'stop-opacity': '.55' }, g);
    svgEl('stop', { offset: '100%', style: `stop-color:${statusColor(k)}`, 'stop-opacity': '0' }, g);
  });
  return defs;
}

// Mesmo planeta do app: halo, corpo com borda e brilho no canto superior esquerdo.
function drawPlanet(parent, orbit, size, opts = {}) {
  const g = svgEl('g', { class: 'orbit-node', tabindex: '0', role: 'link', 'aria-label': `Órbita ${orbit.name}, ${orbit.apps} aplicações` }, parent);
  g.style.cursor = 'pointer';
  g.style.outline = 'none';
  const halo = svgEl('circle', { r: size + 14 }, g);
  const body = svgEl('circle', { r: size, 'stroke-width': 1 }, g);
  body.style.fill = statusColor(orbit.status);
  const shine = svgEl('circle', { r: size * .45, cx: -size * .3, cy: -size * .3 }, g);
  shine.style.fill = 'var(--planet-shine)';
  const label = svgEl('text', { y: size + 20, 'text-anchor': 'middle' }, g);
  label.style.font = "500 13px 'Inter', sans-serif";
  label.style.fill = 'var(--planet-label)';
  label.textContent = orbit.name;
  const count = svgEl('text', { y: size + 35, 'text-anchor': 'middle' }, g);
  count.style.cssText = "font-family:var(--mono); font-size:10px; letter-spacing:.14em; fill:var(--faint)";
  count.textContent = `${orbit.apps} APPS`;
  const paint = (light, hover) => {
    const k = orbit.status || 'idle';
    halo.setAttribute('r', size + (light ? 7 : 14) + (hover ? 4 : 0));
    halo.style.fill = light ? statusColor(orbit.status) : `url(#glow-${k})`;
    halo.setAttribute('opacity', light ? (hover ? .22 : .14) : 1);
    body.style.stroke = hover ? 'var(--planet-edge-sel)' : 'var(--planet-edge)';
    body.setAttribute('stroke-width', hover ? 2.5 : 1);
    label.style.fill = hover ? 'var(--ink)' : 'var(--planet-label)';
  };
  let hover = false;
  const on = v => { hover = v; paint(isLight(), hover); opts.onHover && opts.onHover(v); };
  g.addEventListener('mouseenter', () => on(true));
  g.addEventListener('mouseleave', () => on(false));
  g.addEventListener('focus', () => on(true));
  g.addEventListener('blur', () => on(false));
  // Protótipo: a página da órbita ainda não existe.
  const open = () => { location.hash = `orbita/${orbit.id}`; };
  g.addEventListener('click', open);
  g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  g.__paint = () => paint(isLight(), hover);
  paint(isLight(), false);
  return g;
}

// ---- Tema ------------------------------------------------------------------
let theme = 'dark';
try { theme = localStorage.getItem('orbital-theme-v1') === 'light' ? 'light' : 'dark'; } catch (e) {}
const isLight = () => theme === 'light';
const themeListeners = [];
const onTheme = fn => themeListeners.push(fn);

function applyTheme() {
  const vars = THEMES[theme], root = document.documentElement;
  Object.keys(vars).forEach(k => root.style.setProperty(k, vars[k]));
  document.body.style.background = vars['--page-bg'];
  document.querySelectorAll('.orbit-node').forEach(n => n.__paint && n.__paint());
  const t = document.getElementById('themeTrack'), k = document.getElementById('themeKnob'), l = document.getElementById('themeLabel'), b = document.getElementById('themeBtn');
  if (t) {
    const on = isLight();
    t.style.borderColor = on ? 'var(--accent)' : 'var(--line)';
    t.style.background = on ? 'var(--accent-tint)' : 'transparent';
    k.style.background = on ? 'var(--accent)' : 'var(--faint)';
    k.style.transform = `translateX(${on ? 17 : 0}px)`;
    l.textContent = on ? 'LIGHT' : 'DARK';
    b.setAttribute('aria-checked', String(on));
  }
  themeListeners.forEach(fn => fn(isLight()));
}

function toggleTheme() {
  theme = isLight() ? 'dark' : 'light';
  try { localStorage.setItem('orbital-theme-v1', theme); } catch (e) {}
  applyTheme();
}

// Só o switch de tema e o FAB: nada mais na tela.
function mountChrome() {
  document.body.insertAdjacentHTML('beforeend', `
    <button id="themeBtn" title="Alternar tema" role="switch" aria-checked="false" style="position:fixed; top:14px; right:20px; z-index:20; display:flex; align-items:center; gap:8px; padding:4px 6px; border:none; background:transparent; color:var(--ink); cursor:pointer">
      <span id="themeTrack" style="position:relative; width:38px; height:21px; border-radius:11px; flex:none; transition:background .25s ease, border-color .25s ease; border:1px solid var(--line)"><span id="themeKnob" style="position:absolute; top:2px; left:2px; width:15px; height:15px; border-radius:50%; transition:transform .25s cubic-bezier(.3,.8,.3,1), background .25s ease; background:var(--faint)"></span></span>
      <span id="themeLabel" style="font-family:var(--mono); font-size:12px; letter-spacing:.1em; color:var(--muted)">DARK</span>
    </button>
    <button id="fab" title="Adicionar aplicação" style="position:fixed; right:28px; bottom:28px; width:60px; height:60px; border-radius:50%; border:1px solid var(--accent); background:var(--fab-bg); color:var(--accent-soft); font-size:30px; font-weight:400; line-height:1; cursor:pointer; box-shadow:var(--fab-glow); z-index:40">+</button>
  `);
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  const fab = document.getElementById('fab');
  fab.addEventListener('mouseenter', () => { fab.style.background = 'var(--accent-tint)'; });
  fab.addEventListener('mouseleave', () => { fab.style.background = 'var(--fab-bg)'; });
}

// Gerador determinístico: a galáxia é a mesma a cada reload.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Canvas na resolução do dispositivo (máx. 2x, para não pesar em telas 3x).
function hiDpiCanvas(canvas, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// Laço de animação único que para com a aba oculta ou movimento reduzido.
function animate(frame) {
  if (reducedMotion()) { frame(0); return; }
  let raf = 0, t0 = performance.now(), paused = 0, hiddenAt = 0;
  const tick = now => { frame((now - t0 - paused) / 1000); raf = requestAnimationFrame(tick); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); hiddenAt = performance.now(); }
    else { paused += performance.now() - hiddenAt; raf = requestAnimationFrame(tick); }
  });
  raf = requestAnimationFrame(tick);
}

function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }
