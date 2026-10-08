const applicationsRepository = require("../repositories/applications.repository");
const statusRepository = require("../repositories/status.repository");
const schedulerService = require("./scheduler.service");

class SnapshotService {
  // One environment's SSE snapshot: the application list crossed with the last
  // stored status. Applications never checked go out with null status.
  async build(env) {
    const [apps, statuses, cycle] = await Promise.all([
      applicationsRepository.list(env),
      statusRepository.getStatuses(env),
      statusRepository.getCycle(env),
    ]);
    return {
      env,
      apps: apps.map(app => {
        const last = statuses[app.id];
        return {
          id: app.id,
          name: app.name,
          env,
          status: last?.status ?? null,
          latencyMs: last?.latencyMs ?? null,
          ...(last?.limitMs !== undefined && { limitMs: last.limitMs }),
          checkedAt: last?.checkedAt ?? null,
        };
      }),
      cycle,
      nextCheckAt: schedulerService.nextCheckAt(env),
    };
  }

  // Sent instead when build() fails, so the stream still opens with all
  // three environments.
  empty(env) {
    return { env, apps: [], cycle: null, nextCheckAt: schedulerService.nextCheckAt(env) };
  }
}

module.exports = new SnapshotService();
