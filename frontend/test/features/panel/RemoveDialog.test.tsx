import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import { RemoveDialog } from '@/features/panel/RemoveDialog';

const A: Application = {
  id: 'a',
  env: 'prd',
  name: 'checkout-api',
  team: 'T',
  healthCheckUrl: 'http://a',
  swaggerUrl: '',
  orbits: ['O'],
};
const B: Application = { ...A, id: 'b', name: 'billing-api' };

function reply(status: number, body: unknown = null) {
  return vi
    .fn()
    .mockResolvedValue(new Response(body === null ? null : JSON.stringify(body), { status }));
}

beforeEach(() => {
  useAppsStore.setState({ apps: [A, B] });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RemoveDialog', () => {
  it('mostra o texto do legado e os botões', () => {
    render(<RemoveDialog app={A} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Remover checkout-api?' })).toBeInTheDocument();
    expect(screen.getByText('REMOVER DA ÓRBITA')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A aplicação deixa de ser monitorada e é removida de todas as órbitas às quais está vinculada. Você pode cadastrá-la de novo depois.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
  });

  it('Cancelar chama onClose', async () => {
    const onClose = vi.fn();
    render(<RemoveDialog app={A} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('sucesso: DELETE e commitApps sem a app', async () => {
    const fetchMock = reply(204);
    vi.stubGlobal('fetch', fetchMock);
    render(<RemoveDialog app={A} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => {
      expect(useAppsStore.getState().apps).toEqual([B]);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/production/a',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('404 conta como sucesso', async () => {
    vi.stubGlobal('fetch', reply(404, { error: 'x' }));
    render(<RemoveDialog app={A} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => {
      expect(useAppsStore.getState().apps).toEqual([B]);
    });
  });

  it('erro: mostra a mensagem, mantém a lista e oferece tentar de novo', async () => {
    vi.stubGlobal('fetch', reply(500, { error: 'boom' }));
    render(<RemoveDialog app={A} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível remover: a API respondeu 500 (boom).',
    );
    expect(useAppsStore.getState().apps).toEqual([A, B]);
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeEnabled();
  });

  it('enquanto remove: "Removendo…", botão ocupado e fechar ignorado', async () => {
    let resolve: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((r) => {
          resolve = r;
        }),
      ),
    );
    const onClose = vi.fn();
    render(<RemoveDialog app={A} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    const busy = screen.getByRole('button', { name: 'Removendo…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).not.toHaveBeenCalled();
    resolve(new Response(null, { status: 204 }));
    await waitFor(() => {
      expect(useAppsStore.getState().apps).toEqual([B]);
    });
  });
});
