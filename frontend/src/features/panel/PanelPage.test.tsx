import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@/domain/types';
import { EventStreamContext } from '@/hooks/EventStreamContext';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { hydrateStores } from '@/store/hydrate';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import { usePanelStore } from './panel.store';
import { PanelPage } from './PanelPage';

const APPS: Application[] = [
  {
    id: 'a',
    env: 'prd',
    name: 'checkout-api',
    team: 'Pagamentos',
    healthCheckUrl: 'http://a',
    swaggerUrl: '',
    orbits: ['Dream team'],
  },
  {
    id: 'b',
    env: 'hml',
    name: 'billing-api',
    team: 'Pagamentos',
    healthCheckUrl: 'http://b',
    swaggerUrl: '',
    orbits: ['Dream team'],
  },
];

function renderPage(url = '/painel') {
  return render(
    <EventStreamContext value={{ reconnectIfClosed: vi.fn() }}>
      <MemoryRouter initialEntries={[url]}>
        <PanelPage />
      </MemoryRouter>
    </EventStreamContext>,
  );
}

beforeEach(() => {
  useAppsStore.setState({ ...useAppsStore.getInitialState(), apps: APPS });
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
  usePanelStore.setState(usePanelStore.getInitialState());
});

describe('PanelPage', () => {
  it('com ?orbita mostra o nome da órbita como título e o rótulo Órbita', () => {
    renderPage('/painel?orbita=dream-team');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dream team');
    expect(screen.getByText('Órbita')).toBeInTheDocument();
  });

  it('sem órbita usa o título padrão do legado', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Órbita de Aplicações');
    expect(screen.getByText('Todas as órbitas')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cada planeta é uma aplicação em órbita. O brilho indica se o health check respondeu na última varredura.',
      ),
    ).toBeInTheDocument();
  });

  it('o link Galáxia navega para / pelo roteador, sem recarregar a página', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/painel',
          element: (
            <EventStreamContext value={{ reconnectIfClosed: vi.fn() }}>
              <PanelPage />
            </EventStreamContext>
          ),
        },
        { path: '/', element: <p>galáxia</p> },
      ],
      { initialEntries: ['/painel?orbita=dream-team'] },
    );
    render(<RouterProvider router={router} />);
    const link = screen.getByRole('link', { name: /Galáxia/ });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveAttribute('title', 'Voltar à galáxia');
    await userEvent.click(link);
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByText('galáxia')).toBeInTheDocument();
  });

  it('as abas de ambiente trocam o ambiente da tela e persistem', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'HOMOLOGAÇÃO' }));
    expect(usePreferencesStore.getState().env).toBe('hml');
    expect(localStorage.getItem('orbital-env-v1')).toBe('hml');
  });

  it('o botão + abre o formulário de cadastro', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar aplicação' }));
    expect(usePanelStore.getState()).toMatchObject({ formOpen: true, editing: null });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('com o ambiente dev salvo, o cadastro abre com DESENVOLVIMENTO selecionado', async () => {
    // Como o main.tsx: a hidratação vem antes do primeiro render dos filhos.
    localStorage.setItem('orbital-env-v1', 'dev');
    hydrateStores(Date.now());
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar aplicação' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('button', { name: 'DESENVOLVIMENTO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(dialog.getByRole('button', { name: 'PRODUÇÃO' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('a remoção pendente abre o diálogo só para app do ambiente da tela', () => {
    renderPage();
    act(() => {
      usePanelStore.getState().requestRemove('b');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      usePanelStore.getState().requestRemove('a');
    });
    expect(screen.getByRole('dialog')).toHaveTextContent('checkout-api');
  });

  it('com status antigo os contadores ficam marcados como desatualizados', () => {
    useConnectionStore.setState({ apiDown: true });
    renderPage();
    expect(screen.getByTitle('Dados desatualizados')).toBeInTheDocument();
  });
});
