import { describe, expect, it } from 'vitest';
import {
  readEnv,
  readFlag,
  readLastOk,
  readTheme,
  writeEnv,
  writeFlag,
  writeLastOk,
  writeTheme,
} from '@/storage/preferences';

describe('lastOk', () => {
  it('grava o número como texto e lê com parseInt, como o legado', () => {
    writeLastOk(1_700_000_000_123);
    expect(localStorage.getItem('orbital-lastok-v1')).toBe('1700000000123');
    expect(readLastOk()).toBe(1_700_000_000_123);
  });

  it('lê o que o legado gravou', () => {
    localStorage.setItem('orbital-lastok-v1', '1700000000123');
    expect(readLastOk()).toBe(1_700_000_000_123);
  });

  it('devolve null sem a chave, com lixo ou com zero', () => {
    expect(readLastOk()).toBeNull();
    localStorage.setItem('orbital-lastok-v1', 'abc');
    expect(readLastOk()).toBeNull();
    localStorage.setItem('orbital-lastok-v1', '0');
    expect(readLastOk()).toBeNull();
  });
});

describe('tema', () => {
  it('lê light e dark e cai em dark para qualquer outro valor', () => {
    expect(readTheme()).toBe('dark');
    localStorage.setItem('orbital-theme-v1', 'light');
    expect(readTheme()).toBe('light');
    localStorage.setItem('orbital-theme-v1', 'azul');
    expect(readTheme()).toBe('dark');
  });

  it('grava na chave do legado', () => {
    writeTheme('light');
    expect(localStorage.getItem('orbital-theme-v1')).toBe('light');
  });
});

describe('ambiente', () => {
  it('lê um código válido e cai no padrão para um inexistente', () => {
    expect(readEnv()).toBe('prd');
    localStorage.setItem('orbital-env-v1', 'hml');
    expect(readEnv()).toBe('hml');
    localStorage.setItem('orbital-env-v1', 'qa');
    expect(readEnv()).toBe('prd');
  });

  it('grava o código na chave do legado', () => {
    writeEnv('dev');
    expect(localStorage.getItem('orbital-env-v1')).toBe('dev');
  });
});

describe('flags de notificação e som', () => {
  it("gravam '1' e '0' e só '1' vale como ligado", () => {
    expect(readFlag('notify')).toBe(false);
    writeFlag('notify', true);
    expect(localStorage.getItem('orbital-notify-v1')).toBe('1');
    expect(readFlag('notify')).toBe(true);
    writeFlag('notify', false);
    expect(localStorage.getItem('orbital-notify-v1')).toBe('0');
    expect(readFlag('notify')).toBe(false);
    writeFlag('sound', true);
    expect(localStorage.getItem('orbital-sound-v1')).toBe('1');
    expect(readFlag('sound')).toBe(true);
  });
});
