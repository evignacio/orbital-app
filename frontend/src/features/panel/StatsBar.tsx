import { useMemo } from 'react';
import { STATUS_META, STATUSES } from '@/domain/status';
import type { Application } from '@/domain/types';
import { useStatusStore } from '@/store/status.store';
import mono from '@/theme/mono.module.css';
import styles from './StatsBar.module.css';

export interface StatsBarProps {
  /** envApps: ambiente da tela ∩ órbita (headerVals ~904). */
  apps: readonly Application[];
}

/**
 * Contadores por status do cabeçalho (painel.html ~148, statCard()). Renderiza só
 * os cartões: o contêiner #statsRow (opacidade e title "Dados desatualizados"
 * quando stale, @media) é da PanelPage. No legado não são clicáveis.
 */
export function StatsBar({ apps }: StatsBarProps) {
  const status = useStatusStore((s) => s.status);
  const counts = useMemo(
    () => STATUSES.map((s) => [s, apps.filter((a) => status[a.id] === s).length] as const),
    [apps, status],
  );
  return (
    <>
      {counts.map(([s, count]) => (
        <div key={s} className={styles.card} data-tone={STATUS_META[s].tone}>
          <span className={[mono.stat, styles.label].join(' ')}>{STATUS_META[s].chip}</span>
          <span className={styles.count} data-testid="stat-count">
            {count}
          </span>
        </div>
      ))}
    </>
  );
}
