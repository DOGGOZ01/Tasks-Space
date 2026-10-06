# Tasks Space

Tasks Space is a daily and weekly task tracker you can redesign entirely in your browser.

Most task trackers give you a fixed interface and maybe a dark mode. Tasks Space gives you a canvas: drag, resize, and restyle every block — task lists, notes, images, custom HTML — until the board looks exactly the way you want it. Desktop and mobile each get their own layout.

There's also a built-in AI design assistant. Describe what you want ("dark synthwave theme, weekly tasks on the left, a big clock in the corner") and it builds it for you — no coding required to end up with a tracker you actually like looking at.

![Board view](docs/screenshots/board-view.png)

![Editing a board](docs/screenshots/board-edit.png)

## Tech stack

**Backend**
- Python 3.12, Django 6, Django REST Framework
- JWT auth (SimpleJWT) in httpOnly cookies + CSRF protection
- SQLite
- bleach + tinycss2 for server-side HTML/CSS sanitization, Pillow for image/GIF processing
- gunicorn

**Frontend**
- React 19 + TypeScript
- Vite
- [craft.js](https://craft.js.org/) for the drag-and-drop board editor
- React Router

## Roadmap

_Coming soon._

## Getting started

> [!CAUTION]
> ### Custom JavaScript
>
> Custom HTML blocks, animated backgrounds, and animation overlays can run user-written `<script>` code, but only when `ALLOW_CUSTOM_SCRIPTS=True`. This is off by default, and you should keep it that way unless the instance is yours alone. Scripts run inside sandboxed iframes, but turning this on is still a deliberate stored-XSS surface: anyone who can edit a board can run JavaScript for anyone who views it. Never enable it on a shared or public instance.

All configuration lives in `backend/.env`. See **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** for the main options.

### Without Docker

Requirements: Python 3.12+, Node.js 20.19+.

The backend and frontend run as two separate dev servers, in two terminals.

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # Windows: copy .env.example .env
```

Open `backend/.env` and replace `SECRET_KEY` and `JWT_SIGNING_KEY` with two different random values. You can generate one with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Then create the database and an account, and start the server:

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The backend runs at `http://localhost:8000`.

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` and talks to the backend at `http://localhost:8000` by default. Open it and log in with the account you created.

Public sign-up is off by default. To let people register through the UI, set `ALLOW_PUBLIC_REGISTRATION=True` in `backend/.env`.

### With Docker

Requirements: Docker with Docker Compose.

From the repo root:

```bash
./install.sh
```

On Windows, use PowerShell instead:

```powershell
.\install.ps1
```

The script asks once whether you want to set things up in the terminal or in your browser, then walks you through the setup: local or real domain, admin account, security options, AI assistant, limits. Nothing is written until you confirm on the last screen. After that it builds and starts the stack and prints the addresses the site is reachable at.

The web wizard is only reachable from the machine itself (`http://localhost:7000`). If you're setting up a remote server over SSH, the easiest option is to run the whole setup right in the console with the terminal wizard. It asks the same questions. Or open the web wizard through an SSH tunnel.

After the first setup, running `./install.sh` again just starts the stack.

**Changing settings later**

```bash
docker compose --profile installer-web up -d installer-web
```

Open `http://127.0.0.1:7000`, change what you need, and submit. The affected containers restart automatically and the installer shuts itself down. The terminal equivalent is:

```bash
docker compose --profile installer run --rm installer python -m installer.cli edit
```

The installer containers mount the Docker socket so they can restart other containers. That's root-equivalent access to the host, which is why they only run when you start them and stop as soon as they're done.

**Real domain + HTTPS**

The project's own nginx doesn't handle TLS. If your server already runs nginx for other sites, add Tasks Space as one more site behind it. Pick "A real domain" in the wizard and set `HTTP_PORT` to a free local port, such as `8080`. The container then listens only on `127.0.0.1`, and the install script prints a ready-to-paste config like this:

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
sudo certbot --nginx -d your-domain.com
```

## Project structure

```
.
├── backend/              Django API
│   ├── accounts/         Auth: login, registration, JWT cookies
│   ├── core/             Site-wide settings (SiteConfig)
│   ├── pages/            Boards, tasks, image uploads, saved designs,
│   │                     AI proxy, sandboxed render preview, sanitizers
│   └── tasks/            Django project settings and URLs
├── frontend/             React app
│   └── src/
│       ├── board/        Board editor: canvas, blocks, style panels
│       │   ├── blocks/   Block types (tasks, notes, images, custom HTML)
│       │   └── ai/       AI design assistant
│       ├── pages/        Login, register, board pages
│       ├── context/      Auth state
│       └── lib/          API client
├── installer/            Setup wizard
│   ├── core/             Shared config logic
│   ├── cli.py            Terminal wizard
│   └── web/              Web wizard (FastAPI)
├── nginx/                Reverse proxy config and security headers
├── docs/                 Configuration reference, technical notes, screenshots
├── docker-compose.yml
├── install.sh            Setup/start script (Linux/macOS)
└── install.ps1           Setup/start script (Windows)
```

## Technical notes

Implementation details for deployment and development are in **[docs/TECHNICAL_NOTES.md](docs/TECHNICAL_NOTES.md)**: how the CSP is split between nginx and Django, the security headers, and a few non-obvious gotchas.
