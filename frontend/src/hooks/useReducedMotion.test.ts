import { act, renderHook } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

type Ouvinte = () => void;

function fakeMatchMedia(inicial: boolean) {
  const ouvintes = new Set<Ouvinte>();
  const mql = {
    matches: inicial,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, fn: Ouvinte) => ouvintes.add(fn),
    removeEventListener: (_: string, fn: Ouvinte) => ouvintes.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => mql);
  return {
    ouvintes,
    set(valor: boolean) {
      mql.matches = valor;
      ouvintes.forEach((fn) => {
        fn();
      });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('lê a preferência atual do sistema', () => {
    fakeMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('reage quando a preferência muda', () => {
    const mq = fakeMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => {
      mq.set(true);
    });
    expect(result.current).toBe(true);
  });

  it('remove o ouvinte ao desmontar', () => {
    const mq = fakeMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(mq.ouvintes.size).toBe(1);
    unmount();
    expect(mq.ouvintes.size).toBe(0);
  });

  it('sem matchMedia, assume movimento normal', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('se matchMedia lançar, assume movimento normal', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('indisponível');
    });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
