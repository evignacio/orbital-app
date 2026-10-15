FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# nginx sem root (uid 101), escutando na 8080. Linha estável 1.28.
FROM nginxinc/nginx-unprivileged:1.28-alpine
# O Vite já copia public/ (_ds, favicon e theme-boot.*) para a pasta de saída.
COPY --from=build /app/dist /usr/share/nginx/html/
# O entrypoint renderiza /etc/nginx/templates/*.template em /etc/nginx/conf.d/
# (gravável pelo usuário nginx nesta imagem), trocando só as variáveis do filtro.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf nginx/proxy-hide-security-headers.conf /etc/nginx/snippets/
ENV API_UPSTREAM=http://api:3001 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER='^(API_UPSTREAM|NGINX_LOCAL_RESOLVERS)$'
EXPOSE 8080
# wget do busybox (já vem na imagem alpine).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
