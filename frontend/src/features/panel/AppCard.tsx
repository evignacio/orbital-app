import { memo, type CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { clockLabel } from '@/domain/format';
import { isStatus, statusColor, statusText } from '@/domain/status';
import type { Application } from '@/domain/types';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import styles from './AppCard.module.css';

/** Só http(s) vira link: um javascript: salvo na base não pode ser clicável. */
export function safeHref(v: string): string {
  return /^https?:\/\//i.test(v) ? v : '';
}

interface AppCardProps {
  app: Application;
  selected: boolean;
  /** API fora ou status antigo no ambiente: cor --stale e "ÚLTIMO: …". */
  stale: boolean;
  onSelect: (id: string) => void;
  onEdit: (app: Application) => void;
  onRemove: (id: string) => void;
}

function statusTitle(
  status: unknown,
  stale: boolean,
  apiDown: boolean,
  ts: number,
): string | undefined {
  if (stale && status) {
    return ts && !apiDown
      ? `Último status conhecido, de ${clockLabel(ts)}`
      : 'Último status conhecido';
  }
  return status === 'degraded' ? 'Tempo de resposta acima do limite' : undefined;
}

/**
 * Card da frota. O status entra por seletor do próprio id:
 * um evento de status re-renderiza só o card afetado.
 */
export const AppCard = memo(function AppCard({
  app,
  selected,
  stale,
  onSelect,
  onEdit,
  onRemove,
}: AppCardProps) {
  const raw = useStatusStore((s) => s.status[app.id]);
  const status = isStatus(raw) ? raw : undefined;
  const ts = useStatusStore((s) => s.ts);
  const apiDown = useConnectionStore((s) => s.apiDown);
  const light = usePreferencesStore((s) => s.theme) === 'light';
  const color = stale ? 'var(--stale)' : statusColor(status);
  const href = safeHref(app.swaggerUrl);
  const title = statusTitle(status, stale, apiDown, ts);
  const label = stale && status ? `ÚLTIMO: ${statusText(status)}` : statusText(status);

  return (
    // O card inteiro é clicável como no legado; o teclado alcança o lápis, o ✕ e o link.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article
      className={styles.card}
      data-selected={selected ? 'true' : undefined}
      data-stale={stale ? 'true' : undefined}
      data-light={light ? 'true' : undefined}
      style={{ '--tone': color } as CSSProperties}
      onClick={() => {
        onSelect(app.id);
      }}
    >
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.edit}
          title="Editar"
          aria-label={`Editar ${app.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(app);
          }}
        >
          <Icon name="pencil" size={13} />
        </button>
        <button
          type="button"
          className={styles.remove}
          title="Remover"
          aria-label={`Remover ${app.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(app.id);
          }}
        >
          ✕
        </button>
      </div>
      <div className={styles.head}>
        <span className={styles.dot} />
        <div className={styles.nameBox}>
          <div className={styles.name}>{app.name}</div>
        </div>
        <span className={styles.badge} title={title}>
          {label}
        </span>
      </div>
      <div className={styles.team}>Time responsável: {app.team}</div>
      <div className={styles.links}>
        {href ? (
          <a
            className={styles.swagger}
            href={href}
            target="_blank"
            rel="noopener"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Icon name="arrow-square-out" size={12} />
            SWAGGER
          </a>
        ) : (
          <span className={[styles.swagger, styles.swaggerOff].join(' ')}>
            <Icon name="arrow-square-out" size={12} />
            SWAGGER
          </span>
        )}
      </div>
    </article>
  );
});
