const request = require("supertest");
const { ObjectId } = require("mongodb");

jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("../src/logger", () => require("./helpers").fakeLogger());
jest.mock("../src/db", () => ({ connect: jest.fn() }));
// withCache runs the check straight away; caching has its own tests.
jest.mock("../src/cache", () => ({
  withCache: jest.fn((key, ttl, fn) => fn()),
  invalidate: jest.fn(),
}));
// Real mapLimit, scripted checkHealth.
jest.mock("../src/health", () => ({
  ...jest.requireActual("../src/health"),
  checkHealth: jest.fn(),
}));

const app = require("../src/app");
const config = require("../src/config");
const log = require("../src/logger");
const { connect } = require("../src/db");
const { withCache, invalidate } = require("../src/cache");
const { checkHealth } = require("../src/health");

const ids = {
  billing: new ObjectId("64b000000000000000000001"),
  auth: new ObjectId("64b000000000000000000002"),
  search: new ObjectId("64b000000000000000000003"),
};

// In-memory stand-in for the Mongo database: one fake collection per name.
function fakeDb(data = {}) {
  const collections = {};
  return {
    collections,
    collection: jest.fn(name => {
      collections[name] ??= {
        find: jest.fn(() => ({ toArray: async () => data[name] || [] })),
        insertOne: jest.fn(async () => ({ insertedId: new ObjectId("64b0000000000000000000ff") })),
        deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
      };
      return collections[name];
    }),
  };
}

let db;

beforeEach(() => {
  db = fakeDb({
    applications_production: [
      { _id: ids.billing, name: "billing", team: "pagamentos", healthCheckUrl: "http://billing/health", swaggerUrl: "" },
      { _id: ids.auth, name: "auth", team: "identidade", healthCheckUrl: "http://auth/health", swaggerUrl: "http://auth/docs" },
    ],
    applications_staging: [
      { _id: ids.search, name: "search", team: "busca", healthCheckUrl: "http://search/health", swaggerUrl: "" },
    ],
  });
  connect.mockResolvedValue(db);
  withCache.mockImplementation((key, ttl, fn) => fn());
  invalidate.mockResolvedValue();
});

// Level the "request completed" line was logged at, if any.
const requestLogLevel = () =>
  ["info", "warn", "error"].find(level => log[level].mock.calls.some(([msg]) => msg === "request completed"));

describe("GET /applications", () => {
  it("envia X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/applications");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("devolve as aplicações dos três ambientes agrupadas, com _id convertido em id", async () => {
    const res = await request(app).get("/applications");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      development: [],
      staging: [
        { id: ids.search.toString(), name: "search", team: "busca", healthCheckUrl: "http://search/health", swaggerUrl: "" },
      ],
      production: [
        { id: ids.billing.toString(), name: "billing", team: "pagamentos", healthCheckUrl: "http://billing/health", swaggerUrl: "" },
        { id: ids.auth.toString(), name: "auth", team: "identidade", healthCheckUrl: "http://auth/health", swaggerUrl: "http://auth/docs" },
      ],
    });
    expect(db.collection.mock.calls.map(([name]) => name).sort()).toEqual([
      "applications_development",
      "applications_production",
      "applications_staging",
    ]);
  });

  it("responde 500 com a mensagem quando o Mongo está indisponível", async () => {
    connect.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const res = await request(app).get("/applications");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "connect ECONNREFUSED" });
    expect(log.error).toHaveBeenCalledWith("list applications failed", expect.objectContaining({ err: expect.any(Error) }));
  });
});

