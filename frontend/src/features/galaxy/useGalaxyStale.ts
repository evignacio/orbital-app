import { useConnectionStore } from '@/store/connection.store';
import { useStatusStore } from '@/store/status.store';

/**
 * isStale() da galáxia legada: a API fora, ou status antigo na carga
 * (staleEnvs, que só existe quando o cache passou de STATUS_STALE_MS) sem
 * nenhum evento recebido ainda (synced). A legenda vira "ÚLTIMO: …" e os
 * planetinhas cinza.
 */
export function useGalaxyStale(): boolean {
  const apiDown = useConnectionStore((s) => s.apiDown);
  const oldAtLoad = useStatusStore((s) => s.staleEnvs.length > 0 && !s.synced);
  return apiDown || oldAtLoad;
}
