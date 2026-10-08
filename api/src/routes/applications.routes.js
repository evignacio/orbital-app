const { Router } = require("express");
const asyncRoute = require("../middlewares/async-route.middleware");
const validateEnv = require("../middlewares/validate-env.middleware");
const applicationsController = require("../controllers/applications.controller");
const eventsController = require("../controllers/events.controller");

const router = Router();

router.param("env", validateEnv);

router.get("/", asyncRoute("list applications failed", () => ({}), applicationsController.list));
router.get("/events", eventsController.stream);
router.post("/:env/sync", applicationsController.sync);
// create only fails after validation passed, so name is an accepted string.
router.post(
  "/:env",
  asyncRoute("create application failed", req => ({ env: req.params.env, name: req.body.name.trim() }), applicationsController.create)
);
router.delete(
  "/:env/:id",
  asyncRoute("delete application failed", req => ({ env: req.params.env, id: req.params.id }), applicationsController.remove)
);

module.exports = router;
