const http = require("http");
const request = require("supertest");

jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("../src/utils/logger", () => require("./helpers").fakeLogger());
jest.mock("../src/config/database", () => ({ connect: jest.fn() }));
// The repository exports a class instance: spreading it would not copy the
// prototype methods, so the real ones are bound to the actual instance.
jest.mock("../src/repositories/applications.repository", () => {
  const actual = jest.requireActual("../src/repositories/applications.repository");
  return {
    toCollection: actual.toCollection.bind(actual),
    serialize: actual.serialize.bind(actual),
    create: actual.create.bind(actual),
    remove: actual.remove.bind(actual),
    list: jest.fn(),
    invalidate: jest.fn(),
  };
});
jest.mock("../src/repositories/status.repository", () => ({ getStatuses: jest.fn(), getCycle: jest.fn(), removeStatuses: jest.fn() }));
jest.mock("../src/services/scheduler.service", () => ({ force: jest.fn(), forget: jest.fn(), nextCheckAt: jest.fn() }));

const app = require("../src/app");
const log = require("../src/utils/logger");
const events = require("../src/services/events.service");
const { list: listApps } = require("../src/repositories/applications.repository");
const { getStatuses, getCycle } = require("../src/repositories/status.repository");
const scheduler = require("../src/services/scheduler.service");

const next = { development: "2026-10-05T14:00:20.000Z", staging: "2026-10-05T14:00:10.000Z", production: "2026-10-05T14:00:00.000Z" };
const cycle = { env: "production", trigger: "scheduled", checked: 2, changed: 0 };
const statusEvent = (id, status = "healthy") => ({ id, name: id, env: "production", status, latencyMs: 40, checkedAt: "2026-10-05T14:00:05.000Z" });

let server;
let controllers;

beforeEach(async () => {
  controllers = [];
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  listApps.mockImplementation(async env =>
    env === "production"
      ? [
          { id: "p1", name: "billing", team: "pagamentos", healthCheckUrl: "http://billing/health", swaggerUrl: "" },
          { id: "p2", name: "auth", team: "identidade", healthCheckUrl: "http://auth/health", swaggerUrl: "" },
        ]
      : []
  );
  getStatuses.mockImplementation(async env =>
    env === "production" ? { p1: { status: "degraded", latencyMs: 3412, limitMs: 3000, checkedAt: "2026-10-05T13:59:30.000Z" } } : {}
  );
  getCycle.mockImplementation(async env => (env === "production" ? cycle : null));
  scheduler.nextCheckAt.mockImplementation(env => next[env]);
});

