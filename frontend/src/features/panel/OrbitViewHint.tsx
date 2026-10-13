import { clockLabel } from '@/domain/format';
import { useConnectionStore } from '@/store/connection.store';
import { useStatusStore } from '@/store/status.store';
import styles from './OrbitView.module.css';

export interface OrbitHintInput {
  apiDown: boolean;
  lastOk: number | null;
  /** apiDown ou status antigo no ambiente da tela (isStale do legado). */
  stale: boolean;
  /** Data do status antigo (ms); 0 se não se sabe. */
  staleTs: number;
}

/** Rodapé da órbita (legacy/script.js orbitHint): de onde vêm os dados na tela. */
export function orbitHintText({ apiDown, lastOk, stale, staleTs }: OrbitHintInput): string {
  if (apiDown) {
    if (!lastOk) return 'SEM CONTATO COM A CENTRAL';
    const hhmm = new Date(lastOk).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `SEM CONTATO COM A CENTRAL · DADOS DE ${hhmm}`;
  }
  if (stale) {
    return staleTs
      ? `ÚLTIMO CONHECIDO · DADOS DE ${clockLabel(staleTs)} · SINCRONIZANDO…`
      : 'ÚLTIMO CONHECIDO · SINCRONIZANDO…';
  }
  return 'CLIQUE EM UM PLANETA PARA DETALHES';
}

/** A dica no canto da section #orbitPanel; na tempestade fica na cor --storm. */
export function OrbitViewHint({ stale }: { stale: boolean }) {
  const apiDown = useConnectionStore((s) => s.apiDown);
  const lastOk = useConnectionStore((s) => s.lastOk);
  const staleTs = useStatusStore((s) => s.ts);
  return (
    <div className={styles.hint} data-storm={apiDown || undefined}>
      {orbitHintText({ apiDown, lastOk, stale, staleTs })}
    </div>
  );
}
