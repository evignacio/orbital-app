const { ENVIRONMENTS } = require("../config/environments");

// router.param("env", validateEnv): every route with :env checks it here first.
function validateEnv(req, res, next, env) {
  if (!ENVIRONMENTS.includes(env)) {
    req.log.warn("unknown environment", { env });
    return res
      .status(404)
      .json({ error: `Environment "${env}" not found. Valid values: ${ENVIRONMENTS.join(", ")}` });
  }
  next();
}

module.exports = validateEnv;
