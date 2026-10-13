import { useCallback } from 'react';
import { syncEnvironment } from '@/api/applications';
import type { EnvCode } from '@/domain/types';
import { useEventStreamControls } from '@/hooks/EventStreamContext';
import { useConnectionStore } from '@/store/connection.store';

export interface SyncControls {
  /** "Sincronizar" e "Tentar agora": pede um ciclo do ambiente; o resultado vem pelo SSE. */
  sync: () => void;
}

/**
 * Porte do checkAll (legacy/script.js ~722). Versão mínima da F3a, sem o timer de
 * SCAN_MAX_MS: a F3b completa este hook mantendo a assinatura.
 */
export function useSync(env: EnvCode): SyncControls {
  const { reconnectIfClosed } = useEventStreamControls();
  const sync = useCallback(() => {
    const connection = useConnectionStore.getState();
    if (!connection.startScan(env)) return;
    reconnectIfClosed();
    syncEnvironment(env).catch(() => {
      useConnectionStore.getState().endScan();
      useConnectionStore.getState().markApiDown();
    });
  }, [env, reconnectIfClosed]);
  return { sync };
}
