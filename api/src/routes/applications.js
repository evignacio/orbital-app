const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { connect } = require("../db");
const { withCache, invalidate } = require("../cache");
const { checkHealth, mapLimit } = require("../health");
const config = require("../config");

const SYNC_TTL = config.syncCacheTtl;
const APPS_TTL = config.appsCacheTtl;
const CHECK_CONCURRENCY = config.healthCheckConcurrency;

const router = Router();

const ENVIRONMENTS = ["development", "staging", "production"];

function toCollection(env) {
  return `applications_${env}`;
}

function serialize(doc) {
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

// One environment's applications, serialized. Cached under apps:<env> for
// APPS_TTL and shared by GET / and /sync; create and delete invalidate it.
function listApps(env) {
  return withCache(`apps:${env}`, APPS_TTL, async () => {
    const db = await connect();
    const docs = await db.collection(toCollection(env)).find().toArray();
    return docs.map(serialize);
  });
}

// After a create or delete: the list changed, and a cached /sync result would
// still report the old set of applications.
function invalidateEnv(env) {
  return Promise.all([invalidate(`apps:${env}`), invalidate(`sync:${env}`)]);
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
    const result = {};
    await Promise.all(
      ENVIRONMENTS.map(async (env) => {
        result[env] = await listApps(env);
      })
    );
    res.json(result);
  } catch (err) {
    req.log.error("list applications failed", { err });
    res.status(500).json({ error: err.message });
  }
});

router.post("/:env/sync", async (req, res) => {
  const { env } = req.params;
  try {
    // ?fresh=1 (the "Sincronizar" button) skips the cached result.
    const fresh = req.query.fresh === "1";
    // Runs only on a cache miss (or ?fresh=1), so this logs at most once per
    // TTL per environment, however many browsers are polling.
    const results = await withCache(`sync:${env}`, SYNC_TTL, async () => {
      const started = performance.now();
      const apps = await listApps(env);
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
    await invalidateEnv(env);
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
    await invalidateEnv(env);
    req.log.info("application deleted", { env, id });
    res.status(204).end();
  } catch (err) {
    req.log.error("delete application failed", { env, id, err });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
