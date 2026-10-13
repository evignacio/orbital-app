import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collideRocks,
  drawGalaxyRocks,
  makeRocks,
  rockCount,
  stepRocks,
  throwVelocity,
  type Rock,
} from './galaxy-rocks';

// O timer é o real; só contamos quem foi parado.
const timers = vi.hoisted(() => [] as { stopped: boolean }[]);
vi.mock('d3-timer', async (importOriginal) => {
  const real = await importOriginal<typeof import('d3-timer')>();
  return {
    ...real,
    timer: (cb: (elapsed: number) => void) => {
      const t = real.timer(cb);
      const rec = { stopped: false };
      timers.push(rec);
      return {
        restart: t.restart.bind(t),
        stop: () => {
          rec.stopped = true;
          t.stop();
        },
      };
    },
  };
});

const rock = (over: Partial<Rock>): Rock => ({
  x: 0,
  y: 0,
  size: 4,
  vx: 0,
  vy: 0,
  bvx: 0,
  bvy: 0,
  rot: 0,
  vr: 0,
  bvr: 0,
  path: '',
  craters: 0,
  seed: 0,
  ...over,
});

describe('makeRocks', () => {
  it('quantidade pela área, com teto de 22', () => {
    expect(rockCount(1280, 800)).toBe(19);
    expect(rockCount(400, 300)).toBe(9);
    expect(rockCount(4000, 3000)).toBe(22);
    expect(makeRocks(1280, 800)).toHaveLength(19);
  });

  it('é determinística e sorteia dentro da tela, com a velocidade de cruzeiro igual à inicial', () => {
    const rocks = makeRocks(1280, 800);
    expect(makeRocks(1280, 800)).toEqual(rocks);
    rocks.forEach((r, i) => {
      expect(r.seed).toBe(i);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x).toBeLessThan(1280);
      expect(r.y).toBeLessThan(800);
      expect(r.size).toBeGreaterThanOrEqual(2.5);
      expect(r.size).toBeLessThan(17);
      expect([r.bvx, r.bvy, r.bvr]).toEqual([r.vx, r.vy, r.vr]);
      expect(r.path).toMatch(/^M .* Z$/);
      // Só os grandes (8+) têm crateras.
      if (r.size < 7.5) expect(r.craters).toBe(0);
    });
  });
});

describe('throwVelocity', () => {
  it('um toque (menos de 6 px) não arremessa', () => {
    expect(throwVelocity(3, 4, 0.2, 4)).toBeNull();
  });

  it('a velocidade do gesto vira a do asteroide, com giro para o lado do gesto', () => {
    const v = throwVelocity(100, 0, 0.5, 4);
    expect(v).toEqual({ vx: 200, vy: 0, vr: 120 });
    expect(throwVelocity(-100, 0, 0.5, 4)?.vr).toBe(-120);
  });

  it('o tempo mínimo é 40 ms e a velocidade tem teto pelo tamanho; o giro, 540', () => {
    const v = throwVelocity(300, 400, 0.001, 16);
    if (!v) throw new Error('sem arremesso');
    const cap = 1800 / Math.sqrt(16 / 4);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(cap);
    expect(v.vx / v.vy).toBeCloseTo(300 / 400);
    expect(v.vr).toBe(540);
  });
});

describe('stepRocks', () => {
  it('anda pela velocidade e volta aos poucos à de cruzeiro', () => {
    const r = rock({ x: 100, y: 100, vx: 1000, bvx: 10, vr: 100, bvr: 0 });
    stepRocks([r], 0.05, 800, 600);
    const k = Math.pow(0.35, 0.05);
    expect(r.vx).toBeCloseTo(10 + 990 * k);
    expect(r.x).toBeCloseTo(100 + r.vx * 0.05);
    expect(r.vr).toBeCloseTo(100 * k);
    expect(r.rot).toBeCloseTo(r.vr * 0.05);
  });

  it('dá a volta pelas bordas, com margem do dobro do tamanho', () => {
    const left = rock({ x: -9, size: 4, vx: -100, bvx: -100 });
    const bottom = rock({ y: 609, size: 4, vy: 100, bvy: 100 });
    stepRocks([left, bottom], 0.05, 800, 600);
    expect(left.x).toBe(808);
    expect(bottom.y).toBe(-8);
  });
});

