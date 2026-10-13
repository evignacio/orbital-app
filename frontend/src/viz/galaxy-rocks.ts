import { select } from 'd3-selection';
import { timer, type Timer } from 'd3-timer';
import { rng } from '../domain/random';
import { smoothClosedPath } from './galaxy-layout';

// Asteroides à deriva: dá para arremessá-los com o
// ponteiro, e eles colidem. As sementes são as do legado.

/** Um asteroide: posição, velocidade atual e a de cruzeiro (b*), para onde ela volta. */
export interface Rock {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  bvx: number;
  bvy: number;
  rot: number;
  vr: number;
  bvr: number;
  path: string;
  craters: number;
  seed: number;
}

export function rockCount(W: number, H: number): number {
  return Math.round(Math.min(22, 8 + (W * H) / 90000));
}

function rockShape(size: number, rr: () => number): string {
  const n = 7 + Math.floor(rr() * 4);
  return smoothClosedPath(
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const k = size * (0.68 + rr() * 0.42);
      return [Math.cos(a) * k, Math.sin(a) * k * (0.75 + rr() * 0.2)] as const;
    }),
  );
}

/** Os asteroides da tela W×H, com os sorteios do legado (rng(211)) na mesma ordem. */
export function makeRocks(W: number, H: number): Rock[] {
  const r = rng(211);
  return Array.from({ length: rockCount(W, H) }, (_, i) => {
    const big = r() < 0.25;
    const size = big ? 8 + r() * 9 : 2.5 + r() * 5;
    const ang = r() * Math.PI * 2;
    const sp = (big ? 3 : 6) + r() * 8;
    const vx = Math.cos(ang) * sp;
    const vy = Math.sin(ang) * sp;
    const vr = (r() - 0.5) * (big ? 8 : 20);
    const x = r() * W;
    const y = r() * H;
    const rot = r() * 360;
    const path = rockShape(size, rng(900 + i));
    const craters = big ? 2 + Math.floor(r() * 2) : 0;
    return { x, y, size, vx, vy, bvx: vx, bvy: vy, rot, vr, bvr: vr, path, craters, seed: i };
  });
}

/**
 * Arremesso: a velocidade do gesto (dx, dy em `dt` segundos, no mínimo 40 ms)
 * vira a do asteroide, com teto pelo tamanho; um toque (< 6 px) não arremessa.
 */
export function throwVelocity(
  dx: number,
  dy: number,
  dt: number,
  size: number,
): { vx: number; vy: number; vr: number } | null {
  if (Math.hypot(dx, dy) < 6) return null;
  const t = Math.max(0.04, dt);
  let vx = dx / t;
  let vy = dy / t;
  const sp = Math.hypot(vx, vy);
  const cap = 1800 / Math.sqrt(size / 4);
  if (sp > cap) {
    vx *= cap / sp;
    vy *= cap / sp;
  }
  return { vx, vy, vr: (dx >= 0 ? 1 : -1) * Math.min(540, Math.hypot(vx, vy) * 0.6) };
}

/** Um passo de `dt` s: depois de um arremesso a velocidade volta aos poucos à de cruzeiro; quem sai da tela volta pelo outro lado. */
export function stepRocks(rocks: readonly Rock[], dt: number, W: number, H: number): void {
  const k = Math.pow(0.35, dt);
  rocks.forEach((d) => {
    d.vx = d.bvx + (d.vx - d.bvx) * k;
    d.vy = d.bvy + (d.vy - d.bvy) * k;
    d.vr = d.bvr + (d.vr - d.bvr) * k;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.rot += d.vr * dt;
    const m = d.size * 2;
    if (d.x < -m) d.x = W + m;
    else if (d.x > W + m) d.x = -m;
    if (d.y < -m) d.y = H + m;
    else if (d.y > H + m) d.y = -m;
  });
}

