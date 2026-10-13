import { rng } from '@/domain/random';
import { clamp01, easeCubicIn, ENTER_MS, VEIL_AT_MS } from './galaxy-layout';

// Entrar numa órbita (legacy/galaxy.js enter/runFx/veilAt): a galáxia é sugada
// para o planeta clicado, a tela escurece e quem chamou navega no fim.

export interface FxPoint {
  x: number;
  y: number;
}

/** Outra órbita da galáxia: posição atual, tamanho e cor. */
export interface FxOrbit extends FxPoint {
  size: number;
  col: string;
}

export interface FxRock extends FxPoint {
  size: number;
}

/** Uma partícula: ponto de partida, cor, lado, e o caminho em espiral até o alvo. */
export interface FxParticle extends FxPoint {
  c: string;
  s: number;
  /** Ângulo e distância iniciais em relação ao alvo. */
  a0: number;
  r0: number;
  /** Atraso (fração da animação): as de longe partem depois. */
  dl: number;
  /** Quanto a partícula gira (rad) até chegar. */
  sw: number;
}

/** O pedaço do contexto 2D que a sucção usa (o teste passa um falso). */
export type FxContext = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'fillRect' | 'globalAlpha' | 'globalCompositeOperation' | 'fillStyle'
>;

/**
 * As partículas, na ordem e com a semente do legado: 70 por órbita vizinha
 * (num disco de raio 2×size), 10 por asteroide e 220 de poeira pela tela.
 */
export function suctionParticles(
  target: FxPoint,
  others: readonly FxOrbit[],
  rocks: readonly FxRock[],
  W: number,
  H: number,
  colors: { rock: string; dust: string },
): FxParticle[] {
  const r = rng(13);
  const pts: { x: number; y: number; c: string; s: number }[] = [];
  others.forEach((o) => {
    for (let i = 0; i < 70; i++) {
      const a = r() * 6.283;
      const rad = Math.sqrt(r()) * o.size * 2;
      pts.push({
        x: o.x + Math.cos(a) * rad,
        y: o.y + Math.sin(a) * rad,
        c: o.col,
        s: 0.8 + r() * 1.8,
      });
    }
  });
  rocks.forEach((k) => {
    for (let i = 0; i < 10; i++) {
      const x = k.x + (r() - 0.5) * k.size * 2;
      const y = k.y + (r() - 0.5) * k.size * 2;
      pts.push({ x, y, c: colors.rock, s: 0.7 + r() * 1.3 });
    }
  });
  for (let i = 0; i < 220; i++)
    pts.push({ x: r() * W, y: r() * H, c: colors.dust, s: 0.5 + r() * 0.9 });
  const diag = Math.hypot(W, H);
  return pts.map((q) => {
    const r0 = Math.hypot(q.x - target.x, q.y - target.y);
    return {
      ...q,
      a0: Math.atan2(q.y - target.y, q.x - target.x),
      r0,
      dl: r() * 0.3 + (r0 / diag) * 0.2,
      sw: 1.6 + r() * 1.4,
    };
  });
}

/** Um quadro em `p` (0–1): as partículas em espiral até o alvo e, depois de 60%, o véu. */
export function drawSuction(
  ctx: FxContext,
  parts: readonly FxParticle[],
  target: FxPoint,
  p: number,
  W: number,
  H: number,
  light: boolean,
  veil: string,
): void {
  ctx.clearRect(0, 0, W, H);
  // No escuro as partículas somam luz; no claro isso as apagaria contra o fundo.
  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  parts.forEach((q) => {
    const e = easeCubicIn(clamp01((p - q.dl) / 0.62));
    if (e >= 1) return;
    const rad = q.r0 * (1 - e);
    const ang = q.a0 + e * q.sw;
    const s = q.s * (1 - e * 0.5);
    ctx.globalAlpha = 1 - e * 0.6;
    ctx.fillStyle = q.c;
    ctx.fillRect(
      target.x + Math.cos(ang) * rad - s / 2,
      target.y + Math.sin(ang) * rad - s / 2,
      s,
      s,
    );
  });
  ctx.globalAlpha = Math.pow(clamp01((p - 0.6) / 0.4), 1.6);
  ctx.globalCompositeOperation = 'source-over';
  if (ctx.globalAlpha > 0) {
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;
}

/**
 * Anima `frame` por `dur` ms no canvas (W×H em CSS px, nitidez até dpr 2) e
 * chama `done` no fim. Sem contexto 2D o tempo corre igual. Devolve o cancelar.
 */
export function runFx(
  canvas: HTMLCanvasElement,
  W: number,
  H: number,
  dur: number,
  frame: (ctx: FxContext, p: number) => void,
  done: () => void,
): () => void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t0 = performance.now();
  let raf = 0;
  const loop = () => {
    const p = Math.min(1, (performance.now() - t0) / dur);
    if (ctx) frame(ctx, p);
    if (p < 1) raf = requestAnimationFrame(loop);
    else done();
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
  };
}

/** Acende o véu (opacity 1) depois de `ms`, numa transição de `dur` ms. Devolve o cancelar. */
export function veilAt(veil: HTMLElement, ms: number, dur: number): () => void {
  veil.style.transition = `opacity ${String(dur)}ms ease`;
  const id = setTimeout(() => {
    veil.style.opacity = '1';
  }, ms);
  return () => {
    clearTimeout(id);
  };
}

export interface SuctionScene {
  /** Raiz da página: de onde saem as cores resolvidas. */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  veil: HTMLElement | null;
  /** Órbita clicada (posição atual) e as demais. */
  target: FxPoint;
  others: readonly FxOrbit[];
  rocks: readonly FxRock[];
  W: number;
  H: number;
  light: boolean;
  /** Movimento reduzido: sem sucção, só o véu rápido. */
  reduced: boolean;
}

/** A saída inteira: sucção de ENTER_MS com o véu em VEIL_AT_MS e `done` no fim. Devolve o cancelar. */
export function enterSuction(scene: SuctionScene, done: () => void): () => void {
  const { root, canvas, veil, target, W, H, light } = scene;
  const stops: (() => void)[] = [];
  const cancel = () => {
    stops.forEach((stop) => {
      stop();
    });
  };
  if (scene.reduced) {
    if (veil) stops.push(veilAt(veil, 0, 120));
    const id = setTimeout(done, 130);
    stops.push(() => {
      clearTimeout(id);
    });
    return cancel;
  }
  // O canvas não entende var(): as cores saem já resolvidas pelo navegador
  // (color do root = --ink, fundo do véu = --veil; --rock-mid e --faint são hex nos dois temas).
  const style = getComputedStyle(root);
  const rock = style.getPropertyValue('--rock-mid').trim();
  const dust = light ? style.getPropertyValue('--faint').trim() : style.color;
  const parts = suctionParticles(target, scene.others, scene.rocks, W, H, { rock, dust });
  const veilColor = veil ? getComputedStyle(veil).backgroundColor : style.backgroundColor;
  stops.push(
    runFx(
      canvas,
      W,
      H,
      ENTER_MS,
      (ctx, p) => {
        drawSuction(ctx, parts, target, p, W, H, light, veilColor);
      },
      done,
    ),
  );
  if (veil) stops.push(veilAt(veil, VEIL_AT_MS, 180));
  return cancel;
}
