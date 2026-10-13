import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import { useStatusStore } from '@/store/status.store';
import { GalaxyOrbits } from './GalaxyOrbits';

const app = (id: string, orbits: string[]): Application => ({
  id,
  env: 'prd',
  name: `app-${id}`,
  team: 'Pagamentos',
  healthCheckUrl: `http://${id}`,
  swaggerUrl: '',
  orbits,
});

// O jsdom não faz layout: sem largura, as órbitas não seriam desenhadas.
const sizeDesc = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
};
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
});
afterAll(() => {
  if (sizeDesc.w) Object.defineProperty(HTMLElement.prototype, 'clientWidth', sizeDesc.w);
  if (sizeDesc.h) Object.defineProperty(HTMLElement.prototype, 'clientHeight', sizeDesc.h);
});

beforeEach(() => {
  useAppsStore.setState({ apps: [app('1', ['Dream team']), app('2', ['Core'])] });
  useStatusStore.setState(useStatusStore.getInitialState());
});

function renderOrbits(leavingKey: string | null, sizeKey = 0) {
  return (
    <StrictMode>
      <GalaxyOrbits
        sizeKey={sizeKey}
        stale={false}
        leavingKey={leavingKey}
        onEnter={() => undefined}
      />
    </StrictMode>
  );
}

const svg = () => document.querySelector('svg');

describe('GalaxyOrbits', () => {
  it('fora da saída, mudar as apps ou o tamanho refaz o desenho', () => {
    const view = render(renderOrbits(null));
    const first = svg();
    act(() => {
      useAppsStore.setState({ apps: [...useAppsStore.getState().apps, app('3', ['Novo'])] });
    });
    expect(svg()).not.toBe(first);
    expect(document.querySelectorAll('g.orb')).toHaveLength(3);
    const second = svg();
    view.rerender(renderOrbits(null, 1));
    expect(svg()).not.toBe(second);
  });

  it('durante a saída não redesenha (o drawOrbits do legado saía cedo)', () => {
    const view = render(renderOrbits(null));
    view.rerender(renderOrbits('dream-team'));
    const drawn = svg();
    act(() => {
      useAppsStore.setState({ apps: [...useAppsStore.getState().apps, app('3', ['Novo'])] });
    });
    view.rerender(renderOrbits('dream-team', 1));
    expect(svg()).toBe(drawn);
    expect(document.querySelectorAll('g.orb')).toHaveLength(2);
  });

  it('desmontar no meio da saída remove o desenho', () => {
    const view = render(renderOrbits(null));
    view.rerender(renderOrbits('dream-team'));
    view.unmount();
    expect(svg()).toBeNull();
  });
});
