let config;
try {
  config = require("./config");
} catch (err) {
  require("./utils/logger").error("invalid configuration", { err });
  process.exit(1);
}
const log = require("./utils/logger");
const app = require("./app");
const eventsService = require("./services/events.service");
const schedulerService = require("./services/scheduler.service");

const PORT = config.port;

process.on("unhandledRejection", reason => {
  log.error("unhandled rejection", { err: reason });
});
process.on("uncaughtException", err => {
  log.error("uncaught exception", { err });
  process.exit(1);
});

const server = app.listen(PORT, () => {
  log.info("api started", {
    port: PORT,
    mongoUrl: log.redactUrl(config.mongoUrl),
    redisUrl: log.redactUrl(config.redisUrl),
    healthCheckIntervalS: config.healthCheckIntervalS,
    appsCacheTtl: config.appsCacheTtl,
    healthCheckConcurrency: config.healthCheckConcurrency,
    healthCheckTimeoutMs: config.healthCheckTimeoutMs,
    degradedLatencyMs: config.degradedLatencyMs,
  });
  schedulerService.start();
});

function shutdown(signal) {
  log.info("api stopping", { signal });
  schedulerService.stop();
  // Without this, server.close() would wait for the SSE streams forever.
  eventsService.closeAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
