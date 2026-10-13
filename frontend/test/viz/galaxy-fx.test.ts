import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTER_MS, VEIL_AT_MS } from '@/viz/galaxy-layout';
import {
  drawSuction,
  enterSuction,
  runFx,
  suctionParticles,
  veilAt,
  type SuctionScene,
} from '@/viz/galaxy-fx';

const target = { x: 100, y: 100 };
const others = [
  { x: 400, y: 300, size: 30, col: '#aaa' },
  { x: 700, y: 500, size: 20, col: '#bbb' },
];
const rocks = [{ x: 50, y: 600, size: 12 }];
const colors = { rock: '#rock', dust: '#dust' };

/** Contexto 2D falso: guarda cada retângulo pintado com a cor e o alfa do momento. */
function fakeCtx() {
  const rects: { x: number; y: number; w: number; h: number; fill: string; alpha: number }[] = [];
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    fillStyle: '',
    clears: 0,
    transform: [] as number[],
    clearRect() {
      ctx.clears++;
      rects.length = 0;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill: ctx.fillStyle, alpha: ctx.globalAlpha });
    },
    setTransform(...m: number[]) {
      ctx.transform = m;
    },
  };
  return { ctx, rects };
}

describe('suctionParticles', () => {
  it('70 partículas por órbita vizinha, 10 por asteroide e 220 de poeira', () => {
    const parts = suctionParticles(target, others, rocks, 1280, 800, colors);
    expect(parts).toHaveLength(70 * 2 + 10 + 220);
    expect(parts.slice(0, 70).every((q) => q.c === '#aaa')).toBe(true);
    expect(parts.slice(70, 140).every((q) => q.c === '#bbb')).toBe(true);
    expect(parts.slice(140, 150).every((q) => q.c === '#rock')).toBe(true);
    expect(parts.slice(150).every((q) => q.c === '#dust')).toBe(true);
  });

  it('é determinística (semente 13) e cada partícula tem ângulo e raio até o alvo', () => {
    const a = suctionParticles(target, others, rocks, 1280, 800, colors);
    const b = suctionParticles(target, others, rocks, 1280, 800, colors);
    expect(a).toEqual(b);
    a.forEach((q) => {
      expect(q.r0).toBeCloseTo(Math.hypot(q.x - target.x, q.y - target.y));
      expect(q.a0).toBeCloseTo(Math.atan2(q.y - target.y, q.x - target.x));
      expect(q.sw).toBeGreaterThanOrEqual(1.6);
      expect(q.sw).toBeLessThan(3);
      expect(q.dl).toBeGreaterThanOrEqual(0);
      expect(q.dl).toBeLessThan(0.5);
    });
  });

  it('a poeira cai dentro da tela e as partículas de uma órbita perto dela', () => {
    const parts = suctionParticles(target, others, [], 1280, 800, colors);
    parts.slice(140).forEach((q) => {
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThan(1280);
      expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.y).toBeLessThan(800);
    });
    parts.slice(0, 70).forEach((q) => {
      expect(Math.hypot(q.x - 400, q.y - 300)).toBeLessThanOrEqual(60);
    });
  });
});

