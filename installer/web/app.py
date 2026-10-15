import os
import threading
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from installer.core import apply, envfile, schema, validate

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Tasks Space Installer")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


def _static_version(filename):
    return int((BASE_DIR / "static" / filename).stat().st_mtime)


templates.env.globals["static_version"] = _static_version


def _origin_host(value):
    if not value:
        return None
    without_scheme = value.split("://", 1)[-1]
    return without_scheme.split("/", 1)[0]


@app.middleware("http")
async def reject_cross_origin_posts(request: Request, call_next):
    if request.method == "POST":
        expected_host = request.url.netloc
        submitted_host = _origin_host(request.headers.get("origin")) or _origin_host(
            request.headers.get("referer")
        )
        if submitted_host != expected_host:
            return PlainTextResponse("Cross-origin POST rejected.", status_code=403)
    return await call_next(request)


SELF_SHUTDOWN_DELAY_SECONDS = 2.5


def _schedule_self_shutdown():
    def _shutdown():
        time.sleep(SELF_SHUTDOWN_DELAY_SECONDS)
        os._exit(0)

    threading.Thread(target=_shutdown, daemon=True).start()


def _target_url(request, values):
    if values.get("DOMAIN"):
        return f"https://{values['DOMAIN']}/"
    host = request.url.hostname or "localhost"
    port = values.get("HTTP_PORT") or "80"
    if port == "80":
        return f"http://{host}/"
    return f"http://{host}:{port}/"


WIZARD_BOOL_FIELDS = tuple(
    name for name in schema.SETUP_WIZARD_FIELDS if schema.FIELDS_BY_NAME[name].kind == "bool"
)
WIZARD_STR_FIELDS = tuple(
    name for name in schema.SETUP_WIZARD_FIELDS if schema.FIELDS_BY_NAME[name].kind != "bool"
)

GENERIC_SETUP_SECTIONS = ("Auth throttling", "Render preview", "Image / GIF uploads", "Board content limits")

LABEL_ACRONYMS = {"ai", "api", "cors", "css", "gif", "html", "http", "json", "jwt", "ttl", "url"}


def _field_label(name):
    words = [w.upper() if w.lower() in LABEL_ACRONYMS else w.lower() for w in name.split("_")]
    if words and words[0].islower():
        words[0] = words[0].capitalize()
    return " ".join(words)


def _field_dict(field, values):
    raw = values.get(field.name, field.default)
    if field.kind == "bool":
        value = raw == "True"
    elif field.kind == "secret":
        value = "********" if raw else ""
    elif field.kind == "secret_input":
        value = bool(raw)
    else:
        value = raw
    entry = {
        "name": field.name,
        "label": _field_label(field.name),
        "kind": field.kind,
        "value": value,
        "help": field.help,
        "readonly": field.name in schema.DERIVED_FIELDS,
    }
    if field.options:
        entry["options"] = list(field.options)
    return entry


def _build_sections(values):
    sections = []
    for section in schema.SECTIONS:
        fields = [_field_dict(field, values) for field in schema.fields_in_section(section)]
        sections.append({"title": section, "fields": fields})
    return sections


def _setup_generic_sections():
    sections = []
    for section in GENERIC_SETUP_SECTIONS:
        fields = [_field_dict(field, {}) for field in schema.fields_in_section(section)]
        sections.append({"title": section, "fields": fields})
    return sections


@app.get("/")
def index(request: Request):
    try:
        configured = apply.is_configured()
    except envfile.EnvFileIsDirectory as exc:
        return templates.TemplateResponse("setup_error.html", {"request": request, "error": str(exc)})
    if not configured:
        return templates.TemplateResponse(
            "setup.html", {"request": request, "sections": _setup_generic_sections()}
        )
    return RedirectResponse("/settings", status_code=302)


@app.post("/setup")
async def setup(request: Request):
    form = await request.form()

    domain = (form.get("DOMAIN") or "").strip()
    admin_username = (form.get("DJANGO_SUPERUSER_USERNAME") or "").strip()
    admin_password = form.get("DJANGO_SUPERUSER_PASSWORD") or ""
    admin_email = (form.get("DJANGO_SUPERUSER_EMAIL") or "").strip()

    if not admin_username or not admin_password:
        return templates.TemplateResponse(
            "setup_error.html",
            {"request": request, "error": "Admin username and password are required."},
        )

    field_values = {"DOMAIN": domain}

    for name in WIZARD_BOOL_FIELDS:
        field_values[name] = "True" if name in form else "False"

    for name in WIZARD_STR_FIELDS:
        if name in form:
            field_values[name] = form.get(name)

    try:
        values = apply.run_setup(
            field_values,
            {"username": admin_username, "password": admin_password, "email": admin_email},
        )
    except Exception as exc:
        return templates.TemplateResponse("setup_error.html", {"request": request, "error": str(exc)})

    _schedule_self_shutdown()
    return templates.TemplateResponse(
        "setup_starting.html", {"request": request, "target_url": _target_url(request, values)}
    )


@app.get("/settings")
def settings_page(request: Request):
    try:
        values = apply.current_values()
    except envfile.EnvFileIsDirectory as exc:
        return templates.TemplateResponse("setup_error.html", {"request": request, "error": str(exc)})
    sections = _build_sections(values)
    return templates.TemplateResponse(
        "settings.html", {"request": request, "sections": sections, "message": None}
    )


@app.post("/settings")
async def update_settings(request: Request):
    form = await request.form()
    current = apply.current_values()

    updates = {}
    for field in schema.FIELDS:
        if field.never_prompt or field.name in schema.DERIVED_FIELDS:
            continue
        if field.kind == "bool":
            updates[field.name] = "True" if field.name in form else "False"
        elif field.kind == "secret_input":
            submitted = form.get(field.name) or ""
            if submitted:
                updates[field.name] = submitted
        elif field.name in form:
            updates[field.name] = form.get(field.name)

    try:
        updated_values, restarted, recreate_services, changed_keys = apply.apply_settings_update(updates)
    except validate.ValidationError as exc:
        sections = _build_sections(current)
        return templates.TemplateResponse(
            "settings.html",
            {"request": request, "sections": sections, "message": str(exc)},
        )

    if not changed_keys:
        _schedule_self_shutdown()
        return templates.TemplateResponse(
            "closing.html",
            {"request": request, "heading": "Nothing to change", "message": "No settings were changed."},
        )

    if recreate_services:
        message = "Settings saved. Re-run ./install.sh (or install.ps1) to apply this."
    elif not restarted:
        message = "Settings saved, but no running container was found to restart."
    else:
        message = "Settings saved. Restarted: " + ", ".join(restarted) + "."

    _schedule_self_shutdown()
    return templates.TemplateResponse(
        "closing.html", {"request": request, "heading": "Settings saved", "message": message}
    )


@app.post("/settings/regenerate/{field_name}")
def regenerate(request: Request, field_name: str):
    field = schema.FIELDS_BY_NAME.get(field_name)
    if field is None or field.kind != "secret":
        sections = _build_sections(apply.current_values())
        return templates.TemplateResponse(
            "settings.html",
            {
                "request": request,
                "sections": sections,
                "message": f"{field_name} is not a regenerable field.",
            },
        )

    _, restarted = apply.regenerate_secret(field_name)
    message = (
        f"{field_name} regenerated and the backend restarted."
        if restarted
        else f"{field_name} regenerated, but the backend container could not be restarted."
    )

    _schedule_self_shutdown()
    return templates.TemplateResponse(
        "closing.html", {"request": request, "heading": "Secret regenerated", "message": message}
    )
