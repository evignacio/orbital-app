let config;
try {
  config = require("./config");
} catch (err) {
  require("./logger").error("invalid configuration", { err });
  process.exit(1);
}
const log = require("./logger");
const app = require("./app");

const PORT = config.port;

process.on("unhandledRejection", reason => {
  log.error("unhandled rejection", { err: reason });
});
process.on("uncaughtException", err => {
  log.error("uncaught exception", { err });
  process.exit(1);
});

app.listen(PORT, () => {
  log.info("api started", {
    port: PORT,
    mongoUrl: log.redactUrl(config.mongoUrl),
    redisUrl: log.redactUrl(config.redisUrl),
    syncCacheTtl: config.syncCacheTtl,
    appsCacheTtl: config.appsCacheTtl,
    healthCheckConcurrency: config.healthCheckConcurrency,
    healthCheckTimeoutMs: config.healthCheckTimeoutMs,
    degradedLatencyMs: config.degradedLatencyMs,
  });
});
