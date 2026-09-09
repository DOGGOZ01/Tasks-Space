#!/bin/sh
set -e

BACKEND_ENV_FILE="/data/backend.env"

if [ -f "$BACKEND_ENV_FILE" ]; then
    while IFS='=' read -r env_key env_value; do
        case "$env_key" in
            DEPLOY_MODE|DOMAIN|ACME_EMAIL|HTTP_PORT) ;;
            *) continue ;;
        esac
        case "$env_value" in
            \"*\") env_value="${env_value#\"}"; env_value="${env_value%\"}" ;;
            \'*\') env_value="${env_value#\'}"; env_value="${env_value%\'}" ;;
        esac
        export "$env_key=$env_value"
    done < "$BACKEND_ENV_FILE"
fi

DEPLOY_MODE="${DEPLOY_MODE:-localhost}"

rm -f /etc/nginx/conf.d/*.conf

if [ "$DEPLOY_MODE" = "hosted" ]; then
    if [ -z "$DOMAIN" ] || [ -z "$ACME_EMAIL" ]; then
        echo "DEPLOY_MODE=hosted requires DOMAIN and ACME_EMAIL to be set in backend/.env" >&2
        exit 1
    fi

    mkdir -p /var/www/certbot

    DOMAIN="$DOMAIN" envsubst '${DOMAIN}' < /etc/nginx/templates/hosted-http.conf.template > /etc/nginx/conf.d/hosted-http.conf

    nginx -g 'daemon off;' &
    NGINX_PID=$!
    trap 'kill -TERM "$NGINX_PID" 2>/dev/null' TERM INT

    CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

    if [ ! -f "$CERT_PATH" ]; then
        certbot certonly \
            --webroot -w /var/www/certbot \
            -d "$DOMAIN" \
            -m "$ACME_EMAIL" \
            --agree-tos \
            --non-interactive \
            || echo "Certificate issuance failed, continuing on HTTP only until this succeeds" >&2
    fi

    if [ -f "$CERT_PATH" ]; then
        DOMAIN="$DOMAIN" envsubst '${DOMAIN}' < /etc/nginx/templates/hosted-https.conf.template > /etc/nginx/conf.d/hosted-https.conf
        nginx -s reload
    fi

    (
        while true; do
            if [ -f "$CERT_PATH" ]; then
                sleep 12h
                certbot renew --webroot -w /var/www/certbot --quiet && nginx -s reload
            else
                sleep 10m
                if certbot certonly \
                    --webroot -w /var/www/certbot \
                    -d "$DOMAIN" \
                    -m "$ACME_EMAIL" \
                    --agree-tos \
                    --non-interactive; then
                    DOMAIN="$DOMAIN" envsubst '${DOMAIN}' < /etc/nginx/templates/hosted-https.conf.template > /etc/nginx/conf.d/hosted-https.conf
                    nginx -s reload
                fi
            fi
        done
    ) &

    wait "$NGINX_PID"
else
    cp /etc/nginx/templates/localhost.conf /etc/nginx/conf.d/localhost.conf
    exec nginx -g 'daemon off;'
fi
