/**
 * Relógio das animações d3: corre com a fonte de tempo, para enquanto pausado e
 * volta de onde parou, então nada pula ao retomar.
 */
export interface MotionClock {
  /** ms desde a criação, sem os trechos pausados. */
  now: () => number;
  isPaused: () => boolean;
  setPaused: (paused: boolean) => void;
}

export function createMotionClock(source: () => number = () => performance.now()): MotionClock {
  const start = source();
  let pausedMs = 0;
  let pausedAt: number | null = null;
  return {
    now: () => (pausedAt ?? source()) - start - pausedMs,
    isPaused: () => pausedAt !== null,
    setPaused: (paused) => {
      if (paused && pausedAt === null) pausedAt = source();
      else if (!paused && pausedAt !== null) {
        pausedMs += source() - pausedAt;
        pausedAt = null;
      }
    },
  };
}
