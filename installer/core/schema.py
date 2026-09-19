import dataclasses


@dataclasses.dataclass(frozen=True)
class Field:
    name: str
    section: str
    kind: str
    default: str = ""
    options: tuple = ()
    help: str = ""
    never_prompt: bool = False


ROOT_ENV_FIELDS = ("HTTP_PORT", "INSTALLER_WEB_PORT", "DOMAIN", "NGINX_HOST_BIND")

NGINX_RESTART_FIELDS = ("HTTP_PORT", "NGINX_HOST_BIND")

RECREATE_FIELDS = ("HTTP_PORT", "INSTALLER_WEB_PORT", "NGINX_HOST_BIND")

DERIVED_FIELDS = ("ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS", "FRONTEND_ORIGIN", "COOKIE_SECURE", "NGINX_HOST_BIND")

DERIVE_TRIGGER_FIELDS = ("DOMAIN", "HTTP_PORT")

ADMIN_ENV_FIELDS = ("DJANGO_SUPERUSER_USERNAME", "DJANGO_SUPERUSER_PASSWORD", "DJANGO_SUPERUSER_EMAIL")

FIELDS = [
    Field("DEBUG", "Core", "bool", default="False"),
    Field("SECRET_KEY", "Core", "secret", never_prompt=True),
    Field("JWT_SIGNING_KEY", "Core", "secret", never_prompt=True),
    Field("ALLOWED_HOSTS", "Core", "str", default="localhost,127.0.0.1",
          help="Auto-derived from Domain -- change Domain to update this."),
    Field("CORS_ALLOWED_ORIGINS", "Core", "str", default="http://localhost:5173,http://127.0.0.1:5173",
          help="Auto-derived from Domain/HTTP port -- change those to update this."),
    Field("FRONTEND_ORIGIN", "Core", "str", default="http://localhost:5173",
          help="Auto-derived from Domain/HTTP port -- change those to update this."),
    Field("COOKIE_SECURE", "Core", "bool", default="False",
          help="Auto-derived from Domain -- change Domain to update this."),
    Field("NGINX_HOST_BIND", "Core", "str", default="",
          help="Auto-derived from Domain -- change Domain to update this."),

    Field("DOMAIN", "Deployment", "str", default="",
          help="Leave blank for local/IP-only access. See README's \"Real domain + HTTPS\" section."),
    Field("HTTP_PORT", "Deployment", "int", default="80",
          help="With a domain set, use a free local port other than 80/443 (e.g. 8080)."),
    Field("INSTALLER_WEB_PORT", "Deployment", "int", default="7000"),

    Field("ALLOW_CUSTOM_SCRIPTS", "Security", "bool", default="False",
          help="Allows <script> tags in Custom HTML/CSS blocks to actually run. "
               "Only for a fully trusted, single-user local instance."),
    Field("ALLOW_PUBLIC_REGISTRATION", "Security", "bool", default="False"),

    Field("DAY_LOCK_MODE", "Day lock", "choice", default="local", options=("local", "global"),
          help="local locks as soon as the day/week is over in DAY_LOCK_TIMEZONE; "
               "global locks only once the day/week is over everywhere on Earth."),
    Field("DAY_LOCK_TIMEZONE", "Day lock", "str", default="Europe/Paris",
          help="IANA timezone name, e.g. Europe/Paris, America/New_York."),

    Field("AUTH_LOGIN_THROTTLE_RATE", "Auth throttling", "str", default="10/min"),
    Field("AUTH_REGISTER_THROTTLE_RATE", "Auth throttling", "str", default="5/min"),
    Field("AUTH_REFRESH_THROTTLE_RATE", "Auth throttling", "str", default="30/min"),

    Field("AI_ASSISTANT_ENABLED", "AI assistant", "bool", default="False"),
    Field("AI_ASSISTANT_PROVIDER", "AI assistant", "choice", default="anthropic",
          options=("anthropic", "openai", "deepseek")),
    Field("AI_ASSISTANT_MODEL", "AI assistant", "str", default="claude-sonnet-5"),
    Field("AI_ASSISTANT_API_KEY", "AI assistant", "secret_input", default=""),
    Field("AI_ASSISTANT_MAX_TOKENS", "AI assistant", "int", default="16000"),
    Field("AI_ASSISTANT_TIMEOUT_SECONDS", "AI assistant", "int", default="60"),
    Field("AI_CHAT_THROTTLE_RATE", "AI assistant", "str", default="20/min"),
    Field("MAX_AI_REQUEST_BYTES", "AI assistant", "int", default="200000"),

    Field("RENDER_PREVIEW_TTL_SECONDS", "Render preview", "int", default="600"),
    Field("MAX_RENDER_PREVIEW_REQUEST_BYTES", "Render preview", "int", default="200000"),
    Field("RENDER_PREVIEW_THROTTLE_RATE", "Render preview", "str", default="180/min"),

    Field("MAX_IMAGE_UPLOAD_BYTES", "Image / GIF uploads", "int", default="5242880"),
    Field("MAX_IMAGE_DIMENSION", "Image / GIF uploads", "int", default="4000"),
    Field("MAX_GIF_FRAMES", "Image / GIF uploads", "int", default="300"),
    Field("MIN_GIF_FRAME_DURATION_MS", "Image / GIF uploads", "int", default="20"),

    Field("MAX_CUSTOM_HTML_LENGTH", "Board content limits", "int", default="20000"),
    Field("MAX_CUSTOM_CSS_LENGTH", "Board content limits", "int", default="4000"),
    Field("MAX_LAYOUT_JSON_BYTES", "Board content limits", "int", default="2000000"),
    Field("MAX_TASK_TEXT_LENGTH", "Board content limits", "int", default="500"),
    Field("MAX_TASKS_PER_DATE", "Board content limits", "int", default="200"),
    Field("MAX_TASKS_JSON_BYTES", "Board content limits", "int", default="500000"),
    Field("MAX_SAVED_DESIGN_NAME_LENGTH", "Board content limits", "int", default="80"),
    Field("MAX_SAVED_DESIGNS_PER_USER", "Board content limits", "int", default="30"),
]

FIELDS_BY_NAME = {field.name: field for field in FIELDS}

SECTIONS = list(dict.fromkeys(field.section for field in FIELDS))

SETUP_SPECIAL_FIELDS = ("DOMAIN",)

SETUP_WIZARD_FIELDS = tuple(
    field.name
    for field in FIELDS
    if field.section != "Core" and not field.never_prompt and field.name not in SETUP_SPECIAL_FIELDS
)


def fields_in_section(section):
    return [field for field in FIELDS if field.section == section]


def service_for_field(name):
    if name in NGINX_RESTART_FIELDS:
        return "nginx"
    if name == "INSTALLER_WEB_PORT":
        return "installer-web"
    return "backend"


def needs_recreate(name):
    return name in RECREATE_FIELDS


def is_mirrored_to_root(name):
    return name in ROOT_ENV_FIELDS
