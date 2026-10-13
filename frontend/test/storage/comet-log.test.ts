import { readCometLog, writeCometLog } from '@/storage/comet-log';
import { KEYS } from '@/storage/keys';

beforeEach(() => {
  localStorage.clear();
});

describe('log do cometa', () => {
  it('começa vazio', () => {
    expect(readCometLog()).toEqual([]);
  });

  it('grava e lê a lista de timestamps no formato do legado', () => {
    writeCometLog([1700000000000, 1700000001000]);
    expect(localStorage.getItem(KEYS.comet)).toBe('[1700000000000,1700000001000]');
    expect(readCometLog()).toEqual([1700000000000, 1700000001000]);
  });

  it('ignora JSON corrompido ou de outra forma', () => {
    localStorage.setItem(KEYS.comet, '{nope');
    expect(readCometLog()).toEqual([]);
    localStorage.setItem(KEYS.comet, '{"a":1}');
    expect(readCometLog()).toEqual([]);
  });
});
