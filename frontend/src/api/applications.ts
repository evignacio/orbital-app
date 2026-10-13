import { ENVS, ENV_TO_API } from '../domain/environments';
import { fromApi } from '../domain/migrations';
import type { ApiApplication, ApiEnv, Application, EnvCode, SyncResponse } from '../domain/types';
import { ApiContractError, apiFetch } from './http';

/** Corpo de create/update: o que o formulário envia (o env vai no path). */
export type ApplicationInput = Omit<Application, 'id' | 'env'>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isApiEnv(v: string): v is ApiEnv {
  return ENVS.some((e) => e.api === v);
}

// Sem id não há como listar nem remover depois, e sem os três textos não há o que
// mostrar: documento que não cumpre o contrato não entra.
function isApiApplication(v: unknown): v is ApiApplication {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    v.id !== '' &&
    typeof v.name === 'string' &&
    typeof v.team === 'string' &&
    typeof v.healthCheckUrl === 'string'
  );
}

// A resposta do GET traz uma lista por ambiente, pelo nome da API; a ordem dos
// ambientes é a que a API mandou.
export async function listApplications(): Promise<Application[]> {
  const data = await apiFetch<unknown>('/applications');
  if (!isRecord(data)) throw new ApiContractError('a API devolveu uma lista inválida.');
  const apps: Application[] = [];
  for (const [apiEnv, list] of Object.entries(data)) {
    if (!isApiEnv(apiEnv) || !Array.isArray(list)) continue;
    for (const doc of list as unknown[]) {
      if (isApiApplication(doc)) apps.push(fromApi(doc, apiEnv));
    }
  }
  return apps;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Create e update devolvem o documento gravado; é ele (com o id) que entra na lista.
async function save(
  method: 'POST' | 'PUT',
  env: EnvCode,
  path: string,
  data: ApplicationInput,
): Promise<Application> {
  const created = await apiFetch<unknown>(path, {
    method,
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!isApiApplication(created))
    throw new ApiContractError('a API não devolveu o id da aplicação.');
  return fromApi(created, ENV_TO_API[env]);
}

export function createApplication(env: EnvCode, data: ApplicationInput): Promise<Application> {
  return save('POST', env, `/applications/${ENV_TO_API[env]}`, data);
}

export function updateApplication(
  env: EnvCode,
  id: string,
  data: ApplicationInput,
): Promise<Application> {
  return save('PUT', env, `/applications/${ENV_TO_API[env]}/${encodeURIComponent(id)}`, data);
}

/** Lança ApiError; o 404 (já removida em outra aba) fica para quem chama decidir. */
export async function removeApplication(env: EnvCode, id: string): Promise<void> {
  await apiFetch<null>(`/applications/${ENV_TO_API[env]}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// Pede ao servidor um ciclo agora (202). O resultado chega pelo stream.
export function syncEnvironment(env: EnvCode): Promise<SyncResponse> {
  return apiFetch<SyncResponse>(`/applications/${ENV_TO_API[env]}/sync`, { method: 'POST' });
}
