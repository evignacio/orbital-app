import { describe, expect, it } from 'vitest';
import {
  API_TIMEOUT,
  BASE_TITLE,
  RESIZE_DEBOUNCE_MS,
  SSE_DOWN_GRACE_MS,
  SSE_RETRY_MS,
  STATUS_STALE_MS,
} from './constants';

describe('constants', () => {
  it('mantém os valores do legado', () => {
    expect(API_TIMEOUT).toBe(10_000);
    expect(STATUS_STALE_MS).toBe(5 * 60_000);
    expect(RESIZE_DEBOUNCE_MS).toBe(100);
    expect(SSE_DOWN_GRACE_MS).toBe(5000);
    expect(SSE_RETRY_MS).toBe(3000);
    expect(BASE_TITLE).toBe('Orbital - App');
  });
});
