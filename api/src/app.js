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

module.exports = app;
