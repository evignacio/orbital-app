const request = require("supertest");

jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("../../src/utils/logger", () => require("../helpers").fakeLogger());
jest.mock("../../src/config/database", () => ({ connect: jest.fn() }));
jest.mock("../../src/utils/cache", () => ({ withCache: jest.fn(), invalidate: jest.fn(), withRedis: jest.fn() }));

const app = require("../../src/app");
const log = require("../../src/utils/logger");
const { connect } = require("../../src/config/database");
const { withCache, withRedis } = require("../../src/utils/cache");

describe("GET /health", () => {
  it("responde 200 com status UP e sem cache", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "UP" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("não consulta o Mongo nem o Redis", async () => {
    await request(app).get("/health");

    expect(connect).not.toHaveBeenCalled();
    expect(withCache).not.toHaveBeenCalled();
    expect(withRedis).not.toHaveBeenCalled();
  });

  it("não gera log de requisição", async () => {
    await request(app).get("/health");

    for (const level of ["info", "warn", "error"]) {
      expect(log[level]).not.toHaveBeenCalledWith("request completed", expect.anything());
    }
  });
});
