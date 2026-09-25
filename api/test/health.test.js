const { loadFresh, fakeLogger } = require("./helpers");

jest.mock("dotenv", () => ({ config: jest.fn() }));

const DEGRADED_LATENCY_MS = 1000;
const HEALTH_CHECK_TIMEOUT_MS = 2000;

const { checkHealth, mapLimit } = loadFresh(
  { DEGRADED_LATENCY_MS: String(DEGRADED_LATENCY_MS), HEALTH_CHECK_TIMEOUT_MS: String(HEALTH_CHECK_TIMEOUT_MS) },
  () => require("../src/health")
);

const app = { id: "a1", name: "billing", healthCheckUrl: "http://billing/health" };

// A fetch() response whose body can be cancelled, like undici's.
function response(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: { cancel: jest.fn().mockResolvedValue() },
  };
}

// performance.now() returns 0 at the start and `latencyMs` after fetch().
function elapse(latencyMs) {
  jest.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(latencyMs);
}

describe("checkHealth", () => {
  let log;

  beforeEach(() => {
    log = fakeLogger();
  });

  it("marca como healthy um 2xx respondido dentro do limite, com a latência medida", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(200));
    elapse(120.4);

    await expect(checkHealth(app, log)).resolves.toEqual({
      id: "a1",
      name: "billing",
      status: "healthy",
      latencyMs: 120,
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("considera healthy um 2xx com latência exatamente igual ao limite", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(204));
    elapse(DEGRADED_LATENCY_MS);

    await expect(checkHealth(app, log)).resolves.toMatchObject({ status: "healthy" });
  });

  it("marca como degraded um 2xx mais lento que DEGRADED_LATENCY_MS e informa o limite", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(200));
    elapse(1500);

    await expect(checkHealth(app, log)).resolves.toEqual({
      id: "a1",
      name: "billing",
      status: "degraded",
      latencyMs: 1500,
      limitMs: DEGRADED_LATENCY_MS,
    });
    expect(log.warn).toHaveBeenCalledWith("health check degraded", {
      app: "billing",
      id: "a1",
      url: "http://billing/health",
      latencyMs: 1500,
      limitMs: DEGRADED_LATENCY_MS,
    });
  });

  it("marca como unhealthy uma resposta não-2xx, mesmo lenta (erro vence lentidão)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(503));
    elapse(1800);

    await expect(checkHealth(app, log)).resolves.toEqual({
      id: "a1",
      name: "billing",
      status: "unhealthy",
      latencyMs: 1800,
    });
    expect(log.warn).toHaveBeenCalledWith(
      "health check unhealthy",
      expect.objectContaining({ httpStatus: 503, latencyMs: 1800 })
    );
  });

  it("marca como unhealthy, sem latência, quando o health check estoura o timeout", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    jest.spyOn(global, "fetch").mockRejectedValue(timeout);

    await expect(checkHealth(app, log)).resolves.toEqual({
      id: "a1",
      name: "billing",
      status: "unhealthy",
      latencyMs: null,
    });
    expect(log.warn).toHaveBeenCalledWith(
      "health check unhealthy",
      expect.objectContaining({ reason: "timeout", timeoutMs: HEALTH_CHECK_TIMEOUT_MS })
    );
  });

  it("usa o código do erro de rede (cause.code) como motivo do unhealthy", async () => {
    const err = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    jest.spyOn(global, "fetch").mockRejectedValue(err);

    await expect(checkHealth(app, log)).resolves.toMatchObject({ status: "unhealthy", latencyMs: null });
    expect(log.warn).toHaveBeenCalledWith("health check unhealthy", expect.objectContaining({ reason: "ECONNREFUSED" }));
  });

  it("usa a mensagem do erro como motivo quando não há código de rede", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("Invalid URL"));

    await checkHealth(app, log);
    expect(log.warn).toHaveBeenCalledWith("health check unhealthy", expect.objectContaining({ reason: "Invalid URL" }));
  });

  it("chama a healthCheckUrl com um AbortSignal de timeout", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(response(200));

    await checkHealth(app, log);
    expect(fetch).toHaveBeenCalledWith("http://billing/health", { signal: expect.any(AbortSignal) });
  });

  it("cancela o corpo da resposta sem lê-lo, para liberar a conexão", async () => {
    const res = response(200);
    jest.spyOn(global, "fetch").mockResolvedValue(res);

    await checkHealth(app, log);
    expect(res.body.cancel).toHaveBeenCalledTimes(1);
  });

  it("tolera uma resposta sem corpo e uma falha ao cancelá-lo", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce({ ok: true, status: 204, body: null });
    await expect(checkHealth(app, log)).resolves.toMatchObject({ status: "healthy" });

    const res = response(200);
    res.body.cancel.mockRejectedValue(new Error("already closed"));
    global.fetch.mockResolvedValueOnce(res);
    await expect(checkHealth(app, log)).resolves.toMatchObject({ status: "healthy" });
  });
});

describe("mapLimit", () => {
  // A promise resolved from outside, to control when each call finishes.
  function deferred() {
    let resolve;
    const promise = new Promise(r => (resolve = r));
    return { promise, resolve };
  }

  it("devolve os resultados na ordem dos itens, mesmo terminando fora de ordem", async () => {
    const delays = { a: 30, b: 5, c: 15 };
    const results = await mapLimit(["a", "b", "c"], 2, item =>
      new Promise(resolve => setTimeout(() => resolve(item.toUpperCase()), delays[item]))
    );
    expect(results).toEqual(["A", "B", "C"]);
  });

  it("nunca mantém mais que `limit` chamadas em andamento ao mesmo tempo", async () => {
    const pending = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const fn = async item => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const d = deferred();
      pending.push(d);
      await d.promise;
      inFlight--;
      return item * 2;
    };

    const run = mapLimit([1, 2, 3, 4, 5], 2, fn);
    // Finish calls one at a time; each completion lets exactly one more start.
    while (pending.length < 5 || inFlight > 0) {
      await new Promise(setImmediate);
      expect(inFlight).toBeLessThanOrEqual(2);
      const next = pending.find(d => !d.done);
      if (next) {
        next.done = true;
        next.resolve();
      }
    }

    await expect(run).resolves.toEqual([2, 4, 6, 8, 10]);
    expect(maxInFlight).toBe(2);
  });

  it("devolve lista vazia sem chamar a função quando não há itens", async () => {
    const fn = jest.fn();
    await expect(mapLimit([], 10, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("funciona com limit maior que a quantidade de itens, chamando a função uma vez por item", async () => {
    const fn = jest.fn(async n => n + 1);
    await expect(mapLimit([1, 2], 10, fn)).resolves.toEqual([2, 3]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rejeita se alguma chamada falhar", async () => {
    const fn = async n => {
      if (n === 2) throw new Error("boom");
      return n;
    };
    await expect(mapLimit([1, 2, 3], 2, fn)).rejects.toThrow("boom");
  });
});
