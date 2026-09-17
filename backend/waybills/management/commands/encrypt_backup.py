from django.core.management.base import BaseCommand, CommandError
from pathlib import Path

from django.conf import settings
from django.utils import timezone

from waybills.backup import write_encrypted_backup


class Command(BaseCommand):
    help = "Write an encrypted SafiRoute backup (fixtures + media) using BACKUP_ENCRYPTION_KEY."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output",
            default="",
            help="Destination path. Defaults to BACKUP_DIR/safiroute-YYYYMMDD-HHMMSS.enc",
        )

    def handle(self, *args, **options):
        output = options.get("output") or ""
        if output:
            destination = Path(output)
        else:
            stamp = timezone.now().strftime("%Y%m%d-%H%M%S")
            destination = Path(settings.BACKUP_DIR) / f"safiroute-{stamp}.enc"
        try:
            path = write_encrypted_backup(destination)
        except CommandError:
            raise
        self.stdout.write(self.style.SUCCESS(f"Encrypted backup written to {path}"))
        self.stdout.write(f"Size: {path.stat().st_size} bytes")
