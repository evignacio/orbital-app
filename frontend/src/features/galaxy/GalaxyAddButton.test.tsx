import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { GalaxyAddButton } from './GalaxyAddButton';

const EXISTING: Application = {
  id: 'a',
  env: 'prd',
  name: 'checkout-api',
  team: 'Pagamentos',
  healthCheckUrl: 'http://a/health',
  swaggerUrl: '',
  orbits: ['Dream team'],
};

beforeEach(() => {
  useAppsStore.setState({ ...useAppsStore.getInitialState(), apps: [EXISTING] });
  usePreferencesStore.setState({ ...usePreferencesStore.getInitialState(), env: 'hml' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const open = () => userEvent.click(screen.getByRole('button', { name: 'Adicionar aplicação' }));

describe('GalaxyAddButton', () => {
  it('abre o formulário em PRODUÇÃO (o legado ignora o ambiente salvo) e fecha pelo ✕', async () => {
    render(<GalaxyAddButton />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await open();
    expect(screen.getByRole('dialog', { name: 'Adicionar aplicação' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PRODUÇÃO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('criar uma app com órbita nova a põe na lista, sem trocar o ambiente salvo', async () => {
    const created = { ...EXISTING, id: 'n', name: 'novo-api', orbits: ['Nova'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(created), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );
    render(<GalaxyAddButton />);
    await open();
    await userEvent.type(screen.getByRole('textbox', { name: /Nome da aplicação/ }), 'novo-api');
    await userEvent.type(screen.getByRole('textbox', { name: /Time responsável/ }), 'Pagamentos');
    await userEvent.type(
      screen.getByRole('textbox', { name: /URL do health check/ }),
      'http://n/health',
    );
    await userEvent.type(
      screen.getByRole('combobox', { name: /Órbitas onde a aplicação aparece/ }),
      'Nova{Enter}',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Lançar em órbita' }));

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const orbits = useAppsStore.getState().apps.flatMap((a) => a.orbits);
    expect(orbits).toContain('Nova');
    expect(usePreferencesStore.getState().env).toBe('hml');
  });
});
