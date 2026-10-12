import { beforeEach, describe, expect, it } from 'vitest';
import { useConnectionStore } from './connection.store';

beforeEach(() => {
  useConnectionStore.setState(useConnectionStore.getInitialState());
});

describe('connection.store', () => {
  it('começa com a API de pé, sem varredura e sem lastOk', () => {
    const s = useConnectionStore.getState();
    expect(s.apiDown).toBe(false);
    expect(s.lastOk).toBeNull();
    expect(s.scanning).toBe(false);
    expect(s.scanEnv).toBeNull();
  });

  it('markApiDown só avisa a primeira queda', () => {
    expect(useConnectionStore.getState().markApiDown()).toBe(true);
    expect(useConnectionStore.getState().apiDown).toBe(true);
    expect(useConnectionStore.getState().markApiDown()).toBe(false);
  });

  it('markApiUp devolve se havia tempestade a encerrar', () => {
    expect(useConnectionStore.getState().markApiUp()).toBe(false);
    useConnectionStore.getState().markApiDown();
    expect(useConnectionStore.getState().markApiUp()).toBe(true);
    expect(useConnectionStore.getState().apiDown).toBe(false);
  });

  it('setLastOk guarda e persiste no formato do legado', () => {
    useConnectionStore.getState().setLastOk(1_700_000_000_000);
    expect(useConnectionStore.getState().lastOk).toBe(1_700_000_000_000);
    expect(localStorage.getItem('orbital-lastok-v1')).toBe('1700000000000');
  });

  it('startScan recusa uma segunda varredura e lembra o ambiente esperado', () => {
    expect(useConnectionStore.getState().startScan('hml')).toBe(true);
    expect(useConnectionStore.getState().scanning).toBe(true);
    expect(useConnectionStore.getState().scanEnv).toBe('hml');
    expect(useConnectionStore.getState().startScan('dev')).toBe(false);
    expect(useConnectionStore.getState().scanEnv).toBe('hml');
  });

  it('endScan encerra a varredura', () => {
    useConnectionStore.getState().startScan('dev');
    useConnectionStore.getState().endScan();
    expect(useConnectionStore.getState().scanning).toBe(false);
    expect(useConnectionStore.getState().scanEnv).toBeNull();
  });
});
