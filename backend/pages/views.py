import secrets
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.clickjacking import xframe_options_exempt
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .ai_providers import ProviderRequestError, send_chat
from .image_gc import (
    collect_background_image_url,
    collect_design_image_urls,
    collect_layout_image_urls,
    duplicate_referenced_images,
    rewrite_design_image_urls,
)
from .image_utils import process_uploaded_image
from .models import Page, RenderPreview, SavedDesign, TaskBoard, UploadedImage
from .render_preview import build_document, build_preview_csp
from .sanitize import sanitize_custom_html
from .sanitize_report import sanitize_report
from .serializers import (
    PageSerializer,
    SavedDesignSerializer,
    TaskBoardSerializer,
    UploadedImageSerializer,
)

IMAGE_PRUNE_GRACE = timedelta(seconds=60)
PAGE_IMAGE_FIELDS = ("layout", "mobile_layout", "background")


def _content_length_exceeds(request, limit):
    content_length = request.META.get("CONTENT_LENGTH")
    if content_length is None:
        return False
    try:
        return int(content_length) > limit
    except ValueError:
        return False


def _prune_unused_page_images(page):
    referenced = (
        collect_layout_image_urls(page.layout)
        | collect_layout_image_urls(page.mobile_layout)
        | collect_background_image_url(page.background)
    )
    cutoff = timezone.now() - IMAGE_PRUNE_GRACE
    stale = UploadedImage.objects.filter(page=page, created_at__lt=cutoff)
    for image in stale:
        if not any(image.image.url in url for url in referenced):
            image.delete()


