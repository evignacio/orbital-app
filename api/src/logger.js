// Structured logger: one JSON object per line. info goes to stdout, warn and
// error to stderr. LOG_LEVEL (info | warn | error) is read straight from the
// environment, not from config.js, so the logger still works when the config
// is invalid.

const LEVELS = { info: 10, warn: 20, error: 30 };

const configured = (process.env.LOG_LEVEL || "").trim().toLowerCase();
const minLevel = LEVELS[configured] ?? LEVELS.info;

// Errors don't survive JSON.stringify (their fields are non-enumerable).
// fetch() failures carry the real reason (ECONNREFUSED, ENOTFOUND…) in `cause`.
function serializeError(err, withStack) {
  const out = { name: err.name, message: err.message };
  if (err.code !== undefined) out.code = err.code;
  if (err.cause !== undefined) {
    out.cause = err.cause instanceof Error ? serializeError(err.cause, false) : err.cause;
  }
  if (withStack && err.stack) out.stack = err.stack;
  return out;
}

function write(level, bindings, msg, fields) {
  if (LEVELS[level] < minLevel) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...bindings };
  for (const [key, value] of Object.entries(fields || {})) {
    entry[key] = value instanceof Error ? serializeError(value, level === "error") : value;
  }
  let line;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ ts: entry.ts, level, msg, ...bindings, logError: "unserializable fields" });
  }
  (level === "info" ? process.stdout : process.stderr).write(line + "\n");
}

// child({ reqId }) returns a logger that adds those fields to every line.
function create(bindings) {
  return {
    info: (msg, fields) => write("info", bindings, msg, fields),
    warn: (msg, fields) => write("warn", bindings, msg, fields),
    error: (msg, fields) => write("error", bindings, msg, fields),
    child: extra => create({ ...bindings, ...extra }),
  };
}

// Strips credentials from a connection URL before it is logged.
function redactUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.username) url.username = "***";
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "<invalid url>";
  }
}

const log = create({});

if (configured && !(configured in LEVELS)) {
  log.warn("invalid LOG_LEVEL, using info", { value: process.env.LOG_LEVEL });
}

module.exports = { ...log, redactUrl };
