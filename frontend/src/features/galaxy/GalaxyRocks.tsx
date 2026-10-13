import type { RefObject } from 'react';
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
  /** Preenchido enquanto montado; null quando ainda não há asteroides. */
  handleRef: RefObject<GalaxyRocksHandle | null>;
}

/**
 * Asteroides à deriva (legacy index.html ~63, galaxy.js drawRocks): arremessáveis
 * com o ponteiro e com colisão. O contêiner já tem a posição e o apagar da saída;
 * o desenho (viz/galaxy-rocks) é da tarefa 4.3.
 */
export function GalaxyRocks({ leaving }: GalaxyRocksProps) {
  return <div className={styles.layer} data-leaving={leaving} />;
}
