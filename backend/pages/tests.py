import io
import os
import shutil
import tempfile
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from .models import Page, RenderPreview, SavedDesign, UploadedImage

TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c6360000002000100ffff03000006000557bfabd4"
    "0000000049454e44ae426082"
)

MEDIA_ROOT = tempfile.mkdtemp(prefix="pages-tests-media-")


def _make_valid_png_bytes(size=(3, 3)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color=(255, 0, 0)).save(buffer, format="PNG")
    return buffer.getvalue()


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class SavedDesignImageLifecycleTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.user = User.objects.create_user(username="alex", password="pw")
        self.page = Page.objects.create(owner=self.user)
        self.client.force_authenticate(self.user)

    def _make_page_image(self):
        image = UploadedImage(
            owner=self.user, page=self.page, content_type="image/png", width=1, height=1
        )
        image.image.save("source.png", ContentFile(TINY_PNG), save=False)
        image.save()
        return image

    def _layout_with_image(self, image_url):
        return {
            "ROOT": {"type": {"resolvedName": "Container"}, "nodes": ["img1"], "props": {}},
            "img1": {
                "type": {"resolvedName": "ImageBlock"},
                "nodes": [],
                "props": {"x": 0, "y": 0, "width": 100, "height": 100, "imageUrl": image_url},
            },
        }

    def test_saving_design_duplicates_referenced_image(self):
        source = self._make_page_image()
        image_url = f"http://testserver{source.image.url}"
        layout = self._layout_with_image(image_url)

        response = self.client.post(
            "/api/designs/",
            {
                "name": "My design",
                "design": {
                    "kind": "task-tracker-board-design",
                    "version": 1,
                    "device": "desktop",
                    "layout": layout,
                    "background": {},
                    "headerStyle": {},
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        design_id = response.data["id"]

        duplicates = UploadedImage.objects.filter(saved_design_id=design_id)
        self.assertEqual(duplicates.count(), 1)
        self.assertNotEqual(duplicates.first().pk, source.pk)

        new_url = response.data["design"]["layout"]["img1"]["props"]["imageUrl"]
        self.assertNotEqual(new_url, image_url)
        self.assertIn(duplicates.first().image.url, new_url)

        source.refresh_from_db()
        self.assertEqual(source.page_id, self.page.id)
        self.assertIsNone(source.saved_design_id)

    def test_deleting_design_removes_its_images_and_files(self):
        source = self._make_page_image()
        image_url = f"http://testserver{source.image.url}"
        layout = self._layout_with_image(image_url)

        create = self.client.post(
            "/api/designs/",
            {
                "name": "To delete",
                "design": {
                    "kind": "task-tracker-board-design",
                    "version": 1,
                    "device": "desktop",
                    "layout": layout,
                    "background": {},
                    "headerStyle": {},
                },
            },
            format="json",
        )
        design_id = create.data["id"]
        duplicate = UploadedImage.objects.get(saved_design_id=design_id)
        file_path = duplicate.image.path
        self.assertTrue(os.path.exists(file_path))

        delete = self.client.delete(f"/api/designs/{design_id}/")
        self.assertEqual(delete.status_code, 204)

        self.assertFalse(SavedDesign.objects.filter(pk=design_id).exists())
        self.assertFalse(UploadedImage.objects.filter(saved_design_id=design_id).exists())
        self.assertFalse(os.path.exists(file_path))

        self.assertTrue(UploadedImage.objects.filter(pk=source.pk).exists())

    def test_using_design_duplicates_image_back_into_the_page(self):
        source = self._make_page_image()
        image_url = f"http://testserver{source.image.url}"
        layout = self._layout_with_image(image_url)

        create = self.client.post(
            "/api/designs/",
            {
                "name": "To use",
                "design": {
                    "kind": "task-tracker-board-design",
                    "version": 1,
                    "device": "desktop",
                    "layout": layout,
                    "background": {},
                    "headerStyle": {},
                },
            },
            format="json",
        )
        design_id = create.data["id"]
        saved_copy = UploadedImage.objects.get(saved_design_id=design_id)

        use = self.client.post(f"/api/designs/{design_id}/use/")
        self.assertEqual(use.status_code, 200, use.data)

        new_url = use.data["layout"]["img1"]["props"]["imageUrl"]
        page_copy = UploadedImage.objects.get(page=self.page, saved_design__isnull=True, pk__gt=source.pk)
        self.assertIn(page_copy.image.url, new_url)
        self.assertNotEqual(page_copy.pk, saved_copy.pk)

        self.client.delete(f"/api/designs/{design_id}/")
        self.assertTrue(UploadedImage.objects.filter(pk=page_copy.pk).exists())
        self.assertTrue(os.path.exists(page_copy.image.path))

    def test_unreferenced_page_image_is_pruned_after_grace_period(self):
        stale = self._make_page_image()
        UploadedImage.objects.filter(pk=stale.pk).update(
            created_at=timezone.now() - timedelta(minutes=5)
        )
        fresh = self._make_page_image()

        response = self.client.patch("/api/page/", {"layout": {}}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

        self.assertFalse(UploadedImage.objects.filter(pk=stale.pk).exists())
        self.assertTrue(UploadedImage.objects.filter(pk=fresh.pk).exists())


class UnauthenticatedAccessTests(APITestCase):
    def test_page_endpoint_requires_auth(self):
        self.assertEqual(self.client.get("/api/page/").status_code, 401)
        self.assertEqual(self.client.patch("/api/page/", {}, format="json").status_code, 401)

    def test_task_board_endpoint_requires_auth(self):
        self.assertEqual(self.client.get("/api/tasks/").status_code, 401)
        self.assertEqual(self.client.patch("/api/tasks/", {}, format="json").status_code, 401)

    def test_designs_endpoints_require_auth(self):
        self.assertEqual(self.client.get("/api/designs/").status_code, 401)
        self.assertEqual(self.client.post("/api/designs/", {}, format="json").status_code, 401)
        self.assertEqual(self.client.delete("/api/designs/1/").status_code, 401)
        self.assertEqual(self.client.post("/api/designs/1/use/").status_code, 401)

    def test_image_upload_requires_auth(self):
        response = self.client.post("/api/uploads/images/", {"image": SimpleUploadedFile("x.png", TINY_PNG)})
        self.assertEqual(response.status_code, 401)


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class CrossUserIsolationTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.alex = User.objects.create_user(username="alex", password="pw")
        self.sam = User.objects.create_user(username="sam", password="pw")

    def test_each_user_gets_their_own_page(self):
        self.client.force_authenticate(self.alex)
        self.client.patch("/api/page/", {"layout": {"ROOT": {"type": {"resolvedName": "Container"}, "nodes": [], "props": {}}}}, format="json")

        self.client.force_authenticate(self.sam)
        response = self.client.get("/api/page/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["layout"], {})

    def test_task_board_data_is_isolated_per_user(self):
        self.client.force_authenticate(self.alex)
        self.client.patch(
            "/api/tasks/",
            {"daily_tasks": {"2026-08-02": [{"id": 1, "text": "alex's secret task", "done": False}]}},
            format="json",
        )

        self.client.force_authenticate(self.sam)
        response = self.client.get("/api/tasks/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["daily_tasks"], {})

    def test_user_cannot_delete_another_users_saved_design(self):
        self.client.force_authenticate(self.alex)
        create = self.client.post(
            "/api/designs/",
            {
                "name": "Alex's design",
                "design": {
                    "kind": "task-tracker-board-design",
                    "version": 1,
                    "device": "desktop",
                    "layout": {},
                    "background": {},
                    "headerStyle": {},
                },
            },
            format="json",
        )
        design_id = create.data["id"]

        self.client.force_authenticate(self.sam)
        delete = self.client.delete(f"/api/designs/{design_id}/")
        self.assertEqual(delete.status_code, 404)
        use = self.client.post(f"/api/designs/{design_id}/use/")
        self.assertEqual(use.status_code, 404)

        self.assertTrue(SavedDesign.objects.filter(pk=design_id).exists())

    def test_saved_design_list_never_includes_other_users_designs(self):
        self.client.force_authenticate(self.alex)
        self.client.post(
            "/api/designs/",
            {
                "name": "Alex's design",
                "design": {
                    "kind": "task-tracker-board-design",
                    "version": 1,
                    "device": "desktop",
                    "layout": {},
                    "background": {},
                    "headerStyle": {},
                },
            },
            format="json",
        )

        self.client.force_authenticate(self.sam)
        response = self.client.get("/api/designs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_uploaded_image_is_owned_by_uploader_only(self):
        self.client.force_authenticate(self.alex)
        upload = self.client.post(
            "/api/uploads/images/", {"image": SimpleUploadedFile("x.png", _make_valid_png_bytes())}
        )
        self.assertEqual(upload.status_code, 201, upload.data)
        image = UploadedImage.objects.get(pk=upload.data["id"])
        self.assertEqual(image.owner_id, self.alex.id)
        self.assertEqual(image.page_id, Page.objects.get(owner=self.alex).id)


@override_settings(MAX_SAVED_DESIGNS_PER_USER=2)
class SavedDesignLimitTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alex", password="pw")
        self.client.force_authenticate(self.user)

    def _create_design(self, name):
        return self.client.post(
            "/api/designs/",
            {
                "name": name,
                "design": {
                    "kind": "task-tracker-board-design",
                    "version": 1,
                    "device": "desktop",
                    "layout": {},
                    "background": {},
                    "headerStyle": {},
                },
            },
            format="json",
        )

    def test_limit_is_enforced(self):
        self.assertEqual(self._create_design("one").status_code, 201)
        self.assertEqual(self._create_design("two").status_code, 201)
        third = self._create_design("three")
        self.assertEqual(third.status_code, 400)
        self.assertEqual(SavedDesign.objects.filter(owner=self.user).count(), 2)


IMAGE_UPLOAD_MEDIA_ROOT = tempfile.mkdtemp(prefix="pages-tests-uploads-")


def _make_bmp_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2)).save(buffer, format="BMP")
    return buffer.getvalue()


@override_settings(MEDIA_ROOT=IMAGE_UPLOAD_MEDIA_ROOT)
class ImageUploadValidationTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(IMAGE_UPLOAD_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.user = User.objects.create_user(username="alex", password="pw")
        self.client.force_authenticate(self.user)

    def test_valid_png_upload_succeeds(self):
        response = self.client.post(
            "/api/uploads/images/", {"image": SimpleUploadedFile("x.png", _make_valid_png_bytes((3, 3)))}
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["width"], 3)
        self.assertEqual(response.data["height"], 3)

    def test_missing_file_rejected(self):
        response = self.client.post("/api/uploads/images/", {})
        self.assertEqual(response.status_code, 400)

    def test_non_image_file_rejected(self):
        response = self.client.post(
            "/api/uploads/images/",
            {"image": SimpleUploadedFile("x.png", b"not an image, just text")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(UploadedImage.objects.exists())

    def test_unsupported_format_rejected(self):
        response = self.client.post(
            "/api/uploads/images/",
            {"image": SimpleUploadedFile("x.bmp", _make_bmp_bytes())},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(UploadedImage.objects.exists())

    @override_settings(MAX_IMAGE_UPLOAD_BYTES=1)
    def test_oversized_file_rejected(self):
        response = self.client.post(
            "/api/uploads/images/", {"image": SimpleUploadedFile("x.png", TINY_PNG)}
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(UploadedImage.objects.exists())

    @override_settings(MAX_IMAGE_DIMENSION=2)
    def test_oversized_dimensions_rejected(self):
        response = self.client.post(
            "/api/uploads/images/", {"image": SimpleUploadedFile("x.png", _make_valid_png_bytes((3, 3)))}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("dimensions", str(response.data))
        self.assertFalse(UploadedImage.objects.exists())


@override_settings(ALLOW_CUSTOM_SCRIPTS=False)
class BoardSanitizationSecurityTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alex", password="pw")
        self.client.force_authenticate(self.user)

    def test_script_tag_in_html_background_stripped_by_default(self):
        response = self.client.patch(
            "/api/page/",
            {"background": {"type": "html", "html": "<script>alert(document.cookie)</script>"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn("<script", response.data["background"].get("html", ""))

    def test_script_tag_in_custom_html_block_stripped_by_default(self):
        layout = {
            "ROOT": {"type": {"resolvedName": "Container"}, "nodes": ["n1"], "props": {}},
            "n1": {
                "type": {"resolvedName": "CustomHtmlBlock"},
                "nodes": [],
                "props": {"html": "<div>hi</div><script>alert(1)</script>"},
            },
        }
        response = self.client.patch("/api/page/", {"layout": layout}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn("<script", response.data["layout"]["n1"]["props"]["html"])

    def test_javascript_protocol_background_image_rejected(self):
        response = self.client.patch(
            "/api/page/",
            {"background": {"type": "image", "imageUrl": "javascript:alert(1)"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn("imageUrl", response.data["background"])

    def test_unknown_background_type_dropped_entirely(self):
        response = self.client.patch(
            "/api/page/",
            {"background": {"type": "not-a-real-type", "html": "<script>alert(1)</script>"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["background"], {})

    @override_settings(ALLOW_CUSTOM_SCRIPTS=True)
    def test_script_survives_when_flag_is_on(self):
        response = self.client.patch(
            "/api/page/",
            {"background": {"type": "html", "html": "<script>alert(1)</script>"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("<script", response.data["background"]["html"])

    def test_turning_flag_off_hides_previously_stored_script_on_next_read(self):
        with override_settings(ALLOW_CUSTOM_SCRIPTS=True):
            write = self.client.patch(
                "/api/page/",
                {"background": {"type": "html", "html": "<script>alert(1)</script>"}},
                format="json",
            )
            self.assertIn("<script", write.data["background"]["html"])

        page = Page.objects.get(owner=self.user)
        self.assertIn("<script", page.background.get("html", ""))

        read = self.client.get("/api/page/")
        self.assertEqual(read.status_code, 200)
        self.assertNotIn("<script", read.data["background"].get("html", ""))

        page.refresh_from_db()
        self.assertIn("<script", page.background.get("html", ""))


class RenderPreviewTests(APITestCase):
    def setUp(self):
        self.alex = User.objects.create_user(username="alex", password="pw")
        self.sam = User.objects.create_user(username="sam", password="pw")
        self.client.force_authenticate(self.alex)

    def test_requires_auth(self):
        self.client.force_authenticate(None)
        post = self.client.post("/api/render-preview/", {"html": "<b>hi</b>", "kind": "html_block"}, format="json")
        self.assertEqual(post.status_code, 401)
        self.assertEqual(self.client.get("/api/render-preview/?token=x").status_code, 401)

    def test_invalid_kind_rejected(self):
        response = self.client.post("/api/render-preview/", {"html": "<b>hi</b>", "kind": "not-a-kind"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_post_then_get_round_trip(self):
        post = self.client.post("/api/render-preview/", {"html": "<b>hello</b>", "kind": "background"}, format="json")
        self.assertEqual(post.status_code, 200, post.data)
        token = post.data["token"]

        get = self.client.get(f"/api/render-preview/?token={token}")
        self.assertEqual(get.status_code, 200)
        self.assertEqual(get["Content-Type"], "text/html; charset=utf-8")
        self.assertIn("<b>hello</b>", get.content.decode())
        self.assertIn("frame-ancestors", get["Content-Security-Policy"])

    @override_settings(ALLOW_CUSTOM_SCRIPTS=False)
    def test_script_stripped_by_default(self):
        post = self.client.post(
            "/api/render-preview/", {"html": "<script>alert(1)</script>", "kind": "html_block"}, format="json"
        )
        token = post.data["token"]
        get = self.client.get(f"/api/render-preview/?token={token}")
        self.assertNotIn("<script", get.content.decode())
        self.assertNotIn("script-src", get["Content-Security-Policy"])

    def test_other_user_cannot_read_someone_elses_token(self):
        post = self.client.post("/api/render-preview/", {"html": "alex's secret", "kind": "background"}, format="json")
        token = post.data["token"]

        self.client.force_authenticate(self.sam)
        get = self.client.get(f"/api/render-preview/?token={token}")
        self.assertEqual(get.status_code, 404)

    def test_expired_token_is_gone(self):
        post = self.client.post("/api/render-preview/", {"html": "hi", "kind": "background"}, format="json")
        token = post.data["token"]
        RenderPreview.objects.filter(token=token).update(
            created_at=timezone.now() - timedelta(seconds=settings.RENDER_PREVIEW_TTL_SECONDS + 1)
        )
        get = self.client.get(f"/api/render-preview/?token={token}")
        self.assertEqual(get.status_code, 404)

    @override_settings(ALLOW_CUSTOM_SCRIPTS=True)
    def test_task_data_injected_for_html_block_kind_when_scripts_allowed(self):
        post = self.client.post(
            "/api/render-preview/",
            {
                "html": "<div>x</div>",
                "kind": "html_block",
                "taskData": {"dailyTasks": {}, "weeklyTasks": {}, "todayKey": "2026-08-10", "startOfWeekKey": "2026-08-10"},
            },
            format="json",
        )
        token = post.data["token"]
        get = self.client.get(f"/api/render-preview/?token={token}")
        self.assertIn("window.taskBoardData", get.content.decode())

    def _render(self, html, kind="html_block"):
        post = self.client.post("/api/render-preview/", {"html": html, "kind": kind}, format="json")
        return self.client.get(f"/api/render-preview/?token={post.data['token']}")

    def test_google_fonts_linked_for_used_families(self):
        html = (
            "<div style='font-family: \"Press Start 2P\", \"Courier New\", monospace'>a</div>"
            "<style>.x { font-family: VT323, monospace !important; }</style>"
        )
        for kind in ("html_block", "background", "overlay"):
            body = self._render(html, kind).content.decode()
            self.assertIn("fonts.googleapis.com/css?family=Press+Start+2P:", body)
            self.assertIn("fonts.googleapis.com/css?family=VT323:", body)
            self.assertNotIn("family=Courier", body)
            self.assertNotIn("family=monospace", body)

    def test_no_font_links_without_custom_families(self):
        body = self._render("<div style='font-family: Arial, sans-serif'>a</div>").content.decode()
        self.assertNotIn("fonts.googleapis.com", body)

    def test_font_names_with_unsafe_characters_are_ignored(self):
        body = self._render("<style>.x { font-family: \"Bad/Name\", Roboto; }</style>").content.decode()
        self.assertIn("family=Roboto:", body)
        self.assertNotIn("family=Bad", body)
        self.assertEqual(body.count("fonts.googleapis.com/css?family="), 1)

    def test_font_links_capped(self):
        families = ", ".join(f"Font{i}" for i in range(40))
        body = self._render(f"<style>.x {{ font-family: {families}; }}</style>").content.decode()
        self.assertEqual(body.count("fonts.googleapis.com/css?family="), 20)

    def test_preview_csp_allows_google_fonts_only(self):
        csp = self._render("<b>x</b>")["Content-Security-Policy"]
        self.assertIn("style-src 'unsafe-inline' https://fonts.googleapis.com", csp)
        self.assertIn("font-src https://fonts.gstatic.com", csp)
        self.assertIn("default-src 'none'", csp)
