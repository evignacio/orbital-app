import { useEffect, useState } from 'react';
import { createMotionClock, type MotionClock } from '../domain/motion-clock';

/** Um relógio de animação por componente: sobrevive aos redesenhos e para enquanto `paused`. */
export function useMotionClock(paused: boolean): MotionClock {
  const [clock] = useState(() => createMotionClock());
  useEffect(() => {
    clock.setPaused(paused);
  }, [clock, paused]);
  return clock;
}
