from . import derive, dockerctl, envfile, schema, secretgen, validate
from .paths import BACKEND_ENV_PATH, ROOT_ENV_PATH
from .secretgen import PLACEHOLDER_SECRET_KEY


def default_values():
    return {field.name: field.default for field in schema.FIELDS if field.kind != "secret"}


def is_configured():
    if not BACKEND_ENV_PATH.exists():
        return False
    values = envfile.read_dotenv(BACKEND_ENV_PATH)
    secret = values.get("SECRET_KEY", "")
    return bool(secret) and secret != PLACEHOLDER_SECRET_KEY


def current_values():
    values = default_values()
    values.update(envfile.read_dotenv(BACKEND_ENV_PATH))
    return values


def mirror_root_env(values):
    root_values = envfile.read_dotenv(ROOT_ENV_PATH)
    for key in schema.ROOT_ENV_FIELDS:
        if key in values:
            root_values[key] = values[key]
    envfile.write_dotenv(ROOT_ENV_PATH, root_values)


def _validate_int_fields(values):
    for field in schema.FIELDS:
        if field.kind == "int" and field.name in values:
            validate.validate_int_field(field.name, values[field.name])


def run_setup(field_values, admin):
    values = current_values()
    values.update(field_values)

    http_port = values.get("HTTP_PORT", "80")
    domain = values.get("DOMAIN", "")
    if domain:
        validate.validate_domain(domain)
    values.update(derive.derive_fields(domain, http_port))

    secretgen.ensure_secrets(values)
    _validate_int_fields(values)

    username = admin.get("username") if admin else None
    if username:
        values["DJANGO_SUPERUSER_USERNAME"] = username
        values["DJANGO_SUPERUSER_PASSWORD"] = admin.get("password", "")
        values["DJANGO_SUPERUSER_EMAIL"] = admin.get("email", "")

    envfile.write_dotenv(BACKEND_ENV_PATH, values, owned_by_backend_container=True)
    mirror_root_env(values)
    return values


def write_settings_update(updates):
    current = envfile.read_dotenv(BACKEND_ENV_PATH)
    changed_keys = [key for key, value in updates.items() if current.get(key, "") != value]
    if not changed_keys:
        return current, [], [], []

    if updates.get("DOMAIN"):
        validate.validate_domain(updates["DOMAIN"])
    _validate_int_fields(updates)

    current.update(updates)

    if any(key in schema.DERIVE_TRIGGER_FIELDS for key in changed_keys):
        derived = derive.derive_fields(
            current.get("DOMAIN", ""),
            current.get("HTTP_PORT", "80"),
        )
        for key, value in derived.items():
            if current.get(key, "") != value:
                changed_keys.append(key)
            current[key] = value

    envfile.write_dotenv(BACKEND_ENV_PATH, current, owned_by_backend_container=True)

    if any(schema.is_mirrored_to_root(key) for key in changed_keys):
        mirror_root_env(current)

    restart_keys = [key for key in changed_keys if not schema.needs_recreate(key)]
    recreate_keys = [key for key in changed_keys if schema.needs_recreate(key)]

    services = sorted({schema.service_for_field(key) for key in restart_keys})
    recreate_services = sorted({schema.service_for_field(key) for key in recreate_keys})

    return current, services, recreate_services, changed_keys


def restart_services(services):
    restarted = []
    for service in services:
        if dockerctl.restart_service(service):
            restarted.append(service)
    return restarted


def apply_settings_update(updates):
    current, services, recreate_services, changed_keys = write_settings_update(updates)
    restarted = restart_services(services) if services else []
    return current, restarted, recreate_services, changed_keys


def regenerate_secret(field_name):
    values = envfile.read_dotenv(BACKEND_ENV_PATH)
    values[field_name] = secretgen.generate_secret()
    envfile.write_dotenv(BACKEND_ENV_PATH, values, owned_by_backend_container=True)
    restarted = dockerctl.restart_service("backend")
    return values, restarted
