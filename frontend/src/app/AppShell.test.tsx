import { act, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '../../test/setup';
import { AppShell } from '@/app/AppShell';
import { statusText } from '@/domain/status';
import { useEventStreamControls } from '@/hooks/EventStreamContext';
import * as cache from '@/storage/cache';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';

const CHECKED_AT = '2026-01-01T00:00:10.000Z';

function apiResponse(): Response {
  return new Response(
    JSON.stringify({
      production: [
        { id: 'a', name: 'app-a', team: 'time-a', healthCheckUrl: 'http://a', orbits: ['Core'] },
        { id: 'b', name: 'app-b', team: 'time-b', healthCheckUrl: 'http://b', orbits: ['Core'] },
      ],
      staging: [],
      development: [],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const fetchMock = vi.fn();

// Página mínima sob o AppShell: cada linha lê só o seu status (seletor por item).
function StatusRow({ id, name }: { id: string; name: string }) {
  const status = useStatusStore((s) => s.status[id]);
  return (
    <li>
      {name}: {statusText(status)}
    </li>
  );
}

function ProbePage() {
  const apps = useAppsStore((s) => s.apps);
  const apiDown = useConnectionStore((s) => s.apiDown);
  const { reconnectIfClosed } = useEventStreamControls();
  return (
    <main>
      <p>API: {apiDown ? 'inacessível' : 'no ar'}</p>
      {apiDown && (
        <button type="button" onClick={reconnectIfClosed}>
          Tentar agora
        </button>
      )}
      <ul>
        {apps.map((a) => (
          <StatusRow key={a.id} id={a.id} name={a.name} />
        ))}
      </ul>
    </main>
  );
}

function renderShell(strict = false) {
  const router = createMemoryRouter(
    [{ element: <AppShell />, children: [{ path: '/painel', element: <ProbePage /> }] }],
    { initialEntries: ['/painel'] },
  );
  const tree = <RouterProvider router={router} />;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

// Espera a carga inicial (GET /applications) terminar e a lista chegar à tela.
async function appsLoaded() {
  await screen.findByText(/app-a/);
}

function row(name: string): HTMLElement {
  const el = screen.getByText(new RegExp(name)).closest('li');
  if (!el) throw new Error(`Linha de ${name} não encontrada`);
  return el;
}

beforeEach(() => {
  useAppsStore.setState(useAppsStore.getInitialState());
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(apiResponse()));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('carrega a lista e mostra o status do snapshot', async () => {
    renderShell();
    await appsLoaded();
    expect(within(row('app-a')).getByText(/VERIFICANDO/)).toBeInTheDocument();
    act(() => {
      FakeEventSource.last().emitOpen();
      FakeEventSource.last().emit('snapshot', {
        env: 'production',
        apps: [
          { id: 'a', name: 'app-a', status: 'healthy' },
          { id: 'b', name: 'app-b', status: 'unhealthy' },
        ],
        cycle: null,
        nextCheckAt: null,
      });
    });
    expect(row('app-a')).toHaveTextContent('NO AR');
    expect(row('app-b')).toHaveTextContent('FORA DO AR');
  });

  it('um evento de status muda só o item correspondente', async () => {
    renderShell();
    await appsLoaded();
    act(() => {
      FakeEventSource.last().emit('snapshot', {
        env: 'production',
        apps: [
          { id: 'a', name: 'app-a', status: 'healthy' },
          { id: 'b', name: 'app-b', status: 'healthy' },
        ],
        cycle: null,
        nextCheckAt: null,
      });
    });
    const itemB = row('app-b');
    act(() => {
      FakeEventSource.last().emit('status', {
        env: 'production',
        id: 'a',
        name: 'app-a',
        status: 'unhealthy',
        latencyMs: null,
        checkedAt: CHECKED_AT,
      });
    });
    expect(row('app-a')).toHaveTextContent('FORA DO AR');
    expect(row('app-b')).toHaveTextContent('NO AR');
    // O nó da linha de b é o mesmo: não foi recriado.
    expect(row('app-b')).toBe(itemB);
  });

  it('no StrictMode fica um único EventSource aberto', async () => {
    const { unmount } = renderShell(true);
    await appsLoaded();
    const abertos = () =>
      FakeEventSource.instances.filter((e) => e.readyState !== FakeEventSource.CLOSED);
    expect(abertos()).toHaveLength(1);
    unmount();
    expect(abertos()).toHaveLength(0);
  });

  it('limpa as chaves obsoletas do localStorage ao montar', async () => {
    const spy = vi.spyOn(cache, 'clearObsoleteKeys');
    localStorage.setItem('orbital-counters-v1', '{}');
    renderShell();
    await appsLoaded();
    expect(spy).toHaveBeenCalled();
    expect(localStorage.getItem('orbital-counters-v1')).toBeNull();
  });

  it('hidrata a lista do cache antes da API responder', async () => {
    // Requisição em voo: resolvida no fim para não deixar a carga compartilhada da store pendurada.
    let finish: (r: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    cache.writeAppsCache([
      {
        id: 'a',
        env: 'prd',
        name: 'app-a',
        team: 'time-a',
        healthCheckUrl: 'http://a',
        swaggerUrl: '',
        orbits: ['Core'],
      },
    ]);
    renderShell();
    expect(screen.getByText(/app-a/)).toBeInTheDocument();
    act(() => {
      finish(apiResponse());
    });
    // app-b só existe na resposta da API: a carga terminou.
    await screen.findByText(/app-b/);
  });

  it('acende a tempestade se a carga inicial falha', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('rede')));
    renderShell();
    await screen.findByText(/inacessível/);
    expect(useConnectionStore.getState().apiDown).toBe(true);
    expect(document.documentElement.dataset.storm).toBe('on');
  });

  it('o botão Tentar agora reabre o stream CLOSED pelo contexto', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('rede')));
    renderShell();
    const botao = await screen.findByRole('button', { name: 'Tentar agora' });
    const first = FakeEventSource.last();
    act(() => {
      first.close();
      first.onerror?.(new Event('error'));
    });
    act(() => {
      botao.click();
    });
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
