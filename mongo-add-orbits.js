// Puts every application that has no `orbits` yet into the "Dream team" orbit.
// Idempotent: documents that already have the field are left alone.
// Local stack:
//   docker compose -f docker-compose.local.yml exec -T mongo mongosh orbital < mongo-add-orbits.js
// Afterwards drop the cached lists (orbital:apps:<env>) or wait APPS_CACHE_TTL.

["applications_development", "applications_staging", "applications_production"].forEach(name => {
  const { matchedCount, modifiedCount } = db.getCollection(name).updateMany(
    { orbits: { $exists: false } },
    { $set: { orbits: ["Dream team"] } }
  );
  print(`${name}: ${modifiedCount} de ${matchedCount} apps sem órbita foram para "Dream team"`);
});
