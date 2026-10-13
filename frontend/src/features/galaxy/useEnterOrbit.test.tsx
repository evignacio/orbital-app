import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useRef } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalaxyOrbitNode } from '@/viz/galaxy-orbits';
import { ENTER_MS, VEIL_AT_MS } from '@/viz/galaxy-layout';
import type { GalaxyOrbitsHandle } from './GalaxyOrbits';
import type { GalaxyRocksHandle } from './GalaxyRocks';
import { useEnterOrbit } from './useEnterOrbit';

const node = (key: string, x: number, y: number) =>
  ({ key, name: key, x, y, size: 30, col: '#abc' }) as unknown as GalaxyOrbitNode;
const DREAM = node('dream-team', 300, 200);
const CORE = node('core', 900, 500);

const fillRect = vi.fn();
const fakeCtx = {
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  fillStyle: '',
  clearRect: vi.fn(),
  fillRect,
  setTransform: vi.fn(),
};

function Harness() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const orbitsRef = useRef<GalaxyOrbitsHandle | null>({ nodes: () => [DREAM, CORE] });
  const rocksRef = useRef<GalaxyRocksHandle | null>({ rocks: () => [{ x: 10, y: 10, size: 8 }] });
  const { leavingKey, enter } = useEnterOrbit({ rootRef, fxRef, veilRef, orbitsRef, rocksRef });
  return (
    <div ref={rootRef}>
      <p>saindo: {leavingKey ?? 'não'}</p>
      <button
        onClick={() => {
          enter(DREAM);
        }}
      >
        dream
      </button>
      <button
        onClick={() => {
          enter(CORE);
        }}
      >
        core
      </button>
      <canvas ref={fxRef} />
      <div ref={veilRef} data-testid="veu" />
    </div>
  );
}

function renderHarness() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Harness /> },
      { path: '/painel', element: <p>painel aberto</p> },
    ],
    { initialEntries: ['/'] },
  );
  const view = render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  return { router, view };
}

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

let reduced = false;

beforeEach(() => {
  reduced = false;
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    fakeCtx as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  fillRect.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useEnterOrbit', () => {
  it('suga a galáxia, acende o véu e, ao fim, abre o painel filtrado pela órbita', () => {
    const { router } = renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'dream' }));
    expect(screen.getByText('saindo: dream-team')).toBeInTheDocument();
    advance(VEIL_AT_MS);
    expect(screen.getByTestId('veu').style.opacity).toBe('1');
    expect(fillRect).toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/');
    advance(ENTER_MS - VEIL_AT_MS + 50);
    expect(router.state.location.pathname).toBe('/painel');
    expect(router.state.location.search).toBe('?orbita=dream-team');
    expect(screen.getByText('painel aberto')).toBeInTheDocument();
  });

  it('um segundo clique durante a saída é ignorado', () => {
    const { router } = renderHarness();
    const push = vi.spyOn(router, 'navigate');
    fireEvent.click(screen.getByRole('button', { name: 'dream' }));
    advance(100);
    fireEvent.click(screen.getByRole('button', { name: 'core' }));
    expect(screen.getByText('saindo: dream-team')).toBeInTheDocument();
    advance(ENTER_MS + 100);
    expect(router.state.location.search).toBe('?orbita=dream-team');
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('desmontar no meio da saída cancela a animação e a navegação', () => {
    const { router, view } = renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'dream' }));
    advance(200);
    view.unmount();
    fillRect.mockClear();
    advance(ENTER_MS * 2);
    expect(fillRect).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/');
  });

  it('com movimento reduzido não há sucção: véu imediato e painel em 130ms', () => {
    reduced = true;
    const { router } = renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'dream' }));
    advance(0);
    const veil = screen.getByTestId('veu');
    expect(veil.style.opacity).toBe('1');
    expect(veil.style.transition).toBe('opacity 120ms ease');
    expect(fillRect).not.toHaveBeenCalled();
    advance(129);
    expect(router.state.location.pathname).toBe('/');
    advance(1);
    expect(router.state.location.search).toBe('?orbita=dream-team');
  });
});
