const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { connect } = require("../db");
const { withCache, invalidate } = require("../cache");
const config = require("../config");

const SYNC_TTL = config.syncCacheTtl;
const CHECK_CONCURRENCY = config.healthCheckConcurrency;
const DEGRADED_LATENCY_MS = config.degradedLatencyMs;
const HEALTH_CHECK_TIMEOUT_MS = config.healthCheckTimeoutMs;

const router = Router();

const ENVIRONMENTS = ["development", "staging", "production"];

function toCollection(env) {
  return `applications_${env}`;
}

function serialize(doc) {
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

// Every route with :env validates it here first.
router.param("env", (req, res, next, env) => {
  if (!ENVIRONMENTS.includes(env)) {
    req.log.warn("unknown environment", { env });
    return res
      .status(404)
      .json({ error: `Environment "${env}" not found. Valid values: ${ENVIRONMENTS.join(", ")}` });
  }
  next();
});

router.get("/", async (req, res) => {
  try {
    const db = await connect();
    const result = {};
    await Promise.all(
      ENVIRONMENTS.map(async (env) => {
        const docs = await db.collection(toCollection(env)).find().toArray();
        result[env] = docs.map(serialize);
      })
    );
    res.json(result);
  } catch (err) {
    req.log.error("list applications failed", { err });
    res.status(500).json({ error: err.message });
  }
});

router.get("/:env", async (req, res) => {
  const { env } = req.params;
  try {
    const db = await connect();
    const docs = await db.collection(toCollection(env)).find().toArray();
    res.json(docs.map(serialize));
  } catch (err) {
    req.log.error("list applications failed", { env, err });
    res.status(500).json({ error: err.message });
  }
});

// A 2xx slower than DEGRADED_LATENCY_MS is "degraded"; any error wins over
// slowness. Latency is measured up to the response headers. Unhealthy and
// degraded apps log a warn: the problem is the monitored app, not this API.
async function checkHealth(app, log) {
  const started = performance.now();
  const ctx = { app: app.name, id: app.id, url: app.healthCheckUrl };
  try {
    const response = await fetch(app.healthCheckUrl, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
    const latencyMs = Math.round(performance.now() - started);
    // The body is never read; cancel it so the connection is released now.
    response.body?.cancel().catch(() => {});
    if (!response.ok) {
      log.warn("health check unhealthy", { ...ctx, httpStatus: response.status, latencyMs });
      return { id: app.id, name: app.name, status: "unhealthy", latencyMs };
    }
    if (latencyMs > DEGRADED_LATENCY_MS) {
      log.warn("health check degraded", { ...ctx, latencyMs, limitMs: DEGRADED_LATENCY_MS });
      return { id: app.id, name: app.name, status: "degraded", latencyMs, limitMs: DEGRADED_LATENCY_MS };
    }
    return { id: app.id, name: app.name, status: "healthy", latencyMs };
  } catch (err) {
    const reason = err.name === "TimeoutError" ? "timeout" : err.cause?.code || err.message;
    log.warn("health check unhealthy", { ...ctx, reason, timeoutMs: HEALTH_CHECK_TIMEOUT_MS });
    return { id: app.id, name: app.name, status: "unhealthy", latencyMs: null };
  }
}

// Like Promise.all(items.map(fn)), but with at most `limit` calls in flight.
// Results keep the order of `items`.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

router.post("/:env/sync", async (req, res) => {
  const { env } = req.params;
  try {
    // ?fresh=1 (the "Sincronizar" button) skips the cached result.
    const fresh = req.query.fresh === "1";
    // Runs only on a cache miss (or ?fresh=1), so this logs at most once per
    // TTL per environment, however many browsers are polling.
    const results = await withCache(`sync:${env}`, SYNC_TTL, async () => {
      const started = performance.now();
      const db = await connect();
      const docs = await db.collection(toCollection(env)).find().toArray();
      const apps = docs.map(serialize);
      if (apps.length === 0) req.log.warn("no applications to check", { env });
      const log = req.log.child({ env });
      const checked = await mapLimit(apps, CHECK_CONCURRENCY, app => checkHealth(app, log));
      const count = status => checked.filter(r => r.status === status).length;
      req.log.info("sync completed", {
        env,
        fresh,
        apps: checked.length,
        healthy: count("healthy"),
        degraded: count("degraded"),
        unhealthy: count("unhealthy"),
        durationMs: Math.round(performance.now() - started),
      });
      return checked;
    }, { fresh });
    res.json(results);
  } catch (err) {
    req.log.error("sync failed", { env, err });
    res.status(500).json({ error: err.message });
  }
});

router.post("/:env", async (req, res) => {
  const { env } = req.params;
  const { name, team, healthCheckUrl, swaggerUrl = "" } = req.body;
  if (!name || !team || !healthCheckUrl) {
    const missing = ["name", "team", "healthCheckUrl"].filter(field => !req.body[field]);
    req.log.warn("create application rejected: missing required fields", { env, missing });
    return res.status(400).json({ error: "Fields required: name, team, healthCheckUrl" });
  }

  try {
    const db = await connect();
    const doc = { name, team, healthCheckUrl, swaggerUrl };
    const { insertedId } = await db.collection(toCollection(env)).insertOne(doc);
    await invalidate(`sync:${env}`);
    req.log.info("application created", { env, id: insertedId.toString(), name, team, healthCheckUrl });
    res.status(201).json({ id: insertedId.toString(), ...doc });
  } catch (err) {
    req.log.error("create application failed", { env, name, err });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:env/:id", async (req, res) => {
  const { env, id } = req.params;
  let objectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    req.log.warn("delete application rejected: invalid id", { env, id });
    return res.status(400).json({ error: "Invalid id format" });
  }
  try {
    const db = await connect();
    const { deletedCount } = await db.collection(toCollection(env)).deleteOne({ _id: objectId });
    if (deletedCount === 0) {
      req.log.warn("delete application: not found", { env, id });
      return res.status(404).json({ error: "Application not found" });
    }
    await invalidate(`sync:${env}`);
    req.log.info("application deleted", { env, id });
    res.status(204).end();
  } catch (err) {
    req.log.error("delete application failed", { env, id, err });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
