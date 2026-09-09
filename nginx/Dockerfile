FROM nginx:1.27-alpine

RUN apk add --no-cache certbot

COPY snippets/ /etc/nginx/snippets/
COPY conf.d/localhost.conf /etc/nginx/templates/localhost.conf
COPY conf.d/hosted-http.conf.template /etc/nginx/templates/hosted-http.conf.template
COPY conf.d/hosted-https.conf.template /etc/nginx/templates/hosted-https.conf.template
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
