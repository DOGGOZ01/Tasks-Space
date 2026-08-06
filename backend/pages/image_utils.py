import io

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from PIL import Image

ALLOWED_FORMATS = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "GIF": ("image/gif", "gif"),
    "WEBP": ("image/webp", "webp"),
}


def process_uploaded_image(uploaded_file):
    if uploaded_file.size > settings.MAX_IMAGE_UPLOAD_BYTES:
        raise ValidationError("Image is too large.")

    try:
        image = Image.open(uploaded_file)
    except Exception:
        raise ValidationError("File is not a valid image.")

    fmt = image.format
    if fmt not in ALLOWED_FORMATS:
        raise ValidationError("Unsupported image format. Use PNG, JPEG, GIF or WEBP.")

    width, height = image.size
    if width > settings.MAX_IMAGE_DIMENSION or height > settings.MAX_IMAGE_DIMENSION:
        raise ValidationError("Image dimensions are too large.")

    try:
        image.load()
    except Exception:
        raise ValidationError("File is not a valid image.")

    content_type, ext = ALLOWED_FORMATS[fmt]

    uploaded_file.seek(0)
    fresh = Image.open(uploaded_file)
    buffer = io.BytesIO()

    if fmt == "GIF":
        frames = []
        durations = []
        try:
            frame_count = min(fresh.n_frames, settings.MAX_GIF_FRAMES)
            for frame_index in range(frame_count):
                fresh.seek(frame_index)
                frames.append(fresh.convert("RGBA"))
                duration = fresh.info.get("duration", settings.MIN_GIF_FRAME_DURATION_MS)
                durations.append(max(duration, settings.MIN_GIF_FRAME_DURATION_MS))
        except Exception:
            frames = [fresh.convert("RGBA")]
            durations = [settings.MIN_GIF_FRAME_DURATION_MS]
        frames[0].save(
            buffer,
            format="GIF",
            save_all=True,
            append_images=frames[1:],
            loop=0,
            duration=durations,
        )
    elif fmt == "JPEG":
        fresh.convert("RGB").save(buffer, format="JPEG", quality=90)
    else:
        fresh.save(buffer, format=fmt)

    buffer.seek(0)
    return ContentFile(buffer.read(), name=f"upload.{ext}"), content_type, width, height
