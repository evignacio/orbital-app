const Redis = require("ioredis");
const config = require("./config");
const log = require("./logger");

const READY_TIMEOUT_MS = 1000;

let client;

// false while Redis is unreachable. Connection errors are logged only on the
// transition, not on every reconnect attempt or every bypassed command.
let available = true;

function getClient() {
  if (!client) {
    client = new Redis(config.redisUrl, {
      enableOfflineQueue: false,
      // Namespaces every key (sync:production → orbital:sync:production) so a
      // shared Redis does not collide with other systems.
      keyPrefix: "orbital:",
    });
    client.on("ready", () => {
      available = true;
      log.info("redis connected", { url: log.redactUrl(config.redisUrl) });
    });
    client.on("error", err => {
      if (!available) return;
      available = false;
      log.warn("redis unavailable, sync cache bypassed", { url: log.redactUrl(config.redisUrl), err });
    });
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

// While Redis is known to be down, the transition was already logged.
function cacheFailed(op, key, err) {
  if (available) log.warn("cache operation failed", { op, key, err });
}

// Cache errors never reach the caller: a read failure is a miss, a write
// failure is ignored. Only fn() itself can reject.
async function readCache(key) {
  try {
    const cached = await (await ready()).get(key);
    return cached ? JSON.parse(cached) : undefined;
  } catch (err) {
    cacheFailed("read", key, err);
    return undefined;
  }
}

async function writeCache(key, ttlSeconds, value) {
  try {
    await (await ready()).set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    cacheFailed("write", key, err);
  }
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
      if (caching && (generation.get(key) || 0) === gen) await writeCache(key, ttlSeconds, result);
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
  } catch (err) {
    cacheFailed("invalidate", key, err);
  }
}

module.exports = { withCache, invalidate };
