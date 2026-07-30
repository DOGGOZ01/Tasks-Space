import json

from django.conf import settings
from rest_framework import serializers

from .models import Page, TaskBoard, UploadedImage
from .sanitize import sanitize_board_background, sanitize_header_style, sanitize_layout


def _clean_layout(value, field_label):
    if not isinstance(value, dict):
        raise serializers.ValidationError(f"{field_label} must be a JSON object.")

    size = len(json.dumps(value))
    if size > settings.MAX_LAYOUT_JSON_BYTES:
        raise serializers.ValidationError(f"{field_label} is too large.")

    return sanitize_layout(value)


class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = ("layout", "mobile_layout", "background", "header_style", "updated_at")
        read_only_fields = ("updated_at",)

    def validate_layout(self, value):
        return _clean_layout(value, "Board layout")

    def validate_mobile_layout(self, value):
        return _clean_layout(value, "Mobile board layout")

    def validate_background(self, value):
        return sanitize_board_background(value)

    def validate_header_style(self, value):
        return sanitize_header_style(value)


def _clean_tasks_by_date(value):
    if not isinstance(value, dict):
        raise serializers.ValidationError("Must be a JSON object keyed by date.")

    size = len(json.dumps(value))
    if size > settings.MAX_TASKS_JSON_BYTES:
        raise serializers.ValidationError("Task list is too large.")

    cleaned = {}
    for date_key, tasks in value.items():
        if not isinstance(date_key, str) or not isinstance(tasks, list):
            continue
        cleaned_tasks = []
        for task in tasks[: settings.MAX_TASKS_PER_DATE]:
            if not isinstance(task, dict):
                continue
            task_id = task.get("id")
            text = task.get("text")
            if not isinstance(task_id, (int, float)) or isinstance(task_id, bool):
                continue
            if not isinstance(text, str):
                continue
            cleaned_tasks.append(
                {
                    "id": task_id,
                    "text": text[: settings.MAX_TASK_TEXT_LENGTH],
                    "done": bool(task.get("done")),
                }
            )
        cleaned[date_key] = cleaned_tasks
    return cleaned


class TaskBoardSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskBoard
        fields = ("daily_tasks", "weekly_tasks", "updated_at")
        read_only_fields = ("updated_at",)

    def validate_daily_tasks(self, value):
        return _clean_tasks_by_date(value)

    def validate_weekly_tasks(self, value):
        return _clean_tasks_by_date(value)


class UploadedImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = UploadedImage
        fields = ("id", "url", "width", "height", "created_at")
        read_only_fields = fields

    def get_url(self, obj):
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url
