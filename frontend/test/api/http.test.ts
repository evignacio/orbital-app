import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_TIMEOUT } from '@/domain/constants';
import { ApiContractError, ApiError, apiErrorMsg, apiFetch } from '@/api/http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('apiFetch', () => {
  it('chama /api + path e devolve o JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch<{ ok: number }>('/applications')).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledWith('/api/applications', expect.any(Object));
  });

  it('repassa método, cabeçalhos e corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 201));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/applications/production', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/production',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"a":1}',
      }),
    );
  });

  it('devolve null no 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiFetch('/applications/production/1', { method: 'DELETE' })).resolves.toBeNull();
  });

  it('lança ApiError com status e corpo quando a API manda erro JSON', async () => {
    const body = { error: 'Invalid application', fields: { name: 'obrigatório' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body, 400)));
    const err = await apiFetch('/applications/production', { method: 'POST' }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(400);
    expect(apiErr.body).toEqual(body);
    expect(apiErr.message).toBe('Invalid application');
  });

  it('usa "HTTP status" quando o corpo do erro não é JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })));
    const err = (await apiFetch('/applications').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.body).toBeNull();
    expect(err.message).toBe('HTTP 502');
  });

  it('ignora corpo de erro sem mensagem em texto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 5 }, 500)));
    const err = (await apiFetch('/applications').catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe('HTTP 500');
  });

  it('aborta com TimeoutError depois de API_TIMEOUT', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(init.signal?.reason as Error);
            });
          }),
      ),
    );
    const result = apiFetch('/applications').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(API_TIMEOUT - 1);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = (await result) as Error;
    expect(err.name).toBe('TimeoutError');
  });

  it('cancela o relógio quando a resposta chega', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
    await apiFetch('/applications');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propaga falha de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch('/applications')).rejects.toThrow('Failed to fetch');
  });
});

describe('apiErrorMsg', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('timeout', () => {
    expect(apiErrorMsg(new DOMException('x', 'TimeoutError'))).toBe('a API não respondeu a tempo.');
  });

  it('502, 503 e 504 vêm do nginx', () => {
    for (const status of [502, 503, 504]) {
      expect(apiErrorMsg(new ApiError(status, null))).toBe(
        `sem contato com a API (HTTP ${String(status)}).`,
      );
    }
  });

  it('outro status mostra a mensagem da API quando há', () => {
    expect(apiErrorMsg(new ApiError(400, { error: 'Invalid id format' }))).toBe(
      'a API respondeu 400 (Invalid id format).',
    );
  });

  it('outro status sem mensagem da API mostra só o código', () => {
    expect(apiErrorMsg(new ApiError(500, null))).toBe('a API respondeu 500.');
    expect(apiErrorMsg(new ApiError(501, { error: 'HTTP 501' }))).toBe('a API respondeu 501.');
  });

  it('o que não tem status é falta de contato', () => {
    expect(apiErrorMsg(new TypeError('Failed to fetch'))).toBe('sem contato com a API.');
    expect(apiErrorMsg(null)).toBe('sem contato com a API.');
    expect(apiErrorMsg('x')).toBe('sem contato com a API.');
  });

  it('resposta fora do contrato devolve a própria mensagem', () => {
    expect(apiErrorMsg(new ApiContractError('a API não devolveu o id da aplicação.'))).toBe(
      'a API não devolveu o id da aplicação.',
    );
  });
});
