import { select } from 'd3-selection';
import { describe, expect, it } from 'vitest';
import { SKY_CLOUDS, appendClouds, cloudSvg, drawClouds } from './clouds';

describe('cloudSvg', () => {
  it('escala a caixa 260x104 e pinta o corpo e a sombra com as cores dadas', () => {
    const svg = cloudSvg(1.5, '#ffffff', '#cfe2f4');
    expect(svg).toContain('width="390" height="156" viewBox="0 0 260 104"');
    expect(svg).toContain('<g style="fill:#ffffff">');
    expect(svg).toContain('<g style="fill:#cfe2f4" opacity=".55">');
    expect(svg.match(/<ellipse/g)).toHaveLength(6);
  });
});

describe('SKY_CLOUDS', () => {
  it('são as 5 nuvens do céu claro do legado', () => {
    expect(SKY_CLOUDS).toEqual([
      { top: 6, scale: 1.5, dur: 160, delay: -40, op: 0.95 },
      { top: 22, scale: 0.9, dur: 210, delay: -130, op: 0.75 },
      { top: 44, scale: 1.2, dur: 250, delay: -60, op: 0.6 },
      { top: 63, scale: 0.7, dur: 190, delay: -170, op: 0.5 },
      { top: 78, scale: 1.35, dur: 300, delay: -20, op: 0.45 },
    ]);
  });
});

describe('appendClouds', () => {
  it('uma div à deriva por nuvem, na altura e opacidade da spec', () => {
    const el = document.createElement('div');
    const divs = appendClouds(select(el), SKY_CLOUDS, 'var(--a)', 'var(--b)');
    expect(divs.size()).toBe(5);
    const second = el.children[1] as HTMLDivElement;
    expect(second.style.position).toBe('absolute');
    expect(second.style.top).toBe('22%');
    expect(second.style.opacity).toBe('0.75');
    expect(second.style.animation).toContain('drift 210s linear -130s infinite');
    expect(second.querySelectorAll('svg')).toHaveLength(1);
  });
});

describe('drawClouds', () => {
  it('desenha as 5 nuvens brancas e a limpeza as remove', () => {
    const el = document.createElement('div');
    const cleanup = drawClouds(el);
    expect(el.children).toHaveLength(5);
    expect(el.innerHTML).toContain('fill:#ffffff');
    expect(el.innerHTML).toContain('fill:#cfe2f4');
    cleanup();
    expect(el.children).toHaveLength(0);
  });
});
