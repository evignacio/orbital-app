import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SKY_PALETTE,
  drawSky,
  drawTwinkles,
  skyPalette,
  skyScene,
  twinkleField,
  type SkyOp,
} from '@/viz/galaxy-sky';

const stars = (ops: readonly SkyOp[]) => ops.filter((o) => o.kind === 'star');
const glows = (ops: readonly SkyOp[]) => ops.filter((o) => o.kind === 'glow');

describe('skyScene', () => {
  it('é determinística: a mesma espiral a cada carga', () => {
    expect(skyScene(1280, 800)).toEqual(skyScene(1280, 800));
  });

  it('5200 estrelas nos braços mais o campo proporcional à área, e 29 brilhos', () => {
    const ops = skyScene(1280, 800);
    expect(stars(ops)).toHaveLength(5200 + Math.round((1280 * 800) / 2400));
    expect(glows(ops)).toHaveLength(1 + 26 + 2);
  });

  it('nebulosa no centro antes de tudo e o coração brilhante por último entre os brilhos', () => {
    const ops = skyScene(1000, 600);
    const R = Math.min(1000, 600) * 0.46;
    expect(ops[0]).toEqual({ kind: 'glow', x: 500, y: 300, r: R * 1.1, col: 'nebula', a: 0.1 });
    const g = glows(ops);
    expect(g.at(-2)).toEqual({ kind: 'glow', x: 500, y: 300, r: R * 0.28, col: 'core', a: 0.35 });
    expect(g.at(-1)).toEqual({ kind: 'glow', x: 500, y: 300, r: R * 0.1, col: 'heart', a: 0.55 });
    expect(g.slice(1, 27).every((o) => o.col === 'arm' && o.a === 0.12)).toBe(true);
  });

  it('as estrelas do campo ficam dentro da tela, com tamanhos e alfas do legado', () => {
    const W = 800;
    const H = 500;
    const field = stars(skyScene(W, H)).slice(5200);
    field.forEach((s) => {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(H);
      expect([1.5, 1, 0.7]).toContain(s.s);
      expect(s.a).toBeGreaterThanOrEqual(0.15);
      expect(s.a).toBeLessThan(0.7);
    });
  });

  it('os braços se concentram em volta do centro (raio até ~R, com o desvio)', () => {
    const W = 1200;
    const H = 800;
    const R = Math.min(W, H) * 0.46;
    const arms = stars(skyScene(W, H)).slice(0, 5200);
    const far = arms.filter((s) => Math.hypot(s.x - W / 2, s.y - H / 2) > R + 30);
    expect(far.length).toBeLessThan(arms.length * 0.01);
    arms.forEach((s) => {
      expect([1.5, 0.8]).toContain(s.s);
    });
  });
});

describe('skyPalette', () => {
  it('lê as cores das variáveis do elemento e cai no legado quando faltam', () => {
    const el = document.createElement('canvas');
    el.style.setProperty('--sky-nebula', ' 1, 2, 3 ');
    document.body.append(el);
    const p = skyPalette(el);
    expect(p.nebula).toBe('1, 2, 3');
    expect(p.star).toBe(DEFAULT_SKY_PALETTE.star);
    el.remove();
  });
});

interface FakeCtx {
  fills: string[];
  modes: string[];
  globalCompositeOperation: string;
  fillStyle: unknown;
}

function fakeCanvas(W: number, H: number) {
  const cv = document.createElement('canvas');
  Object.defineProperty(cv, 'clientWidth', { value: W });
  Object.defineProperty(cv, 'clientHeight', { value: H });
  const ctx = {
    fills: [] as string[],
    modes: [] as string[],
    _mode: 'source-over',
    get globalCompositeOperation() {
      return this._mode;
    },
    set globalCompositeOperation(m: string) {
      this._mode = m;
      this.modes.push(m);
    },
    fillStyle: '' as unknown,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect(this: FakeCtx) {
      this.fills.push(typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient');
    },
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
  };
  vi.spyOn(cv, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  document.body.append(cv);
  return { cv, ctx };
}

describe('drawSky', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('desenha em modo aditivo, na resolução do dispositivo (até 2x)', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { cv, ctx } = fakeCanvas(400, 300);
    drawSky(cv);
    expect(cv.width).toBe(800);
    expect(cv.height).toBe(600);
    expect(ctx.modes).toEqual(['lighter', 'source-over']);
    expect(ctx.fills).toHaveLength(skyScene(400, 300).length);
    expect(ctx.fills.some((f) => f.startsWith(`rgba(${DEFAULT_SKY_PALETTE.star},`))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('as estrelas usam as cores da paleta lida do canvas', () => {
    const { cv, ctx } = fakeCanvas(300, 200);
    cv.style.setProperty('--sky-star', '9, 9, 9');
    cv.style.setProperty('--sky-tint', '8, 8, 8');
    drawSky(cv);
    const solid = ctx.fills.filter((f) => f !== 'gradient');
    expect(solid.length).toBeGreaterThan(0);
    expect(solid.every((f) => f.startsWith('rgba(9, 9, 9,') || f.startsWith('rgba(8, 8, 8,'))).toBe(
      true,
    );
  });

  it('sem tamanho ou sem contexto não desenha; a limpeza esvazia o canvas', () => {
    const { cv, ctx } = fakeCanvas(0, 0);
    drawSky(cv)();
    expect(ctx.fills).toHaveLength(0);
    const sized = fakeCanvas(200, 100);
    const clean = drawSky(sized.cv);
    expect(sized.cv.width).toBeGreaterThan(0);
    clean();
    expect(sized.cv.width).toBe(0);
    expect(sized.cv.height).toBe(0);
  });
});

describe('twinkles', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('34 pontos determinísticos, com tamanho, duração e fase do legado', () => {
    const data = twinkleField();
    expect(data).toHaveLength(34);
    expect(twinkleField()).toEqual(data);
    data.forEach((d) => {
      expect(d.s).toBeGreaterThanOrEqual(1.5);
      expect(d.s).toBeLessThan(3.1);
      expect(d.d).toBeGreaterThanOrEqual(2.5);
      expect(d.d).toBeLessThan(7.5);
    });
  });

  it('cintilam com o galaxyTwinkle e a limpeza os remove', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const clean = drawTwinkles(el, false);
    const spans = [...el.querySelectorAll('span')];
    expect(spans).toHaveLength(34);
    const [first] = twinkleField();
    expect(spans[0]?.style.animation).toContain('galaxyTwinkle');
    expect(spans[0]?.style.left).toBe(`${String(first?.x)}%`);
    expect(spans[0]?.style.background).toBe('var(--moon)');
    clean();
    expect(el.querySelectorAll('span')).toHaveLength(0);
  });

  it('movimento reduzido: parados em .5, sem animação', () => {
    const el = document.createElement('div');
    document.body.append(el);
    drawTwinkles(el, true);
    const span = el.querySelector('span');
    expect(span?.style.animation).toBe('');
    expect(span?.style.opacity).toBe('0.5');
  });
});
