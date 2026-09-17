def derive_fields(domain, http_port):
    if domain:
        return {
            "ALLOWED_HOSTS": f"{domain},127.0.0.1,localhost,backend,nginx",
            "CORS_ALLOWED_ORIGINS": f"https://{domain}",
            "FRONTEND_ORIGIN": f"https://{domain}",
            "COOKIE_SECURE": "True",
            "NGINX_HOST_BIND": "127.0.0.1:",
        }
    return {
        "ALLOWED_HOSTS": "localhost,127.0.0.1,backend,nginx",
        "CORS_ALLOWED_ORIGINS": f"http://localhost:{http_port}",
        "FRONTEND_ORIGIN": f"http://localhost:{http_port}",
        "COOKIE_SECURE": "False",
        "NGINX_HOST_BIND": "",
    }
