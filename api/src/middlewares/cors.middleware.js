const config = require("../config");
// CORS_ORIGINS="*" (default) reflects any origin (the browser reaches the API through
// nginx anyway); a list only reflects the origins in it, and any other origin gets no
// Allow-Origin header, so the browser blocks it. Preflights are answered here, before
// they reach the request logger.
function cors(req, res, next) {
  const allowAny = config.corsOrigins.includes("*");
  const origin = req.headers.origin;
  
  if (allowAny) 
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  else if (origin && config.corsOrigins.includes(origin)) 
    res.setHeader("Access-Control-Allow-Origin", origin);
  
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

module.exports = cors;
