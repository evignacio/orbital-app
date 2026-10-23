import { describe, expect, it } from 'vitest';
import { rng } from '@/domain/random';
import {
  BOLTS,
  BOLT_PATH,
  RAIN_DROP_COUNT,
  RAIN_LAYERS,
  STORM_CLOUDS,
  drawRain,
  drawStorm,
  layerDrops,
  rainDrops,
} from '@/viz/storm';

describe('constantes da tempestade', () => {
  it('nuvens carregadas, camadas de chuva e raios com os valores do legado', () => {
    expect(STORM_CLOUDS).toEqual([
      { top: -6, scale: 2.2, dur: 120, delay: -30, op: 0.95 },
      { top: 2, scale: 1.7, dur: 150, delay: -95, op: 0.9 },
      { top: -3, scale: 1.9, dur: 135, delay: -70, op: 0.85 },
      { top: 12, scale: 1.3, dur: 180, delay: -10, op: 0.7 },
      { top: 26, scale: 1, dur: 210, delay: -150, op: 0.45 },
    ]);
    expect(RAIN_LAYERS).toEqual([
      { dur: 0.6, delay: -0.2 },
      { dur: 0.75, delay: -0.5 },
      { dur: 0.9, delay: -0.1 },
      { dur: 1.05, delay: -0.7 },
    ]);
    expect(BOLTS).toEqual([
      { left: 17, top: 4, size: 64, rot: 8, delay: 0 },
      { left: 72, top: 7, size: 46, rot: -6, delay: -3.5 },
    ]);
    expect(BOLT_PATH).toMatch(/^M213\.85,125\.46l-112,120/);
  });
});

describe('rainDrops', () => {
  it('140 gotas repartidas nas 4 camadas, com posição, comprimento e opacidade nas faixas do legado', () => {
    const drops = rainDrops(rng(3));
    expect(RAIN_DROP_COUNT).toBe(140);
    expect(drops).toHaveLength(140);
    drops.forEach((d, i) => {
      expect(d.l).toBe(i % 4);
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThan(100);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThan(100);
      expect(d.len).toBeGreaterThanOrEqual(14);
      expect(d.len).toBeLessThan(32);
      expect(d.op).toBeGreaterThanOrEqual(0.35);
      expect(d.op).toBeLessThan(1);
    });
  });
});

describe('layerDrops', () => {
  it('as gotas da camada e a cópia de cada uma 100vh abaixo, para o laço não ter emenda', () => {
    const drops = rainDrops(rng(5));
    const layer = layerDrops(drops, 2);
    expect(layer).toHaveLength(70);
    const first = drops[2];
    expect(layer[0]).toEqual(first);
    expect(layer[1]).toEqual({ ...first, y: (first?.y ?? 0) + 100 });
    expect(layer.every((d) => d.l === 2)).toBe(true);
  });
});

describe('drawStorm', () => {
  it('céu, nuvens carregadas, chuva, clarão e raios; a limpeza remove tudo', () => {
    const el = document.createElement('div');
    const cleanup = drawStorm(el, { reducedMotion: false, random: rng(1) });
    expect(el.children).toHaveLength(5);
    const [sky, clouds, rain, flash, bolts] = Array.from(el.children) as HTMLDivElement[];
    expect(sky?.style.position).toBe('absolute');
    expect(clouds?.children).toHaveLength(5);
    expect(clouds?.innerHTML).toContain('fill:var(--storm-cloud)');
    expect(clouds?.innerHTML).toContain('fill:var(--storm-cloud-shade)');
    expect(rain?.style.position).toBe('fixed');
    expect(rain?.style.transform).toBe('skewX(-10deg)');
    expect(rain?.children).toHaveLength(4);
    expect((rain?.children[1] as HTMLDivElement).style.animation).toContain(
      'rainLayer 0.75s linear -0.5s infinite',
    );
    Array.from(rain?.children ?? []).forEach((layer) => {
      expect(layer.children).toHaveLength(70);
    });
    expect(flash?.style.animation).toContain('lightning 7s linear infinite');
    expect(bolts?.children).toHaveLength(2);
    const bolt = bolts?.children[1] as HTMLDivElement;
    expect(bolt.style.left).toBe('72%');
    expect(bolt.style.transform).toBe('rotate(-6deg)');
    expect(bolt.style.animation).toContain('bolt 7s linear -3.5s infinite');
    expect(bolt.querySelector('svg')?.getAttribute('width')).toBe('46');
    expect(bolt.querySelector('path')?.getAttribute('d')).toBe(BOLT_PATH);
    cleanup();
    expect(el.children).toHaveLength(0);
  });

  it('com movimento reduzido só escurece o céu e põe as nuvens, sem chuva nem raios', () => {
    const el = document.createElement('div');
    const cleanup = drawStorm(el, { reducedMotion: true });
    expect(el.children).toHaveLength(2);
    expect(el.innerHTML).not.toContain('rainLayer');
    expect(el.innerHTML).not.toContain('lightning');
    cleanup();
    expect(el.children).toHaveLength(0);
  });
});

describe('drawRain', () => {
  it('só a chuva inclinada, nas 4 camadas, sem céu, nuvens nem raios; a limpeza remove tudo', () => {
    const el = document.createElement('div');
    const cleanup = drawRain(el, { reducedMotion: false, random: rng(2) });
    expect(el.children).toHaveLength(1);
    const rain = el.children[0] as HTMLDivElement;
    expect(rain.style.position).toBe('fixed');
    expect(rain.style.transform).toBe('skewX(-10deg)');
    expect(rain.children).toHaveLength(4);
    expect(el.innerHTML).toContain('rainLayer');
    expect(el.innerHTML).not.toContain('lightning');
    expect(el.innerHTML).not.toContain('--storm-sky');
    cleanup();
    expect(el.children).toHaveLength(0);
  });

  it('com movimento reduzido não desenha nada', () => {
    const el = document.createElement('div');
    drawRain(el, { reducedMotion: true });
    expect(el.children).toHaveLength(0);
  });
});
