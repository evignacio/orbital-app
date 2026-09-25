const { loadFresh } = require("./helpers");

jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("../src/logger", () => require("./helpers").fakeLogger());

// In-memory stand-in for ioredis. The commands are shared by every instance so
// a test can script them before cache.js creates its (lazy) client.
jest.mock("ioredis", () => {
  const { EventEmitter } = require("events");
  class FakeRedis extends EventEmitter {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
      this.status = FakeRedis.initialStatus;
      this.get = FakeRedis.get;
      this.set = FakeRedis.set;
      this.del = FakeRedis.del;
      FakeRedis.instances.push(this);
    }
  }
  FakeRedis.instances = [];
  FakeRedis.initialStatus = "ready";
  FakeRedis.get = jest.fn().mockResolvedValue(null);
  FakeRedis.set = jest.fn().mockResolvedValue("OK");
  FakeRedis.del = jest.fn().mockResolvedValue(1);
  return FakeRedis;
});

// cache.js keeps its client, in-flight runs and generations at module level,
// so every test gets a fresh copy (and fresh mocks).
let cache;
let Redis;
let log;

beforeEach(() => {
  ({ cache, Redis, log } = loadFresh({ REDIS_URL: "redis://redis:6379" }, () => ({
    cache: require("../src/cache"),
    Redis: require("ioredis"),
    log: require("../src/logger"),
  })));
});

afterEach(() => {
  jest.useRealTimers();
});

const client = () => Redis.instances[0];

// Lets pending promise callbacks run.
const flush = () => new Promise(setImmediate);

// A promise resolved from outside, to hold fn() in progress.
function deferred() {
  let resolve;
  const promise = new Promise(res => (resolve = res));
  return { promise, resolve };
}

