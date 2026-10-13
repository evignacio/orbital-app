import { Icon } from '@/components/Icon';
import { agoLabel, clockLabel } from '@/domain/format';
import { useConnectionStore } from '@/store/connection.store';
import mono from '@/theme/mono.module.css';
import styles from './GalaxyStormBanner.module.css';

export interface GalaxyStormBannerProps {
  /** retry do legado: reabre o stream se CLOSED e relê a lista. */
  onRetry: () => void;
}

/** Mensagem do aviso na galáxia (renderVals do legado): fala da saúde das órbitas. */
export function galaxyStormMessage(lastOk: number | null): string {
  return lastOk
    ? `A saúde das órbitas é da última checagem, às ${clockLabel(lastOk)} (${agoLabel(lastOk)}). Tentando reconectar…`
    : 'Nenhuma checagem foi concluída ainda. Tentando reconectar…';
}

/**
 * Aviso de tempestade da galáxia: flutua abaixo do
 * título, com fundo de diálogo, e não tem o "Tentando…" do painel.
 */
export function GalaxyStormBanner({ onRetry }: GalaxyStormBannerProps) {
  const apiDown = useConnectionStore((s) => s.apiDown);
  const lastOk = useConnectionStore((s) => s.lastOk);
  if (!apiDown) return null;
  return (
    <div role="alert" className={styles.banner}>
      <Icon name="cloud-lightning" size={28} className={styles.icon} />
      <div className={styles.text}>
        <div className={styles.title}>TEMPESTADE · API INACESSÍVEL</div>
        <div className={styles.message}>{galaxyStormMessage(lastOk)}</div>
      </div>
      <button type="button" className={[mono.small, styles.action].join(' ')} onClick={onRetry}>
        Tentar agora
      </button>
    </div>
  );
}
