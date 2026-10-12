import type { ReactNode } from 'react';
import mono from '@/theme/mono.module.css';
import styles from './Switch.module.css';

interface SwitchProps {
  label: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

/** Interruptor rotulado (legacy/common.js, swTrack/swKnob): o botão inteiro é o alvo do clique. */
export function Switch({ label, checked, onChange, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={styles.switch}
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className={[mono.small, styles.label].join(' ')}>{label}</span>
      <span className={styles.track} data-on={checked}>
        <span className={styles.knob} data-on={checked} />
      </span>
    </button>
  );
}
