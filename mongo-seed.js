// Run with: mongosh orbital mongo-seed.js

db.applications_development.drop();
db.applications_staging.drop();
db.applications_production.drop();

db.applications_development.insertMany([
  {
    name: "checkout-api",
    team: "Pagamentos",
    healthCheckUrl: "https://petstore.swagger.io/v2/swagger.json",
    swaggerUrl: "",
  },
  {
    name: "catalogo-service",
    team: "Produtos",
    healthCheckUrl: "https://httpbin.org/status/200",
    swaggerUrl: "https://petstore.swagger.io/",
  },
  {
    name: "notificacoes-worker",
    team: "Engajamento",
    healthCheckUrl: "https://dev-notificacoes.interno/health",
    swaggerUrl: "",
  },
  {
    name: "auth-gateway",
    team: "Plataforma",
    healthCheckUrl: "https://httpbin.org/status/204",
    swaggerUrl: "https://petstore.swagger.io/",
  },
]);

db.applications_staging.insertMany([
  {
    name: "auth-gateway",
    team: "Plataforma",
    healthCheckUrl: "https://servico-inexistente-xyz.internal/health",
    swaggerUrl: "https://petstore.swagger.io/",
  },
  {
    name: "checkout-api",
    team: "Pagamentos",
    healthCheckUrl: "https://httpbin.org/status/200",
    swaggerUrl: "https://petstore.swagger.io/",
  },
  {
    name: "catalogo-service",
    team: "Produtos",
    healthCheckUrl: "https://hml-catalogo.interno/actuator/health",
    swaggerUrl: "",
  },
  {
    name: "relatorios-api",
    team: "Dados",
    healthCheckUrl: "https://httpbin.org/status/200",
    swaggerUrl: "https://petstore.swagger.io/",
  },
]);

db.applications_production.insertMany([
  {
    name: "checkout-api",
    team: "Pagamentos",
    healthCheckUrl: "https://petstore.swagger.io/v2/swagger.json",
    swaggerUrl: "https://petstore.swagger.io/",
  },
  {
    name: "catalogo-service",
    team: "Produtos",
    healthCheckUrl: "https://httpbin.org/status/200",
    swaggerUrl: "",
  },
]);

print("Seed concluído:");
print("  applications_development:", db.applications_development.countDocuments(), "apps");
print("  applications_staging:", db.applications_staging.countDocuments(), "apps");
print("  applications_production:", db.applications_production.countDocuments(), "apps");
