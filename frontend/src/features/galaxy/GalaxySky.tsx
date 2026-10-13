import styles from './GalaxySky.module.css';

export interface GalaxySkyProps {
  /** Muda a cada resize da página: redesenha a espiral no tamanho novo. */
  sizeKey: number;
  /** Entrando numa órbita: o céu apaga para .25 (transição de .8s ease-in). */
  leaving: boolean;
}

/**
 * Céu da galáxia (legacy index.html ~61–62): o canvas da espiral (drawSky) e a
 * camada da cintilação (drawTwinkles, 34 pontos com `galaxyTwinkle`, de
 * viz/galaxy-keyframes.css). Os dois elementos já têm a posição, a opacidade do
 * tema (--star-opacity) e o apagar da saída; o desenho é da tarefa 4.2.
 */
export function GalaxySky({ leaving }: GalaxySkyProps) {
  return (
    <>
      <canvas className={styles.sky} data-leaving={leaving} />
      <div className={styles.twinkles} />
    </>
  );
}
