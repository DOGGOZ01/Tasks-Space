from django.contrib import admin

from .models import Page, SavedDesign, TaskBoard, UploadedImage


@admin.register(Page)
class PageAdmin(admin.ModelAdmin):
    list_display = ("owner", "updated_at")
    search_fields = ("owner__username",)


@admin.register(SavedDesign)
class SavedDesignAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "created_at")
    search_fields = ("owner__username", "name")


@admin.register(TaskBoard)
class TaskBoardAdmin(admin.ModelAdmin):
    list_display = ("owner", "updated_at")
    search_fields = ("owner__username",)


@admin.register(UploadedImage)
class UploadedImageAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "page", "saved_design", "content_type", "width", "height", "created_at")
    search_fields = ("owner__username",)
