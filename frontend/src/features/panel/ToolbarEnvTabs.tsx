import { ENVS } from '@/domain/environments';
import type { EnvCode } from '@/domain/types';
import styles from './ToolbarEnvTabs.module.css';

export interface ToolbarEnvTabsProps {
  env: EnvCode;
  /** setEnv de usePanelFilters: persiste e zera página e seleção. */
  onChange: (env: EnvCode) => void;
}

/**
 * Abas de ambiente do cabeçalho (painel.html ~136, envTab()). Renderiza só os
 * botões: o contêiner #envTabs (borda, fundo, @media) é da PanelPage.
 */
export function ToolbarEnvTabs({ env, onChange }: ToolbarEnvTabsProps) {
  return (
    <>
      {ENVS.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          aria-pressed={env === code}
          className={styles.tab}
          onClick={() => {
            onChange(code);
          }}
        >
          {label}
        </button>
      ))}
    </>
  );
}