describe("withCache", () => {
  it("cria um único cliente Redis com a URL configurada, sem fila offline e com prefixo orbital:", async () => {
    await cache.withCache("k", 13, async () => 1);
    await cache.withCache("k", 13, async () => 1);

    expect(Redis.instances).toHaveLength(1);
    expect(client().url).toBe("redis://redis:6379");
    expect(client().options).toEqual({ enableOfflineQueue: false, keyPrefix: "orbital:" });
  });

  it("em cache hit devolve o valor salvo no Redis sem executar a função", async () => {
    Redis.get.mockResolvedValue(JSON.stringify([{ id: "a1", status: "healthy" }]));
    const fn = jest.fn();

    await expect(cache.withCache("sync:production", 13, fn)).resolves.toEqual([{ id: "a1", status: "healthy" }]);
    expect(Redis.get).toHaveBeenCalledWith("sync:production");
    expect(fn).not.toHaveBeenCalled();
  });

  it("em cache miss executa a função e grava o resultado em JSON com expiração (EX ttl)", async () => {
    const result = [{ id: "a1", status: "degraded" }];

    await expect(cache.withCache("sync:staging", 13, async () => result)).resolves.toBe(result);
    expect(Redis.set).toHaveBeenCalledWith("sync:staging", JSON.stringify(result), "EX", 13);
  });

  it("com ttl 0 não lê nem grava no Redis, apenas executa a função", async () => {
    await expect(cache.withCache("k", 0, async () => "v")).resolves.toBe("v");
    expect(Redis.get).not.toHaveBeenCalled();
    expect(Redis.set).not.toHaveBeenCalled();
  });

  it("com fresh: true ignora o valor em cache mas grava o novo resultado", async () => {
    Redis.get.mockResolvedValue(JSON.stringify("antigo"));

    await expect(cache.withCache("k", 13, async () => "novo", { fresh: true })).resolves.toBe("novo");
    expect(Redis.get).not.toHaveBeenCalled();
    expect(Redis.set).toHaveBeenCalledWith("k", JSON.stringify("novo"), "EX", 13);
  });

  it("chamadas simultâneas na mesma chave compartilham uma única execução (single-flight)", async () => {
    const d = deferred();
    const fn = jest.fn(() => d.promise);

    const first = cache.withCache("k", 13, fn);
    const second = cache.withCache("k", 13, fn);
    const fresh = cache.withCache("k", 13, fn, { fresh: true });
    await flush();
    d.resolve("resultado");

    await expect(Promise.all([first, second, fresh])).resolves.toEqual(["resultado", "resultado", "resultado"]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(Redis.set).toHaveBeenCalledTimes(1);
  });

  it("chaves diferentes executam de forma independente", async () => {
    const fn = jest.fn(async () => "v");
    await Promise.all([cache.withCache("a", 0, fn), cache.withCache("b", 0, fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("depois que uma execução termina, a próxima chamada executa a função de novo", async () => {
    const fn = jest.fn(async () => "v");
    await cache.withCache("k", 0, fn);
    await cache.withCache("k", 0, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("propaga o erro da função e libera a chave para a próxima tentativa", async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error("mongo down")).mockResolvedValueOnce("ok");

    await expect(cache.withCache("k", 13, fn)).rejects.toThrow("mongo down");
    expect(Redis.set).not.toHaveBeenCalled();
    await expect(cache.withCache("k", 13, fn)).resolves.toBe("ok");
  });

  it("trata falha de leitura no Redis como cache miss e loga um aviso", async () => {
    const err = new Error("READONLY");
    Redis.get.mockRejectedValue(err);

    await expect(cache.withCache("k", 13, async () => "v")).resolves.toBe("v");
    expect(log.warn).toHaveBeenCalledWith("cache operation failed", { op: "read", key: "k", err });
  });

  it("ignora falha de gravação no Redis e ainda devolve o resultado", async () => {
    const err = new Error("OOM");
    Redis.set.mockRejectedValue(err);

    await expect(cache.withCache("k", 13, async () => "v")).resolves.toBe("v");
    expect(log.warn).toHaveBeenCalledWith("cache operation failed", { op: "write", key: "k", err });
  });

  it("trata um valor em cache ilegível (JSON inválido) como cache miss", async () => {
    Redis.get.mockResolvedValue("{quebrado");
    await expect(cache.withCache("k", 13, async () => "v")).resolves.toBe("v");
  });
});

describe("invalidate", () => {
  it("apaga a chave no Redis", async () => {
    await cache.invalidate("sync:production");
    expect(Redis.del).toHaveBeenCalledWith("sync:production");
  });

  it("impede que uma execução iniciada antes grave seu resultado desatualizado", async () => {
    const d = deferred();
    const run = cache.withCache("k", 13, () => d.promise);
    await flush();

    await cache.invalidate("k");
    d.resolve("desatualizado");

    await expect(run).resolves.toBe("desatualizado");
    expect(Redis.set).not.toHaveBeenCalled();
  });

  it("faz a próxima chamada iniciar uma nova execução em vez de reaproveitar a antiga", async () => {
    const old = deferred();
    const stale = cache.withCache("k", 13, () => old.promise);
    await flush();
    await cache.invalidate("k");

    const fn = jest.fn(async () => "novo");
    await expect(cache.withCache("k", 13, fn)).resolves.toBe("novo");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(Redis.set).toHaveBeenCalledWith("k", JSON.stringify("novo"), "EX", 13);

    old.resolve("antigo");
    await stale;
    expect(Redis.set).toHaveBeenCalledTimes(1);
  });

  it("não lança exceção quando o Redis falha ao apagar a chave", async () => {
    const err = new Error("connection lost");
    Redis.del.mockRejectedValue(err);

    await expect(cache.invalidate("k")).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith("cache operation failed", { op: "invalidate", key: "k", err });
  });
});

describe("conexão com o Redis", () => {
  it("enquanto conecta, espera o evento ready antes de enviar o comando", async () => {
    Redis.initialStatus = "connecting";
    const run = cache.withCache("k", 13, async () => "v");
    await flush();
    expect(Redis.get).not.toHaveBeenCalled();

    client().status = "ready";
    client().emit("ready");

    await expect(run).resolves.toBe("v");
    expect(Redis.get).toHaveBeenCalledWith("k");
    expect(client().listenerCount("close")).toBe(0);
  });

  it("falha rápido e segue sem cache quando a tentativa de conexão fecha", async () => {
    Redis.initialStatus = "connect";
    const run = cache.withCache("k", 13, async () => "v");
    await flush();

    // As in ioredis: the failed attempt leaves the client reconnecting.
    client().status = "reconnecting";
    client().emit("close");

    await expect(run).resolves.toBe("v");
    expect(Redis.get).not.toHaveBeenCalled();
    expect(client().listenerCount("ready")).toBe(1); // only cache.js's own listener remains
  });

  it("desiste de esperar após 1 segundo, na leitura e na gravação, e segue sem cache", async () => {
    jest.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    Redis.initialStatus = "connecting";
    const fn = jest.fn(async () => "v");
    const run = cache.withCache("k", 13, fn);

    await jest.advanceTimersByTimeAsync(999);
    expect(fn).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);

    // The write waits for the connection again before giving up.
    await jest.advanceTimersByTimeAsync(1000);
    await expect(run).resolves.toBe("v");
    expect(Redis.get).not.toHaveBeenCalled();
    expect(Redis.set).not.toHaveBeenCalled();
    const notReady = expect.objectContaining({ message: "Redis not ready" });
    expect(log.warn).toHaveBeenCalledWith("cache operation failed", { op: "read", key: "k", err: notReady });
    expect(log.warn).toHaveBeenCalledWith("cache operation failed", { op: "write", key: "k", err: notReady });
  });

  it("loga a queda do Redis só na transição e volta a logar após reconectar", async () => {
    await cache.withCache("k", 13, async () => "v");
    const err = new Error("ECONNREFUSED");

    client().emit("error", err);
    client().emit("error", err);
    expect(log.warn.mock.calls.filter(([msg]) => msg === "redis unavailable, sync cache bypassed")).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledWith("redis unavailable, sync cache bypassed", {
      url: "redis://redis:6379",
      err,
    });

    client().emit("ready");
    expect(log.info).toHaveBeenCalledWith("redis connected", { url: "redis://redis:6379" });

    client().emit("error", err);
    expect(log.warn.mock.calls.filter(([msg]) => msg === "redis unavailable, sync cache bypassed")).toHaveLength(2);
  });

  it("com o Redis fora do ar, não loga cada operação de cache que falha", async () => {
    await cache.invalidate("x"); // creates the client
    client().emit("error", new Error("down"));
    log.warn.mockClear();
    Redis.get.mockRejectedValue(new Error("Stream isn't writeable"));

    await expect(cache.withCache("k", 13, async () => "v")).resolves.toBe("v");
    expect(log.warn).not.toHaveBeenCalled();
  });
});
