import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePreferencesStore } from '@/store/preferences.store';
import { enterSuction } from '@/viz/galaxy-fx';
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
 * para o planeta (viz/galaxy-fx), o véu cobre a tela e o painel abre filtrado
 * por ela, pelo router e sem recarregar. O estado nasce limpo a cada montagem
 * da página (voltar pelo histórico remonta a GalaxyPage), o que substitui o
 * reload do `pageshow` do legado.
 */
export function useEnterOrbit({
  rootRef,
  fxRef,
  veilRef,
  orbitsRef,
  rocksRef,
}: EnterOrbitRefs): EnterOrbit {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const light = usePreferencesStore((s) => s.theme === 'light');
  const [leavingKey, setLeavingKey] = useState<string | null>(null);
  // O `this.leaving` do legado: síncrono, para que dois cliques no mesmo tick não saiam duas vezes.
  const exit = useRef<{ leaving: boolean; cancel: (() => void) | null }>({
    leaving: false,
    cancel: null,
  });

  // A página volta sempre com o véu aberto, mesmo que o elemento fosse reaproveitado;
  // e sair da página no meio da sucção não deixa quadro, véu nem navegação pendentes.
  useEffect(() => {
    const veil = veilRef.current;
    if (veil) {
      veil.style.transition = '';
      veil.style.opacity = '';
    }
    const state = exit.current;
    return () => {
      state.cancel?.();
      state.cancel = null;
    };
  }, [veilRef]);

  const enter = useCallback(
    (node: GalaxyOrbitNode) => {
      const state = exit.current;
      const root = rootRef.current;
      const canvas = fxRef.current;
      if (state.leaving || !root || !canvas) return;
      state.leaving = true;
      setLeavingKey(node.key);
      const go = () => {
        state.cancel = null;
        void navigate(`/painel?orbita=${encodeURIComponent(node.key)}`);
      };
      const others = (orbitsRef.current?.nodes() ?? []).filter((o) => o.key !== node.key);
      state.cancel = enterSuction(
        {
          root,
          canvas,
          veil: veilRef.current,
          target: node,
          others,
          rocks: rocksRef.current?.rocks() ?? [],
          W: root.clientWidth,
          H: root.clientHeight,
          light,
          reduced,
        },
        go,
      );
    },
    [rootRef, fxRef, veilRef, orbitsRef, rocksRef, navigate, light, reduced],
  );

  return { leavingKey, enter };
}
