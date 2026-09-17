from django.db import migrations, models


def backfill_audit_hashes(apps, schema_editor):
    AuditLog = apps.get_model("waybills", "AuditLog")
    Waybill = apps.get_model("waybills", "Waybill")
    from waybills.fingerprints import audit_entry_hash

    for waybill in Waybill.objects.all():
        prev = "0" * 64
        for entry in AuditLog.objects.filter(waybill=waybill).order_by("id"):
            entry.prev_hash = prev
            entry.entry_hash = audit_entry_hash(
                waybill_number=waybill.waybill_number,
                actor_id=entry.actor_id,
                action=entry.action,
                from_status=entry.from_status,
                to_status=entry.to_status,
                detail=entry.detail or {},
                prev_hash=prev,
            )
            entry.save(update_fields=["prev_hash", "entry_hash"])
            prev = entry.entry_hash


class Migration(migrations.Migration):
    dependencies = [
        ("waybills", "0002_waybill_authorised_by_name_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="waybill",
            name="document_fingerprint",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="waybill",
            name="pdf_sha256",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="prev_hash",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="entry_hash",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.RunPython(backfill_audit_hashes, migrations.RunPython.noop),
    ]
