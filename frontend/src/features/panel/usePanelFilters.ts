import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { collectOrbits, inOrbit, orbitKey, type Orbit } from '@/domain/orbits';
import type { Application, EnvCode } from '@/domain/types';
import { appsIn, useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import { usePanelStore, type StatusFilter } from './panel.store';

/** Cards por página da lista. */
export const PAGE_SIZE = 3;

export interface PanelFilters {
  /** Ambiente na tela (preferences store, orbital-env-v1). */
  env: EnvCode;
  /** Chave do ?orbita= (orbitKey), '' sem filtro de órbita. */
  orbit: string;
  /** A órbita do filtro com o nome na grafia das apps; sem app nela, a própria chave. */
  currentOrbit: Orbit | null;
  /** Ambiente da tela ∩ órbita: o que estatísticas, órbita, lista e remoção mostram. */
  envApps: Application[];
  /** envApps pela busca e pelo filtro de status: o que a lista e os planetas mostram. */
  visibleApps: Application[];
  /** A fatia de visibleApps da página atual. */
  pagedApps: Application[];
  query: string;
  filter: StatusFilter;
  /** Página atual, já limitada a [0, pageCount - 1]. */
  page: number;
  /** Ao menos 1, mesmo com a lista vazia. */
  pageCount: number;
  selectedId: string | null;
  /** API fora ou status antigo no ambiente da tela: visual "último conhecido". */
  stale: boolean;
  setEnv: (env: EnvCode) => void;
  setQuery: (query: string) => void;
  setFilter: (filter: StatusFilter) => void;
  setPage: (page: number) => void;
  /** fromOrbit: o clique veio de um planeta, então a lista pula para a página dele. */
  select: (id: string, fromOrbit?: boolean) => void;
}

// O status só entra no cálculo com um filtro de status ligado: sem ele, um evento
// de status não re-renderiza a página inteira (só o card e o planeta afetados).
const NO_STATUS = {};

/** Lógica de tela do painel. */
export function usePanelFilters(): PanelFilters {
  const [params] = useSearchParams();
  const orbit = orbitKey(params.get('orbita') ?? '');
  const apps = useAppsStore((s) => s.apps);
  const env = usePreferencesStore((s) => s.env);
  const query = usePanelStore((s) => s.query);
  const filter = usePanelStore((s) => s.filter);
  const requestedPage = usePanelStore((s) => s.page);
  const selectedId = usePanelStore((s) => s.selectedId);
  const status = useStatusStore((s) => (filter === 'all' ? NO_STATUS : s.status));
  const apiDown = useConnectionStore((s) => s.apiDown);
  const envStale = useStatusStore((s) => s.staleEnvs.includes(env));

  const currentOrbit = useMemo(
    () =>
      orbit
        ? (collectOrbits(apps).find((o) => o.key === orbit) ?? { key: orbit, name: orbit })
        : null,
    [apps, orbit],
  );

  const envApps = useMemo(() => {
    const inEnv = appsIn(apps, env);
    return orbit ? inEnv.filter((a) => inOrbit(a, orbit)) : inEnv;
  }, [apps, env, orbit]);

  const visibleApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const st: Partial<Record<string, string>> = status;
    return envApps.filter(
      (a) =>
        (filter === 'all' || st[a.id] === filter) &&
        (!q || `${a.name} ${a.team}`.toLowerCase().includes(q)),
    );
  }, [envApps, query, filter, status]);

  const pageCount = Math.max(1, Math.ceil(visibleApps.length / PAGE_SIZE));
  const page = Math.min(Math.max(requestedPage, 0), pageCount - 1);
  const pagedApps = useMemo(
    () => visibleApps.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [visibleApps, page],
  );

  const setEnv = useCallback((next: EnvCode) => {
    usePreferencesStore.getState().setEnv(next);
    usePanelStore.getState().resetForEnv();
  }, []);

  const select = useCallback(
    (id: string, fromOrbit = false) => {
      // Os planetas saem do mesmo visibleApps da lista: o clicado está nela, só falta a página.
      const i = fromOrbit ? visibleApps.findIndex((a) => a.id === id) : -1;
      usePanelStore.getState().setSelected(id, i >= 0 ? Math.floor(i / PAGE_SIZE) : undefined);
    },
    [visibleApps],
  );

  const { setQuery, setFilter, setPage } = usePanelStore.getState();

  return {
    env,
    orbit,
    currentOrbit,
    envApps,
    visibleApps,
    pagedApps,
    query,
    filter,
    page,
    pageCount,
    selectedId,
    stale: apiDown || envStale,
    setEnv,
    setQuery,
    setFilter,
    setPage,
    select,
  };
}
