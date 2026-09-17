from django.core.management.base import BaseCommand, CommandError

from waybills.fingerprints import verify_audit_chain
from waybills.models import Waybill


class Command(BaseCommand):
    help = "Recompute hash-chained audit log entries and fail if any waybill chain is broken."

    def handle(self, *args, **options):
        failed = 0
        checked = 0
        for waybill in Waybill.objects.all():
            if not waybill.audit_logs.exists():
                continue
            checked += 1
            ok, detail = verify_audit_chain(waybill)
            if ok:
                self.stdout.write(f"OK {waybill.waybill_number}")
            else:
                failed += 1
                self.stderr.write(f"FAIL {waybill.waybill_number}: {detail}")
        if failed:
            raise CommandError(f"{failed} of {checked} audit chain(s) failed.")
        self.stdout.write(self.style.SUCCESS(f"{checked} audit chain(s) intact."))
