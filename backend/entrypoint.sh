#!/bin/sh
set -e

python manage.py migrate --noinput

if [ -f /app/.env ] && grep -q '^DJANGO_SUPERUSER_USERNAME=' /app/.env; then
    python manage.py ensure_superuser
fi

if [ -f /app/.env ]; then
    rm -f /tmp/.env.tmp
    grep -v -E '^(DJANGO_SUPERUSER_USERNAME|DJANGO_SUPERUSER_PASSWORD|DJANGO_SUPERUSER_EMAIL)=' /app/.env > /tmp/.env.tmp || true
    if [ -s /tmp/.env.tmp ]; then
        cp /tmp/.env.tmp /app/.env
    fi
    rm -f /tmp/.env.tmp
fi

python manage.py collectstatic --noinput

exec gunicorn tasks.wsgi:application --bind 0.0.0.0:8000 --workers 3
