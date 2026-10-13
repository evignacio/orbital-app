import { useEffect, useMemo } from 'react';
import { Outlet } from 'react-router';
import { EventStreamContext } from '@/hooks/EventStreamContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useDownAlerts } from '@/hooks/useDownAlerts';
import { useEventStream } from '@/hooks/useEventStream';
import { useTheme } from '@/hooks/useTheme';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';

// Layout de todas as rotas: é o dono do que existe uma vez só por página (tema,
// título, alertas, stream SSE e a carga inicial da lista). A hidratação das stores
// acontece antes, em main.tsx.
export function AppShell() {
  useTheme();
  useDocumentTitle();
  const { queueAlert } = useDownAlerts();
  const { reconnectIfClosed } = useEventStream({ onFell: queueAlert });

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
