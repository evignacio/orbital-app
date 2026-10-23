import { useEffect, useRef } from 'react';
import { useComets } from '@/hooks/useComets';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useStormDrawn } from '@/hooks/useStormDrawn';
import { drawClouds } from '@/viz/clouds';
import { createCometLayer, type CometLayer } from '@/viz/comet';
import { drawStars } from '@/viz/stars';
import { drawStorm } from '@/viz/storm';
import styles from './SkyLayers.module.css';

/**
 * Camadas de fundo do painel, atrás de todo o conteúdo:
 * estrelas, nuvens, halo, tempestade e cometa. Cada camada é um contêiner vazio
 * com a opacidade do tema (--star-opacity, --cloud-opacity, --calm, --storm-on,
 * --comet-opacity); o desenho é das tarefas 3.7 (estrelas), 3.8 (nuvens e
 * tempestade) e 3.9 (cometa). Lê tema/tempestade das stores; não recebe props.
 */
export function SkyLayers() {
  const starsRef = useRef<HTMLDivElement>(null);
  const cloudsRef = useRef<HTMLDivElement>(null);
  const stormRef = useRef<HTMLDivElement>(null);
  const cometRef = useRef<HTMLDivElement>(null);
  const cometLayer = useRef<CometLayer | null>(null);
  const reducedMotion = useReducedMotion();
  // Ao voltar a API a tempestade some pela opacidade (--storm-on) e sai do DOM depois do fade.
  const stormDrawn = useStormDrawn();

  // Desenhadas uma vez: o tema só muda a opacidade da camada e pausa o piscar (--stars-play).
  useEffect(() => {
    const el = starsRef.current;
    return el ? drawStars(el) : undefined;
  }, []);

  // Idem para as nuvens, invisíveis e pausadas no escuro (--cloud-opacity, --clouds-play).
  useEffect(() => {
    const el = cloudsRef.current;
    return el ? drawClouds(el) : undefined;
  }, []);

  useEffect(() => {
    const el = stormRef.current;
    if (!el || !stormDrawn) return undefined;
    return drawStorm(el, { reducedMotion });
  }, [stormDrawn, reducedMotion]);

  useEffect(() => {
    const el = cometRef.current;
    if (!el) return undefined;
    const layer = createCometLayer(el);
    cometLayer.current = layer;
    return () => {
      layer.dispose();
      cometLayer.current = null;
    };
  }, []);

  useComets(() => {
    cometLayer.current?.launch();
    return cometLayer.current !== null;
  });

  return (
    <>
      <div ref={starsRef} className={styles.stars} />
      <div ref={cloudsRef} className={styles.clouds} />
      <div className={styles.halo} />
      <div ref={stormRef} className={styles.storm} />
      <div ref={cometRef} className={styles.comet} />
    </>
  );
}
