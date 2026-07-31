from django.db import migrations


def _referenced_urls(layout, background):
    urls = set()
    if isinstance(layout, dict):
        for node in layout.values():
            if not isinstance(node, dict):
                continue
            props = node.get("props")
            if isinstance(props, dict):
                url = props.get("imageUrl")
                if isinstance(url, str) and url:
                    urls.add(url)
    if isinstance(background, dict):
        url = background.get("imageUrl")
        if isinstance(url, str) and url:
            urls.add(url)
    return urls


def backfill_page(apps, schema_editor):
    Page = apps.get_model("pages", "Page")
    UploadedImage = apps.get_model("pages", "UploadedImage")

    for page in Page.objects.all():
        referenced = (
            _referenced_urls(page.layout, page.background)
            | _referenced_urls(page.mobile_layout, None)
        )
        if not referenced:
            continue
        for image in UploadedImage.objects.filter(owner_id=page.owner_id, page__isnull=True, saved_design__isnull=True):
            if any(image.image.name and image.image.name in url for url in referenced):
                image.page = page
                image.save(update_fields=["page"])


class Migration(migrations.Migration):

    dependencies = [
        ('pages', '0008_uploadedimage_page_uploadedimage_saved_design'),
    ]

    operations = [
        migrations.RunPython(backfill_page, migrations.RunPython.noop),
    ]
