import re

_DOMAIN_RE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


class ValidationError(Exception):
    pass


def validate_domain(domain):
    if not domain or "\n" in domain or "\r" in domain or not _DOMAIN_RE.match(domain):
        raise ValidationError(f"'{domain}' doesn't look like a valid domain name.")
    return domain


def validate_email(email):
    if not email or not _EMAIL_RE.match(email):
        raise ValidationError(f"'{email}' doesn't look like a valid email address.")
    return email


def validate_int_field(field_name, raw_value):
    if raw_value is None or not str(raw_value).strip().lstrip("-").isdigit():
        raise ValidationError(f"'{field_name}' must be a whole number, got '{raw_value}'.")
    return raw_value
