let config;
try {
  config = require("./config");
} catch (err) {
  require("./logger").error("invalid configuration", { err });
  process.exit(1);
}
const { randomUUID } = require("crypto");
const express = require("express");
const log = require("./logger");
const applicationsRouter = require("./routes/applications");

const app = express();
const PORT = config.port;

process.on("unhandledRejection", reason => {
  log.error("unhandled rejection", { err: reason });
});
process.on("uncaughtException", err => {
  log.error("uncaught exception", { err });
  process.exit(1);
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// One line per request, after the response is sent. Preflights are skipped
// above; 4xx logs as warn, 5xx as error.
app.use((req, res, next) => {
  const started = performance.now();
  req.log = log.child({ reqId: randomUUID().slice(0, 8) });
  res.on("finish", () => {
    const status = res.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    req.log[level]("request completed", {
      method: req.method,
      path: req.originalUrl,
      status,
      durationMs: Math.round(performance.now() - started),
    });
  });
  next();
});
app.use(express.json());
app.use("/applications", applicationsRouter);

app.listen(PORT, () => {
  log.info("api started", {
    port: PORT,
    mongoUrl: log.redactUrl(config.mongoUrl),
    redisUrl: log.redactUrl(config.redisUrl),
    syncCacheTtl: config.syncCacheTtl,
    healthCheckConcurrency: config.healthCheckConcurrency,
    healthCheckTimeoutMs: config.healthCheckTimeoutMs,
    degradedLatencyMs: config.degradedLatencyMs,
  });
});
