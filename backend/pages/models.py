import os
import uuid

from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


def user_upload_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"uploads/{instance.owner_id}/{uuid.uuid4().hex}{ext}"


class Page(models.Model):
    DATE_FORMAT_US = "MDY"
    DATE_FORMAT_EU = "DMY"
    DATE_FORMAT_CHOICES = [
        (DATE_FORMAT_US, "Month/Day/Year"),
        (DATE_FORMAT_EU, "Day/Month/Year"),
    ]

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="page"
    )
    layout = models.JSONField(default=dict, blank=True)
    mobile_layout = models.JSONField(default=dict, blank=True)
    background = models.JSONField(default=dict, blank=True)
    header_style = models.JSONField(default=dict, blank=True)
    date_format = models.CharField(
        max_length=3, choices=DATE_FORMAT_CHOICES, default=DATE_FORMAT_US
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Page(owner={self.owner_id})"


class SavedDesign(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_designs"
    )
    name = models.CharField(max_length=80)
    design = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"SavedDesign({self.pk}, owner={self.owner_id})"


class TaskBoard(models.Model):
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="task_board"
    )
    daily_tasks = models.JSONField(default=dict, blank=True)
    weekly_tasks = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"TaskBoard(owner={self.owner_id})"


class UploadedImage(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="uploaded_images"
    )
    page = models.ForeignKey(
        Page, null=True, blank=True, on_delete=models.CASCADE, related_name="images"
    )
    saved_design = models.ForeignKey(
        SavedDesign, null=True, blank=True, on_delete=models.CASCADE, related_name="images"
    )
    image = models.ImageField(upload_to=user_upload_path)
    content_type = models.CharField(max_length=32)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"UploadedImage({self.pk}, owner={self.owner_id})"


@receiver(post_delete, sender=UploadedImage)
def _delete_uploaded_image_file(sender, instance, **kwargs):
    if instance.image:
        instance.image.delete(save=False)


class RenderPreview(models.Model):
    KIND_CHOICES = [
        ("html_block", "Custom HTML block"),
        ("background", "Board background"),
        ("overlay", "Animation overlay"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="render_previews"
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES)
    html = models.TextField(blank=True)
    task_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"RenderPreview({self.pk}, owner={self.owner_id}, kind={self.kind})"
