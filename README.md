# Tasks Space

Monorepo: `backend/` (Django + DRF) and `frontend/` (React + Vite). Both need to run at the same time, in two separate terminals.

## Requirements

- Python 3.12+
- Node.js 20+

## Backend

```bash
cd backend
python -m venv venv
```

Activate the virtualenv:

```bash
# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

```bash
pip install -r requirements.txt
cp .env.example .env   # Windows: copy .env.example .env
```

Edit `.env` and set `SECRET_KEY` and `JWT_SIGNING_KEY` to your own random values, e.g.:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Run once each, per value. Leave the rest of `.env` as-is for local use — it's already set up to match the frontend's default port. `ALLOW_CUSTOM_SCRIPTS` should stay `False` unless you specifically know why you want it on (see the comment above it in `.env.example` / `tasks/settings.py`).

```bash
python manage.py migrate
python manage.py runserver
```

Backend runs at `http://localhost:8000`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`. `.env.development` already points it at `http://localhost:8000` for the backend.

## First run

With both servers running, open `http://localhost:5173` and register an account through the UI (registration is open by default).

## How it works (temporary overview, will evolve)

A drag-and-drop board editor: each user gets their own private board and freely drags/resizes/styles blocks (task lists, notes, images, raw HTML) on a canvas, built on `@craftjs/core`.

- **Desktop and mobile are separate layouts.** `Page.layout` (1440×900) and `Page.mobile_layout` (390×1600) are independent, saved/edited independently. What you see on a phone is not a responsive reflow of the desktop layout — it's its own board.
- **Everything customizable is sanitized server-side**, on every write *and* every read (`backend/pages/sanitize.py`). Block colors/borders/opacity, custom CSS, CSS animations (`animationCss`), and raw HTML content all go through allowlist-based sanitizers before they're ever rendered. Custom HTML/animated backgrounds/JS overlays render inside sandboxed `<iframe>`s with a restrictive CSP, never directly on the page.
- **`ALLOW_CUSTOM_SCRIPTS`** (`.env`, default `False`) is the one deliberate exception: turning it on lets `<script>` tags run inside those sandboxed iframes. This is a real, permanent, self-inflicted stored-XSS surface — only turn it on for a single-user instance you fully trust, never for anything shared or public-facing.
- **`ALLOW_PUBLIC_REGISTRATION`** (`.env`, default `False`) gates self-registration independently of the in-app "registration open" toggle — with it off, new accounts can only be created via `/admin/` or `manage.py createsuperuser`.
- **Designs**: save the current board as a named design, re-apply it later, or export/import as a downloadable JSON file (images are stripped on file export/import since uploaded files are per-account).
- **AI design assistant** (optional, off by default): a chat panel that edits the board via tool calls (set background, style blocks, add/update/remove blocks). Two modes: a server-shared key (`AI_ASSISTANT_ENABLED` + `AI_ASSISTANT_*` in `.env`, proxied through the backend) or bring-your-own API key (encrypted client-side with a passphrase, requests go straight from the browser to the provider). Every tool call is re-validated client-side and re-sanitized server-side before it touches the board — the assistant has no more write access than a human editing through the UI.

For anything not covered here, the code is the source of truth — this section is a quick-start map, not a spec.

## Production deployment notes

Deployed behind nginx (reverse-proxying `/api/`, `/admin/`, `/static/`, `/media/` to gunicorn; `/` serves the built frontend). The `Content-Security-Policy` header is intentionally split between two places:

