import type { EnvCode } from './types';
import { orbitKey } from './orbits';

// O blur do campo de time espera o onMouseDown de uma sugestão antes de fechar a lista.
export const TEAM_BLUR_MS = 150;
// Combobox de órbitas: a lista espera o onMouseDown de um item antes de fechar.
export const ORBIT_BLUR_MS = 120;

export interface AppForm {
  name: string;
  team: string;
  swaggerUrl: string;
  healthCheckUrl: string;
  env: EnvCode;
  orbits: string[];
}

export type AppFormField = 'name' | 'team' | 'healthCheckUrl' | 'swaggerUrl' | 'orbits';
// Só os campos inválidos aparecem.
export type FormErrors = Partial<Record<AppFormField, string>>;
// Os campos que vão para a API, já aparados.
export type AppFormValue = Pick<AppForm, AppFormField>;

// Formulário de cadastro vazio, já no ambiente e nas órbitas indicados.
export function emptyForm(env: EnvCode, orbits: string[] = []): AppForm {
  return { name: '', team: '', swaggerUrl: '', healthCheckUrl: '', env, orbits };
}

// Validação do cadastro: as mesmas regras de api/src/validators/application.validator.js, que
// continua sendo a autoridade (um 400 dela também vira erro por campo).
export const FIELD_LIMITS = { name: 60, team: 60, url: 2048, orbit: 40, orbits: 10 } as const;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TEAM_RE = /^[\p{L}\p{N} ._-]+$/u;
// eslint-disable-next-line no-control-regex -- é justamente o que se quer recusar
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function urlError(v: string, required: boolean): string {
  if (!v) return required ? 'Informe a URL.' : '';
  if (v.length > FIELD_LIMITS.url) return `Use no máximo ${String(FIELD_LIMITS.url)} caracteres.`;
  if (CONTROL_CHARS.test(v)) return 'A URL tem caracteres inválidos.';
  // O esquema é obrigatório: sem ele, "qualquer" viraria o host de uma URL válida.
  if (!/^https?:\/\//i.test(v)) return 'A URL deve começar com http:// ou https://';
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return 'URL inválida.';
  }
  if (u.username || u.password) return 'Não inclua usuário ou senha na URL.';
  return '';
}

function textError(v: string, max: number, re: RegExp, format: string): string {
  if (!v) return 'Campo obrigatório.';
  if (v.length < 2 || v.length > max) return `Use de 2 a ${String(max)} caracteres.`;
  if (CONTROL_CHARS.test(v) || !re.test(v)) return format;
  return '';
}

// Órbitas: de 1 a FIELD_LIMITS.orbits, cada uma com as regras do time.
function orbitsError(list: readonly string[]): string {
  if (!list.length) return 'Escolha ao menos uma órbita.';
  if (list.length > FIELD_LIMITS.orbits)
    return `Use no máximo ${String(FIELD_LIMITS.orbits)} órbitas.`;
  const bad = list.find(
    (o) =>
      o.length < 2 || o.length > FIELD_LIMITS.orbit || CONTROL_CHARS.test(o) || !TEAM_RE.test(o),
  );
  return bad === undefined
    ? ''
    : `Órbita "${bad}": use de 2 a ${String(FIELD_LIMITS.orbit)} caracteres entre letras, números, espaços, ".", "_" ou "-".`;
}

// Os campos aparados, como a API os grava. As órbitas repetidas (mesma orbitKey)
// saem, ficando a primeira grafia, como faz a API; o combobox já as evita.
export function normalizeAppForm(f: AppForm): AppFormValue {
  const seen = new Set<string>();
  const orbits: string[] = [];
  for (const o of f.orbits.map((x) => x.trim())) {
    const key = orbitKey(o);
    if (seen.has(key)) continue;
    seen.add(key);
    orbits.push(o);
  }
  return {
    name: f.name.trim(),
    team: f.team.trim(),
    healthCheckUrl: f.healthCheckUrl.trim(),
    swaggerUrl: f.swaggerUrl.trim(),
    orbits,
  };
}

export function validateAppForm(f: AppForm): FormErrors {
  const value = normalizeAppForm(f);
  const all: Record<AppFormField, string> = {
    name: textError(
      value.name,
      FIELD_LIMITS.name,
      NAME_RE,
      'Use letras sem acento, números, ".", "_" ou "-", começando por letra ou número.',
    ),
    team: textError(
      value.team,
      FIELD_LIMITS.team,
      TEAM_RE,
      'Use letras, números, espaços, ".", "_" ou "-".',
    ),
    healthCheckUrl: urlError(value.healthCheckUrl, true),
    swaggerUrl: urlError(value.swaggerUrl, false),
    orbits: orbitsError(value.orbits),
  };
  const errors: FormErrors = {};
  for (const k of Object.keys(all) as AppFormField[]) {
    if (all[k]) errors[k] = all[k];
  }
  return errors;
}
