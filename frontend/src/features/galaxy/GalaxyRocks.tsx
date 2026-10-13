import { useEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { drawGalaxyRocks, type GalaxyRocksDrawing } from '@/viz/galaxy-rocks';
import styles from './GalaxyRocks.module.css';

/** Posição atual de um asteroide: a sucção puxa 10 partículas de cada um. */
export interface RockSnapshot {
  x: number;
  y: number;
  size: number;
}

/** O que a sucção (useEnterOrbit) lê dos asteroides. */
export interface GalaxyRocksHandle {
  rocks: () => readonly RockSnapshot[];
}

export interface GalaxyRocksProps {
  /** Muda a cada resize da página: refaz os asteroides no tamanho novo. */
  sizeKey: number;
  /** Entrando numa órbita: a camada some (opacity 0 em .16s). */
  leaving: boolean;
  /** Preenchido enquanto montado; a lista fica vazia enquanto não há asteroides. */
  handleRef: RefObject<GalaxyRocksHandle | null>;
}

/**
 * Asteroides à deriva (legacy index.html ~63, galaxy.js drawRocks): arremessáveis
 * com o ponteiro e com colisão. Como no legado, o resize e a troca do movimento
 * reduzido os refazem; o tema só troca as variáveis --rock-*.
 */
export function GalaxyRocks({ sizeKey, leaving, handleRef }: GalaxyRocksProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drawing = useRef<GalaxyRocksDrawing | null>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const drawn = drawGalaxyRocks(el, { still });
    drawing.current = drawn;
    return () => {
      drawn.destroy();
      drawing.current = null;
    };
  }, [sizeKey, still]);

  useEffect(() => {
    handleRef.current = { rocks: () => drawing.current?.rocks() ?? [] };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  return <div ref={ref} className={styles.layer} data-leaving={leaving} />;
}
