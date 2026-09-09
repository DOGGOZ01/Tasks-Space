import subprocess


def find_container(service_name):
    try:
        result = subprocess.run(
            [
                "docker",
                "ps",
                "--filter",
                f"label=com.docker.compose.service={service_name}",
                "--format",
                "{{.Names}}",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0:
        return None

    names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return names[0] if names else None


def restart_service(service_name):
    container = find_container(service_name)
    if container is None:
        return False

    try:
        result = subprocess.run(
            ["docker", "restart", container],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False

    return result.returncode == 0
