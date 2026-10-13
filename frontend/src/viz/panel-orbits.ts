import { select, type Selection } from 'd3-selection';
import { timer, type Timer } from 'd3-timer';
import { STATUSES, statusColor } from '../domain/status';
import type { StatusMap } from '../domain/types';
import { appendOrbitCore, appendStormCore } from './orbit-core';
import {
  ORBIT_TILT,
  haloFill,
  maxRadius,
  orbitBox,
  planetNodes,
  planetTransform,
  ringRadii,
  type OrbitPlanet,
  type PlanetNode,
} from './orbit-geometry';

/** O que só muda com um redesenho do esqueleto (tema, tempestade, ambiente, tamanho). */
export interface PanelOrbitScene {
  light: boolean;
  /** API fora: o núcleo vira a nuvem de tempestade e os planetas ficam stale. */
  storm: boolean;
  /** prefers-reduced-motion: planetas parados, sem timer. */
  still: boolean;
  /** Início da rotação (ms): o mesmo entre redesenhos, para os planetas não pularem. */
  t0: number;
  onSelect: (id: string) => void;
}

/** O que muda sem redesenhar (sync, busca, filtro, seleção). */
export interface PanelPlanets {
  planets: readonly OrbitPlanet[];
  status: Readonly<StatusMap>;
  selectedId: string | null;
  /** Status antigo ou sem contato: visual cinza, apagado e tracejado. */
  stale: boolean;
}

export interface PanelOrbit {
  /** Data join dos planetas (legado updatePlanets): só entram e saem os que mudaram. */
  update: (state: PanelPlanets) => void;
  /** Para o timer e remove o svg. */
  destroy: () => void;
}

type PlanetSel = Selection<SVGGElement, PlanetNode, SVGGElement, unknown>;

/**
 * Esqueleto da órbita do painel: svg, brilhos,
 * anéis, núcleo e planetas, com o timer de rotação. Quem chama refaz tudo só
 * quando muda a cena; o resto passa por `update`.
 */
export function drawOrbits(
  el: HTMLElement,
  scene: PanelOrbitScene,
  initial: PanelPlanets,
): PanelOrbit {
  const { light, storm, still, t0, onSelect } = scene;
  const { W, H } = orbitBox(el.clientWidth, el.clientHeight);
  const root = select(el);
  root.selectAll('svg').remove();
  const svg = root
    .append('svg')
    .attr('viewBox', `0 0 ${String(W)} ${String(H)}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('display', 'block')
    .style('width', '100%')
    .style('height', '100%');
  const g = svg.append('g').attr('transform', `translate(${String(W / 2)},${String(H / 2)})`);

  const defs = svg.append('defs');
  const f = defs
    .append('filter')
    .attr('id', 'oglow')
    .attr('x', '-80%')
    .attr('y', '-80%')
    .attr('width', '260%')
    .attr('height', '260%');
  f.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'b');
  const m = f.append('feMerge');
  m.append('feMergeNode').attr('in', 'b');
  m.append('feMergeNode').attr('in', 'SourceGraphic');

  // Brilho dos planetas pré-desenhado: um feGaussianBlur em algo que se move
  // é refeito a cada quadro. O #oglow fica só no núcleo, que é estático.
  [...STATUSES, 'idle'].forEach((k) => {
    const gr = defs.append('radialGradient').attr('id', `glow-${k}`);
    gr.append('stop')
      .attr('offset', '35%')
      .style('stop-color', statusColor(k))
      .attr('stop-opacity', 0.55);
    gr.append('stop')
      .attr('offset', '100%')
      .style('stop-color', statusColor(k))
      .attr('stop-opacity', 0);
  });

  const ringsG = g.append('g');
  if (storm) appendStormCore(g);
  else appendOrbitCore(g, defs, light, 'oglow');
  const planetsG = g.append('g');
  const rMax = maxRadius(W, H);
  let planetSel: PlanetSel | null = null;

  const elapsed = () => (still ? 0 : (Date.now() - t0) / 1000);

  const update = (state: PanelPlanets) => {
    const nodes = planetNodes(state.planets, rMax);
    ringsG
      .selectAll('ellipse')
      .data(ringRadii(nodes))
      .join('ellipse')
      .attr('rx', (d) => d)
      .attr('ry', (d) => d * ORBIT_TILT)
      .attr('fill', 'none')
      .style('stroke', 'var(--orbit-ring)')
      .attr('stroke-dasharray', '3 7');

    planetSel = planetsG
      .selectAll<SVGGElement, PlanetNode>('g.planet')
      .data(nodes, (d) => d.id)
      .join((enter) => {
        const node = enter
          .append('g')
          .attr('class', 'planet')
          .style('cursor', 'pointer')
          .on('click', (_e: MouseEvent, d) => {
            onSelect(d.id);
          });
        node.append('circle').attr('class', 'halo');
        node.append('circle').attr('class', 'body');
        node.append('circle').attr('class', 'shine');
        node
          .append('text')
          .attr('class', 'label')
          .attr('text-anchor', 'middle')
          .style('font', "500 12px 'Inter', sans-serif");
        return node;
      });
    // Já na posição certa: sem esperar o próximo quadro (e parado, com movimento reduzido).
    const t = elapsed();
    planetSel.attr('transform', (d) => planetTransform(d, t));
    paintPlanets(planetSel, light, storm || state.stale, state.status, state.selectedId);
  };

  update(initial);

  let spin: Timer | null = null;
  if (!still) {
    spin = timer(() => {
      if (!planetSel) return;
      const t = elapsed();
      planetSel.attr('transform', (d) => planetTransform(d, t));
    });
  }

  return {
    update,
    destroy: () => {
      spin?.stop();
      spin = null;
      planetSel = null;
      svg.remove();
    },
  };
}

// O select() de cada filho propaga o dado atualizado do planeta pelo join.
function paintPlanets(
  node: PlanetSel,
  light: boolean,
  stale: boolean,
  status: Readonly<StatusMap>,
  selId: string | null,
): void {
  const glow = !light && !stale;
  // Sem contato, a cor seria do último check: fica cinza, apagada e tracejada.
  if (stale) node.style('opacity', 0.55);
  else node.style('opacity', null);
  node
    .select('circle.halo')
    .attr('r', (d) => d.size + (glow ? 14 : 7))
    .style('fill', (d) => haloFill(status[d.id], { stale, glow }))
    .attr('opacity', glow ? 1 : stale ? 0.08 : 0.14);
  node
    .select('circle.body')
    .attr('r', (d) => d.size)
    .style('fill', (d) => (stale ? 'var(--stale)' : statusColor(status[d.id])))
    .style('stroke', (d) => (selId === d.id ? 'var(--planet-edge-sel)' : 'var(--planet-edge)'))
    .attr('stroke-width', (d) => (selId === d.id ? 2.5 : 1))
    .attr('stroke-dasharray', stale ? '2 3' : null);
  node
    .select('circle.shine')
    .attr('r', (d) => d.size * 0.45)
    .attr('cx', (d) => -d.size * 0.3)
    .attr('cy', (d) => -d.size * 0.3)
    .style('fill', 'var(--planet-shine)');
  node
    .select('text.label')
    .attr('y', (d) => d.size + 18)
    .style('fill', 'var(--planet-label)')
    .text((d) => d.name);
}
