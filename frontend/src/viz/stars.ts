import { select } from 'd3-selection';
import './keyframes.css';

// Céu estrelado do painel (legacy/script.js drawStars). 4 grupos com ritmo e fase
// próprios piscam no lugar de 160 animações, uma por estrela; a opacidade base de
// cada estrela disfarça que o grupo pisca junto.

export const STAR_COUNT = 160;
export const STAR_PHASES = [
  { dur: 4, delay: 0 },
  { dur: 5.5, delay: -2.1 },
  { dur: 7, delay: -4.6 },
  { dur: 8.5, delay: -1.3 },
] as const;

export interface Star {
  /** Índice do grupo em STAR_PHASES. */
  g: number;
  /** Posição em % do contêiner. */
  x: number;
  y: number;
  r: number;
  op: number;
  fill: string;
}

/** As estrelas, sorteadas a cada carga como no legado (random injetável para teste). */
export function starField(random: () => number = Math.random): Star[] {
  return Array.from({ length: STAR_COUNT }, (_, i) => {
    const x = random() * 100;
    const y = random() * 100;
    const r = random() * 1.5 + 0.4;
    const op = 0.6 + random() * 0.4;
    return { g: i % STAR_PHASES.length, x, y, r, op, fill: r > 1.4 ? '#cfc9f2' : '#e9e9ed' };
  });
}

/** Desenha as estrelas em `el`; a limpeza remove o svg. */
export function drawStars(el: HTMLElement, random: () => number = Math.random): () => void {
  const data = starField(random);
  const svg = select(el)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .style('display', 'block');
  svg
    .selectAll('g')
    .data(STAR_PHASES)
    .join('g')
    .style('animation', (d) => `twinkle ${String(d.dur)}s ease-in-out ${String(d.delay)}s infinite`)
    // Invisíveis no tema claro: pausadas para não gastar quadro à toa.
    .style('animation-play-state', 'var(--stars-play, running)')
    .selectAll('circle')
    .data((_, gi) => data.filter((d) => d.g === gi))
    .join('circle')
    .attr('cx', (d) => `${String(d.x)}%`)
    .attr('cy', (d) => `${String(d.y)}%`)
    .attr('r', (d) => d.r)
    .attr('opacity', (d) => d.op)
    .attr('fill', (d) => d.fill);
  return () => {
    svg.remove();
  };
}
