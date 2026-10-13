import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agoLabel, clockLabel } from '@/domain/format';
import { useConnectionStore } from '@/store/connection.store';
import { StormBanner } from '@/features/panel/StormBanner';

beforeEach(() => {
  useConnectionStore.setState(useConnectionStore.getInitialState());
});

describe('StormBanner', () => {
  it('não aparece com a API no ar', () => {
    render(<StormBanner onRetry={() => undefined} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sem checagem concluída, avisa que nenhuma foi feita', () => {
    useConnectionStore.setState({ apiDown: true });
    render(<StormBanner onRetry={() => undefined} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('TEMPESTADE · API INACESSÍVEL');
    expect(alert).toHaveTextContent('Nenhuma checagem foi concluída ainda. Tentando reconectar…');
  });

  it('com lastOk, diz o horário e há quanto tempo foi a última checagem', () => {
    const lastOk = Date.now() - 5 * 60000;
    useConnectionStore.setState({ apiDown: true, lastOk });
    render(<StormBanner onRetry={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Os status abaixo são da última checagem, às ${clockLabel(lastOk)} (${agoLabel(lastOk)}). Tentando reconectar…`,
    );
    expect(agoLabel(lastOk)).toBe('há 5 min');
  });

  it('"Tentar agora" chama onRetry; durante a varredura vira "Tentando…"', async () => {
    const onRetry = vi.fn();
    useConnectionStore.setState({ apiDown: true });
    render(<StormBanner onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    act(() => {
      useConnectionStore.getState().startScan('prd');
    });
    expect(screen.getByRole('button', { name: 'Tentando…' })).toBeInTheDocument();
    act(() => {
      useConnectionStore.getState().endScan();
    });
    expect(screen.getByRole('button', { name: 'Tentar agora' })).toBeInTheDocument();
  });

  it('some quando a API volta', () => {
    useConnectionStore.setState({ apiDown: true });
    render(<StormBanner onRetry={() => undefined} />);
    act(() => {
      useConnectionStore.getState().markApiUp();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
