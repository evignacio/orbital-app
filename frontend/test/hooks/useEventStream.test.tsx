import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '../setup';
import { SSE_DOWN_GRACE_MS, SSE_RETRY_MS } from '@/domain/constants';
import type { Application } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { useStatusStore } from '@/store/status.store';
import { useEventStream } from '@/hooks/useEventStream';

function app(id: string, env: Application['env'] = 'prd'): Application {
  return { id, env, name: `app-${id}`, team: 't', healthCheckUrl: 'u', swaggerUrl: '', orbits: [] };
}

const CYCLE_AT = '2026-01-01T00:00:10.000Z';

function cycleBody(checked: number) {
  return {
    env: 'production',
    trigger: 'manual',
    checked,
    changed: 0,
    healthy: checked,
    degraded: 0,
    unhealthy: 0,
    startedAt: '2026-01-01T00:00:00.000Z',
    checkedAt: CYCLE_AT,
    durationMs: 10,
    nextCheckAt: null,
  };
}

function snapshotBody(ids: string[]) {
  return {
    env: 'production',
    apps: ids.map((id) => ({ id, name: `app-${id}`, status: 'healthy' })),
    cycle: null,
    nextCheckAt: null,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  useAppsStore.setState(useAppsStore.getInitialState());
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          production: [{ id: 'a', name: 'app-a', team: 't', healthCheckUrl: 'u' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useEventStream', () => {
  it('abre um EventSource no endereço dos eventos e fecha ao desmontar', () => {
    const { unmount } = renderHook(() => {
      useEventStream();
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.last().url).toContain('/applications/events');
    unmount();
    expect(FakeEventSource.last().readyState).toBe(FakeEventSource.CLOSED);
  });

  it('aplica snapshot, status e cycle nas stores', () => {
    useAppsStore.setState({ apps: [app('a')] });
    renderHook(() => {
      useEventStream();
    });
    const es = FakeEventSource.last();
    act(() => {
      es.emitOpen();
      es.emit('snapshot', snapshotBody(['a']));
    });
    expect(useStatusStore.getState().status.a).toBe('healthy');
    act(() => {
      es.emit('status', {
        env: 'production',
        id: 'a',
        name: 'app-a',
        status: 'degraded',
        latencyMs: 4000,
        limitMs: 3000,
        checkedAt: CYCLE_AT,
      });
    });
    expect(useStatusStore.getState().status.a).toBe('degraded');
    act(() => {
      es.emit('cycle', cycleBody(1));
    });
    expect(useStatusStore.getState().cycles.prd).toBe(Date.parse(CYCLE_AT));
  });

  it('o cycle do ambiente encerra a varredura', () => {
    useAppsStore.setState({ apps: [app('a')] });
    renderHook(() => {
      useEventStream();
    });
    useConnectionStore.getState().startScan('prd');
    act(() => {
      FakeEventSource.last().emit('cycle', cycleBody(1));
    });
    expect(useConnectionStore.getState().scanning).toBe(false);
  });

  it('entrega as quedas a onFell', () => {
    useAppsStore.setState({ apps: [app('a')] });
    const onFell = vi.fn();
    renderHook(() => {
      useEventStream({ onFell });
    });
    act(() => {
      FakeEventSource.last().emit('status', {
        env: 'production',
        id: 'a',
        name: 'app-a',
        status: 'unhealthy',
        latencyMs: null,
        checkedAt: CYCLE_AT,
      });
    });
    expect(onFell).toHaveBeenCalledWith([{ id: 'a', name: 'app-a' }]);
  });

  it('erro dentro da graça que volta a abrir não acende a tempestade', () => {
    renderHook(() => {
      useEventStream();
    });
    const es = FakeEventSource.last();
    act(() => {
      es.emitOpen();
      es.emitError();
      vi.advanceTimersByTime(SSE_DOWN_GRACE_MS - 1000);
      es.emitOpen();
      vi.advanceTimersByTime(SSE_DOWN_GRACE_MS * 2);
    });
    expect(useConnectionStore.getState().apiDown).toBe(false);
  });

  it('erro além da graça acende a tempestade e avisa onApiDown uma vez', () => {
    const onApiDown = vi.fn();
    renderHook(() => {
      useEventStream({ onApiDown });
    });
    const es = FakeEventSource.last();
    act(() => {
      es.emitOpen();
      es.emitError();
      vi.advanceTimersByTime(SSE_DOWN_GRACE_MS - 1);
    });
    expect(useConnectionStore.getState().apiDown).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(useConnectionStore.getState().apiDown).toBe(true);
    act(() => {
      es.emitError();
      vi.advanceTimersByTime(SSE_DOWN_GRACE_MS);
    });
    expect(onApiDown).toHaveBeenCalledTimes(1);
  });

  it('conexão CLOSED reabre após SSE_RETRY_MS com um novo EventSource', () => {
    renderHook(() => {
      useEventStream();
    });
    const first = FakeEventSource.last();
    act(() => {
      first.close();
      first.onerror?.(new Event('error'));
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(SSE_RETRY_MS);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('evento após a tempestade limpa apiDown e recarrega a lista', async () => {
    useAppsStore.setState({ apps: [app('a')] });
    renderHook(() => {
      useEventStream();
    });
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    await act(async () => {
      FakeEventSource.last().emit('snapshot', snapshotBody(['a']));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(useConnectionStore.getState().apiDown).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recarrega a lista quando o cycle conta apps diferentes das conhecidas', async () => {
    useAppsStore.setState({ apps: [app('a')] });
    renderHook(() => {
      useEventStream();
    });
    await act(async () => {
      FakeEventSource.last().emit('cycle', cycleBody(3));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não recarrega quando a lista está em dia', async () => {
    useAppsStore.setState({ apps: [app('a')] });
    renderHook(() => {
      useEventStream();
    });
    await act(async () => {
      FakeEventSource.last().emit('cycle', cycleBody(1));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no duplo mount do StrictMode sobra um único EventSource aberto', () => {
    const { unmount } = renderHook(
      () => {
        useEventStream();
      },
      { wrapper: StrictMode },
    );
    const abertos = () =>
      FakeEventSource.instances.filter((e) => e.readyState !== FakeEventSource.CLOSED);
    expect(abertos()).toHaveLength(1);
    unmount();
    expect(abertos()).toHaveLength(0);
  });

  it('desmontar cancela a graça e a reabertura pendentes', () => {
    const { unmount } = renderHook(() => {
      useEventStream();
    });
    const es = FakeEventSource.last();
    act(() => {
      es.close();
      es.onerror?.(new Event('error'));
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(SSE_DOWN_GRACE_MS + SSE_RETRY_MS);
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(useConnectionStore.getState().apiDown).toBe(false);
  });

  it('reconnectIfClosed reabre na hora um stream CLOSED, sem esperar o retry', () => {
    const { result } = renderHook(() => useEventStream());
    const first = FakeEventSource.last();
    act(() => {
      first.close();
      first.onerror?.(new Event('error'));
    });
    act(() => {
      result.current.reconnectIfClosed();
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    // O retry pendente foi cancelado: não abre um terceiro.
    act(() => {
      vi.advanceTimersByTime(SSE_RETRY_MS * 2);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('reconnectIfClosed não faz nada com o stream aberto ou reconectando sozinho', () => {
    const { result } = renderHook(() => useEventStream());
    const es = FakeEventSource.last();
    act(() => {
      es.emitOpen();
      result.current.reconnectIfClosed();
      es.emitError();
      result.current.reconnectIfClosed();
    });
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('reconnectIfClosed é estável entre renders', () => {
    const { result, rerender } = renderHook(() => useEventStream());
    const antes = result.current.reconnectIfClosed;
    rerender();
    expect(result.current.reconnectIfClosed).toBe(antes);
  });
});
