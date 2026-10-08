const { ObjectId } = require("mongodb");
const { connect } = require("../config/database");
const cache = require("../utils/cache");
const config = require("../config");

const APPS_TTL = config.appsCacheTtl;

class ApplicationsRepository {
  toCollection(env) {
    return `applications_${env}`;
  }

  serialize(doc) {
    const { _id, ...rest } = doc;
    return { id: _id.toString(), ...rest };
  }

  // One environment's applications, serialized. Cached under apps:<env> for
  // APPS_TTL and shared by GET /, the scheduler and the SSE snapshot; create and
  // delete invalidate it.
  list(env) {
    return cache.withCache(`apps:${env}`, APPS_TTL, async () => {
      const db = await connect();
      const docs = await db.collection(this.toCollection(env)).find().toArray();
      return docs.map(doc => this.serialize(doc));
    });
  }

  invalidate(env) {
    return cache.invalidate(`apps:${env}`);
  }

  // Inserts the (already validated) application and returns it with its new id.
  // The cache is invalidated only after the insert succeeds.
  async create(env, doc) {
    const db = await connect();
    // A copy: insertOne adds _id to the object it is given.
    const { insertedId } = await db.collection(this.toCollection(env)).insertOne({ ...doc });
    await this.invalidate(env);
    return { id: insertedId.toString(), ...doc };
  }

  // Removes the application by id (24 hex chars, validated by the caller).
  // Returns false when nothing matched, leaving the cache untouched. onDeleted
  // runs synchronously right after the delete, before any other await, so the
  // caller can stop an in-flight check of this app before it can be published.
  async remove(env, id, { onDeleted } = {}) {
    const db = await connect();
    const { deletedCount } = await db.collection(this.toCollection(env)).deleteOne({ _id: new ObjectId(id) });
    if (deletedCount === 0) return false;
    onDeleted?.();
    await this.invalidate(env);
    return true;
  }
}

module.exports = new ApplicationsRepository();
