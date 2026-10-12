import { useEffect, useLayoutEffect, useMemo } from 'react';
import { Outlet } from 'react-router';
import { EventStreamContext } from '@/hooks/EventStreamContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useDownAlerts } from '@/hooks/useDownAlerts';
import { useEventStream } from '@/hooks/useEventStream';
import { useTheme } from '@/hooks/useTheme';
import { clearObsoleteKeys } from '@/storage/cache';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { hydrateStores } from '@/store/hydrate';

function notifyAllowed(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

// Layout de todas as rotas: é o dono do que existe uma vez só por página (tema,
// título, alertas, stream SSE e a carga inicial da lista).
export function AppShell() {
  useTheme();
  useDocumentTitle();
  const { queueAlert } = useDownAlerts();
  const { reconnectIfClosed } = useEventStream({ onFell: queueAlert });

  // Antes da primeira pintura, para a tela já nascer com o último estado conhecido
  // (o legado hidratava no componentDidMount). Idempotente: o StrictMode roda duas vezes.
  useLayoutEffect(() => {
    clearObsoleteKeys();
    hydrateStores(Date.now(), { notifyAllowed: notifyAllowed() });
  }, []);

  useEffect(() => {
    // Chamadas simultâneas dividem a mesma requisição (duplo mount do StrictMode).
    void useAppsStore
      .getState()
      .loadApps()
      .then((ok) => {
        if (!ok) useConnectionStore.getState().markApiDown();
      });
  }, []);

  const controls = useMemo(() => ({ reconnectIfClosed }), [reconnectIfClosed]);

  return (
    <EventStreamContext value={controls}>
      <Outlet />
    </EventStreamContext>
  );
}
