import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { ICON_NAMES, Icon } from './Icon';

describe('Icon', () => {
  it('é decorativo (aria-hidden) por padrão', () => {
    const { container } = render(<Icon name="bell" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 0 256 256');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('com title vira imagem com nome acessível', () => {
    render(<Icon name="clock" title="Relógio" />);
    expect(screen.getByRole('img', { name: 'Relógio' })).not.toHaveAttribute('aria-hidden');
  });

  it('aplica o tamanho em largura e altura', () => {
    const { container } = render(<Icon name="arrow-left" size={14} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '14');
    expect(svg).toHaveAttribute('height', '14');
  });

  it('repassa className ao svg', () => {
    const { container } = render(<Icon name="lightning" className="x" />);
    expect(container.querySelector('svg')).toHaveClass('x');
  });

  it('todo path de ícone existe literalmente no legado', () => {
    const legado = ['painel.html', 'index.html', 'script.js']
      .map((f) => readFileSync(`legacy/${f}`, 'utf8'))
      .join('\n');
    expect(ICON_NAMES).toHaveLength(7);
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />);
      const d = container.querySelector('path')?.getAttribute('d') ?? '';
      expect(d.length).toBeGreaterThan(20);
      expect(legado).toContain(d);
    }
  });
});
