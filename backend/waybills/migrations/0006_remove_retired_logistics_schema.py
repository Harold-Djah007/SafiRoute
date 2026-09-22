from django.db import migrations


def preserve_legacy_details(apps, schema_editor):
    Waybill = apps.get_model("waybills", "Waybill")
    WaybillItem = apps.get_model("waybills", "WaybillItem")
    Vehicle = apps.get_model("waybills", "Vehicle")

    vehicle_lookup = {
        vehicle.pk: vehicle.registration_number
        for vehicle in Vehicle.objects.all()
    }

    for waybill in Waybill.objects.all().iterator():
        notes = (waybill.delivery_notes or "").strip()
        legacy = []
        if waybill.vehicle_id and waybill.vehicle_id in vehicle_lookup:
            legacy.append(f"Legacy vehicle: {vehicle_lookup[waybill.vehicle_id]}")
        if waybill.failure_reason:
            legacy.append(f"Legacy delivery note: {waybill.failure_reason}")
        if waybill.cancellation_reason:
            legacy.append(f"Legacy cancellation note: {waybill.cancellation_reason}")
        if legacy:
            waybill.delivery_notes = "\n".join(
                part for part in [notes, *legacy] if part
            )
            waybill.save(update_fields=["delivery_notes"])

    for item in WaybillItem.objects.all().iterator():
        remarks = (item.notes or "").strip()
        legacy = []
        if item.ordered_qty not in (None, 0):
            legacy.append(f"Qty: {item.ordered_qty}")
        if item.batch_number:
            legacy.append(f"Batch: {item.batch_number}")
        if legacy:
            item.notes = " · ".join(part for part in [remarks, *legacy] if part)[:240]
            item.save(update_fields=["notes"])


class Migration(migrations.Migration):
    dependencies = [
        ("waybills", "0005_sales_only_product"),
    ]

    operations = [
        migrations.RunPython(preserve_legacy_details, migrations.RunPython.noop),
        migrations.RenameField(
            model_name="waybill",
            old_name="driver_signature",
            new_name="dispatched_signature",
        ),
        migrations.RenameField(
            model_name="waybill",
            old_name="customer_rep_name",
            new_name="received_by_name",
        ),
        migrations.RemoveField(model_name="waybill", name="approved_by"),
        migrations.RemoveField(model_name="waybill", name="approved_at"),
        migrations.RemoveField(model_name="waybill", name="warehouse_officer"),
        migrations.RemoveField(model_name="waybill", name="loaded_at"),
        migrations.RemoveField(model_name="waybill", name="driver"),
        migrations.RemoveField(model_name="waybill", name="vehicle"),
        migrations.RemoveField(model_name="waybill", name="driver_phone"),
        migrations.RemoveField(model_name="waybill", name="dispatch_at"),
        migrations.RemoveField(model_name="waybill", name="dispatch_lat"),
        migrations.RemoveField(model_name="waybill", name="dispatch_lng"),
        migrations.RemoveField(model_name="waybill", name="dispatch_gps_accuracy"),
        migrations.RemoveField(model_name="waybill", name="customer_rep_role"),
        migrations.RemoveField(model_name="waybill", name="failure_reason"),
        migrations.RemoveField(model_name="waybill", name="cancellation_reason"),
        migrations.RemoveField(model_name="waybillitem", name="sku"),
        migrations.RemoveField(model_name="waybillitem", name="unit_of_measure"),
        migrations.RemoveField(model_name="waybillitem", name="ordered_qty"),
        migrations.RemoveField(model_name="waybillitem", name="loaded_qty"),
        migrations.RemoveField(model_name="waybillitem", name="delivered_qty"),
        migrations.RemoveField(model_name="waybillitem", name="rejected_qty"),
        migrations.RemoveField(model_name="waybillitem", name="batch_number"),
        migrations.DeleteModel(name="Vehicle"),
    ]
