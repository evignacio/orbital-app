import type { BaseType, Selection } from 'd3-selection';
import type { GalaxyOrbit } from './galaxy-layout';

/** Um trecho da linha de saúde, com a cor (variável do tema) dele. */
export interface LabelSpan {
  text: string;
  color: string;
  /** Começa numa nova linha, centralizada, abaixo do trecho anterior. */
  nextLine?: boolean;
}

/** Contagem da legenda: todas as apps da órbita, em todos os ambientes. */
export function countLabel(n: number): string {
  return `${String(n)} ${n === 1 ? 'APLICAÇÃO' : 'APLICAÇÕES'}`;
}

/**
 * Linha de saúde da legenda: VERIFICANDO enquanto
 * nenhuma app da órbita tem status; com status antigo ou a API fora, o último
 * conhecido em cinza; senão TODAS NO AR ou as quedas e lentidões nas cores delas,
 * as lentidões numa linha abaixo das quedas.
 */
export function healthLine(
  o: Pick<GalaxyOrbit, 'checked' | 'down' | 'degraded'>,
  stale: boolean,
): LabelSpan[] {
  if (!o.checked) return [{ text: 'VERIFICANDO', color: 'var(--faint)' }];
  if (stale) {
    const last = o.down
      ? `${String(o.down)} FORA`
      : o.degraded
        ? `${String(o.degraded)} DEGRADADO`
        : 'NO AR';
    return [{ text: `ÚLTIMO: ${last}`, color: 'var(--stale)' }];
  }
  if (!o.down && !o.degraded) return [{ text: 'TODAS NO AR', color: 'var(--up)' }];
  const spans: LabelSpan[] = [];
  if (o.down) spans.push({ text: `${String(o.down)} FORA`, color: 'var(--down)' });
  if (o.degraded) {
    spans.push({
      text: `${String(o.degraded)} DEGRADADO`,
      color: 'var(--warn)',
      ...(o.down ? { nextLine: true } : {}),
    });
  }
  return spans;
}

/**
 * A legenda embaixo de cada sistema: nome, contagem e saúde, a partir de
 * `labelY` (logo abaixo do anel de fora). Desenhada no mesmo <g> do sistema,
 * para acompanhar a deriva.
 */
export function appendOrbitLabel<G extends BaseType, D extends GalaxyOrbit, P extends BaseType, PD>(
  g: Selection<G, D, P, PD>,
  labelY: (d: D) => number,
  stale: boolean,
): void {
  g.append('text')
    .attr('class', 'orbit-name')
    .attr('y', labelY)
    .attr('text-anchor', 'middle')
    .style('fill', 'var(--ink)')
    .style('font', "500 14px 'Inter', sans-serif")
    .style('letter-spacing', '-.01em')
    .text((d) => d.name);
  g.append('text')
    .attr('class', 'orbit-count')
    .attr('y', (d) => labelY(d) + 18)
    .attr('text-anchor', 'middle')
    .style('fill', 'var(--muted)')
    .style('font-family', 'var(--mono)')
    .style('font-size', '10.5px')
    .style('font-weight', 500)
    .style('letter-spacing', '.14em')
    .text((d) => countLabel(d.n));
  g.append('text')
    .attr('class', 'orbit-health')
    .attr('y', (d) => labelY(d) + 34)
    .attr('text-anchor', 'middle')
    .style('font-family', 'var(--mono)')
    .style('font-size', '10px')
    .style('font-weight', 500)
    .style('letter-spacing', '.14em')
    .selectAll('tspan')
    .data((d) => healthLine(d, stale))
    .join('tspan')
    .attr('x', (s) => (s.nextLine ? 0 : null))
    .attr('dy', (s) => (s.nextLine ? 14 : null))
    .style('fill', (s) => s.color)
    .text((s) => s.text);
}
