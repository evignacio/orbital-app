import { create } from 'zustand';
import { listApplications } from '../api/applications';
import type { Application, EnvCode } from '../domain/types';
import { writeAppsCache } from '../storage/cache';
import { appsIn } from './selectors';
import { useStatusStore } from './status.store';

export { appsIn };

interface AppsState {
  apps: Application[];
}

interface AppsActions {
  /**
   * GET /applications é a fonte da lista. Chamadas simultâneas dividem a mesma
   * requisição. Devolve `false` se a API não respondeu (a lista fica como estava).
   */
  loadApps: () => Promise<boolean>;
  /**
   * Único caminho de uma lista nova para o estado (GET, cadastro, remoção): status
   * e alertas ficam só com ids que seguem na lista e o cache local é regravado.
   */
  commitApps: (apps: Application[]) => void;
  appsIn: (env: EnvCode) => Application[];
  /** Carga inicial: não grava, só devolve ao estado o que já estava no cache. */
  hydrate: (apps: Application[]) => void;
}

// Fora do estado: é só a requisição em voo, que não desenha nada.
let inflight: Promise<boolean> | null = null;

export const useAppsStore = create<AppsState & AppsActions>()((set, get) => ({
  apps: [],

  loadApps: () => {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        get().commitApps(await listApplications());
        return true;
      } catch {
        return false;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  commitApps: (apps) => {
    writeAppsCache(apps);
    useStatusStore.getState().pruneTo(new Set(apps.map((a) => a.id)));
    set({ apps });
  },
  appsIn: (env) => appsIn(get().apps, env),
  hydrate: (apps) => {
    set({ apps });
  },
}));
