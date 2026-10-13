import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { clockLabel } from '@/domain/format';
import { useConnectionStore } from '@/store/connection.store';
import { useStatusStore } from '@/store/status.store';
import { OrbitViewHint, orbitHintText } from '@/features/panel/OrbitViewHint';

const TS = new Date(2026, 9, 12, 14, 5, 9).getTime();
const HHMM = new Date(TS).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

describe('orbitHintText', () => {
  it('com contato e status em dia: convite ao clique', () => {
    expect(orbitHintText({ apiDown: false, lastOk: TS, stale: false, staleTs: TS })).toBe(
      'CLIQUE EM UM PLANETA PARA DETALHES',
    );
  });

  it('API fora: sem contato, com a hora (hh:mm) do último ok quando houver', () => {
    expect(orbitHintText({ apiDown: true, lastOk: null, stale: true, staleTs: 0 })).toBe(
      'SEM CONTATO COM A CENTRAL',
    );
    expect(orbitHintText({ apiDown: true, lastOk: TS, stale: true, staleTs: 0 })).toBe(
      `SEM CONTATO COM A CENTRAL · DADOS DE ${HHMM}`,
    );
  });

  it('status antigo: último conhecido, com a data do status quando houver', () => {
    expect(orbitHintText({ apiDown: false, lastOk: null, stale: true, staleTs: 0 })).toBe(
      'ÚLTIMO CONHECIDO · SINCRONIZANDO…',
    );
    expect(orbitHintText({ apiDown: false, lastOk: null, stale: true, staleTs: TS })).toBe(
      `ÚLTIMO CONHECIDO · DADOS DE ${clockLabel(TS)} · SINCRONIZANDO…`,
    );
  });
});

describe('OrbitViewHint', () => {
  beforeEach(() => {
    useConnectionStore.setState(useConnectionStore.getInitialState());
    useStatusStore.setState(useStatusStore.getInitialState());
  });

  it('lê apiDown, lastOk e a data do status das stores', () => {
    render(<OrbitViewHint stale={false} />);
    const hint = screen.getByText('CLIQUE EM UM PLANETA PARA DETALHES');
    expect(hint).not.toHaveAttribute('data-storm');
    act(() => {
      useConnectionStore.setState({ apiDown: true, lastOk: TS });
    });
    expect(screen.getByText(`SEM CONTATO COM A CENTRAL · DADOS DE ${HHMM}`)).toHaveAttribute(
      'data-storm',
    );
  });

  it('stale usa o ts da store de status', () => {
    useStatusStore.setState({ ts: TS });
    render(<OrbitViewHint stale />);
    expect(
      screen.getByText(`ÚLTIMO CONHECIDO · DADOS DE ${clockLabel(TS)} · SINCRONIZANDO…`),
    ).toBeInTheDocument();
  });
});
