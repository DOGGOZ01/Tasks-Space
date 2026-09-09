#!/bin/sh
set -e

cd "$(dirname "$0")"

PLACEHOLDER_SECRET_KEY="change-me-to-a-long-random-value"

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
fi
if [ ! -f .env ]; then
    cp .env.example .env
fi

echo "Building images (skips anything already up to date)..."
docker compose build backend frontend nginx installer installer-web

is_configured() {
    [ -f backend/.env ] || return 1
    value=$(grep '^SECRET_KEY=' backend/.env 2>/dev/null | tail -n1 | cut -d= -f2-)
    [ -n "$value" ] && [ "$value" != "$PLACEHOLDER_SECRET_KEY" ]
}

env_value() {
    key="$1"
    file="$2"
    default="$3"
    value=$(grep "^${key}=" "$file" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"'"'"'')
    if [ -z "$value" ]; then
        echo "$default"
    else
        echo "$value"
    fi
}

wait_for_backend_healthy() {
    echo "Waiting for backend to become healthy..."
    i=0
    while [ "$i" -lt 150 ]; do
        container=$(docker ps --filter "label=com.docker.compose.service=backend" --format '{{.Names}}' | head -n1)
        if [ -n "$container" ]; then
            status=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || true)
            if [ "$status" = "healthy" ]; then
                echo "backend is healthy."
                return 0
            fi
        fi
        i=$((i + 1))
        sleep 2
    done
    echo "Timed out waiting for backend to become healthy -- check 'docker compose logs backend'." >&2
    return 1
}

print_access_info() {
    http_port=$(env_value HTTP_PORT .env 80)

    local_ip=""
    if command -v hostname >/dev/null 2>&1; then
        local_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    if [ -z "$local_ip" ] && command -v ip >/dev/null 2>&1; then
        local_ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") print $(i+1)}')
    fi

    public_ip=""
    if command -v curl >/dev/null 2>&1; then
        public_ip=$(curl -s --max-time 3 https://api.ipify.org || true)
    fi

    echo ""
    echo "This server should be reachable at:"
    echo "  This machine:    http://localhost:${http_port}"
    [ -n "$local_ip" ] && echo "  Local network:   http://${local_ip}:${http_port}"
    if [ -n "$public_ip" ]; then
        echo "  Public internet: http://${public_ip}:${http_port}  (only if your router/firewall forwards this port, and only meaningful in hosted mode with a domain -- see README)"
    fi
    echo ""
}

if is_configured; then
    docker compose up -d
    wait_for_backend_healthy || true
    print_access_info
    exit 0
fi

open_browser() {
    url="$1"
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "$url" >/dev/null 2>&1 &
    elif command -v cmd.exe >/dev/null 2>&1; then
        cmd.exe /c start "" "$url" >/dev/null 2>&1 &
    fi
}

echo "Task Tracker has not been configured yet."
echo ""
echo "How do you want to set it up?"
echo "  1) Terminal wizard"
echo "  2) Web browser wizard -- only reachable from this machine (binds to 127.0.0.1)."
echo "     If you're on a remote server over SSH, use an SSH tunnel or pick Terminal instead."
printf "Choice [1]: "
read -r choice

if [ "$choice" = "2" ]; then
    docker compose --profile installer-web up -d installer-web
    installer_port=$(env_value INSTALLER_WEB_PORT .env 7000)
    echo ""
    echo "Open http://localhost:${installer_port} to finish setup in your browser."
    echo "Waiting for you to submit the setup wizard there..."
    sleep 2.5
    open_browser "http://localhost:${installer_port}"
    while ! is_configured; do
        sleep 2
    done
    echo "Configuration received."
else
    docker compose --profile installer run --rm installer
fi

docker compose up -d
wait_for_backend_healthy || true

if [ "$choice" = "2" ]; then
    docker compose stop installer-web >/dev/null 2>&1 || true
fi

print_access_info
