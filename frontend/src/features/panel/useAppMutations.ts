import type { Application } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';

export interface AppMutations {
  /** Cadastro feito: a app entra na lista e a tela vai para o ambiente dela (onAppCreated). */
  onCreated: (app: Application) => void;
  /** Edição feita: troca no lugar; URL de health check nova volta a "não verificado" (onAppUpdated). */
  onUpdated: (app: Application) => void;
}

// O legado (onAppCreated) só troca o ambiente: página e seleção ficam como estavam
// (a página é limitada pela lista nova e a seleção some se a app não estiver nela).
function onCreated(app: Application): void {
  const { apps, commitApps } = useAppsStore.getState();
  commitApps([...apps.filter((x) => x.id !== app.id), app]);
  usePreferencesStore.getState().setEnv(app.env);
}

// Com URL de health check nova a API apaga o último status, então aqui a app volta
// a "sem check" (e uma queda já alertada pode alertar de novo).
function onUpdated(app: Application): void {
  const { apps, commitApps } = useAppsStore.getState();
  const old = apps.find((x) => x.id === app.id);
  const next = old ? apps.map((x) => (x.id === app.id ? app : x)) : [...apps, app];
  if (old && old.healthCheckUrl !== app.healthCheckUrl) useStatusStore.getState().forget(app.id);
  commitApps(next);
}

const MUTATIONS: AppMutations = { onCreated, onUpdated };

/** Callbacks do formulário no painel. Sempre as mesmas funções. */
export function useAppMutations(): AppMutations {
  return MUTATIONS;
}
