import type { EnvCode } from '@/domain/types';
import { useConnectionStore } from '@/store/connection.store';

export interface ToolbarProps {
  /** Ambiente na tela: o relógio mostra o último cycle dele. */
  env: EnvCode;
  /** checkAll (useSync da PanelPage); o mesmo do "Tentar agora" do StormBanner. */
  onSync: () => void;
}

/**
 * Barra do topo (painel.html ~95–128): tema, Sincronizar, relógio da última
 * verificação e o sino de alertas. Renderiza só os itens: o contêiner posicionado
 * (#topBar, com o @media) é da PanelPage. Stub da F3a; a F3b implementa.
 */
export function Toolbar({ onSync }: ToolbarProps) {
  const scanning = useConnectionStore((s) => s.scanning);
  return (
    <button type="button" onClick={onSync}>
      {scanning ? 'Sincronizando…' : 'Sincronizar'}
    </button>
  );
}
