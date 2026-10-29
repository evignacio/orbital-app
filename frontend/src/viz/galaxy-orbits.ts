import { select } from 'd3-selection';
import type { MotionClock } from '../domain/motion-clock';
import { hashId, rng } from '../domain/random';
import { statusColor } from '../domain/status';
import type { StatusMap } from '../domain/types';
import { layout, systemTones, type GalaxyOrbit, type Tone } from './galaxy-layout';
import { appendOrbitLabel } from './galaxy-orbit-label';
import { appendOrbitCore } from './orbit-core';
import { frameLoop, type FrameLoop } from './frame-loop';

/** Um planetinha de um sistema: anel (rx, ry), fase e velocidade. */
export interface MiniPlanet {
  tone: Tone;
  rx: number;
  ry: number;
  ph: number;
  sp: number;
}

/** Uma órbita desenhada: a posição (x, y) é a atual, com a deriva. */
export interface GalaxyOrbitNode extends GalaxyOrbit {
  i: number;
  size: number;
  rings: number[];
  col: string;
  x: number;
  y: number;
  bx: number;
  by: number;
  planets: MiniPlanet[];
  ax: number;
  ay: number;
  f1: number;
  f2: number;
  f3: number;
  f4: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
}

export interface GalaxyOrbitsScene {
  /** orbitsData(apps, status): na ordem de nascimento. */
  orbits: readonly GalaxyOrbit[];
  status: Readonly<StatusMap>;
  /** orbitColors(apps, theme). */
  colorOf: (key: string) => string;
  light: boolean;
  /** Status antigo ou API fora: planetinhas cinza e legenda ÚLTIMO. */
  stale: boolean;
  /** prefers-reduced-motion: sem deriva nem rotação, sem timer. */
  still: boolean;
  /** O mesmo entre redesenhos, para nada pular; pausado, a deriva e a rotação param. */
  clock: MotionClock;
  onEnter: (node: GalaxyOrbitNode) => void;
}

export interface GalaxyOrbitsDrawing {
  /** As órbitas desenhadas, com a posição atual (a sucção parte delas). */
  nodes: () => readonly GalaxyOrbitNode[];
  /** Entrando numa órbita: as outras somem e a deriva para. */
  leave: (key: string) => void;
  /** Para o timer e remove o svg. */
  destroy: () => void;
}

const TAU = 6.28;

function nodesFor(scene: GalaxyOrbitsScene, W: number, H: number): GalaxyOrbitNode[] {
  const pos = layout(scene.orbits, W, H);
  const rr = rng(53);
  return scene.orbits.map((o, i) => {
    const size = Math.min(26, 13 + Math.sqrt(o.n) * 3.2);
    const tones = systemTones(o, scene.status);
    const rings = tones.length >= 3 ? [size * 1.9, size * 2.9] : [size * 2.3];
    const ph = (hashId(o.key) % 628) / 100;
    const [x, y] = pos[i] ?? [0, 0];
    return {
      ...o,
      i,
      size,
      rings,
      col: scene.colorOf(o.key),
      x,
      y,
      bx: x,
      by: y,
      // Planetinhas alternando entre os anéis; o de dentro gira mais rápido.
      planets: tones.map((tone, k) => {
        const ring = k % rings.length;
        const r = rings[ring] ?? size;
        return { tone, rx: r, ry: r * 0.42, ph: ph + k * 2.399, sp: 0.4 / (1 + ring * 0.55) };
      }),
      // Deriva lenta: duas senoides por eixo com frequência e fase próprias.
      ax: 18 + rr() * 22,
      ay: 14 + rr() * 18,
      f1: 0.035 + rr() * 0.03,
      f2: 0.021 + rr() * 0.02,
      f3: 0.028 + rr() * 0.025,
      f4: 0.017 + rr() * 0.02,
      p1: rr() * TAU,
      p2: rr() * TAU,
      p3: rr() * TAU,
      p4: rr() * TAU,
    };
  });
}

/**
 * As órbitas da galáxia: cada uma é um sistema
 * como o do painel — no centro a lua (escuro) ou o sol (claro), em volta anéis
 * tracejados na cor da órbita com planetinhas na cor de status (systemTones) e,
 * embaixo, a legenda. Tudo é refeito a cada chamada, como no legado; o `clock`
 * compartilhado mantém a deriva e a rotação contínuas entre redesenhos.
 */
