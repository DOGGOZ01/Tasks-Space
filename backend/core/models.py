from django.core.exceptions import ValidationError
from django.db import models


class SiteConfig(models.Model):
    registration_open = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if not self.pk and SiteConfig.objects.exists():
            raise ValidationError("SiteConfig is a singleton; edit the existing row instead.")

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass

    @classmethod
    def get_solo(cls) -> "SiteConfig":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Site configuration"

    class Meta:
        verbose_name = "site configuration"
        verbose_name_plural = "site configuration"
