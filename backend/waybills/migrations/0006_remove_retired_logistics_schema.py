from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("waybills", "0005_sales_only_product"),
    ]

    operations = [
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