describe('drawSuction', () => {
  const parts = suctionParticles(target, others, rocks, 1280, 800, colors);

  it('no início pinta as partículas e ainda não o véu', () => {
    const { ctx, rects } = fakeCtx();
    drawSuction(ctx, parts, target, 0, 1280, 800, false, 'rgb(1, 2, 3)');
    expect(ctx.clears).toBe(1);
    expect(rects).toHaveLength(parts.length);
    expect(rects.some((r) => r.fill === 'rgb(1, 2, 3)')).toBe(false);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('no fim as próximas já foram sugadas e o véu opaco cobre a tela inteira', () => {
    const { ctx, rects } = fakeCtx();
    drawSuction(ctx, parts, target, 1, 1280, 800, false, 'rgb(1, 2, 3)');
    expect(rects.length).toBeLessThan(parts.length + 1);
    expect(rects.at(-1)).toEqual({ x: 0, y: 0, w: 1280, h: 800, fill: 'rgb(1, 2, 3)', alpha: 1 });
  });

  it('no escuro soma a luz das partículas (lighter); no claro pinta por cima', () => {
    const ops: string[] = [];
    const { ctx } = fakeCtx();
    const spy = { ...ctx, fillRect: () => ops.push(spy.globalCompositeOperation) };
    drawSuction(spy, parts.slice(0, 1), target, 0, 1280, 800, false, 'v');
    drawSuction(spy, parts.slice(0, 1), target, 0, 1280, 800, true, 'v');
    expect(ops).toEqual(['lighter', 'source-over']);
  });

  it('o véu do canvas acende depois de 60% (curva ^1.6)', () => {
    const { ctx, rects } = fakeCtx();
    drawSuction(ctx, parts, target, 0.8, 1280, 800, true, 'veu');
    const veil = rects.at(-1);
    expect(veil?.fill).toBe('veu');
    expect(veil?.alpha).toBeCloseTo(Math.pow(0.5, 1.6));
  });
});

describe('runFx', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'setTimeout',
        'clearTimeout',
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dimensiona o canvas pelo dpr (até 2), anima de 0 a 1 e termina uma vez', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { ctx } = fakeCtx();
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const ps: number[] = [];
    const done = vi.fn();
    runFx(canvas, 300, 200, 900, (_c, p) => ps.push(p), done);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);
    expect(ctx.transform).toEqual([2, 0, 0, 2, 0, 0]);
    vi.advanceTimersByTime(450);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(done).toHaveBeenCalledTimes(1);
    expect(ps.at(-1)).toBe(1);
    expect(ps.every((p, i) => i === 0 || p >= (ps[i - 1] ?? 0))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('a limpeza interrompe os quadros e o fim', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    const done = vi.fn();
    const stop = runFx(canvas, 300, 200, 900, () => undefined, done);
    vi.advanceTimersByTime(300);
    stop();
    vi.advanceTimersByTime(2000);
    expect(done).not.toHaveBeenCalled();
  });

  it('sem contexto 2D ainda cumpre o tempo e termina', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    const done = vi.fn();
    runFx(canvas, 300, 200, 900, () => undefined, done);
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('veilAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('acende o véu depois de `ms` com a transição de `dur`', () => {
    const v = document.createElement('div');
    veilAt(v, 720, 180);
    expect(v.style.transition).toBe('opacity 180ms ease');
    vi.advanceTimersByTime(719);
    expect(v.style.opacity).toBe('');
    vi.advanceTimersByTime(1);
    expect(v.style.opacity).toBe('1');
  });

  it('a limpeza cancela o acender', () => {
    const v = document.createElement('div');
    veilAt(v, 720, 180)();
    vi.advanceTimersByTime(1000);
    expect(v.style.opacity).toBe('');
  });
});

describe('enterSuction', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'setTimeout',
        'clearTimeout',
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function scene(reduced: boolean) {
    const root = document.createElement('div');
    const canvas = document.createElement('canvas');
    const veil = document.createElement('div');
    const fake = fakeCtx();
    const getContext = vi
      .spyOn(canvas, 'getContext')
      .mockReturnValue(fake.ctx as unknown as CanvasRenderingContext2D);
    const s: SuctionScene = {
      root,
      canvas,
      veil,
      target,
      others,
      rocks,
      W: 1280,
      H: 800,
      light: false,
      reduced,
    };
    return { ...s, veil, ctx: fake, getContext };
  }

  it(`suga por ${String(ENTER_MS)}ms, acende o véu em ${String(VEIL_AT_MS)}ms e então termina`, () => {
    const s = scene(false);
    const done = vi.fn();
    enterSuction(s, done);
    vi.advanceTimersByTime(VEIL_AT_MS - 1);
    expect(s.veil.style.opacity).toBe('');
    vi.advanceTimersByTime(1);
    expect(s.veil.style.opacity).toBe('1');
    expect(s.veil.style.transition).toBe('opacity 180ms ease');
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ENTER_MS);
    expect(done).toHaveBeenCalledTimes(1);
    expect(s.ctx.rects.at(-1)).toMatchObject({ x: 0, y: 0, w: 1280, h: 800 });
  });

  it('com movimento reduzido pula a sucção: véu em 120ms e fim em 130ms', () => {
    const s = scene(true);
    const done = vi.fn();
    enterSuction(s, done);
    expect(s.getContext).not.toHaveBeenCalled();
    expect(s.veil.style.transition).toBe('opacity 120ms ease');
    vi.advanceTimersByTime(0);
    expect(s.veil.style.opacity).toBe('1');
    vi.advanceTimersByTime(129);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('a limpeza cancela a animação, o véu e o fim', () => {
    const s = scene(false);
    const done = vi.fn();
    const stop = enterSuction(s, done);
    vi.advanceTimersByTime(100);
    stop();
    vi.advanceTimersByTime(3000);
    expect(done).not.toHaveBeenCalled();
    expect(s.veil.style.opacity).toBe('');
  });
});
