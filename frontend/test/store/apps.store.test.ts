import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@/domain/types';
import { appsIn, useAppsStore } from '@/store/apps.store';
import { useStatusStore } from '@/store/status.store';

function app(id: string, env: Application['env'] = 'prd'): Application {
  return {
    id,
    env,
    name: `app-${id}`,
    team: 'Time',
    healthCheckUrl: `https://x/${id}`,
    swaggerUrl: '',
    orbits: ['Dream team'],
  };
}

beforeEach(() => {
  useAppsStore.setState(useAppsStore.getInitialState());
  useStatusStore.setState(useStatusStore.getInitialState());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('commitApps', () => {
  it('guarda a lista e grava orbital-apps-v1', () => {
    useAppsStore.getState().commitApps([app('a'), app('b', 'dev')]);
    expect(useAppsStore.getState().apps.map((a) => a.id)).toEqual(['a', 'b']);
    const saved = JSON.parse(localStorage.getItem('orbital-apps-v1') ?? 'null') as Application[];
    expect(saved.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('descarta status e downSeen órfãos e regrava orbital-status-v1 com o ts atual', () => {
    useStatusStore.setState({
      status: { a: 'healthy', gone: 'unhealthy' },
      ts: 123,
      downSeen: new Set(['gone']),
    });
    useAppsStore.getState().commitApps([app('a')]);
    expect(useStatusStore.getState().status).toEqual({ a: 'healthy' });
    expect([...useStatusStore.getState().downSeen]).toEqual([]);
    expect(localStorage.getItem('orbital-status-v1')).toBe('{"status":{"a":"healthy"},"ts":123}');
  });
});

describe('appsIn', () => {
  it('filtra a lista por ambiente', () => {
    useAppsStore.getState().commitApps([app('a'), app('b', 'dev'), app('c')]);
    expect(appsIn(useAppsStore.getState().apps, 'prd').map((a) => a.id)).toEqual(['a', 'c']);
    expect(
      useAppsStore
        .getState()
        .appsIn('dev')
        .map((a) => a.id),
    ).toEqual(['b']);
  });
});

describe('loadApps', () => {
  const body = {
    development: [],
    staging: [],
    production: [{ id: 'p1', name: 'n', team: 't', healthCheckUrl: 'https://x', orbits: ['O'] }],
  };

  it('busca a lista, confirma pelo commitApps e devolve true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body)))),
    );
    await expect(useAppsStore.getState().loadApps()).resolves.toBe(true);
    expect(useAppsStore.getState().apps.map((a) => [a.id, a.env])).toEqual([['p1', 'prd']]);
    expect(localStorage.getItem('orbital-apps-v1')).not.toBeNull();
  });

  it('chamadas simultâneas dividem a mesma requisição', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body))));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([
      useAppsStore.getState().loadApps(),
      useAppsStore.getState().loadApps(),
    ]);
    expect([a, b]).toEqual([true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await useAppsStore.getState().loadApps();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('devolve false quando a API falha e mantém a lista', async () => {
    useAppsStore.getState().commitApps([app('a')]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(useAppsStore.getState().loadApps()).resolves.toBe(false);
    expect(useAppsStore.getState().apps.map((a) => a.id)).toEqual(['a']);
    // a falha libera a próxima tentativa
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body)))),
    );
    await expect(useAppsStore.getState().loadApps()).resolves.toBe(true);
  });
});
