import { Banner } from '@/components/Banner';
import { agoLabel, clockLabel } from '@/domain/format';
import { useConnectionStore } from '@/store/connection.store';

export interface StormBannerProps {
  /** checkAll (useSync da PanelPage), o mesmo do Sincronizar. */
  onRetry: () => void;
}

/** Mensagem do aviso (skyVals do legado): de quando são os status que a tela mostra. */
export function stormMessage(lastOk: number | null): string {
  return lastOk
    ? `Os status abaixo são da última checagem, às ${clockLabel(lastOk)} (${agoLabel(lastOk)}). Tentando reconectar…`
    : 'Nenhuma checagem foi concluída ainda. Tentando reconectar…';
}

/**
 * Aviso de tempestade (painel.html ~156–168, skyVals): só com a API fora. Como no
 * legado, o botão segue clicável durante a varredura; só o rótulo muda.
 */
export function StormBanner({ onRetry }: StormBannerProps) {
  const apiDown = useConnectionStore((s) => s.apiDown);
  const lastOk = useConnectionStore((s) => s.lastOk);
  const scanning = useConnectionStore((s) => s.scanning);
  if (!apiDown) return null;
  return (
    <Banner
      tone="storm"
      icon="cloud-lightning"
      title="TEMPESTADE · API INACESSÍVEL"
      action={{ label: scanning ? 'Tentando…' : 'Tentar agora', onClick: onRetry }}
    >
      {stormMessage(lastOk)}
    </Banner>
  );
}
