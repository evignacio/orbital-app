import { Banner } from '@/components/Banner';
import { useConnectionStore } from '@/store/connection.store';

export interface StormBannerProps {
  /** checkAll (useSync da PanelPage), o mesmo do Sincronizar. */
  onRetry: () => void;
}

/**
 * Aviso de tempestade (painel.html ~156–168, skyVals): só com a API fora; lê
 * apiDown, lastOk e scanning das stores. Stub da F3a; a 3.8 implementa a mensagem
 * com o último ok e o "Tentando…".
 */
export function StormBanner({ onRetry }: StormBannerProps) {
  const apiDown = useConnectionStore((s) => s.apiDown);
  if (!apiDown) return null;
  return (
    <Banner
      tone="storm"
      icon="cloud-lightning"
      title="TEMPESTADE · API INACESSÍVEL"
      action={{ label: 'Tentar agora', onClick: onRetry }}
    >
      Tentando reconectar…
    </Banner>
  );
}
