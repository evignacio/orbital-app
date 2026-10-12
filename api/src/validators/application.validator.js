// Input validation for the application routes. Every field must be a string:
// that alone keeps Mongo operators ({ "$gt": "" }) and other objects out of the
// database. URLs are limited to http/https because swaggerUrl ends up as a
// link href in the UI (no javascript:) and healthCheckUrl is fetched here.

const LIMITS = { nameMin: 2, nameMax: 60, teamMin: 2, teamMax: 60, urlMax: 2048, orbitMin: 2, orbitMax: 40, orbitsMax: 10 };

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TEAM_RE = /^[\p{L}\p{N} ._-]+$/u;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

// Trimmed string, or an error message. Absent (undefined/null/"") → "".
function cleanString(value, field) {
  if (value === undefined || value === null) return { value: "" };
  if (typeof value !== "string") return { error: `${field} must be a string` };
  if (CONTROL_RE.test(value)) return { error: `${field} must not contain control characters` };
  return { value: value.trim() };
}

function checkText(raw, field, { min, max, re, format }) {
  const { value, error } = cleanString(raw, field);
  if (error) return { error };
  if (!value) return { error: `${field} is required` };
  if (value.length < min || value.length > max) {
    return { error: `${field} must be between ${min} and ${max} characters` };
  }
  if (!re.test(value)) return { error: `${field} ${format}` };
  return { value };
}

function checkUrl(raw, field, { required }) {
  const { value, error } = cleanString(raw, field);
  if (error) return { error };
  if (!value) return required ? { error: `${field} is required` } : { value: "" };
  if (value.length > LIMITS.urlMax) return { error: `${field} must be at most ${LIMITS.urlMax} characters` };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: `${field} must be a valid URL` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { error: `${field} must use http or https` };
  if (url.username || url.password) return { error: `${field} must not contain credentials` };
  return { value };
}

// Identity of an orbit: no accents, lowercase, spaces as "-". Two spellings with
// the same key are the same orbit ("Integrações" = "integracoes"). The frontend's
// orbitKey() is the same function and uses the key in ?orbita=.
function orbitKey(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "-");
}

// 1..orbitsMax orbit names, each one a team-like text. Duplicates (same
// orbitKey) are dropped, keeping the first spelling.
function checkOrbits(raw, limits) {
  if (raw === undefined || raw === null) return { error: "orbits is required" };
  if (!Array.isArray(raw)) return { error: "orbits must be an array of strings" };
  const value = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== "string") return { error: "orbits must be an array of strings" };
    if (CONTROL_RE.test(item)) return { error: "orbits must not contain control characters" };
    const name = item.trim();
    if (name.length < limits.orbitMin || name.length > limits.orbitMax) {
      return { error: `each orbit must be between ${limits.orbitMin} and ${limits.orbitMax} characters` };
    }
    if (!TEAM_RE.test(name)) return { error: "orbits may contain only letters, digits, spaces, '.', '_' and '-'" };
    const key = orbitKey(name);
    if (!seen.has(key)) {
      seen.add(key);
      value.push(name);
    }
  }
  if (value.length === 0) return { error: "orbits is required" };
  if (value.length > limits.orbitsMax) return { error: `orbits must have at most ${limits.orbitsMax} items` };
  return { value };
}

class ApplicationValidator {
  constructor() {
    this.LIMITS = LIMITS;
  }

  // { value, errors }: value holds only the known fields, trimmed; errors maps
  // field → message and is empty when the body is valid.
  validate(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { value: null, errors: { body: "body must be a JSON object" } };
    }
    const checks = {
      name: checkText(body.name, "name", {
        min: this.LIMITS.nameMin, max: this.LIMITS.nameMax, re: NAME_RE,
        format: "may contain only letters, digits, '.', '_' and '-', starting with a letter or digit",
      }),
      team: checkText(body.team, "team", {
        min: this.LIMITS.teamMin, max: this.LIMITS.teamMax, re: TEAM_RE,
        format: "may contain only letters, digits, spaces, '.', '_' and '-'",
      }),
      healthCheckUrl: checkUrl(body.healthCheckUrl, "healthCheckUrl", { required: true }),
      swaggerUrl: checkUrl(body.swaggerUrl, "swaggerUrl", { required: false }),
      orbits: checkOrbits(body.orbits, this.LIMITS),
    };
    const value = {};
    const errors = {};
    for (const [field, result] of Object.entries(checks)) {
      if (result.error) errors[field] = result.error;
      else value[field] = result.value;
    }
    return { value, errors };
  }

  isValidObjectId(id) {
    return typeof id === "string" && OBJECT_ID_RE.test(id);
  }
}

module.exports = new ApplicationValidator();
