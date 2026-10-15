import { describe, expect, it } from 'vitest';
import { createMotionClock } from '@/domain/motion-clock';

function fakeSource(start = 1000) {
  const source = { t: start, now: () => source.t };
  return source;
}

describe('createMotionClock', () => {
  it('conta os ms desde a criação', () => {
    const src = fakeSource();
    const clock = createMotionClock(src.now);
    src.t += 250;
    expect(clock.now()).toBe(250);
    expect(clock.isPaused()).toBe(false);
  });

  it('pausado, fica parado e ao retomar segue de onde parou', () => {
    const src = fakeSource();
    const clock = createMotionClock(src.now);
    src.t += 100;
    clock.setPaused(true);
    src.t += 5000;
    expect(clock.now()).toBe(100);
    expect(clock.isPaused()).toBe(true);
    clock.setPaused(false);
    src.t += 50;
    expect(clock.now()).toBe(150);
  });

  it('pausar ou retomar duas vezes não muda nada', () => {
    const src = fakeSource();
    const clock = createMotionClock(src.now);
    clock.setPaused(true);
    src.t += 100;
    clock.setPaused(true);
    src.t += 100;
    clock.setPaused(false);
    clock.setPaused(false);
    src.t += 10;
    expect(clock.now()).toBe(10);
  });
});
