import { renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { COMET_WAIT_MIN_MS, COMET_WINDOW_MS } from '@/domain/comet-quota';
import { KEYS } from '@/storage/keys';
import { usePreferencesStore } from '@/store/preferences.store';
import { useComets } from '@/hooks/useComets';

const START = new Date('2026-01-01T12:00:00Z').getTime();
const MAX_WAIT = 60 * 60_000;

function log(): number[] {
  return JSON.parse(localStorage.getItem(KEYS.comet) ?? '[]') as number[];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  localStorage.clear();
  usePreferencesStore.setState({ theme: 'dark' });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useComets', () => {
  it('não dispara antes da espera mínima e dispara depois, gravando o log', () => {
    const launch = vi.fn(() => true);
    renderHook(() => {
      useComets(launch);
    });
    vi.advanceTimersByTime(COMET_WAIT_MIN_MS - 1);
    expect(launch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(log()).toEqual([START + COMET_WAIT_MIN_MS]);
  });

  it('reagenda depois de cada passagem', () => {
    const launch = vi.fn(() => true);
    renderHook(() => {
      useComets(launch);
    });
    vi.advanceTimersByTime(COMET_WAIT_MIN_MS * 2);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('pula no tema claro sem consumir cota', () => {
    usePreferencesStore.setState({ theme: 'light' });
    const launch = vi.fn(() => true);
    renderHook(() => {
      useComets(launch);
    });
    vi.advanceTimersByTime(COMET_WAIT_MIN_MS * 3);
    expect(launch).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEYS.comet)).toBeNull();
  });

  it('pula com a aba oculta e sem foco, sem consumir cota', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const launch = vi.fn(() => true);
    renderHook(() => {
      useComets(launch);
    });
    vi.advanceTimersByTime(COMET_WAIT_MIN_MS);
    hidden.mockReturnValue(false);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    vi.advanceTimersByTime(COMET_WAIT_MIN_MS);
    expect(launch).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEYS.comet)).toBeNull();
  });

  it('pula com movimento reduzido, sem consumir cota', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const launch = vi.fn(() => true);
    renderHook(() => {
      useComets(launch);
    });
    vi.advanceTimersByTime(COMET_WAIT_MIN_MS * 2);
    expect(launch).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEYS.comet)).toBeNull();
    vi.unstubAllGlobals();
  });

  it('não consome cota quando não há onde desenhar', () => {
    const launch = vi.fn(() => false);
    renderHook(() => {
      useComets(launch);
    });
    vi.advanceTimersByTime(COMET_WAIT_MIN_MS);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEYS.comet)).toBeNull();
  });

  it('respeita a cota gravada após o reload e espera a mais antiga sair da janela', () => {
    localStorage.setItem(KEYS.comet, JSON.stringify([START - 1000, START - 2000]));
    const launch = vi.fn(() => true);
    renderHook(() => {
      useComets(launch);
    });
    vi.advanceTimersByTime(COMET_WAIT_MIN_MS);
    expect(launch).not.toHaveBeenCalled();
    // a mais antiga (START - 2000) sai da janela em COMET_WINDOW_MS - 2000 (random = 0)
    vi.advanceTimersByTime(COMET_WINDOW_MS - 2000 - COMET_WAIT_MIN_MS + 1);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(log()).toHaveLength(2);
  });

  it('esquece passagens com mais de uma hora ao gravar', () => {
    localStorage.setItem(KEYS.comet, JSON.stringify([START - COMET_WINDOW_MS - 5000]));
    renderHook(() => {
      useComets(() => true);
    });
    vi.advanceTimersByTime(COMET_WAIT_MIN_MS);
    expect(log()).toEqual([START + COMET_WAIT_MIN_MS]);
  });

  it('agenda um único timer no StrictMode e cancela ao desmontar', () => {
    const launch = vi.fn(() => true);
    const { unmount } = renderHook(
      () => {
        useComets(launch);
      },
      { wrapper: StrictMode },
    );
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(MAX_WAIT);
    expect(launch).not.toHaveBeenCalled();
  });
});
