from django.core.management.base import BaseCommand, CommandError

from waybills.fingerprints import pdf_matches_stored_hash
from waybills.models import Waybill


class Command(BaseCommand):
    help = "Verify stored PDF bytes still match the SHA-256 recorded when the PDF was generated."

    def add_arguments(self, parser):
        parser.add_argument("--waybill", default="", help="Waybill number. Omit to check all PDFs.")

    def handle(self, *args, **options):
        number = (options.get("waybill") or "").strip()
        qs = Waybill.objects.exclude(pdf_file="")
        if number:
            qs = qs.filter(waybill_number=number)
            if not qs.exists():
                raise CommandError(f"No PDF found for {number}")
        failed = 0
        checked = 0
        for waybill in qs:
            checked += 1
            ok, detail = pdf_matches_stored_hash(waybill)
            if ok:
                self.stdout.write(f"OK {waybill.waybill_number} {waybill.pdf_sha256[:12]}…")
            else:
                failed += 1
                self.stderr.write(f"FAIL {waybill.waybill_number} ({detail})")
        if failed:
            raise CommandError(f"{failed} of {checked} PDF(s) failed integrity check.")
        self.stdout.write(self.style.SUCCESS(f"{checked} PDF(s) matched stored SHA-256."))
