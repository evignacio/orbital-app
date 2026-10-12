import { DEFAULT_ENV, isEnvCode } from '../domain/environments';
import type { EnvCode, ThemeName } from '../domain/types';
import { KEYS } from './keys';
import { readString, writeString } from './local-storage';

// Preferências e o último momento em que a API respondeu. Formatos do legado
// (congelados até a F5): tema e ambiente como texto, flags como '1'/'0', lastOk
// como o número em texto.

export function readLastOk(): number | null {
  const n = parseInt(readString(KEYS.lastOk) ?? '', 10);
  return n || null;
}

export function writeLastOk(ms: number): void {
  writeString(KEYS.lastOk, String(ms));
}

export function readTheme(): ThemeName {
  return readString(KEYS.theme) === 'light' ? 'light' : 'dark';
}

export function writeTheme(theme: ThemeName): void {
  writeString(KEYS.theme, theme);
}

// Um código que não existe mais cai no padrão.
export function readEnv(): EnvCode {
  const saved = readString(KEYS.env);
  return isEnvCode(saved) ? saved : DEFAULT_ENV;
}

export function writeEnv(env: EnvCode): void {
  writeString(KEYS.env, env);
}

export function readFlag(key: 'notify' | 'sound'): boolean {
  return readString(KEYS[key]) === '1';
}

export function writeFlag(key: 'notify' | 'sound', on: boolean): void {
  writeString(KEYS[key], on ? '1' : '0');
}
