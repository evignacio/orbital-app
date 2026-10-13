import { useEffect, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import type { GalaxyOrbitNode } from '@/viz/galaxy-orbits';
import type { GalaxyOrbitsHandle } from './GalaxyOrbits';
import type { GalaxyRocksHandle } from './GalaxyRocks';

/** Tudo o que a sucção desenha ou lê; a GalaxyPage é dona de cada ref. */
export interface EnterOrbitRefs {
  /** Raiz da página: tamanho (W×H) e cores resolvidas (getComputedStyle). */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Canvas das partículas (GalaxyFx). */
  fxRef: RefObject<HTMLCanvasElement | null>;
  /** Véu --veil que cobre a tela antes de navegar (GalaxyFx). */
  veilRef: RefObject<HTMLDivElement | null>;
  orbitsRef: RefObject<GalaxyOrbitsHandle | null>;
  rocksRef: RefObject<GalaxyRocksHandle | null>;
}

export interface EnterOrbit {
  /** Chave da órbita em que se está entrando; null na galáxia parada. */
  leavingKey: string | null;
  /** Clique num sistema: anima e navega para /painel?orbita=<chave>. Ignorado se já saindo. */
  enter: (node: GalaxyOrbitNode) => void;
}

/**
 * Entrar numa órbita (legacy/galaxy.js enter/runFx/veilAt): a galáxia é sugada
 * para o planeta, o véu cobre a tela e o painel abre filtrado por ela. O estado
 * nasce limpo a cada montagem da página (voltar pelo histórico remonta a
 * GalaxyPage), o que substitui o reload do `pageshow` do legado.
 *
 * Por enquanto só navega, sem animação: a sucção (ENTER_MS, VEIL_AT_MS de
 * viz/galaxy-layout) e o véu são da tarefa 4.5, que mantém esta assinatura.
 */
export function useEnterOrbit({ veilRef }: EnterOrbitRefs): EnterOrbit {
  const navigate = useNavigate();
  const [leavingKey, setLeavingKey] = useState<string | null>(null);

  // A página volta sempre com o véu aberto, mesmo que o elemento fosse reaproveitado.
  useEffect(() => {
    const veil = veilRef.current;
    if (!veil) return;
    veil.style.transition = '';
    veil.style.opacity = '';
  }, [veilRef]);

  const enter = (node: GalaxyOrbitNode) => {
    if (leavingKey) return;
    setLeavingKey(node.key);
    void navigate(`/painel?orbita=${encodeURIComponent(node.key)}`);
  };
  return { leavingKey, enter };
}
