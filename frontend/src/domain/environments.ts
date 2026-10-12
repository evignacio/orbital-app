import type { ApiEnv, EnvCode } from './types';

interface EnvEntry {
  code: EnvCode;
  api: ApiEnv;
  label: string;
}

// Tabela única de ambientes: código curto da UI, nome na API/Mongo e rótulo.
// Tudo o que lista ou traduz ambientes deriva daqui.
export const ENVS: readonly EnvEntry[] = [
  { code: 'dev', api: 'development', label: 'DESENVOLVIMENTO' },
  { code: 'hml', api: 'staging', label: 'HOMOLOGAÇÃO' },
  { code: 'prd', api: 'production', label: 'PRODUÇÃO' },
];
export const ENV_CODES: readonly EnvCode[] = ENVS.map((e) => e.code);
export const ENV_TO_API = Object.fromEntries(ENVS.map((e) => [e.code, e.api])) as Record<
  EnvCode,
  ApiEnv
>;
export const API_TO_ENV = Object.fromEntries(ENVS.map((e) => [e.api, e.code])) as Record<
  ApiEnv,
  EnvCode
>;
export const DEFAULT_ENV: EnvCode = 'prd';

export function isEnvCode(v: unknown): v is EnvCode {
  return ENVS.some((e) => e.code === v);
}

export function envLabel(code: unknown): string {
  return ENVS.find((e) => e.code === code)?.label ?? '';
}
