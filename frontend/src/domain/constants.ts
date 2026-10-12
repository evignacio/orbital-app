// Tempos e limites compartilhados. As chaves de localStorage ficam em storage/keys.ts.

export const API_TIMEOUT = 10_000;
// Status gravado há mais que isso aparece como "último conhecido" até o primeiro ciclo do servidor.
export const STATUS_STALE_MS = 5 * 60_000;
// Redimensionar: espera o arrasto parar antes de refazer o esqueleto da órbita.
export const RESIZE_DEBOUNCE_MS = 100;
// O EventSource reconecta sozinho; só depois deste prazo sem conexão vira tempestade.
export const SSE_DOWN_GRACE_MS = 5000;
// Reabertura manual quando o EventSource desiste (resposta que não é event-stream, ex.: 502 do nginx).
export const SSE_RETRY_MS = 3000;
export const BASE_TITLE = 'Orbital - App';
