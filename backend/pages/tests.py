import os
import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Page, SavedDesign, UploadedImage

# Smallest possible valid 1x1 PNG.
TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c6360000002000100ffff03000006000557bfabd4"
    "0000000049454e44ae426082"
)

MEDIA_ROOT = tempfile.mkdtemp(prefix="pages-tests-media-")


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

        # The live page's own image must be untouched.
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

        # The live page's own copy must survive the saved design's deletion.
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

        # Deleting the saved design afterwards must not break the now-independent page copy.
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
        # Within the grace period: not pruned yet, even though also unreferenced.
        self.assertTrue(UploadedImage.objects.filter(pk=fresh.pk).exists())
