import { select, type BaseType, type Selection } from 'd3-selection';
import { appendClouds, type CloudSpec } from './clouds';
import './weather-keyframes.css';

// Tempestade do painel: a API está inacessível. A
// camada aparece e some pela opacidade (--storm-on); o desenho fica montado e só
// a animação pausa depois do fade (--storm-play).

/** Mesmo path do Icon 'lightning' (viz não importa components). */
export const BOLT_PATH =
  'M213.85,125.46l-112,120a8,8,0,0,1-13.69-7l14.66-73.33L45.19,143.49a8,8,0,0,1-3-13l112-120a8,8,0,0,1,13.69,7L153.18,90.9l57.63,21.61a8,8,0,0,1,3,12.95Z';

// Mesmas nuvens do céu claro, só que carregadas e amontoadas no alto.
export const STORM_CLOUDS: readonly CloudSpec[] = [
  { top: -6, scale: 2.2, dur: 120, delay: -30, op: 0.95 },
  { top: 2, scale: 1.7, dur: 150, delay: -95, op: 0.9 },
  { top: -3, scale: 1.9, dur: 135, delay: -70, op: 0.85 },
  { top: 12, scale: 1.3, dur: 180, delay: -10, op: 0.7 },
  { top: 26, scale: 1, dur: 210, delay: -150, op: 0.45 },
];

// A chuva cai em 4 camadas, cada uma com sua velocidade, no lugar de 140
// animações, uma por gota. Cada camada tem 200vh: as gotas da metade de cima
// se repetem 100vh abaixo, e a camada desce 100vh por ciclo, então o fim do
// ciclo é idêntico ao começo e o laço não tem emenda.
export const RAIN_LAYERS = [
  { dur: 0.6, delay: -0.2 },
  { dur: 0.75, delay: -0.5 },
  { dur: 0.9, delay: -0.1 },
  { dur: 1.05, delay: -0.7 },
] as const;

export const RAIN_DROP_COUNT = 140;

export interface RainDrop {
  /** Índice da camada em RAIN_LAYERS. */
  l: number;
  /** Posição: x em % da largura, y em vh. */
  x: number;
  y: number;
  /** Comprimento em px. */
  len: number;
  op: number;
}

// O segundo raio cai no primeiro clarão do ciclo (43%), o outro no segundo (93%).
export const BOLTS = [
  { left: 17, top: 4, size: 64, rot: 8, delay: 0 },
  { left: 72, top: 7, size: 46, rot: -6, delay: -3.5 },
] as const;

/** As gotas, sorteadas a cada desenho como no legado (random injetável para teste). */
export function rainDrops(random: () => number = Math.random): RainDrop[] {
  return Array.from({ length: RAIN_DROP_COUNT }, (_, i) => {
    const x = random() * 100;
    const y = random() * 100;
    const len = 14 + random() * 18;
    const op = 0.35 + random() * 0.65;
    return { l: i % RAIN_LAYERS.length, x, y, len, op };
  });
}

/** As gotas de uma camada, cada uma seguida da sua cópia 100vh abaixo. */
export function layerDrops(drops: readonly RainDrop[], layer: number): RainDrop[] {
  return drops.filter((d) => d.l === layer).flatMap((d) => [d, { ...d, y: d.y + 100 }]);
}

export interface StormOptions {
  /** prefers-reduced-motion: sem chuva, clarão nem raios (as nuvens ficam). */
  reducedMotion: boolean;
  random?: () => number;
}

function fixed<E extends BaseType, D, P extends BaseType, PD>(sel: Selection<E, D, P, PD>) {
  return sel.style('position', 'fixed').style('inset', '0');
}

// Fora da tempestade a animação pausa, mas só depois do fade (useTheme atrasa --storm-play).
function play<E extends BaseType, D, P extends BaseType, PD>(sel: Selection<E, D, P, PD>) {
  return sel.style('animation-play-state', 'var(--storm-play, paused)');
}

/** Desenha a tempestade em `el`; a limpeza remove tudo. */
export function drawStorm(
  el: HTMLElement,
  { reducedMotion, random = Math.random }: StormOptions,
): () => void {
  const root = select(el);
  const parts: Selection<HTMLDivElement, unknown, null, undefined>[] = [];
  const add = () => {
    const div = root.append('div');
    parts.push(div);
    return div;
  };
  const cleanup = () => {
    parts.forEach((p) => p.remove());
  };

  add().style('position', 'absolute').style('inset', '0').style('background', 'var(--storm-sky)');
  // No escuro não há nuvens (--storm-clouds-opacity 0): o céu só escurece, chove e relampeja.
  play(
    appendClouds(
      add().style('opacity', 'var(--storm-clouds-opacity)'),
      STORM_CLOUDS,
      'var(--storm-cloud)',
      'var(--storm-cloud-shade)',
    ),
  );
  if (reducedMotion) return cleanup;

  const drops = rainDrops(random);
  play(
    fixed(add())
      .style('transform', 'skewX(-10deg)')
      .selectAll('div')
      .data(RAIN_LAYERS)
      .join('div')
      .style('position', 'absolute')
      .style('top', '0')
      .style('left', '0')
      .style('width', '100%')
      .style('height', '200vh')
      .style('will-change', 'transform')
      .style('animation', (d) => `rainLayer ${String(d.dur)}s linear ${String(d.delay)}s infinite`),
  )
    .selectAll('div')
    .data((_, li) => layerDrops(drops, li))
    .join('div')
    .style('position', 'absolute')
    .style('top', (d) => `${String(d.y)}vh`)
    .style('left', (d) => `${String(d.x)}%`)
    .style('width', '1px')
    .style('height', (d) => `${String(d.len)}px`)
    .style('opacity', (d) => d.op)
    .style('background', 'linear-gradient(transparent, var(--storm-rain))');
  play(
    fixed(add())
      .style('background', 'var(--storm-flash)')
      .style('opacity', '0')
      .style('animation', 'lightning 7s linear infinite'),
  );
  play(
    add()
      .selectAll('div')
      .data(BOLTS)
      .join('div')
      .style('position', 'fixed')
      .style('left', (d) => `${String(d.left)}%`)
      .style('top', (d) => `${String(d.top)}%`)
      .style('color', 'var(--storm)')
      .style('opacity', '0')
      .style('transform', (d) => `rotate(${String(d.rot)}deg)`)
      .style('filter', 'drop-shadow(0 0 14px var(--storm))')
      .style('animation', (d) => `bolt 7s linear ${String(d.delay)}s infinite`)
      .html(
        (d) =>
          `<svg width="${String(d.size)}" height="${String(d.size)}" viewBox="0 0 256 256" fill="currentColor"><path d="${BOLT_PATH}"/></svg>`,
      ),
  );
  return cleanup;
}
