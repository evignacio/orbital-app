const applicationValidator = require("../../src/validators/application.validator");

// Called through the instance: the methods are class methods and may use this.
const validateApplication = body => applicationValidator.validate(body);
const isValidObjectId = id => applicationValidator.isValidObjectId(id);
const { LIMITS } = applicationValidator;

const valid = {
  name: "checkout-api",
  team: "Pagamentos",
  healthCheckUrl: "https://checkout.interno/actuator/health",
  swaggerUrl: "https://checkout.interno/swagger-ui.html",
  orbits: ["Financeiro", "Pagamentos"],
};

// Errors for `valid` with `patch` applied.
const errorsFor = patch => validateApplication({ ...valid, ...patch }).errors;

describe("validateApplication", () => {
  it("aceita um corpo válido e devolve os cinco campos sem erros", () => {
    expect(validateApplication(valid)).toEqual({ value: valid, errors: {} });
  });

  it("remove espaços nas pontas de todos os campos", () => {
    const { value, errors } = validateApplication({
      name: "  checkout-api ",
      team: " Pagamentos  ",
      healthCheckUrl: " https://checkout.interno/health ",
      swaggerUrl: "  https://checkout.interno/docs\t".replace("\t", " "),
      orbits: [" Financeiro "],
    });

    expect(errors).toEqual({});
    expect(value).toEqual({
      name: "checkout-api",
      team: "Pagamentos",
      healthCheckUrl: "https://checkout.interno/health",
      swaggerUrl: "https://checkout.interno/docs",
      orbits: ["Financeiro"],
    });
  });

  it("descarta campos que não fazem parte da aplicação", () => {
    const { value } = validateApplication({ ...valid, admin: true, _id: "x", $where: "1" });

    expect(Object.keys(value).sort()).toEqual(["healthCheckUrl", "name", "orbits", "swaggerUrl", "team"]);
  });

  it("usa swaggerUrl vazio quando ele é omitido, nulo ou só espaços", () => {
    const { swaggerUrl, ...rest } = valid;
    expect(validateApplication(rest).value.swaggerUrl).toBe("");
    expect(validateApplication({ ...rest, swaggerUrl: null }).value.swaggerUrl).toBe("");
    expect(validateApplication({ ...rest, swaggerUrl: "   " }).value.swaggerUrl).toBe("");
  });

  it.each([null, undefined, "texto", 42, [valid]])("rejeita corpo que não é objeto JSON: %p", body => {
    expect(validateApplication(body)).toEqual({ value: null, errors: { body: "body must be a JSON object" } });
  });

  it.each(["name", "team", "healthCheckUrl"])("exige o campo %s", field => {
    expect(errorsFor({ [field]: undefined })).toEqual({ [field]: `${field} is required` });
    expect(errorsFor({ [field]: "   " })).toEqual({ [field]: `${field} is required` });
  });

  it("reporta todos os campos inválidos de uma vez", () => {
    expect(Object.keys(validateApplication({}).errors).sort()).toEqual(["healthCheckUrl", "name", "orbits", "team"]);
  });

  describe("tipos (injeção de operadores do Mongo)", () => {
    it.each([
      ["objeto com operador", { $gt: "" }],
      ["objeto com $where", { $where: "sleep(1000)" }],
      ["número", 123],
      ["booleano", true],
      ["array", ["checkout-api"]],
    ])("rejeita %s em qualquer campo", (_, bad) => {
      for (const field of ["name", "team", "healthCheckUrl", "swaggerUrl"]) {
        expect(errorsFor({ [field]: bad })).toEqual({ [field]: `${field} must be a string` });
      }
    });
  });

  describe("name", () => {
    it.each(["ab", "checkout-api", "billing.v2", "auth_gateway", "A1"])("aceita %p", name => {
      expect(errorsFor({ name })).toEqual({});
    });

    it.each([
      ["com espaço", "checkout api"],
      ["com tag HTML", "<script>alert(1)</script>"],
      ["começando com hífen", "-checkout"],
      ["com operador do Mongo", "$gt"],
      ["com barra", "a/b"],
      ["com acento", "catálogo"],
    ])("rejeita nome %s", (_, name) => {
      expect(errorsFor({ name }).name).toMatch(/may contain only/);
    });

    it("rejeita nomes mais curtos ou mais longos que o limite", () => {
      expect(errorsFor({ name: "a" }).name).toMatch(/between/);
      expect(errorsFor({ name: "a".repeat(LIMITS.nameMax + 1) }).name).toMatch(/between/);
      expect(errorsFor({ name: "a".repeat(LIMITS.nameMax) })).toEqual({});
    });
  });

  describe("team", () => {
    it.each(["Pagamentos", "Time de Produtos", "Integração", "squad_2.0-b"])("aceita %p", team => {
      expect(errorsFor({ team })).toEqual({});
    });

    it.each([
      ["com tag HTML", "<b>Dados</b>"],
      ["com aspas", 'Dados"'],
      ["com chaves", "{Dados}"],
    ])("rejeita time %s", (_, team) => {
      expect(errorsFor({ team }).team).toMatch(/may contain only/);
    });

    it("rejeita times mais curtos ou mais longos que o limite", () => {
      expect(errorsFor({ team: "D" }).team).toMatch(/between/);
      expect(errorsFor({ team: "D".repeat(LIMITS.teamMax + 1) }).team).toMatch(/between/);
    });
  });

  it.each([
    ["nulo", "\u0000"],
    ["quebra de linha", "\n"],
    ["DEL", "\u007f"],
  ])("rejeita caractere de controle (%s) em qualquer campo", (_, ch) => {
    for (const field of ["name", "team", "healthCheckUrl", "swaggerUrl"]) {
      expect(errorsFor({ [field]: `${valid[field]}${ch}` })).toEqual({
        [field]: `${field} must not contain control characters`,
      });
    }
  });

  describe("orbits", () => {
    it("exige ao menos uma órbita", () => {
      expect(errorsFor({ orbits: undefined })).toEqual({ orbits: "orbits is required" });
      expect(errorsFor({ orbits: null })).toEqual({ orbits: "orbits is required" });
      expect(errorsFor({ orbits: [] })).toEqual({ orbits: "orbits is required" });
    });

    it.each([
      ["texto solto", "Financeiro"],
      ["objeto com operador", { $in: ["Financeiro"] }],
      ["número dentro da lista", ["Financeiro", 42]],
      ["operador dentro da lista", [{ $gt: "" }]],
      ["lista aninhada", [["Financeiro"]]],
    ])("rejeita %s", (_, orbits) => {
      expect(errorsFor({ orbits })).toEqual({ orbits: "orbits must be an array of strings" });
    });

    it("aceita acentos, dígitos, espaços, '.', '_' e '-'", () => {
      expect(errorsFor({ orbits: ["Integrações", "Dream team", "squad_2.0-b"] })).toEqual({});
    });

    it("rejeita órbita com caractere fora do formato, de controle ou fora do tamanho", () => {
      expect(errorsFor({ orbits: ["<b>Dados</b>"] }).orbits).toMatch(/may contain only/);
      expect(errorsFor({ orbits: ["Dados\n"] })).toEqual({ orbits: "orbits must not contain control characters" });
      expect(errorsFor({ orbits: ["D"] }).orbits).toMatch(/between/);
      expect(errorsFor({ orbits: ["   "] }).orbits).toMatch(/between/);
      expect(errorsFor({ orbits: ["D".repeat(LIMITS.orbitMax + 1)] }).orbits).toMatch(/between/);
      expect(errorsFor({ orbits: ["D".repeat(LIMITS.orbitMax)] })).toEqual({});
    });

    it("remove espaços das pontas e descarta repetidas (sem acento, caixa ou espaço), mantendo a primeira grafia", () => {
      const { value, errors } = validateApplication({ ...valid, orbits: [" Integrações ", "integracoes", "Dream team", "DREAM-TEAM", "Dados"] });

      expect(errors).toEqual({});
      expect(value.orbits).toEqual(["Integrações", "Dream team", "Dados"]);
    });

    it("limita a quantidade de órbitas, contando só as distintas", () => {
      const many = n => Array.from({ length: n }, (_, i) => `Orbita ${i}`);
      expect(errorsFor({ orbits: many(LIMITS.orbitsMax) })).toEqual({});
      expect(errorsFor({ orbits: [...many(LIMITS.orbitsMax), "orbita 0"] })).toEqual({});
      expect(errorsFor({ orbits: many(LIMITS.orbitsMax + 1) })).toEqual({ orbits: `orbits must have at most ${LIMITS.orbitsMax} items` });
    });
  });

  describe("URLs", () => {
    it.each([
      "http://billing:8080/health",
      "https://10.0.0.5/actuator/health",
      "https://hml-catalogo.interno/actuator/health?full=1",
    ])("aceita %p (hosts internos continuam permitidos)", healthCheckUrl => {
      expect(errorsFor({ healthCheckUrl })).toEqual({});
    });

    it.each([
      ["javascript:", "javascript:alert(1)"],
      ["data:", "data:text/html,<script>alert(1)</script>"],
      ["file:", "file:///etc/passwd"],
      ["ftp:", "ftp://billing/health"],
    ])("rejeita o protocolo %s", (_, url) => {
      expect(errorsFor({ healthCheckUrl: url })).toEqual({ healthCheckUrl: "healthCheckUrl must use http or https" });
      expect(errorsFor({ swaggerUrl: url })).toEqual({ swaggerUrl: "swaggerUrl must use http or https" });
    });

    it.each(["não é url", "billing/health", "http://", "https:// espaço.com"])("rejeita URL malformada %p", url => {
      expect(errorsFor({ healthCheckUrl: url }).healthCheckUrl).toBe("healthCheckUrl must be a valid URL");
    });

    it("rejeita URL com usuário ou senha embutidos", () => {
      expect(errorsFor({ healthCheckUrl: "https://admin:segredo@billing/health" })).toEqual({
        healthCheckUrl: "healthCheckUrl must not contain credentials",
      });
      expect(errorsFor({ swaggerUrl: "https://admin@billing/docs" })).toEqual({
        swaggerUrl: "swaggerUrl must not contain credentials",
      });
    });

    it("rejeita URL maior que o limite", () => {
      const long = `https://billing/${"a".repeat(LIMITS.urlMax)}`;
      expect(errorsFor({ healthCheckUrl: long })).toEqual({
        healthCheckUrl: `healthCheckUrl must be at most ${LIMITS.urlMax} characters`,
      });
    });

    it("grava a URL como digitada, sem normalizar", () => {
      const healthCheckUrl = "HTTPS://Billing.Interno/Health";
      expect(validateApplication({ ...valid, healthCheckUrl }).value.healthCheckUrl).toBe(healthCheckUrl);
    });
  });
});

describe("isValidObjectId", () => {
  it("aceita 24 caracteres hexadecimais, em qualquer caixa", () => {
    expect(isValidObjectId("64b000000000000000000001")).toBe(true);
    expect(isValidObjectId("64B0000000000000000000FF")).toBe(true);
  });

  it.each([
    ["12 caracteres (aceito por new ObjectId)", "aaaaaaaaaaaa"],
    ["23 caracteres", "64b00000000000000000000"],
    ["caracteres não hexadecimais", "64b00000000000000000000z"],
    ["objeto", { $ne: null }],
    ["vazio", ""],
  ])("rejeita %s", (_, id) => {
    expect(isValidObjectId(id)).toBe(false);
  });
});
