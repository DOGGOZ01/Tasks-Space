from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import SiteConfig

from .cookies import clear_auth_cookies, set_auth_cookies
from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()


class RegistrationStatusView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        ai_assistant_enabled = settings.AI_ASSISTANT_ENABLED and bool(settings.AI_ASSISTANT_API_KEY)
        return Response(
            {
                "registration_open": (
                    settings.ALLOW_PUBLIC_REGISTRATION and SiteConfig.get_solo().registration_open
                ),
                "allow_custom_scripts": settings.ALLOW_CUSTOM_SCRIPTS,
                "ai_assistant_enabled": ai_assistant_enabled,
                "ai_assistant_provider": settings.AI_ASSISTANT_PROVIDER if ai_assistant_enabled else None,
                "ai_assistant_model": settings.AI_ASSISTANT_MODEL if ai_assistant_enabled else None,
                "day_lock_mode": settings.DAY_LOCK_MODE,
                "day_lock_timezone": settings.DAY_LOCK_TIMEZONE,
            }
        )


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_register"

    def post(self, request):
        if not settings.ALLOW_PUBLIC_REGISTRATION or not SiteConfig.get_solo().registration_open:
            return Response(
                {"detail": "Registration is currently closed."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        get_token(request)
        response = Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        set_auth_cookies(response, access=refresh.access_token, refresh=refresh)
        return response


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_login"

    def post(self, request):
        username = request.data.get("username", "")
        password = request.data.get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        get_token(request)
        response = Response(UserSerializer(user).data)
        set_auth_cookies(response, access=refresh.access_token, refresh=refresh)
        return response


class RefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_refresh"

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if not raw_refresh:
            return Response({"detail": "Refresh cookie missing."}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError:
            response = Response({"detail": "Invalid refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
            clear_auth_cookies(response)
            return response

        data = serializer.validated_data
        response = Response({"detail": "ok"})
        set_auth_cookies(response, access=data["access"], refresh=data.get("refresh"))
        return response


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass
        response = Response({"detail": "logged out"})
        clear_auth_cookies(response)
        return response


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)
