import { select } from 'd3-selection';
import { describe, expect, it } from 'vitest';
import { CLOUD_BOLT_PATH, appendOrbitCore, appendStormCore } from './orbit-core';

function setup() {
  const svg = select(document.body).append('svg');
  const defs = svg.append('defs');
  return { svg, defs };
}

describe('appendOrbitCore', () => {
  it('no escuro desenha a lua: halo, corpo com gradiente e brilho, 4 crateras', () => {
    const { svg, defs } = setup();
    const g = svg.append('g');
    appendOrbitCore(g, defs, false, 'oglow');
    const node = g.node();
    expect(node?.querySelectorAll('circle')).toHaveLength(6);
    expect(node?.querySelectorAll('circle.crater')).toHaveLength(4);
    const body = node?.querySelector('circle[r="17"]');
    expect(body?.getAttribute('fill')).toBe('url(#coreMoon)');
    expect(body?.getAttribute('filter')).toBe('url(#oglow)');
    expect(defs.select('#coreMoon').attr('cx')).toBe('35%');
    svg.remove();
  });

  it('no claro desenha o sol: halo, 12 raios e corpo com gradiente', () => {
    const { svg, defs } = setup();
    const g = svg.append('g');
    appendOrbitCore(g, defs, true, 'glow');
    const node = g.node();
    expect(node?.querySelectorAll('line')).toHaveLength(12);
    expect(node?.querySelector('circle[r="34"]')?.getAttribute('fill')).toBe(
      'rgba(240,168,60,.14)',
    );
    expect(node?.querySelector('circle[r="17"]')?.getAttribute('fill')).toBe('url(#coreSun)');
    const ray = node?.querySelector('line');
    expect(ray?.getAttribute('x1')).toBe('21');
    expect(ray?.getAttribute('x2')).toBe('28');
    svg.remove();
  });

  it('vários núcleos (galáxia) põem o gradiente no defs uma vez só', () => {
    const { svg, defs } = setup();
    const gs = svg.selectAll<SVGGElement, number>('g').data([1, 2, 3]).join('g');
    appendOrbitCore(gs, defs, false, 'oglow');
    appendOrbitCore(gs, defs, false, 'oglow');
    expect(defs.selectAll('#coreMoon').size()).toBe(1);
    expect(gs.nodes()[2]?.querySelectorAll('circle.crater')).toHaveLength(4);
    svg.remove();
  });
});

describe('appendStormCore', () => {
  it('vira o ícone de tempestade com o texto SEM SINAL', () => {
    const { svg } = setup();
    const g = svg.append('g');
    appendStormCore(g);
    const node = g.node();
    expect(node?.querySelector('path')?.getAttribute('d')).toBe(CLOUD_BOLT_PATH);
    expect(node?.querySelector('path')?.getAttribute('transform')).toBe(
      'translate(-17,-19) scale(.133)',
    );
    expect(node?.querySelector('text')?.textContent).toBe('SEM SINAL');
    expect(node?.querySelector('circle[r="26"]')?.getAttribute('stroke-dasharray')).toBe('2 4');
    svg.remove();
  });
});