class PageView(APIView):
    def get_object(self):
        page, _ = Page.objects.get_or_create(owner=self.request.user)
        return page

    def get(self, request):
        return Response(PageSerializer(self.get_object()).data)

    def patch(self, request):
        with transaction.atomic():
            page, _ = Page.objects.select_for_update().get_or_create(owner=request.user)
            serializer = PageSerializer(page, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            if any(field in request.data for field in PAGE_IMAGE_FIELDS):
                _prune_unused_page_images(page)
        return Response(serializer.data)


class TaskBoardView(APIView):
    def get_object(self):
        board, _ = TaskBoard.objects.get_or_create(owner=self.request.user)
        return board

    def get(self, request):
        return Response(TaskBoardSerializer(self.get_object()).data)

    def patch(self, request):
        board = self.get_object()
        serializer = TaskBoardSerializer(board, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SavedDesignListView(APIView):
    def get(self, request):
        designs = SavedDesign.objects.filter(owner=request.user)
        return Response(SavedDesignSerializer(designs, many=True).data)

    def post(self, request):
        serializer = SavedDesignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            existing = SavedDesign.objects.select_for_update().filter(owner=request.user).count()
            if existing >= settings.MAX_SAVED_DESIGNS_PER_USER:
                return Response(
                    {"detail": "You've reached the saved design limit. Delete one first."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            design_obj = serializer.save(owner=request.user)

        referenced = collect_design_image_urls(design_obj.design)
        page = Page.objects.filter(owner=request.user).first()
        source_images = UploadedImage.objects.filter(page=page) if page else UploadedImage.objects.none()
        url_map = duplicate_referenced_images(
            source_images=source_images,
            referenced_urls=referenced,
            owner=request.user,
            saved_design=design_obj,
        )
        if url_map:
            design_obj.design = rewrite_design_image_urls(design_obj.design, url_map)
            design_obj.save(update_fields=["design"])

        return Response(SavedDesignSerializer(design_obj).data, status=status.HTTP_201_CREATED)


class SavedDesignDetailView(APIView):
    def delete(self, request, pk):
        design = get_object_or_404(SavedDesign, pk=pk, owner=request.user)
        design.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SavedDesignUseView(APIView):
    def post(self, request, pk):
        design_obj = get_object_or_404(SavedDesign, pk=pk, owner=request.user)
        page, _ = Page.objects.get_or_create(owner=request.user)

        referenced = collect_design_image_urls(design_obj.design)
        source_images = UploadedImage.objects.filter(saved_design=design_obj)
        url_map = duplicate_referenced_images(
            source_images=source_images,
            referenced_urls=referenced,
            owner=request.user,
            page=page,
        )
        design = rewrite_design_image_urls(design_obj.design, url_map) if url_map else design_obj.design
        return Response(design)


class ImageUploadView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded_file = request.FILES.get("image")
        if uploaded_file is None:
            return Response({"detail": "No image file provided."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            content_file, content_type, width, height = process_uploaded_image(uploaded_file)
        except DjangoValidationError as exc:
            raise DRFValidationError({"image": exc.messages if hasattr(exc, "messages") else str(exc)})

        page, _ = Page.objects.get_or_create(owner=request.user)
        image = UploadedImage(
            owner=request.user,
            page=page,
            content_type=content_type,
            width=width,
            height=height,
        )
        image.image.save(content_file.name, content_file, save=False)
        image.save()

        return Response(
            UploadedImageSerializer(image, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


SANITIZE_CHECK_KINDS = {"html", "customCss", "animationCss"}
SANITIZE_CHECK_MAX_ITEMS = 40
SANITIZE_CHECK_MAX_VALUE_LENGTH = 50_000


class SanitizeCheckView(APIView):
    def post(self, request):
        items = request.data.get("items") if isinstance(request.data, dict) else None
        if not isinstance(items, list) or len(items) > SANITIZE_CHECK_MAX_ITEMS:
            return Response({"detail": "Send up to 40 items."}, status=status.HTTP_400_BAD_REQUEST)

        results = []
        for item in items:
            if not isinstance(item, dict):
                return Response({"detail": "Each item must be an object."}, status=status.HTTP_400_BAD_REQUEST)
            kind = item.get("kind")
            value = item.get("value")
            if kind not in SANITIZE_CHECK_KINDS or not isinstance(value, str):
                return Response({"detail": "Invalid item."}, status=status.HTTP_400_BAD_REQUEST)
            if len(value) > SANITIZE_CHECK_MAX_VALUE_LENGTH:
                return Response({"detail": "Value is too large."}, status=status.HTTP_400_BAD_REQUEST)
            results.append(sanitize_report(kind, value))
        return Response({"results": results})


class AiAssistantChatView(APIView):
    throttle_scope = "ai_chat"

    def post(self, request):
        if not settings.AI_ASSISTANT_ENABLED:
            return Response(
                {"detail": "The AI assistant is not enabled on this server."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not settings.AI_ASSISTANT_API_KEY:
            return Response(
                {"detail": "The AI assistant has no server-side API key configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if _content_length_exceeds(request, settings.MAX_AI_REQUEST_BYTES):
            return Response({"detail": "Request is too large."}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        system_prompt = request.data.get("systemPrompt")
        conversation = request.data.get("conversation")
        tools = request.data.get("tools")
        if not isinstance(system_prompt, str) or not isinstance(conversation, list) or not isinstance(tools, list):
            return Response({"detail": "Invalid request body."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            assistant_text, tool_calls = send_chat(
                settings.AI_ASSISTANT_PROVIDER,
                settings.AI_ASSISTANT_API_KEY,
                settings.AI_ASSISTANT_MODEL,
                system_prompt,
                conversation,
                tools,
            )
        except ProviderRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({"assistantText": assistant_text, "toolCalls": tool_calls})


class RenderPreviewView(APIView):
    throttle_scope = "render_preview"

    def post(self, request):
        if _content_length_exceeds(request, settings.MAX_RENDER_PREVIEW_REQUEST_BYTES):
            return Response({"detail": "Request is too large."}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        raw_html = request.data.get("html")
        kind = request.data.get("kind")
        if not isinstance(raw_html, str) or kind not in dict(RenderPreview.KIND_CHOICES):
            return Response({"detail": "Invalid request body."}, status=status.HTTP_400_BAD_REQUEST)

        task_data = None
        if kind == "html_block":
            raw_task_data = request.data.get("taskData")
            if isinstance(raw_task_data, dict):
                task_data = raw_task_data

        sanitized = sanitize_custom_html(raw_html)

        cutoff = timezone.now() - timedelta(seconds=settings.RENDER_PREVIEW_TTL_SECONDS)
        RenderPreview.objects.filter(owner=request.user, created_at__lt=cutoff).delete()

        token = secrets.token_urlsafe(32)
        RenderPreview.objects.create(
            owner=request.user, token=token, kind=kind, html=sanitized, task_data=task_data or {}
        )
        return Response({"token": token})

    @xframe_options_exempt
    def get(self, request):
        token = request.query_params.get("token") or ""
        cutoff = timezone.now() - timedelta(seconds=settings.RENDER_PREVIEW_TTL_SECONDS)
        preview = RenderPreview.objects.filter(token=token, owner=request.user, created_at__gte=cutoff).first()
        if not preview:
            return HttpResponse("Preview not found or expired.", status=404, content_type="text/plain")

        allow_scripts = settings.ALLOW_CUSTOM_SCRIPTS
        sanitized = sanitize_custom_html(preview.html)
        document = build_document(preview.kind, sanitized, allow_scripts, preview.task_data or None)

        response = HttpResponse(document, content_type="text/html; charset=utf-8")
        response["Content-Security-Policy"] = build_preview_csp(allow_scripts)
        return response
