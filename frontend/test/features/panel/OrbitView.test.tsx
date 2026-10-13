import { act, render, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@/domain/types';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import type { PanelOrbit } from '@/viz/panel-orbits';
import { OrbitView, type OrbitViewProps } from '@/features/panel/OrbitView';

// O desenho é o real; só contamos quem abre e quem fecha cada esqueleto.
const handles = vi.hoisted(() => [] as { update: ReturnType<typeof vi.fn>; destroyed: boolean }[]);
vi.mock('@/viz/panel-orbits', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/panel-orbits')>();
  return {
    ...real,
    drawOrbits: (...args: Parameters<typeof real.drawOrbits>): PanelOrbit => {
      const orbit = real.drawOrbits(...args);
      const h = { update: vi.fn(orbit.update), destroyed: false };
      handles.push(h);
      return {
        update: h.update,
        destroy: () => {
          h.destroyed = true;
          orbit.destroy();
        },
      };
    },
  };
});

const app = (id: string, name: string): Application => ({
  id,
  env: 'prd',
  name,
  team: 'Pagamentos',
  healthCheckUrl: `http://${id}`,
  swaggerUrl: '',
  orbits: ['Dream team'],
});
const APPS = [app('a', 'checkout-api'), app('b', 'billing-api')];

function props(over: Partial<OrbitViewProps> = {}): OrbitViewProps {
  return { apps: APPS, selectedId: null, onSelect: vi.fn(), env: 'prd', stale: false, ...over };
}

function Section({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <section data-testid="orbit">{children}</section>
    </StrictMode>
  );
}

const live = () => handles.filter((h) => !h.destroyed);
const svgs = () => screen.getByTestId('orbit').querySelectorAll('svg');
const planets = () => [...screen.getByTestId('orbit').querySelectorAll<SVGGElement>('g.planet')];

beforeEach(() => {
  handles.length = 0;
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
});

describe('OrbitView', () => {
  it('no StrictMode monta um esqueleto só e o desmonte fecha todos (timer e svg)', () => {
    const { unmount } = render(<OrbitView {...props()} />, { wrapper: Section });
    expect(live()).toHaveLength(1);
    expect(svgs()).toHaveLength(1);
    expect(planets()).toHaveLength(2);
    unmount();
    expect(live()).toHaveLength(0);
    expect(handles.length).toBeGreaterThan(0);
  });

  it('status e seleção só repintam; tema, tempestade e ambiente redesenham', () => {
    const view = render(<OrbitView {...props()} />, { wrapper: Section });
    const drawn = handles.length;
    act(() => {
      useStatusStore.setState({ status: { a: 'unhealthy' } });
    });
    view.rerender(<OrbitView {...props({ selectedId: 'a' })} />);
    expect(handles.length).toBe(drawn);
    const body = planets()[0]?.querySelector<SVGCircleElement>('circle.body');
    expect(body?.style.fill).toBe('var(--down)');
    expect(body?.style.stroke).toBe('var(--planet-edge-sel)');

    act(() => {
      usePreferencesStore.setState({ theme: 'light' });
    });
    expect(handles.length).toBe(drawn + 1);
    expect(screen.getByTestId('orbit').querySelector('#coreSun')).not.toBeNull();

    act(() => {
      useConnectionStore.setState({ apiDown: true });
    });
    expect(handles.length).toBe(drawn + 2);
    expect(screen.getByText('SEM SINAL')).toBeInTheDocument();

    view.rerender(<OrbitView {...props({ env: 'hml', apps: APPS.slice(0, 1) })} />);
    expect(handles.length).toBe(drawn + 3);
    expect(planets()).toHaveLength(1);
    expect(live()).toHaveLength(1);
    expect(svgs()).toHaveLength(1);
  });

  it('busca/filtro (nova lista) só faz o join dos planetas', () => {
    const view = render(<OrbitView {...props()} />, { wrapper: Section });
    const drawn = handles.length;
    view.rerender(<OrbitView {...props({ apps: APPS.slice(1) })} />);
    expect(handles.length).toBe(drawn);
    expect(planets().map((g) => g.textContent)).toEqual(['billing-api']);
  });

  it('clique no planeta chama o onSelect mais recente, sem redesenhar quando ele muda', () => {
    const first = vi.fn();
    const view = render(<OrbitView {...props({ onSelect: first })} />, { wrapper: Section });
    const drawn = handles.length;
    const latest = vi.fn();
    view.rerender(<OrbitView {...props({ onSelect: latest })} />);
    expect(handles.length).toBe(drawn);
    planets()[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(latest).toHaveBeenCalledWith('b');
    expect(first).not.toHaveBeenCalled();
  });

  it('stale pinta os planetas de cinza e mostra a dica de último conhecido', () => {
    render(<OrbitView {...props({ stale: true })} />, { wrapper: Section });
    expect(planets()[0]?.querySelector<SVGCircleElement>('circle.body')?.style.fill).toBe(
      'var(--stale)',
    );
    expect(screen.getByText('ÚLTIMO CONHECIDO · SINCRONIZANDO…')).toBeInTheDocument();
  });
});
