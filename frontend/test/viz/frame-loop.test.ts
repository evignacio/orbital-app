import { afterEach, describe, expect, it, vi } from 'vitest';
import { frameLoop } from '@/viz/frame-loop';

afterEach(() => {
  vi.useRealTimers();
});

describe('frameLoop', () => {
  it('chama o tick a cada quadro até ser parado', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const tick = vi.fn();
    const loop = frameLoop(tick);
    expect(tick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16 * 3);
    expect(tick).toHaveBeenCalledTimes(3);
    loop.stop();
    vi.advanceTimersByTime(16 * 3);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('um erro no tick não para o laço', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    let calls = 0;
    const loop = frameLoop(() => {
      calls += 1;
      if (calls === 1) throw new Error('quadro com erro');
    });
    expect(() => vi.advanceTimersByTime(16)).toThrow('quadro com erro');
    vi.advanceTimersByTime(16);
    expect(calls).toBe(2);
    loop.stop();
  });

  it('parar dentro do próprio tick não agenda outro quadro', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    let calls = 0;
    const loop = frameLoop(() => {
      calls += 1;
      loop.stop();
    });
    vi.advanceTimersByTime(16 * 5);
    expect(calls).toBe(1);
  });
});
