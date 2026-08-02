from django.core.exceptions import ValidationError
from django.test import TestCase

from .models import SiteConfig


class SiteConfigSingletonTests(TestCase):
    def test_get_solo_creates_row_with_default(self):
        config = SiteConfig.get_solo()
        self.assertEqual(config.pk, 1)
        self.assertTrue(config.registration_open)

    def test_get_solo_returns_same_row_on_repeat_calls(self):
        first = SiteConfig.get_solo()
        first.registration_open = False
        first.save()

        second = SiteConfig.get_solo()
        self.assertEqual(second.pk, 1)
        self.assertFalse(second.registration_open)
        self.assertEqual(SiteConfig.objects.count(), 1)

    def test_save_always_forces_pk_to_one(self):
        config = SiteConfig(pk=99, registration_open=False)
        config.save()
        self.assertEqual(config.pk, 1)
        self.assertEqual(SiteConfig.objects.count(), 1)

    def test_creating_second_row_via_full_clean_is_rejected(self):
        SiteConfig.get_solo()
        second = SiteConfig(registration_open=False)
        with self.assertRaises(ValidationError):
            second.full_clean()

    def test_delete_is_a_no_op(self):
        config = SiteConfig.get_solo()
        config.delete()
        self.assertTrue(SiteConfig.objects.filter(pk=1).exists())
