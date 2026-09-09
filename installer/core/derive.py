def derive_fields(deploy_mode, domain, http_port):
    if deploy_mode == "hosted":
        return {
            "ALLOWED_HOSTS": f"{domain},127.0.0.1,localhost,backend,nginx",
            "CORS_ALLOWED_ORIGINS": f"https://{domain}",
            "FRONTEND_ORIGIN": f"https://{domain}",
            "COOKIE_SECURE": "True",
        }
    return {
        "ALLOWED_HOSTS": "localhost,127.0.0.1,backend,nginx",
        "CORS_ALLOWED_ORIGINS": f"http://localhost:{http_port}",
        "FRONTEND_ORIGIN": f"http://localhost:{http_port}",
        "COOKIE_SECURE": "False",
    }
