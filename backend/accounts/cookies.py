from django.conf import settings
from rest_framework_simplejwt.settings import api_settings as jwt_settings


def _common_kwargs():
    return dict(
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )


def set_auth_cookies(response, access=None, refresh=None):
    if access is not None:
        response.set_cookie(
            settings.AUTH_COOKIE_ACCESS,
            str(access),
            max_age=int(jwt_settings.ACCESS_TOKEN_LIFETIME.total_seconds()),
            **_common_kwargs(),
        )
    if refresh is not None:
        response.set_cookie(
            settings.AUTH_COOKIE_REFRESH,
            str(refresh),
            max_age=int(jwt_settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
            **_common_kwargs(),
        )


def clear_auth_cookies(response):
    response.delete_cookie(settings.AUTH_COOKIE_ACCESS, path="/")
    response.delete_cookie(settings.AUTH_COOKIE_REFRESH, path="/")
