import { describe, expect, it } from 'vitest';
import { fromApi, migrateApp, migrateStatus } from '@/domain/migrations';

describe('fromApi', () => {
  it('converte o documento da API para Application com o env em código curto', () => {
    expect(
      fromApi(
        {
          id: 'a1',
          name: 'pagamentos',
          team: 'Time A',
          healthCheckUrl: 'https://x/health',
          swaggerUrl: 'https://x/docs',
          orbits: ['Dream team', 3 as unknown as string],
        },
        'staging',
      ),
    ).toEqual({
      id: 'a1',
      env: 'hml',
      name: 'pagamentos',
      team: 'Time A',
      healthCheckUrl: 'https://x/health',
      swaggerUrl: 'https://x/docs',
      orbits: ['Dream team'],
    });
  });

  it('aceita documento sem swaggerUrl nem orbits', () => {
    const app = fromApi(
      { id: 'a1', name: 'n', team: 't', healthCheckUrl: 'https://x' },
      'production',
    );
    expect(app.swaggerUrl).toBe('');
    expect(app.orbits).toEqual([]);
    expect(app.env).toBe('prd');
  });

  it('mantém a ordem das chaves que o legado gravava no cache', () => {
    const app = fromApi({ id: 'a1', name: 'n', team: 't', healthCheckUrl: 'u' }, 'development');
    expect(Object.keys(app)).toEqual([
      'id',
      'env',
      'name',
      'team',
      'healthCheckUrl',
      'swaggerUrl',
      'orbits',
    ]);
  });
});

describe('migrateApp', () => {
  it('lê o formato atual', () => {
    const raw = {
      id: 'a1',
      env: 'hml',
      name: 'n',
      team: 't',
      healthCheckUrl: 'u',
      swaggerUrl: 's',
      orbits: ['X'],
    };
    expect(migrateApp(raw)).toEqual(raw);
  });

  it('converte o formato antigo nome/time/health/swagger', () => {
    expect(migrateApp({ id: 'a1', nome: 'n', time: 't', health: 'u', swagger: 's' })).toEqual({
      id: 'a1',
      env: 'prd',
      name: 'n',
      team: 't',
      healthCheckUrl: 'u',
      swaggerUrl: 's',
      orbits: [],
    });
    expect(migrateApp({ id: 'a1', env: 'dev', nome: 'n', time: 't', health: 'u' })).toMatchObject({
      env: 'dev',
      swaggerUrl: '',
    });
  });

  it('põe env padrão e orbits vazias em quem veio do cache sem eles', () => {
    expect(
      migrateApp({ id: 'a1', name: 'n', team: 't', healthCheckUrl: 'u', swaggerUrl: '' }),
    ).toMatchObject({ env: 'prd', orbits: [] });
  });

  it('troca um env desconhecido pelo padrão', () => {
    expect(
      migrateApp({ id: 'a1', env: 'qa', name: 'n', team: 't', healthCheckUrl: 'u' }),
    ).toMatchObject({ env: 'prd' });
  });

  it('descarta o que não é app', () => {
    expect(migrateApp(null)).toBeNull();
    expect(migrateApp('x')).toBeNull();
    expect(migrateApp([])).toBeNull();
    expect(migrateApp({ name: 'n', team: 't', healthCheckUrl: 'u' })).toBeNull();
    expect(migrateApp({ id: '', name: 'n', team: 't', healthCheckUrl: 'u' })).toBeNull();
    expect(migrateApp({ id: 'a', name: 1, team: 't', healthCheckUrl: 'u' })).toBeNull();
    expect(migrateApp({ id: 'a', name: 'n', team: 't' })).toBeNull();
    expect(migrateApp({ id: 'a', nome: 'n', time: 't' })).toBeNull();
  });

  it('descarta swaggerUrl que não é texto', () => {
    expect(
      migrateApp({ id: 'a', name: 'n', team: 't', healthCheckUrl: 'u', swaggerUrl: 5 }),
    ).toMatchObject({ swaggerUrl: '' });
  });
});

describe('migrateStatus', () => {
  it('converte up/down e mantém os status atuais', () => {
    expect(
      migrateStatus({ a: 'up', b: 'down', c: 'healthy', d: 'degraded', e: 'unhealthy' }),
    ).toEqual({ a: 'healthy', b: 'unhealthy', c: 'healthy', d: 'degraded', e: 'unhealthy' });
  });

  it('descarta valores desconhecidos', () => {
    expect(migrateStatus({ a: 'x', b: 1, c: null, d: 'healthy' })).toEqual({ d: 'healthy' });
  });

  it('devolve vazio para o que não é mapa', () => {
    expect(migrateStatus(null)).toEqual({});
    expect(migrateStatus('x')).toEqual({});
    expect(migrateStatus([])).toEqual({});
  });
});
