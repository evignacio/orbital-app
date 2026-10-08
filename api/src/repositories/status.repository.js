const { withRedis } = require("../utils/cache");

const statusKey = env => `status:${env}`;
const cycleKey = env => `cycle:${env}`;

function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// The last known status of each application and the last cycle summary of each
// environment. This is state, not cache: no TTL. Nothing here ever rejects —
// with Redis down the reads come back empty and the writes are dropped.
class StatusRepository {
  // { [appId]: { status, latencyMs, limitMs?, checkedAt } }. An entry that is not
  // valid JSON is dropped, as if absent.
  getStatuses(env) {
    return withRedis("read", statusKey(env), async redis => {
      const hash = await redis.hgetall(statusKey(env));
      const statuses = {};
      for (const [id, raw] of Object.entries(hash)) {
        const entry = parse(raw);
        if (entry && typeof entry === "object") statuses[id] = entry;
      }
      return statuses;
    }, {});
  }

  setStatus(env, id, entry) {
    return withRedis("write", statusKey(env), redis => redis.hset(statusKey(env), id, JSON.stringify(entry)));
  }

  removeStatuses(env, ids) {
    if (ids.length === 0) return Promise.resolve();
    return withRedis("write", statusKey(env), redis => redis.hdel(statusKey(env), ...ids));
  }

  // The last "cycle" event of the environment, or null.
  getCycle(env) {
    return withRedis("read", cycleKey(env), async redis => {
      const raw = await redis.get(cycleKey(env));
      return raw ? parse(raw) ?? null : null;
    }, null);
  }

  setCycle(env, cycle) {
    return withRedis("write", cycleKey(env), redis => redis.set(cycleKey(env), JSON.stringify(cycle)));
  }
}

module.exports = new StatusRepository();
