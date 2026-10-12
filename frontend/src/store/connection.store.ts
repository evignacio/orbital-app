import { create } from 'zustand';
import type { EnvCode } from '../domain/types';
import { writeLastOk } from '../storage/preferences';

// Se a API está de pé (a "tempestade" é apiDown), quando ela respondeu pela última
// vez e a varredura manual ("Sincronizando…"). Os timers ficam com quem usa a store.

interface ConnectionState {
  apiDown: boolean;
  /** Último ciclo confirmado pelo servidor (ms), persistido em orbital-lastok-v1. */
  lastOk: number | null;
  /** Há um "Sincronizando…" / "Tentando…" em curso; um só por vez, em qualquer ambiente. */
  scanning: boolean;
  /** Ambiente cujo cycle encerra a varredura, mesmo que a aba mude no meio. */
  scanEnv: EnvCode | null;
}

interface ConnectionActions {
  /** `true` se a API estava de pé (quem chama alerta só na primeira queda). */
  markApiDown: () => boolean;
  /** `true` se havia tempestade a encerrar. */
  markApiUp: () => boolean;
  setLastOk: (ms: number) => void;
  /** `false` se já há varredura em curso. */
  startScan: (env: EnvCode) => boolean;
  endScan: () => void;
  /** Carga inicial: não grava, só devolve ao estado o que já estava gravado. */
  hydrate: (lastOk: number | null) => void;
}

export const useConnectionStore = create<ConnectionState & ConnectionActions>()((set, get) => ({
  apiDown: false,
  lastOk: null,
  scanning: false,
  scanEnv: null,

  markApiDown: () => {
    if (get().apiDown) return false;
    set({ apiDown: true });
    return true;
  },
  markApiUp: () => {
    if (!get().apiDown) return false;
    set({ apiDown: false });
    return true;
  },
  setLastOk: (ms) => {
    set({ lastOk: ms });
    writeLastOk(ms);
  },
  startScan: (env) => {
    if (get().scanning) return false;
    set({ scanning: true, scanEnv: env });
    return true;
  },
  endScan: () => {
    set({ scanning: false, scanEnv: null });
  },
  hydrate: (lastOk) => {
    set({ lastOk });
  },
}));
