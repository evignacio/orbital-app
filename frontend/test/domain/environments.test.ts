import { describe, expect, it } from 'vitest';
import {
  API_TO_ENV,
  DEFAULT_ENV,
  ENV_CODES,
  ENV_TO_API,
  ENVS,
  envLabel,
  isEnvCode,
} from '@/domain/environments';

describe('environments', () => {
  it('mantém a ordem dev, hml, prd com os nomes da API e os rótulos em pt-BR', () => {
    expect(ENVS).toEqual([
      { code: 'dev', api: 'development', label: 'DESENVOLVIMENTO' },
      { code: 'hml', api: 'staging', label: 'HOMOLOGAÇÃO' },
      { code: 'prd', api: 'production', label: 'PRODUÇÃO' },
    ]);
    expect(ENV_CODES).toEqual(['dev', 'hml', 'prd']);
  });

  it('traduz código da UI para nome da API e de volta', () => {
    expect(ENV_TO_API).toEqual({ dev: 'development', hml: 'staging', prd: 'production' });
    expect(API_TO_ENV).toEqual({ development: 'dev', staging: 'hml', production: 'prd' });
  });

  it('usa produção como ambiente padrão', () => {
    expect(DEFAULT_ENV).toBe('prd');
  });

  it('devolve o rótulo do ambiente e vazio para um código desconhecido', () => {
    expect(envLabel('hml')).toBe('HOMOLOGAÇÃO');
    expect(envLabel('xyz')).toBe('');
    expect(envLabel(undefined)).toBe('');
  });

  it('reconhece só os três códigos como EnvCode', () => {
    expect(isEnvCode('dev')).toBe(true);
    expect(isEnvCode('prd')).toBe(true);
    expect(isEnvCode('production')).toBe(false);
    expect(isEnvCode('')).toBe(false);
    expect(isEnvCode(null)).toBe(false);
    expect(isEnvCode(3)).toBe(false);
  });
});
