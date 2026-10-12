import { ENV_CODES } from './environments';
import { STATUS_STALE_MS } from './constants';
import type { EnvCode, Status, StatusMap } from './types';

// Regras puras de como o que o servidor manda (snapshot, status, cycle) vira
// estado do painel. Quem guarda o estado (store, F2) chama estas funções e aplica
// o resultado; nada aqui lê relógio nem mexe em storage.

/** Um resultado de checagem, vindo de um `status` ou de um app do `snapshot`. */
export interface StatusResult {
  id: string;
  name: string;
  status: Status;
}

export interface StatusDiff {
  /** Status a mesclar no mapa. */
  patch: StatusMap;
  /** Quedas novas: unhealthy que ainda não estavam em `downSeen`. */
  fell: { id: string; name: string }[];
  /** Algum id não está em `knownIds`: a lista de apps está desatualizada. */
  unknown: boolean;
  /** Algum status é diferente do que o mapa tinha. */
  moved: boolean;
  /** `downSeen` seguinte (cópia: quem aplica decide trocar). */
  downSeen: Set<string>;
}

// Compara os resultados do servidor com o estado, sem alterar nada. `downSeen`
// evita alertar de novo uma queda que já foi avisada; sai dele quem se recupera.
export function diffStatuses(
  prev: StatusMap,
  results: readonly StatusResult[],
  downSeen: ReadonlySet<string>,
  knownIds: ReadonlySet<string>,
): StatusDiff {
  const nextSeen = new Set(downSeen);
  const patch: StatusMap = {};
  const fell: { id: string; name: string }[] = [];
  let unknown = false;
  for (const r of results) {
    patch[r.id] = r.status;
    if (!knownIds.has(r.id)) unknown = true;
    if (r.status !== 'unhealthy') {
      nextSeen.delete(r.id);
    } else if (!nextSeen.has(r.id)) {
      nextSeen.add(r.id);
      fell.push({ id: r.id, name: r.name });
    }
  }
  const moved = results.some((r) => prev[r.id] !== r.status);
  return { patch, fell, unknown, moved, downSeen: nextSeen };
}

// App nunca verificada (status null) mantém o status do cache local: fica fora do diff.
export function checkedResults(
  apps: readonly { id: string; name: string; status: Status | null }[],
): StatusResult[] {
  return apps.flatMap((a) =>
    a.status === null ? [] : [{ id: a.id, name: a.name, status: a.status }],
  );
}

// Quedas já presentes no cache da carga não alertam de novo.
export function initialDownSeen(status: StatusMap): Set<string> {
  return new Set(Object.keys(status).filter((id) => status[id] === 'unhealthy'));
}

// Status gravado há mais que STATUS_STALE_MS vale como "último conhecido": todos
// os ambientes começam stale e cada um sai no primeiro snapshot ou ciclo do servidor.
export function initialStaleEnvs(status: StatusMap, statusTs: number, now: number): EnvCode[] {
  return Object.keys(status).length > 0 && now - statusTs > STATUS_STALE_MS ? [...ENV_CODES] : [];
}

export interface EnvChecked {
  staleEnvs: EnvCode[];
  lastOk: number;
  /**
   * Novo `ts` do cache de status, ou `null` para deixar o gravado. O ts data o
   * status mais antigo do mapa, então só avança quando nenhum ambiente segue com
   * status da carga — senão um reload o daria por novo.
   */
  statusTs: number | null;
}

// Um ciclo do servidor (ou um snapshot que traz o último) data a checagem do
// ambiente: ele sai do "último conhecido" e o lastOk avança.
export function markEnvChecked(
  staleEnvs: readonly EnvCode[],
  lastOk: number,
  env: EnvCode,
  checkedAt: number,
): EnvChecked {
  const stillStale = staleEnvs.filter((e) => e !== env);
  const nextLastOk = Math.max(lastOk, checkedAt);
  return {
    staleEnvs: stillStale,
    lastOk: nextLastOk,
    statusTs: stillStale.length ? null : nextLastOk,
  };
}

// A lista pode ter mudado enquanto a API estava fora, ou em outra aba: snapshot
// com ids diferentes dos que o painel tem no ambiente pede um novo GET.
export function snapshotListStale(
  listedIds: Iterable<string>,
  mineIds: readonly string[],
): boolean {
  const listed = new Set(listedIds);
  return listed.size !== mineIds.length || mineIds.some((id) => !listed.has(id));
}

// Número de apps diferente do que o painel conhece: aplicação criada ou removida em outro lugar.
export function cycleListStale(checked: number, mineCount: number): boolean {
  return checked !== mineCount;
}

// Uma lista nova (GET, cadastro, remoção) deixa status e alertas só com ids que seguem nela.
export function pruneToKnown(
  status: StatusMap,
  downSeen: ReadonlySet<string>,
  ids: ReadonlySet<string>,
): { status: StatusMap; downSeen: Set<string> } {
  return {
    status: Object.fromEntries(Object.entries(status).filter(([id]) => ids.has(id))),
    downSeen: new Set([...downSeen].filter((id) => ids.has(id))),
  };
}
