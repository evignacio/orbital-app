// Shared helpers for the API tests.

// Every environment variable the API reads (config.js + logger.js).
const API_ENV_VARS = [
  "PORT",
  "MONGO_URL",
  "MONGO_USER",
  "MONGO_PASS",
  "MONGO_DB",
  "REDIS_URL",
  "SYNC_CACHE_TTL",
  "APPS_CACHE_TTL",
  "HEALTH_CHECK_CONCURRENCY",
  "HEALTH_CHECK_TIMEOUT_MS",
  "DEGRADED_LATENCY_MS",
  "LOG_LEVEL",
];

// config, logger, cache and db keep state at module level (values read at
// load, clients, maps). Runs `loader` in a fresh module registry with exactly
// `env` set among the API variables, then restores process.env. Mocked modules
// must be required inside `loader` to get the instances the code under test sees.
function loadFresh(env, loader) {
  const saved = {};
  for (const name of API_ENV_VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  Object.assign(process.env, env);
  let loaded;
  try {
    jest.isolateModules(() => {
      loaded = loader();
    });
  } finally {
    for (const name of API_ENV_VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
  return loaded;
}

// Logger double with the same shape as src/logger.js. child() returns the
// same object, so assertions see calls from children too.
function fakeLogger() {
  const log = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    redactUrl: jest.fn(url => url),
  };
  log.child = jest.fn(() => log);
  return log;
}

module.exports = { loadFresh, fakeLogger };
