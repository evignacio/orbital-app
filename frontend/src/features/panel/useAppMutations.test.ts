import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Application } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import { useAppMutations } from './useAppMutations';

function app(id: string, extra: Partial<Application> = {}): Application {
  return {
    id,
    env: 'prd',
    name: `app-${id}`,
    team: 'Pagamentos',
    healthCheckUrl: `http://${id}/health`,
    swaggerUrl: '',
    orbits: ['Dream team'],
    ...extra,
  };
}

function mutations() {
  return renderHook(() => useAppMutations()).result.current;
}

beforeEach(() => {
  useAppsStore.setState({ ...useAppsStore.getInitialState(), apps: [app('a'), app('b')] });
  useStatusStore.setState({
    ...useStatusStore.getInitialState(),
    status: { a: 'unhealthy', b: 'healthy' },
    downSeen: new Set(['a']),
  });
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
});

describe('useAppMutations', () => {
  it('onCreated põe a app no fim da lista, grava o cache e leva a tela ao ambiente dela', () => {
    mutations().onCreated(app('c', { env: 'hml' }));
    expect(useAppsStore.getState().apps.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(JSON.parse(localStorage.getItem('orbital-apps-v1') ?? '[]')).toHaveLength(3);
    expect(usePreferencesStore.getState().env).toBe('hml');
    expect(localStorage.getItem('orbital-env-v1')).toBe('hml');
  });

  it('onCreated com um id já listado não duplica a app', () => {
    mutations().onCreated(app('a', { name: 'renomeada' }));
    const apps = useAppsStore.getState().apps;
    expect(apps.map((a) => a.id)).toEqual(['b', 'a']);
    expect(apps[1]?.name).toBe('renomeada');
  });

  it('onUpdated troca a app no mesmo lugar e mantém o status com a mesma URL', () => {
    mutations().onUpdated(app('a', { team: 'Outro time' }));
    const apps = useAppsStore.getState().apps;
    expect(apps.map((a) => a.id)).toEqual(['a', 'b']);
    expect(apps[0]?.team).toBe('Outro time');
    expect(useStatusStore.getState().status).toEqual({ a: 'unhealthy', b: 'healthy' });
    expect(useStatusStore.getState().downSeen.has('a')).toBe(true);
  });

  it('onUpdated com URL de health check nova volta a app a "não verificado"', () => {
    mutations().onUpdated(app('a', { healthCheckUrl: 'http://novo/health' }));
    expect(useAppsStore.getState().apps[0]?.healthCheckUrl).toBe('http://novo/health');
    expect(useStatusStore.getState().status).toEqual({ b: 'healthy' });
    expect(useStatusStore.getState().downSeen.has('a')).toBe(false);
    expect(JSON.parse(localStorage.getItem('orbital-status-v1') ?? '{}')).toMatchObject({
      status: { b: 'healthy' },
    });
  });

  it('onUpdated de uma app que sumiu da lista a acrescenta no fim', () => {
    mutations().onUpdated(app('z'));
    expect(useAppsStore.getState().apps.map((a) => a.id)).toEqual(['a', 'b', 'z']);
  });

  it('não troca o ambiente da tela na edição', () => {
    usePreferencesStore.getState().setEnv('dev');
    mutations().onUpdated(app('a'));
    expect(usePreferencesStore.getState().env).toBe('dev');
  });
});
