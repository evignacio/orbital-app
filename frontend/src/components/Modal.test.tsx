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

  it('com initialFocus="dialog" o foco abre no diálogo e o headerAction vem antes do título', async () => {
    render(
      <Modal
        title="Formulário"
        initialFocus="dialog"
        headerAction={<button type="button">Fechar</button>}
        onClose={vi.fn()}
      >
        <button type="button">Salvar</button>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    const fechar = screen.getByRole('button', { name: 'Fechar' });
    const titulo = screen.getByRole('heading', { name: 'Formulário' });
    expect(fechar.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // O Tab a partir do diálogo entra pelo primeiro controle, o ✕.
    await userEvent.tab();
    expect(fechar).toHaveFocus();
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

  it('com dois modais empilhados, Esc fecha só o do topo e Tab fica nele', async () => {
    const fechaForm = vi.fn();
    const fechaConfirma = vi.fn();
    render(
      <>
        <Modal title="Formulário" onClose={fechaForm}>
          <button type="button">Salvar</button>
          <button type="button">Cancelar form</button>
        </Modal>
        <Modal title="Confirmação" size="sm" onClose={fechaConfirma}>
          <button type="button">Sim</button>
          <button type="button">Não</button>
        </Modal>
      </>,
    );
    const sim = screen.getByRole('button', { name: 'Sim' });
    const nao = screen.getByRole('button', { name: 'Não' });
    sim.focus();
    await userEvent.tab();
    expect(nao).toHaveFocus();
    await userEvent.tab();
    expect(sim).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(fechaConfirma).toHaveBeenCalledOnce();
    expect(fechaForm).not.toHaveBeenCalled();
  });

  it('ao fechar o do topo, o de baixo volta a responder ao Esc', async () => {
    const fechaForm = vi.fn();
    function Pilha() {
      const [confirma, setConfirma] = useState(true);
      return (
        <>
          <Modal title="Formulário" onClose={fechaForm}>
            <button type="button">Salvar</button>
          </Modal>
          {confirma && (
            <Modal
              title="Confirmação"
              size="sm"
              onClose={() => {
                setConfirma(false);
              }}
            >
              <button type="button">Sim</button>
            </Modal>
          )}
        </>
      );
    }
    render(<Pilha />);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Confirmação' })).toBeNull();
    expect(fechaForm).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(fechaForm).toHaveBeenCalledOnce();
  });
});
