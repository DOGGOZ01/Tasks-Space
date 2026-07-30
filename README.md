# Task Tracker

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
