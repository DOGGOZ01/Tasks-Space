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

## TEMPORARY: planned Docker + installer architecture (discussed, not built yet)

Notes-to-self so this isn't forgotten before it's actually implemented. Remove this section once it's real (or replace it with real setup docs).

Goal: replace the current manual pm2 + host-nginx + certbot deploy with `docker compose up`, driven by a small Python installer app.

- **Installer**: Python, itself containerized, opens automatically on first `docker compose up` (detects "not configured yet"). Works both as a terminal wizard and a web UI (FastAPI serving an API + a built React bundle) — one shared Python "core" (config schema, `.env` read/write, DNS checks, `docker compose` invocation) underneath both. Also stays around post-install as a settings tool (re-open it to change `.env` values later without hand-editing, triggers the relevant container restart).
- Needs the Docker socket mounted in (`docker-outside-of-docker`, same pattern as Portainer) since it has to launch sibling containers from inside its own container.
- **Localhost path**: skip all domain/SSL questions, just write a local `.env` (`COOKIE_SECURE=False` etc).
- **Hosted path**: ask for a domain, show a static "point an A record at this server's IP" mini-guide (no registrar automation — deliberately out of scope), then proceed to real `.env` + cert issuance.
- **Only 2 core service containers**, not more: `backend` (Django/gunicorn) and `nginx`. nginx stays as its own container specifically for TLS termination (gunicorn's own built-in SSL is explicitly "not recommended for production" per gunicorn's own docs — nginx handles slow-client/HTTP2 far better). `certbot` does **not** get its own container — it's just a pip package folded into the nginx image, renewing on a background timer loop alongside the cert-reload loop nginx already needs (nginx doesn't notice a renewed cert file on disk without a reload).
- Migration would bind-mount the *existing* `backend/db.sqlite3`/`backend/media/` (not fresh volumes) and seed the *existing* Let's Encrypt cert into the repo once, to avoid any downtime or ACME rate-limit risk.
- The existing no-Docker dev flow (venv + `manage.py runserver` + `npm run dev`, documented above) stays exactly as-is — the installer does not try to also supervise raw host dev processes, that's a different problem (process supervision vs. container orchestration).

Full reasoning/history of this decision lives in Claude's project memory (`project_docker_installer_plan.md`) if it needs to be revisited.
