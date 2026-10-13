import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip } from '@/components/Chip';

describe('Chip', () => {
  it('é um botão com o texto como nome', () => {
    render(
      <Chip active={false} onClick={vi.fn()}>
        TODAS
      </Chip>,
    );
    expect(screen.getByRole('button', { name: 'TODAS' })).toBeInTheDocument();
  });

  it('marca o estado ativo com aria-pressed', () => {
    const { rerender } = render(
      <Chip active onClick={vi.fn()}>
        FORA
      </Chip>,
    );
    expect(screen.getByRole('button', { name: 'FORA' })).toHaveAttribute('aria-pressed', 'true');
    rerender(
      <Chip active={false} onClick={vi.fn()}>
        FORA
      </Chip>,
    );
    expect(screen.getByRole('button', { name: 'FORA' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('chama onClick ao clicar', async () => {
    const onClick = vi.fn();
    render(
      <Chip active={false} onClick={onClick}>
        NO AR
      </Chip>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'NO AR' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
