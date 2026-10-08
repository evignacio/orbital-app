// Body parser failures and anything uncaught still answer JSON, never
// Express's default HTML page (which also carries the stack trace).
// Express recognizes an error handler by its 4 arguments, so `next` stays.
function errorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });
  // Other body-parser rejections (unsupported charset or encoding) carry a 4xx.
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: "Invalid request body" });
  // asyncRoute already logged it with the route's context.
  if (!err.logged) req.log.error("unhandled error", { err });
  res.status(500).json({ error: "Internal error" });
}

module.exports = errorHandler;
