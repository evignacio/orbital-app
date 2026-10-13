import { act, renderHook } from '@testing-library/react';
import { RESIZE_DEBOUNCE_MS } from '@/domain/constants';
import { useResize } from '@/hooks/useResize';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve = vi.fn();
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.callback();
  }
}

function medidas(el: HTMLElement, w: number, h: number) {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: w });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: h });
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function montar(onResize: () => void) {
  const el = document.createElement('div');
  medidas(el, 800, 500);
  const ref = { current: el };
  const hook = renderHook(() => {
    useResize(ref, onResize);
  });
  const ro = FakeResizeObserver.instances[0];
  if (!ro) throw new Error('observer não criado');
  return { el, ro, ...hook };
}

describe('useResize', () => {
  it('observa o elemento do ref', () => {
    const { el, ro } = montar(vi.fn());
    expect(ro.observed).toEqual([el]);
  });

  it('só chama depois do debounce, uma vez por rajada', () => {
    const onResize = vi.fn();
    const { el, ro } = montar(onResize);
    medidas(el, 900, 500);
    ro.fire();
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS - 1);
    ro.fire();
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS - 1);
    expect(onResize).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onResize).toHaveBeenCalledOnce();
  });

  it('o primeiro evento sempre dispara (como no legado, sem tamanho anterior)', () => {
    const onResize = vi.fn();
    const { ro } = montar(onResize);
    ro.fire();
    act(() => {
      vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
    });
    expect(onResize).toHaveBeenCalledOnce();
  });

  it('ignora o evento quando o tamanho final é o mesmo do último disparo', () => {
    const onResize = vi.fn();
    const { ro } = montar(onResize);
    ro.fire();
    act(() => {
      vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
    });
    ro.fire();
    act(() => {
      vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
    });
    expect(onResize).toHaveBeenCalledOnce();
  });

  it('desconecta e cancela o timer ao desmontar', () => {
    const onResize = vi.fn();
    const { el, ro, unmount } = montar(onResize);
    medidas(el, 100, 100);
    ro.fire();
    unmount();
    expect(ro.disconnected).toBe(true);
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS * 2);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('usa sempre a versão mais recente do callback', () => {
    const primeira = vi.fn();
    const segunda = vi.fn();
    const el = document.createElement('div');
    medidas(el, 10, 10);
    const ref = { current: el };
    const { rerender } = renderHook(
      ({ cb }) => {
        useResize(ref, cb);
      },
      { initialProps: { cb: primeira } },
    );
    rerender({ cb: segunda });
    medidas(el, 20, 20);
    FakeResizeObserver.instances.at(-1)?.fire();
    act(() => {
      vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
    });
    expect(primeira).not.toHaveBeenCalled();
    expect(segunda).toHaveBeenCalledOnce();
  });

  it('sem ResizeObserver no navegador, não quebra', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const el = document.createElement('div');
    const ref = { current: el };
    expect(() =>
      renderHook(() => {
        useResize(ref, vi.fn());
      }),
    ).not.toThrow();
  });
});
