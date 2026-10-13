import { select, type BaseType, type Selection } from 'd3-selection';
import './weather-keyframes.css';

// Nuvens à deriva do céu claro. A tempestade reaproveita appendClouds com nuvens carregadas.

export interface CloudSpec {
  /** Altura em % do contêiner. */
  top: number;
  scale: number;
  /** Duração e atraso da deriva, em segundos. */
  dur: number;
  delay: number;
  op: number;
}

export const SKY_CLOUDS: readonly CloudSpec[] = [
  { top: 6, scale: 1.5, dur: 160, delay: -40, op: 0.95 },
  { top: 22, scale: 0.9, dur: 210, delay: -130, op: 0.75 },
  { top: 44, scale: 1.2, dur: 250, delay: -60, op: 0.6 },
  { top: 63, scale: 0.7, dur: 190, delay: -170, op: 0.5 },
  { top: 78, scale: 1.35, dur: 300, delay: -20, op: 0.45 },
];

/** Uma nuvem de elipses na caixa 260x104, com a sombra mais escura embaixo. */
export function cloudSvg(scale: number, fill: string, shade: string): string {
  return `<svg width="${String(260 * scale)}" height="${String(104 * scale)}" viewBox="0 0 260 104" fill="none">
    <g style="fill:${fill}">
      <ellipse cx="82" cy="66" rx="74" ry="30"/>
      <ellipse cx="104" cy="44" rx="46" ry="34"/>
      <ellipse cx="152" cy="56" rx="52" ry="28"/>
      <ellipse cx="192" cy="68" rx="46" ry="22"/>
    </g>
    <g style="fill:${shade}" opacity=".55">
      <ellipse cx="70" cy="80" rx="58" ry="12"/>
      <ellipse cx="170" cy="80" rx="48" ry="10"/>
    </g>
  </svg>`;
}

/**
 * Uma camada de nuvens à deriva dentro de `sel`, uma div por spec. Devolve as
 * divs para quem chama completar o estilo; animation-play-state tem de vir
 * depois, pois o atalho animation o zera.
 */
export function appendClouds<P extends BaseType>(
  sel: Selection<P, unknown, null, undefined>,
  specs: readonly CloudSpec[],
  fill: string,
  shade: string,
): Selection<HTMLDivElement, CloudSpec, P, unknown> {
  return sel
    .selectAll<HTMLDivElement, CloudSpec>('div')
    .data(specs)
    .join('div')
    .style('position', 'absolute')
    .style('top', (d) => `${String(d.top)}%`)
    .style('left', '0')
    .style('opacity', (d) => d.op)
    .style('animation', (d) => `drift ${String(d.dur)}s linear ${String(d.delay)}s infinite`)
    .html((d) => cloudSvg(d.scale, fill, shade));
}

/** Desenha as nuvens do céu claro em `el`; a limpeza as remove. */
export function drawClouds(el: HTMLElement): () => void {
  const clouds = appendClouds(select(el), SKY_CLOUDS, '#ffffff', '#cfe2f4')
    .style('transform-origin', 'left center')
    // Invisíveis no tema escuro: pausadas pelo tema (--clouds-play).
    .style('animation-play-state', 'var(--clouds-play, running)');
  return () => {
    clouds.remove();
  };
}
