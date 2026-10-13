import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createApplication,
  listApplications,
  removeApplication,
  syncEnvironment,
  updateApplication,
  type ApplicationInput,
} from '@/api/applications';
import { ApiContractError, ApiError } from '@/api/http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const doc = { id: 'a1', name: 'n', team: 't', healthCheckUrl: 'https://x/h' };
const input: ApplicationInput = {
  name: 'n',
  team: 't',
  healthCheckUrl: 'https://x/h',
  swaggerUrl: '',
  orbits: ['Dream team'],
};

function stubFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listApplications', () => {
  it('junta os ambientes e converte cada documento', async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        production: [{ ...doc, swaggerUrl: 'https://x/s', orbits: ['A'] }],
        staging: [{ ...doc, id: 'a2' }],
        development: [],
      }),
    );
    const apps = await listApplications();
    expect(fetchMock).toHaveBeenCalledWith('/api/applications', expect.any(Object));
    expect(apps).toEqual([
      { ...doc, env: 'prd', swaggerUrl: 'https://x/s', orbits: ['A'] },
      { ...doc, id: 'a2', env: 'hml', swaggerUrl: '', orbits: [] },
    ]);
  });

  it('ignora ambientes desconhecidos, listas inválidas e documentos fora do contrato', async () => {
    stubFetch(
      jsonResponse({
        production: [doc, { name: 'sem id', team: 't', healthCheckUrl: 'u' }, null, 'x'],
        qa: [{ ...doc, id: 'q1' }],
        staging: 'nada',
      }),
    );
    const apps = await listApplications();
    expect(apps.map((a) => a.id)).toEqual(['a1']);
  });

  it('falha quando a resposta não é um mapa', async () => {
    stubFetch(jsonResponse([1]));
    await expect(listApplications()).rejects.toBeInstanceOf(ApiContractError);
  });

  it('propaga o erro HTTP', async () => {
    stubFetch(new Response('', { status: 503 }));
    await expect(listApplications()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('createApplication', () => {
  it('faz POST no ambiente da API e devolve a app com o id', async () => {
    const fetchMock = stubFetch(jsonResponse({ ...doc, orbits: ['Dream team'] }, 201));
    const app = await createApplication('hml', input);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/staging',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
    expect(app).toEqual({ ...doc, env: 'hml', swaggerUrl: '', orbits: ['Dream team'] });
  });

  it('trata resposta sem id como falha', async () => {
    stubFetch(jsonResponse({ name: 'n' }, 201));
    await expect(createApplication('prd', input)).rejects.toThrow(
      'a API não devolveu o id da aplicação.',
    );
  });

  it('leva o corpo do 400 com fields', async () => {
    const body = { error: 'Invalid application', fields: { name: 'ruim' } };
    stubFetch(jsonResponse(body, 400));
    const err = (await createApplication('dev', input).catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(400);
    expect(err.body).toEqual(body);
  });
});

describe('updateApplication', () => {
  it('faz PUT em /applications/<env>/<id>', async () => {
    const fetchMock = stubFetch(jsonResponse(doc));
    const app = await updateApplication('prd', 'a1', input);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/production/a1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(input) }),
    );
    expect(app.env).toBe('prd');
  });

  it('codifica o id no caminho', async () => {
    const fetchMock = stubFetch(jsonResponse(doc));
    await updateApplication('prd', 'a/b?c', input);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/production/a%2Fb%3Fc',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});

describe('removeApplication', () => {
  it('faz DELETE e resolve no 204', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await expect(removeApplication('dev', 'a1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/development/a1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('codifica o id no caminho', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await removeApplication('dev', 'a/b?c');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/development/a%2Fb%3Fc',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('lança ApiError 404 para quem chama decidir', async () => {
    stubFetch(jsonResponse({ error: 'Application not found' }, 404));
    const err = (await removeApplication('dev', 'a1').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(404);
  });
});

describe('syncEnvironment', () => {
  it('faz POST em /sync e devolve o 202', async () => {
    const sync = {
      env: 'staging',
      trigger: 'manual',
      startedAt: '2026-01-01T00:00:00.000Z',
      nextCheckAt: null,
      joined: false,
    };
    const fetchMock = stubFetch(jsonResponse(sync, 202));
    await expect(syncEnvironment('hml')).resolves.toEqual(sync);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/staging/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
