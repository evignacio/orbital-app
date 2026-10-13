import { describe, expect, it } from 'vitest';
import {
  ORBIT_TILT,
  haloFill,
  orbitBox,
  planetNodes,
  planetTransform,
  ringRadii,
  maxRadius,
} from './orbit-geometry';

describe('orbitBox', () => {
  it('usa o tamanho do elemento com os mínimos do legado', () => {
    expect(orbitBox(900, 509)).toEqual({ W: 900, H: 509 });
    expect(orbitBox(200, 100)).toEqual({ W: 320, H: 280 });
  });

  it('sem layout (0 x 0) cai em 860 x 560', () => {
    expect(orbitBox(0, 0)).toEqual({ W: 860, H: 560 });
  });
});

describe('maxRadius', () => {
  it('é o menor entre a largura e a altura desachatada', () => {
    expect(maxRadius(860, 560)).toBeCloseTo(Math.min(430 - 46, (280 - 34) / 0.42));
    expect(maxRadius(2000, 400)).toBeCloseTo((200 - 34) / 0.42);
  });
});

describe('planetNodes', () => {
  const planets = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `app-${id}` }));

  it('distribui em 4 anéis, com raio, achatamento, fase, velocidade e tamanho do legado', () => {
    const nodes = planetNodes(planets, 100);
    expect(nodes.map((n) => n.r)).toEqual([34, 56, 78, 100, 34].map((r) => expect.closeTo(r, 9)));
    nodes.forEach((n) => {
      expect(n.ry).toBeCloseTo(n.r * ORBIT_TILT);
    });
    expect(nodes[1]?.phase).toBeCloseTo(2.399);
    expect(nodes[3]?.phase).toBeCloseTo((3 * 2.399) % (Math.PI * 2));
    expect(nodes[0]?.speed).toBeCloseTo(0.32);
    expect(nodes[2]?.speed).toBeCloseTo(0.32 / 2.1);
    expect(nodes.map((n) => n.size)).toEqual([12, 9.5, 9.5, 9.5, 12]);
    expect(nodes[4]).toMatchObject({ id: 'e', name: 'app-e' });
  });

  it('lista vazia não tem planetas', () => {
    expect(planetNodes([], 100)).toEqual([]);
  });
});

describe('ringRadii', () => {
  it('um anel por raio distinto, na ordem de aparição', () => {
    const nodes = planetNodes(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id })),
      100,
    );
    expect(ringRadii(nodes)).toHaveLength(4);
    expect(ringRadii(nodes.slice(0, 2))).toEqual([nodes[0]?.r, nodes[1]?.r]);
  });
});

describe('planetTransform', () => {
  it('posição na elipse no instante t (s)', () => {
    const node = { r: 100, ry: 42, phase: 0, speed: 0.5 };
    expect(planetTransform(node, 0)).toBe('translate(100,0)');
    const a = Math.PI;
    const [x, y] = [Math.cos(a) * 100, Math.sin(a) * 42];
    expect(planetTransform(node, Math.PI / 0.5)).toBe(`translate(${String(x)},${String(y)})`);
  });
});

describe('haloFill', () => {
  it('stale fica cinza; com brilho usa o gradiente do status; sem brilho a cor', () => {
    expect(haloFill('healthy', { stale: true, glow: false })).toBe('var(--stale)');
    expect(haloFill('degraded', { stale: false, glow: true })).toBe('url(#glow-degraded)');
    expect(haloFill(undefined, { stale: false, glow: true })).toBe('url(#glow-idle)');
    expect(haloFill('unhealthy', { stale: false, glow: false })).toBe('var(--down)');
    expect(haloFill(undefined, { stale: false, glow: false })).toBe('var(--idle)');
  });
});
