import { render } from '@testing-library/react';
import { StrictMode, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalaxyRocks, type GalaxyRocksHandle } from '@/features/galaxy/GalaxyRocks';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const handle = () => createRef<GalaxyRocksHandle | null>();
const ui = (handleRef: ReturnType<typeof handle>, sizeKey = 0, leaving = false) => (
  <StrictMode>
    <GalaxyRocks sizeKey={sizeKey} leaving={leaving} handleRef={handleRef} />
  </StrictMode>
);

describe('GalaxyRocks', () => {
  it('um só desenho no duplo mount, e o handle dá a posição de cada asteroide', () => {
    const ref = handle();
    const { container } = render(ui(ref));
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    const rocks = ref.current?.rocks() ?? [];
    expect(rocks).toHaveLength(19);
    rocks.forEach((r) => {
      expect(typeof r.x).toBe('number');
      expect(r.size).toBeGreaterThan(0);
    });
  });

  it('refaz no resize sem duplicar', () => {
    const ref = handle();
    const { container, rerender } = render(ui(ref));
    const first = container.querySelector('svg');
    rerender(ui(ref, 1));
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('svg')).not.toBe(first);
  });

  it('marca a saída na camada', () => {
    const ref = handle();
    const { container, rerender } = render(ui(ref));
    rerender(ui(ref, 0, true));
    expect((container.firstElementChild as HTMLElement).dataset.leaving).toBe('true');
  });

  it('a desmontagem remove o desenho e solta o handle', () => {
    const ref = handle();
    const { container, unmount } = render(ui(ref));
    const layer = container.firstElementChild;
    unmount();
    expect(layer?.querySelector('svg')).toBeNull();
    expect(ref.current).toBeNull();
  });
});
