from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    COOKIE_SECURE=(bool, False),
    ALLOW_CUSTOM_SCRIPTS=(bool, False),
    ALLOW_PUBLIC_REGISTRATION=(bool, False),
    AI_ASSISTANT_ENABLED=(bool, False),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
JWT_SIGNING_KEY = env("JWT_SIGNING_KEY")

DEBUG = env("DEBUG")

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

FRONTEND_ORIGIN = env("FRONTEND_ORIGIN", default="http://localhost:5173")

COOKIE_SECURE = env("COOKIE_SECURE")


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "core",
    "accounts",
    "pages",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "tasks.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "tasks.wsgi.application"


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS", default=["http://localhost:5173", "http://127.0.0.1:5173"]
)
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS


SESSION_COOKIE_SECURE = COOKIE_SECURE
CSRF_COOKIE_SECURE = COOKIE_SECURE
CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

AUTH_COOKIE_ACCESS = "access_token"
AUTH_COOKIE_REFRESH = "refresh_token"
AUTH_COOKIE_SAMESITE = "Lax"
AUTH_COOKIE_SECURE = COOKIE_SECURE


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.authentication.CookieJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "auth_login": env("AUTH_LOGIN_THROTTLE_RATE", default="10/min"),
        "auth_register": env("AUTH_REGISTER_THROTTLE_RATE", default="5/min"),
        "auth_refresh": env("AUTH_REFRESH_THROTTLE_RATE", default="30/min"),
        "ai_chat": env("AI_CHAT_THROTTLE_RATE", default="20/min"),
        "render_preview": env("RENDER_PREVIEW_THROTTLE_RATE", default="180/min"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": JWT_SIGNING_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

MAX_IMAGE_UPLOAD_BYTES = env.int("MAX_IMAGE_UPLOAD_BYTES", default=5 * 1024 * 1024)
MAX_IMAGE_DIMENSION = env.int("MAX_IMAGE_DIMENSION", default=4000)
MAX_GIF_FRAMES = env.int("MAX_GIF_FRAMES", default=300)
MIN_GIF_FRAME_DURATION_MS = env.int("MIN_GIF_FRAME_DURATION_MS", default=20)
MAX_CUSTOM_HTML_LENGTH = env.int("MAX_CUSTOM_HTML_LENGTH", default=20_000)
MAX_CUSTOM_CSS_LENGTH = env.int("MAX_CUSTOM_CSS_LENGTH", default=4_000)
MAX_LAYOUT_JSON_BYTES = env.int("MAX_LAYOUT_JSON_BYTES", default=2_000_000)

MAX_TASK_TEXT_LENGTH = env.int("MAX_TASK_TEXT_LENGTH", default=500)
MAX_TASKS_PER_DATE = env.int("MAX_TASKS_PER_DATE", default=200)
MAX_TASKS_JSON_BYTES = env.int("MAX_TASKS_JSON_BYTES", default=500_000)

MAX_SAVED_DESIGN_NAME_LENGTH = env.int("MAX_SAVED_DESIGN_NAME_LENGTH", default=80)
MAX_SAVED_DESIGNS_PER_USER = env.int("MAX_SAVED_DESIGNS_PER_USER", default=30)

ALLOW_CUSTOM_SCRIPTS = env("ALLOW_CUSTOM_SCRIPTS")

ALLOW_PUBLIC_REGISTRATION = env("ALLOW_PUBLIC_REGISTRATION")

AI_ASSISTANT_ENABLED = env("AI_ASSISTANT_ENABLED")
AI_ASSISTANT_PROVIDER = env("AI_ASSISTANT_PROVIDER", default="anthropic")
AI_ASSISTANT_MODEL = env("AI_ASSISTANT_MODEL", default="claude-sonnet-5")
AI_ASSISTANT_API_KEY = env("AI_ASSISTANT_API_KEY", default="")
AI_ASSISTANT_MAX_TOKENS = env.int("AI_ASSISTANT_MAX_TOKENS", default=16000)
AI_ASSISTANT_TIMEOUT_SECONDS = env.int("AI_ASSISTANT_TIMEOUT_SECONDS", default=60)

MAX_AI_REQUEST_BYTES = env.int("MAX_AI_REQUEST_BYTES", default=200_000)

DAY_LOCK_MODE = env("DAY_LOCK_MODE", default="local").strip().lower()
if DAY_LOCK_MODE not in ("local", "global"):
    DAY_LOCK_MODE = "local"

DAY_LOCK_TIMEZONE = env("DAY_LOCK_TIMEZONE", default="UTC")
try:
    from zoneinfo import ZoneInfo

    ZoneInfo(DAY_LOCK_TIMEZONE)
except Exception:
    DAY_LOCK_TIMEZONE = "UTC"

RENDER_PREVIEW_TTL_SECONDS = env.int("RENDER_PREVIEW_TTL_SECONDS", default=600)
MAX_RENDER_PREVIEW_REQUEST_BYTES = env.int("MAX_RENDER_PREVIEW_REQUEST_BYTES", default=200_000)
