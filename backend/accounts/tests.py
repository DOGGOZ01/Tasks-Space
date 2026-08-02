from django.contrib.auth import get_user_model
from django.test import override_settings
from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase

from core.models import SiteConfig

User = get_user_model()


class RegistrationTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_registration_closed_by_default(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "newuser", "password": "correct-horse-battery-staple"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="newuser").exists())

    @override_settings(ALLOW_PUBLIC_REGISTRATION=True)
    def test_registration_succeeds_when_open(self):
        SiteConfig.get_solo()
        response = self.client.post(
            "/api/auth/register/",
            {"username": "newuser", "password": "correct-horse-battery-staple"},
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(User.objects.filter(username="newuser").exists())
        self.assertNotIn("password", response.data)
        self.assertIn("access_token", response.cookies)
        self.assertIn("refresh_token", response.cookies)
        self.assertTrue(response.cookies["access_token"]["httponly"])
        self.assertTrue(response.cookies["refresh_token"]["httponly"])

    @override_settings(ALLOW_PUBLIC_REGISTRATION=True)
    def test_registration_respects_site_config_switch(self):
        config = SiteConfig.get_solo()
        config.registration_open = False
        config.save()
        response = self.client.post(
            "/api/auth/register/",
            {"username": "newuser", "password": "correct-horse-battery-staple"},
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(ALLOW_PUBLIC_REGISTRATION=True)
    def test_duplicate_username_case_insensitive_rejected(self):
        User.objects.create_user(username="Alex", password="whatever-pw-123")
        response = self.client.post(
            "/api/auth/register/",
            {"username": "alex", "password": "correct-horse-battery-staple"},
        )
        self.assertEqual(response.status_code, 400)

    @override_settings(ALLOW_PUBLIC_REGISTRATION=True)
    def test_weak_password_rejected(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "newuser", "password": "password"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="newuser").exists())

    @override_settings(ALLOW_PUBLIC_REGISTRATION=True)
    def test_env_flag_overrides_site_config_even_if_open(self):
        SiteConfig.get_solo()
        with override_settings(ALLOW_PUBLIC_REGISTRATION=False):
            response = self.client.post(
                "/api/auth/register/",
                {"username": "newuser", "password": "correct-horse-battery-staple"},
            )
        self.assertEqual(response.status_code, 403)


class LoginTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="alex", password="s3cure-pw-123")

    def test_login_with_correct_credentials(self):
        response = self.client.post(
            "/api/auth/login/", {"username": "alex", "password": "s3cure-pw-123"}
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["username"], "alex")
        self.assertIn("access_token", response.cookies)
        self.assertIn("refresh_token", response.cookies)

    def test_login_with_wrong_password(self):
        response = self.client.post(
            "/api/auth/login/", {"username": "alex", "password": "wrong-password"}
        )
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("access_token", response.cookies)

    def test_login_with_nonexistent_user(self):
        response = self.client.post(
            "/api/auth/login/", {"username": "ghost", "password": "whatever-pw-123"}
        )
        self.assertEqual(response.status_code, 401)

    def test_login_missing_fields(self):
        response = self.client.post("/api/auth/login/", {})
        self.assertEqual(response.status_code, 401)

    def test_login_rate_limited(self):
        for _ in range(10):
            self.client.post(
                "/api/auth/login/", {"username": "alex", "password": "wrong-password"}
            )
        response = self.client.post(
            "/api/auth/login/", {"username": "alex", "password": "wrong-password"}
        )
        self.assertEqual(response.status_code, 429)


class MeViewTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="alex", password="s3cure-pw-123")

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_me_returns_current_user_only(self):
        self.client.post("/api/auth/login/", {"username": "alex", "password": "s3cure-pw-123"})
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "alex")
        self.assertNotIn("password", response.data)

    def test_garbage_access_cookie_is_rejected(self):
        self.client.cookies["access_token"] = "not-a-real-jwt"
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)


class RefreshAndLogoutTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="alex", password="s3cure-pw-123")

    def test_refresh_without_cookie(self):
        response = self.client.post("/api/auth/refresh/")
        self.assertEqual(response.status_code, 401)

    def test_refresh_with_valid_cookie_rotates_token(self):
        self.client.post("/api/auth/login/", {"username": "alex", "password": "s3cure-pw-123"})
        old_refresh = self.client.cookies["refresh_token"].value

        response = self.client.post("/api/auth/refresh/")
        self.assertEqual(response.status_code, 200, response.data)
        new_refresh = self.client.cookies["refresh_token"].value
        self.assertNotEqual(old_refresh, new_refresh)

    def test_old_refresh_token_is_blacklisted_after_rotation(self):
        self.client.post("/api/auth/login/", {"username": "alex", "password": "s3cure-pw-123"})
        old_refresh = self.client.cookies["refresh_token"].value

        self.client.post("/api/auth/refresh/")

        self.client.cookies["refresh_token"] = old_refresh
        response = self.client.post("/api/auth/refresh/")
        self.assertEqual(response.status_code, 401)

    def test_tampered_refresh_cookie_rejected_and_cookies_cleared(self):
        self.client.cookies["refresh_token"] = "not-a-real-jwt"
        response = self.client.post("/api/auth/refresh/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.cookies["access_token"].value, "")
        self.assertEqual(response.cookies["refresh_token"].value, "")

    def test_logout_blacklists_refresh_token(self):
        self.client.post("/api/auth/login/", {"username": "alex", "password": "s3cure-pw-123"})
        refresh_value = self.client.cookies["refresh_token"].value

        logout = self.client.post("/api/auth/logout/")
        self.assertEqual(logout.status_code, 200)
        self.assertEqual(logout.cookies["access_token"].value, "")

        self.client.cookies["refresh_token"] = refresh_value
        response = self.client.post("/api/auth/refresh/")
        self.assertEqual(response.status_code, 401)

    def test_logout_without_any_session_still_succeeds(self):
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, 200)


class CSRFEnforcementTests(APITestCase):
    client_class = APIClient

    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)
        self.user = User.objects.create_user(username="alex", password="s3cure-pw-123")
        self.client.post("/api/auth/login/", {"username": "alex", "password": "s3cure-pw-123"})

    def test_state_changing_request_without_csrf_token_is_rejected(self):
        response = self.client.patch("/api/page/", {"layout": {}}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_state_changing_request_with_wrong_csrf_token_is_rejected(self):
        response = self.client.patch(
            "/api/page/", {"layout": {}}, format="json", HTTP_X_CSRFTOKEN="bogus-token"
        )
        self.assertEqual(response.status_code, 403)

    def test_state_changing_request_with_correct_csrf_token_succeeds(self):
        csrf_token = self.client.cookies["csrftoken"].value
        response = self.client.patch(
            "/api/page/", {"layout": {}}, format="json", HTTP_X_CSRFTOKEN=csrf_token
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_get_request_does_not_require_csrf_token(self):
        response = self.client.get("/api/page/")
        self.assertEqual(response.status_code, 200)


class RegistrationStatusTests(APITestCase):
    @override_settings(ALLOW_PUBLIC_REGISTRATION=False)
    def test_reports_closed_by_default(self):
        response = self.client.get("/api/auth/registration-status/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["registration_open"])

    @override_settings(ALLOW_PUBLIC_REGISTRATION=True)
    def test_reports_open_when_env_and_site_config_agree(self):
        SiteConfig.get_solo()
        response = self.client.get("/api/auth/registration-status/")
        self.assertTrue(response.data["registration_open"])

    @override_settings(ALLOW_CUSTOM_SCRIPTS=False)
    def test_reports_allow_custom_scripts_off(self):
        response = self.client.get("/api/auth/registration-status/")
        self.assertFalse(response.data["allow_custom_scripts"])

    @override_settings(ALLOW_CUSTOM_SCRIPTS=True)
    def test_reports_allow_custom_scripts_on(self):
        response = self.client.get("/api/auth/registration-status/")
        self.assertTrue(response.data["allow_custom_scripts"])
