import { describe, expect, it } from 'vitest';
import { gauss, hashId, rng } from './random';

// Os números esperados saíram da implementação de frontend/legacy: o desenho
// da galáxia depende de que continuem idênticos.
describe('hashId', () => {
  it.each([
    ['', 2166136261],
    ['a', 3826002220],
    ['dream-team', 145948586],
    ['integracoes', 1270214353],
    ['Orbital', 1052706578],
    ['é', 1812687940],
  ])('FNV-1a de %j é %i', (texto, esperado) => {
    expect(hashId(texto)).toBe(esperado);
  });
});

describe('rng', () => {
  it('repete a mesma sequência para a mesma semente', () => {
    const r = rng(106);
    expect([r(), r(), r(), r(), r()]).toEqual([
      0.20949179562740028, 0.6548024821095169, 0.11815392412245274, 0.7963753261137754,
      0.2431672338861972,
    ]);
    const outra = rng(106);
    expect(outra()).toBe(0.20949179562740028);
  });

  it('aceita a semente vinda de hashId', () => {
    const r = rng(hashId('dream-team'));
    expect([r(), r()]).toEqual([0.06483259843662381, 0.81703079957515]);
  });

  it('funciona com sementes pequenas e fica em [0, 1)', () => {
    const zero = rng(0);
    expect([zero(), zero()]).toEqual([0.26642920868471265, 0.0003297457005828619]);
    const um = rng(1);
    expect([um(), um(), um()]).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
    const r = rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('gauss', () => {
  it('devolve a mesma sequência do legado para a mesma semente', () => {
    const r = rng(42);
    expect([gauss(r), gauss(r), gauss(r)]).toEqual([
      -0.956162229384149, -0.2730261048826104, -1.8416271847835968,
    ]);
  });

  it('descarta sorteios iguais a zero antes de transformar', () => {
    const seq = [0, 0.5, 0, 0.25];
    let i = 0;
    const valor = gauss(() => seq[i++] ?? 0.5);
    expect(i).toBe(4);
    expect(valor).toBeCloseTo(0, 10);
  });
});
