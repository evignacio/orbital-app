import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '@/store/connection.store';
import { SkyLayers } from './SkyLayers';

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

  it('sem tempestade a camada fica vazia; com apiDown desenha uma vez e segue montada para o fade', () => {
    const { container, unmount } = renderSky();
    const storm = container.querySelector('.storm');
    expect(storm?.children).toHaveLength(0);
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(storm?.children).toHaveLength(5);
    expect(storm?.innerHTML).toContain('rainLayer');
    // A API volta: o céu abre pela opacidade (--storm-on), o desenho continua lá.
    act(() => {
      useConnectionStore.getState().markApiUp();
    });
    expect(storm?.children).toHaveLength(5);
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
