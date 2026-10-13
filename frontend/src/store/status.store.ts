import { create } from 'zustand';
import type { CycleMsg, SnapshotMsg, StatusMsg } from '../api/events';
import { ENV_CODES } from '../domain/environments';
import {
  checkedResults,
  cycleListStale,
  diffStatuses,
  markEnvChecked,
  pruneToKnown,
  snapshotListStale,
  type StatusResult,
} from '../domain/status-diff';
import type { Application, EnvCode, StatusMap } from '../domain/types';
import { writeStatusCache } from '../storage/cache';
import { useConnectionStore } from './connection.store';
import { appsIn } from './selectors';

// O que o servidor mandou (snapshot, status, cycle) entra aqui; as regras de
// comparação são de domain/status-diff.ts e a store só guarda, grava e avisa.
// `downSeen` (ids que já alertaram uma queda) mora aqui porque o diff o consome
// a cada evento e a poda da lista também; o hook de alertas recebe `fell` e não
// precisa mexer nele.

interface StatusState {
  status: StatusMap;
  /** Data do status mais antigo do mapa (ms), gravada junto em orbital-status-v1; 0 se não se sabe. */
  ts: number;
  /** Ambientes cujo status ainda é "último conhecido" da carga. */
  staleEnvs: EnvCode[];
  /** Fim do último ciclo conhecido de cada ambiente (ms); `null` enquanto não houve. */
  cycles: Record<EnvCode, number | null>;
  downSeen: Set<string>;
  /**
   * Já chegou algum evento do servidor (snapshot, status ou cycle) desde a carga:
   * o `synced` do legado. A galáxia usa para tirar o "último conhecido" da carga.
   */
  synced: boolean;
}

/** O que o hook de eventos decide com o resultado: alertar quedas e recarregar a lista. */
export interface EventOutcome {
  fell: { id: string; name: string }[];
  needsReload: boolean;
}

interface StatusActions {
  applySnapshot: (msg: SnapshotMsg, apps: readonly Application[]) => EventOutcome;
  applyStatus: (msg: StatusMsg, apps: readonly Application[]) => EventOutcome;
  applyCycle: (msg: CycleMsg, apps: readonly Application[]) => EventOutcome;
  /** Lista nova: status e downSeen ficam só com os ids que seguem nela. */
  pruneTo: (ids: ReadonlySet<string>) => void;
  /**
   * Esquece o status de uma app (e a queda já alertada): ela volta a "não verificado".
   * A edição com URL de health check nova pede isso, porque a API apaga o último status.
   */
  forget: (id: string) => void;
  /** Carga inicial: não grava, só devolve ao estado o que já estava no cache. */
  hydrate: (init: Pick<StatusState, 'status' | 'ts' | 'staleEnvs' | 'downSeen'>) => void;
}

type Extra = Partial<Pick<StatusState, 'cycles' | 'staleEnvs' | 'ts'>>;

const noCycles = (): Record<EnvCode, number | null> =>
  Object.fromEntries(ENV_CODES.map((e) => [e, null])) as Record<EnvCode, number | null>;

export const useStatusStore = create<StatusState & StatusActions>()((set, get) => {
  // Um ciclo do servidor (ou um snapshot que traz o último) data a checagem do
  // ambiente: grava o lastOk na hora e devolve o pedaço de estado que muda.
  function envChecked(env: EnvCode, checkedAt: number): Extra {
    const conn = useConnectionStore.getState();
    const r = markEnvChecked(get().staleEnvs, conn.lastOk ?? 0, env, checkedAt);
    conn.setLastOk(r.lastOk);
    return r.statusTs === null
      ? { staleEnvs: r.staleEnvs }
      : { staleEnvs: r.staleEnvs, ts: r.statusTs };
  }

  // Miolo comum de snapshot, status e cycle. `extra` é o resto do estado que o
  // evento muda. Receber qualquer coisa do servidor prova que a API voltou.
  function apply(
    results: readonly StatusResult[],
    apps: readonly Application[],
    extra: Extra | null,
  ): EventOutcome {
    const s = get();
    const diff = diffStatuses(s.status, results, s.downSeen, new Set(apps.map((a) => a.id)));
    const conn = useConnectionStore.getState();
    const cleared = conn.apiDown;
    if (diff.moved || cleared || extra) {
      set({
        status: { ...s.status, ...diff.patch },
        downSeen: diff.downSeen,
        synced: true,
        ...extra,
      });
      writeStatusCache(get().status, get().ts);
    } else {
      set({ downSeen: diff.downSeen, synced: true });
    }
    conn.markApiUp();
    // A lista pode ter mudado enquanto a API estava fora, ou em outra aba.
    return { fell: diff.fell, needsReload: cleared || diff.unknown };
  }

  return {
    status: {},
    ts: 0,
    staleEnvs: [],
    cycles: noCycles(),
    downSeen: new Set(),
    synced: false,

    applySnapshot: (msg, apps) => {
      const checkedAt = msg.cycle ? msg.cycle.checkedAt : null;
      const extra: Extra = { cycles: { ...get().cycles, [msg.env]: checkedAt } };
      if (checkedAt) Object.assign(extra, envChecked(msg.env, checkedAt));
      // A conexão voltou: o "Tentar agora" da tempestade cumpriu o papel.
      const conn = useConnectionStore.getState();
      if (conn.apiDown && conn.scanning) conn.endScan();
      const mine = appsIn(apps, msg.env).map((a) => a.id);
      const listStale = snapshotListStale(
        msg.apps.map((a) => a.id),
        mine,
      );
      // App nunca verificada (status null) mantém o status do cache local.
      const out = apply(checkedResults(msg.apps), apps, extra);
      return { fell: out.fell, needsReload: out.needsReload || listStale };
    },
    applyStatus: (msg, apps) =>
      apply([{ id: msg.id, name: msg.name, status: msg.status }], apps, null),
    applyCycle: (msg, apps) => {
      const extra: Extra = {
        cycles: { ...get().cycles, [msg.env]: msg.checkedAt },
        ...envChecked(msg.env, msg.checkedAt),
      };
      // O fim do ciclo do ambiente sincronizado é o fim do "Sincronizando…", esteja ele na tela ou não.
      const conn = useConnectionStore.getState();
      if (conn.scanning && msg.env === conn.scanEnv) conn.endScan();
      const out = apply([], apps, extra);
      return {
        fell: out.fell,
        needsReload: out.needsReload || cycleListStale(msg.checked, appsIn(apps, msg.env).length),
      };
    },
    pruneTo: (ids) => {
      const s = get();
      const kept = pruneToKnown(s.status, s.downSeen, ids);
      set(kept);
      writeStatusCache(kept.status, s.ts);
    },
    forget: (id) => {
      const s = get();
      const status = { ...s.status };
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- mapa por id, cópia local
      delete status[id];
      const downSeen = new Set(s.downSeen);
      downSeen.delete(id);
      set({ status, downSeen });
      writeStatusCache(status, s.ts);
    },
    hydrate: (init) => {
      set(init);
    },
  };
});
