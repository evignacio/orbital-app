const Redis = require("ioredis");

const READY_TIMEOUT_MS = 1000;

let client;

function getClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      enableOfflineQueue: false,
    });
    client.on("error", () => {});
  }
  return client;
}

// With the offline queue off, a command sent before the connection is ready is
// rejected — the first invalidate() after boot would be lost. Wait briefly while
// connecting; if Redis is down (reconnecting), fail fast so callers fall back.
async function ready() {
  const redis = getClient();
  if (redis.status === "connecting" || redis.status === "connect") {
    await new Promise((resolve, reject) => {
      const settle = ok => {
        clearTimeout(timer);
        redis.off("ready", onReady).off("close", onClose);
        ok ? resolve() : reject(new Error("Redis not ready"));
      };
      const onReady = () => settle(true);
      const onClose = () => settle(false); // this attempt failed; don't wait out the timer
      const timer = setTimeout(() => settle(false), READY_TIMEOUT_MS);
      redis.once("ready", onReady).once("close", onClose);
    });
  }
  return redis;
}

async function withCache(key, ttlSeconds, fn) {
  try {
    const redis = await ready();
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
    await (await ready()).del(key);
  } catch {}
}

module.exports = { withCache, invalidate };
