import { describe, expect, it } from 'vitest';
import type { Application, StatusMap } from '@/domain/types';
import {
  REF_H,
  REF_W,
  RESERVED,
  clamp01,
  easeCubicIn,
  layout,
  layoutRef,
  orbitsData,
  smoothClosedPath,
  systemTones,
  type GalaxyOrbit,
} from '@/viz/galaxy-layout';

const app = (id: string, orbits: string[], env: Application['env'] = 'prd'): Application => ({
  id,
  env,
  name: `app-${id}`,
  team: 'Pagamentos',
  healthCheckUrl: `http://${id}`,
  swaggerUrl: '',
  orbits,
});

// Órbita com n apps: as `down` primeiras fora, as `degraded` seguintes degradadas,
// `idle` sem status e o resto no ar.
function orbit(n: number, down = 0, degraded = 0, idle = 0): [GalaxyOrbit, StatusMap] {
  const apps = Array.from({ length: n }, (_, i) => app(String(i).padStart(3, '0'), ['O']));
  const status: StatusMap = {};
  apps.forEach((a, i) => {
    if (i < down) status[a.id] = 'unhealthy';
    else if (i < down + degraded) status[a.id] = 'degraded';
    else if (i < down + degraded + idle) return;
    else status[a.id] = 'healthy';
  });
  // Sem apps não existe órbita: a forma vazia ainda vale para systemTones.
  const o = orbitsData(apps, status)[0] ?? {
    key: 'o',
    name: 'O',
    apps: [],
    n: 0,
    down: 0,
    degraded: 0,
    checked: false,
  };
  return [o, status];
}

const KEYS = ['dream-team', 'pagamentos', 'checkout', 'logistica', 'marketing', 'core', 'dados'];

describe('orbitsData', () => {
  it('conta apps de todos os ambientes, quedas, lentidões e se alguma já foi checada', () => {
    const apps = [
      app('1', ['Dream team']),
      app('2', ['Dream team', 'Core'], 'dev'),
      app('3', ['Core']),
      app('4', ['Dream team'], 'hml'),
    ];
    const status: StatusMap = { '1': 'unhealthy', '2': 'degraded', '4': 'healthy' };
    expect(
      orbitsData(apps, status).map(({ key, name, n, down, degraded, checked }) => ({
        key,
        name,
        n,
        down,
        degraded,
        checked,
      })),
    ).toEqual([
      { key: 'dream-team', name: 'Dream team', n: 3, down: 1, degraded: 1, checked: true },
      { key: 'core', name: 'Core', n: 2, down: 0, degraded: 1, checked: true },
    ]);
  });

  it('órbita sem nenhum status ainda não foi checada', () => {
    const [o] = orbitsData([app('1', ['X'])], {});
    expect(o?.checked).toBe(false);
  });
});

describe('systemTones', () => {
  it('quantos planetinhas: 0 a 5 conforme o tamanho da órbita', () => {
    const sizes: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
      [7, 3],
      [8, 4],
      [14, 4],
      [15, 5],
      [40, 5],
    ];
    sizes.forEach(([n, k]) => {
      const [o, status] = orbit(n);
      expect(systemTones(o, status)).toHaveLength(k);
    });
  });

  it('todas no ar: só planetinhas verdes', () => {
    const [o, status] = orbit(4);
    expect(systemTones(o, status)).toEqual(['healthy', 'healthy', 'healthy']);
  });

  it('uma queda entre muitas ainda ganha um planetinha, antes dos outros', () => {
    const [o, status] = orbit(20, 1);
    expect(systemTones(o, status)).toEqual([
      'unhealthy',
      'healthy',
      'healthy',
      'healthy',
      'healthy',
    ]);
  });

  it('uma lentidão entre muitas também aparece', () => {
    const [o, status] = orbit(20, 0, 1);
    expect(systemTones(o, status)).toEqual([
      'degraded',
      'healthy',
      'healthy',
      'healthy',
      'healthy',
    ]);
  });

  it('na proporção dos status: fora, degradado, no ar e sem status por último', () => {
    const [o, status] = orbit(10, 5, 2, 3);
    // k = 4: fora round(5/10*4)=2, degradado max(1, round(.8))=1, sem status round(1.2)=1.
    expect(systemTones(o, status)).toEqual(['unhealthy', 'unhealthy', 'degraded', 'idle']);
  });

  it('nunca passa de k: quedas tomam a frente das lentidões', () => {
    const [o, status] = orbit(2, 1, 1);
    expect(systemTones(o, status)).toEqual(['unhealthy', 'degraded']);
    const [all, st2] = orbit(3, 3);
    expect(systemTones(all, st2)).toEqual(['unhealthy', 'unhealthy']);
  });

  it('nenhuma checada: tudo idle', () => {
    const [o, status] = orbit(5, 0, 0, 5);
    expect(systemTones(o, status)).toEqual(['idle', 'idle', 'idle']);
  });
});

describe('layout', () => {
  const orbits = KEYS.map((key) => ({ key }));

  it('é determinístico: a mesma chave cai sempre no mesmo lugar', () => {
    expect(layoutRef(orbits)).toEqual(layoutRef(orbits));
    expect(layout(orbits, 1440, 900)).toEqual(layout(orbits, 1440, 900));
  });

  it('uma órbita nova no fim não move as anteriores', () => {
    const before = layoutRef(orbits.slice(0, 4));
    expect(layoutRef(orbits).slice(0, 4)).toEqual(before);
  });

  it('fica longe do título, da barra do topo, do botão + e do núcleo', () => {
    layoutRef(orbits).forEach(([x, y]) => {
      RESERVED.forEach(([rx, ry, r]) => {
        expect(Math.hypot(rx - x, ry - y)).toBeGreaterThan(r - 60);
      });
    });
  });

  it('candidatos ficam dentro da margem do espaço de referência', () => {
    layoutRef(orbits).forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(110);
      expect(x).toBeLessThanOrEqual(REF_W - 110);
      expect(y).toBeGreaterThanOrEqual(104);
      expect(y).toBeLessThanOrEqual(REF_H - 104 - 30);
    });
  });

  it('reescala do espaço 1280x800 para a janela', () => {
    const ref = layoutRef(orbits);
    const W = 1000;
    const H = 600;
    const mx = Math.min(110, W * 0.12);
    const my = Math.min(110, H * 0.13);
    layout(orbits, W, H).forEach(([x, y], i) => {
      const [rx, ry] = ref[i] ?? [0, 0];
      expect(x).toBeCloseTo(mx + ((rx - 110) / (REF_W - 220)) * (W - 2 * mx));
      expect(y).toBeCloseTo(my + ((ry - 104) / (REF_H - 208 - 30)) * (H - 2 * my - 30));
    });
  });

  it('sem órbitas, sem posições', () => {
    expect(layout([], 800, 600)).toEqual([]);
  });
});

describe('auxiliares', () => {
  it('smoothClosedPath: quadráticas com ponta no meio de cada lado', () => {
    expect(
      smoothClosedPath([
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
    ).toBe('M 5 5 Q 0 0 5 0 Q 10 0 10 5 Q 10 10 5 5 Z');
  });

  it('easeCubicIn e clamp01', () => {
    expect(easeCubicIn(0.5)).toBe(0.125);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
});