describe("GET /applications/:env", () => {
  it("não existe: responde 404 sem consultar cache nem Mongo", async () => {
    const res = await request(app).get("/applications/staging");

    expect(res.status).toBe(404);
    expect(withCache).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("POST /applications/:env/sync", () => {
  beforeEach(() => {
    checkHealth.mockImplementation(async app =>
      app.name === "auth"
        ? { id: app.id, name: app.name, status: "degraded", latencyMs: 3500, limitMs: 3000 }
        : { id: app.id, name: app.name, status: "healthy", latencyMs: 40 }
    );
  });

  it("verifica cada aplicação do ambiente e devolve os status na ordem da lista", async () => {
    const res = await request(app).post("/applications/production/sync");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: ids.billing.toString(), name: "billing", status: "healthy", latencyMs: 40 },
      { id: ids.auth.toString(), name: "auth", status: "degraded", latencyMs: 3500, limitMs: 3000 },
    ]);
    expect(checkHealth).toHaveBeenCalledTimes(2);
    expect(checkHealth).toHaveBeenCalledWith(
      expect.objectContaining({ id: ids.billing.toString(), healthCheckUrl: "http://billing/health" }),
      expect.anything()
    );
  });

  it("usa o cache com a chave sync:<env> e o TTL configurado", async () => {
    await request(app).post("/applications/staging/sync");

    expect(withCache).toHaveBeenCalledWith("sync:staging", config.syncCacheTtl, expect.any(Function), { fresh: false });
  });

  it("com ?fresh=1 pede ao cache para ignorar o resultado salvo", async () => {
    await request(app).post("/applications/staging/sync?fresh=1");

    expect(withCache).toHaveBeenCalledWith("sync:staging", config.syncCacheTtl, expect.any(Function), { fresh: true });
  });

  it("devolve o resultado em cache sem executar os health checks", async () => {
    const cached = [{ id: "x", name: "cached", status: "unhealthy", latencyMs: null }];
    withCache.mockResolvedValue(cached);

    const res = await request(app).post("/applications/production/sync");

    expect(res.body).toEqual(cached);
    expect(connect).not.toHaveBeenCalled();
    expect(checkHealth).not.toHaveBeenCalled();
  });

  it("loga o resumo da sincronização com a contagem por status", async () => {
    await request(app).post("/applications/production/sync");

    expect(log.info).toHaveBeenCalledWith("sync completed", {
      env: "production",
      fresh: false,
      apps: 2,
      healthy: 1,
      degraded: 1,
      unhealthy: 0,
      durationMs: expect.any(Number),
    });
  });

  it("devolve lista vazia e avisa quando o ambiente não tem aplicações", async () => {
    const res = await request(app).post("/applications/development/sync");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("no applications to check", { env: "development" });
  });

  it("responde 500 quando não consegue ler as aplicações do Mongo", async () => {
    connect.mockRejectedValue(new Error("mongo down"));

    const res = await request(app).post("/applications/production/sync");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "mongo down" });
    expect(log.error).toHaveBeenCalledWith("sync failed", expect.objectContaining({ env: "production" }));
  });

  it("responde 404 listando os ambientes válidos para um ambiente desconhecido, sem executar health checks", async () => {
    const res = await request(app).post("/applications/qa/sync");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'Environment "qa" not found. Valid values: development, staging, production',
    });
    expect(withCache).not.toHaveBeenCalled();
  });
});

