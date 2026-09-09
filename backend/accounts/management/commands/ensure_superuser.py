import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Idempotently ensure a superuser exists, reading credentials from the environment."

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "")

        if not username or not password:
            raise CommandError(
                "DJANGO_SUPERUSER_USERNAME and DJANGO_SUPERUSER_PASSWORD must both be set"
            )

        User = get_user_model()

        if User.objects.filter(username=username).exists():
            self.stdout.write(f"Superuser '{username}' already exists, skipping.")
            return

        User.objects.create_superuser(username=username, email=email, password=password)
        self.stdout.write(f"Created superuser '{username}'.")
