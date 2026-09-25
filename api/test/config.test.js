const { loadFresh } = require("./helpers");

// Keeps api/.env out of the tests: only the variables each test sets count.
jest.mock("dotenv", () => ({ config: jest.fn() }));

const loadConfig = env => loadFresh(env, () => require("../src/config"));

describe("config", () => {
  it("aplica os valores padrão quando nenhuma variável de ambiente está definida", () => {
    expect(loadConfig({})).toEqual({
      port: 3001,
      mongoUrl: "mongodb://localhost:27017",
      mongoUser: undefined,
      mongoPass: undefined,
      mongoDb: undefined,
      redisUrl: "redis://localhost:6379",
      syncCacheTtl: 13,
      appsCacheTtl: 7200,
      healthCheckConcurrency: 10,
      healthCheckTimeoutMs: 5000,
      degradedLatencyMs: 3000,
    });
  });

  it("lê as variáveis de texto removendo espaços nas pontas", () => {
    const config = loadConfig({
      MONGO_URL: "  mongodb://mongo:27017/orbital ",
      MONGO_USER: " admin",
      MONGO_PASS: "secret ",
      MONGO_DB: " orbital_test ",
      REDIS_URL: " redis://redis:6379 ",
    });
    expect(config.mongoUrl).toBe("mongodb://mongo:27017/orbital");
    expect(config.mongoUser).toBe("admin");
    expect(config.mongoPass).toBe("secret");
    expect(config.mongoDb).toBe("orbital_test");
    expect(config.redisUrl).toBe("redis://redis:6379");
  });

  it("trata variável vazia ou só com espaços como não definida e usa o padrão", () => {
    const config = loadConfig({ MONGO_URL: "", REDIS_URL: "   ", PORT: " " });
    expect(config.mongoUrl).toBe("mongodb://localhost:27017");
    expect(config.redisUrl).toBe("redis://localhost:6379");
    expect(config.port).toBe(3001);
  });

  it("converte variáveis inteiras válidas para number", () => {
    const config = loadConfig({
      PORT: "8080",
      SYNC_CACHE_TTL: " 30 ",
      APPS_CACHE_TTL: "3600",
      HEALTH_CHECK_CONCURRENCY: "4",
      HEALTH_CHECK_TIMEOUT_MS: "1500",
      DEGRADED_LATENCY_MS: "800",
    });
    expect(config).toMatchObject({
      port: 8080,
      syncCacheTtl: 30,
      appsCacheTtl: 3600,
      healthCheckConcurrency: 4,
      healthCheckTimeoutMs: 1500,
      degradedLatencyMs: 800,
    });
  });

  it("aceita SYNC_CACHE_TTL=0, que desliga o cache do Redis", () => {
    expect(loadConfig({ SYNC_CACHE_TTL: "0" }).syncCacheTtl).toBe(0);
  });

  it("usa 2 horas (7200 s) como TTL padrão do cache da lista de aplicações e aceita 0 para desligá-lo", () => {
    expect(loadConfig({}).appsCacheTtl).toBe(7200);
    expect(loadConfig({ APPS_CACHE_TTL: "0" }).appsCacheTtl).toBe(0);
  });

  it.each([
    ["PORT", "abc"],
    ["SYNC_CACHE_TTL", "1.5"],
    ["HEALTH_CHECK_TIMEOUT_MS", "5s"],
    ["DEGRADED_LATENCY_MS", "1e3"],
  ])("rejeita %s=%s por não ser um inteiro, citando a variável no erro", (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(`Invalid ${name}="${value}"`);
  });

  it.each([
    ["PORT", "0", 1],
    ["SYNC_CACHE_TTL", "-1", 0],
    ["APPS_CACHE_TTL", "-1", 0],
    ["HEALTH_CHECK_CONCURRENCY", "0", 1],
    ["HEALTH_CHECK_TIMEOUT_MS", "0", 1],
    ["DEGRADED_LATENCY_MS", "-5", 1],
  ])("rejeita %s=%s por estar abaixo do mínimo %i", (name, value, min) => {
    expect(() => loadConfig({ [name]: value })).toThrow(`expected an integer >= ${min}`);
  });

  it("devolve um objeto congelado, que não pode ser alterado em tempo de execução", () => {
    const config = loadConfig({});
    expect(Object.isFrozen(config)).toBe(true);
  });
});
