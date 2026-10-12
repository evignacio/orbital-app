import { beforeEach, describe, expect, it } from 'vitest';
import { hydrateStores } from './hydrate';
import { useAppsStore } from './apps.store';
import { useConnectionStore } from './connection.store';
import { usePreferencesStore } from './preferences.store';
import { useStatusStore } from './status.store';

const NOW = 1_700_000_000_000;

function legacyApp(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    env: 'prd',
    name: `app-${id}`,
    team: 't',
    healthCheckUrl: 'https://x',
    swaggerUrl: '',
    orbits: ['O'],
    ...extra,
  };
}

beforeEach(() => {
  useAppsStore.setState(useAppsStore.getInitialState());
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
});

describe('hydrateStores', () => {
  it('sem nada gravado deixa os padrões', () => {
    hydrateStores(NOW);
    expect(useAppsStore.getState().apps).toEqual([]);
    expect(useStatusStore.getState().staleEnvs).toEqual([]);
    expect(usePreferencesStore.getState().theme).toBe('dark');
    expect(usePreferencesStore.getState().env).toBe('prd');
  });

  it('lê o cache no formato do legado, descartando status órfão', () => {
    localStorage.setItem('orbital-apps-v1', JSON.stringify([legacyApp('a'), legacyApp('b')]));
    localStorage.setItem(
      'orbital-status-v1',
      JSON.stringify({ status: { a: 'healthy', b: 'unhealthy', gone: 'healthy' }, ts: NOW - 1000 }),
    );
    localStorage.setItem('orbital-lastok-v1', String(NOW - 1000));
    hydrateStores(NOW);
    expect(useAppsStore.getState().apps.map((a) => a.id)).toEqual(['a', 'b']);
    expect(useStatusStore.getState().status).toEqual({ a: 'healthy', b: 'unhealthy' });
    expect(useStatusStore.getState().ts).toBe(NOW - 1000);
    expect(useStatusStore.getState().staleEnvs).toEqual([]);
    expect([...useStatusStore.getState().downSeen]).toEqual(['b']);
    expect(useConnectionStore.getState().lastOk).toBe(NOW - 1000);
  });

  it('status gravado há mais de 5 minutos deixa os três ambientes stale', () => {
    localStorage.setItem('orbital-apps-v1', JSON.stringify([legacyApp('a')]));
    localStorage.setItem(
      'orbital-status-v1',
      JSON.stringify({ status: { a: 'healthy' }, ts: NOW - 6 * 60_000 }),
    );
    hydrateStores(NOW);
    expect(useStatusStore.getState().staleEnvs).toEqual(['dev', 'hml', 'prd']);
  });

  it('mapa nu antigo (sem ts) conta como antigo', () => {
    localStorage.setItem('orbital-apps-v1', JSON.stringify([legacyApp('a')]));
    localStorage.setItem('orbital-status-v1', JSON.stringify({ a: 'up' }));
    hydrateStores(NOW);
    expect(useStatusStore.getState().status).toEqual({ a: 'healthy' });
    expect(useStatusStore.getState().staleEnvs).toHaveLength(3);
  });

  it('lê as preferências; ambiente inválido cai no padrão', () => {
    localStorage.setItem('orbital-theme-v1', 'light');
    localStorage.setItem('orbital-env-v1', 'hml');
    localStorage.setItem('orbital-sound-v1', '1');
    hydrateStores(NOW);
    expect(usePreferencesStore.getState()).toMatchObject({
      theme: 'light',
      env: 'hml',
      sound: true,
    });
    localStorage.setItem('orbital-env-v1', 'xx');
    hydrateStores(NOW);
    expect(usePreferencesStore.getState().env).toBe('prd');
  });

  it('o alerta salvo só vale com a permissão concedida', () => {
    localStorage.setItem('orbital-notify-v1', '1');
    hydrateStores(NOW, { notifyAllowed: false });
    expect(usePreferencesStore.getState().notify).toBe(false);
    hydrateStores(NOW, { notifyAllowed: true });
    expect(usePreferencesStore.getState().notify).toBe(true);
  });

  it('não grava nada no localStorage', () => {
    localStorage.setItem('orbital-apps-v1', JSON.stringify([legacyApp('a')]));
    const before = localStorage.getItem('orbital-apps-v1');
    hydrateStores(NOW);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('orbital-apps-v1')).toBe(before);
  });
});
