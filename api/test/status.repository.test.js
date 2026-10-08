jest.mock("../src/utils/cache", () => ({ withRedis: jest.fn() }));

const { withRedis } = require("../src/utils/cache");
const store = require("../src/repositories/status.repository");

// Redis double: withRedis runs fn against it, like the real one.
const redis = {
  hgetall: jest.fn(),
  hset: jest.fn(),
  hdel: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};

beforeEach(() => {
  // restoreMocks resets implementations between tests, so it is set up here.
  withRedis.mockImplementation(async (op, key, fn, fallback) => {
    try {
      return await fn(redis);
    } catch {
      return fallback;
    }
  });
});

describe("getStatuses", () => {
  it("lê o hash status:<env> e faz o parse de cada entrada", async () => {
    redis.hgetall.mockResolvedValue({
      a1: JSON.stringify({ status: "healthy", latencyMs: 120, checkedAt: "2026-10-05T14:32:00.000Z" }),
      a2: JSON.stringify({ status: "degraded", latencyMs: 3412, limitMs: 3000, checkedAt: "2026-10-05T14:32:01.000Z" }),
    });

    await expect(store.getStatuses("production")).resolves.toEqual({
      a1: { status: "healthy", latencyMs: 120, checkedAt: "2026-10-05T14:32:00.000Z" },
      a2: { status: "degraded", latencyMs: 3412, limitMs: 3000, checkedAt: "2026-10-05T14:32:01.000Z" },
    });
    expect(redis.hgetall).toHaveBeenCalledWith("status:production");
  });

  it("descarta a entrada com JSON inválido e mantém as demais", async () => {
    redis.hgetall.mockResolvedValue({
      a1: "{quebrado",
      a2: JSON.stringify({ status: "healthy" }),
      a3: "null",
    });

    await expect(store.getStatuses("staging")).resolves.toEqual({ a2: { status: "healthy" } });
  });

  it("devolve {} quando o Redis falha", async () => {
    redis.hgetall.mockRejectedValue(new Error("down"));

    await expect(store.getStatuses("staging")).resolves.toEqual({});
  });
});

describe("setStatus", () => {
  it("grava a entrada em JSON no hash status:<env> sob o id da aplicação", async () => {
    const entry = { status: "healthy", latencyMs: 90, checkedAt: "2026-10-05T14:32:00.000Z" };

    await store.setStatus("development", "a1", entry);

    expect(redis.hset).toHaveBeenCalledWith("status:development", "a1", JSON.stringify(entry));
  });

  it("não rejeita quando o Redis falha", async () => {
    redis.hset.mockRejectedValue(new Error("down"));

    await expect(store.setStatus("development", "a1", { status: "healthy" })).resolves.toBeUndefined();
  });
});

describe("removeStatuses", () => {
  it("remove os ids do hash status:<env>", async () => {
    await store.removeStatuses("production", ["a1", "a2"]);

    expect(redis.hdel).toHaveBeenCalledWith("status:production", "a1", "a2");
  });

  it("com lista vazia não chama o Redis", async () => {
    await store.removeStatuses("production", []);

    expect(withRedis).not.toHaveBeenCalled();
    expect(redis.hdel).not.toHaveBeenCalled();
  });

  it("não rejeita quando o Redis falha", async () => {
    redis.hdel.mockRejectedValue(new Error("down"));

    await expect(store.removeStatuses("production", ["a1"])).resolves.toBeUndefined();
  });
});

describe("getCycle", () => {
  it("lê a chave cycle:<env> e faz o parse do JSON", async () => {
    const cycle = { env: "production", trigger: "scheduled", checked: 4 };
    redis.get.mockResolvedValue(JSON.stringify(cycle));

    await expect(store.getCycle("production")).resolves.toEqual(cycle);
    expect(redis.get).toHaveBeenCalledWith("cycle:production");
  });

  it("devolve null quando não há ciclo gravado ou o JSON é inválido", async () => {
    redis.get.mockResolvedValueOnce(null);
    await expect(store.getCycle("production")).resolves.toBeNull();

    redis.get.mockResolvedValueOnce("{quebrado");
    await expect(store.getCycle("production")).resolves.toBeNull();
  });

  it("devolve null quando o Redis falha", async () => {
    redis.get.mockRejectedValue(new Error("down"));

    await expect(store.getCycle("production")).resolves.toBeNull();
  });
});

describe("setCycle", () => {
  it("grava o ciclo em JSON em cycle:<env>, sem expiração", async () => {
    const cycle = { env: "staging", trigger: "manual", checked: 2 };

    await store.setCycle("staging", cycle);

    expect(redis.set).toHaveBeenCalledWith("cycle:staging", JSON.stringify(cycle));
  });

  it("não rejeita quando o Redis falha", async () => {
    redis.set.mockRejectedValue(new Error("down"));

    await expect(store.setCycle("staging", {})).resolves.toBeUndefined();
  });
});
