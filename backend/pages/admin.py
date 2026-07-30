from django.contrib import admin

from .models import Page, TaskBoard, UploadedImage


@admin.register(Page)
class PageAdmin(admin.ModelAdmin):
    list_display = ("owner", "updated_at")
    search_fields = ("owner__username",)


@admin.register(TaskBoard)
class TaskBoardAdmin(admin.ModelAdmin):
    list_display = ("owner", "updated_at")
    search_fields = ("owner__username",)


@admin.register(UploadedImage)
class UploadedImageAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "content_type", "width", "height", "created_at")
    search_fields = ("owner__username",)
