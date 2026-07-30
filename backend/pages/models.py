import os
import uuid

from django.conf import settings
from django.db import models


def user_upload_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"uploads/{instance.owner_id}/{uuid.uuid4().hex}{ext}"


class Page(models.Model):
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="page"
    )
    layout = models.JSONField(default=dict, blank=True)
    mobile_layout = models.JSONField(default=dict, blank=True)
    background = models.JSONField(default=dict, blank=True)
    header_style = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Page(owner={self.owner_id})"


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
    image = models.ImageField(upload_to=user_upload_path)
    content_type = models.CharField(max_length=32)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"UploadedImage({self.pk}, owner={self.owner_id})"
