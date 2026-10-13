import { useEffect, useRef } from 'react';
import { isQuotaFull, nextWaitMs, recentLaunches, waitForQuotaMs } from '@/domain/comet-quota';
import { readCometLog, writeCometLog } from '@/storage/comet-log';
import { usePreferencesStore } from '@/store/preferences.store';
import { useReducedMotion } from './useReducedMotion';

// Sem plateia a passagem não acontece: aba escondida ou sem foco (isAway do legado).
function isAway(): boolean {
  return document.hidden || !document.hasFocus();
}

/**
 * Agenda o cometa raro (legacy scheduleComet/launchComet): tenta a cada 20–60 min e
 * a cota por hora vem do log no localStorage. `launch` desenha e devolve `false` se
 * não havia onde. Tema claro, aba ausente e movimento reduzido adiam sem gastar cota.
 */
export function useComets(launch: () => boolean): void {
  const theme = usePreferencesStore((s) => s.theme);
  const reduced = useReducedMotion();
  // Lidos na hora do disparo, como no legado: mudar o tema não reagenda.
  const conditions = useRef({ theme, reduced, launch });
  useEffect(() => {
    conditions.current = { theme, reduced, launch };
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (ms: number): void => {
      clearTimeout(timer);
      timer = setTimeout(attempt, ms);
    };

    function attempt(): void {
      const now = Date.now();
      const recent = recentLaunches(readCometLog(), now);
      if (isQuotaFull(recent)) {
        schedule(waitForQuotaMs(recent, now));
        return;
      }
      const c = conditions.current;
      if (c.reduced || c.theme !== 'dark' || isAway() || !c.launch()) {
        schedule(nextWaitMs());
        return;
      }
      writeCometLog([...recent, now]);
      schedule(nextWaitMs());
    }

    schedule(nextWaitMs());
    return () => {
      clearTimeout(timer);
    };
  }, []);
}
