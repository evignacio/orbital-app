const http = require("http");
const request = require("supertest");
const { ObjectId } = require("mongodb");

jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("../src/utils/logger", () => require("./helpers").fakeLogger());
jest.mock("../src/config/database", () => ({ connect: jest.fn() }));
// withCache runs the check straight away; caching has its own tests.
jest.mock("../src/utils/cache", () => ({
  withCache: jest.fn((key, ttl, fn) => fn()),
  invalidate: jest.fn(),
}));
jest.mock("../src/repositories/status.repository", () => ({
  getStatuses: jest.fn(),
  getCycle: jest.fn(),
  removeStatuses: jest.fn(),
}));
// The scheduler has its own tests; the routes only call force().
jest.mock("../src/services/scheduler.service", () => ({ force: jest.fn(), forget: jest.fn(), nextCheckAt: jest.fn() }));

const app = require("../src/app");
const config = require("../src/config");
const log = require("../src/utils/logger");
const { connect } = require("../src/config/database");
const { withCache, invalidate } = require("../src/utils/cache");
const { getStatuses, getCycle, removeStatuses } = require("../src/repositories/status.repository");
const scheduler = require("../src/services/scheduler.service");

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
  removeStatuses.mockResolvedValue();
  getStatuses.mockResolvedValue({});
  getCycle.mockResolvedValue(null);
});

// Polls until predicate() is true (events that happen on the server after the client acts).
async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor: timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

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

  it("responde 500 sem expor a mensagem interna quando o Mongo está indisponível, e loga o erro uma única vez", async () => {
    connect.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const res = await request(app).get("/applications");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal error" });
    expect(log.error).toHaveBeenCalledWith("list applications failed", { err: expect.any(Error) });
    expect(log.error).not.toHaveBeenCalledWith("unhandled error", expect.anything());
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
  const started = {
    env: "production",
    trigger: "manual",
    startedAt: "2026-10-05T14:32:07.120Z",
    nextCheckAt: "2026-10-05T14:33:00.000Z",
    joined: false,
  };

  beforeEach(() => {
    scheduler.force.mockReturnValue(started);
  });

  it("força um ciclo no agendador e responde 202 na hora com o corpo dele", async () => {
    const res = await request(app).post("/applications/production/sync");

    expect(res.status).toBe(202);
    expect(res.body).toEqual(started);
    expect(scheduler.force).toHaveBeenCalledWith("production");
  });

  it("devolve joined: true quando o ciclo em andamento foi reaproveitado", async () => {
    scheduler.force.mockReturnValue({ ...started, trigger: "scheduled", joined: true });

    const res = await request(app).post("/applications/production/sync");

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ trigger: "scheduled", joined: true });
  });

  it("ignora a query string (?fresh deixou de existir)", async () => {
    const res = await request(app).post("/applications/staging/sync?fresh=1");

    expect(res.status).toBe(202);
    expect(scheduler.force).toHaveBeenCalledWith("staging");
  });

  it("não consulta cache nem Mongo: os resultados saem pelo SSE", async () => {
    await request(app).post("/applications/production/sync");

    expect(withCache).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("responde 404 listando os ambientes válidos para um ambiente desconhecido, sem forçar ciclo", async () => {
    const res = await request(app).post("/applications/qa/sync");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'Environment "qa" not found. Valid values: development, staging, production',
    });
    expect(scheduler.force).not.toHaveBeenCalled();
  });
});

describe("POST /applications/:env", () => {
  const body = { name: "billing", team: "pagamentos", healthCheckUrl: "http://billing/health", swaggerUrl: "http://billing/docs" };

  it("cria a aplicação, responde 201 com o id gerado e invalida o cache da lista do ambiente", async () => {
    const res = await request(app).post("/applications/production").send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "64b0000000000000000000ff", ...body });
    expect(db.collections.applications_production.insertOne).toHaveBeenCalledWith(body);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("apps:production");
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
    expect(res.body).toEqual({ error: "Internal error" });
    expect(invalidate).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith("create application failed", { env: "production", name: "billing", err: expect.any(Error) });
    expect(log.error).not.toHaveBeenCalledWith("unhandled error", expect.anything());
  });
});

