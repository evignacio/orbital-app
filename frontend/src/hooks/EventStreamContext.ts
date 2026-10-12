import { createContext, useContext } from 'react';
import type { EventStreamControls } from './useEventStream';

// O AppShell abre o único stream SSE da página; este contexto devolve às telas o
// que elas precisam dele (hoje, reabrir um stream CLOSED ao "Tentar agora" ou
// sincronizar, como o checkAll do legado) sem prop drilling.
export const EventStreamContext = createContext<EventStreamControls | null>(null);

export function useEventStreamControls(): EventStreamControls {
  const controls = useContext(EventStreamContext);
  if (!controls) throw new Error('useEventStreamControls precisa estar dentro do AppShell');
  return controls;
}