export function drawGalaxyOrbits(el: HTMLElement, scene: GalaxyOrbitsScene): GalaxyOrbitsDrawing {
  const W = el.clientWidth;
  const H = el.clientHeight;
  const root = select(el);
  root.selectAll('svg').remove();
  if (!W) return { nodes: () => [], leave: () => undefined, destroy: () => undefined };

  const { light, stale, still, clock, onEnter } = scene;
  const svg = root
    .append('svg')
    .attr('width', W)
    .attr('height', H)
    .style('display', 'block')
    .style('pointer-events', 'none');
  const defs = svg.append('defs');
  const f = defs
    .append('filter')
    .attr('id', 'gglow')
    .attr('x', '-80%')
    .attr('y', '-80%')
    .attr('width', '260%')
    .attr('height', '260%');
  f.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'b');
  const m = f.append('feMerge');
  m.append('feMergeNode').attr('in', 'b');
  m.append('feMergeNode').attr('in', 'SourceGraphic');

  const data = nodesFor(scene, W, H);
  let leaving = false;

  const g = svg
    .selectAll<SVGGElement, GalaxyOrbitNode>('g.orb')
    .data(data)
    .join('g')
    .attr('class', 'orb')
    .style('pointer-events', 'all')
    .attr('transform', (d) => `translate(${String(d.x)},${String(d.y)})`)
    .style('cursor', 'pointer')
    .attr('role', 'link')
    .attr('tabindex', 0)
    .attr('aria-label', (d) => `Abrir a órbita ${d.name}`)
    .on('click', (_e: MouseEvent, d) => {
      onEnter(d);
    })
    .on('keydown', (e: KeyboardEvent, d) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnter(d);
      }
    })
    .on('mouseenter', function () {
      select(this).select('.body').style('transform', 'scale(1.08)');
      select(this).selectAll('.ring').attr('stroke-opacity', 1);
    })
    .on('mouseleave', function () {
      select(this).select('.body').style('transform', 'scale(1)');
      select(this).selectAll('.ring').attr('stroke-opacity', 0.6);
    });

  g.append('circle')
    .attr('r', (d) => d.size * 3)
    .attr('fill', 'transparent');
  const b = g.append('g').attr('class', 'body').style('transition', 'transform .2s ease');
  b.selectAll('ellipse.ring')
    .data((d) => d.rings.map((r) => ({ r, col: d.col })))
    .join('ellipse')
    .attr('class', 'ring')
    .attr('rx', (r) => r.r)
    .attr('ry', (r) => r.r * 0.42)
    .attr('fill', 'none')
    .style('stroke', (r) => r.col)
    .attr('stroke-width', 1.3)
    .attr('stroke-dasharray', '4 6')
    .attr('stroke-opacity', 0.6);
  // O núcleo do painel tem raio 17: aqui ele fica com ~70% do tamanho da órbita.
  appendOrbitCore(
    b.append('g').attr('transform', (d) => `scale(${String((d.size * 0.7) / 17)})`),
    defs,
    light,
    'gglow',
  );
  const planets = b
    .selectAll<SVGCircleElement, MiniPlanet>('circle.mini')
    .data((d) => d.planets)
    .join('circle')
    .attr('class', 'mini')
    .attr('r', 4.6)
    .style('fill', (p) => (stale ? 'var(--stale)' : statusColor(p.tone)))
    .style('stroke', 'var(--planet-edge)')
    .attr('stroke-width', 0.8)
    .attr('stroke-dasharray', stale ? '1.5 1.5' : null);
  const planetTick = (t: number) => {
    planets.each(function (p) {
      const a = p.ph + t * p.sp;
      this.setAttribute('cx', String(Math.cos(a) * p.rx));
      this.setAttribute('cy', String(Math.sin(a) * p.ry));
    });
  };

  appendOrbitLabel(g, (d) => d.size * 1.3 + 26, stale);

  const place = (t: number) => {
    g.attr('transform', (d) => {
      d.x =
        d.bx +
        d.ax * (0.65 * Math.sin(t * d.f1 * TAU + d.p1) + 0.35 * Math.sin(t * d.f2 * TAU + d.p2));
      d.y =
        d.by +
        d.ay * (0.65 * Math.sin(t * d.f3 * TAU + d.p3) + 0.35 * Math.sin(t * d.f4 * TAU + d.p4));
      return `translate(${String(d.x)},${String(d.y)})`;
    });
  };

  const frame = () => {
    const t = clock.now() / 1000;
    planetTick(t);
    place(t);
  };
  let drift: FrameLoop | null = null;
  if (still) planetTick(0);
  else {
    // Já na posição certa: sem isso os planetinhas nascem no centro da lua até o primeiro quadro.
    frame();
    drift = frameLoop(() => {
      if (leaving || clock.isPaused()) return;
      frame();
    });
  }

  return {
    nodes: () => data,
    leave: (key) => {
      leaving = true;
      g.filter((o) => o.key !== key)
        .style('transition', 'opacity .16s')
        .style('opacity', 0);
    },
    destroy: () => {
      drift?.stop();
      drift = null;
      svg.remove();
    },
  };
}
