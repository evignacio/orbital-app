// Cota do cometa: raro por desenho, no máximo
// COMET_MAX passagens em qualquer janela móvel de 1h, contadas pelos timestamps
// gravados — recarregar a página não zera a conta.

export const COMET_MAX = 2;
export const COMET_WINDOW_MS = 3_600_000;
/** Espera entre tentativas: de COMET_WAIT_MIN_MS a COMET_WAIT_MIN_MS + COMET_WAIT_SPREAD_MS. */
export const COMET_WAIT_MIN_MS = 20 * 60_000;
export const COMET_WAIT_SPREAD_MS = 40 * 60_000;
/** Folga aleatória somada à espera até a cota liberar, para não bater no segundo exato. */
export const COMET_RETRY_JITTER_MS = 10 * 60_000;

/** O que veio do localStorage vira lista de timestamps; qualquer outra forma é um log vazio. */
export function parseCometLog(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
}

/** Só as passagens da última hora. */
export function recentLaunches(log: readonly number[], now: number): number[] {
  return log.filter((t) => now - t < COMET_WINDOW_MS);
}

export function isQuotaFull(recent: readonly number[]): boolean {
  return recent.length >= COMET_MAX;
}

export function nextWaitMs(random: () => number = Math.random): number {
  return COMET_WAIT_MIN_MS + random() * COMET_WAIT_SPREAD_MS;
}

/** Cota cheia: só volta a tentar depois que a passagem mais antiga sai da janela. */
export function waitForQuotaMs(
  recent: readonly number[],
  now: number,
  random: () => number = Math.random,
): number {
  return Math.min(...recent) + COMET_WINDOW_MS - now + random() * COMET_RETRY_JITTER_MS;
}
