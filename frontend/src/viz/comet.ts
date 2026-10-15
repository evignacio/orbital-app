import { select } from 'd3-selection';
import './comet.css';

// Cometa do painel: uma pista girada que cruza o
// céu uma vez, com cauda em degradê e cabeça brilhante. Cores pelas variáveis do tema.

export interface CometTrajectory {
  /** Altura da pista, em % do contêiner. */
  top: number;
  /** Inclinação em graus: ~8–28 desce para a direita, ~152–172 para a esquerda. */
  rot: number;
  /** Comprimento da cauda, em px. */
  len: number;
  /** Duração da travessia, em s. */
  dur: number;
}

export function cometTrajectory(random: () => number = Math.random): CometTrajectory {
  const flip = random() < 0.5;
  return {
    top: 4 + random() * 36,
    rot: flip ? 152 + random() * 20 : 8 + random() * 20,
    len: 100 + random() * 120,
    dur: 2.4 + random() * 1.2,
  };
}

function cometHtml(len: number): string {
  return (
    `<div style="width:${String(len)}px; height:2px; border-radius:2px; background:linear-gradient(90deg, transparent, var(--comet-tail))"></div>` +
    `<div style="width:5px; height:5px; margin-left:-2px; border-radius:50%; background:var(--comet-head); box-shadow:0 0 8px 2px var(--comet-tail), 0 0 18px 4px var(--comet-tail)"></div>`
  );
}

export interface CometLayer {
  launch: () => void;
  /** Remove os cometas ainda em voo. */
  dispose: () => void;
}

export function createCometLayer(el: HTMLElement, random: () => number = Math.random): CometLayer {
  const root = select(el);
  return {
    launch() {
      const d = cometTrajectory(random);
      const lane = root
        .append('div')
        .style('position', 'absolute')
        .style('left', '0')
        .style('top', `${String(d.top)}%`)
        .style('width', '100vw')
        .style('transform', `rotate(${String(d.rot)}deg)`)
        .style('transform-origin', '50% 50%');
      lane
        .append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('width', 'max-content')
        .style('opacity', '0')
        .style('animation', `comet ${String(d.dur)}s linear 1 forwards`)
        .style('animation-play-state', 'var(--backdrop-play, running)')
        .on('animationend', () => {
          lane.remove();
        })
        .html(cometHtml(d.len));
    },
    dispose() {
      root.selectAll(':scope > div').remove();
    },
  };
}