describe('collideRocks', () => {
  it('separa os que se sobrepõem e troca momento, conservando-o', () => {
    const a = rock({ x: 0, y: 0, size: 4, vx: 50, bvx: 20 });
    const b = rock({ x: 4, y: 0, size: 2, vx: -50, bvx: -30 });
    const ma = 16;
    const mb = 4;
    const p0 = ma * a.vx + mb * b.vx;
    collideRocks([a, b]);
    expect(b.x - a.x).toBeCloseTo((4 + 2) * 0.82);
    expect(ma * a.vx + mb * b.vx).toBeCloseTo(p0);
    // Afastando-se depois do choque, e a velocidade de cruzeiro segue a nova direção.
    expect(b.vx - a.vx).toBeGreaterThan(0);
    expect(Math.sign(a.bvx)).toBe(Math.sign(a.vx));
    expect(Math.abs(a.bvx)).toBeCloseTo(20);
    expect(Math.abs(b.bvx)).toBeCloseTo(30);
  });

  it('já se afastando: só desfaz a sobreposição', () => {
    const a = rock({ x: 0, y: 0, size: 4, vx: -10 });
    const b = rock({ x: 4, y: 0, size: 4, vx: 10 });
    collideRocks([a, b]);
    expect(a.vx).toBe(-10);
    expect(b.vx).toBe(10);
    expect(b.x - a.x).toBeCloseTo(8 * 0.82);
  });

  it('longe ou no mesmo ponto: nada muda', () => {
    const a = rock({ x: 0, y: 0, vx: 1 });
    const b = rock({ x: 100, y: 0, vx: -1 });
    const c = rock({ x: 100, y: 0, vx: 3 });
    collideRocks([a, b, c]);
    expect([a.x, b.x, c.x, a.vx, b.vx, c.vx]).toEqual([0, 100, 100, 1, -1, 3]);
  });
});

function sized(W = 1280, H = 800): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: W });
  Object.defineProperty(el, 'clientHeight', { value: H });
  document.body.append(el);
  return el;
}

describe('drawGalaxyRocks', () => {
  let el: HTMLElement;
  beforeEach(() => {
    el = sized();
    timers.length = 0;
  });
  afterEach(() => {
    el.remove();
    vi.restoreAllMocks();
  });

  it('um grupo arremessável por asteroide, com o gradiente e o contorno do tema', () => {
    const drawing = drawGalaxyRocks(el, { still: true });
    const groups = el.querySelectorAll<SVGGElement>('svg > g');
    expect(groups).toHaveLength(19);
    expect(el.querySelector('radialGradient#rockg')).not.toBeNull();
    const g = groups[0];
    expect(g?.style.opacity).toBe('var(--rock-opacity)');
    expect(g?.style.pointerEvents).toBe('all');
    expect(g?.style.cursor).toBe('grab');
    expect(g?.querySelector('path')?.style.stroke).toBe('var(--rock-edge)');
    expect(drawing.rocks()).toHaveLength(19);
    drawing.destroy();
  });

  it('movimento reduzido: parados na posição inicial, sem timer', () => {
    const drawing = drawGalaxyRocks(el, { still: true });
    const [first] = drawing.rocks();
    const g = el.querySelector('svg > g');
    expect(g?.getAttribute('transform')).toBe(
      `translate(${String(first?.x)},${String(first?.y)}) rotate(${String(makeRocks(1280, 800)[0]?.rot)})`,
    );
    expect(timers).toHaveLength(0);
  });

  it('sem tamanho não desenha', () => {
    const empty = sized(0, 0);
    const drawing = drawGalaxyRocks(empty, { still: false });
    expect(empty.querySelector('svg')).toBeNull();
    expect(drawing.rocks()).toEqual([]);
    expect(timers).toHaveLength(0);
    drawing.destroy();
    empty.remove();
  });

  it('arremesso com o ponteiro muda a velocidade do asteroide', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const drawing = drawGalaxyRocks(el, { still: true });
    const g = el.querySelector('svg > g');
    g?.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    now.mockReturnValue(1500);
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 110, clientY: 10 }));
    const [first] = drawing.rocks();
    expect(first?.vx).toBe(200);
    expect(first?.vy).toBe(0);
    expect(first?.vr).toBe(120);
  });

  it('destroy para o timer, remove o svg e o arremesso pendente', () => {
    const drawing = drawGalaxyRocks(el, { still: false });
    expect(timers).toEqual([{ stopped: false }]);
    const g = el.querySelector('svg > g');
    g?.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    const first = drawing.rocks()[0];
    if (!first) throw new Error('sem asteroide');
    const vx = first.vx;
    const remove = vi.spyOn(window, 'removeEventListener');
    drawing.destroy();
    expect(timers).toEqual([{ stopped: true }]);
    expect(el.querySelector('svg')).toBeNull();
    expect(remove).toHaveBeenCalledWith('pointerup', expect.any(Function));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 500, clientY: 0 }));
    expect(first.vx).toBe(vx);
  });
});
