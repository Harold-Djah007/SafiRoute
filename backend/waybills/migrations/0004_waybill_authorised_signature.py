from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("waybills", "0003_pdf_fingerprint_and_audit_hash"),
    ]

    operations = [
        migrations.AddField(
            model_name="waybill",
            name="authorised_signature",
            field=models.ImageField(blank=True, null=True, upload_to="signatures/"),
        ),
    ]
