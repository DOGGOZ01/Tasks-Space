import re

_DOMAIN_RE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")


class ValidationError(Exception):
    pass


def validate_domain(domain):
    if not domain or "\n" in domain or "\r" in domain or not _DOMAIN_RE.match(domain):
        raise ValidationError(f"'{domain}' doesn't look like a valid domain name.")
    return domain


RESERVED_PROXY_PORTS = ("80", "443")


def validate_domain_port(domain, port):
    if domain and str(port).strip() in RESERVED_PROXY_PORTS:
        raise ValidationError(
            f"HTTP_PORT can't be {str(port).strip()} when a domain is set, because your host nginx uses it. Use another port, e.g. 8080."
        )


def validate_int_field(field_name, raw_value):
    if raw_value is None or not str(raw_value).strip().lstrip("-").isdigit():
        raise ValidationError(f"'{field_name}' must be a whole number, got '{raw_value}'.")
    return raw_value
