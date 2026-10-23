import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORM_FADE_MS } from '@/hooks/useTheme';
import { useConnectionStore } from '@/store/connection.store';
import { SkyLayers } from '@/features/panel/SkyLayers';

function renderSky() {
  return render(
    <StrictMode>
      <SkyLayers />
    </StrictMode>,
  );
}

function reducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  useConnectionStore.setState(useConnectionStore.getInitialState());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SkyLayers', () => {
  it('desenha as estrelas uma vez no StrictMode e as remove no desmonte', () => {
    const { container, unmount } = renderSky();
    const stars = container.querySelector('.stars');
    expect(stars?.querySelectorAll('svg')).toHaveLength(1);
    expect(stars?.querySelectorAll('circle')).toHaveLength(160);
    unmount();
    expect(stars?.querySelector('svg')).toBeNull();
  });

  it('desenha as 5 nuvens uma vez no StrictMode e as remove no desmonte', () => {
    const { container, unmount } = renderSky();
    const clouds = container.querySelector('.clouds');
    expect(clouds?.children).toHaveLength(5);
    unmount();
    expect(clouds?.children).toHaveLength(0);
  });

  it('sem tempestade a camada fica vazia; com apiDown desenha e só sai do DOM depois do fade', () => {
    vi.useFakeTimers();
    const { container, unmount } = renderSky();
    const storm = container.querySelector('.storm');
    expect(storm?.children).toHaveLength(0);
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(storm?.children).toHaveLength(5);
    expect(storm?.innerHTML).toContain('rainLayer');
    // A API volta: o céu abre pela opacidade (--storm-on); o desenho fica até o fim do fade.
    act(() => {
      useConnectionStore.getState().markApiUp();
    });
    act(() => {
      vi.advanceTimersByTime(STORM_FADE_MS - 1);
    });
    expect(storm?.children).toHaveLength(5);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(storm?.children).toHaveLength(0);
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(storm?.children).toHaveLength(5);
    unmount();
    expect(storm?.children).toHaveLength(0);
  });

  it('já em tempestade na montagem, desenha de saída', () => {
    useConnectionStore.setState({ apiDown: true });
    const { container } = renderSky();
    expect(container.querySelector('.storm')?.children).toHaveLength(5);
  });

  it('com prefers-reduced-motion a tempestade não chove nem relampeja', () => {
    reducedMotion(true);
    useConnectionStore.setState({ apiDown: true });
    const { container } = renderSky();
    const storm = container.querySelector('.storm');
    expect(storm?.children).toHaveLength(2);
    expect(storm?.innerHTML).not.toContain('rainLayer');
  });

  it('deixa a camada do cometa intacta', () => {
    const { container } = renderSky();
    expect(container.querySelector('.comet')).not.toBeNull();
  });
});
