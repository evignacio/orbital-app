import { useEffect, useRef } from 'react';
import { openEventStream, type ServerEvent } from '../api/events';
import { SSE_DOWN_GRACE_MS, SSE_RETRY_MS } from '../domain/constants';
import { useAppsStore } from '../store/apps.store';
import { useConnectionStore } from '../store/connection.store';
import { useStatusStore, type EventOutcome } from '../store/status.store';

export interface UseEventStreamOptions {
  /** Apps que acabaram de cair (já sem repetir as que seguem fora do ar). */
  onFell?: (hits: EventOutcome['fell']) => void;
  /** Só na primeira queda da API (a tempestade acendeu agora), para o alerta. */
  onApiDown?: () => void;
}

function apply(event: ServerEvent): EventOutcome {
  const { apps } = useAppsStore.getState();
  const status = useStatusStore.getState();
  switch (event.type) {
    case 'snapshot':
      return status.applySnapshot(event, apps);
    case 'status':
      return status.applyStatus(event, apps);
    case 'cycle':
      return status.applyCycle(event, apps);
  }
}

// Liga o stream SSE às stores: o servidor faz os checks e aqui só se escuta. Montar
// uma vez no app inteiro; o duplo mount do StrictMode fecha o primeiro stream e os
// timers antes de abrir o segundo.
export function useEventStream(options: UseEventStreamOptions = {}): void {
  // Os callbacks mudam a cada render; o efeito não pode recriar o stream por isso.
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  useEffect(() => {
    let closeStream: (() => void) | null = null;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // O openEventStream não expõe o readyState; o que importa na graça é só se a
    // conexão voltou a abrir desde o último erro.
    let open = false;

    const clearGrace = () => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = null;
    };
    const clearRetry = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };

    const onEvent = (event: ServerEvent) => {
      const { fell, needsReload } = apply(event);
      if (fell.length > 0) callbacks.current.onFell?.(fell);
      // O legado ignora o retorno: uma falha aqui não derruba o que o stream acabou de provar.
      if (needsReload) void useAppsStore.getState().loadApps();
    };

    const connect = () => {
      clearRetry();
      closeStream?.();
      open = false;
      closeStream = openEventStream({
        onEvent,
        onOpen: () => {
          open = true;
          clearGrace();
        },
        onError: (closed) => {
          open = false;
          // Dentro do prazo de graça, quedas curtas (deploy, reinício) não acendem a tempestade.
          graceTimer ??= setTimeout(() => {
            graceTimer = null;
            if (!open && useConnectionStore.getState().markApiDown()) {
              callbacks.current.onApiDown?.();
            }
          }, SSE_DOWN_GRACE_MS);
          // CLOSED: o navegador desistiu (ex.: 502 do nginx sem a API) e não reconecta sozinho.
          if (closed) {
            clearRetry();
            retryTimer = setTimeout(connect, SSE_RETRY_MS);
          }
        },
      });
    };

    connect();
    return () => {
      clearGrace();
      clearRetry();
      closeStream?.();
      closeStream = null;
    };
  }, []);
}
