# 🪐 Orbital

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=flat&logo=nginx&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![D3.js](https://img.shields.io/badge/D3.js-F9A03C?style=flat&logo=d3.js&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

Dashboard de monitoramento de saúde de aplicações com visualização orbital. Cada aplicação é representada como um planeta em órbita — o brilho do planeta indica o resultado do último health check.

## 🌌 Conceito

A metáfora orbital transforma um painel de status convencional em uma visualização espacial construída com D3.js. Planetas brilhantes indicam aplicações saudáveis; planetas apagados indicam falha. O sistema suporta múltiplos ambientes (desenvolvimento, homologação e produção), cada um com sua própria constelação de aplicações.

### 🏗️ Arquitetura

```
frontend/          → HTML estático servido por nginx
api/               → REST API Node.js + Express
mongo              → Registro de aplicações (MongoDB 7)
redis              → Cache de resultados de health check
```

O health check é disparado pelo frontend em intervalos configuráveis. Para evitar que múltiplos usuários com o painel aberto simultaneamente sobrecarreguem os endpoints monitorados, os resultados do sync são armazenados em cache no Redis com TTL de 13 segundos — o suficiente para deduplicar chamadas concorrentes sem introduzir defasagem perceptível em ciclos de 15s ou mais.

## ✨ Funcionalidades

- 🔭 **Visualização orbital** — aplicações como planetas animados em D3.js; brilho reflete o status atual
- 🌍 **Multi-ambiente** — alternância entre Desenvolvimento, Homologação e Produção
- ⏱️ **Health check automático** — varredura periódica configurável em 15s, 30s ou 60s
- 📡 **Varredura manual** — botão SCAN para checagem imediata fora do ciclo automático
- ➕ **Cadastro de aplicações** — formulário para adicionar nome, time, ambiente, URL de health check e Swagger
- 🗑️ **Remoção de aplicações** — exclusão com confirmação diretamente no card
- 🔍 **Painel de detalhes** — clique em um planeta para ver informações e link do Swagger
- 🔎 **Filtros e busca** — filtre por status (no ar / fora) e busque por nome ou time
- 📄 **Paginação** — lista de aplicações paginada por ambiente
- 🌗 **Tema claro/escuro** — alternância com persistência no localStorage
- ⚡ **Cache de health check** — Redis com TTL de 13s para deduplicar chamadas de múltiplos usuários simultâneos

## 🚀 Como utilizar

### Pré-requisitos

- 🐳 [Docker](https://docs.docker.com/get-docker/) com Docker Compose

---

### 🖥️ Modo local

Sobe todos os serviços em containers — ideal para desenvolvimento e testes.

```bash
docker compose -f docker-compose.local.yml up -d --build
```

| Serviço      | URL                        | Descrição               |
|--------------|----------------------------|-------------------------|
| 🌐 Frontend  | http://localhost           | Painel Orbital (nginx)  |
| ⚙️ API       | http://localhost:3001      | REST API                |
| 🍃 MongoDB   | mongodb://localhost:27017  | Banco de dados          |
| 🔴 Redis     | localhost:6379             | Cache de health check   |

> O banco é populado automaticamente com dados de exemplo na primeira inicialização. Nas reinicializações seguintes os dados persistem no volume `mongo_data`.

---

### 🏭 Modo produção

Sobe apenas frontend e API em containers. MongoDB e Redis são serviços externos já existentes (nuvem, on-premise, etc.).

```bash
cp .env.prod.example .env.prod   # preencha com os dados dos serviços externos
docker compose -f docker-compose.prod.yml up -d --build
```

| Serviço      | URL                   | Descrição              |
|--------------|-----------------------|------------------------|
| 🌐 Frontend  | http://localhost      | Painel Orbital (nginx) |
| ⚙️ API       | http://localhost:3001 | REST API               |

As credenciais dos serviços externos são lidas do arquivo `.env.prod`:

| Variável         | Descrição                               |
|------------------|-----------------------------------------|
| `MONGO_URL`      | URL de conexão com MongoDB externo      |
| `MONGO_USER`     | Usuário do MongoDB (opcional)           |
| `MONGO_PASS`     | Senha do MongoDB (opcional)             |
| `MONGO_DB`       | Nome do banco de dados                  |
| `REDIS_URL`      | URL de conexão com Redis externo        |
| `SYNC_CACHE_TTL` | TTL do cache de health check (segundos) |

---

### 🔧 Desenvolvimento sem Docker

**API:**

```bash
cd api
cp .env.example .env   # ajuste as variáveis conforme necessário
npm install
npm run dev
```

**Frontend:**

Abra `frontend/index.html` diretamente no navegador — não há etapa de build.

> Certifique-se de que MongoDB e Redis estejam rodando e que `API_BASE` em `frontend/index.html` aponte para `http://localhost:3001`.

### ⚙️ Variáveis de ambiente da API

| Variável          | Padrão                        | Descrição                               |
|-------------------|-------------------------------|-----------------------------------------|
| `PORT`            | `3001`                        | Porta da API                            |
| `MONGO_URL`       | `mongodb://localhost:27017`   | URL de conexão com MongoDB              |
| `MONGO_DB`        | `orbital`                     | Nome do banco de dados                  |
| `REDIS_URL`       | `redis://localhost:6379`      | URL de conexão com Redis                |
| `SYNC_CACHE_TTL`  | `13`                          | TTL do cache de health check (segundos) |

### 📡 Endpoints da API

| Método | Rota                          | Descrição                              |
|--------|-------------------------------|----------------------------------------|
| `GET`  | `/applications`               | Lista todas as aplicações              |
| `GET`  | `/applications/:env`          | Lista aplicações de um ambiente        |
| `POST` | `/applications/:env/sync`     | Executa health check (com cache)       |
| `POST` | `/applications/:env`          | Cadastra uma aplicação                 |
| `DELETE` | `/applications/:env/:id`    | Remove uma aplicação                   |

Ambientes válidos: `development`, `staging`, `production`.
