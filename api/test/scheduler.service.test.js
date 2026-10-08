const { loadFresh, fakeLogger } = require("./helpers");

jest.mock("dotenv", () => ({ config: jest.fn() }));

const START = new Date("2026-10-05T14:00:00.000Z");
const T = seconds => START.getTime() + seconds * 1000;

// A promise resolved from outside, to hold a health check in progress.
function deferred() {
  let resolve;
  const promise = new Promise(res => (resolve = res));
  return { promise, resolve };
}

const healthy = app => ({ id: app.id, name: app.name, status: "healthy", latencyMs: 40 });

let scheduler;
let mocks;

// The scheduler instance keeps its grid and per-environment state, so
// every test gets a fresh copy wired to fresh doubles.
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
  ({ scheduler, mocks } = loadFresh({}, () => {
    const mocks = {
      log: fakeLogger(),
      listApps: jest.fn(async env => [{ id: `${env}-1`, name: `${env}-app`, healthCheckUrl: `http://${env}/health` }]),
      getStatuses: jest.fn(async () => ({})),
      setStatus: jest.fn(async () => {}),
      removeStatuses: jest.fn(async () => {}),
      setCycle: jest.fn(async () => {}),
      publish: jest.fn(),
      checkHealth: jest.fn(async app => healthy(app)),
    };
    jest.doMock("../src/utils/logger", () => mocks.log);
    jest.doMock("../src/repositories/applications.repository", () => ({ list: mocks.listApps }));
    jest.doMock("../src/repositories/status.repository", () => ({
      getStatuses: mocks.getStatuses,
      setStatus: mocks.setStatus,
      removeStatuses: mocks.removeStatuses,
      setCycle: mocks.setCycle,
    }));
    jest.doMock("../src/services/events.service", () => ({ publish: mocks.publish }));
    jest.doMock("../src/services/health-check.service", () => ({ check: mocks.checkHealth }));
    return { scheduler: require("../src/services/scheduler.service"), mocks };
  }));
});

afterEach(() => {
  scheduler.stop();
  jest.useRealTimers();
});

const advance = ms => jest.advanceTimersByTimeAsync(ms);

// Published events of one type, in order.
const published = type => mocks.publish.mock.calls.map(([e]) => e).filter(e => e.type === type);
const cyclesOf = env => published("cycle").filter(e => e.data.env === env);

