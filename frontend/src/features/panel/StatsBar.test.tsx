import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Application } from '@/domain/types';
import { useStatusStore } from '@/store/status.store';
import { StatsBar } from './StatsBar';

function app(id: string): Application {
  return {
    id,
    env: 'prd',
    name: `app-${id}`,
    team: 'Time',
    healthCheckUrl: 'http://x',
    swaggerUrl: '',
    orbits: ['Dream team'],
  };
}

beforeEach(() => {
  useStatusStore.setState(useStatusStore.getInitialState());
});

function count(label: string): string {
  const card = screen.getByText(label).parentElement;
  if (!card) throw new Error('sem cartão');
  return within(card).getByTestId('stat-count').textContent;
}

describe('StatsBar', () => {
  it('mostra os três rótulos na ordem do legado, zerados sem status', () => {
    render(<StatsBar apps={[app('a')]} />);
    expect(screen.getAllByText(/^(NO AR|DEGRADADO|FORA)$/).map((e) => e.textContent)).toEqual([
      'NO AR',
      'DEGRADADO',
      'FORA',
    ]);
    expect(count('NO AR')).toBe('0');
  });

  it('conta só as apps recebidas, por status', () => {
    useStatusStore.setState({
      status: { a: 'healthy', b: 'healthy', c: 'degraded', d: 'unhealthy', fora: 'healthy' },
    });
    render(<StatsBar apps={[app('a'), app('b'), app('c'), app('d')]} />);
    expect(count('NO AR')).toBe('2');
    expect(count('DEGRADADO')).toBe('1');
    expect(count('FORA')).toBe('1');
  });

  it('não tem controles clicáveis, como no legado', () => {
    render(<StatsBar apps={[app('a')]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
