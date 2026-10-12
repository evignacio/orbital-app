FROM nginx:1.27-alpine
COPY index.html painel.html support.js common.js app-form.js script.js galaxy.js favicon.svg /usr/share/nginx/html/
COPY _ds /usr/share/nginx/html/_ds/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
