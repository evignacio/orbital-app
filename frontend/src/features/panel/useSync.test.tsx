import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventStreamContext } from '@/hooks/EventStreamContext';
import { useConnectionStore } from '@/store/connection.store';
import { SCAN_MAX_MS, useSync } from './useSync';

const syncEnvironment = vi.hoisted(() => vi.fn());
vi.mock('@/api/applications', () => ({ syncEnvironment }));

const reconnectIfClosed = vi.fn();
function wrapper({ children }: { children: ReactNode }) {
  return <EventStreamContext value={{ reconnectIfClosed }}>{children}</EventStreamContext>;
}

async function sync(result: { current: { sync: () => void } }) {
  await act(async () => {
    result.current.sync();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  syncEnvironment.mockReset();
  syncEnvironment.mockResolvedValue({});
  reconnectIfClosed.mockClear();
  useConnectionStore.setState(useConnectionStore.getInitialState());
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useSync', () => {
  it('marca a varredura do ambiente, reabre o stream e pede o ciclo', async () => {
    const { result } = renderHook(() => useSync('hml'), { wrapper });
    await sync(result);
    expect(useConnectionStore.getState().scanning).toBe(true);
    expect(useConnectionStore.getState().scanEnv).toBe('hml');
    expect(reconnectIfClosed).toHaveBeenCalledOnce();
    expect(syncEnvironment).toHaveBeenCalledWith('hml');
  });

  it('ignora o pedido enquanto já sincroniza', async () => {
    const { result } = renderHook(() => useSync('prd'), { wrapper });
    await sync(result);
    await sync(result);
    expect(syncEnvironment).toHaveBeenCalledTimes(1);
  });

  it('encerra a varredura após SCAN_MAX_MS se o cycle não chegar', async () => {
    const { result } = renderHook(() => useSync('prd'), { wrapper });
    await sync(result);
    act(() => {
      vi.advanceTimersByTime(SCAN_MAX_MS - 1);
    });
    expect(useConnectionStore.getState().scanning).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(useConnectionStore.getState().scanning).toBe(false);
  });

  it('o timer de uma varredura antiga não encerra a nova', async () => {
    const { result } = renderHook(() => useSync('prd'), { wrapper });
    await sync(result);
    act(() => {
      vi.advanceTimersByTime(SCAN_MAX_MS - 5000);
    });
    // o cycle chega e encerra a varredura A
    act(() => {
      useConnectionStore.getState().endScan();
    });
    await sync(result); // varredura B
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(useConnectionStore.getState().scanning).toBe(true);
    act(() => {
      vi.advanceTimersByTime(SCAN_MAX_MS - 5000);
    });
    expect(useConnectionStore.getState().scanning).toBe(false);
  });

  it('não arma timer se o cycle chegou antes da resposta do POST', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    syncEnvironment.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useSync('prd'), { wrapper });
    act(() => {
      result.current.sync();
    });
    act(() => {
      useConnectionStore.getState().endScan();
    });
    await act(async () => {
      resolve({});
      await Promise.resolve();
    });
    act(() => {
      useConnectionStore.getState().startScan('dev');
      vi.advanceTimersByTime(SCAN_MAX_MS * 2);
    });
    expect(useConnectionStore.getState().scanning).toBe(true);
  });

  it('o POST atrasado da varredura A não arma timer para a varredura B de outro ambiente', async () => {
    let resolveA: (v: unknown) => void = () => undefined;
    syncEnvironment.mockReturnValueOnce(new Promise((r) => (resolveA = r)));
    syncEnvironment.mockReturnValueOnce(new Promise(() => undefined));
    const a = renderHook(() => useSync('prd'), { wrapper });
    const b = renderHook(() => useSync('dev'), { wrapper });
    act(() => {
      a.result.current.sync();
    });
    act(() => {
      useConnectionStore.getState().endScan(); // cycle de A
    });
    act(() => {
      b.result.current.sync();
    });
    await act(async () => {
      resolveA({});
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(SCAN_MAX_MS * 2);
    });
    expect(useConnectionStore.getState().scanning).toBe(true);
    expect(useConnectionStore.getState().scanEnv).toBe('dev');
  });

  it('falha do POST encerra a varredura e marca a tempestade', async () => {
    syncEnvironment.mockRejectedValue(new Error('rede'));
    const { result } = renderHook(() => useSync('prd'), { wrapper });
    await sync(result);
    expect(useConnectionStore.getState().scanning).toBe(false);
    expect(useConnectionStore.getState().apiDown).toBe(true);
  });

  it('limpa o timer ao desmontar', async () => {
    const { result, unmount } = renderHook(() => useSync('prd'), { wrapper });
    await sync(result);
    unmount();
    act(() => {
      vi.advanceTimersByTime(SCAN_MAX_MS * 2);
    });
    expect(useConnectionStore.getState().scanning).toBe(true);
  });
});
