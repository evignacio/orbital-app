import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { drawSky, drawTwinkles } from '@/viz/galaxy-sky';
import styles from './GalaxySky.module.css';

export interface GalaxySkyProps {
  /** Muda a cada resize da página: redesenha a espiral no tamanho novo. */
  sizeKey: number;
  /** Entrando numa órbita: o céu apaga para .25 (transição de .8s ease-in). */
  leaving: boolean;
}

/**
 * Céu da galáxia: o canvas da espiral (drawSky) e a
 * camada da cintilação (drawTwinkles, 34 pontos com `galaxyTwinkle`). O tema não
 * redesenha nada, como no legado: o claro esconde os dois por --star-opacity.
 */
export function GalaxySky({ sizeKey, leaving }: GalaxySkyProps) {
  const skyRef = useRef<HTMLCanvasElement>(null);
  const twinkleRef = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const cv = skyRef.current;
    if (!cv) return;
    return drawSky(cv);
  }, [sizeKey]);

  // A cintilação é em %: o tamanho não muda nada, só o movimento reduzido.
  useEffect(() => {
    const el = twinkleRef.current;
    if (!el) return;
    return drawTwinkles(el, still);
  }, [still]);

  return (
    <>
      <canvas ref={skyRef} className={styles.sky} data-leaving={leaving} />
      <div ref={twinkleRef} className={styles.twinkles} />
    </>
  );
}
