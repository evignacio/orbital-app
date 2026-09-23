const Redis = require("ioredis");

let client;

function getClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    client.on("error", () => {});
  }
  return client;
}

async function withCache(key, ttlSeconds, fn) {
  try {
    const redis = getClient();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    const result = await fn();
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
    return result;
  } catch {
    return fn();
  }
}

async function invalidate(key) {
  try {
    await getClient().del(key);
  } catch {}
}

module.exports = { withCache, invalidate };
