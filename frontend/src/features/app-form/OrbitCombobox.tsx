import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FIELD_LIMITS, ORBIT_BLUR_MS } from '@/domain/application-form';
import { collectOrbits, orbitColors, orbitKey } from '@/domain/orbits';
import { useAppsStore } from '@/store/apps.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { orbitOptions } from './app-form-model';
import field from './Field.module.css';
import styles from './OrbitCombobox.module.css';

export interface OrbitComboboxProps {
  /** Órbitas escolhidas (chips). */
  value: readonly string[];
  /** Texto do campo, ainda não confirmado (o envio o inclui). */
  query: string;
  error: string | undefined;
  onQueryChange: (q: string) => void;
  /** Liga/desliga uma órbita (o form apaga o texto do campo). */
  onToggle: (name: string) => void;
  /** Backspace no campo vazio. */
  onRemoveLast: () => void;
}

/**
 * Campo de órbitas (orbitFieldVals do legado): chips das escolhidas + busca nas órbitas
 * de todas as apps, com "Criar órbita" quando o texto não casa com nenhuma. Teclado:
 * setas, Enter, Esc fecha a lista e Backspace no campo vazio tira a última.
 */
export function OrbitCombobox({
  value,
  query,
  error,
  onQueryChange,
  onToggle,
  onRemoveLast,
}: OrbitComboboxProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const errorId = `${id}-error`;
  const optionId = (k: number) => `${id}-opt-${String(k)}`;
  const apps = useAppsStore((s) => s.apps);
  const theme = usePreferencesStore((s) => s.theme);
  const [open, setOpen] = useState(false);
  const [hiRaw, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const known = useMemo(() => collectOrbits(apps), [apps]);
  const colorOf = useMemo(() => orbitColors(apps, theme), [apps, theme]);
  const items = orbitOptions(known, value, query);
  const n = items.length;
  const hi = Math.min(hiRaw, Math.max(0, n - 1));

  // A lista espera o onMouseDown de um item antes de fechar.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const pick = (name: string) => {
    onToggle(name);
    setHi(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi(n ? (hi + 1) % n : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi(n ? (hi - 1 + n) % n : 0);
    } else if (e.key === 'Enter') {
      // Enter aqui escolhe; nunca envia o formulário.
      e.preventDefault();
      const it = items[hi];
      if (it) pick(it.value);
    } else if (e.key === 'Escape') {
      // Com a lista aberta, o Esc é dela: o diálogo não fecha.
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === 'Backspace' && !query && value.length) {
      onRemoveLast();
    }
  };

  return (
    <div className={field.field}>
      <span id={labelId} className={field.label}>
        Órbitas onde a aplicação aparece <span className={field.required}>*</span>
      </span>
      <div className={styles.anchor}>
        {/* Clicar em qualquer ponto da caixa leva ao campo, como no legado. O teclado já
            chega ao campo pelo Tab. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div
          className={[styles.box, open ? styles.open : '', error ? styles.invalid : ''].join(' ')}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((name) => (
            <span key={orbitKey(name)} className={styles.chip}>
              <span className={styles.dot} style={{ background: colorOf(orbitKey(name)) }} />
              {name}
              <button
                type="button"
                title="Remover órbita"
                aria-label={`Remover órbita ${name}`}
                className={styles.chipRemove}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(name);
                }}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            role="combobox"
            aria-labelledby={labelId}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && n ? optionId(hi) : undefined}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : undefined}
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setOpen(true);
              setHi(0);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setOpen(true);
            }}
            onBlur={() => {
              clearTimeout(timer.current);
              timer.current = setTimeout(() => {
                setOpen(false);
              }, ORBIT_BLUR_MS);
            }}
            maxLength={FIELD_LIMITS.orbit}
            placeholder={value.length ? 'Adicionar outra…' : 'Buscar ou criar órbita'}
            autoComplete="off"
            className={styles.input}
          />
          <span className={styles.caret} aria-hidden="true">
            ▾
          </span>
        </div>
        {open && (
          <div
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            className={[field.dropdown, styles.list].join(' ')}
          >
            {items.map((it, k) => (
              <button
                key={it.create ? `+${it.key}` : it.key}
                id={optionId(k)}
                type="button"
                role="option"
                aria-selected={k === hi}
                tabIndex={-1}
                className={[
                  styles.option,
                  it.create ? styles.create : it.on ? styles.on : '',
                  k === hi ? styles.hi : '',
                ].join(' ')}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(it.value);
                }}
                onMouseEnter={() => {
                  if (k !== hi) setHi(k);
                }}
              >
                <span
                  className={[styles.dot, it.create ? styles.newDot : ''].join(' ')}
                  style={it.create ? undefined : { background: colorOf(it.key) }}
                />
                <span className={styles.optionLabel}>{it.label}</span>
                <span className={styles.optionHint}>{it.create ? 'ENTER' : it.on ? '✓' : ''}</span>
              </button>
            ))}
            {n === 0 && <span className={styles.empty}>Digite para criar uma órbita.</span>}
          </div>
        )}
      </div>
      {error && (
        <span id={errorId} role="alert" className={field.error}>
          {error}
        </span>
      )}
    </div>
  );
}
