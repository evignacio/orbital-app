import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FIELD_LIMITS, TEAM_BLUR_MS } from '@/domain/application-form';
import { useAppsStore } from '@/store/apps.store';
import { teamSuggestions } from './app-form-model';
import field from './Field.module.css';
import styles from './TeamField.module.css';

export interface TeamFieldProps {
  value: string;
  error: string | undefined;
  /** Digitar ou escolher uma sugestão. */
  onChange: (team: string) => void;
}

/** Campo de time com sugestões tiradas das aplicações já cadastradas (teamVals do legado). */
export function TeamField({ value, error, onChange }: TeamFieldProps) {
  const labelId = useId();
  const errorId = useId();
  const apps = useAppsStore((s) => s.apps);
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => teamSuggestions(apps, value), [apps, value]);

  // O blur espera o onMouseDown de uma sugestão antes de fechar a lista.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  return (
    <label className={[field.field, styles.wrap].join(' ')}>
      <span id={labelId} className={field.label}>
        Time responsável <span className={field.required}>*</span>
      </span>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            setOpen(false);
          }, TEAM_BLUR_MS);
        }}
        required
        maxLength={FIELD_LIMITS.team}
        aria-labelledby={labelId}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        placeholder="Pagamentos"
        autoComplete="off"
        className={[field.input, error ? field.invalid : ''].join(' ')}
      />
      {error && (
        <span id={errorId} role="alert" className={field.error}>
          {error}
        </span>
      )}
      {open && suggestions.length > 0 && (
        <div className={[field.dropdown, styles.list].join(' ')}>
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              tabIndex={-1}
              className={styles.suggestion}
              onMouseDown={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
