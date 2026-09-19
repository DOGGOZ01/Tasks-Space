import copy
import os
import uuid

from django.conf import settings
from django.core.files.base import ContentFile


def collect_layout_image_urls(layout) -> set[str]:
    urls = set()
    if not isinstance(layout, dict):
        return urls
    for node in layout.values():
        if not isinstance(node, dict):
            continue
        props = node.get("props")
        if not isinstance(props, dict):
            continue
        url = props.get("imageUrl")
        if isinstance(url, str) and url:
            urls.add(url)
    return urls


def collect_background_image_url(background) -> set[str]:
    if isinstance(background, dict):
        url = background.get("imageUrl")
        if isinstance(url, str) and url:
            return {url}
    return set()


def collect_design_image_urls(design) -> set[str]:
    if not isinstance(design, dict):
        return set()
    return collect_layout_image_urls(design.get("layout")) | collect_background_image_url(
        design.get("background")
    )


def rewrite_design_image_urls(design: dict, url_map: dict) -> dict:
    design = copy.deepcopy(design)
    layout = design.get("layout")
    if isinstance(layout, dict):
        for node in layout.values():
            if not isinstance(node, dict):
                continue
            props = node.get("props")
            if isinstance(props, dict) and props.get("imageUrl") in url_map:
                props["imageUrl"] = url_map[props["imageUrl"]]
    background = design.get("background")
    if isinstance(background, dict) and background.get("imageUrl") in url_map:
        background["imageUrl"] = url_map[background["imageUrl"]]
    return design


def clone_uploaded_image(source, *, owner, page=None, saved_design=None):
    from .models import UploadedImage

    source.image.open("rb")
    try:
        data = source.image.read()
    finally:
        source.image.close()

    ext = os.path.splitext(source.image.name)[1]
    clone = UploadedImage(
        owner=owner,
        page=page,
        saved_design=saved_design,
        content_type=source.content_type,
        width=source.width,
        height=source.height,
    )
    clone.image.save(f"{uuid.uuid4().hex}{ext}", ContentFile(data), save=False)
    clone.save()
    return clone


def duplicate_referenced_images(*, source_images, referenced_urls, owner, page=None, saved_design=None):
    if not referenced_urls:
        return {}

    url_map: dict[str, str] = {}
    for image in source_images:
        matches = [url for url in referenced_urls if image.image.url in url]
        if not matches:
            continue
        clone = clone_uploaded_image(image, owner=owner, page=page, saved_design=saved_design)
        new_url = settings.FRONTEND_ORIGIN + clone.image.url
        for url in matches:
            url_map[url] = new_url
    return url_map
