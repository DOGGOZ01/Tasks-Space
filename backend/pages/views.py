from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .image_utils import process_uploaded_image
from .models import Page, TaskBoard, UploadedImage
from .serializers import PageSerializer, TaskBoardSerializer, UploadedImageSerializer


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

        image = UploadedImage(
            owner=request.user,
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
