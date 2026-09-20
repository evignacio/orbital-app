const { MongoClient } = require("mongodb");

let client;

function buildUrl() {
  const base = process.env.MONGO_URL || "mongodb://localhost:27017";
  const user = process.env.MONGO_USER;
  const pass = process.env.MONGO_PASS;
  if (!user || !pass) return base;
  const url = new URL(base);
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(pass);
  return url.toString();
}

async function connect() {
  if (!client) {
    client = new MongoClient(buildUrl(), { authSource: "admin" });
    await client.connect();
  }
  return client.db(process.env.MONGO_DB);
}

module.exports = { connect };
