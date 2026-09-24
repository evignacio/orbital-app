const Redis = require("ioredis");
const config = require("./config");

const READY_TIMEOUT_MS = 1000;

let client;

function getClient() {
  if (!client) {
    client = new Redis(config.redisUrl, {
      enableOfflineQueue: false,
      // Namespaces every key (sync:production → orbital:sync:production) so a
      // shared Redis does not collide with other systems.
      keyPrefix: "orbital:",
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

// Runs of fn() in progress, per key. Concurrent callers share one run instead
// of each firing its own set of checks (single-flight, this process only).
const inFlight = new Map();

// Bumped by invalidate(). A run started before the bump neither writes its
// (possibly outdated) result to Redis nor accepts new callers.
const generation = new Map();

// Cache errors never reach the caller: a read failure is a miss, a write
// failure is ignored. Only fn() itself can reject.
async function readCache(key) {
  try {
    const cached = await (await ready()).get(key);
    return cached ? JSON.parse(cached) : undefined;
  } catch {
    return undefined;
  }
}

async function writeCache(key, ttlSeconds, value) {
  try {
    await (await ready()).set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {}
}

// ttlSeconds <= 0 disables the Redis cache (single-flight still applies).
// `fresh` skips the cache read but still joins a run in progress and still
// writes its result, so the next cached read sees it.
async function withCache(key, ttlSeconds, fn, { fresh = false } = {}) {
  const caching = ttlSeconds > 0;
  if (caching && !fresh) {
    const cached = await readCache(key);
    if (cached !== undefined) return cached;
  }
  if (inFlight.has(key)) return inFlight.get(key);

  const gen = generation.get(key) || 0;
  const run = (async () => {
    try {
      const result = await fn();
      if (caching && generation.get(key) === gen) await writeCache(key, ttlSeconds, result);
      return result;
    } finally {
      if (inFlight.get(key) === run) inFlight.delete(key);
    }
  })();
  inFlight.set(key, run);
  return run;
}

async function invalidate(key) {
  generation.set(key, (generation.get(key) || 0) + 1);
  inFlight.delete(key);
  try {
    await (await ready()).del(key);
  } catch {}
}

module.exports = { withCache, invalidate };
