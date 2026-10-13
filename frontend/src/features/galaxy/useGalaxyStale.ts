import { useConnectionStore } from '@/store/connection.store';
import { useStatusStore } from '@/store/status.store';

// Os ciclos da store só mudam de objeto com um snapshot ou um cycle do servidor
// (a hidratação e a poda não os tocam): enquanto for o do estado inicial, nenhum
// evento chegou. O primeiro evento de cada conexão é sempre um snapshot.
const INITIAL_CYCLES = useStatusStore.getInitialState().cycles;

/**
 * isStale() da galáxia legada: a API fora, ou status antigo na carga
 * (staleEnvs, que só existe quando o cache passou de STATUS_STALE_MS) sem
 * nenhum evento recebido ainda. A legenda vira "ÚLTIMO: …" e os planetinhas cinza.
 */
export function useGalaxyStale(): boolean {
  const apiDown = useConnectionStore((s) => s.apiDown);
  const oldAtLoad = useStatusStore((s) => s.staleEnvs.length > 0 && s.cycles === INITIAL_CYCLES);
  return apiDown || oldAtLoad;
}
