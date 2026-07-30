from django.urls import path

from .views import ImageUploadView, PageView, TaskBoardView

urlpatterns = [
    path("page/", PageView.as_view(), name="page-detail"),
    path("tasks/", TaskBoardView.as_view(), name="task-board"),
    path("uploads/images/", ImageUploadView.as_view(), name="image-upload"),
]
