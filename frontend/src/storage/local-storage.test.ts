import { afterEach, describe, expect, it, vi } from 'vitest';
import { readJson, readString, removeKey, writeJson, writeString } from './local-storage';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('local-storage', () => {
  it('grava e lê texto', () => {
    expect(writeString('k', 'v')).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
    expect(readString('k')).toBe('v');
    expect(readString('ausente')).toBeNull();
  });

  it('remove uma chave', () => {
    localStorage.setItem('k', 'v');
    removeKey('k');
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('grava e lê JSON passando pelo parse', () => {
    expect(writeJson('k', { a: 1 })).toBe(true);
    expect(localStorage.getItem('k')).toBe('{"a":1}');
    expect(readJson('k', (raw) => raw, null)).toEqual({ a: 1 });
  });

  it('devolve o padrão sem a chave, com JSON corrompido ou quando o parse recusa', () => {
    expect(readJson('ausente', () => 1, 7)).toBe(7);
    localStorage.setItem('k', '{quebrado');
    expect(readJson('k', () => 1, 7)).toBe(7);
    localStorage.setItem('k', '{}');
    expect(
      readJson(
        'k',
        () => {
          throw new Error('inválido');
        },
        7,
      ),
    ).toBe(7);
  });

  it('não lança quando o localStorage falha', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(readString('k')).toBeNull();
    expect(readJson('k', () => 1, 7)).toBe(7);
    expect(writeString('k', 'v')).toBe(false);
    expect(writeJson('k', {})).toBe(false);
    expect(() => {
      removeKey('k');
    }).not.toThrow();
  });

  it('writeJson devolve false para valor que o JSON não aceita', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(writeJson('k', circular)).toBe(false);
  });
});
