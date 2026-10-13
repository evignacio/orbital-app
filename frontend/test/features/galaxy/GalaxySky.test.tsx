import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalaxySky } from '@/features/galaxy/GalaxySky';

let fills: number;
beforeEach(() => {
  fills = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: () => {
      fills++;
    },
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    globalCompositeOperation: 'source-over',
    fillStyle: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

const ui = (sizeKey: number, leaving = false) => (
  <StrictMode>
    <GalaxySky sizeKey={sizeKey} leaving={leaving} />
  </StrictMode>
);

describe('GalaxySky', () => {
  it('desenha a espiral no canvas e uma só cintilação, mesmo no duplo mount', () => {
    const { container } = render(ui(0));
    const canvas = container.querySelector('canvas');
    expect(canvas?.width).toBeGreaterThan(0);
    expect(fills).toBeGreaterThan(5200);
    expect(container.querySelectorAll('span')).toHaveLength(34);
  });

  it('redesenha a espiral quando o tamanho muda, sem duplicar a cintilação', () => {
    const { container, rerender } = render(ui(0));
    const before = fills;
    rerender(ui(1));
    expect(fills).toBeGreaterThan(before);
    expect(container.querySelectorAll('span')).toHaveLength(34);
  });

  it('marca a saída no canvas', () => {
    const { container, rerender } = render(ui(0));
    rerender(ui(0, true));
    expect(container.querySelector('canvas')?.dataset.leaving).toBe('true');
  });

  it('a desmontagem limpa o canvas e tira a cintilação', () => {
    const { container, unmount } = render(ui(0));
    const canvas = container.querySelector('canvas');
    const layer = canvas?.nextElementSibling;
    unmount();
    expect(canvas?.width).toBe(0);
    expect(layer?.querySelectorAll('span')).toHaveLength(0);
  });
});
