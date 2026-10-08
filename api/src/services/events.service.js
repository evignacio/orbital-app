// In-memory bus of SSE subscribers. Single process: with more than one API
// instance each one would only reach its own clients.
class EventsService {
  constructor() {
    this.clients = new Set(); // { res, changesOnly, queue }
  }

  // One SSE message. JSON.stringify never emits a newline, so one data: line is enough.
  send(res, type, data) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // Returns this client's { release, unsubscribe }. With `hold`, what is
  // published is queued instead of written until release(): the route subscribes
  // first, sends the snapshots, then releases, so no event published while the
  // snapshots are being built is lost.
  subscribe(res, { changesOnly = false, hold = false } = {}) {
    const client = { res, changesOnly, queue: hold ? [] : null };
    this.clients.add(client);
    return {
      // Writes what was queued, in order, and delivers live from now on.
      release: () => {
        const queue = client.queue;
        if (!queue) return;
        client.queue = null;
        for (const { type, data } of queue) this.deliver(client, type, data);
      },
      unsubscribe: () => {
        this.clients.delete(client);
        client.queue = null; // a release after this has nothing to write
      },
    };
  }

  deliver(client, type, data) {
    try {
      this.send(client.res, type, data);
    } catch {
      // A broken connection is cleaned up by its own "close" event.
    }
  }

  // "status" goes to everyone except changes-only clients when it is not a
  // change; "cycle" goes to everyone.
  publish({ type, data, changed }) {
    for (const client of this.clients) {
      if (type === "status" && client.changesOnly && !changed) continue;
      if (client.queue) client.queue.push({ type, data });
      else this.deliver(client, type, data);
    }
  }

  closeAll() {
    for (const client of this.clients) client.res.end();
    this.clients.clear();
  }

  clientCount() {
    return this.clients.size;
  }
}

module.exports = new EventsService();
