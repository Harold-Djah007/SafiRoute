from django.db import migrations, models


LEGACY_ROLES = ["supervisor", "warehouse", "driver", "finance"]
COMPLETED_STATUSES = ["delivered", "partially_delivered", "delivery_failed"]


def simplify_sales_product(apps, schema_editor):
    User = apps.get_model("waybills", "User")
    Waybill = apps.get_model("waybills", "Waybill")

    User.objects.filter(role__in=LEGACY_ROLES).update(role="sales", is_active=False)
    Waybill.objects.filter(status__in=COMPLETED_STATUSES).update(status="completed")
    Waybill.objects.filter(status="cancelled").update(status="voided")
    Waybill.objects.filter(
        status__in=[
            "pending_approval",
            "approved",
            "loaded",
            "dispatched",
            "in_transit",
        ]
    ).update(status="draft")


def reverse_noop(apps, schema_editor):
    # The old multi-role/multi-stage workflow is intentionally retired.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("waybills", "0004_waybill_authorised_signature"),
    ]

    operations = [
        migrations.RunPython(simplify_sales_product, reverse_noop),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Sales Administrator"),
                    ("sales", "Sales User"),
                ],
                default="sales",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="waybill",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("completed", "Completed"),
                    ("voided", "Voided"),
                ],
                default="draft",
                max_length=32,
            ),
        ),
    ]
