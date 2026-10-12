// Tipos do contrato com a API (conferidos contra api/src: applications.controller,
// snapshot.service, scheduler.service e health-check.service). Todas as datas
// chegam como string ISO 8601 (new Date().toISOString() no servidor).

/** Código curto de ambiente usado pela UI. */
export type EnvCode = 'dev' | 'hml' | 'prd';
/** Nome do ambiente na API, no path e na coleção do Mongo. */
export type ApiEnv = 'development' | 'staging' | 'production';
export type Status = 'healthy' | 'degraded' | 'unhealthy';

/** Último status conhecido de cada app, por id. */
export type StatusMap = Record<string, Status>;

/** Aplicação como o frontend a guarda (e como fica no cache `orbital-apps-v1`). */
export interface Application {
  id: string;
  env: EnvCode;
  name: string;
  team: string;
  healthCheckUrl: string;
  /** Vazio quando a app não tem Swagger. */
  swaggerUrl: string;
  orbits: string[];
}

/**
 * Documento cru de `GET /applications` e das respostas de create/update.
 * O Mongo guarda só o que foi cadastrado: `swaggerUrl` (opcional na entrada) e
 * `orbits` (apps anteriores às órbitas) podem faltar, e `swaggerUrl` pode vir
 * vazio. Quem converte para `Application` é o parse da camada api.
 */
export interface ApiApplication {
  id: string;
  name: string;
  team: string;
  healthCheckUrl: string;
  swaggerUrl?: string;
  orbits?: string[];
}

/** `GET /applications`: lista de cada ambiente, pelo nome da API. */
export type ApplicationsResponse = Record<ApiEnv, ApiApplication[]>;

/** Quem disparou o ciclo: o relógio do servidor ou `POST …/sync`. */
export type CycleTrigger = 'scheduled' | 'manual';

/** Evento `cycle`: resumo ao fim de cada ciclo (também vem dentro do snapshot). */
export interface CycleEvent {
  env: ApiEnv;
  trigger: CycleTrigger;
  checked: number;
  changed: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  startedAt: string;
  checkedAt: string;
  durationMs: number;
  nextCheckAt: string | null;
}

/** Uma app dentro do snapshot: igual a um `status` mas sem ter sido checada ainda. */
export interface SnapshotApp {
  id: string;
  name: string;
  env: ApiEnv;
  /** `[]` quando o documento não tem órbitas. */
  orbits: string[];
  /** `null` enquanto a app nunca foi checada. */
  status: Status | null;
  /** `null` sem checagem ou quando a rede falhou (não houve resposta). */
  latencyMs: number | null;
  /** Só quando `degraded`. */
  limitMs?: number;
  checkedAt: string | null;
}

/** Evento `snapshot`: um por ambiente ao conectar. */
export interface SnapshotEvent {
  env: ApiEnv;
  apps: SnapshotApp[];
  /** Último ciclo, ou `null` se ainda não houve. */
  cycle: CycleEvent | null;
  /** `null` antes de o agendador iniciar. */
  nextCheckAt: string | null;
}

/** Evento `status`: resultado de uma checagem, publicado assim que ela termina. */
export interface StatusEvent {
  id: string;
  name: string;
  env: ApiEnv;
  status: Status;
  /** `null` quando não houve resposta (erro de rede ou timeout). */
  latencyMs: number | null;
  /** Só quando `degraded`. */
  limitMs?: number;
  checkedAt: string;
}

/** Resposta 202 de `POST /applications/:env/sync`. */
export interface SyncResponse {
  env: ApiEnv;
  trigger: CycleTrigger;
  startedAt: string;
  nextCheckAt: string | null;
  /** `true` quando entrou num ciclo que já estava rodando. */
  joined: boolean;
}

/** Corpo do 400 de create/update. */
export interface ApiValidationError {
  error: string;
  fields: Record<string, string>;
}
