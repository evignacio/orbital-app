import { Icon } from '@/components/Icon';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import type { EnvCode } from '@/domain/types';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import mono from '@/theme/mono.module.css';
import styles from './Toolbar.module.css';
import { ToolbarNotify } from './ToolbarNotify';

export interface ToolbarProps {
  /** Ambiente na tela: o relógio mostra o último cycle dele. */
  env: EnvCode;
  /** checkAll (useSync da PanelPage); o mesmo do "Tentar agora" do StormBanner. */
  onSync: () => void;
}

// Só o horário: o ícone de relógio e o tooltip dizem o que ele é (cycleLabel do legado).
function cycleLabel(checkedAt: number | null): string {
  return checkedAt ? new Date(checkedAt).toLocaleTimeString('pt-BR') : 'AGUARDANDO SERVIDOR';
}

/**
 * Barra do topo: tema, Sincronizar, relógio da última
 * verificação e o sino de alertas. Renderiza só os itens: o contêiner posicionado
 * (#topBar, com o @media) é da PanelPage.
 */
export function Toolbar({ env, onSync }: ToolbarProps) {
  const scanning = useConnectionStore((s) => s.scanning);
  const checkedAt = useStatusStore((s) => s.cycles[env]);
  const theme = usePreferencesStore((s) => s.theme);
  const light = theme === 'light';
  // toggleTheme do legado; o useTheme (efeitos no <html>) é do AppShell e roda uma vez.
  const toggleTheme = () => {
    usePreferencesStore.getState().setTheme(light ? 'dark' : 'light');
  };

  return (
    <>
      <ThemeSwitch light={light} onToggle={toggleTheme} />
      <button type="button" className={[mono.control, styles.sync].join(' ')} onClick={onSync}>
        {scanning ? 'Sincronizando…' : 'Sincronizar'}
      </button>
      <span title="Última verificação (health check feito pelo servidor)" className={styles.clock}>
        <Icon name="clock" size={15} />
        <span className={mono.control}>{cycleLabel(checkedAt)}</span>
      </span>
      <ToolbarNotify />
    </>
  );
}
