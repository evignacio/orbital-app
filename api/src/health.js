const config = require("./config");

const DEGRADED_LATENCY_MS = config.degradedLatencyMs;
const HEALTH_CHECK_TIMEOUT_MS = config.healthCheckTimeoutMs;

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

module.exports = { checkHealth, mapLimit };
