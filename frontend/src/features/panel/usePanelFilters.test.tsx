import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Application, EnvCode, StatusMap } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import { usePanelStore } from './panel.store';
import { PAGE_SIZE, usePanelFilters } from './usePanelFilters';
import { usePanelLifecycle } from './usePanelLifecycle';

function mk(id: string, env: EnvCode, orbits: string[], team = 'time'): Application {
  return {
    id,
    env,
    name: `app-${id}`,
    team,
    healthCheckUrl: `http://${id}`,
    swaggerUrl: '',
    orbits,
  };
}

const APPS: Application[] = [
  mk('1', 'prd', ['Dream team'], 'Pagamentos'),
  mk('2', 'prd', ['Dream team']),
  mk('3', 'prd', ['Outra']),
  mk('4', 'prd', ['Dream team']),
  mk('5', 'prd', ['Dream team']),
  mk('6', 'hml', ['Dream team']),
];

function setup(url = '/painel', status: StatusMap = {}) {
  useAppsStore.setState({ apps: APPS });
  useStatusStore.setState({ status });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(() => usePanelFilters(), { wrapper });
}

beforeEach(() => {
  useAppsStore.setState(useAppsStore.getInitialState());
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
  usePanelStore.setState(usePanelStore.getInitialState());
});

describe('usePanelFilters', () => {
  it('a página tem 3 cards, como o PAGE_SIZE do legado', () => {
    expect(PAGE_SIZE).toBe(3);
  });

  it('sem ?orbita mostra o ambiente inteiro e o título padrão', () => {
    const { result } = setup();
    expect(result.current.orbit).toBe('');
    expect(result.current.currentOrbit).toBeNull();
    expect(result.current.envApps.map((a) => a.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('?orbita filtra o ambiente pela chave e devolve o nome na grafia das apps', () => {
    const { result } = setup('/painel?orbita=Dream%20Team');
    expect(result.current.orbit).toBe('dream-team');
    expect(result.current.currentOrbit).toEqual({ key: 'dream-team', name: 'Dream team' });
    expect(result.current.envApps.map((a) => a.id)).toEqual(['1', '2', '4', '5']);
  });

  it('órbita sem nenhuma app usa a própria chave como nome', () => {
    const { result } = setup('/painel?orbita=vazia');
    expect(result.current.currentOrbit).toEqual({ key: 'vazia', name: 'vazia' });
    expect(result.current.envApps).toEqual([]);
  });

  it('busca por nome ou time, sem diferenciar maiúsculas', () => {
    const { result } = setup();
    act(() => {
      result.current.setQuery('  PAGAM ');
    });
    expect(result.current.visibleApps.map((a) => a.id)).toEqual(['1']);
    act(() => {
      result.current.setQuery('app-3');
    });
    expect(result.current.visibleApps.map((a) => a.id)).toEqual(['3']);
  });

  it('filtro de status deixa só as apps com aquele status', () => {
    const { result } = setup('/painel', { '1': 'healthy', '2': 'unhealthy', '3': 'unhealthy' });
    act(() => {
      result.current.setFilter('unhealthy');
    });
    expect(result.current.visibleApps.map((a) => a.id)).toEqual(['2', '3']);
    act(() => {
      result.current.setFilter('all');
    });
    expect(result.current.visibleApps).toHaveLength(5);
  });

  it('pagina a lista visível e limita a página ao total', () => {
    const { result } = setup();
    expect(result.current.pageCount).toBe(2);
    expect(result.current.pagedApps.map((a) => a.id)).toEqual(['1', '2', '3']);
    act(() => {
      result.current.setPage(1);
    });
    expect(result.current.pagedApps.map((a) => a.id)).toEqual(['4', '5']);
    act(() => {
      result.current.setPage(9);
    });
    expect(result.current.page).toBe(1);
  });

  it('lista vazia tem uma página', () => {
    const { result } = setup('/painel?orbita=vazia');
    expect(result.current.pageCount).toBe(1);
    expect(result.current.page).toBe(0);
  });

  it('select vindo da órbita pula para a página do item; vindo do card, não', () => {
    const { result } = setup();
    act(() => {
      result.current.select('5');
    });
    expect(result.current.selectedId).toBe('5');
    expect(result.current.page).toBe(0);
    act(() => {
      result.current.select('4', true);
    });
    expect(result.current.selectedId).toBe('4');
    expect(result.current.page).toBe(1);
  });

  it('setEnv persiste o ambiente e zera página e seleção', () => {
    const { result } = setup();
    act(() => {
      result.current.setPage(1);
      result.current.select('4');
    });
    act(() => {
      result.current.setEnv('hml');
    });
    expect(result.current.env).toBe('hml');
    expect(localStorage.getItem('orbital-env-v1')).toBe('hml');
    expect(result.current.page).toBe(0);
    expect(result.current.selectedId).toBeNull();
    expect(result.current.envApps.map((a) => a.id)).toEqual(['6']);
  });

  it('stale com a API fora ou com o ambiente da tela com status antigo', () => {
    const { result } = setup();
    expect(result.current.stale).toBe(false);
    act(() => {
      useStatusStore.setState({ staleEnvs: ['hml'] });
    });
    expect(result.current.stale).toBe(false);
    act(() => {
      useStatusStore.setState({ staleEnvs: ['prd'] });
    });
    expect(result.current.stale).toBe(true);
    act(() => {
      useStatusStore.setState({ staleEnvs: [] });
      useConnectionStore.setState({ apiDown: true });
    });
    expect(result.current.stale).toBe(true);
  });
});

describe('usePanelLifecycle', () => {
  it('uma lista nova sem a app selecionada ou pendente solta seleção e remoção', () => {
    useAppsStore.setState({ apps: APPS });
    const { unmount } = renderHook(() => {
      usePanelLifecycle();
    });
    act(() => {
      usePanelStore.getState().setSelected('1');
      usePanelStore.getState().requestRemove('2');
    });
    act(() => {
      useAppsStore.getState().commitApps(APPS.filter((a) => a.id !== '2'));
    });
    expect(usePanelStore.getState()).toMatchObject({ selectedId: '1', pendingRemoveId: null });
    act(() => {
      useAppsStore.getState().commitApps([]);
    });
    expect(usePanelStore.getState().selectedId).toBeNull();
    unmount();
  });

  it('ao desmontar a página o estado do painel volta ao inicial', () => {
    const { unmount } = renderHook(() => {
      usePanelLifecycle();
    });
    act(() => {
      usePanelStore.getState().setQuery('x');
      usePanelStore.getState().openCreate();
    });
    unmount();
    expect(usePanelStore.getState()).toMatchObject({ query: '', formOpen: false });
  });
});
