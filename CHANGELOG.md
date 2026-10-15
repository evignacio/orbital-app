# Changelog

Todas as mudanças relevantes do Orbital ficam registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

A versão é a mesma em `api/package.json` e `frontend/package.json`, e a tag `v<versão>` marca o release. Para lançar, suba a versão nos dois `package.json`, transforme o **Não lançado** em `## [<versão>] - <data>` e faça o push na `main`: o workflow de release cria a tag e o GitHub Release com o texto desta seção.

## [Não lançado]

## [2.0.0-beta.4] - 2026-10-14

Preparação para uso público: segurança, imagens sem root e versionamento.

### ⚠ Mudanças incompatíveis

- **CORS restritivo por padrão:** sem `CORS_ORIGINS` a API não libera nenhuma origem (o navegador fala com ela pela mesma origem, via nginx ou proxy do Vite). `*` só vale se configurado explicitamente.

### Adicionado

- Cabeçalhos de segurança no nginx e HTTPS opcional com Caddy na frente do frontend.
- Healthcheck nos containers da API e do frontend.
- Upstream da API configurável no nginx (não fica mais preso ao serviço `api` do compose).
- Fontes servidas pelo próprio frontend, sem depender de CDN externa.
- Céu estrelado na página 404.
- Este `CHANGELOG.md`, usado como texto dos releases.

### Alterado

- Containers rodando com usuário sem privilégios (não root).
- MongoDB e Redis do modo local publicados só em `127.0.0.1`.
- Release guiado pela versão dos `package.json`: a API e o frontend passam a ter a mesma versão, e o workflow cria a tag `v<versão>` e o release quando ela muda (antes, cada push na `main` subia um patch automaticamente).

### Removido

- Protótipos (`frontend/prototipos/`), notas internas (`docs/`) e arquivos `.DS_Store` deixam de ser versionados.

## [2.0.0-beta.3] - 2026-10-14

Mais fluidez em máquinas mais fracas, CORS configurável e legenda da galáxia mais legível.

### ⚠ Mudanças incompatíveis

- Script `mongo-add-orbits.js` removido: bancos criados antes das órbitas precisam ser migrados com a versão do script da `v2.0.0-beta.2`.

### Adicionado

- Variável `CORS_ORIGINS` (lista separada por vírgula) com as origens aceitas pela API; o padrão `*` mantinha o comportamento anterior.

### Alterado

- Legenda da galáxia: os degradados aparecem numa linha abaixo das quedas.
- Animações do fundo pausadas enquanto um modal está aberto, e o blur do fundo deixa de ser recalculado a cada quadro.

## [2.0.0-beta.2] - 2026-10-13

Frontend reescrito em React + TypeScript e aplicações agrupadas em órbitas.

### ⚠ Mudanças incompatíveis

- API em Node 24 (imagem `node:24-alpine` e `engines` no `package.json`).
- Campo `orbits` obrigatório (1 a 10 nomes) na criação e na edição de aplicações; bancos antigos precisavam do `mongo-add-orbits.js` e da limpeza das chaves `orbital:apps:*` do Redis.
- Frontend buildado com Vite e servido pelo nginx (imagem multi-stage): galáxia em `/` e painel em `/painel`.

### Adicionado

- Galáxia de órbitas na home, com o resumo de saúde de cada grupo; clicar abre o painel filtrado (`/painel?orbita=<chave>`).
- Várias órbitas por aplicação, com busca, chips e criação na hora; o `snapshot` do SSE passa a trazer `orbits`.
- Edição de aplicações (`PUT /applications/:env/:id`) pelo lápis do card.
- Página 404 e aviso de erro de rota.

### Alterado

- Frontend em React + TypeScript (Vite, React Router, Zustand), com a validação do formulário espelhando a da API.
- Release só depois dos testes da API (Jest) e do frontend (Vitest).
- Testes da API em `test/`, espelhando `src/`; testes do frontend com timers falsos.
- Cache do nginx ajustado (estáticos com hash em cache longo; sem cache para os sem hash e para 404 de assets).
- `CLAUDE.md` dividido por aplicação; README e página de apresentação atualizados.

## [2.0.0-beta.1] - 2026-10-08

Health checks saem do navegador e passam a ser agendados pela API, com resultados em tempo real via Server-Sent Events.

### ⚠ Mudanças incompatíveis

