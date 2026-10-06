# Configuration

All settings live in `backend/.env`. Start from [`backend/.env.example`](../backend/.env.example), which lists every option with its default. If you use Docker, the setup wizard writes this file for you.

## Core

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | — | Django secret key. Required. Use a long random value. |
| `JWT_SIGNING_KEY` | — | Key for signing auth tokens. Required. Use a different value from `SECRET_KEY`. |
| `DEBUG` | `False` | Django debug mode. Never enable it on a public server. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Hostnames the backend accepts requests for. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origins allowed to call the API. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Public URL of the frontend. |
| `COOKIE_SECURE` | `False` | Send auth cookies over HTTPS only. Set to `True` when serving over HTTPS. |

## Security

| Variable | Default | Description |
|---|---|---|
| `ALLOW_CUSTOM_SCRIPTS` | `False` | Lets `<script>` run inside custom HTML blocks, animated backgrounds and overlays. Only for a single-user instance you fully trust. |
| `ALLOW_PUBLIC_REGISTRATION` | `False` | Lets anyone sign up through the UI. When off, accounts can only be created via `/admin/` or `manage.py createsuperuser`. |
| `AUTH_LOGIN_THROTTLE_RATE` | `10/min` | Login attempts per IP. |
| `AUTH_REGISTER_THROTTLE_RATE` | `5/min` | Sign-up attempts per IP. |
| `AUTH_REFRESH_THROTTLE_RATE` | `30/min` | Token refreshes per IP. |

## Day lock

Controls when a past day or week stops accepting new tasks.

| Variable | Default | Description |
|---|---|---|
| `DAY_LOCK_MODE` | `local` | `local`: a day locks once it's over in `DAY_LOCK_TIMEZONE`. `global`: a day locks only once it's over everywhere on Earth. |
| `DAY_LOCK_TIMEZONE` | `UTC` | IANA timezone name, e.g. `Europe/Paris`. |

## AI assistant

These options control the server-shared key mode. Users can always bring their own API key instead. Their key is encrypted in their browser and requests go straight to the provider.

| Variable | Default | Description |
|---|---|---|
| `AI_ASSISTANT_ENABLED` | `False` | Turns on the server-side AI proxy. |
| `AI_ASSISTANT_PROVIDER` | `anthropic` | `anthropic`, `openai` or `deepseek`. |
| `AI_ASSISTANT_MODEL` | `claude-sonnet-5` | Model name for the chosen provider. |
| `AI_ASSISTANT_API_KEY` | — | Provider API key, held by the server. |
| `AI_ASSISTANT_MAX_TOKENS` | `16000` | Max tokens per response. |
| `AI_ASSISTANT_TIMEOUT_SECONDS` | `60` | Provider request timeout. |
| `AI_CHAT_THROTTLE_RATE` | `20/min` | AI requests allowed per user. |

When enabled, the server sends board contents and chat messages to the chosen provider using its own key.

## Uploads and limits

| Variable | Default | Description |
|---|---|---|
| `MAX_IMAGE_UPLOAD_BYTES` | `5242880` | Max image upload size (5 MB). |
| `MAX_IMAGE_DIMENSION` | `4000` | Max image width/height in pixels. |
| `MAX_GIF_FRAMES` | `300` | Max frames in an uploaded GIF. |
| `MAX_CUSTOM_HTML_LENGTH` | `20000` | Max characters in a custom HTML block. |
| `MAX_CUSTOM_CSS_LENGTH` | `4000` | Max characters of custom CSS per element. |
| `MAX_TASKS_PER_DATE` | `200` | Max tasks per day or week. |
| `MAX_SAVED_DESIGNS_PER_USER` | `30` | Max saved designs per account. |

Less common limits (request sizes, render preview TTL, GIF frame timing) are listed in [`backend/.env.example`](../backend/.env.example).

## Docker-only

These live in the root `.env`, not `backend/.env`. Docker Compose reads them directly. The setup wizard keeps them in sync.

| Variable | Default | Description |
|---|---|---|
| `HTTP_PORT` | `80` | Host port the site is served on. |
| `INSTALLER_WEB_PORT` | `7000` | Port of the web setup wizard (loopback only). |
| `DOMAIN` | — | Your domain, if any. Leave empty for local/IP-only use. |
