require("dotenv").config();

// Every environment variable the API reads, parsed and validated once at
// startup. An invalid value throws here instead of silently becoming NaN or 0.

function str(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

// Integer >= min. Unset or empty falls back to the default.
function int(name, fallback, min) {
  const raw = str(name, undefined);
  if (raw === undefined) return fallback;
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid ${name}="${raw}": expected an integer >= ${min}`);
  }
  const value = Number(raw);
  if (value < min) {
    throw new Error(`Invalid ${name}="${raw}": expected an integer >= ${min}`);
  }
  return value;
}

const config = Object.freeze({
  port: int("PORT", 3001, 1),
  mongoUrl: str("MONGO_URL", "mongodb://localhost:27017"),
  mongoUser: str("MONGO_USER", undefined),
  mongoPass: str("MONGO_PASS", undefined),
  mongoDb: str("MONGO_DB", undefined),
  redisUrl: str("REDIS_URL", "redis://localhost:6379"),
  // Seconds between the scheduled health checks of each environment.
  healthCheckIntervalS: int("HEALTH_CHECK_INTERVAL_S", 30, 5),
  // Application lists per environment (GET and the scheduler's source). Invalidated
  // on create/delete; edits made straight in Mongo show up after this. 0 disables.
  appsCacheTtl: int("APPS_CACHE_TTL", 7200, 0),
  healthCheckConcurrency: int("HEALTH_CHECK_CONCURRENCY", 10, 1),
  healthCheckTimeoutMs: int("HEALTH_CHECK_TIMEOUT_MS", 5000, 1),
  degradedLatencyMs: int("DEGRADED_LATENCY_MS", 3000, 1),
});

module.exports = config;