- `POST /applications/:env/sync` responde `202` na hora; os resultados chegam pelo stream `GET /applications/events`.
- `SYNC_CACHE_TTL` removida em favor de `HEALTH_CHECK_INTERVAL_S` (padrão 30 s, mínimo 5).
- A API deve rodar com uma única instância (agendador e SSE em memória).
- Erros 500 não expõem mais a mensagem interna.

### Adicionado

- Agendador na API, com um ciclo por ambiente defasado em 10 s.
- Stream SSE com `snapshot`, `status` e `cycle` (`?changes=true` envia só mudanças).
- Último status e último ciclo guardados no Redis; a API segue funcionando sem ele.
- Página de apresentação em `site/` (GitHub Pages).

### Alterado

- API reorganizada em camadas (config, controllers, middlewares, repositories, routes, services, validators).
- Frontend sem timer próprio; script separado do HTML.

## [1.0.12] - 2026-09-25

### Adicionado

- Validação e sanitização das entradas no cadastro de aplicações.

## [1.0.11] - 2026-09-25

### Adicionado

- Testes unitários da API e cache da lista de aplicações.

### Corrigido

- Timers do frontend.

## [1.0.10] - 2026-09-24

### Adicionado

- Logs estruturados na API.

### Corrigido

- Gravação do cache do `/sync`.

## [1.0.9] - 2026-09-23

### Removido

- Arquivo de sugestões do repositório.

## [1.0.8] - 2026-09-23

### Corrigido

- Correções de bugs, performance e legibilidade.

## [1.0.7] - 2026-09-23

### Alterado

- Configuração de cache ajustada, efeitos do cometa removidos e carregamento da página mais rápido.

## [1.0.6] - 2026-09-23

Sem mudanças funcionais.

## [1.0.5] - 2026-09-23

### Alterado

- Import parcial do D3.js e melhorias de performance no frontend.

## [1.0.4] - 2026-09-23

### Adicionado

- Mecanismo de invalidação de caches.

## [1.0.3] - 2026-09-23

### Adicionado

- Tela de erro quando a API está fora do ar.

## [1.0.2] - 2026-09-22

### Adicionado

- Primeira versão da página de erro para API inacessível.

## [1.0.1] - 2026-09-22

### Corrigido

- Configuração da URL da API.

## [1.0.0] - 2026-09-22

Primeira versão estável: daqui em diante, quebra de compatibilidade exige subir a major.

### Corrigido

- Popover de periodicidade e entrega de notificações.

## [0.0.5] - 2026-09-21

### Alterado

- Atualização do `CLAUDE.md`.

## [0.0.4] - 2026-09-21

### Adicionado

- Notificação para aplicações fora do ar.

## [0.0.3] - 2026-09-21

### Alterado

- Licença trocada de MIT para GNU GPL v3.

## [0.0.2] - 2026-09-21

## [0.0.1] - 2026-09-21

Primeira versão marcada: painel orbital com D3.js, cadastro de aplicações com sugestões de time, filtros, cache no `localStorage`, favicon e compose local e de produção. Release automático por push na `main`.

[Não lançado]: https://github.com/evignacio/orbital-app/compare/v2.0.0-beta.4...HEAD
[2.0.0-beta.4]: https://github.com/evignacio/orbital-app/compare/v2.0.0-beta.3...v2.0.0-beta.4
[2.0.0-beta.3]: https://github.com/evignacio/orbital-app/compare/v2.0.0-beta.2...v2.0.0-beta.3
[2.0.0-beta.2]: https://github.com/evignacio/orbital-app/compare/v2.0.0-beta.1...v2.0.0-beta.2
[2.0.0-beta.1]: https://github.com/evignacio/orbital-app/compare/v1.0.12...v2.0.0-beta.1
[1.0.12]: https://github.com/evignacio/orbital-app/compare/v1.0.11...v1.0.12
[1.0.11]: https://github.com/evignacio/orbital-app/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/evignacio/orbital-app/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/evignacio/orbital-app/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/evignacio/orbital-app/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/evignacio/orbital-app/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/evignacio/orbital-app/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/evignacio/orbital-app/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/evignacio/orbital-app/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/evignacio/orbital-app/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/evignacio/orbital-app/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/evignacio/orbital-app/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/evignacio/orbital-app/compare/v0.0.5...v1.0.0
[0.0.5]: https://github.com/evignacio/orbital-app/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/evignacio/orbital-app/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/evignacio/orbital-app/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/evignacio/orbital-app/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/evignacio/orbital-app/releases/tag/v0.0.1
