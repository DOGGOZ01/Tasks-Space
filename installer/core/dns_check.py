import socket
import urllib.error
import urllib.request


def resolve_domain(domain):
    try:
        return socket.gethostbyname(domain)
    except OSError:
        return None


def get_public_ip(timeout=3.0):
    try:
        with urllib.request.urlopen("https://api.ipify.org", timeout=timeout) as response:
            return response.read().decode().strip()
    except (urllib.error.URLError, OSError, ValueError):
        return None


def check_dns(domain):
    resolved = resolve_domain(domain)
    if resolved is None:
        return None, f"Could not resolve {domain} yet. Make sure its DNS A/AAAA record points here."

    public_ip = get_public_ip()
    if public_ip is None:
        return None, "Could not determine this server's public IP to compare against DNS."

    if resolved != public_ip:
        return False, (
            f"{domain} currently resolves to {resolved}, but this server's public IP is "
            f"{public_ip}. Certificate issuance will fail until DNS points here."
        )

    return True, f"{domain} resolves to this server ({public_ip})."
