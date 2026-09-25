const { randomUUID } = require("crypto");
const express = require("express");
const log = require("./logger");
const applicationsRouter = require("./routes/applications");

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
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
app.use(express.json({ limit: "10kb", strict: true }));
app.use("/applications", applicationsRouter);

// Body parser failures and anything uncaught still answer JSON, never
// Express's default HTML page (which also carries the stack trace).
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });
  // Other body-parser rejections (unsupported charset or encoding) carry a 4xx.
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: "Invalid request body" });
  req.log.error("unhandled error", { err });
  res.status(500).json({ error: "Internal error" });
});

module.exports = app;
