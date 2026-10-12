import { migrateApp, migrateStatus } from '../domain/migrations';
import type { Application, StatusMap } from '../domain/types';
import { KEYS, OBSOLETE_KEYS } from './keys';
import { readJson, removeKey, writeJson } from './local-storage';

// Cache do que o navegador mostra enquanto a API não responde: a lista de apps e
// o último status de cada uma. Os formatos gravados são os do legado (congelados
// até a F5): `orbital-apps-v1` é o array de Application e `orbital-status-v1` é
// `{ status, ts }`, com `ts` em ms.

export interface StatusCache {
  status: StatusMap;
  /** Quando o status mais antigo do mapa foi confirmado; 0 se não se sabe. */
  ts: number;
}

export interface LocalCache extends StatusCache {
  apps: Application[];
}

function parseApps(raw: unknown): Application[] {
  if (!Array.isArray(raw)) return [];
  const apps: Application[] = [];
  for (const item of raw as unknown[]) {
    const app = migrateApp(item);
    if (app) apps.push(app);
  }
  return apps;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Formato atual `{ status, ts }`; o antigo era o mapa puro, sem data (conta como
// antigo, ts 0). Os ids que não estão em `known` (app removida em outra aba ou por
// outra pessoa) saem já na leitura.
function parseStatusCache(raw: unknown, known: ReadonlySet<string>): StatusCache {
  let map: unknown = raw;
  let ts = 0;
  if (isRecord(raw) && isRecord(raw.status)) {
    map = raw.status;
    ts = typeof raw.ts === 'number' && Number.isFinite(raw.ts) ? raw.ts : 0;
  }
  if (!isRecord(map)) return { status: {}, ts: 0 };
  const present = Object.fromEntries(Object.entries(map).filter(([id]) => known.has(id)));
  return { status: migrateStatus(present), ts };
}

export function readAppsCache(): Application[] {
  return readJson(KEYS.apps, parseApps, []);
}

export function readStatusCache(known: ReadonlySet<string>): StatusCache {
  return readJson(KEYS.status, (raw) => parseStatusCache(raw, known), { status: {}, ts: 0 });
}

// Tudo o que a carga lê do cache de apps e status. Uma leitura que falha (modo
// privado, JSON corrompido) deixa o campo com o valor padrão.
export function readCache(): LocalCache {
  const apps = readAppsCache();
  return { apps, ...readStatusCache(new Set(apps.map((a) => a.id))) };
}

export function writeAppsCache(apps: readonly Application[]): void {
  writeJson(KEYS.apps, apps);
}

export function writeStatusCache(status: StatusMap, ts: number): void {
  writeJson(KEYS.status, { status, ts });
}

// O timer e a periodicidade saíram do navegador: limpeza única das chaves antigas.
export function clearObsoleteKeys(): void {
  OBSOLETE_KEYS.forEach(removeKey);
}
