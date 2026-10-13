import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@/domain/types';
import { useConnectionStore } from '@/store/connection.store';
import { useStatusStore } from '@/store/status.store';
import { AppCard, safeHref } from './AppCard';

function app(over: Partial<Application> = {}): Application {
  return {
    id: 'a',
    env: 'prd',
    name: 'checkout-api',
    team: 'Pagamentos',
    healthCheckUrl: 'http://a',
    swaggerUrl: 'https://a/swagger',
    orbits: ['Dream team'],
    ...over,
  };
}

const handlers = () => ({ onSelect: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn() });

beforeEach(() => {
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
});

describe('safeHref', () => {
  it('aceita só http(s)', () => {
    expect(safeHref('https://x')).toBe('https://x');
    expect(safeHref('HTTP://x')).toBe('HTTP://x');
    expect(safeHref('javascript:alert(1)')).toBe('');
    expect(safeHref('')).toBe('');
  });
});

describe('AppCard', () => {
  it('mostra nome, time e VERIFICANDO sem status', () => {
    render(<AppCard app={app()} selected={false} stale={false} {...handlers()} />);
    expect(screen.getByText('checkout-api')).toBeInTheDocument();
    expect(screen.getByText('Time responsável: Pagamentos')).toBeInTheDocument();
    expect(screen.getByText('VERIFICANDO')).toBeInTheDocument();
  });

  it('badge degradado traz o tooltip fixo', () => {
    useStatusStore.setState({ status: { a: 'degraded' } });
    render(<AppCard app={app()} selected={false} stale={false} {...handlers()} />);
    expect(screen.getByText('DEGRADADO')).toHaveAttribute(
      'title',
      'Tempo de resposta acima do limite',
    );
  });

  it('stale: "ÚLTIMO: …" com a hora do último status conhecido', () => {
    useStatusStore.setState({
      status: { a: 'healthy' },
      ts: new Date(2020, 0, 1, 10, 30).getTime(),
    });
    render(<AppCard app={app()} selected={false} stale {...handlers()} />);
    const badge = screen.getByText('ÚLTIMO: NO AR');
    expect(badge.getAttribute('title')).toMatch(/^Último status conhecido, de /);
  });

  it('stale com a API fora: título sem hora', () => {
    useStatusStore.setState({ status: { a: 'healthy' }, ts: 1000 });
    useConnectionStore.setState({ apiDown: true });
    render(<AppCard app={app()} selected={false} stale {...handlers()} />);
    expect(screen.getByText('ÚLTIMO: NO AR')).toHaveAttribute('title', 'Último status conhecido');
  });

  it('stale sem status: continua VERIFICANDO', () => {
    render(<AppCard app={app()} selected={false} stale {...handlers()} />);
    expect(screen.getByText('VERIFICANDO')).not.toHaveAttribute('title');
  });

  it('swagger seguro vira link em nova aba', () => {
    render(<AppCard app={app()} selected={false} stale={false} {...handlers()} />);
    const link = screen.getByRole('link', { name: /SWAGGER/ });
    expect(link).toHaveAttribute('href', 'https://a/swagger');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
  });

  it('swagger inseguro ou vazio fica sem link', () => {
    const { rerender } = render(
      <AppCard
        app={app({ swaggerUrl: 'javascript:alert(1)' })}
        selected={false}
        stale={false}
        {...handlers()}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('SWAGGER')).toBeInTheDocument();
    rerender(
      <AppCard app={app({ swaggerUrl: '' })} selected={false} stale={false} {...handlers()} />,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('clique no card seleciona; lápis e ✕ não propagam', async () => {
    const h = handlers();
    const a = app();
    render(<AppCard app={a} selected={false} stale={false} {...h} />);
    await userEvent.click(screen.getByText('checkout-api'));
    expect(h.onSelect).toHaveBeenCalledWith('a');
    await userEvent.click(screen.getByRole('button', { name: 'Editar checkout-api' }));
    expect(h.onEdit).toHaveBeenCalledWith(a);
    await userEvent.click(screen.getByRole('button', { name: 'Remover checkout-api' }));
    expect(h.onRemove).toHaveBeenCalledWith('a');
    expect(h.onSelect).toHaveBeenCalledTimes(1);
  });

  it('clique no swagger não seleciona o card', async () => {
    const h = handlers();
    render(<AppCard app={app()} selected={false} stale={false} {...h} />);
    const link = screen.getByRole('link', { name: /SWAGGER/ });
    link.addEventListener('click', (e) => {
      e.preventDefault();
    });
    await userEvent.click(link);
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it('um evento de status re-renderiza só o card afetado', () => {
    const h = handlers();
    const a = app({ id: 'a' });
    const b = app({ id: 'b', name: 'billing-api' });
    const renders = { a: 0, b: 0 };
    render(
      <>
        <Profiler
          id="a"
          onRender={() => {
            renders.a++;
          }}
        >
          <AppCard app={a} selected={false} stale={false} {...h} />
        </Profiler>
        <Profiler
          id="b"
          onRender={() => {
            renders.b++;
          }}
        >
          <AppCard app={b} selected={false} stale={false} {...h} />
        </Profiler>
      </>,
    );
    const before = { ...renders };
    act(() => {
      useStatusStore.setState({ status: { a: 'unhealthy' } });
    });
    expect(screen.getByText('FORA DO AR')).toBeInTheDocument();
    expect(renders.a).toBe(before.a + 1);
    expect(renders.b).toBe(before.b);
  });
});
