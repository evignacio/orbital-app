FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
# Files stay owned by root (read-only for the app); the process runs as the image's
# built-in unprivileged "node" user (uid 1000).
USER node
EXPOSE 3001
# Liveness through GET /health, which answers without touching Mongo or Redis.
# busybox wget ships with the alpine image; shell form so ${PORT} expands.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -q --spider "http://127.0.0.1:${PORT:-3001}/health" || exit 1
CMD ["node", "src/server.js"]
