import {
  COMET_MAX,
  COMET_RETRY_JITTER_MS,
  COMET_WAIT_MIN_MS,
  COMET_WINDOW_MS,
  isQuotaFull,
  nextWaitMs,
  parseCometLog,
  recentLaunches,
  waitForQuotaMs,
} from '@/domain/comet-quota';

describe('cota do cometa', () => {
  it('usa os limites do legado', () => {
    expect(COMET_MAX).toBe(2);
    expect(COMET_WINDOW_MS).toBe(3_600_000);
  });

  it('aceita só lista de números e trata o resto como log vazio', () => {
    expect(parseCometLog([1, 2.5])).toEqual([1, 2.5]);
    expect(parseCometLog([1, 'x', null, Infinity, 3])).toEqual([1, 3]);
    expect(parseCometLog({ a: 1 })).toEqual([]);
    expect(parseCometLog(null)).toEqual([]);
  });

  it('mantém só as passagens da última hora', () => {
    const now = 10_000_000;
    const log = [now - COMET_WINDOW_MS - 1, now - COMET_WINDOW_MS, now - 1000];
    expect(recentLaunches(log, now)).toEqual([now - 1000]);
  });

  it('enche a cota ao chegar em COMET_MAX', () => {
    expect(isQuotaFull([1])).toBe(false);
    expect(isQuotaFull([1, 2])).toBe(true);
  });

  it('sorteia a espera entre 20 e 60 minutos', () => {
    expect(nextWaitMs(() => 0)).toBe(COMET_WAIT_MIN_MS);
    expect(nextWaitMs(() => 0.5)).toBe(40 * 60_000);
    expect(nextWaitMs(() => 1)).toBe(60 * 60_000);
  });

  it('espera a passagem mais antiga sair da janela, com folga aleatória', () => {
    const now = 5_000_000;
    const recent = [now - 1_000_000, now - 2_000_000];
    expect(waitForQuotaMs(recent, now, () => 0)).toBe(COMET_WINDOW_MS - 2_000_000);
    expect(waitForQuotaMs(recent, now, () => 1)).toBe(
      COMET_WINDOW_MS - 2_000_000 + COMET_RETRY_JITTER_MS,
    );
  });
});
