import copy
import json

from django.conf import settings
from rest_framework import serializers

from .models import Page, SavedDesign, TaskBoard, UploadedImage
from .sanitize import sanitize_board_background, sanitize_header_style, sanitize_layout, sanitize_loading_screen

SAVED_DESIGN_KIND = "task-tracker-board-design"
SAVED_DESIGN_VERSION = 1


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
        fields = (
            "layout",
            "mobile_layout",
            "background",
            "header_style",
            "loading_screen",
            "date_format",
            "updated_at",
        )
        read_only_fields = ("updated_at",)

    def validate_layout(self, value):
        return _clean_layout(value, "Board layout")

    def validate_mobile_layout(self, value):
        return _clean_layout(value, "Mobile board layout")

    def validate_background(self, value):
        return sanitize_board_background(value)

    def validate_header_style(self, value):
        return sanitize_header_style(value)

    def validate_loading_screen(self, value):
        return sanitize_loading_screen(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["layout"] = sanitize_layout(copy.deepcopy(data.get("layout")) or {})
        data["mobile_layout"] = sanitize_layout(copy.deepcopy(data.get("mobile_layout")) or {})
        data["background"] = sanitize_board_background(copy.deepcopy(data.get("background")) or {})
        data["header_style"] = sanitize_header_style(copy.deepcopy(data.get("header_style")) or {})
        data["loading_screen"] = sanitize_loading_screen(copy.deepcopy(data.get("loading_screen")) or {})
        return data


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


def _clean_design_payload(value):
    if not isinstance(value, dict):
        raise serializers.ValidationError("Design must be a JSON object.")

    size = len(json.dumps(value))
    if size > settings.MAX_LAYOUT_JSON_BYTES:
        raise serializers.ValidationError("Design is too large.")

    layout = value.get("layout")
    if not isinstance(layout, dict):
        raise serializers.ValidationError("Design is missing a layout.")

    device = value.get("device")
    if device not in ("desktop", "mobile"):
        device = "desktop"

    background = value.get("background")
    header_style = value.get("headerStyle")
    loading_screen = value.get("loadingScreen")

    cleaned = {
        "kind": SAVED_DESIGN_KIND,
        "version": SAVED_DESIGN_VERSION,
        "device": device,
        "layout": sanitize_layout(layout),
        "background": sanitize_board_background(background if isinstance(background, dict) else {}),
        "headerStyle": sanitize_header_style(header_style if isinstance(header_style, dict) else {}),
        "loadingScreen": sanitize_loading_screen(loading_screen if isinstance(loading_screen, dict) else {}),
    }
    layouts = value.get("layouts")
    if isinstance(layouts, dict):
        cleaned_layouts = {
            key: sanitize_layout(layouts[key])
            for key in ("desktop", "mobile")
            if isinstance(layouts.get(key), dict)
        }
        if cleaned_layouts:
            cleaned["layouts"] = cleaned_layouts
    return cleaned


class SavedDesignSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedDesign
        fields = ("id", "name", "design", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name can't be empty.")
        return value[: settings.MAX_SAVED_DESIGN_NAME_LENGTH]

    def validate_design(self, value):
        return _clean_design_payload(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        design = data.get("design")
        if isinstance(design, dict):
            data["design"] = _clean_design_payload(design)
        return data


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
