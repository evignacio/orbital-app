import { useId } from 'react';
import { ENVS } from '@/domain/environments';
import type { EnvCode } from '@/domain/types';
import styles from './EnvTabs.module.css';
import field from './Field.module.css';

export interface EnvTabsProps {
  value: EnvCode;
  /** Edição: só aparece o ambiente da app, sem troca (ele é a coleção onde ela está). */
  locked: boolean;
  onChange: (env: EnvCode) => void;
}

/** Abas de ambiente do cadastro (formEnvs do legado). */
export function EnvTabs({ value, locked, onChange }: EnvTabsProps) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className={field.field}>
      <span id={labelId} className={field.label}>
        Ambiente <span className={field.required}>*</span>
      </span>
      <div className={styles.tabs}>
        {ENVS.filter(({ code }) => !locked || code === value).map(({ code, label }) => (
          <button
            key={code}
            type="button"
            aria-pressed={code === value}
            className={[
              styles.tab,
              code === value ? styles.active : '',
              locked ? styles.locked : '',
            ].join(' ')}
            onClick={() => {
              if (!locked) onChange(code);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {locked && <span className={styles.hint}>O ambiente não muda na edição.</span>}
    </div>
  );
}
