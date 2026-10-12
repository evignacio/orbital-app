const { ENVIRONMENTS } = require("../config/environments");
const applicationsRepository = require("../repositories/applications.repository");
const statusRepository = require("../repositories/status.repository");
const schedulerService = require("../services/scheduler.service");
const applicationValidator = require("../validators/application.validator");

// Handlers are arrow-function fields so they work unbound: the router passes
// them to Express as `applicationsController.list`.
class ApplicationsController {
  list = async (req, res) => {
    const result = {};
    await Promise.all(
      ENVIRONMENTS.map(async (env) => {
        result[env] = await applicationsRepository.list(env);
      })
    );
    res.json(result);
  };

  create = async (req, res) => {
    const { env } = req.params;
    const { value: doc, errors } = applicationValidator.validate(req.body);
    const invalid = Object.keys(errors);
    if (invalid.length > 0) {
      // Only the field names: rejected values are client input and stay out of the logs.
      req.log.warn("create application rejected: invalid fields", { env, fields: invalid });
      return res.status(400).json({ error: "Invalid application", fields: errors });
    }

    const created = await applicationsRepository.create(env, doc);
    req.log.info("application created", { env, id: created.id, name: doc.name, team: doc.team, orbits: doc.orbits, healthCheckUrl: doc.healthCheckUrl });
    res.status(201).json(created);
  };

  // Full replacement of the editable fields (same rules as create); the
  // environment is part of the path and cannot change.
  update = async (req, res) => {
    const { env, id } = req.params;
    if (!applicationValidator.isValidObjectId(id)) {
      req.log.warn("update application rejected: invalid id", { env, id });
      return res.status(400).json({ error: "Invalid id format" });
    }
    const { value: doc, errors } = applicationValidator.validate(req.body);
    const invalid = Object.keys(errors);
    if (invalid.length > 0) {
      req.log.warn("update application rejected: invalid fields", { env, id, fields: invalid });
      return res.status(400).json({ error: "Invalid application", fields: errors });
    }

    // A new health check URL makes the stored status (and a check of the old URL
    // already in flight) meaningless: the app goes back to "not checked yet".
    const urlChanged = previous => previous.healthCheckUrl !== doc.healthCheckUrl;
    const result = await applicationsRepository.update(env, id, doc, {
      onUpdated: previous => { if (urlChanged(previous)) schedulerService.forget(env, id); }
    });
    if (!result) {
      req.log.warn("update application: not found", { env, id });
      return res.status(404).json({ error: "Application not found" });
    }
    if (urlChanged(result.before)) await statusRepository.removeStatuses(env, [id]);
    req.log.info("application updated", { env, id, name: doc.name, team: doc.team, orbits: doc.orbits, healthCheckUrl: doc.healthCheckUrl });
    res.json(result.after);
  };

  remove = async (req, res) => {
    const { env, id } = req.params;
    // 24 hex characters only: new ObjectId() would also take any 12-character string.
    if (!applicationValidator.isValidObjectId(id)) {
      req.log.warn("delete application rejected: invalid id", { env, id });
      return res.status(400).json({ error: "Invalid id format" });
    }
    // A check of this app already in flight must not bring its status back.
    const deleted = await applicationsRepository.remove(env, id, { onDeleted: () => schedulerService.forget(env, id) });
    if (!deleted) {
      req.log.warn("delete application: not found", { env, id });
      return res.status(404).json({ error: "Application not found" });
    }
    await statusRepository.removeStatuses(env, [id]);
    req.log.info("application deleted", { env, id });
    res.status(204).end();
  };

  // Forces a cycle for the environment (or joins the one running). The results
  // arrive through GET /events, not in this response.
  sync = (req, res) => {
    res.status(202).json(schedulerService.force(req.params.env));
  };
}

module.exports = new ApplicationsController();
