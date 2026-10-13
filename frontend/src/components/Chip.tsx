import type { ReactNode } from 'react';
import styles from './Chip.module.css';

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** Botão de filtro em forma de pílula mono. */
export function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button type="button" aria-pressed={active} className={styles.chip} onClick={onClick}>
      {children}
    </button>
  );
}
