// The environments the API serves: each one is a Mongo collection
// (applications_<name>) and a slot on the scheduler's grid. The cycles run
// 10 s apart so the three never hit the monitored apps at once.
const TABLE = [
  { name: "development", offsetMs: 20000 },
  { name: "staging", offsetMs: 10000 },
  { name: "production", offsetMs: 0 },
];

const ENVIRONMENTS = TABLE.map(e => e.name);
const SCHEDULE_OFFSETS = Object.fromEntries(TABLE.map(e => [e.name, e.offsetMs]));

module.exports = { ENVIRONMENTS, SCHEDULE_OFFSETS };
