import { select } from 'd3-selection';
import { gauss, rng } from '../domain/random';
import './galaxy-keyframes.css';

// Céu da galáxia: uma espiral de dois
// braços num canvas e 34 pontos que cintilam por cima. As sementes são as do
// legado, então o céu é o mesmo a cada carga e em cada tamanho de tela.

/** Cores do céu como "r,g,b": o alfa muda a cada ponto, então o rgba é montado aqui. */
export interface SkyPalette {
  /** Brilho largo atrás da espiral. */
  nebula: string;
  /** As 26 nuvens ao longo dos braços. */
  arm: string;
  /** O bojo do núcleo e o coração dele. */
  core: string;
  heart: string;
  /** Estrela comum e estrela lilás. */
  star: string;
  tint: string;
}

export type SkyColor = keyof SkyPalette;

/** Os valores do legado, para quando o elemento não traz as variáveis. */
export const DEFAULT_SKY_PALETTE: Readonly<SkyPalette> = {
  nebula: '110,96,200',
  arm: '145,132,217',
  core: '233,226,255',
  heart: '255,250,240',
  star: '233,233,237',
  tint: '207,201,242',
};

const PALETTE_KEYS = Object.keys(DEFAULT_SKY_PALETTE) as SkyColor[];

/** O canvas não entende var(): lê --sky-<cor> resolvido pelo getComputedStyle. */
export function skyPalette(el: Element): SkyPalette {
  const style = getComputedStyle(el);
  const palette = { ...DEFAULT_SKY_PALETTE };
  PALETTE_KEYS.forEach((k) => {
    const v = style.getPropertyValue(`--sky-${k}`).trim();
    if (v) palette[k] = v;
  });
  return palette;
}

export type SkyOp =
  | { kind: 'glow'; x: number; y: number; r: number; col: SkyColor; a: number }
  | { kind: 'star'; x: number; y: number; s: number; a: number; tint: boolean };

/**
 * O que se desenha no céu, na ordem e com os sorteios do legado (rng(106)):
 * a ordem das chamadas ao rng é a mesma, então cada ponto cai no mesmo lugar.
 */
export function skyScene(W: number, H: number): SkyOp[] {
  const r = rng(106);
  const ops: SkyOp[] = [];
  const glow = (x: number, y: number, rad: number, col: SkyColor, a: number) => {
    ops.push({ kind: 'glow', x, y, r: rad, col, a });
  };
  const star = (x: number, y: number, s: number, a: number, tint: boolean) => {
    ops.push({ kind: 'star', x, y, s, a, tint });
  };
  // Galáxia espiral de dois braços, inclinada e achatada, no centro da tela.
  const cx = W * 0.5;
  const cy = H * 0.5;
  const R = Math.min(W, H) * 0.46;
  const tilt = -0.35;
  const sq = 0.5;
  const P = (rad: number, ang: number): [number, number] => {
    const x = Math.cos(ang) * rad;
    const y = Math.sin(ang) * rad * sq;
    return [
      cx + x * Math.cos(tilt) - y * Math.sin(tilt),
      cy + x * Math.sin(tilt) + y * Math.cos(tilt),
    ];
  };
  glow(cx, cy, R * 1.1, 'nebula', 0.1);
  for (let i = 0; i < 5200; i++) {
    const arm = i % 2;
    const t = Math.pow(r(), 0.75);
    const ang = arm * Math.PI + t * 3.4 * Math.PI + gauss(r) * (0.18 + 0.25 * (1 - t));
    const [x, y] = P(t * R + gauss(r) * 6, ang);
    star(x, y, r() < 0.06 ? 1.5 : 0.8, (1 - t * 0.75) * (0.25 + r() * 0.5), r() < 0.5);
  }
  for (let i = 0; i < 26; i++) {
    const t = 0.2 + r() * 0.8;
    const ang = (i % 2) * Math.PI + t * 3.4 * Math.PI;
    const [x, y] = P(t * R, ang);
    glow(x, y, 18 + r() * 26, 'arm', 0.12);
  }
  glow(cx, cy, R * 0.28, 'core', 0.35);
  glow(cx, cy, R * 0.1, 'heart', 0.55);
  const n = Math.round((W * H) / 2400);
  for (let i = 0; i < n; i++) {
    star(r() * W, r() * H, r() < 0.05 ? 1.5 : r() < 0.35 ? 1 : 0.7, 0.15 + r() * 0.55, r() < 0.25);
  }
  return ops;
}

/**
 * Desenha a espiral no canvas, no tamanho dele e na resolução do dispositivo
 * (até 2x). O tema não entra: o claro só esconde o canvas (--star-opacity).
 * A limpeza zera o canvas.
 */
export function drawSky(cv: HTMLCanvasElement): () => void {
  const clear = () => {
    cv.width = 0;
    cv.height = 0;
  };
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  const ctx = W && H ? cv.getContext('2d') : null;
  if (!ctx) return clear;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr;
  cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const palette = skyPalette(cv);
  ctx.globalCompositeOperation = 'lighter';
  skyScene(W, H).forEach((op) => {
    if (op.kind === 'star') {
      ctx.fillStyle = `rgba(${op.tint ? palette.tint : palette.star},${String(op.a)})`;
      ctx.fillRect(op.x, op.y, op.s, op.s);
      return;
    }
    const col = palette[op.col];
    const g = ctx.createRadialGradient(op.x, op.y, 0, op.x, op.y, op.r);
    g.addColorStop(0, `rgba(${col},${String(op.a)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(op.x - op.r, op.y - op.r, op.r * 2, op.r * 2);
  });
  ctx.globalCompositeOperation = 'source-over';
  return clear;
}

export interface Twinkle {
  /** Posição em % da camada. */
  x: number;
  y: number;
  /** Diâmetro (px), duração e fase (s) da cintilação. */
  s: number;
  d: number;
  o: number;
}

/** Os 34 pontos que cintilam (rng(99) do legado). */
export function twinkleField(): Twinkle[] {
  const r = rng(99);
  return Array.from({ length: 34 }, () => ({
    x: r() * 100,
    y: r() * 100,
    s: 1.5 + r() * 1.6,
    d: 2.5 + r() * 5,
    o: r() * 6,
  }));
}

/** Põe os pontos em `el`; com movimento reduzido ficam parados a meia luz. A limpeza os remove. */
export function drawTwinkles(el: HTMLElement, still: boolean): () => void {
  const spans = select(el)
    .selectAll('span')
    .data(twinkleField())
    .join('span')
    .style('position', 'absolute')
    .style('left', (d) => `${String(d.x)}%`)
    .style('top', (d) => `${String(d.y)}%`)
    .style('width', (d) => `${String(d.s)}px`)
    .style('height', (d) => `${String(d.s)}px`)
    .style('border-radius', '50%')
    .style('background', 'var(--moon)')
    .style('box-shadow', (d) => `0 0 ${String(d.s * 3)}px var(--comet-tail)`)
    .style('opacity', () => (still ? 0.5 : null))
    .style('animation', (d) =>
      still ? null : `galaxyTwinkle ${String(d.d)}s ease-in-out ${String(-d.o)}s infinite`,
    )
    // Depois do atalho animation, que o zera; pausa atrás de um modal.
    .style('animation-play-state', 'var(--backdrop-play, running)');
  return () => {
    spans.remove();
  };
}
