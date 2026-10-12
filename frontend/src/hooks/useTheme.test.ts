import { act, renderHook } from '@testing-library/react';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { STORM_FADE_MS, useTheme } from './useTheme';

const html = document.documentElement;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  html.removeAttribute('data-theme');
  html.removeAttribute('data-storm');
  html.removeAttribute('data-storm-play');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTheme', () => {
  it('aplica o tema da store no <html>', () => {
    usePreferencesStore.setState({ theme: 'light' });
    const { result } = renderHook(() => useTheme());
    expect(html.dataset.theme).toBe('light');
    expect(result.current.theme).toBe('light');
  });

  it('alterna entre escuro e claro, grava a preferência e reaplica o atributo', () => {
    const { result } = renderHook(() => useTheme());
    expect(html.dataset.theme).toBe('dark');
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('light');
    expect(html.dataset.theme).toBe('light');
    expect(localStorage.getItem('orbital-theme-v1')).toBe('light');
    act(() => {
      result.current.toggleTheme();
    });
    expect(html.dataset.theme).toBe('dark');
    expect(localStorage.getItem('orbital-theme-v1')).toBe('dark');
  });

  it('liga data-storm e a chuva assim que a API cai', () => {
    renderHook(() => useTheme());
    expect(html.dataset.storm).toBeUndefined();
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(html.dataset.storm).toBe('on');
    expect(html.dataset.stormPlay).toBe('running');
  });

  it('desliga data-storm na volta da API, mas só pausa a chuva depois do fade', () => {
    renderHook(() => useTheme());
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    act(() => {
      useConnectionStore.getState().markApiUp();
    });
    expect(html.dataset.storm).toBeUndefined();
    expect(html.dataset.stormPlay).toBe('running');
    act(() => {
      vi.advanceTimersByTime(STORM_FADE_MS - 1);
    });
    expect(html.dataset.stormPlay).toBe('running');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(html.dataset.stormPlay).toBe('paused');
  });

  it('cancela a pausa pendente se a tempestade volta durante o fade', () => {
    renderHook(() => useTheme());
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    act(() => {
      useConnectionStore.getState().markApiUp();
    });
    act(() => {
      vi.advanceTimersByTime(STORM_FADE_MS / 2);
    });
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    act(() => {
      vi.advanceTimersByTime(STORM_FADE_MS * 2);
    });
    expect(html.dataset.stormPlay).toBe('running');
  });

  it('não deixa timer pendente ao desmontar', () => {
    const { unmount } = renderHook(() => useTheme());
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    act(() => {
      useConnectionStore.getState().markApiUp();
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('remove os atributos da tempestade do <html> ao desmontar', () => {
    const { unmount } = renderHook(() => useTheme());
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    unmount();
    expect(html.dataset.storm).toBeUndefined();
    expect(html.dataset.stormPlay).toBeUndefined();
  });
});
