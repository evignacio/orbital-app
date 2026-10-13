import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Banner } from '@/components/Banner';

describe('Banner', () => {
  it('é um alerta com título e mensagem', () => {
    render(
      <Banner tone="storm" icon="cloud-lightning" title="TEMPESTADE · API INACESSÍVEL">
        Sem contato com a API.
      </Banner>,
    );
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('TEMPESTADE · API INACESSÍVEL');
    expect(alerta).toHaveTextContent('Sem contato com a API.');
  });

  it('esconde o ícone dos leitores de tela', () => {
    const { container } = render(
      <Banner tone="storm" icon="cloud-lightning" title="T">
        msg
      </Banner>,
    );
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('mostra a ação e chama onClick', async () => {
    const onClick = vi.fn();
    render(
      <Banner
        tone="storm"
        icon="cloud-lightning"
        title="T"
        action={{ label: 'TENTAR AGORA', onClick }}
      >
        msg
      </Banner>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'TENTAR AGORA' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ação desabilitada não dispara', async () => {
    const onClick = vi.fn();
    render(
      <Banner
        tone="storm"
        icon="cloud-lightning"
        title="T"
        action={{ label: 'TENTANDO…', onClick, disabled: true }}
      >
        msg
      </Banner>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'TENTANDO…' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sem ação não há botão', () => {
    render(
      <Banner tone="warn" icon="bell" title="T">
        msg
      </Banner>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