afterEach(async () => {
  controllers.forEach(c => c.abort());
  events.closeAll();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

// Opens the stream and accumulates what arrives. wait(predicate) resolves when
// the accumulated text satisfies it.
async function connect(query = "") {
  const controller = new AbortController();
  controllers.push(controller);
  const res = await fetch(`http://127.0.0.1:${server.address().port}/applications/events${query}`, { signal: controller.signal });
  const stream = { res, text: "", abort: () => controller.abort() };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        stream.text += decoder.decode(value, { stream: true });
      }
    } catch {
      // aborted
    }
  })();
  stream.wait = async (predicate = () => true, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate(stream.text)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting; received:\n${stream.text}`);
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  };
  stream.pump = pump;
  return stream;
}

// Parsed "event: x / data: {...}" messages of the text.
const messages = text =>
  text
    .split("\n\n")
    .filter(block => block.startsWith("event: "))
    .map(block => {
      const [type, data] = block.split("\n");
      return { type: type.slice(7), data: JSON.parse(data.slice(6)) };
    });

const snapshotsReceived = text => messages(text).filter(m => m.type === "snapshot").length;

describe("GET /applications/events", () => {
  it("responde com os cabeçalhos de event-stream sem buffer e sem cache", async () => {
    const stream = await connect();

    expect(stream.res.status).toBe(200);
    expect(stream.res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(stream.res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(stream.res.headers.get("connection")).toBe("keep-alive");
    expect(stream.res.headers.get("x-accel-buffering")).toBe("no");
    expect(stream.res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("começa com retry: 3000 e manda um snapshot por ambiente, na ordem de ENVIRONMENTS", async () => {
    const stream = await connect();
    await stream.wait(() => snapshotsReceived(stream.text) === 3);

    expect(stream.text.startsWith("retry: 3000\n\n")).toBe(true);
    expect(messages(stream.text).map(m => [m.type, m.data.env])).toEqual([
      ["snapshot", "development"],
      ["snapshot", "staging"],
      ["snapshot", "production"],
    ]);
  });

  it("cruza a lista de apps com o último status, e usa null para app nunca verificada", async () => {
    const stream = await connect();
    await stream.wait(() => snapshotsReceived(stream.text) === 3);

    const production = messages(stream.text).find(m => m.data.env === "production").data;
    expect(production).toEqual({
      env: "production",
      apps: [
        { id: "p1", name: "billing", env: "production", status: "degraded", latencyMs: 3412, limitMs: 3000, checkedAt: "2026-10-05T13:59:30.000Z" },
        { id: "p2", name: "auth", env: "production", status: null, latencyMs: null, checkedAt: null },
      ],
      cycle,
      nextCheckAt: next.production,
    });
    const staging = messages(stream.text).find(m => m.data.env === "staging").data;
    expect(staging).toEqual({ env: "staging", apps: [], cycle: null, nextCheckAt: next.staging });
  });

  it("entrega os status e cycle publicados depois do snapshot", async () => {
    const stream = await connect();
    await stream.wait(() => snapshotsReceived(stream.text) === 3);
    await stream.wait(() => events.clientCount() === 1);

    events.publish({ type: "status", changed: false, data: statusEvent("p1") });
    events.publish({ type: "cycle", data: cycle });
    await stream.wait(text => messages(text).some(m => m.type === "cycle"));

    expect(messages(stream.text).slice(3)).toEqual([
      { type: "status", data: statusEvent("p1") },
      { type: "cycle", data: cycle },
    ]);
  });

  it("o que é publicado enquanto os snapshots são montados sai logo depois deles, sem se perder", async () => {
    let release;
    const gate = new Promise(resolve => (release = resolve));
    listApps.mockImplementation(async () => {
      await gate;
      return [];
    });
    const stream = await connect();
    await stream.wait(() => events.clientCount() === 1); // assinado antes de os snapshots ficarem prontos

    events.publish({ type: "status", changed: true, data: statusEvent("p1") });
    events.publish({ type: "cycle", data: cycle });
    expect(messages(stream.text)).toEqual([]);

    release();
    await stream.wait(text => messages(text).some(m => m.type === "cycle"));

    expect(messages(stream.text).map(m => m.type)).toEqual(["snapshot", "snapshot", "snapshot", "status", "cycle"]);
  });

  it("monta os snapshots dos três ambientes em paralelo", async () => {
    let inFlight = 0;
    let peak = 0;
    listApps.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise(resolve => setTimeout(resolve, 20));
      inFlight--;
      return [];
    });
    const stream = await connect();
    await stream.wait(() => snapshotsReceived(stream.text) === 3);

    expect(peak).toBe(3);
    expect(messages(stream.text).map(m => m.data.env)).toEqual(["development", "staging", "production"]);
  });

  it("?changes=true filtra os status sem mudança, mas mantém snapshot e cycle", async () => {
    const stream = await connect("?changes=true");
    await stream.wait(() => snapshotsReceived(stream.text) === 3);
    await stream.wait(() => events.clientCount() === 1);

    events.publish({ type: "status", changed: false, data: statusEvent("p1") });
    events.publish({ type: "status", changed: true, data: statusEvent("p2", "unhealthy") });
    events.publish({ type: "cycle", data: cycle });
    await stream.wait(text => messages(text).some(m => m.type === "cycle"));

    expect(messages(stream.text).slice(3)).toEqual([
      { type: "status", data: statusEvent("p2", "unhealthy") },
      { type: "cycle", data: cycle },
    ]);
  });

  it("?changes=false entrega todo check, como sem o parâmetro", async () => {
    const stream = await connect("?changes=false");
    await stream.wait(() => events.clientCount() === 1);

    events.publish({ type: "status", changed: false, data: statusEvent("p1") });
    await stream.wait(text => messages(text).some(m => m.type === "status"));

    expect(messages(stream.text).filter(m => m.type === "status")).toHaveLength(1);
  });

  it("?changes com valor inválido responde 400 em JSON, sem abrir o stream", async () => {
    const res = await request(app).get("/applications/events?changes=x");

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: "Invalid changes parameter. Valid values: true, false" });
    expect(events.clientCount()).toBe(0);
  });

  it("?changes repetido também é rejeitado", async () => {
    const res = await request(app).get("/applications/events?changes=true&changes=false");

    expect(res.status).toBe(400);
  });

  it("quando o cliente fecha a conexão, deixa de assinar os eventos", async () => {
    const stream = await connect();
    await stream.wait(() => events.clientCount() === 1);

    stream.abort();

    await expect(waitUntil(() => events.clientCount() === 0)).resolves.toBeUndefined();
  });

  it("se o cliente sai antes de os snapshots terminarem, não fica assinado", async () => {
    let release;
    listApps.mockImplementation(() => new Promise(resolve => (release = () => resolve([]))));
    const stream = await connect();
    await waitUntil(() => release !== undefined);

    stream.abort();
    await new Promise(resolve => setTimeout(resolve, 20));
    release();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(events.clientCount()).toBe(0);
  });

  it("falha ao montar o snapshot de um ambiente manda esse snapshot vazio, loga error e mantém o stream aberto", async () => {
    const err = new Error("mongo down");
    listApps.mockImplementation(async env => {
      if (env === "staging") throw err;
      return [];
    });
    const stream = await connect();
    await stream.wait(() => snapshotsReceived(stream.text) === 3);

    expect(messages(stream.text).find(m => m.data.env === "staging").data).toEqual({
      env: "staging",
      apps: [],
      cycle: null,
      nextCheckAt: next.staging,
    });
    expect(log.error).toHaveBeenCalledWith("events snapshot failed", { env: "staging", err });
    await stream.wait(() => events.clientCount() === 1);
  });

  // The real fetch client uses timers too, so only the route's 15 s interval is
  // captured; the test fires it by hand instead of faking the clock.
  const spyHeartbeat = () => {
    const realSetInterval = global.setInterval;
    const realClearInterval = global.clearInterval;
    const heartbeat = { callback: null, handle: null, cleared: false };
    jest.spyOn(global, "setInterval").mockImplementation((callback, ms, ...args) => {
      const handle = realSetInterval(callback, ms, ...args);
      if (ms === 15000) Object.assign(heartbeat, { callback, handle });
      return handle;
    });
    jest.spyOn(global, "clearInterval").mockImplementation(handle => {
      if (handle === heartbeat.handle) heartbeat.cleared = true;
      return realClearInterval(handle);
    });
    return heartbeat;
  };

  it("agenda um comentário : ping a cada 15 s para manter a conexão viva", async () => {
    const heartbeat = spyHeartbeat();
    const stream = await connect();
    await stream.wait(() => snapshotsReceived(stream.text) === 3);
    expect(stream.text).not.toContain(": ping");

    heartbeat.callback();

    await stream.wait(text => text.endsWith(": ping\n\n"));
  });

  it("para o heartbeat quando a conexão fecha", async () => {
    const heartbeat = spyHeartbeat();
    const stream = await connect();
    await stream.wait(() => events.clientCount() === 1);
    expect(heartbeat.cleared).toBe(false);

    stream.abort();
    await waitUntil(() => events.clientCount() === 0);

    expect(heartbeat.cleared).toBe(true);
  });
});

async function waitUntil(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitUntil: timed out");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
