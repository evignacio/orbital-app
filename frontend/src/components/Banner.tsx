import type { ReactNode } from 'react';
import mono from '@/theme/mono.module.css';
import { Icon, type IconName } from './Icon';
import styles from './Banner.module.css';

export type BannerTone = 'storm' | 'warn' | 'down';

interface BannerProps {
  tone: BannerTone;
  icon: IconName;
  /** Rótulo mono em maiúsculas acima da mensagem. */
  title: string;
  children: ReactNode;
  action?: { label: ReactNode; onClick: () => void; disabled?: boolean };
}

/** Faixa de aviso com ícone, mensagem e uma ação opcional (o aviso de tempestade do painel). */
export function Banner({ tone, icon, title, children, action }: BannerProps) {
  return (
    <div role="alert" className={[styles.banner, styles[tone]].join(' ')}>
      <Icon name={icon} size={28} className={styles.icon} />
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{children}</div>
      </div>
      {action && (
        <button
          type="button"
          className={[mono.small, styles.action].join(' ')}
          disabled={action.disabled ?? false}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
