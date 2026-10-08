const { randomUUID } = require("crypto");
const log = require("../utils/logger");

// One line per request, when the response is done. "close" fires once on every
// response, including an SSE stream the client drops (where "finish" never
// does); there durationMs is how long it stayed connected. Preflights are
// answered by the CORS middleware before this one; 4xx logs as warn, 5xx as error.
function requestLogger(req, res, next) {
  const started = performance.now();
  req.log = log.child({ reqId: randomUUID().slice(0, 8) });
  res.on("close", () => {
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
}

module.exports = requestLogger;
