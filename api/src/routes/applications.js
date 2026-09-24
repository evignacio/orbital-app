const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { connect } = require("../db");
const { withCache, invalidate } = require("../cache");

const SYNC_TTL = parseInt(process.env.SYNC_CACHE_TTL || "3");
const CHECK_CONCURRENCY = Math.max(1, parseInt(process.env.HEALTH_CHECK_CONCURRENCY || "10") || 10);
const DEGRADED_LATENCY_MS = Math.max(1, parseInt(process.env.DEGRADED_LATENCY_MS || "1000") || 1000);

const router = Router();

const ENVIRONMENTS = ["development", "staging", "production"];

function toCollection(env) {
  return `applications_${env}`;
}

function serialize(doc) {
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

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
    res.status(500).json({ error: err.message });
  }
});

router.get("/:env", async (req, res) => {
  const { env } = req.params;
  if (!ENVIRONMENTS.includes(env)) {
    return res
      .status(404)
      .json({ error: `Environment "${env}" not found. Valid values: ${ENVIRONMENTS.join(", ")}` });
  }
  try {
    const db = await connect();
    const docs = await db.collection(toCollection(env)).find().toArray();
    res.json(docs.map(serialize));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A 2xx slower than DEGRADED_LATENCY_MS is "degraded"; any error wins over
// slowness. Latency is measured up to the response headers.
async function checkHealth(app) {
  const started = performance.now();
  try {
    const response = await fetch(app.healthCheckUrl, { signal: AbortSignal.timeout(5000) });
    const latencyMs = Math.round(performance.now() - started);
    // The body is never read; cancel it so the connection is released now.
    response.body?.cancel().catch(() => {});
    if (!response.ok) return { id: app.id, name: app.name, status: "unhealthy", latencyMs };
    if (latencyMs > DEGRADED_LATENCY_MS) {
      return { id: app.id, name: app.name, status: "degraded", latencyMs, limitMs: DEGRADED_LATENCY_MS };
    }
    return { id: app.id, name: app.name, status: "healthy", latencyMs };
  } catch {
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
  if (!ENVIRONMENTS.includes(env)) {
    return res
      .status(404)
      .json({ error: `Environment "${env}" not found. Valid values: ${ENVIRONMENTS.join(", ")}` });
  }
  try {
    const results = await withCache(`sync:${env}`, SYNC_TTL, async () => {
      const db = await connect();
      const docs = await db.collection(toCollection(env)).find().toArray();
      const apps = docs.map(serialize);
      return await mapLimit(apps, CHECK_CONCURRENCY, checkHealth);
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:env", async (req, res) => {
  const { env } = req.params;
  if (!ENVIRONMENTS.includes(env)) {
    return res
      .status(404)
      .json({ error: `Environment "${env}" not found. Valid values: ${ENVIRONMENTS.join(", ")}` });
  }

  const { name, team, healthCheckUrl, swaggerUrl = "" } = req.body;
  if (!name || !team || !healthCheckUrl) {
    return res.status(400).json({ error: "Fields required: name, team, healthCheckUrl" });
  }

  try {
    const db = await connect();
    const doc = { name, team, healthCheckUrl, swaggerUrl };
    const { insertedId } = await db.collection(toCollection(env)).insertOne(doc);
    await invalidate(`sync:${env}`);
    res.status(201).json({ id: insertedId.toString(), ...doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:env/:id", async (req, res) => {
  const { env, id } = req.params;
  if (!ENVIRONMENTS.includes(env)) {
    return res
      .status(404)
      .json({ error: `Environment "${env}" not found. Valid values: ${ENVIRONMENTS.join(", ")}` });
  }
  let objectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return res.status(400).json({ error: "Invalid id format" });
  }
  try {
    const db = await connect();
    const { deletedCount } = await db.collection(toCollection(env)).deleteOne({ _id: objectId });
    if (deletedCount === 0) return res.status(404).json({ error: "Application not found" });
    await invalidate(`sync:${env}`);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
