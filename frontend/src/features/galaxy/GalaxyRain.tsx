import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useStormDrawn } from '@/hooks/useStormDrawn';
import { drawRain } from '@/viz/storm';
import styles from './GalaxyRain.module.css';

export interface GalaxyRainProps {
  /** Entrando numa órbita: a chuva some com os asteroides (opacity 0 em .16s). */
  leaving: boolean;
}

/**
 * Chuva da tempestade na galáxia (drawRain): aparece e some pela opacidade
 * (--storm-on) e sai do DOM depois do fade (useStormDrawn).
 */
export function GalaxyRain({ leaving }: GalaxyRainProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drawn = useStormDrawn();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !drawn) return undefined;
    return drawRain(el, { reducedMotion });
  }, [drawn, reducedMotion]);

  return <div ref={ref} className={styles.rain} data-leaving={leaving} />;
}
