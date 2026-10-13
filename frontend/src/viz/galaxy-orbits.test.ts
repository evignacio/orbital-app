import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { orbitColors } from '../domain/orbits';
import type { Application, StatusMap } from '../domain/types';
import { orbitsData } from './galaxy-layout';
import { drawGalaxyOrbits, type GalaxyOrbitsScene } from './galaxy-orbits';

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

const app = (id: string, orbits: string[]): Application => ({
  id,
  env: 'prd',
  name: `app-${id}`,
  team: 'Pagamentos',
  healthCheckUrl: `http://${id}`,
  swaggerUrl: '',
  orbits,
});
const APPS = [
  app('1', ['Dream team']),
  app('2', ['Dream team']),
  app('3', ['Dream team']),
  app('4', ['Core']),
];
const STATUS: StatusMap = { '1': 'unhealthy', '2': 'healthy', '3': 'healthy' };

function sized(W = 1280, H = 800): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: W });
  Object.defineProperty(el, 'clientHeight', { value: H });
  document.body.append(el);
  return el;
}

function scene(over: Partial<GalaxyOrbitsScene> = {}): GalaxyOrbitsScene {
  return {
    orbits: orbitsData(APPS, STATUS),
    status: STATUS,
    colorOf: orbitColors(APPS, 'dark'),
    light: false,
    stale: false,
    still: true,
    t0: 0,
    onEnter: vi.fn(),
    ...over,
  };
}

const orbs = (el: HTMLElement) => [...el.querySelectorAll<SVGGElement>('g.orb')];

let el: HTMLElement;
beforeEach(() => {
  el = sized();
});
afterEach(() => {
  el.remove();
});

describe('drawGalaxyOrbits', () => {
  it('desenha um sistema por órbita, na ordem de nascimento, como link acessível', () => {
    drawGalaxyOrbits(el, scene());
    expect(el.querySelectorAll('svg')).toHaveLength(1);
    const g = orbs(el);
    expect(g.map((x) => x.getAttribute('aria-label'))).toEqual([
      'Abrir a órbita Dream team',
      'Abrir a órbita Core',
    ]);
    g.forEach((x) => {
      expect(x.getAttribute('role')).toBe('link');
      expect(x.getAttribute('tabindex')).toBe('0');
    });
  });

  it('anéis tracejados na cor da órbita e planetinhas na cor de status', () => {
    drawGalaxyOrbits(el, scene());
    const [dream] = orbs(el);
    if (!dream) throw new Error('sem órbita');
    const ring = dream.querySelector<SVGEllipseElement>('ellipse.ring');
    // O jsdom normaliza a cor; a sonda dá a mesma cor na mesma forma.
    const probe = document.createElement('span');
    probe.style.stroke = orbitColors(APPS, 'dark')('dream-team');
    expect(ring?.style.stroke).toBe(probe.style.stroke);
    expect(ring?.getAttribute('stroke-dasharray')).toBe('4 6');
    // 3 apps → 2 planetinhas: 1 fora, 1 no ar.
    const minis = [...dream.querySelectorAll<SVGCircleElement>('circle.mini')];
    expect(minis.map((c) => c.style.fill)).toEqual(['var(--down)', 'var(--up)']);
    // Parado (movimento reduzido), mas já na posição do instante 0.
    expect(minis[0]?.getAttribute('cx')).not.toBeNull();
  });

  it('núcleo de lua no escuro e de sol no claro', () => {
    drawGalaxyOrbits(el, scene());
    expect(el.querySelector('#coreMoon')).not.toBeNull();
    el.replaceChildren();
    drawGalaxyOrbits(el, scene({ light: true }));
    expect(el.querySelector('#coreSun')).not.toBeNull();
    expect(el.querySelectorAll('svg')).toHaveLength(1);
  });

  it('legenda com nome, contagem e saúde', () => {
    drawGalaxyOrbits(el, scene());
    const [dream, core] = orbs(el);
    expect(dream?.querySelector('.orbit-name')?.textContent).toBe('Dream team');
    expect(dream?.querySelector('.orbit-count')?.textContent).toBe('3 APLICAÇÕES');
    expect(dream?.querySelector('.orbit-health')?.textContent).toBe('1 FORA');
    expect(core?.querySelector('.orbit-count')?.textContent).toBe('1 APLICAÇÃO');
    expect(core?.querySelector('.orbit-health')?.textContent).toBe('VERIFICANDO');
  });

  it('stale: planetinhas cinza tracejados e ÚLTIMO na legenda', () => {
    drawGalaxyOrbits(el, scene({ stale: true }));
    const [dream] = orbs(el);
    const mini = dream?.querySelector<SVGCircleElement>('circle.mini');
    expect(mini?.style.fill).toBe('var(--stale)');
    expect(mini?.getAttribute('stroke-dasharray')).toBe('1.5 1.5');
    expect(dream?.querySelector('.orbit-health')?.textContent).toBe('ÚLTIMO: 1 FORA');
  });

  it('clique e Enter entram na órbita com a posição atual', () => {
    const onEnter = vi.fn();
    const drawing = drawGalaxyOrbits(el, scene({ onEnter }));
    const [dream, core] = orbs(el);
    dream?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onEnter).toHaveBeenCalledTimes(1);
    const node = drawing.nodes()[0];
    expect(onEnter.mock.calls[0]?.[0]).toBe(node);
    expect(node?.key).toBe('dream-team');
    expect(typeof node?.x).toBe('number');
    core?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onEnter).toHaveBeenLastCalledWith(drawing.nodes()[1]);
    core?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(onEnter).toHaveBeenCalledTimes(2);
  });

  it('leave apaga as outras órbitas e mantém a escolhida', () => {
    const drawing = drawGalaxyOrbits(el, scene());
    drawing.leave('core');
    const [dream, core] = orbs(el);
    expect(dream?.style.opacity).toBe('0');
    expect(core?.style.opacity).toBe('');
  });

  it('sem tamanho (ainda sem layout) não desenha', () => {
    const empty = sized(0, 0);
    const drawing = drawGalaxyOrbits(empty, scene());
    expect(empty.querySelector('svg')).toBeNull();
    expect(drawing.nodes()).toEqual([]);
    drawing.destroy();
    empty.remove();
  });

  it('movimento reduzido não liga timer', () => {
    timers.length = 0;
    drawGalaxyOrbits(el, scene({ still: true })).destroy();
    expect(timers).toHaveLength(0);
  });

  it('destroy para o timer e remove o svg', () => {
    timers.length = 0;
    const drawing = drawGalaxyOrbits(el, scene({ still: false }));
    expect(el.querySelector('svg')).not.toBeNull();
    expect(timers).toEqual([{ stopped: false }]);
    drawing.destroy();
    expect(el.querySelector('svg')).toBeNull();
    expect(timers).toEqual([{ stopped: true }]);
  });
});
