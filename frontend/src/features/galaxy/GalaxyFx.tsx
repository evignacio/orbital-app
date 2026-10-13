import type { RefObject } from 'react';
import styles from './GalaxyFx.module.css';

export interface GalaxyFxProps {
  /** Canvas das partículas da sucção (runFx). */
  fxRef: RefObject<HTMLCanvasElement | null>;
  /** Véu --veil; começa transparente e o useEnterOrbit o acende (veilAt). */
  veilRef: RefObject<HTMLDivElement | null>;
}

/**
 * As duas camadas da saída, por cima de tudo menos
 * do formulário: o canvas da sucção (z 44) e o véu (z 45). Montadas com a página,
 * nascem limpas a cada volta à galáxia. Quem desenha nelas é o useEnterOrbit (viz/galaxy-fx).
 */
export function GalaxyFx({ fxRef, veilRef }: GalaxyFxProps) {
  return (
    <>
      <canvas ref={fxRef} className={styles.fx} />
      <div ref={veilRef} className={styles.veil} data-testid="galaxy-veil" />
    </>
  );
}
