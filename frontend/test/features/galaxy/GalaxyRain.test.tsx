import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORM_FADE_MS } from '@/hooks/useTheme';
import { useConnectionStore } from '@/store/connection.store';
import { GalaxyRain } from '@/features/galaxy/GalaxyRain';

function renderRain(leaving = false) {
  return render(
    <StrictMode>
      <GalaxyRain leaving={leaving} />
    </StrictMode>,
  );
}

const layer = (container: HTMLElement) => container.querySelector<HTMLDivElement>('.rain');

beforeEach(() => {
  useConnectionStore.setState(useConnectionStore.getInitialState());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GalaxyRain', () => {
  it('sem tempestade a camada fica vazia; com apiDown chove e só sai do DOM depois do fade', () => {
    vi.useFakeTimers();
    const { container, unmount } = renderRain();
    const rain = layer(container);
    expect(rain?.children).toHaveLength(0);
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(rain?.children).toHaveLength(1);
    expect(rain?.innerHTML).toContain('rainLayer');
    // A API volta: a chuva some pela opacidade (--storm-on) e sai do DOM no fim do fade.
    act(() => {
      useConnectionStore.getState().markApiUp();
    });
    act(() => {
      vi.advanceTimersByTime(STORM_FADE_MS - 1);
    });
    expect(rain?.children).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(rain?.children).toHaveLength(0);
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(rain?.children).toHaveLength(1);
    unmount();
    expect(rain?.children).toHaveLength(0);
  });

  it('já em tempestade na montagem, chove de saída', () => {
    useConnectionStore.setState({ apiDown: true });
    const { container } = renderRain();
    expect(layer(container)?.children).toHaveLength(1);
  });

  it('com prefers-reduced-motion não chove', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    useConnectionStore.setState({ apiDown: true });
    const { container } = renderRain();
    expect(layer(container)?.children).toHaveLength(0);
  });

  it('entrando numa órbita, a camada marca data-leaving', () => {
    const { container } = renderRain(true);
    expect(layer(container)?.dataset.leaving).toBe('true');
  });
});
