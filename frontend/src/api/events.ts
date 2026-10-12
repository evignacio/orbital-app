import { API_TO_ENV } from '../domain/environments';
import { isStatus } from '../domain/status';
import type { CycleTrigger, EnvCode, Status } from '../domain/types';

// ?changes=true: depois do snapshot só chegam os status que mudaram (o cycle vem
// sempre); o painel só precisa do campo status.
export const EVENTS_URL = '/api/applications/events?changes=true';

// Eventos já validados: `env` é o código curto (no fio vem o nome da API) e as
// datas viram ms. Diferem dos tipos crus de domain/types.ts só nisso.

export interface CycleInfo {
  env: EnvCode;
  trigger: CycleTrigger;
  checked: number;
  changed: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  startedAt: number | null;
  checkedAt: number;
  durationMs: number;
  nextCheckAt: number | null;
}

export interface SnapshotApp {
  id: string;
  name: string;
  /** `null` enquanto a app nunca foi checada. */
  status: Status | null;
}

export interface SnapshotMsg {
  type: 'snapshot';
  env: EnvCode;
  apps: SnapshotApp[];
  /** Último ciclo do ambiente, `null` se ainda não houve. */
  cycle: CycleInfo | null;
  nextCheckAt: number | null;
}

export interface StatusMsg {
  type: 'status';
  env: EnvCode;
  id: string;
  name: string;
  status: Status;
  latencyMs: number | null;
  limitMs?: number;
  checkedAt: number | null;
}

export interface CycleMsg extends CycleInfo {
  type: 'cycle';
}

export type ServerEvent = SnapshotMsg | StatusMsg | CycleMsg;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function envOf(v: unknown): EnvCode | null {
  return typeof v === 'string' && Object.hasOwn(API_TO_ENV, v)
    ? API_TO_ENV[v as keyof typeof API_TO_ENV]
    : null;
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function dateMs(v: unknown): number | null {
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isNaN(ms) ? null : ms;
}

// Qualquer valor fora dos status conhecidos conta como fora do ar.
function statusOf(v: unknown): Status {
  return isStatus(v) ? v : 'unhealthy';
}

function parseCycle(raw: unknown, env: EnvCode): CycleInfo | null {
  if (!isRecord(raw)) return null;
  const checkedAt = dateMs(raw.checkedAt);
  if (checkedAt === null || typeof raw.checked !== 'number') return null;
  return {
    env,
    trigger: raw.trigger === 'manual' ? 'manual' : 'scheduled',
    checked: raw.checked,
    changed: count(raw.changed),
    healthy: count(raw.healthy),
    degraded: count(raw.degraded),
    unhealthy: count(raw.unhealthy),
    startedAt: dateMs(raw.startedAt),
    checkedAt,
    durationMs: count(raw.durationMs),
    nextCheckAt: dateMs(raw.nextCheckAt),
  };
}

function parseSnapshot(raw: Record<string, unknown>, env: EnvCode): SnapshotMsg | null {
  if (!Array.isArray(raw.apps)) return null;
  const apps: SnapshotApp[] = [];
  for (const a of raw.apps as unknown[]) {
    if (!isRecord(a) || typeof a.id !== 'string' || a.id === '') continue;
    apps.push({
      id: a.id,
      name: typeof a.name === 'string' ? a.name : '',
      status: a.status === null || a.status === undefined ? null : statusOf(a.status),
    });
  }
  return {
    type: 'snapshot',
    env,
    apps,
    cycle: parseCycle(raw.cycle, env),
    nextCheckAt: dateMs(raw.nextCheckAt),
  };
}

function parseStatus(raw: Record<string, unknown>, env: EnvCode): StatusMsg | null {
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  const msg: StatusMsg = {
    type: 'status',
    env,
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    status: statusOf(raw.status),
    latencyMs: typeof raw.latencyMs === 'number' ? raw.latencyMs : null,
    checkedAt: dateMs(raw.checkedAt),
  };
  if (typeof raw.limitMs === 'number') msg.limitMs = raw.limitMs;
  return msg;
}

// Corpo de um evento SSE; ilegível, de ambiente desconhecido ou fora do contrato
// vira null e o handler ignora.
export function parseEvent(type: string, data: string): ServerEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const env = envOf(raw.env);
  if (!env) return null;
  switch (type) {
    case 'snapshot':
      return parseSnapshot(raw, env);
    case 'status':
      return parseStatus(raw, env);
    case 'cycle': {
      const cycle = parseCycle(raw, env);
      return cycle && { type: 'cycle', ...cycle };
    }
    default:
      return null;
  }
}

export interface EventStreamHandlers {
  onEvent: (event: ServerEvent) => void;
  onOpen?: () => void;
  /** `closed`: o navegador desistiu (ex.: 502 do nginx) e não reconecta sozinho. */
  onError?: (closed: boolean) => void;
}

// Stream único com os três ambientes. O servidor faz os health checks; aqui só se
// escuta. O EventSource reconecta sozinho e cada conexão começa por um snapshot,
// então não há o que repor depois de uma queda. O prazo de graça e a reabertura
// manual ficam com quem chama. Devolve a limpeza (fecha o stream).
export function openEventStream(handlers: EventStreamHandlers): () => void {
  const es = new EventSource(EVENTS_URL);
  es.onopen = () => {
    handlers.onOpen?.();
  };
  es.onerror = () => {
    handlers.onError?.(es.readyState === EventSource.CLOSED);
  };
  for (const type of ['snapshot', 'status', 'cycle']) {
    es.addEventListener(type, (e) => {
      const event = parseEvent(type, (e as MessageEvent<string>).data);
      if (event) handlers.onEvent(event);
    });
  }
  return () => {
    es.close();
  };
}
