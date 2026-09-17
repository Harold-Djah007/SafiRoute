"""Production runtime guards. Local DEBUG+SQLite remains valid for demo only."""

from __future__ import annotations

from django.core.exceptions import ImproperlyConfigured

SQLITE_ENGINES = {
    "django.db.backends.sqlite3",
    "django.db.backends.sqlite",
}

DEV_SECRET_PREFIXES = ("dev-only", "insecure", "change-me", "changeme")


def env_is_production(django_env: str) -> bool:
    return (django_env or "").strip().lower() in {"prod", "production"}


def validate_runtime(*, debug: bool, engine: str, secret: str, django_env: str, allowed_hosts: list[str]):
    production = env_is_production(django_env) or not debug
    if not production:
        return

    if not secret or secret.strip().lower().startswith(DEV_SECRET_PREFIXES):
        raise ImproperlyConfigured(
            "Production requires DJANGO_SECRET_KEY to be set to a non-default value."
        )
    if engine in SQLITE_ENGINES or "sqlite" in (engine or "").lower():
        raise ImproperlyConfigured(
            "Production requires PostgreSQL. Set DB_ENGINE=django.db.backends.postgresql "
            "and DB_NAME/USER/PASSWORD/HOST. SQLite is local-demo only."
        )
    hosts = [item.strip() for item in allowed_hosts if item.strip()]
    if not hosts or hosts == ["*"]:
        raise ImproperlyConfigured(
            "Production requires explicit ALLOWED_HOSTS (not '*')."
        )


def azure_configured(account_name: str, credential: str, container: str) -> bool:
    """Enable Azure Blob only when a container and real credentials exist.

    `credential` is an account key or a connection string. Account name plus
    the default container is not enough — that previously turned Azure on
    with no secret and failed on the first media write.
    """
    name = (account_name or "").strip()
    secret = (credential or "").strip()
    bucket = (container or "").strip()
    if not secret or not bucket:
        return False
    if secret.lower().startswith("defaultendpointsprotocol="):
        return True
    return bool(name)


def sentry_should_init(dsn: str) -> bool:
    dsn = (dsn or "").strip()
    if not dsn:
        return False
    if "example" in dsn or dsn.startswith("https://YOUR") or dsn.endswith("invalid"):
        return False
    return dsn.startswith("http://") or dsn.startswith("https://")
