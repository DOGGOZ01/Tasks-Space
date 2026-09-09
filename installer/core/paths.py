import os
from pathlib import Path

BACKEND_ENV_PATH = Path(os.environ.get("INSTALLER_BACKEND_ENV_PATH", "/data/backend.env"))
ROOT_ENV_PATH = Path(os.environ.get("INSTALLER_ROOT_ENV_PATH", "/data/root.env"))
