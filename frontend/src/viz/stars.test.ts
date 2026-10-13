import { describe, expect, it } from 'vitest';
import { rng } from '../domain/random';
import { STAR_COUNT, STAR_PHASES, drawStars, starField } from './stars';

describe('starField', () => {
  it('160 estrelas repartidas nos 4 grupos, com posição, raio e opacidade nas faixas do legado', () => {
    const stars = starField(rng(7));
    expect(stars).toHaveLength(STAR_COUNT);
    expect(STAR_COUNT).toBe(160);
    expect(STAR_PHASES).toHaveLength(4);
    stars.forEach((s, i) => {
      expect(s.g).toBe(i % 4);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(100);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(100);
      expect(s.r).toBeGreaterThanOrEqual(0.4);
      expect(s.r).toBeLessThan(1.9);
      expect(s.op).toBeGreaterThanOrEqual(0.6);
      expect(s.op).toBeLessThan(1);
    });
  });

  it('estrelas grandes (r > 1,4) são lilases, as outras quase brancas', () => {
    const big = starField(() => 0.99)[0];
    const small = starField(() => 0)[0];
    expect(big?.fill).toBe('#cfc9f2');
    expect(small?.fill).toBe('#e9e9ed');
  });
});

describe('drawStars', () => {
  it('desenha um svg com 4 grupos piscando e 160 estrelas, e a limpeza o remove', () => {
    const el = document.createElement('div');
    const cleanup = drawStars(el);
    const svg = el.querySelector('svg');
    expect(svg).not.toBeNull();
    const groups = el.querySelectorAll('svg > g');
    expect(groups).toHaveLength(4);
    expect((groups[1] as SVGGElement).style.animation).toContain(
      'twinkle 5.5s ease-in-out -2.1s infinite',
    );
    expect(el.querySelectorAll('circle')).toHaveLength(160);
    const c = el.querySelector('circle');
    expect(c?.getAttribute('cx')).toMatch(/%$/);
    cleanup();
    expect(el.querySelector('svg')).toBeNull();
  });

  it('duas montagens seguidas (StrictMode) deixam um svg só', () => {
    const el = document.createElement('div');
    drawStars(el)();
    drawStars(el);
    expect(el.querySelectorAll('svg')).toHaveLength(1);
  });
});
