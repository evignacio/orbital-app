const { ENVIRONMENTS } = require("../config/environments");
const eventsService = require("../services/events.service");
const snapshotService = require("../services/snapshot.service");

// A comment line now and then, so proxies do not drop an idle connection.
const SSE_HEARTBEAT_MS = 15000;
// How long the browser waits before reopening a dropped stream.
const SSE_RETRY_MS = 3000;

// Handlers are arrow-function fields so they work unbound: the router passes
// them to Express as `eventsController.stream`.
class EventsController {
  // Server-sent events for the three environments: a snapshot each on connect,
  // then a "status" per checked application and a "cycle" at the end of each cycle.
  // ?changes=true delivers only the "status" events whose status changed.
  stream = async (req, res) => {
    const { changes } = req.query;
    if (changes !== undefined && changes !== "true" && changes !== "false") {
      req.log.warn("events rejected: invalid changes parameter", { changes });
      return res.status(400).json({ error: "Invalid changes parameter. Valid values: true, false" });
    }

    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(`retry: ${SSE_RETRY_MS}\n\n`);

    // Subscribed before the snapshots are built, with delivery held: an event
    // published meanwhile is queued and goes out right after them.
    const subscription = eventsService.subscribe(res, { changesOnly: changes === "true", hold: true });
    let closed = false;
    const heartbeat = setInterval(() => res.write(": ping\n\n"), SSE_HEARTBEAT_MS);
    req.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });

    const snapshots = await Promise.all(
      ENVIRONMENTS.map(async env => {
        try {
          return await snapshotService.build(env);
        } catch (err) {
          req.log.error("events snapshot failed", { env, err });
          return snapshotService.empty(env);
        }
      })
    );
    if (closed) return;
    for (const snapshot of snapshots) eventsService.send(res, "snapshot", snapshot);
    subscription.release();
  };
}

module.exports = new EventsController();
