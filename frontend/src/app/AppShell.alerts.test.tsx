import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '../../test/setup';
import { AppShell } from '@/app/AppShell';
import { ALERT_BATCH_MS } from '@/hooks/useDownAlerts';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';

// Notificação falsa com permissão concedida: cada `new` é um alerta que saiu.
class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static titles: string[] = [];
  onclick: (() => void) | null = null;
  constructor(title: string) {
    FakeNotification.titles.push(title);
  }
  close(): void {
    // nada a fechar
  }
}

function apiResponse(): Response {
  return new Response(
    JSON.stringify({
      production: [
        { id: 'a', name: 'app-a', team: 'time-a', healthCheckUrl: 'http://a', orbits: ['Core'] },
      ],
      staging: [],
      development: [],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function Probe() {
  const n = useAppsStore((s) => s.apps.length);
  return <p>{n} apps</p>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Probe /> },
          { path: '/painel', element: <Probe /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

function fall() {
  act(() => {
    FakeEventSource.last().emit('status', {
      env: 'production',
      id: 'a',
      name: 'app-a',
      status: 'unhealthy',
      latencyMs: null,
      checkedAt: '2026-01-01T00:00:10.000Z',
    });
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  useAppsStore.setState(useAppsStore.getInitialState());
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
  FakeNotification.titles = [];
  vi.stubGlobal('Notification', FakeNotification);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(apiResponse())),
  );
  // Fora de foco: é quando os alertas saem.
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  localStorage.setItem('orbital-notify-v1', '1');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AppShell: alertas só no painel', () => {
  it('na /painel, uma queda vira notificação', async () => {
    renderAt('/painel');
    await screen.findByText('1 apps');
    fall();
    await waitFor(() => {
      expect(FakeNotification.titles).toEqual(['app-a saiu de órbita']);
    });
  });

  it('na galáxia (/), a queda atualiza o status mas não alerta', async () => {
    renderAt('/');
    await screen.findByText('1 apps');
    fall();
    await wait(ALERT_BATCH_MS + 100);
    expect(FakeNotification.titles).toEqual([]);
    expect(useStatusStore.getState().status.a).toBe('unhealthy');
    // A queda foi vista: ao abrir o painel ela não alerta de novo.
    expect(useStatusStore.getState().downSeen.has('a')).toBe(true);
  });

  it('a API caindo na galáxia não alerta', async () => {
    renderAt('/');
    await screen.findByText('1 apps');
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(FakeNotification.titles).toEqual([]);
  });

  it('a API caindo na /painel alerta uma vez', async () => {
    renderAt('/painel');
    await screen.findByText('1 apps');
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(FakeNotification.titles).toEqual(['Tempestade: Orbital perdeu contato com a API']);
  });
});
