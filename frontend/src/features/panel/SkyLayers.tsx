import { useEffect, useRef } from 'react';
import { useComets } from '@/hooks/useComets';
import { createCometLayer, type CometLayer } from '@/viz/comet';
import { drawStars } from '@/viz/stars';
import styles from './SkyLayers.module.css';

/**
 * Camadas de fundo do painel (painel.html ~72–76), atrás de todo o conteúdo:
 * estrelas, nuvens, halo, tempestade e cometa. Cada camada é um contêiner vazio
 * com a opacidade do tema (--star-opacity, --cloud-opacity, --calm, --storm-on,
 * --comet-opacity); o desenho é das tarefas 3.7 (estrelas), 3.8 (nuvens e
 * tempestade) e 3.9 (cometa). Lê tema/tempestade das stores; não recebe props.
 */
export function SkyLayers() {
  const starsRef = useRef<HTMLDivElement>(null);
  const cometRef = useRef<HTMLDivElement>(null);
  const cometLayer = useRef<CometLayer | null>(null);

  // Desenhadas uma vez: o tema só muda a opacidade da camada e pausa o piscar (--stars-play).
  useEffect(() => {
    const el = starsRef.current;
    return el ? drawStars(el) : undefined;
  }, []);

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
      <div className={styles.clouds} />
      <div className={styles.halo} />
      <div className={styles.storm} />
      <div ref={cometRef} className={styles.comet} />
    </>
  );
}
