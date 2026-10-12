import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

function Exemplo({
  onClose = vi.fn(),
  backdrop = false,
}: {
  onClose?: () => void;
  backdrop?: boolean;
}) {
  return (
    <Modal
      title="Remover app?"
      eyebrow="REMOVER DA ÓRBITA"
      onClose={onClose}
      dismissOnBackdrop={backdrop}
    >
      <button type="button">Cancelar</button>
      <button type="button">Remover</button>
    </Modal>
  );
}

function ComGatilho() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAberto(true);
        }}
      >
        Abrir
      </button>
      {aberto && (
        <Exemplo
          onClose={() => {
            setAberto(false);
          }}
        />
      )}
    </>
  );
}

describe('Modal', () => {
  it('é um diálogo modal nomeado pelo título', () => {
    render(<Exemplo />);
    const dialogo = screen.getByRole('dialog', { name: 'Remover app?' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Remover app?' })).toBeInTheDocument();
    expect(screen.getByText('REMOVER DA ÓRBITA')).toBeInTheDocument();
  });

  it('leva o foco para dentro ao abrir', () => {
    render(<Exemplo />);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('Esc fecha', async () => {
    const onClose = vi.fn();
    render(<Exemplo onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('um Esc já tratado por quem está dentro não fecha o diálogo', async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Form" onClose={onClose}>
        <input
          aria-label="Campo"
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.stopPropagation();
          }}
        />
      </Modal>,
    );
    await userEvent.click(screen.getByLabelText('Campo'));
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clicar no fundo fecha só quando dismissOnBackdrop', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Exemplo onClose={onClose} />);
    const fundo = screen.getByRole('dialog').parentElement;
    if (!fundo) throw new Error('fundo não encontrado');
    await userEvent.click(fundo);
    expect(onClose).not.toHaveBeenCalled();
    rerender(<Exemplo onClose={onClose} backdrop />);
    await userEvent.click(fundo);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicar dentro do diálogo não fecha', async () => {
    const onClose = vi.fn();
    render(<Exemplo onClose={onClose} backdrop />);
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('prende o foco: Tab circula entre os controles de dentro', async () => {
    render(
      <>
        <button type="button">Fora</button>
        <Exemplo />
      </>,
    );
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    const remover = screen.getByRole('button', { name: 'Remover' });
    cancelar.focus();
    await userEvent.tab();
    expect(remover).toHaveFocus();
    await userEvent.tab();
    expect(cancelar).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(remover).toHaveFocus();
  });

  it('devolve o foco ao elemento que abriu ao fechar', async () => {
    render(<ComGatilho />);
    const gatilho = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(gatilho);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(gatilho).toHaveFocus();
  });
});
