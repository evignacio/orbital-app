import { API_TIMEOUT } from '../domain/constants';
import { API_BASE } from './config';

// Resposta HTTP que não foi 2xx. Leva o status e, quando a API manda, o corpo JSON
// ({ error } ou { error, fields } num 400), para o cadastro e a remoção mostrarem o motivo.
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const msg =
      typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
    super(typeof msg === 'string' && msg ? msg : `HTTP ${String(status)}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// A API respondeu 2xx, mas com algo que o contrato não prevê (ex.: create sem id).
export class ApiContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiContractError';
  }
}

// Qualquer falha (rede, timeout, 5xx do nginx sem a API) vira exceção: é o que
// acende a tempestade. Toda chamada aborta após API_TIMEOUT, inclusive POST e
// DELETE; o relógio cobre também a leitura do corpo. 204 devolve null.
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('A API não respondeu a tempo.', 'TimeoutError'));
  }, API_TIMEOUT);
  try {
    const r = await fetch(`${API_BASE}${path}`, { ...opts, signal: controller.signal });
    if (!r.ok) {
      let body: unknown = null;
      try {
        body = await r.json();
      } catch {
        // corpo ausente ou que não é JSON (ex.: página de erro do nginx)
      }
      throw new ApiError(r.status, body);
    }
    return r.status === 204 ? (null as T) : ((await r.json()) as T);
  } finally {
    clearTimeout(timer);
  }
}

function hasName(e: unknown, name: string): boolean {
  return typeof e === 'object' && e !== null && 'name' in e && e.name === name;
}

// Frase (sem pontuação inicial) para "Não foi possível …: <frase>" nas telas.
export function apiErrorMsg(e: unknown): string {
  if (hasName(e, 'TimeoutError')) return 'a API não respondeu a tempo.';
  if (e instanceof ApiContractError) return e.message;
  if (e instanceof ApiError) {
    // 502/503/504 vêm do nginx: a API em si está inacessível.
    const code = String(e.status);
    if (e.status >= 502 && e.status <= 504) return `sem contato com a API (HTTP ${code}).`;
    const detail = /^HTTP \d+$/.test(e.message) ? '' : ` (${e.message})`;
    return `a API respondeu ${code}${detail}.`;
  }
  return 'sem contato com a API.';
}
