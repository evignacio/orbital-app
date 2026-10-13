import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Orbit } from '@/domain/orbits';
import type { Application } from '@/domain/types';
import { useConnectionStore } from '@/store/connection.store';
import { useStatusStore } from '@/store/status.store';
import { AppList, type AppListProps } from './AppList';

function mk(i: number): Application {
  return {
    id: `id${String(i)}`,
    env: 'prd',
    name: `app-${String(i)}`,
    team: 'T',
    healthCheckUrl: 'http://x',
    swaggerUrl: '',
    orbits: ['O'],
  };
}

function props(over: Partial<AppListProps> = {}): AppListProps {
  const all = [mk(1), mk(2), mk(3), mk(4)];
  return {
    envApps: all,
    visibleApps: all,
    pagedApps: all.slice(0, 3),
    page: 0,
    pageCount: 2,
    onPageChange: vi.fn(),
    query: '',
    onQueryChange: vi.fn(),
    filters: <span>chips</span>,
    selectedId: null,
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    currentOrbit: null,
    stale: false,
    ...over,
  };
}

const EMPTY = { envApps: [], visibleApps: [], pagedApps: [], pageCount: 1 };

beforeEach(() => {
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
});

describe('AppList', () => {
  it('cabeçalho: total no plural e sem "X DE N" sem filtro', () => {
    render(<AppList {...props()} />);
    expect(screen.getByText('FROTA · 4 APLICAÇÕES')).toBeInTheDocument();
    expect(screen.queryByText(/ DE /)).toBeNull();
  });

  it('singular e "X DE N" quando a visão é menor', () => {
    render(
      <AppList {...props({ envApps: [mk(1)], visibleApps: [], pagedApps: [], pageCount: 1 })} />,
    );
    expect(screen.getByText('FROTA · 1 APLICAÇÃO')).toBeInTheDocument();
    expect(screen.getByText('0 DE 1')).toBeInTheDocument();
  });

  it('renderiza os cards da página, os chips e o rótulo 1/2', () => {
    render(<AppList {...props()} />);
    expect(screen.getByText('app-1')).toBeInTheDocument();
    expect(screen.getByText('app-3')).toBeInTheDocument();
    expect(screen.queryByText('app-4')).toBeNull();
    expect(screen.getByText('chips')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('paginação na primeira página: ‹ não faz nada, › avança', async () => {
    const p = props();
    render(<AppList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(p.onPageChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(p.onPageChange).toHaveBeenCalledWith(1);
  });

  it('paginação na última página: › não faz nada, ‹ volta', async () => {
    const p = props({ page: 1 });
    render(<AppList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(p.onPageChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(p.onPageChange).toHaveBeenCalledWith(0);
  });

  it('busca: mostra o valor e avisa cada alteração', async () => {
    const p = props({ query: 'ab' });
    render(<AppList {...p} />);
    const input = screen.getByPlaceholderText('Buscar por nome ou time…');
    expect(input).toHaveValue('ab');
    await userEvent.type(input, 'c');
    expect(p.onQueryChange).toHaveBeenCalledWith('abc');
  });

  it('seleciona o card e marca o selecionado', async () => {
    const p = props({ selectedId: 'id2' });
    render(<AppList {...p} />);
    await userEvent.click(screen.getByText('app-1'));
    expect(p.onSelect).toHaveBeenCalledWith('id1');
    expect(screen.getByText('app-2').closest('article')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByText('app-1').closest('article')).not.toHaveAttribute('data-selected');
  });

  it('lápis e ✕ repassam a app e o id', async () => {
    const p = props();
    render(<AppList {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Editar app-2' }));
    expect(p.onEdit).toHaveBeenCalledWith(p.envApps[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Remover app-2' }));
    expect(p.onRemove).toHaveBeenCalledWith('id2');
  });

  it('usa o callback mais recente mesmo com identidade nova a cada render', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const base = props();
    const { rerender } = render(<AppList {...base} onSelect={first} />);
    rerender(<AppList {...base} onSelect={second} />);
    await userEvent.click(screen.getByText('app-1'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('id1');
  });

  it('filtro sem resultado', () => {
    render(<AppList {...props({ ...EMPTY, envApps: [mk(1)] })} />);
    expect(screen.getByText('Nenhuma aplicação corresponde ao filtro.')).toBeInTheDocument();
  });

  it('vazio com a API fora', () => {
    useConnectionStore.setState({ apiDown: true });
    render(<AppList {...props(EMPTY)} />);
    expect(
      screen.getByText('Não foi possível carregar as aplicações. Tentando reconectar…'),
    ).toBeInTheDocument();
  });

  it('vazio de órbita e vazio geral', () => {
    const orbit: Orbit = { key: 'dream-team', name: 'Dream team' };
    const { rerender } = render(<AppList {...props({ ...EMPTY, currentOrbit: orbit })} />);
    expect(
      screen.getByText(
        'Nenhuma aplicação da órbita Dream team neste ambiente. Use o botão + para lançar uma.',
      ),
    ).toBeInTheDocument();
    rerender(<AppList {...props(EMPTY)} />);
    expect(
      screen.getByText('Nenhuma aplicação em órbita ainda. Use o botão + para lançar a primeira.'),
    ).toBeInTheDocument();
  });
});
