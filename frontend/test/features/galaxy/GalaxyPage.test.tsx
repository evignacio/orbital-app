import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@/domain/types';
import { EventStreamContext } from '@/hooks/EventStreamContext';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import { ENTER_MS } from '@/viz/galaxy-layout';
import { GalaxyPage } from '@/features/galaxy/GalaxyPage';

const app = (id: string, orbits: string[]): Application => ({
  id,
  env: 'prd',
  name: `app-${id}`,
  team: 'Pagamentos',
  healthCheckUrl: `http://${id}`,
  swaggerUrl: '',
  orbits,
});
const APPS = [app('1', ['Dream team']), app('2', ['Dream team']), app('3', ['Core'])];

// O jsdom não faz layout: sem largura, as órbitas não seriam desenhadas.
const sizeDesc = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
};
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
});
afterAll(() => {
  if (sizeDesc.w) Object.defineProperty(HTMLElement.prototype, 'clientWidth', sizeDesc.w);
  if (sizeDesc.h) Object.defineProperty(HTMLElement.prototype, 'clientHeight', sizeDesc.h);
});

const reconnectIfClosed = vi.fn();

function renderGalaxy() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <EventStreamContext value={{ reconnectIfClosed }}>
            <GalaxyPage />
          </EventStreamContext>
        ),
      },
      { path: '/painel', element: <p>painel aberto</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  return router;
}

const health = () =>
  [...document.querySelectorAll('g.orb .orbit-health')].map((t) => t.textContent);

beforeEach(() => {
  useAppsStore.setState(useAppsStore.getInitialState());
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
  reconnectIfClosed.mockClear();
  // O jsdom não tem canvas 2D (e reclama "Not implemented" no console); céu e sucção rodam sem contexto.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('sem rede no teste'))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GalaxyPage', () => {
  it('mostra o cabeçalho da galáxia', () => {
    renderGalaxy();
    expect(screen.getByText('Centro de Controle')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Galáxia de Órbitas' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cada órbita é um sistema de aplicações. Clique em uma para ver os detalhes.',
      ),
    ).toBeInTheDocument();
  });

  it('sem órbitas, mostra só a galáxia e o botão +, sem mensagem', () => {
    renderGalaxy();
    expect(screen.queryByText(/Nenhuma órbita ainda/)).toBeNull();
    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Adicionar aplicação' })).toBeInTheDocument();
  });

  it('sem apps e com a API fora, só o aviso da tempestade', () => {
    useConnectionStore.setState({ apiDown: true });
    renderGalaxy();
    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
    expect(
      screen.getByText('Nenhuma checagem foi concluída ainda. Tentando reconectar…'),
    ).toBeInTheDocument();
  });

  it('com órbitas, um sistema por órbita com a legenda de saúde', () => {
    useAppsStore.setState({ apps: APPS });
    useStatusStore.setState({ status: { '1': 'unhealthy', '2': 'degraded', '3': 'healthy' } });
    renderGalaxy();
    expect(screen.queryByText(/Nenhuma órbita ainda/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Abrir a órbita Dream team' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir a órbita Core' })).toBeInTheDocument();
    expect(health()).toEqual(['1 FORA1 DEGRADADO', 'TODAS NO AR']);
  });

  it('um status novo atualiza a legenda', () => {
    useAppsStore.setState({ apps: APPS });
    renderGalaxy();
    expect(health()).toEqual(['VERIFICANDO', 'VERIFICANDO']);
    act(() => {
      useStatusStore.setState({ status: { '3': 'healthy' } });
    });
    expect(health()).toEqual(['VERIFICANDO', 'TODAS NO AR']);
  });

  it('API fora: legenda ÚLTIMO e o aviso da galáxia com Tentar agora', async () => {
    useAppsStore.setState({ apps: APPS });
    useStatusStore.setState({ status: { '1': 'unhealthy', '3': 'healthy' } });
    useConnectionStore.setState({ apiDown: true });
    renderGalaxy();
    expect(health()).toEqual(['ÚLTIMO: 1 FORA', 'ÚLTIMO: NO AR']);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('TEMPESTADE · API INACESSÍVEL');
    expect(alert).toHaveTextContent('Nenhuma checagem foi concluída ainda. Tentando reconectar…');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    expect(reconnectIfClosed).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('status antigo da carga fica ÚLTIMO até o primeiro evento do servidor', () => {
    useAppsStore.setState({ apps: APPS });
    useStatusStore.setState({
      status: { '1': 'unhealthy', '3': 'healthy' },
      staleEnvs: ['dev', 'hml', 'prd'],
    });
    renderGalaxy();
    expect(health()).toEqual(['ÚLTIMO: 1 FORA', 'ÚLTIMO: NO AR']);
    act(() => {
      useStatusStore.getState().applySnapshot(
        {
          type: 'snapshot',
          env: 'dev',
          apps: [],
          cycle: null,
          nextCheckAt: null,
        },
        APPS,
      );
    });
    expect(health()).toEqual(['1 FORA', 'TODAS NO AR']);
  });

  it('o switch alterna o tema', async () => {
    renderGalaxy();
    const sw = screen.getByRole('switch', { name: /DARK/ });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(usePreferencesStore.getState().theme).toBe('light');
    expect(screen.getByRole('switch', { name: /LIGHT/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('clicar numa órbita abre o painel dela; voltar remonta a galáxia limpa', async () => {
    useAppsStore.setState({ apps: APPS });
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
    const router = renderGalaxy();
    fireEvent.click(screen.getByRole('link', { name: 'Abrir a órbita Dream team' }));
    // A navegação só acontece no fim da sucção.
    act(() => {
      vi.advanceTimersByTime(ENTER_MS + 50);
    });
    expect(screen.getByText('painel aberto')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?orbita=dream-team');
    await act(() => router.navigate(-1));
    const orbs = [...document.querySelectorAll<SVGGElement>('g.orb')];
    expect(orbs).toHaveLength(2);
    orbs.forEach((g) => {
      expect(g.style.opacity).toBe('');
    });
    const veil = screen.getByTestId('galaxy-veil');
    expect(veil.style.opacity).toBe('');
  });
});
