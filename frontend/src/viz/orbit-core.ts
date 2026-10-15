import type { BaseType, Selection } from 'd3-selection';
import './keyframes.css';

// Nuvem com raio do Phosphor (cloud-lightning): o núcleo quando a API está fora.
export const CLOUD_BOLT_PATH =
  'M156,168H132.53l-14.4,24H144a8,8,0,0,1,6.86,12.12l-24,40a8,8,0,0,1-13.72-8.24L129.87,208H104a8,8,0,0,1-6.86-12.12L113.87,168h-37C48.12,168,24.2,145.07,24,116.36A52.09,52.09,0,0,1,61.35,66.1a4,4,0,0,1,5,4.78A92.48,92.48,0,0,0,64,87.39,8.14,8.14,0,0,0,71.41,96l.6,0a8.18,8.18,0,0,0,8.08-7.72A76,76,0,1,1,156,168Z';

const RAYS = Array.from({ length: 12 }, (_, i) => i);
const CRATERS: readonly (readonly [number, number, number])[] = [
  [-5, -4, 3.2],
  [4.5, 2.5, 4.2],
  [-2, 7, 2],
  [7, -6, 2],
];

/**
 * Núcleo de uma órbita: lua no tema escuro,
 * sol no claro, com raio de 17 (e halo até ~34). `sel` é um ou vários <g> (o
 * painel usa um, a galáxia um por órbita); `glowId` é o filtro de brilho já
 * definido no SVG. Os gradientes entram no defs uma vez só.
 */
export function appendOrbitCore<
  G extends BaseType,
  D,
  P extends BaseType,
  PD,
  DD,
  DP extends BaseType,
  DPD,
>(
  sel: Selection<G, D, P, PD>,
  defs: Selection<SVGDefsElement, DD, DP, DPD>,
  light: boolean,
  glowId: string,
): void {
  if (light) {
    if (defs.select('#coreSun').empty()) {
      const grad = defs.append('radialGradient').attr('id', 'coreSun');
      grad.append('stop').attr('offset', '0%').attr('stop-color', '#fff3d6');
      grad.append('stop').attr('offset', '100%').attr('stop-color', '#f0a83c');
    }
    sel.append('circle').attr('r', 34).attr('fill', 'rgba(240,168,60,.14)');
    sel
      .append('g')
      .selectAll('line')
      .data(RAYS)
      .join('line')
      .attr('x1', (d) => Math.cos((d * Math.PI) / 6) * 21)
      .attr('y1', (d) => Math.sin((d * Math.PI) / 6) * 21)
      .attr('x2', (d) => Math.cos((d * Math.PI) / 6) * 28)
      .attr('y2', (d) => Math.sin((d * Math.PI) / 6) * 28)
      .attr('stroke', '#e8a53c')
      .attr('stroke-width', 1.6)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.7);
    sel
      .append('circle')
      .attr('r', 17)
      .attr('fill', 'url(#coreSun)')
      .attr('filter', `url(#${glowId})`);
    return;
  }
  if (defs.select('#coreMoon').empty()) {
    const grad = defs
      .append('radialGradient')
      .attr('id', 'coreMoon')
      .attr('cx', '35%')
      .attr('cy', '32%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#f4f3fb');
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#b9b6cf');
  }
  sel.append('circle').attr('r', 33).attr('fill', 'rgba(199,192,238,.09)');
  sel
    .append('circle')
    .attr('r', 17)
    .attr('fill', 'url(#coreMoon)')
    .attr('filter', `url(#${glowId})`);
  sel
    .selectAll('circle.crater')
    .data(CRATERS)
    .join('circle')
    .attr('class', 'crater')
    .attr('cx', (d) => d[0])
    .attr('cy', (d) => d[1])
    .attr('r', (d) => d[2])
    .attr('fill', '#9e9ab8')
    .attr('opacity', 0.45);
}

/**
 * Núcleo do painel com a API fora: a
 * central vira o ícone de tempestade, sem sinal dos planetas.
 */
export function appendStormCore<G extends BaseType, D, P extends BaseType, PD>(
  g: Selection<G, D, P, PD>,
): void {
  g.append('circle').attr('r', 34).style('fill', 'var(--storm-fill)');
  g.append('circle')
    .attr('r', 26)
    .style('fill', 'none')
    .style('stroke', 'var(--storm-line)')
    .attr('stroke-dasharray', '2 4');
  g.append('path')
    .attr('d', CLOUD_BOLT_PATH)
    .attr('transform', 'translate(-17,-19) scale(.133)')
    .style('fill', 'var(--storm)')
    .style('filter', 'drop-shadow(0 0 6px var(--storm-line))')
    .style('animation', 'flicker 4s linear infinite')
    .style('animation-play-state', 'var(--backdrop-play, running)');
  g.append('text')
    .attr('y', 50)
    .attr('text-anchor', 'middle')
    .style('fill', 'var(--storm)')
    .style('font', '500 10px var(--mono)')
    .style('letter-spacing', '.2em')
    .text('SEM SINAL');
}
