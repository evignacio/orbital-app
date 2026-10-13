import { describe, expect, it } from 'vitest';
import { countLabel, healthLine } from '@/viz/galaxy-orbit-label';

const o = (down: number, degraded: number, checked = true) => ({ down, degraded, checked });

describe('countLabel', () => {
  it('singular e plural', () => {
    expect(countLabel(1)).toBe('1 APLICAÇÃO');
    expect(countLabel(0)).toBe('0 APLICAÇÕES');
    expect(countLabel(12)).toBe('12 APLICAÇÕES');
  });
});

describe('healthLine', () => {
  it('nenhuma app checada: VERIFICANDO, mesmo stale', () => {
    expect(healthLine(o(0, 0, false), false)).toEqual([
      { text: 'VERIFICANDO', color: 'var(--faint)' },
    ]);
    expect(healthLine(o(2, 0, false), true)).toEqual([
      { text: 'VERIFICANDO', color: 'var(--faint)' },
    ]);
  });

  it('stale: ÚLTIMO com a queda, a lentidão ou NO AR', () => {
    expect(healthLine(o(2, 1), true)).toEqual([{ text: 'ÚLTIMO: 2 FORA', color: 'var(--stale)' }]);
    expect(healthLine(o(0, 3), true)).toEqual([
      { text: 'ÚLTIMO: 3 DEGRADADO', color: 'var(--stale)' },
    ]);
    expect(healthLine(o(0, 0), true)).toEqual([{ text: 'ÚLTIMO: NO AR', color: 'var(--stale)' }]);
  });

  it('todas no ar', () => {
    expect(healthLine(o(0, 0), false)).toEqual([{ text: 'TODAS NO AR', color: 'var(--up)' }]);
  });

  it('quedas e lentidões, separadas por ponto', () => {
    expect(healthLine(o(2, 1), false)).toEqual([
      { text: '2 FORA', color: 'var(--down)' },
      { text: ' · ', color: 'var(--faint)' },
      { text: '1 DEGRADADO', color: 'var(--warn)' },
    ]);
    expect(healthLine(o(1, 0), false)).toEqual([{ text: '1 FORA', color: 'var(--down)' }]);
    expect(healthLine(o(0, 4), false)).toEqual([{ text: '4 DEGRADADO', color: 'var(--warn)' }]);
  });
});