describe("grade de horários", () => {
  it("produção roda no boot, homologação após 10 s e desenvolvimento após 20 s", async () => {
    scheduler.start();

    await advance(0);
    expect(published("cycle").map(e => e.data.env)).toEqual(["production"]);

    await advance(9999);
    expect(cyclesOf("staging")).toHaveLength(0);
    await advance(1);
    expect(published("cycle").map(e => e.data.env)).toEqual(["production", "staging"]);

    await advance(9999);
    expect(cyclesOf("development")).toHaveLength(0);
    await advance(1);
    expect(published("cycle").map(e => e.data.env)).toEqual(["production", "staging", "development"]);
  });

  it("repete cada ambiente a cada intervalo (30 s), mantendo a defasagem entre eles", async () => {
    scheduler.start();

    await advance(70000);

    expect(published("cycle").map(e => e.data.env)).toEqual([
      "production", "staging", "development", // 0, 10, 20
      "production", "staging", "development", // 30, 40, 50
      "production", "staging",                // 60, 70
    ]);
  });

  it("nextCheckAt devolve o próximo horário da grade de cada ambiente, mesmo antes do primeiro ciclo", () => {
    expect(scheduler.nextCheckAt("production")).toBeNull();

    scheduler.start();

    expect(scheduler.nextCheckAt("production")).toBe(new Date(T(0)).toISOString());
    expect(scheduler.nextCheckAt("staging")).toBe(new Date(T(10)).toISOString());
    expect(scheduler.nextCheckAt("development")).toBe(new Date(T(20)).toISOString());
  });

  it("o horário agendado já aponta para o seguinte assim que dispara", async () => {
    scheduler.start();

    await advance(0);

    expect(scheduler.nextCheckAt("production")).toBe(new Date(T(30)).toISOString());
  });

  it("timer que dispara um pouco antes do horário não repete o mesmo horário", async () => {
    scheduler.start();
    await advance(0); // produção roda em 0 e arma o horário de 30 s
    const realNow = Date.now;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => realNow() - 5); // relógio 5 ms atrás ao disparar

    try {
      await advance(30000);
      expect(scheduler.nextCheckAt("production")).toBe(new Date(T(60)).toISOString());

      await advance(100);
      expect(cyclesOf("production")).toHaveLength(2); // 0 s e 30 s, sem um terceiro logo depois
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("stop() impede novos disparos", async () => {
    scheduler.start();
    await advance(0);
    mocks.publish.mockClear();

    scheduler.stop();
    await advance(120000);

    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

describe("ciclo", () => {
  it("publica o status de cada app assim que o check dela termina, antes de o ciclo acabar", async () => {
    const slow = deferred();
    mocks.listApps.mockResolvedValue([
      { id: "fast", name: "fast", healthCheckUrl: "http://fast" },
      { id: "slow", name: "slow", healthCheckUrl: "http://slow" },
    ]);
    mocks.checkHealth.mockImplementation(async app => {
      if (app.id === "slow") await slow.promise;
      return healthy(app);
    });
    scheduler.start();

    await advance(0);

    expect(published("status").map(e => e.data.id)).toEqual(["fast"]);
    expect(published("cycle")).toHaveLength(0);

    slow.resolve();
    await advance(0);

    expect(published("status").map(e => e.data.id)).toEqual(["fast", "slow"]);
    expect(published("cycle")).toHaveLength(1);
  });

  it("o evento status traz id, name, env, status, latencyMs e checkedAt, e limitMs só em degradado", async () => {
    mocks.listApps.mockResolvedValue([
      { id: "ok", name: "ok", healthCheckUrl: "http://ok" },
      { id: "slow", name: "slow", healthCheckUrl: "http://slow" },
    ]);
    mocks.checkHealth.mockImplementation(async app =>
      app.id === "slow"
        ? { id: "slow", name: "slow", status: "degraded", latencyMs: 3412, limitMs: 3000 }
        : healthy(app)
    );
    scheduler.start();

    await advance(0);

    const [ok, slow] = published("status").map(e => e.data);
    const checkedAt = START.toISOString();
    expect(ok).toEqual({ id: "ok", name: "ok", env: "production", status: "healthy", latencyMs: 40, checkedAt });
    expect(slow).toEqual({ id: "slow", name: "slow", env: "production", status: "degraded", latencyMs: 3412, limitMs: 3000, checkedAt });
  });

  it("grava cada resultado no store", async () => {
    scheduler.start();

    await advance(0);

    expect(mocks.setStatus).toHaveBeenCalledWith("production", "production-1", {
      status: "healthy",
      latencyMs: 40,
      checkedAt: START.toISOString(),
    });
  });

  it("publica o status sem esperar a gravação no store, e só fecha o ciclo depois dela", async () => {
    const write = deferred();
    mocks.setStatus.mockReturnValue(write.promise); // Redis lento
    scheduler.start();

    await advance(0);

    expect(published("status")).toHaveLength(1);
    expect(published("cycle")).toHaveLength(0);

    write.resolve();
    await advance(0);

    expect(published("cycle")).toHaveLength(1);
  });

  it("não deixa a gravação lenta de uma app segurar o check das demais", async () => {
    mocks.listApps.mockResolvedValue([
      { id: "a", name: "a", healthCheckUrl: "http://a" },
      { id: "b", name: "b", healthCheckUrl: "http://b" },
    ]);
    mocks.setStatus.mockReturnValue(new Promise(() => {})); // nunca resolve
    scheduler.start();

    await advance(0);

    expect(published("status").map(e => e.data.id)).toEqual(["a", "b"]);
  });

  it("conta como mudança só o status diferente do anterior, e a ausência de anterior também", async () => {
    mocks.listApps.mockResolvedValue([
      { id: "same", name: "same", healthCheckUrl: "http://same" },
      { id: "fell", name: "fell", healthCheckUrl: "http://fell" },
      { id: "new", name: "new", healthCheckUrl: "http://new" },
    ]);
    mocks.getStatuses.mockResolvedValue({
      same: { status: "healthy", latencyMs: 999 }, // latência diferente não é mudança
      fell: { status: "healthy", latencyMs: 40 },
    });
    mocks.checkHealth.mockImplementation(async app =>
      app.id === "fell" ? { id: "fell", name: "fell", status: "unhealthy", latencyMs: null } : healthy(app)
    );
    scheduler.start();

    await advance(0);

    expect(published("status").map(e => [e.data.id, e.changed])).toEqual([
      ["same", false],
      ["fell", true],
      ["new", true],
    ]);
    expect(cyclesOf("production")[0].data.changed).toBe(2);
  });

  it("o evento cycle traz contagens, duração, horários e o próximo horário agendado", async () => {
    mocks.listApps.mockResolvedValue([
      { id: "a", name: "a", healthCheckUrl: "http://a" },
      { id: "b", name: "b", healthCheckUrl: "http://b" },
      { id: "c", name: "c", healthCheckUrl: "http://c" },
    ]);
    mocks.checkHealth.mockImplementation(async app => {
      await new Promise(resolve => setTimeout(resolve, 250));
      if (app.id === "b") return { id: "b", name: "b", status: "degraded", latencyMs: 3500, limitMs: 3000 };
      if (app.id === "c") return { id: "c", name: "c", status: "unhealthy", latencyMs: null };
      return healthy(app);
    });
    scheduler.start();

    await advance(250);

    expect(cyclesOf("production")).toEqual([
      {
        type: "cycle",
        data: {
          env: "production",
          trigger: "scheduled",
          checked: 3,
          changed: 3,
          healthy: 1,
          degraded: 1,
          unhealthy: 1,
          startedAt: START.toISOString(),
          checkedAt: new Date(T(0) + 250).toISOString(),
          durationMs: 250,
          nextCheckAt: new Date(T(30)).toISOString(),
        },
      },
    ]);
    expect(mocks.setCycle).toHaveBeenCalledWith("production", cyclesOf("production")[0].data);
    expect(mocks.log.info).toHaveBeenCalledWith("sync completed", expect.objectContaining({ env: "production", checked: 3 }));
  });

  it("avisa quando o ambiente não tem aplicações e ainda assim fecha o ciclo", async () => {
    mocks.listApps.mockResolvedValue([]);
    scheduler.start();

    await advance(0);

    expect(mocks.log.warn).toHaveBeenCalledWith("no applications to check", { env: "production" });
    expect(cyclesOf("production")[0].data).toMatchObject({ checked: 0, changed: 0 });
  });

  it("remove do store as apps que saíram da lista", async () => {
    mocks.getStatuses.mockResolvedValue({
      "production-1": { status: "healthy" },
      gone: { status: "healthy" },
      "gone-too": { status: "unhealthy" },
    });
    scheduler.start();

    await advance(0);

    expect(mocks.removeStatuses).toHaveBeenCalledWith("production", ["gone", "gone-too"]);
  });

  it("descarta o resultado de uma app removida durante o ciclo: não grava nem publica, e não conta", async () => {
    const hang = deferred();
    mocks.listApps.mockResolvedValue([
      { id: "kept", name: "kept", healthCheckUrl: "http://kept" },
      { id: "gone", name: "gone", healthCheckUrl: "http://gone" },
    ]);
    mocks.checkHealth.mockImplementation(async app => {
      if (app.id === "gone") await hang.promise;
      return healthy(app);
    });
    scheduler.start();
    await advance(0);

    scheduler.forget("production", "gone");
    hang.resolve();
    await advance(0);

    expect(published("status").map(e => e.data.id)).toEqual(["kept"]);
    expect(mocks.setStatus).not.toHaveBeenCalledWith("production", "gone", expect.anything());
    expect(cyclesOf("production")[0].data).toMatchObject({ checked: 1, healthy: 1 });
  });

  it("forget() sem ciclo em andamento não afeta o ciclo seguinte", async () => {
    scheduler.forget("production", "production-1");
    scheduler.start();

    await advance(0);

    expect(published("status").map(e => e.data.id)).toEqual(["production-1"]);
  });

  it("forget() de um ciclo não vale para o ciclo seguinte do mesmo ambiente", async () => {
    const hang = deferred();
    mocks.checkHealth.mockImplementationOnce(async app => {
      await hang.promise;
      return healthy(app);
    });
    scheduler.start();
    await advance(0);
    scheduler.forget("production", "production-1");
    hang.resolve();
    await advance(0);
    expect(published("status")).toHaveLength(0);

    await advance(30000); // a app foi recriada com o mesmo id (ex.: restauro) e entra no ciclo seguinte

    expect(published("status").map(e => e.data.id)).toContain("production-1");
  });

  it("falha ao listar as apps loga error, não publica cycle e o próximo horário segue normal", async () => {
    const err = new Error("mongo down");
    mocks.listApps.mockRejectedValueOnce(err);
    scheduler.start();

    await advance(0);

    expect(mocks.log.error).toHaveBeenCalledWith("sync failed", { env: "production", trigger: "scheduled", err });
    expect(cyclesOf("production")).toHaveLength(0);
    expect(mocks.setCycle).not.toHaveBeenCalled();

    await advance(30000);

    expect(cyclesOf("production")).toHaveLength(1);
  });

  it("com o ciclo ainda rodando no horário seguinte, pula o disparo com warn", async () => {
    const hang = deferred();
    mocks.checkHealth.mockImplementationOnce(async app => {
      await hang.promise;
      return healthy(app);
    });
    scheduler.start();

    await advance(30000); // o horário de 30 s chega com o ciclo das 0 s preso

    expect(mocks.log.warn).toHaveBeenCalledWith("scheduled sync skipped: previous cycle still running", { env: "production" });
    expect(mocks.checkHealth.mock.calls.filter(([app]) => app.id === "production-1")).toHaveLength(1);

    hang.resolve();
    await advance(30000);

    expect(cyclesOf("production")).toHaveLength(2); // o preso + o das 60 s
  });
});

describe("force()", () => {
  it("sem ciclo em andamento roda na hora, como manual, e pula só o próximo horário", async () => {
    scheduler.start();
    await advance(37000); // produção já rodou em 0 e 30
    mocks.publish.mockClear();

    const result = scheduler.force("production");

    expect(result).toEqual({
      env: "production",
      trigger: "manual",
      startedAt: new Date(T(37)).toISOString(),
      nextCheckAt: new Date(T(90)).toISOString(),
      joined: false,
    });
    await advance(0);
    expect(cyclesOf("production")).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ trigger: "manual", nextCheckAt: new Date(T(90)).toISOString() }) }),
    ]);

    mocks.publish.mockClear();
    await advance(23000); // t = 60: o horário cancelado não dispara
    expect(cyclesOf("production")).toHaveLength(0);

    await advance(30000); // t = 90: a grade original volta
    expect(cyclesOf("production")).toEqual([expect.objectContaining({ data: expect.objectContaining({ trigger: "scheduled" }) })]);
  });

  it("não desloca os outros ambientes", async () => {
    scheduler.start();
    await advance(37000);

    scheduler.force("production");
    mocks.publish.mockClear();
    await advance(13000); // t = 50

    // Entre 37 s e 50 s: homologação em 40 s e desenvolvimento em 50 s, como na grade.
    expect(cyclesOf("staging").map(e => e.data.checkedAt)).toEqual([new Date(T(40)).toISOString()]);
    expect(cyclesOf("development").map(e => e.data.checkedAt)).toEqual([new Date(T(50)).toISOString()]);
    expect(scheduler.nextCheckAt("staging")).toBe(new Date(T(70)).toISOString());
    expect(scheduler.nextCheckAt("development")).toBe(new Date(T(80)).toISOString());
  });

  it("com ciclo em andamento junta-se a ele e não altera a grade", async () => {
    const hang = deferred();
    scheduler.start();
    await advance(0);
    mocks.checkHealth.mockImplementation(async app => {
      if (app.id === "production-1") await hang.promise;
      return healthy(app);
    });
    await advance(30500); // o ciclo agendado de 30 s está preso
    mocks.checkHealth.mockClear();

    const result = scheduler.force("production");

    expect(result).toEqual({
      env: "production",
      trigger: "scheduled",
      startedAt: new Date(T(30)).toISOString(),
      nextCheckAt: new Date(T(60)).toISOString(),
      joined: true,
    });
    expect(mocks.checkHealth).not.toHaveBeenCalled();
    expect(scheduler.nextCheckAt("production")).toBe(new Date(T(60)).toISOString());
  });

  it("depois que o ciclo manual termina, um novo force() volta a rodar um ciclo", async () => {
    scheduler.start();
    await advance(5000);

    scheduler.force("production");
    await advance(0);
    const second = scheduler.force("production");

    expect(second.joined).toBe(false);
  });
});
