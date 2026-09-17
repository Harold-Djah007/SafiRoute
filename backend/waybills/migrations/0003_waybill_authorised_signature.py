from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("waybills", "0002_waybill_authorised_by_name_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="waybill",
            name="authorised_signature",
            field=models.ImageField(blank=True, null=True, upload_to="signatures/"),
        ),
    ]