- **nginx**, at the `server{}` level: the strict, site-wide CSP — `script-src 'self'` (no `unsafe-inline`), `style-src 'self' 'unsafe-inline' ...` (React's inline `style={{}}` needs this; security scanners don't penalize `style-src`, only `script-src`/`object-src`). This is what a scanner sees when it checks the main page.
- **Django**, only for `/api/render-preview/` (`backend/pages/render_preview.py`'s `build_preview_csp()`): a separate, per-response CSP that allows `script-src 'unsafe-inline'` *only* when `ALLOW_CUSTOM_SCRIPTS=True` (re-checked on every request, never cached). This endpoint serves the sandboxed Custom HTML block / animated background / animation overlay content as a real HTTP response with its own headers, not as an iframe `srcDoc` — `srcDoc` documents inherit the parent page's CSP, which is why this content can't just live under nginx's blanket policy.

For nginx to not clobber Django's own CSP on that one path, `/api/render-preview/` needs its **own, more specific `location` block** that re-declares every other `add_header` it wants (HSTS, X-Content-Type-Options, etc.) but *omits* `Content-Security-Policy`. `add_header` inheritance in nginx is all-or-nothing per location: the moment a location declares any `add_header` of its own, it stops inheriting *all* of them from the parent `server{}` block, not just the one you meant to override.

Don't read `request.body` in a view after DRF authentication has already run — `accounts/authentication.py`'s `CookieJWTAuthentication.enforce_csrf` reads `request.POST` during the CSRF check (on every unsafe-method request), which fully consumes the request stream as a side effect. A later `len(request.body)` raises `RawPostDataException`. Use `request.META.get("CONTENT_LENGTH")` for a request-size guard instead (see `_content_length_exceeds` in `backend/pages/views.py`).

## Testing site security headers

- https://securityheaders.com — quick A–F grade on HTTP security headers (HSTS, CSP, X-Frame-Options, etc.)
- https://developer.mozilla.org/en-US/observatory — Mozilla's HTTP Observatory; scores CSP more strictly, specifically flags `unsafe-inline`/`data:` in `script-src`/`object-src`.

Both scan whatever URL you give them (the main page) — not sub-paths like `/api/render-preview/`, whose CSP is intentionally different and isn't part of the score.

## Docker deployment

Four containers: `nginx` (internal reverse proxy -- routes `/api/`, `/admin/`, `/static/`, `/media/` to `backend`, everything else to `frontend`, and sends the security header set below; no TLS of its own), `frontend` (its own nginx serving the built Vite bundle), `backend` (Django/gunicorn), and `installer-web` (a setup/settings wizard, same shared core as the CLI installer) — the last one only ever runs on demand, never as a standing service (see below). This project's own `nginx` never terminates TLS -- for a real domain, you put your own host-level nginx (or whatever already fronts your other projects on this VPS) in front of it, same as any other site — see "Real domain + HTTPS" below.

**First run**, from the repo root:

```bash
./install.sh
```

On Windows, use the native PowerShell equivalent instead (same behavior, no Git Bash/WSL required):

```powershell
.\install.ps1
```

This is the one command to run — it copies `backend/.env.example`/`.env.example` into real files if they're missing (required: Docker auto-creates an empty *directory* at a bind-mount source path that doesn't exist yet, which breaks every container expecting `backend/.env` to be a file), then, only if the app isn't configured yet, asks **once** whether you want the terminal wizard or the web wizard — nothing else starts until you answer:

