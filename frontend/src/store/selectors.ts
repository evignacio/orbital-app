import type { Application, EnvCode } from '../domain/types';

// Fora de apps.store.ts para que status.store.ts o use sem importar a store de apps
// (que já importa a de status).
export function appsIn(apps: readonly Application[], env: EnvCode): Application[] {
  return apps.filter((a) => a.env === env);
}
