# Tasks Space installer

Setup wizard for the Docker deployment. The same core (`core/`) has two front
ends: a terminal wizard (`cli.py`) and a web wizard (`web/`, FastAPI). Both write
`backend/.env` and the root `.env`.

## Containers

| Service | What it does |
|---|---|
| `nginx` | Routes `/api/`, `/admin/`, `/static/` and `/media/` to the backend, everything else to the frontend. Sends the security headers. No TLS |
| `frontend` | nginx serving the Vite build |
| `backend` | Django with gunicorn |
| `installer` | Terminal wizard, runs only when started |
| `installer-web` | Web wizard, runs only when started and shuts itself down after saving |

The installer containers are on their own Docker network, so the app containers
can't reach them.

## First run

```bash
./install.sh      # Windows: .\install.ps1
```

The script creates `.env` files from the examples if they are missing, then asks
once whether to use the terminal or the web wizard. The wizard asks about the
domain, the admin account, security, day lock, the AI assistant and limits, and
writes nothing until you confirm. After that the script builds and starts the
stack, waits for the backend and prints the addresses the site is reachable at.

The web wizard listens only on `127.0.0.1:7000`. On a remote server use the
terminal wizard or an SSH tunnel.

Running `./install.sh` again on a configured install just starts the stack.

## Changing settings

Web:

```bash
docker compose --profile installer-web up -d installer-web
```

Then open `http://127.0.0.1:7000`. After saving, the affected containers restart
and the installer stops.

Terminal:

```bash
docker compose --profile installer run --rm installer python -m installer.cli edit
```

A changed port can't be applied with a restart. Run `./install.sh` again after
changing `HTTP_PORT`.

## Domain and HTTPS

The project's nginx does not handle TLS. On a server that already runs nginx for
other sites, Tasks Space is one more site behind it.

1. In the wizard pick "A real domain" and set `HTTP_PORT` to a free local port,
   such as `8080`. With a domain set, the container listens on `127.0.0.1` only.
2. Add a server block to your nginx. The install script prints it with your domain
   and port filled in:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Get a certificate:

```bash
sudo certbot --nginx -d your-domain.com
```

`DOMAIN` only sets Django's `ALLOWED_HOSTS`, CORS origins and secure cookies. The
installer never touches the host nginx or runs certbot.

## Root `.env`

Docker Compose reads these from the root `.env`, not from `backend/.env`. The
wizard keeps both in sync.

| Variable | Default | Notes |
|---|---|---|
| `HTTP_PORT` | `80` | Host port of the site |
| `INSTALLER_WEB_PORT` | `7000` | Port of the web wizard, loopback only |
| `DOMAIN` | empty | Empty for local or IP-only use |
| `NGINX_HOST_BIND` | empty | Set to `127.0.0.1:` when a domain is set |

## Security headers

`nginx/snippets/app-locations.conf` sends `Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
`Permissions-Policy`. The `/api/render-preview/` location repeats every header
except CSP and `X-Frame-Options`, because the backend sets its own for that path.
nginx drops all inherited `add_header` lines in a location that declares any of
its own, so a new site-wide header has to be added there too.

The proxy forwards `Host $http_host`, not `$host`. `$host` drops the port, and the
backend would then build image links to the wrong origin.

## Docker socket

`installer` and `installer-web` mount `/var/run/docker.sock` to restart the other
containers. That is root-level access to the host, which is why they run only when
started by hand.
