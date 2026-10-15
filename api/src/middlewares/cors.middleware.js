const config = require("../config");
// CORS_ORIGINS unset (default) allows no origin: the browser reaches the API same-origin
// through nginx (or Vite's proxy in dev), so no CORS header is needed. A list reflects
// only the origins in it; "*" (only when set explicitly) reflects any. A disallowed
// origin gets no Allow-* header, so the browser blocks it. Preflights are answered here
// with 204, before they reach the request logger.
function cors(req, res, next) {
  const origin = req.headers.origin;
  const allowAny = config.corsOrigins.includes("*");

  if (allowAny || (origin && config.corsOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

module.exports = cors;
