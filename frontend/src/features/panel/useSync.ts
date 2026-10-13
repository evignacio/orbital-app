import { useCallback, useEffect, useRef } from 'react';
import { syncEnvironment } from '@/api/applications';
import type { EnvCode } from '@/domain/types';
import { useEventStreamControls } from '@/hooks/EventStreamContext';
import { useConnectionStore } from '@/store/connection.store';

/** Teto do "Sincronizando…" caso o cycle nunca chegue (SCAN_MAX_MS do legado). */
export const SCAN_MAX_MS = 30000;

export interface SyncControls {
  /** "Sincronizar" e "Tentar agora": pede um ciclo do ambiente; o resultado vem pelo SSE. */
  sync: () => void;
}

/**
 * Porte do checkAll (legacy/script.js ~722). O fim normal da varredura chega pelo
 * cycle (status.store); o timer só evita ficar preso. Ele pertence a este hook e
 * é limpo sempre que `scanning` volta a false, senão o timer de uma varredura
 * antiga encerraria a seguinte.
 */
export function useSync(env: EnvCode): SyncControls {
  const { reconnectIfClosed } = useEventStreamControls();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = useConnectionStore.subscribe((s, prev) => {
      if (prev.scanning && !s.scanning) {
        clearTimeout(timer.current);
        timer.current = undefined;
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, []);

  const sync = useCallback(() => {
    if (!useConnectionStore.getState().startScan(env)) return;
    reconnectIfClosed();
    syncEnvironment(env).then(
      () => {
        // O cycle pode ter chegado antes da resposta do POST: aí não há timer a armar.
        // Nem de outra varredura, de outro ambiente, que começou no meio do caminho.
        const conn = useConnectionStore.getState();
        if (!conn.scanning || conn.scanEnv !== env) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = undefined;
          useConnectionStore.getState().endScan();
        }, SCAN_MAX_MS);
      },
      () => {
        useConnectionStore.getState().endScan();
        useConnectionStore.getState().markApiDown();
      },
    );
  }, [env, reconnectIfClosed]);
  return { sync };
}
