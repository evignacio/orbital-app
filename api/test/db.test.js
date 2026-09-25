const { loadFresh } = require("./helpers");

jest.mock("dotenv", () => ({ config: jest.fn() }));
// Fake logger that keeps the real redactUrl, so the logged URLs can be checked.
jest.mock("../src/logger", () => {
  const log = require("./helpers").fakeLogger();
  log.redactUrl.mockImplementation(jest.requireActual("../src/logger").redactUrl);
  return log;
});

// Stand-in for the mongodb driver. connect() is shared by every instance so a
// test can script it before db.js creates its client.
jest.mock("mongodb", () => {
  class MongoClient {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.connect = MongoClient.connect;
      this.close = jest.fn().mockResolvedValue();
      this.db = jest.fn(name => ({ databaseName: name }));
      MongoClient.instances.push(this);
    }
  }
  MongoClient.instances = [];
  MongoClient.connect = jest.fn().mockResolvedValue();
  return { MongoClient };
});

// db.js caches its client at module level; load a fresh copy per scenario.
function load(env = {}) {
  return loadFresh(env, () => ({
    db: require("../src/db"),
    MongoClient: require("mongodb").MongoClient,
    log: require("../src/logger"),
  }));
}

describe("connect", () => {
  it("usa MONGO_URL como está quando não há usuário e senha, autenticando em admin", async () => {
    const { db, MongoClient } = load({ MONGO_URL: "mongodb://mongo:27017" });
    await db.connect();

    expect(MongoClient.instances).toHaveLength(1);
    expect(MongoClient.instances[0].url).toBe("mongodb://mongo:27017");
    expect(MongoClient.instances[0].options).toEqual({ authSource: "admin" });
  });

  it("ignora MONGO_USER quando MONGO_PASS não está definido", async () => {
    const { db, MongoClient } = load({ MONGO_URL: "mongodb://mongo:27017", MONGO_USER: "admin" });
    await db.connect();
    expect(MongoClient.instances[0].url).toBe("mongodb://mongo:27017");
  });

  it("injeta MONGO_USER e MONGO_PASS na URL, codificando caracteres especiais", async () => {
    const { db, MongoClient } = load({
      MONGO_URL: "mongodb://mongo:27017/orbital",
      MONGO_USER: "admin",
      MONGO_PASS: "p@ss:w/rd",
    });
    await db.connect();
    expect(MongoClient.instances[0].url).toBe("mongodb://admin:p%40ss%3Aw%2Frd@mongo:27017/orbital");
  });

  it("usa o banco de MONGO_DB quando definido, com prioridade sobre o da URL", async () => {
    const { db } = load({ MONGO_URL: "mongodb://mongo:27017/da_url", MONGO_DB: "orbital_test" });
    await expect(db.connect()).resolves.toEqual({ databaseName: "orbital_test" });
  });

  it("usa o banco do caminho de MONGO_URL quando MONGO_DB não está definido", async () => {
    const { db } = load({ MONGO_URL: "mongodb://mongo:27017/orbital_prod?retryWrites=true" });
    await expect(db.connect()).resolves.toEqual({ databaseName: "orbital_prod" });
  });

  it("usa o banco 'orbital' quando nem MONGO_DB nem a URL indicam um", async () => {
    const { db } = load({ MONGO_URL: "mongodb://mongo:27017" });
    await expect(db.connect()).resolves.toEqual({ databaseName: "orbital" });
  });

  it("loga a conexão com a URL sem credenciais e o banco escolhido", async () => {
    const { db, log } = load({ MONGO_URL: "mongodb://root:secret@mongo:27017/orbital" });
    await db.connect();
    expect(log.info).toHaveBeenCalledWith("mongo connected", {
      url: "mongodb://***:***@mongo:27017/orbital",
      db: "orbital",
    });
  });

  it("chamadas simultâneas compartilham uma única conexão", async () => {
    const { db, MongoClient } = load();
    await Promise.all([db.connect(), db.connect(), db.connect()]);
    await db.connect();

    expect(MongoClient.instances).toHaveLength(1);
    expect(MongoClient.connect).toHaveBeenCalledTimes(1);
  });

  it("em falha de conexão loga o erro com URL redigida, fecha o cliente e propaga o erro", async () => {
    const { db, MongoClient, log } = load({ MONGO_URL: "mongodb://root:secret@mongo:27017" });
    const err = new Error("connect ECONNREFUSED");
    MongoClient.connect.mockRejectedValueOnce(err);

    await expect(db.connect()).rejects.toBe(err);
    expect(MongoClient.instances[0].close).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith("mongo connection failed", {
      url: "mongodb://***:***@mongo:27017",
      err,
    });
  });

  it("depois de uma falha, a próxima chamada tenta conectar de novo com um novo cliente", async () => {
    const { db, MongoClient } = load();
    MongoClient.connect.mockRejectedValueOnce(new Error("down"));

    await expect(db.connect()).rejects.toThrow("down");
    await expect(db.connect()).resolves.toEqual({ databaseName: "orbital" });
    expect(MongoClient.instances).toHaveLength(2);
  });

  it("não quebra se fechar o cliente que falhou também falhar", async () => {
    const { db, MongoClient } = load();
    MongoClient.connect.mockImplementationOnce(function () {
      this.close.mockRejectedValue(new Error("close failed"));
      return Promise.reject(new Error("down"));
    });

    await expect(db.connect()).rejects.toThrow("down");
  });
});
