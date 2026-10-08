const config = require("../config");

const result = (app, status, latencyMs, extra) => ({ id: app.id, name: app.name, status, latencyMs, ...extra });

class HealthCheckService {
  constructor() {
    // Read once at load, like the rest of the config.
    this.degradedLatencyMs = config.degradedLatencyMs;
    this.timeoutMs = config.healthCheckTimeoutMs;
  }

  // A 2xx slower than degradedLatencyMs is "degraded"; any error wins over
  // slowness. Latency is measured up to the response headers. Unhealthy and
  // degraded apps log a warn: the problem is the monitored app, not this API.
  async check(app, log) {
    const started = performance.now();
    const ctx = { app: app.name, id: app.id, url: app.healthCheckUrl };
    try {
      const response = await fetch(app.healthCheckUrl, { signal: AbortSignal.timeout(this.timeoutMs) });
      const latencyMs = Math.round(performance.now() - started);
      // The body is never read; cancel it so the connection is released now.
      response.body?.cancel().catch(() => {});
      if (!response.ok) {
        log.warn("health check unhealthy", { ...ctx, httpStatus: response.status, latencyMs });
        return result(app, "unhealthy", latencyMs);
      }
      if (latencyMs > this.degradedLatencyMs) {
        log.warn("health check degraded", { ...ctx, latencyMs, limitMs: this.degradedLatencyMs });
        return result(app, "degraded", latencyMs, { limitMs: this.degradedLatencyMs });
      }
      return result(app, "healthy", latencyMs);
    } catch (err) {
      const reason = err.name === "TimeoutError" ? "timeout" : err.cause?.code || err.message;
      log.warn("health check unhealthy", { ...ctx, reason, timeoutMs: this.timeoutMs });
      // No response, so no latency to report.
      return result(app, "unhealthy", null);
    }
  }
}

module.exports = new HealthCheckService();
