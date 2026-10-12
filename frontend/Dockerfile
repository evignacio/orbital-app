FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Convivência (F0–F3): a SPA fica em /spa/ e o legado na raiz. Em F4 a SPA vira a raiz.
COPY --from=build /app/dist /usr/share/nginx/html/spa/
# Removido em F5
COPY legacy/ /usr/share/nginx/html/
COPY public/_ds /usr/share/nginx/html/_ds/
COPY public/favicon.svg /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
