# Tasks Space backend

Django + DRF API. Auth uses JWT (SimpleJWT) stored in httpOnly cookies
(`access_token`, `refresh_token`) with CSRF protection on every unsafe request.
Every endpoint except register, login, refresh and registration status requires a
logged-in user.

## Setup

```bash
cd backend
python -m venv venv
source venv/Scripts/activate   # Git Bash on Windows; on cmd use venv\Scripts\activate.bat
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
```

`SECRET_KEY` and `JWT_SIGNING_KEY` in `.env` are required and must be two
different random values:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

## Creating an admin

```bash
python manage.py createsuperuser
```

The Django admin is mounted at `/admin/`.

## Registration

Public sign-up is closed by default. It needs both:

- `ALLOW_PUBLIC_REGISTRATION=True` in `.env`
- "Registration open" checked on the site config in the Django admin

With either one off, accounts can only be created in the admin or with
`createsuperuser`.

## Environment variables

All settings live in `backend/.env`. `.env.example` lists every one with its
default.

**Core**

| Variable | Default | Notes |
|---|---|---|
| `SECRET_KEY` | none | Required |
| `JWT_SIGNING_KEY` | none | Required, different from `SECRET_KEY` |
| `DEBUG` | `False` | Never `True` on a public server |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated, must match the frontend origin exactly |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Public URL of the site, used in saved image links |
| `COOKIE_SECURE` | `False` | `True` when served over HTTPS |

**Security**

| Variable | Default | Notes |
|---|---|---|
| `ALLOW_CUSTOM_SCRIPTS` | `False` | Lets `<script>` run in custom HTML, backgrounds and overlays. Only for a single-user instance |
| `ALLOW_PUBLIC_REGISTRATION` | `False` | See [Registration](#registration) |
| `AUTH_LOGIN_THROTTLE_RATE` / `AUTH_REGISTER_THROTTLE_RATE` / `AUTH_REFRESH_THROTTLE_RATE` | `10/min` / `5/min` / `30/min` | Rate limits for the auth endpoints, per IP |

**Day lock**

| Variable | Default | Notes |
|---|---|---|
| `DAY_LOCK_MODE` | `local` | `local`: a day locks when it ends in `DAY_LOCK_TIMEZONE`. `global`: when it ends everywhere on Earth |
| `DAY_LOCK_TIMEZONE` | `UTC` | IANA name, e.g. `Europe/Paris` |

**AI assistant (server key)**

| Variable | Default | Notes |
|---|---|---|
| `AI_ASSISTANT_ENABLED` | `False` | Turns on `/api/ai/chat/` |
| `AI_ASSISTANT_PROVIDER` | `anthropic` | `anthropic`, `openai` or `deepseek` |
| `AI_ASSISTANT_MODEL` | `claude-sonnet-5` | |
| `AI_ASSISTANT_API_KEY` | empty | Held by the server |
| `AI_ASSISTANT_MAX_TOKENS` | `16000` | |
| `AI_ASSISTANT_TIMEOUT_SECONDS` | `60` | |
| `AI_CHAT_THROTTLE_RATE` | `20/min` | Per user |

With the server key on, board contents and chat messages are sent to the provider.
Users can always add their own key in the browser instead; those requests never go
through this server.

**Limits**

| Variable | Default | Notes |
|---|---|---|
| `MAX_IMAGE_UPLOAD_BYTES` | `5242880` | 5 MB. PNG, JPEG, GIF and WEBP |
| `MAX_IMAGE_DIMENSION` | `4000` | Pixels, width or height |
| `MAX_GIF_FRAMES` | `300` | |
| `MAX_CUSTOM_HTML_LENGTH` | `20000` | Characters per custom HTML block |
| `MAX_CUSTOM_CSS_LENGTH` | `4000` | Characters of custom CSS per element |
| `MAX_TASKS_PER_DATE` | `200` | |
| `MAX_SAVED_DESIGNS_PER_USER` | `30` | |

The rest (request sizes, render preview TTL, GIF frame timing) are in
`.env.example`.

## Run

```bash
python manage.py runserver
```

## Tests

```bash
python manage.py test
```

## API

| Route | What it does |
|---|---|
| `api/auth/` | `register/`, `login/`, `refresh/`, `logout/`, `me/`, `registration-status/` |
| `api/page/` | The board: desktop and phone layouts, background, top bar style, loading screen, date format |
| `api/tasks/` | Daily and weekly tasks |
| `api/uploads/images/` | Image upload |
| `api/designs/` | Saved designs: list, create, delete, `<id>/use/` |
| `api/ai/chat/` | AI assistant with the server key |
| `api/ai/sanitize-check/` | Tells the AI assistant which CSS properties, selectors and tags the sanitizer will drop |
| `api/render-preview/` | Sandboxed documents for custom HTML, backgrounds and overlays |

Routes are in `accounts/urls.py` and `pages/urls.py`. All sanitizers are in
`pages/sanitize.py`.

## Notes

**Sanitizing on read.** Layouts, backgrounds, top bar styles and saved designs are
sanitized on write and again on every read, with the current settings. Turning
`ALLOW_CUSTOM_SCRIPTS` off removes scripts that were saved while it was on.

**Render preview CSP.** `/api/render-preview/` sets its own Content-Security-Policy
(`build_preview_csp()` in `pages/render_preview.py`). `script-src 'unsafe-inline'`
is there only with `ALLOW_CUSTOM_SCRIPTS=True`. Google Fonts used in the HTML are
linked by the server and allowed in that policy. A reverse proxy in front must not
add its own CSP or `X-Frame-Options` on this path.

**Don't read `request.body` in views.** `CookieJWTAuthentication.enforce_csrf`
reads `request.POST` during the CSRF check, which consumes the request stream. A
later `request.body` raises `RawPostDataException`. For size checks use
`request.META["CONTENT_LENGTH"]`, as `_content_length_exceeds` in `pages/views.py`
does.

**Media.** Uploaded images are served from `/media/` by Django in DEBUG only. In
production nginx serves them.
