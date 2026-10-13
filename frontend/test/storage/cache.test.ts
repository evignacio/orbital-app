import { describe, expect, it } from 'vitest';
import type { Application } from '@/domain/types';
import {
  clearObsoleteKeys,
  readAppsCache,
  readCache,
  readStatusCache,
  writeAppsCache,
  writeStatusCache,
} from '@/storage/cache';
import { KEYS, OBSOLETE_KEYS } from '@/storage/keys';

const app: Application = {
  id: 'a1',
  env: 'hml',
  name: 'pagamentos',
  team: 'Time A',
  healthCheckUrl: 'https://x/health',
  swaggerUrl: '',
  orbits: ['Dream team'],
};

// O que o legado grava, escrito à mão:
// JSON.stringify(apps) e JSON.stringify({ status, ts: this.statusTs || 0 }).
const legacyApps =
  '[{"id":"a1","env":"hml","name":"pagamentos","team":"Time A","healthCheckUrl":"https://x/health","swaggerUrl":"","orbits":["Dream team"]}]';
const legacyStatus = '{"status":{"a1":"degraded"},"ts":1700000000000}';

describe('chaves', () => {
  it('mantêm os nomes do legado', () => {
    expect(KEYS).toEqual({
      theme: 'orbital-theme-v1',
      apps: 'orbital-apps-v1',
      status: 'orbital-status-v1',
      notify: 'orbital-notify-v1',
      sound: 'orbital-sound-v1',
      lastOk: 'orbital-lastok-v1',
      comet: 'orbital-comet-v1',
      env: 'orbital-env-v1',
    });
    expect(OBSOLETE_KEYS).toEqual(['orbital-counters-v1', 'orbital-rate-v1']);
  });
});

describe('leitura cruzada com o legado', () => {
  it('lê o JSON exato que o legado grava', () => {
    localStorage.setItem(KEYS.apps, legacyApps);
    localStorage.setItem(KEYS.status, legacyStatus);
    expect(readCache()).toEqual({
      apps: [app],
      status: { a1: 'degraded' },
      ts: 1700000000000,
    });
  });

  it('grava byte a byte o mesmo que o legado', () => {
    writeAppsCache([app]);
    writeStatusCache({ a1: 'degraded' }, 1700000000000);
    expect(localStorage.getItem(KEYS.apps)).toBe(legacyApps);
    expect(localStorage.getItem(KEYS.status)).toBe(legacyStatus);
  });

  it('o que a função nova grava, ela mesma lê de volta', () => {
    writeAppsCache([app]);
    writeStatusCache({ a1: 'unhealthy' }, 5);
    expect(readCache()).toEqual({ apps: [app], status: { a1: 'unhealthy' }, ts: 5 });
  });
});

describe('readAppsCache', () => {
  it('migra apps do formato antigo e descarta lixo', () => {
    localStorage.setItem(
      KEYS.apps,
      JSON.stringify([{ id: 'a1', nome: 'n', time: 't', health: 'u' }, null, 'x']),
    );
    expect(readAppsCache()).toEqual([
      {
        id: 'a1',
        env: 'prd',
        name: 'n',
        team: 't',
        healthCheckUrl: 'u',
        swaggerUrl: '',
        orbits: [],
      },
    ]);
  });

  it('devolve [] sem cache, com JSON corrompido ou sem ser lista', () => {
    expect(readAppsCache()).toEqual([]);
    localStorage.setItem(KEYS.apps, '{quebrado');
    expect(readAppsCache()).toEqual([]);
    localStorage.setItem(KEYS.apps, '{"a":1}');
    expect(readAppsCache()).toEqual([]);
  });
});

describe('readStatusCache', () => {
  const known = new Set(['a1', 'a2']);

  it('lê o formato { status, ts }', () => {
    localStorage.setItem(KEYS.status, '{"status":{"a1":"healthy"},"ts":42}');
    expect(readStatusCache(known)).toEqual({ status: { a1: 'healthy' }, ts: 42 });
  });

  it('lê o mapa nu antigo com ts 0 e converte up/down', () => {
    localStorage.setItem(KEYS.status, '{"a1":"up","a2":"down"}');
    expect(readStatusCache(known)).toEqual({
      status: { a1: 'healthy', a2: 'unhealthy' },
      ts: 0,
    });
  });

  it('descarta ids que não estão na lista e status desconhecidos', () => {
    localStorage.setItem(
      KEYS.status,
      '{"status":{"a1":"healthy","fantasma":"healthy","a2":"xyz"},"ts":9}',
    );
    expect(readStatusCache(known)).toEqual({ status: { a1: 'healthy' }, ts: 9 });
  });

  it('usa ts 0 quando a data não é número', () => {
    localStorage.setItem(KEYS.status, '{"status":{"a1":"healthy"},"ts":"ontem"}');
    expect(readStatusCache(known).ts).toBe(0);
    localStorage.setItem(KEYS.status, '{"status":{"a1":"healthy"}}');
    expect(readStatusCache(known).ts).toBe(0);
  });

  it('devolve vazio sem cache, corrompido ou com valor que não é mapa', () => {
    expect(readStatusCache(known)).toEqual({ status: {}, ts: 0 });
    localStorage.setItem(KEYS.status, '{quebrado');
    expect(readStatusCache(known)).toEqual({ status: {}, ts: 0 });
    localStorage.setItem(KEYS.status, '"texto"');
    expect(readStatusCache(known)).toEqual({ status: {}, ts: 0 });
    localStorage.setItem(KEYS.status, '[1]');
    expect(readStatusCache(known)).toEqual({ status: {}, ts: 0 });
  });
});

describe('clearObsoleteKeys', () => {
  it('apaga as chaves de contadores e periodicidade, só elas', () => {
    localStorage.setItem('orbital-counters-v1', '{}');
    localStorage.setItem('orbital-rate-v1', '5');
    localStorage.setItem(KEYS.theme, 'dark');
    clearObsoleteKeys();
    expect(localStorage.getItem('orbital-counters-v1')).toBeNull();
    expect(localStorage.getItem('orbital-rate-v1')).toBeNull();
    expect(localStorage.getItem(KEYS.theme)).toBe('dark');
  });
});
