import type { Application } from './types';

export interface Orbit {
  key: string;
  name: string;
}
export interface OrbitWithApps extends Orbit {
  apps: Application[];
}

// Órbitas: agrupamentos derivados das apps (cada uma traz `orbits`, uma lista de
// nomes). A identidade é a chave sem acento, minúscula e com "-" no lugar dos
// espaços — a mesma de api/src/validators/application.validator.js — e é ela que
// vai em /painel?orbita=.
export function orbitKey(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-');
}

// Só strings entram; o que vier de fora (cache, API sem o campo) vira [].
export function orbitList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((o): o is string => typeof o === 'string' && o.trim() !== '')
    : [];
}

export function inOrbit(app: Pick<Application, 'orbits'>, key: string): boolean {
  return app.orbits.some((o) => orbitKey(o) === key);
}

// Todas as órbitas das apps, uma por chave, com a primeira grafia vista como nome
// e na ordem alfabética da chave (não depende da ordem em que o Mongo devolve).
export function collectOrbits(apps: readonly Pick<Application, 'orbits'>[]): Orbit[] {
  const byKey = new Map<string, Orbit>();
  for (const a of apps) {
    for (const name of a.orbits) {
      const key = orbitKey(name);
      if (key && !byKey.has(key)) byKey.set(key, { key, name: name.trim() });
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// Cores das órbitas só em tons frios (ciano → azul → violeta → orquídea): verde,
// âmbar, vermelho e cinza ficam com os status (--up, --warn, --down, --stale).
export const ORBIT_COLORS = {
  dark: ['#9184d9', '#62c6e6', '#df8fe0', '#79b4ec', '#c9a6f0', '#6f86e8', '#a8c8f5', '#b07fd6'],
  light: ['#5b4fb0', '#1d7a99', '#9a3f9a', '#2f6aa8', '#7a4fb0', '#3f55b8', '#4f74a8', '#6a3fa0'],
} as const;

// As órbitas na ordem em que nasceram, cada uma com suas apps: o id do Mongo
// cresce com o tempo, e a órbita conta a partir da app mais antiga dela. Uma
// órbita nova entra no fim, então nem a cor nem a posição das outras mudam.
export function orbitsByBirth(apps: readonly Application[]): OrbitWithApps[] {
  const byKey = new Map<string, OrbitWithApps>();
  const byId = [...apps].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const a of byId) {
    for (const name of a.orbits) {
      const key = orbitKey(name);
      if (!key) continue;
      let orbit = byKey.get(key);
      if (!orbit) {
        orbit = { key, name: name.trim(), apps: [] };
        byKey.set(key, orbit);
      }
      orbit.apps.push(a);
    }
  }
  return [...byKey.values()];
}

// Cor de cada órbita pela ordem de nascimento (as 8 primeiras nunca repetem).
// A função devolvida, para uma chave que ainda não existe, dá a cor que ela vai ganhar.
export function orbitColors(
  apps: readonly Application[],
  theme: 'dark' | 'light',
): (key: string) => string {
  const pal = ORBIT_COLORS[theme];
  const map = new Map(orbitsByBirth(apps).map((o, i) => [o.key, pal[i % pal.length] as string]));
  return (key) => map.get(key) ?? (pal[map.size % pal.length] as string);
}