- **Terminal** (default) — runs `docker compose --profile installer run --rm installer` (the interactive CLI wizard) to completion, walking through the same sections as the web wizard and ending with a review + confirmation before writing anything, then brings up the rest of the stack the same way. `installer-web` never starts in this path at all.
- **Web** — starts *only* `installer-web` (not the rest of the stack yet), prints its URL and opens it in your default browser automatically (`http://localhost:7000` by default). **Only reachable from this machine** (the container's port is published bound to `127.0.0.1`) — if you're setting this up over SSH on a remote server, either use an SSH tunnel or pick Terminal instead. The page is a proper multi-step wizard (Deployment → Admin account → Security → Day lock → Auth throttling → AI assistant → Render preview → Image/GIF uploads → Board content limits → a final review screen listing every value), so nothing is written until you click Install on that last screen. It then shows a loading screen while `install.sh`/`install.ps1` brings the rest of the stack up in the background (first boot can take a minute, since images still need to build), and redirects you to the site automatically once it responds. The installer closes itself a couple seconds after you submit — it isn't left running.

Either way, once configured, `install.sh`/`install.ps1` just brings the stack up directly and skips the question — and once `backend` is healthy it prints the addresses the site should be reachable at: `localhost`, the machine's LAN IP (so you can reach it from another device on your network), and its public IP (relevant once you forward the port). If a `DOMAIN` was configured, it also prints a ready-to-paste nginx `server` block + `certbot` command for putting your own host nginx in front (see "Real domain + HTTPS" below) -- the installer only writes this project's own `.env`/containers, it never touches your host's nginx config.

**To change settings later, `installer-web` is not something you leave running** — start it deliberately from a terminal on the server whenever you need it:

```bash
docker compose --profile installer-web up -d installer-web
```

Open `http://127.0.0.1:${INSTALLER_WEB_PORT:-7000}` — loopback-only by design, never routed through the public-facing `nginx` service, and never reachable from the internet even with a real domain configured. Change what you need and submit; the page confirms what was applied (restarting the affected container automatically, or telling you if a changed port needs a manual `docker compose up -d <service>` — a plain restart can't remap a published port) and the installer closes itself right after, same as first run. If you close the tab or never submit, it just keeps running until you stop it yourself (`docker compose stop installer-web`). The terminal wizard has the equivalent capability via `docker compose --profile installer run --rm installer python -m installer.cli edit`.

**`installer-web`/`installer` mount the Docker socket** (to restart `backend`/`nginx` on a settings change) — this is real host-root-equivalent access. Both are behind Compose profiles specifically so neither runs unless you actually asked for it, and `installer-web` shuts itself down as soon as it's done its one job rather than staying reachable between visits — only run either on a machine and network you trust.

### Real domain + HTTPS

This project's own `nginx` container does **not** terminate TLS or talk to Let's Encrypt itself. If your VPS already runs other sites behind their own nginx (the common case), that existing nginx stays the one thing owning ports 80/443 on the host — this project is just one more site it proxies to, exactly like the others. There's no shared per-VPS proxy container to set up; you use whatever you already use.

**In the wizard**, choose "A real domain", enter it, and set `HTTP_PORT` to a free local port (anything other than 80/443, since your host nginx already owns those). With a domain set, this project's `nginx` container automatically publishes on `127.0.0.1:<port>` instead of all interfaces — it's only reachable from the host itself, not directly from the internet, so the only way in is through your own reverse proxy.

**On your host nginx**, add a normal server block for the domain, proxying to that port — `install.sh`/`install.ps1` print this out for you (with the real domain/port filled in) every time they bring the stack up with a `DOMAIN` configured:

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

```bash
certbot --nginx -d your-domain.com
```

Same as adding any other site to that nginx — reload it, run certbot, done. `DOMAIN` in `.env` only drives Django's `ALLOWED_HOSTS`/CORS/cookie settings (so it accepts and works correctly over `https://your-domain.com`); the installer never writes to your host's nginx config or runs certbot itself.

### Security headers

`nginx/snippets/app-locations.conf` sends the same header set on every response (CSP, HSTS on the HTTPS block, `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`), matching the values validated on the pre-Docker manual VPS deploy — with `img-src`/`font-src` additionally allowing `data:`/`blob:`, needed for this app's own image/GIF board features (not present on the old manual deploy, kept from Docker's earlier hardening pass). `/api/render-preview/` deliberately does **not** get the site-wide CSP/`X-Frame-Options` — that endpoint sets its own via Django (`@xframe_options_exempt` + a permissive-by-design CSP for user-authored board content), and nginx's `add_header` never strips headers already present on a proxied response, only ever adds its own.

The existing no-Docker dev flow (venv + `manage.py runserver` + `npm run dev`, documented above) is untouched — the installer only manages the Docker path.

Not built: automated migration of an existing manual VPS deploy (bind-mounting a pre-existing `db.sqlite3`/`media/`, reusing an already-issued Let's Encrypt cert). This Docker setup is for a fresh install; migrating the current live deployment would be a separate, later pass.
