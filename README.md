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
