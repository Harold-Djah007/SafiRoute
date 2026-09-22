"""SafiRoute Django settings.

Local demo (DEBUG=True): SQLite is allowed.
Production (DJANGO_ENV=production or DEBUG=False): PostgreSQL is required,
SECRET_KEY must be set, ALLOWED_HOSTS must be explicit, and HTTPS protections
are enabled by default.
"""

from pathlib import Path
import os

from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

from safiroute.prodcheck import azure_configured, sentry_should_init, validate_runtime

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


DJANGO_ENV = os.getenv("DJANGO_ENV", "development").strip().lower()
DEBUG = env_bool("DEBUG", default=DJANGO_ENV not in {"prod", "production"})
if DJANGO_ENV in {"prod", "production"}:
    DEBUG = env_bool("DEBUG", default=False)
    if DEBUG:
        raise ImproperlyConfigured("DEBUG cannot be True when DJANGO_ENV=production.")

_secret = os.getenv("DJANGO_SECRET_KEY", "").strip()
if DEBUG:
    SECRET_KEY = _secret or "dev-only-change-in-prod-safiroute"
else:
    SECRET_KEY = _secret

ALLOWED_HOSTS = [item.strip() for item in os.getenv("ALLOWED_HOSTS", "*" if DEBUG else "").split(",") if item.strip()]

DB_ENGINE = os.getenv(
    "DB_ENGINE",
    "django.db.backends.sqlite3" if DEBUG else "django.db.backends.postgresql",
)

validate_runtime(
    debug=DEBUG,
    engine=DB_ENGINE,
    secret=SECRET_KEY,
    django_env=DJANGO_ENV,
    allowed_hosts=ALLOWED_HOSTS,
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "django_filters",
    "waybills",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "safiroute.urls"
WSGI_APPLICATION = "safiroute.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": DB_ENGINE,
        "NAME": os.getenv("DB_NAME", str(BASE_DIR / "db.sqlite3")),
        "USER": os.getenv("DB_USER", ""),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", ""),
        "PORT": os.getenv("DB_PORT", ""),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "0" if DEBUG else "60")),
    }
}

if DEBUG:
    AUTH_PASSWORD_VALIDATORS = []
else:
    AUTH_PASSWORD_VALIDATORS = [
        {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
        {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
        {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
        {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    ]

LANGUAGE_CODE = "en-gb"
TIME_ZONE = "Africa/Accra"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
STATICFILES_DIRS = []

logo_dir = BASE_DIR.parent / "assets"
if logo_dir.exists():
    STATICFILES_DIRS.append(logo_dir)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "waybills.User"

CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [*default_headers, "x-csrftoken"]

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8877,http://127.0.0.1:8877",
    ).split(",")
    if origin.strip()
]
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = int(os.getenv("SESSION_COOKIE_AGE", str(14 * 24 * 60 * 60)))
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", default=not DEBUG)
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", default=not DEBUG)
if DEBUG:
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False

if not DEBUG:
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    X_FRAME_OPTIONS = "DENY"
    SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=True)
    SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", default=False)
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", default=True)
    if env_bool("TRUST_X_FORWARDED_PROTO", default=False):
        SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:3000")
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8877")
BACKUP_ENCRYPTION_KEY = os.getenv("BACKUP_ENCRYPTION_KEY", "")
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", str(BASE_DIR / "backups")))

MOBILE_TOKEN_MAX_AGE_SECONDS = int(
    os.getenv(
        "MOBILE_TOKEN_MAX_AGE_SECONDS",
        str(30 * 24 * 60 * 60 if DEBUG else 7 * 24 * 60 * 60),
    )
)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "waybills.authentication.MobileTokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

FILE_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024

AZURE_ACCOUNT_NAME = os.getenv("AZURE_ACCOUNT_NAME", "").strip()
AZURE_ACCOUNT_KEY = os.getenv("AZURE_ACCOUNT_KEY", "").strip()
AZURE_CONTAINER = os.getenv("AZURE_CONTAINER", "safiroute-media").strip()
AZURE_CONNECTION_STRING = os.getenv("AZURE_CONNECTION_STRING", "").strip()

if azure_configured(AZURE_ACCOUNT_NAME, AZURE_ACCOUNT_KEY or AZURE_CONNECTION_STRING, AZURE_CONTAINER):
    INSTALLED_APPS.append("storages")
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.azure_storage.AzureStorage",
            "OPTIONS": {
                "account_name": AZURE_ACCOUNT_NAME,
                "account_key": AZURE_ACCOUNT_KEY or None,
                "connection_string": AZURE_CONNECTION_STRING or None,
                "azure_container": AZURE_CONTAINER,
            },
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
        },
    }

SENTRY_DSN = os.getenv("SENTRY_DSN", "").strip()
if sentry_should_init(SENTRY_DSN):
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration()],
        send_default_pii=False,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0")),
        environment=DJANGO_ENV,
    )