/** Colisão elástica entre pares (massa ~ área), com um pouco de giro. */
export function collideRocks(rocks: readonly Rock[]): void {
  rocks.forEach((a, i) => {
    rocks.slice(i + 1).forEach((b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = (a.size + b.size) * 0.82;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) return;
      const dist = Math.sqrt(d2);
      const nx = dx / dist;
      const ny = dy / dist;
      const ma = a.size * a.size;
      const mb = b.size * b.size;
      const overlap = min - dist;
      a.x -= (nx * overlap * mb) / (ma + mb);
      a.y -= (ny * overlap * mb) / (ma + mb);
      b.x += (nx * overlap * ma) / (ma + mb);
      b.y += (ny * overlap * ma) / (ma + mb);
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel >= 0) return;
      const imp = (-(1 + 0.85) * rel) / (1 / ma + 1 / mb);
      a.vx -= (imp / ma) * nx;
      a.vy -= (imp / ma) * ny;
      b.vx += (imp / mb) * nx;
      b.vy += (imp / mb) * ny;
      const tang = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
      a.vr -= (tang * 2 * mb) / (ma + mb);
      b.vr += (tang * 2 * ma) / (ma + mb);
      // A de cruzeiro mantém o módulo e segue a direção nova.
      [a, b].forEach((q) => {
        const bs = Math.hypot(q.bvx, q.bvy);
        const s = Math.hypot(q.vx, q.vy) || 1;
        q.bvx = (q.vx / s) * bs;
        q.bvy = (q.vy / s) * bs;
      });
    });
  });
}

export interface GalaxyRocksDrawing {
  /** Os asteroides, com a posição atual (a sucção parte deles). */
  rocks: () => readonly Rock[];
  /** Para o timer, solta um arremesso pendente e remove o svg. */
  destroy: () => void;
}

const transform = (d: Rock) => `translate(${String(d.x)},${String(d.y)}) rotate(${String(d.rot)})`;

/** Desenha os asteroides no tamanho de `el`; com movimento reduzido ficam parados e sem timer. */
export function drawGalaxyRocks(
  el: HTMLElement,
  { still }: { still: boolean },
): GalaxyRocksDrawing {
  const W = el.clientWidth;
  const H = el.clientHeight;
  const root = select(el);
  root.selectAll('svg').remove();
  if (!W || !H) return { rocks: () => [], destroy: () => undefined };

  const svg = root.append('svg').attr('width', W).attr('height', H).style('display', 'block');
  const gr = svg
    .append('defs')
    .append('radialGradient')
    .attr('id', 'rockg')
    .attr('cx', '32%')
    .attr('cy', '28%')
    .attr('r', '80%');
  gr.append('stop').attr('offset', 0).style('stop-color', 'var(--rock-hi)');
  gr.append('stop').attr('offset', 0.55).style('stop-color', 'var(--rock-mid)');
  gr.append('stop').attr('offset', 1).style('stop-color', 'var(--rock-lo)');

  const rocks = makeRocks(W, H);
  const pending = new Set<(ev: PointerEvent) => void>();
  const g = svg
    .selectAll<SVGGElement, Rock>('g')
    .data(rocks)
    .join('g')
    .style('opacity', 'var(--rock-opacity)')
    .style('pointer-events', 'all')
    .style('cursor', 'grab')
    .style('touch-action', 'none')
    .on('pointerdown', (e: PointerEvent, d) => {
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, t: performance.now() };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointerup', up);
        pending.delete(up);
        const dt = (performance.now() - start.t) / 1000;
        const v = throwVelocity(ev.clientX - start.x, ev.clientY - start.y, dt, d.size);
        if (v) Object.assign(d, v);
      };
      pending.add(up);
      window.addEventListener('pointerup', up);
    });
  // Área de toque maior que a pedra, para os pequenos.
  g.append('circle')
    .attr('r', (d) => Math.max(14, d.size * 1.6))
    .attr('fill', 'transparent');
  g.append('path')
    .attr('d', (d) => d.path)
    .attr('fill', 'url(#rockg)')
    .style('stroke', 'var(--rock-edge)')
    .attr('stroke-width', 0.7);
  g.each(function (d) {
    const rr = rng(500 + d.seed);
    for (let k = 0; k < d.craters; k++) {
      const a = rr() * 6.28;
      const dist = rr() * d.size * 0.45;
      select(this)
        .append('circle')
        .attr('cx', Math.cos(a) * dist)
        .attr('cy', Math.sin(a) * dist)
        .attr('r', d.size * (0.12 + rr() * 0.12))
        .attr('fill', 'rgba(0,0,0,.28)')
        .attr('stroke', 'rgba(255,255,255,.08)')
        .attr('stroke-width', 0.6);
    }
  });

  let tick: Timer | null = null;
  g.attr('transform', transform);
  if (!still) {
    let last = performance.now();
    tick = timer(() => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stepRocks(rocks, dt, W, H);
      g.attr('transform', transform);
      collideRocks(rocks);
    });
  }

  return {
    rocks: () => rocks,
    destroy: () => {
      tick?.stop();
      pending.forEach((up) => {
        window.removeEventListener('pointerup', up);
      });
      pending.clear();
      svg.remove();
    },
  };
}
