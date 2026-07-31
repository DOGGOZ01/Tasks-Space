from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .image_gc import (
    collect_background_image_url,
    collect_design_image_urls,
    collect_layout_image_urls,
    duplicate_referenced_images,
    rewrite_design_image_urls,
)
from .image_utils import process_uploaded_image
from .models import Page, SavedDesign, TaskBoard, UploadedImage
from .serializers import (
    PageSerializer,
    SavedDesignSerializer,
    TaskBoardSerializer,
    UploadedImageSerializer,
)

IMAGE_PRUNE_GRACE = timedelta(seconds=60)
PAGE_IMAGE_FIELDS = ("layout", "mobile_layout", "background")


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
        page = self.get_object()
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
        existing = SavedDesign.objects.filter(owner=request.user).count()
        if existing >= settings.MAX_SAVED_DESIGNS_PER_USER:
            return Response(
                {"detail": "You've reached the saved design limit. Delete one first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = SavedDesignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        design_obj = serializer.save(owner=request.user)

        referenced = collect_design_image_urls(design_obj.design)
        page = Page.objects.filter(owner=request.user).first()
        source_images = UploadedImage.objects.filter(page=page) if page else UploadedImage.objects.none()
        url_map = duplicate_referenced_images(
            request,
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
    """Duplicates a saved design's images into the live board's own copies
    and returns the design with URLs rewritten to point at those copies, so
    applying a saved design never leaves the live board depending on images
    owned by a design that could later be deleted."""

    def post(self, request, pk):
        design_obj = get_object_or_404(SavedDesign, pk=pk, owner=request.user)
        page, _ = Page.objects.get_or_create(owner=request.user)

        referenced = collect_design_image_urls(design_obj.design)
        source_images = UploadedImage.objects.filter(saved_design=design_obj)
        url_map = duplicate_referenced_images(
            request,
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