describe("DELETE /applications/:env/:id", () => {
  it("remove a aplicação pelo ObjectId, responde 204, invalida a lista e apaga o último status dela", async () => {
    const res = await request(app).delete(`/applications/production/${ids.billing}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(db.collections.applications_production.deleteOne).toHaveBeenCalledWith({ _id: ids.billing });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("apps:production");
    expect(removeStatuses).toHaveBeenCalledWith("production", [ids.billing.toString()]);
  });

  it("avisa o agendador para descartar um check dessa aplicação que esteja em andamento", async () => {
    await request(app).delete(`/applications/production/${ids.billing}`);

    expect(scheduler.forget).toHaveBeenCalledWith("production", ids.billing.toString());
  });

  it("avisa o agendador logo após a remoção, antes de invalidar o cache e apagar o status", async () => {
    await request(app).delete(`/applications/production/${ids.billing}`);

    const [forgetAt] = scheduler.forget.mock.invocationCallOrder;
    expect(forgetAt).toBeLessThan(invalidate.mock.invocationCallOrder[0]);
    expect(forgetAt).toBeLessThan(removeStatuses.mock.invocationCallOrder[0]);
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
    expect(removeStatuses).not.toHaveBeenCalled();
    expect(scheduler.forget).not.toHaveBeenCalled();
  });

  it("responde 500 quando a remoção no Mongo falha", async () => {
    db.collection("applications_production").deleteOne.mockRejectedValue(new Error("not primary"));

    const res = await request(app).delete(`/applications/production/${ids.billing}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal error" });
    expect(log.error).toHaveBeenCalledWith("delete application failed", {
      env: "production",
      id: ids.billing.toString(),
      err: expect.any(Error),
    });
    expect(scheduler.forget).not.toHaveBeenCalled();
  });
});

describe("cache da lista de aplicações", () => {
  const cachedList = [
    { id: "cached-1", name: "cacheada", team: "cache", healthCheckUrl: "http://cacheada/health", swaggerUrl: "" },
  ];
  // Serves the application lists from the "cache".
  const serveListsFromCache = () => withCache.mockImplementation(() => Promise.resolve(cachedList));

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

  it("em cache miss lê a lista do Mongo e a entrega já serializada para ser guardada", async () => {
    await request(app).get("/applications");

    const fn = withCache.mock.calls.find(([key]) => key === "apps:staging")[2];
    await expect(fn()).resolves.toEqual([
      { id: ids.search.toString(), name: "search", team: "busca", healthCheckUrl: "http://search/health", swaggerUrl: "" },
    ]);
  });

  it("criar ou remover aplicação invalida só o cache da lista do próprio ambiente", async () => {
    await request(app).post("/applications/staging").send({ name: "busca-api", team: "busca", healthCheckUrl: "http://busca/health" });
    await request(app).delete(`/applications/staging/${ids.search}`);

    expect(invalidate.mock.calls.map(([key]) => key)).toEqual(["apps:staging", "apps:staging"]);
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

  it("loga uma única linha por request também quando o cliente aborta a conexão (evento close)", async () => {
    const server = http.createServer(app).listen(0);
    try {
      const { port } = server.address();
      const controller = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/applications/events`, { signal: controller.signal });
      await res.body.getReader().read(); // the stream is open
      controller.abort();
      await waitFor(() => log.info.mock.calls.some(([msg]) => msg === "request completed"));
    } finally {
      await new Promise(resolve => server.close(resolve));
    }

    expect(log.info.mock.calls.filter(([msg]) => msg === "request completed")).toHaveLength(1);
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
