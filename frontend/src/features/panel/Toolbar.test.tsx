import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import { Toolbar } from './Toolbar';

const CHECKED_AT = new Date(2026, 0, 5, 14, 32, 5).getTime();

function setSecure(secure: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
}

beforeEach(() => {
  useConnectionStore.setState(useConnectionStore.getInitialState());
  useStatusStore.setState(useStatusStore.getInitialState());
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
  setSecure(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Toolbar', () => {
  it('Sincronizar chama onSync e vira "Sincronizando…" durante a varredura', async () => {
    const onSync = vi.fn();
    render(<Toolbar env="prd" onSync={onSync} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sincronizar' }));
    expect(onSync).toHaveBeenCalledOnce();

    useConnectionStore.getState().startScan('prd');
    expect(await screen.findByRole('button', { name: 'Sincronizando…' })).toBeInTheDocument();
  });

  it('mostra AGUARDANDO SERVIDOR antes do primeiro cycle do ambiente', () => {
    render(<Toolbar env="prd" onSync={vi.fn()} />);
    expect(screen.getByText('AGUARDANDO SERVIDOR')).toBeInTheDocument();
  });

  it('mostra o horário do último cycle do ambiente da tela', () => {
    useStatusStore.setState({ cycles: { dev: null, hml: null, prd: CHECKED_AT } });
    const { rerender } = render(<Toolbar env="prd" onSync={vi.fn()} />);
    expect(screen.getByText(new Date(CHECKED_AT).toLocaleTimeString('pt-BR'))).toBeInTheDocument();
    expect(screen.getByTitle(/Última verificação/)).toBeInTheDocument();

    rerender(<Toolbar env="hml" onSync={vi.fn()} />);
    expect(screen.getByText('AGUARDANDO SERVIDOR')).toBeInTheDocument();
  });

  it('alterna o tema e persiste', async () => {
    render(<Toolbar env="prd" onSync={vi.fn()} />);
    const sw = screen.getByRole('switch', { name: 'DARK' });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    expect(usePreferencesStore.getState().theme).toBe('light');
    expect(screen.getByRole('switch', { name: 'LIGHT' })).toBeChecked();
    await userEvent.click(screen.getByRole('switch', { name: 'LIGHT' }));
    expect(usePreferencesStore.getState().theme).toBe('dark');
  });

  it('o popover de alertas abre e fecha pelo sino', async () => {
    render(<Toolbar env="prd" onSync={vi.fn()} />);
    const bell = screen.getByRole('button', { name: 'Alertas de queda' });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('switch', { name: 'SOM' })).not.toBeInTheDocument();

    await userEvent.click(bell);
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('switch', { name: 'NOTIFICAÇÕES' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'SOM' })).not.toBeChecked();
    expect(screen.getByText('Avisa quando uma aplicação sai de órbita.')).toBeInTheDocument();

    await userEvent.click(bell);
    expect(screen.queryByRole('switch', { name: 'SOM' })).not.toBeInTheDocument();
  });

  it('o switch de som liga e persiste', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        resume() {
          return Promise.resolve();
        }
        createOscillator() {
          throw new Error('sem áudio no teste');
        }
      },
    );
    render(<Toolbar env="prd" onSync={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Alertas de queda' }));
    await userEvent.click(screen.getByRole('switch', { name: 'SOM' }));
    expect(usePreferencesStore.getState().sound).toBe(true);
    expect(screen.getByRole('switch', { name: 'SOM' })).toBeChecked();
  });

  it('o switch de notificações desliga quando já ligado', async () => {
    usePreferencesStore.setState({ notify: true });
    render(<Toolbar env="prd" onSync={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Alertas de queda' }));
    await userEvent.click(screen.getByRole('switch', { name: 'NOTIFICAÇÕES' }));
    expect(usePreferencesStore.getState().notify).toBe(false);
  });

  it('sem contexto seguro avisa que exige HTTPS, mesmo antes do clique', async () => {
    setSecure(false);
    render(<Toolbar env="prd" onSync={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Alertas de queda' }));
    expect(screen.getByText(/Os alertas exigem HTTPS/)).toBeInTheDocument();
  });

  it('sem a API de Notification avisa que o navegador não oferece', async () => {
    vi.stubGlobal('Notification', undefined);
    delete (window as { Notification?: unknown }).Notification;
    usePreferencesStore.setState({ notifyBlocked: true });
    render(<Toolbar env="prd" onSync={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Alertas de queda' }));
    expect(screen.getByText('Este navegador não oferece notificações.')).toBeInTheDocument();
  });

  it('permissão negada mostra o aviso de bloqueio ao tentar ligar', async () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() });
    render(<Toolbar env="prd" onSync={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Alertas de queda' }));
    expect(screen.queryByText(/Permissão bloqueada/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'NOTIFICAÇÕES' }));
    expect(
      await screen.findByText(
        'Permissão bloqueada no navegador. Libere nas configurações do site.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'NOTIFICAÇÕES' })).not.toBeChecked();
  });
});
