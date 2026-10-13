import mono from '@/theme/mono.module.css';
import styles from './ThemeSwitch.module.css';

interface ThemeSwitchProps {
  light: boolean;
  onToggle: () => void;
}

/**
 * Switch do tema da barra do topo:
 * trilho de swTrack/swKnob com o rótulo DARK/LIGHT à direita.
 */
export function ThemeSwitch({ light, onToggle }: ThemeSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      title="Alternar tema"
      className={styles.theme}
      onClick={onToggle}
    >
      <span className={styles.track} data-on={light}>
        <span className={styles.knob} data-on={light} />
      </span>
      <span className={[mono.control, styles.label].join(' ')}>{light ? 'LIGHT' : 'DARK'}</span>
    </button>
  );
}
