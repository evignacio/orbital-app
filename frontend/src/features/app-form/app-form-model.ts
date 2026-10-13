import { ApiError } from '@/api/http';
import {
  emptyForm,
  type AppForm,
  type AppFormField,
  type FormErrors,
} from '@/domain/application-form';
import { orbitKey, type Orbit } from '@/domain/orbits';
import type { Application, EnvCode } from '@/domain/types';

// Regras puras do cadastro (legacy/app-form.js), fora dos componentes para
// serem testadas sem DOM.

/** Cadastro novo: já na órbita indicada (a do filtro, no painel), se houver. */
export function blankForm(env: EnvCode, orbit: string | null): AppForm {
  return emptyForm(env, orbit ? [orbit] : []);
}

/** Os dados da app, para alterar só o que quiser. O ambiente é a coleção onde ela está. */
export function formFromApp(app: Application): AppForm {
  return {
    name: app.name,
    team: app.team,
    swaggerUrl: app.swaggerUrl,
    healthCheckUrl: app.healthCheckUrl,
    env: app.env,
    orbits: [...app.orbits],
  };
}

/** Times já cadastrados que contêm o texto digitado, sem o que já está igual no campo. */
export function teamSuggestions(apps: readonly Application[], team: string): string[] {
  const tq = team.trim().toLowerCase();
  // Ordem padrão do sort, como no legado.
  const all = [...new Set(apps.map((a) => a.team).filter(Boolean))].sort();
  return (tq ? all.filter((t) => t.toLowerCase().includes(tq)) : all).filter(
    (t) => t.toLowerCase() !== tq,
  );
}

export interface OrbitOption {
  label: string;
  key: string;
  /** O nome que entra no form ao escolher. */
  value: string;
  /** Já escolhida. */
  on: boolean;
  /** "Criar órbita “x”": o texto não casa com nenhuma conhecida. */
  create: boolean;
}

/** As órbitas conhecidas que casam com a busca, mais "Criar órbita" quando o texto é novo. */
export function orbitOptions(
  known: readonly Orbit[],
  chosen: readonly string[],
  query: string,
): OrbitOption[] {
  const q = query.trim();
  const qk = orbitKey(q);
  const on = new Set(chosen.map(orbitKey));
  const items = known
    .filter((o) => !qk || o.key.includes(qk))
    .map((o) => ({ label: o.name, key: o.key, value: o.name, on: on.has(o.key), create: false }));
  if (q && !known.some((o) => o.key === qk) && !on.has(qk))
    items.push({ label: `Criar órbita “${q}”`, key: qk, value: q, on: false, create: true });
  return items;
}

/**
 * Liga/desliga a órbita pela chave: "financeiro" desliga "Financeiro".
 * null quando o nome não tem chave (só espaços).
 */
export function toggleOrbit(orbits: readonly string[], name: string): string[] | null {
  const key = orbitKey(name);
  if (!key) return null;
  return orbits.some((o) => orbitKey(o) === key)
    ? orbits.filter((o) => orbitKey(o) !== key)
    : [...orbits, name.trim()];
}

/** O form com a órbita ainda digitada no campo (sem Enter), se for nova; senão o mesmo objeto. */
export function withPendingOrbit(form: AppForm, query: string, known: readonly Orbit[]): AppForm {
  const q = query.trim();
  if (!q || form.orbits.some((o) => orbitKey(o) === orbitKey(q))) return form;
  const match = known.find((o) => o.key === orbitKey(q));
  return { ...form, orbits: [...form.orbits, match ? match.name : q] };
}

const FIELDS: readonly AppFormField[] = ['name', 'team', 'healthCheckUrl', 'swaggerUrl', 'orbits'];

/**
 * 400 com `{ fields }`: a API recusou campos que passaram aqui. Devolve os erros
 * por campo (só os do form, só textos); null para qualquer outra falha.
 */
export function apiFieldErrors(e: unknown): FormErrors | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null;
  const body = e.body;
  if (typeof body !== 'object' || body === null || !('fields' in body)) return null;
  const fields = body.fields;
  if (typeof fields !== 'object' || fields === null) return null;
  const errors: FormErrors = {};
  for (const k of FIELDS) {
    const msg: unknown = (fields as Record<string, unknown>)[k];
    if (typeof msg === 'string' && msg) errors[k] = msg;
  }
  return errors;
}
