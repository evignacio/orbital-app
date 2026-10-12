import { API_TO_ENV, DEFAULT_ENV, isEnvCode } from './environments';
import { orbitList } from './orbits';
import { isStatus } from './status';
import type { ApiApplication, ApiEnv, Application, Status, StatusMap } from './types';

// O frontend usa os nomes de campo e de status da API; só acrescenta o env
// (código curto) a cada aplicação. A ordem das chaves é a que o legado gravava
// em `orbital-apps-v1` (formato congelado).
export function fromApi(doc: ApiApplication, apiEnv: ApiEnv): Application {
  return {
    id: doc.id,
    env: API_TO_ENV[apiEnv],
    name: doc.name,
    team: doc.team,
    healthCheckUrl: doc.healthCheckUrl,
    swaggerUrl: doc.swaggerUrl ?? '',
    orbits: orbitList(doc.orbits),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

// localStorage gravado antes da troca de vocabulário (nome/time/health/swagger e
// up/down): convertido na leitura, e regravado no formato novo no próximo save.
const LEGACY_STATUS: Record<string, Status> = { up: 'healthy', down: 'unhealthy' };

// Toda app que entra no estado tem env e orbits: quem vem do cache sem eles cai
// no padrão. Diferente do legado, que aceitava qualquer objeto, o que não tem os
// campos obrigatórios (id, nome, time, URL de health) é descartado.
export function migrateApp(raw: unknown): Application | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id);
  if (!id) return null;
  const old = raw.name === undefined && raw.nome !== undefined;
  const name = text(old ? raw.nome : raw.name);
  const team = text(old ? raw.time : raw.team);
  const healthCheckUrl = text(old ? raw.health : raw.healthCheckUrl);
  if (name === null || team === null || healthCheckUrl === null) return null;
  return {
    id,
    env: isEnvCode(raw.env) ? raw.env : DEFAULT_ENV,
    name,
    team,
    healthCheckUrl,
    swaggerUrl: text(old ? raw.swagger : raw.swaggerUrl) ?? '',
    orbits: old ? [] : orbitList(raw.orbits),
  };
}

// Só ficam os status conhecidos (com up/down do formato antigo convertidos).
export function migrateStatus(raw: unknown): StatusMap {
  const map: StatusMap = {};
  if (!isRecord(raw)) return map;
  for (const [id, value] of Object.entries(raw)) {
    const s = typeof value === 'string' ? (LEGACY_STATUS[value] ?? value) : null;
    if (isStatus(s)) map[id] = s;
  }
  return map;
}
