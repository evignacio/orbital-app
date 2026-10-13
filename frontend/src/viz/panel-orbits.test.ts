import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatusMap } from '../domain/types';
import { drawOrbits, type PanelOrbitScene, type PanelPlanets } from './panel-orbits';

// O relógio do d3-timer é capturado na importação e escapa dos timers falsos: troca-se
// o timer por um que guarda o callback, e o teste dá os quadros na mão.
const timers = vi.hoisted(() => ({
  ticks: [] as (() => void)[],
  stopped: 0,
}));
vi.mock('d3-timer', () => ({
  timer: (cb: () => void) => {
    timers.ticks.push(cb);
    return {
      stop: () => {
        timers.stopped += 1;
      },
    };
  },
}));

const PLANETS = [
  { id: 'a', name: 'checkout-api' },
  { id: 'b', name: 'billing-api' },
  { id: 'c', name: 'auth-api' },
  { id: 'd', name: 'search-api' },
  { id: 'e', name: 'mail-api' },
];

function scene(over: Partial<PanelOrbitScene> = {}): PanelOrbitScene {
  return { light: false, storm: false, still: false, t0: Date.now(), onSelect: vi.fn(), ...over };
}

function planets(over: Partial<PanelPlanets> = {}): PanelPlanets {
  return { planets: PLANETS, status: {}, selectedId: null, stale: false, ...over };
}

let el: HTMLDivElement;
afterEach(() => {
  vi.useRealTimers();
  timers.ticks.length = 0;
  timers.stopped = 0;
  el.remove();
});

function mount() {
  el = document.createElement('div');
  document.body.append(el);
  return el;
}

const planetEls = () => [...el.querySelectorAll<SVGGElement>('g.planet')];

describe('drawOrbits', () => {
  it('monta o svg com viewBox do tamanho, brilhos pré-desenhados, anéis e planetas', () => {
    const orbit = drawOrbits(mount(), scene(), planets());
    const svg = el.querySelector('svg');
    // jsdom não tem layout: cai no tamanho padrão do legado.
    expect(svg?.getAttribute('viewBox')).toBe('0 0 860 560');
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(el.querySelector('filter#oglow feGaussianBlur')?.getAttribute('stdDeviation')).toBe('6');
    for (const k of ['healthy', 'degraded', 'unhealthy', 'idle']) {
      expect(el.querySelector(`radialGradient#glow-${k}`)).not.toBeNull();
    }
    expect(el.querySelectorAll('ellipse')).toHaveLength(4);
    expect(el.querySelector('ellipse')?.getAttribute('stroke-dasharray')).toBe('3 7');
    expect(planetEls()).toHaveLength(5);
    expect(planetEls().map((g) => g.querySelector('text.label')?.textContent)).toEqual(
      PLANETS.map((p) => p.name),
    );
    // Lua no escuro.
    expect(el.querySelectorAll('circle.crater')).toHaveLength(4);
    orbit.destroy();
  });

  it('pinta pelo status, com brilho no escuro e a borda do selecionado', () => {
    const status: StatusMap = { a: 'healthy', b: 'unhealthy' };
    const orbit = drawOrbits(mount(), scene(), planets({ status, selectedId: 'b' }));
    const [a, b, c] = planetEls();
    expect(a?.querySelector<SVGCircleElement>('circle.halo')?.style.fill.replaceAll('"', '')).toBe(
      'url(#glow-healthy)',
    );
    expect(c?.querySelector<SVGCircleElement>('circle.halo')?.style.fill.replaceAll('"', '')).toBe(
      'url(#glow-idle)',
    );
    expect(a?.querySelector<SVGCircleElement>('circle.body')?.style.fill).toBe('var(--up)');
    const body = b?.querySelector<SVGCircleElement>('circle.body');
    expect(body?.style.stroke).toBe('var(--planet-edge-sel)');
    expect(body?.getAttribute('stroke-width')).toBe('2.5');
    expect(a?.querySelector('circle.body')?.getAttribute('stroke-width')).toBe('1');
    orbit.destroy();
  });

  it('no claro não há brilho: halo na cor do status e sol no núcleo', () => {
    const orbit = drawOrbits(
      mount(),
      scene({ light: true }),
      planets({ status: { a: 'degraded' } }),
    );
    const halo = planetEls()[0]?.querySelector<SVGCircleElement>('circle.halo');
    expect(halo?.style.fill).toBe('var(--warn)');
    expect(halo?.getAttribute('opacity')).toBe('0.14');
    expect(el.querySelector('#coreSun')).not.toBeNull();
    orbit.destroy();
  });

  it('stale: planetas cinza, apagados e tracejados', () => {
    const orbit = drawOrbits(mount(), scene(), planets({ status: { a: 'healthy' }, stale: true }));
    const a = planetEls()[0];
    expect(a?.style.opacity).toBe('0.55');
    expect(a?.querySelector<SVGCircleElement>('circle.body')?.style.fill).toBe('var(--stale)');
    expect(a?.querySelector('circle.body')?.getAttribute('stroke-dasharray')).toBe('2 3');
    expect(a?.querySelector('circle.halo')?.getAttribute('opacity')).toBe('0.08');
    orbit.destroy();
  });

  it('tempestade: núcleo SEM SINAL e planetas stale', () => {
    const orbit = drawOrbits(mount(), scene({ storm: true }), planets());
    expect(el.querySelector('text')?.textContent).toBe('SEM SINAL');
    expect(el.querySelector('circle.crater')).toBeNull();
    expect(planetEls()[0]?.querySelector<SVGCircleElement>('circle.body')?.style.fill).toBe(
      'var(--stale)',
    );
    orbit.destroy();
  });

  it('update só entra/sai o que mudou e repinta os demais sem refazer o esqueleto', () => {
    const orbit = drawOrbits(mount(), scene(), planets());
    const svg = el.querySelector('svg');
    const [a] = planetEls();
    orbit.update(planets({ planets: PLANETS.slice(0, 2), status: { a: 'unhealthy' } }));
    expect(el.querySelector('svg')).toBe(svg);
    expect(planetEls()).toHaveLength(2);
    expect(planetEls()[0]).toBe(a);
    expect(a?.querySelector<SVGCircleElement>('circle.body')?.style.fill).toBe('var(--down)');
    expect(el.querySelectorAll('ellipse')).toHaveLength(2);
    orbit.destroy();
  });

  it('clique no planeta chama onSelect com o id', () => {
    const onSelect = vi.fn();
    const orbit = drawOrbits(mount(), scene({ onSelect }), planets());
    planetEls()[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('c');
    orbit.destroy();
  });

  it('os planetas giram e a limpeza para o timer e remove o svg', () => {
    vi.useFakeTimers();
    const orbit = drawOrbits(mount(), scene({ t0: Date.now() - 1000 }), planets());
    const g = planetEls()[0];
    const before = g?.getAttribute('transform');
    vi.advanceTimersByTime(80);
    timers.ticks.forEach((tick) => {
      tick();
    });
    expect(g?.getAttribute('transform')).not.toBe(before);
    orbit.destroy();
    expect(timers.stopped).toBe(1);
    expect(el.querySelector('svg')).toBeNull();
  });

  it('movimento reduzido: planetas parados na posição inicial', () => {
    const orbit = drawOrbits(mount(), scene({ still: true }), planets());
    const g = planetEls()[0];
    expect(g?.getAttribute('transform')).toMatch(/^translate\(/);
    const before = g?.getAttribute('transform');
    expect(timers.ticks).toHaveLength(0);
    expect(g?.getAttribute('transform')).toBe(before);
    orbit.destroy();
  });
});
