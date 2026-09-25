const { loadFresh } = require("./helpers");

let stdout;
let stderr;

beforeEach(() => {
  stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
});

const loadLogger = (env = {}) => loadFresh(env, () => require("../src/logger"));

// Parses every line written to a stream spy.
const lines = spy => spy.mock.calls.map(([chunk]) => JSON.parse(chunk));

describe("logger", () => {
  it("escreve uma linha JSON com ts, level, msg e os campos informados", () => {
    const log = loadLogger();
    log.info("api started", { port: 3001 });

    expect(stdout).toHaveBeenCalledTimes(1);
    const [chunk] = stdout.mock.calls[0];
    expect(chunk.endsWith("\n")).toBe(true);
    const entry = JSON.parse(chunk);
    expect(entry).toEqual({ ts: expect.any(String), level: "info", msg: "api started", port: 3001 });
    expect(new Date(entry.ts).toISOString()).toBe(entry.ts);
  });

  it("envia info para stdout e warn/error para stderr", () => {
    const log = loadLogger();
    log.info("a");
    log.warn("b");
    log.error("c");

    expect(lines(stdout).map(e => e.level)).toEqual(["info"]);
    expect(lines(stderr).map(e => e.level)).toEqual(["warn", "error"]);
  });

  it("child() acrescenta seus campos a toda linha e pode ser encadeado", () => {
    const log = loadLogger();
    const reqLog = log.child({ reqId: "abc12345" });
    reqLog.child({ env: "production" }).info("sync completed", { apps: 3 });
    reqLog.info("request completed");

    expect(lines(stdout)).toEqual([
      expect.objectContaining({ reqId: "abc12345", env: "production", apps: 3 }),
      expect.not.objectContaining({ env: expect.anything() }),
    ]);
    expect(lines(stdout)[1].reqId).toBe("abc12345");
  });

  it("serializa Error com name, message, code e cause aninhado", () => {
    const log = loadLogger();
    const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const err = new TypeError("fetch failed", { cause });
    log.warn("health check unhealthy", { err });

    const [entry] = lines(stderr);
    expect(entry.err).toEqual({
      name: "TypeError",
      message: "fetch failed",
      cause: { name: "Error", message: "connect ECONNREFUSED", code: "ECONNREFUSED" },
    });
  });

  it("inclui o stack do erro apenas no nível error", () => {
    const log = loadLogger();
    log.warn("w", { err: new Error("x") });
    log.error("e", { err: new Error("y") });

    const [warnEntry, errorEntry] = lines(stderr);
    expect(warnEntry.err.stack).toBeUndefined();
    expect(errorEntry.err.stack).toContain("Error: y");
  });

  it("mantém cause que não é Error como valor simples", () => {
    const log = loadLogger();
    log.warn("w", { err: new Error("x", { cause: "timeout" }) });
    expect(lines(stderr)[0].err.cause).toBe("timeout");
  });

  it("com LOG_LEVEL=warn descarta as linhas de info", () => {
    const log = loadLogger({ LOG_LEVEL: "warn" });
    log.info("ignorado");
    log.warn("mantido");

    expect(stdout).not.toHaveBeenCalled();
    expect(lines(stderr).map(e => e.msg)).toEqual(["mantido"]);
  });

  it("com LOG_LEVEL=error descarta info e warn", () => {
    const log = loadLogger({ LOG_LEVEL: " ERROR " });
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(stdout).not.toHaveBeenCalled();
    expect(lines(stderr).map(e => e.msg)).toEqual(["e"]);
  });

  it("com LOG_LEVEL inválido avisa ao carregar e continua em info", () => {
    const log = loadLogger({ LOG_LEVEL: "debug" });
    expect(lines(stderr)).toEqual([
      expect.objectContaining({ level: "warn", msg: "invalid LOG_LEVEL, using info", value: "debug" }),
    ]);

    log.info("visível");
    expect(lines(stdout).map(e => e.msg)).toEqual(["visível"]);
  });

  it("troca campos não serializáveis por logError em vez de lançar exceção", () => {
    const log = loadLogger();
    const circular = {};
    circular.self = circular;

    expect(() => log.info("x", { circular })).not.toThrow();
    expect(lines(stdout)[0]).toEqual({
      ts: expect.any(String),
      level: "info",
      msg: "x",
      logError: "unserializable fields",
    });
  });

  describe("redactUrl", () => {
    it("mascara usuário e senha de uma URL de conexão", () => {
      const { redactUrl } = loadLogger();
      expect(redactUrl("mongodb://admin:s3cret@mongo:27017/orbital")).toBe(
        "mongodb://***:***@mongo:27017/orbital"
      );
    });

    it("preserva uma URL sem credenciais", () => {
      const { redactUrl } = loadLogger();
      expect(redactUrl("redis://redis:6379")).toBe("redis://redis:6379");
    });

    it("devolve <invalid url> para um valor que não é URL", () => {
      const { redactUrl } = loadLogger();
      expect(redactUrl("não é url")).toBe("<invalid url>");
    });
  });
});
