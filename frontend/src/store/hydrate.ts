import { initialDownSeen, initialStaleEnvs } from '../domain/status-diff';
import { readCache } from '../storage/cache';
import { readFlag, readLastOk, readEnv, readTheme } from '../storage/preferences';
import { useAppsStore } from './apps.store';
import { useConnectionStore } from './connection.store';
import { usePreferencesStore } from './preferences.store';
import { useStatusStore } from './status.store';

interface HydrateOptions {
  /** O alerta salvo só vale se o navegador ainda der permissão de notificação. */
  notifyAllowed?: boolean;
}

// Devolve às stores o que o navegador guardou, como o legado fazia no mount. Só
// lê: não grava nada, e pode rodar duas vezes (duplo mount do StrictMode).
export function hydrateStores(now: number, { notifyAllowed = false }: HydrateOptions = {}): void {
  // Ids órfãos (app removida em outra aba ou por outra pessoa) já saem na leitura.
  const { apps, status, ts } = readCache();
  useAppsStore.getState().hydrate(apps);
  useStatusStore.getState().hydrate({
    status,
    ts,
    // Status antigo vale por ambiente: cada um sai do "último conhecido" no primeiro snapshot ou ciclo.
    staleEnvs: initialStaleEnvs(status, ts, now),
    downSeen: initialDownSeen(status),
  });
  useConnectionStore.getState().hydrate(readLastOk());
  usePreferencesStore.getState().hydrate({
    theme: readTheme(),
    env: readEnv(),
    notify: readFlag('notify') && notifyAllowed,
    sound: readFlag('sound'),
  });
}