describe("POST /applications/:env", () => {
  const body = { name: "billing", team: "pagamentos", healthCheckUrl: "http://billing/health", swaggerUrl: "http://billing/docs" };

  it("cria a aplicação, responde 201 com o id gerado e invalida os caches da lista e do /sync do ambiente", async () => {
    const res = await request(app).post("/applications/production").send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "64b0000000000000000000ff", ...body });
    expect(db.collections.applications_production.insertOne).toHaveBeenCalledWith(body);
    expect(invalidate).toHaveBeenCalledWith("apps:production");
    expect(invalidate).toHaveBeenCalledWith("sync:production");
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("usa swaggerUrl vazio quando ele não é enviado", async () => {
    const { swaggerUrl, ...withoutSwagger } = body;
    const res = await request(app).post("/applications/staging").send(withoutSwagger);

    expect(res.status).toBe(201);
    expect(res.body.swaggerUrl).toBe("");
  });

  it("grava só os campos conhecidos, descartando campos extras do corpo", async () => {
    await request(app).post("/applications/production").send({ ...body, admin: true });

    expect(db.collections.applications_production.insertOne).toHaveBeenCalledWith(body);
  });

  it("responde 400 com o erro de cada campo obrigatório que está faltando, sem acessar o Mongo", async () => {
    const res = await request(app).post("/applications/production").send({ name: "billing", team: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid application",
      fields: { team: "team is required", healthCheckUrl: "healthCheckUrl is required" },
    });
    expect(log.warn).toHaveBeenCalledWith("create application rejected: invalid fields", {
      env: "production",
      fields: ["team", "healthCheckUrl"],
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it("grava os valores sem os espaços nas pontas", async () => {
    const padded = { name: " billing ", team: " pagamentos ", healthCheckUrl: " http://billing/health ", swaggerUrl: " " };

    const res = await request(app).post("/applications/production").send(padded);

    expect(res.status).toBe(201);
    expect(db.collections.applications_production.insertOne).toHaveBeenCalledWith({
      name: "billing", team: "pagamentos", healthCheckUrl: "http://billing/health", swaggerUrl: "",
    });
  });

  it("rejeita operadores do Mongo no lugar de strings, sem gravar nada", async () => {
    const res = await request(app)
      .post("/applications/production")
      .send({ ...body, name: { $gt: "" }, team: { $where: "sleep(1000)" } });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ name: "name must be a string", team: "team must be a string" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejeita swaggerUrl com javascript:, que viraria o href do link no card", async () => {
    const res = await request(app).post("/applications/production").send({ ...body, swaggerUrl: "javascript:alert(1)" });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ swaggerUrl: "swaggerUrl must use http or https" });
  });

  it("não registra no log os valores rejeitados, só os nomes dos campos", async () => {
    await request(app).post("/applications/production").send({ ...body, name: "<script>segredo</script>" });

    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("segredo");
  });

  it("responde 400 em JSON quando o corpo é um JSON malformado", async () => {
    const res = await request(app)
      .post("/applications/production")
      .set("Content-Type", "application/json")
      .send('{"name": "billing",');

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: "Malformed JSON body" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("responde 400 quando o corpo JSON não é um objeto", async () => {
    const res = await request(app)
      .post("/applications/production")
      .set("Content-Type", "application/json")
      .send("[1, 2]");

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ body: "body must be a JSON object" });
  });

  it("responde 415 em JSON quando o charset do corpo não é suportado", async () => {
    const res = await request(app)
      .post("/applications/production")
      .set("Content-Type", "application/json; charset=latin1")
      .send(JSON.stringify(body));

    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: "Invalid request body" });
  });

  it("responde 413 quando o corpo passa de 10kb", async () => {
    const res = await request(app).post("/applications/production").send({ ...body, team: "a".repeat(11 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "Request body too large" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("responde 500 e não invalida o cache quando a inserção no Mongo falha", async () => {
    db.collection("applications_production").insertOne.mockRejectedValue(new Error("duplicate key"));

    const res = await request(app).post("/applications/production").send(body);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "duplicate key" });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("DELETE /applications/:env/:id", () => {
  it("remove a aplicação pelo ObjectId, responde 204 e invalida os caches da lista e do /sync", async () => {
    const res = await request(app).delete(`/applications/production/${ids.billing}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(db.collections.applications_production.deleteOne).toHaveBeenCalledWith({ _id: ids.billing });
    expect(invalidate).toHaveBeenCalledWith("apps:production");
    expect(invalidate).toHaveBeenCalledWith("sync:production");
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("responde 400 para um id que não é um ObjectId válido", async () => {
    const res = await request(app).delete("/applications/production/nao-e-um-id");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid id format" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("responde 400 para um id de 12 caracteres, que new ObjectId aceitaria", async () => {
    const res = await request(app).delete("/applications/production/aaaaaaaaaaaa");

    expect(res.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it("responde 404 e não invalida o cache quando a aplicação não existe", async () => {
    db.collection("applications_production").deleteOne.mockResolvedValue({ deletedCount: 0 });

    const res = await request(app).delete(`/applications/production/${ids.billing}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Application not found" });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("responde 500 quando a remoção no Mongo falha", async () => {
    db.collection("applications_production").deleteOne.mockRejectedValue(new Error("not primary"));

    const res = await request(app).delete(`/applications/production/${ids.billing}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "not primary" });
  });
});

describe("cache da lista de aplicações", () => {
  const cachedList = [
    { id: "cached-1", name: "cacheada", team: "cache", healthCheckUrl: "http://cacheada/health", swaggerUrl: "" },
  ];
  // Serves the application lists from the "cache"; other keys run their fn.
  const serveListsFromCache = () =>
    withCache.mockImplementation((key, ttl, fn) => (key.startsWith("apps:") ? Promise.resolve(cachedList) : fn()));

  it("GET /applications consulta cada ambiente pela chave apps:<env> com o TTL configurado", async () => {
    await request(app).get("/applications");

    for (const env of ["development", "staging", "production"]) {
      expect(withCache).toHaveBeenCalledWith(`apps:${env}`, config.appsCacheTtl, expect.any(Function));
    }
  });

  it("GET /applications devolve as listas em cache sem consultar o Mongo", async () => {
    serveListsFromCache();

    const res = await request(app).get("/applications");

    expect(res.body).toEqual({ development: cachedList, staging: cachedList, production: cachedList });
    expect(connect).not.toHaveBeenCalled();
  });

  it("POST /:env/sync verifica as URLs de health check da lista em cache, sem consultar o Mongo", async () => {
    serveListsFromCache();
    checkHealth.mockImplementation(async a => ({ id: a.id, name: a.name, status: "healthy", latencyMs: 10 }));

    const res = await request(app).post("/applications/production/sync");

    expect(res.body).toEqual([{ id: "cached-1", name: "cacheada", status: "healthy", latencyMs: 10 }]);
    expect(checkHealth).toHaveBeenCalledWith(expect.objectContaining({ healthCheckUrl: "http://cacheada/health" }), expect.anything());
    expect(withCache).toHaveBeenCalledWith("apps:production", config.appsCacheTtl, expect.any(Function));
    expect(connect).not.toHaveBeenCalled();
  });

  it("em cache miss lê a lista do Mongo e a entrega já serializada para ser guardada", async () => {
    await request(app).get("/applications");

    const fn = withCache.mock.calls.find(([key]) => key === "apps:staging")[2];
    await expect(fn()).resolves.toEqual([
      { id: ids.search.toString(), name: "search", team: "busca", healthCheckUrl: "http://search/health", swaggerUrl: "" },
    ]);
  });

  it("criar ou remover aplicação invalida só os caches do próprio ambiente", async () => {
    await request(app).post("/applications/staging").send({ name: "busca-api", team: "busca", healthCheckUrl: "http://busca/health" });
    await request(app).delete(`/applications/staging/${ids.search}`);

    expect(invalidate.mock.calls.map(([key]) => key)).toEqual([
      "apps:staging",
      "sync:staging",
      "apps:staging",
      "sync:staging",
    ]);
  });
});

describe("middlewares do app", () => {
  it("reflete a Origin da requisição nos cabeçalhos CORS", async () => {
    const res = await request(app).get("/applications").set("Origin", "http://localhost");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost");
    expect(res.headers["access-control-allow-methods"]).toBe("GET, POST, DELETE, OPTIONS");
    expect(res.headers["access-control-allow-headers"]).toBe("Content-Type");
    expect(res.headers.vary).toContain("Origin");
  });

  it("usa * como origem permitida quando a requisição não traz Origin", async () => {
    const res = await request(app).get("/applications");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("responde preflight OPTIONS com 204 sem chegar às rotas nem gerar log de request", async () => {
    const res = await request(app).options("/applications/production").set("Origin", "http://localhost");

    expect(res.status).toBe(204);
    expect(connect).not.toHaveBeenCalled();
    expect(requestLogLevel()).toBeUndefined();
  });

  it("registra cada request com método, caminho, status e duração", async () => {
    await request(app).get("/applications?x=1");

    expect(log.child).toHaveBeenCalledWith({ reqId: expect.stringMatching(/^[0-9a-f]{8}$/) });
    expect(log.info).toHaveBeenCalledWith("request completed", {
      method: "GET",
      path: "/applications?x=1",
      status: 200,
      durationMs: expect.any(Number),
    });
  });

  it.each([
    ["info", 200, () => request(app).get("/applications")],
    ["warn", 404, () => request(app).post("/applications/qa/sync")],
    ["error", 500, () => (connect.mockRejectedValue(new Error("x")), request(app).get("/applications"))],
  ])("loga o request em %s quando o status é %i", async (level, status, send) => {
    const res = await send();

    expect(res.status).toBe(status);
    expect(requestLogLevel()).toBe(level);
  });
});
