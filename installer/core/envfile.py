import os
import re

_LINE_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


class EnvFileIsDirectory(Exception):
    pass


def read_dotenv(path):
    values = {}
    if path.is_dir():
        raise EnvFileIsDirectory(
            f"{path} is a directory, not a file. Docker created it automatically because the "
            f"file didn't exist before the first `docker compose` run. Remove it and run "
            f"`cp {path.name}.example {path.name}` (or the Windows `copy` equivalent) in that "
            f"directory before trying again."
        )
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = _LINE_RE.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def _format_value(value):
    value = value.replace("\r", "").replace("\n", "")
    if value == "" or any(ch in value for ch in " #\"'"):
        escaped = value.replace('"', '\\"')
        return f'"{escaped}"'
    return value


BACKEND_CONTAINER_UID = 1000
BACKEND_CONTAINER_GID = 1000


def write_dotenv(path, values, owned_by_backend_container=False):
    lines = [f"{key}={_format_value(value)}" for key, value in values.items()]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if owned_by_backend_container:
        try:
            os.chmod(path, 0o640)
        except OSError:
            pass
        try:
            os.chown(path, BACKEND_CONTAINER_UID, BACKEND_CONTAINER_GID)
        except OSError:
            pass
    else:
        try:
            os.chmod(path, 0o644)
        except OSError:
            pass
