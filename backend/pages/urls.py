from django.urls import path

from .views import (
    AiAssistantChatView,
    ImageUploadView,
    PageView,
    SavedDesignDetailView,
    SavedDesignListView,
    SavedDesignUseView,
    TaskBoardView,
)

urlpatterns = [
    path("page/", PageView.as_view(), name="page-detail"),
    path("tasks/", TaskBoardView.as_view(), name="task-board"),
    path("uploads/images/", ImageUploadView.as_view(), name="image-upload"),
    path("designs/", SavedDesignListView.as_view(), name="saved-design-list"),
    path("designs/<int:pk>/", SavedDesignDetailView.as_view(), name="saved-design-detail"),
    path("designs/<int:pk>/use/", SavedDesignUseView.as_view(), name="saved-design-use"),
    path("ai/chat/", AiAssistantChatView.as_view(), name="ai-chat"),
]
