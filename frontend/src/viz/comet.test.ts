import { cometTrajectory, createCometLayer } from './comet';

describe('trajetória do cometa', () => {
  it('sorteia dentro das faixas do legado', () => {
    expect(cometTrajectory(() => 0)).toEqual({ top: 4, rot: 152, len: 100, dur: 2.4 });
    const high = cometTrajectory(() => 0.99);
    expect(high.rot).toBeCloseTo(8 + 0.99 * 20);
    expect(high.top).toBeCloseTo(4 + 0.99 * 36);
    expect(high.len).toBeCloseTo(100 + 0.99 * 120);
    expect(high.dur).toBeCloseTo(2.4 + 0.99 * 1.2);
  });

  it('inclina para a direita quando o sorteio do espelhamento não passa de 0,5', () => {
    const values = [0.7, 0, 0, 0, 0];
    let i = 0;
    const traj = cometTrajectory(() => values[i++] ?? 0);
    expect(traj.rot).toBe(8);
  });
});

describe('camada do cometa', () => {
  it('desenha uma pista, a remove no fim da animação e na limpeza', () => {
    const el = document.createElement('div');
    const layer = createCometLayer(el);
    layer.launch();
    expect(el.children).toHaveLength(1);
    const lane = el.children[0] as HTMLElement;
    expect(lane.style.top).toMatch(/%$/);
    expect(lane.style.transform).toMatch(/^rotate\(/);
    const comet = lane.firstElementChild as HTMLElement;
    expect(comet.style.animation).toMatch(/^comet [\d.]+s linear 1 forwards$/);
    expect(comet.innerHTML).toContain('var(--comet-tail)');
    expect(comet.innerHTML).toContain('var(--comet-head)');
    comet.dispatchEvent(new Event('animationend'));
    expect(el.children).toHaveLength(0);

    layer.launch();
    layer.launch();
    expect(el.children).toHaveLength(2);
    layer.dispose();
    expect(el.children).toHaveLength(0);
  });
});
