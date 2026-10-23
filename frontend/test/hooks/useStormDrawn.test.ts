import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStormDrawn } from '@/hooks/useStormDrawn';
import { STORM_FADE_MS } from '@/hooks/useTheme';
import { useConnectionStore } from '@/store/connection.store';

beforeEach(() => {
  vi.useFakeTimers();
  useConnectionStore.setState(useConnectionStore.getInitialState());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useStormDrawn', () => {
  it('sem tempestade não desenha', () => {
    const { result } = renderHook(() => useStormDrawn());
    expect(result.current).toBe(false);
  });

  it('já em tempestade na montagem, desenha de saída', () => {
    useConnectionStore.setState({ apiDown: true });
    const { result } = renderHook(() => useStormDrawn());
    expect(result.current).toBe(true);
  });

  it('desenha na queda e só para STORM_FADE_MS depois de a API voltar', () => {
    const { result } = renderHook(() => useStormDrawn());
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(result.current).toBe(true);
    act(() => {
      useConnectionStore.getState().markApiUp();
    });
    act(() => {
      vi.advanceTimersByTime(STORM_FADE_MS - 1);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it('se a API cai de novo durante o fade, segue desenhado', () => {
    const { result } = renderHook(() => useStormDrawn());
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
    expect(result.current).toBe(true);
  });
});
