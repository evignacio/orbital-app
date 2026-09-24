const { MongoClient } = require("mongodb");
const config = require("./config");

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

async function connect() {
  if (!client) {
    client = new MongoClient(buildUrl(), { authSource: "admin" });
    await client.connect();
  }
  return client.db(dbName());
}

module.exports = { connect };
