import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/app/AppShell';
import { NotFoundPage, RouteError } from '@/app/MessagePage';
import { BASE_TITLE } from '@/domain/constants';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
  );
});

describe('páginas de aviso', () => {
  it('rota desconhecida mostra o 404 com o link para a galáxia e mantém o título da aba', () => {
    const router = createMemoryRouter(
      [{ element: <AppShell />, children: [{ path: '*', element: <NotFoundPage /> }] }],
      { initialEntries: ['/painel.html'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText('ERRO 404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByText('Este endereço não existe no Orbital.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Galáxia/ })).toHaveAttribute('href', '/');
    expect(document.title).toBe(BASE_TITLE);
  });

  it('o errorElement mostra o aviso de falha em vez da tela de desenvolvedor', () => {
    function Boom(): never {
      throw new Error('falha');
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter(
      [{ path: '/', element: <Boom />, errorElement: <RouteError /> }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Algo deu errado ao carregar esta página.')).toBeInTheDocument();
    expect(screen.queryByText(/developer/i)).not.toBeInTheDocument();
  });
});
