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
# Liveness without a dedicated endpoint and without touching Mongo: the API's port
# accepts a TCP connection.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "const s=require('net').connect(+(process.env.PORT||3001),'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(2000,()=>process.exit(1))"
CMD ["node", "src/server.js"]
