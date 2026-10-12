import { act, renderHook } from '@testing-library/react';
import type { Application } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { useStatusStore } from '@/store/status.store';
import { useDocumentTitle } from './useDocumentTitle';

function app(id: string, env: Application['env']): Application {
  return {
    id,
    env,
    name: id,
    team: 'Time',
    healthCheckUrl: 'http://x',
    swaggerUrl: '',
    orbits: ['Dream team'],
  };
}

beforeEach(() => {
  useAppsStore.setState({
    apps: [app('a', 'prd'), app('b', 'hml'), app('c', 'dev')],
  });
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  document.title = '';
});

describe('useDocumentTitle', () => {
  it('usa o título base quando nada está fora do ar', () => {
    useStatusStore.setState({ status: { a: 'healthy', b: 'degraded' } });
    renderHook(() => {
      useDocumentTitle();
    });
    expect(document.title).toBe('Orbital - App');
  });

  it('conta as apps fora do ar de todos os ambientes', () => {
    useStatusStore.setState({ status: { a: 'unhealthy', b: 'unhealthy', c: 'healthy' } });
    renderHook(() => {
      useDocumentTitle();
    });
    expect(document.title).toBe('(2) ⚠ Orbital - App');
  });

  it('ignora status de apps que não estão mais na lista', () => {
    useStatusStore.setState({ status: { a: 'unhealthy', fantasma: 'unhealthy' } });
    renderHook(() => {
      useDocumentTitle();
    });
    expect(document.title).toBe('(1) ⚠ Orbital - App');
  });

  it('a tempestade vence a contagem', () => {
    useStatusStore.setState({ status: { a: 'unhealthy' } });
    renderHook(() => {
      useDocumentTitle();
    });
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(document.title).toBe('⛈ API inacessível · Orbital - App');
  });

  it('acompanha as mudanças de status', () => {
    renderHook(() => {
      useDocumentTitle();
    });
    expect(document.title).toBe('Orbital - App');
    act(() => {
      useStatusStore.setState({ status: { c: 'unhealthy' } });
    });
    expect(document.title).toBe('(1) ⚠ Orbital - App');
  });
});
