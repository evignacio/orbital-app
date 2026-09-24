const { MongoClient } = require("mongodb");
const config = require("./config");
const log = require("./logger");

let client;

function buildUrl() {
  const base = config.mongoUrl;
  const user = config.mongoUser;
  const pass = config.mongoPass;
  if (!user || !pass) return base;
  const url = new URL(base);
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(pass);
  return url.toString();
}

// MONGO_DB wins; otherwise the database in MONGO_URL's path; otherwise "orbital".
function dbName() {
  if (config.mongoDb) return config.mongoDb;
  try {
    const fromUrl = decodeURIComponent(new URL(config.mongoUrl).pathname.slice(1));
    if (fromUrl) return fromUrl;
  } catch {}
  return "orbital";
}

// Concurrent first calls share one connection attempt. A failed attempt is
// dropped, so the next call retries instead of reusing a broken client.
async function connect() {
  if (!client) {
    client = (async () => {
      const mongo = new MongoClient(buildUrl(), { authSource: "admin" });
      try {
        await mongo.connect();
      } catch (err) {
        client = undefined;
        mongo.close().catch(() => {});
        log.error("mongo connection failed", { url: log.redactUrl(config.mongoUrl), err });
        throw err;
      }
      log.info("mongo connected", { url: log.redactUrl(config.mongoUrl), db: dbName() });
      return mongo;
    })();
  }
  return (await client).db(dbName());
}

module.exports = { connect };
