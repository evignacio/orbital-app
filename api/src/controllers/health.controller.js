// Handlers are arrow-function fields so they work unbound: the router passes
// them to Express as `healthController.check`.
class HealthController {
  // Liveness only: answers while the process is up. It never touches Mongo or
  // Redis, so a dependency outage does not restart or deregister the single
  // instance (the API keeps serving what it can without them).
  check = (req, res) => {
    res.set("Cache-Control", "no-store").json({ status: "UP" });
  };
}

module.exports = new HealthController();
