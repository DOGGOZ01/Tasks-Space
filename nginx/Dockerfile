FROM nginx:1.27-alpine

COPY snippets/ /etc/nginx/snippets/
COPY conf.d/app.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
