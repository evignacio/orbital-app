const config = require("../config");
const baseLog = require("../utils/logger");
const applicationsRepository = require("../repositories/applications.repository");
const statusRepository = require("../repositories/status.repository");
const eventsService = require("./events.service");
const healthCheckService = require("./health-check.service");
const mapLimit = require("../utils/map-limit");
const { ENVIRONMENTS, SCHEDULE_OFFSETS } = require("../config/environments");

const CHECK_CONCURRENCY = config.healthCheckConcurrency;
const intervalMs = config.healthCheckIntervalS * 1000;

const iso = ms => new Date(ms).toISOString();

function summarize(results) {
  const totals = { checked: results.length, changed: 0, healthy: 0, degraded: 0, unhealthy: 0 };
  for (const { status, changed } of results) {
    if (changed) totals.changed++;
    totals[status]++;
  }
  return totals;
}

class SchedulerService {
  constructor() {
    this.bootAt = 0;
    // Per environment: its grid offset (staggered, see environments.js), the next
    // slot, its timer and `current` — null when idle, or the running cycle
    // { promise, trigger, startedAt, removed }.
    this.state = {};
    this.init();
  }

  init() {
    for (const env of ENVIRONMENTS) {
      this.state[env] = { offsetMs: SCHEDULE_OFFSETS[env], nextAt: null, timer: null, current: null };
    }
  }

  // First grid slot strictly after `t`. The grid of an environment is
  // bootAt + offsetMs + k · intervalMs; it never drifts, whatever a cycle costs.
  slotAfter(s, t) {
    const base = this.bootAt + s.offsetMs;
    if (t < base) return base;
    return base + (Math.floor((t - base) / intervalMs) + 1) * intervalMs;
  }

  arm(env) {
    const s = this.state[env];
    clearTimeout(s.timer);
    s.timer = setTimeout(() => this.fire(env), Math.max(0, s.nextAt - Date.now()));
  }

  fire(env) {
    const s = this.state[env];
    // A timer may fire a hair early; never pick the slot that is firing now.
    s.nextAt = this.slotAfter(s, Math.max(Date.now(), s.nextAt));
    this.arm(env);
    if (s.current) {
      baseLog.warn("scheduled sync skipped: previous cycle still running", { env });
      return;
    }
    this.runCycle(env, "scheduled");
  }

  runCycle(env, trigger) {
    const s = this.state[env];
    const cycle = { promise: null, trigger, startedAt: new Date().toISOString(), removed: new Set() };
    s.current = cycle;
    cycle.promise = this.checkEnvironment(env, cycle)
      .catch(err => baseLog.error("sync failed", { env, trigger, err }))
      .finally(() => {
        if (s.current === cycle) s.current = null;
      });
    return cycle.promise;
  }

  async checkEnvironment(env, cycle) {
    const log = baseLog.child({ env });
    const started = performance.now();
    const [apps, previous] = await Promise.all([applicationsRepository.list(env), statusRepository.getStatuses(env)]);
    if (apps.length === 0) log.warn("no applications to check", { env });
    const writes = [];
    const results = await mapLimit(apps, CHECK_CONCURRENCY, async app =>
      this.recordResult(env, cycle, previous, await healthCheckService.check(app, log), writes)
    );
    // Apps that left the list (deleted, or edited straight in Mongo) do not stay in the hash.
    const listed = new Set(apps.map(a => a.id));
    writes.push(statusRepository.removeStatuses(env, Object.keys(previous).filter(id => !listed.has(id))));
    const { checked, changed, healthy, degraded, unhealthy } = summarize(results.filter(Boolean));
    const summary = {
      env,
      trigger: cycle.trigger,
      checked,
      changed,
      healthy,
      degraded,
      unhealthy,
      startedAt: cycle.startedAt,
      checkedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
      nextCheckAt: iso(this.state[env].nextAt),
    };
    writes.push(statusRepository.setCycle(env, summary));
    await Promise.all(writes);
    eventsService.publish({ type: "cycle", data: summary });
    log.info("sync completed", { ...summary });
  }

  // Publishes one check result as soon as it ends and queues its Redis write
  // without awaiting it: a slow Redis would delay both the event and the worker.
  // Returns { status, changed }, or null when the app was deleted meanwhile.
  recordResult(env, cycle, previous, r, writes) {
    if (cycle.removed.has(r.id)) return null;
    const entry = { status: r.status, latencyMs: r.latencyMs, checkedAt: new Date().toISOString() };
    if (r.limitMs !== undefined) entry.limitMs = r.limitMs;
    // Only the status counts as a change; no previous status counts too.
    const changed = previous[r.id]?.status !== r.status;
    eventsService.publish({ type: "status", changed, data: { id: r.id, name: r.name, env, ...entry } });
    writes.push(statusRepository.setStatus(env, r.id, entry));
    return { status: r.status, changed };
  }

  describeCycle(env, joined) {
    const { trigger, startedAt } = this.state[env].current;
    return { env, trigger, startedAt, nextCheckAt: iso(this.state[env].nextAt), joined };
  }

  // Runs a cycle now. A cycle already running is joined, not duplicated, and the
  // grid stays as it was. Otherwise only the next scheduled slot is dropped.
  force(env) {
    const s = this.state[env];
    if (s.current) return this.describeCycle(env, true);
    s.nextAt = this.slotAfter(s, Date.now()) + intervalMs;
    this.arm(env);
    this.runCycle(env, "manual");
    return this.describeCycle(env, false);
  }

  start() {
    this.stop();
    this.bootAt = Date.now();
    for (const env of ENVIRONMENTS) {
      this.state[env].nextAt = this.bootAt + this.state[env].offsetMs;
      this.arm(env);
    }
  }

  // An application was deleted: if a cycle of the environment is running, its
  // result for this id is dropped instead of being stored and published.
  forget(env, id) {
    this.state[env].current?.removed.add(id);
  }

  // Running cycles finish on their own.
  stop() {
    for (const env of ENVIRONMENTS) {
      clearTimeout(this.state[env].timer);
      this.state[env].timer = null;
    }
  }

  // ISO time of the next scheduled check, or null before start().
  nextCheckAt(env) {
    const s = this.state[env];
    return s.nextAt === null ? null : iso(s.nextAt);
  }
}

module.exports = new SchedulerService();
