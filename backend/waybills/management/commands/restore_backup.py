from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from waybills.backup import decrypt_payload, restore_encrypted_backup


class Command(BaseCommand):
    help = "Restore an encrypted SafiRoute backup. Requires --confirm YES. Tested failure: wrong key does not load data."

    def add_arguments(self, parser):
        parser.add_argument("--input", required=True, help="Path to the .enc backup file")
        parser.add_argument(
            "--confirm",
            default="",
            help="Must be YES to actually restore. Anything else is a dry run after decrypt.",
        )
        parser.add_argument(
            "--keep-existing",
            action="store_true",
            help="Do not delete existing waybill rows before loaddata (may conflict).",
        )

    def handle(self, *args, **options):
        source = Path(options["input"])
        confirm = (options.get("confirm") or "").strip()
        if confirm != "YES":
            payload = decrypt_payload(source.read_bytes()) if source.exists() else None
            if payload is None:
                raise CommandError(f"Backup file not found: {source}")
            self.stdout.write(
                self.style.WARNING(
                    "Dry run only. Decrypt succeeded. Pass --confirm YES to replace waybill data."
                )
            )
            self.stdout.write(f"created_at={payload.get('created_at')} fixtures={len(payload.get('fixtures') or [])}")
            return
        result = restore_encrypted_backup(source, replace=not options.get("keep_existing"))
        self.stdout.write(
            self.style.SUCCESS(
                f"Restore complete. fixtures={result['fixture_count']} media={result['media_count']} "
                f"created_at={result['created_at']}"
            )
        )
