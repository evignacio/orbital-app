import { parseCometLog } from '../domain/comet-quota';
import { KEYS } from './keys';
import { readJson, writeJson } from './local-storage';

// Timestamps (ms) dos cometas mostrados na última hora: lista JSON de números,
// como no legado (congelado até a F5).

export function readCometLog(): number[] {
  return readJson(KEYS.comet, parseCometLog, []);
}

export function writeCometLog(log: readonly number[]): void {
  writeJson(KEYS.comet, log);
}
