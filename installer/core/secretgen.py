import secrets

SECRET_FIELDS = ("SECRET_KEY", "JWT_SIGNING_KEY")

PLACEHOLDER_SECRET_KEY = "change-me-to-a-long-random-value"
PLACEHOLDER_JWT_SIGNING_KEY = "change-me-to-a-different-long-random-value"

PLACEHOLDERS = {
    "SECRET_KEY": PLACEHOLDER_SECRET_KEY,
    "JWT_SIGNING_KEY": PLACEHOLDER_JWT_SIGNING_KEY,
}


def generate_secret():
    return secrets.token_urlsafe(50)


def ensure_secret(values, key):
    current = values.get(key)
    if current and current != PLACEHOLDERS.get(key):
        return False
    values[key] = generate_secret()
    return True


def ensure_secrets(values):
    for key in SECRET_FIELDS:
        ensure_secret(values, key)
    return values
