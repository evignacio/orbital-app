import type { Status } from './types';

interface StatusInfo {
  /** Prefixo das variáveis do tema (--up, --up-line, --up-fill). */
  tone: string;
  /** Texto do badge do card. */
  text: string;
}
interface StatusEntry extends StatusInfo {
  /** Texto do chip de filtro e do contador do cabeçalho. */
  chip: string;
}

// Fonte única dos status da API, como ENVS para os ambientes. A ordem é a da tela.
// A cor sai sempre por variável: no SVG, var() funciona em style (fill, stroke
// e stop-color), não nos atributos de apresentação.
export const STATUS_META: Record<Status, StatusEntry> = {
  healthy: { tone: 'up', text: 'NO AR', chip: 'NO AR' },
  degraded: { tone: 'warn', text: 'DEGRADADO', chip: 'DEGRADADO' },
  unhealthy: { tone: 'down', text: 'FORA DO AR', chip: 'FORA' },
};
// Ainda não checada (status ausente ou desconhecido).
export const IDLE_META: StatusInfo = { tone: 'idle', text: 'VERIFICANDO' };
export const STATUSES = Object.keys(STATUS_META) as Status[];
// Chips de filtro da lista: [valor do filtro, rótulo].
export const FILTERS: readonly (readonly [string, string])[] = [
  ['all', 'TODAS'],
  ...STATUSES.map((s) => [s, STATUS_META[s].chip] as const),
];

export function isStatus(v: unknown): v is Status {
  return STATUSES.some((s) => s === v);
}
export function statusMeta(s: unknown): StatusInfo {
  return isStatus(s) ? STATUS_META[s] : IDLE_META;
}
export function statusColor(s: unknown): string {
  return `var(--${statusMeta(s).tone})`;
}
export function statusText(s: unknown): string {
  return statusMeta(s).text;
}
