from pathlib import Path
from tempfile import TemporaryDirectory

from cryptography.fernet import Fernet
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from safiroute.prodcheck import azure_configured, sentry_should_init, validate_runtime
from waybills.fingerprints import pdf_matches_stored_hash, verify_audit_chain
from waybills.models import Customer, Product, User, Waybill, WaybillItem, record_audit
from waybills.pdf import generate_waybill_pdf


class ProductionGuardTests(SimpleTestCase):
    def test_debug_allows_sqlite_and_dev_secret(self):
        validate_runtime(
            debug=True,
            engine="django.db.backends.sqlite3",
            secret="dev-only-change-in-prod-safiroute",
            django_env="development",
            allowed_hosts=["*"],
        )

    def test_production_rejects_sqlite(self):
        with self.assertRaises(ImproperlyConfigured):
            validate_runtime(
                debug=False,
                engine="django.db.backends.sqlite3",
                secret="a-real-production-secret-key-value",
                django_env="production",
                allowed_hosts=["safiroute.safisana.org"],
            )

    def test_production_rejects_dev_secret(self):
        with self.assertRaises(ImproperlyConfigured):
            validate_runtime(
                debug=False,
                engine="django.db.backends.postgresql",
                secret="dev-only-change-in-prod-safiroute",
                django_env="production",
                allowed_hosts=["safiroute.safisana.org"],
            )

    def test_production_rejects_wildcard_hosts(self):
        with self.assertRaises(ImproperlyConfigured):
            validate_runtime(
                debug=False,
                engine="django.db.backends.postgresql",
                secret="a-real-production-secret-key-value",
                django_env="production",
                allowed_hosts=["*"],
            )

    def test_production_postgres_with_explicit_hosts_passes(self):
        validate_runtime(
            debug=False,
            engine="django.db.backends.postgresql",
            secret="a-real-production-secret-key-value",
            django_env="production",
            allowed_hosts=["safiroute.safisana.org"],
        )

    def test_sentry_ignores_empty_and_stub_dsns(self):
        self.assertFalse(sentry_should_init(""))
        self.assertFalse(sentry_should_init("https://YOUR_DSN@sentry.example/1"))
        self.assertTrue(sentry_should_init("https://abc123@o0.ingest.sentry.io/1"))

    def test_azure_needs_real_credentials_not_just_account_name(self):
        self.assertFalse(azure_configured("safiroutestorage", "", "safiroute-media"))
        self.assertFalse(azure_configured("safiroutestorage", "account-key", ""))
        self.assertFalse(azure_configured("", "account-key", "safiroute-media"))
        self.assertTrue(azure_configured("safiroutestorage", "account-key", "safiroute-media"))
        self.assertTrue(
            azure_configured(
                "",
                "DefaultEndpointsProtocol=https;AccountName=safiroute;AccountKey=secret;EndpointSuffix=core.windows.net",
                "safiroute-media",
            )
        )


class SessionAuthTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("sales", password="safiroute", role=User.Role.SALES, first_name="Ama")
        self.client = APIClient()

    def test_login_creates_django_session_without_authorization_header(self):
        res = self.client.post(
            "/api/auth/login/",
            {"username": "sales", "password": "safiroute"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["session"])
        self.assertIn("token", res.data)
        self.client.credentials()
        me = self.client.get("/api/me/")
        self.assertEqual(me.status_code, 200, me.data)
        self.assertEqual(me.data["username"], "sales")

    def test_logout_ends_session(self):
        self.client.post(
            "/api/auth/login/",
            {"username": "sales", "password": "safiroute"},
            format="json",
        )
        out = self.client.post("/api/auth/logout/")
        self.assertEqual(out.status_code, 200)
        me = self.client.get("/api/me/")
        self.assertEqual(me.status_code, 403)


class FingerprintTests(TestCase):
    def setUp(self):
        self.sales = User.objects.create_user("sales", password="safiroute", role=User.Role.SALES)
        self.customer = Customer.objects.create(name="Test Farm", account_number="CUST-FP", delivery_address="Ashaiman")
        self.product = Product.objects.create(name="Fortifer 50kg", sku="FORT-FP")
        self.waybill = Waybill.objects.create(
            customer=self.customer,
            created_by=self.sales,
            status=Waybill.Status.DELIVERED,
            deliver_to="Test Farm",
            customer_rep_name="Kojo",
        )
        WaybillItem.objects.create(waybill=self.waybill, product=self.product, ordered_qty=4, delivered_qty=4)

    def test_pdf_fingerprint_is_stored_and_printed(self):
        generate_waybill_pdf(self.waybill)
        self.waybill.refresh_from_db()
        self.assertEqual(len(self.waybill.document_fingerprint), 64)
        self.assertEqual(len(self.waybill.pdf_sha256), 64)
        ok, digest = pdf_matches_stored_hash(self.waybill)
        self.assertTrue(ok)
        self.assertEqual(digest, self.waybill.pdf_sha256)
        with self.waybill.pdf_file.open("rb") as handle:
            pdf_bytes = handle.read()
        self.assertIn(self.waybill.document_fingerprint.encode(), pdf_bytes)

    def test_tampered_pdf_fails_integrity_command(self):
        generate_waybill_pdf(self.waybill)
        self.waybill.refresh_from_db()
        path = self.waybill.pdf_file.path
        with open(path, "ab") as handle:
            handle.write(b"tamper")
        ok, _ = pdf_matches_stored_hash(self.waybill)
        self.assertFalse(ok)
        with self.assertRaises(CommandError):
            call_command("check_pdf_integrity", waybill=self.waybill.waybill_number)

    def test_audit_chain_detects_tamper(self):
        record_audit(self.waybill, self.sales, "created", to_status="draft")
        record_audit(self.waybill, self.sales, "completed", "draft", "delivered")
        ok, detail = verify_audit_chain(self.waybill)
        self.assertTrue(ok, detail)
        entry = self.waybill.audit_logs.order_by("id").first()
        entry.detail = {"tampered": True}
        entry.save(update_fields=["detail"])
        ok, detail = verify_audit_chain(self.waybill)
        self.assertFalse(ok)
        self.assertIn("entry_hash", detail)


class BackupRestoreTests(TestCase):
    def setUp(self):
        self.key = Fernet.generate_key().decode()
        self.sales = User.objects.create_user("sales", password="safiroute", role=User.Role.SALES)
        self.customer = Customer.objects.create(name="Backup Farm", account_number="CUST-BK", delivery_address="Tema")
        self.product = Product.objects.create(name="Fortifer 25kg", sku="FORT-BK")
        self.waybill = Waybill.objects.create(
            customer=self.customer,
            created_by=self.sales,
            sales_order_ref="SO-BACKUP",
            deliver_to="Backup Farm",
        )
        WaybillItem.objects.create(waybill=self.waybill, product=self.product, ordered_qty=7)
        self.waybill.pdf_file.save("note.txt", ContentFile(b"waybill-media"), save=True)

    def test_encrypt_backup_and_restore_roundtrip(self):
        number = self.waybill.waybill_number
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "safiroute.enc"
            with override_settings(BACKUP_ENCRYPTION_KEY=self.key, MEDIA_ROOT=Path(tmp) / "media"):
                call_command("encrypt_backup", output=str(path))
                self.assertTrue(path.exists())
                self.assertGreater(path.stat().st_size, 32)
                Waybill.objects.all().delete()
                Customer.objects.filter(account_number="CUST-BK").delete()
                self.assertFalse(Waybill.objects.filter(waybill_number=number).exists())
                call_command("restore_backup", input=str(path), confirm="YES")
        restored = Waybill.objects.get(waybill_number=number)
        self.assertEqual(restored.sales_order_ref, "SO-BACKUP")
        self.assertEqual(restored.items.count(), 1)

    def test_restore_without_confirm_is_dry_run(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "safiroute.enc"
            with override_settings(BACKUP_ENCRYPTION_KEY=self.key):
                call_command("encrypt_backup", output=str(path))
                call_command("restore_backup", input=str(path))
        self.assertTrue(Waybill.objects.filter(pk=self.waybill.pk).exists())

    def test_wrong_key_does_not_restore(self):
        number = self.waybill.waybill_number
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "safiroute.enc"
            with override_settings(BACKUP_ENCRYPTION_KEY=self.key):
                call_command("encrypt_backup", output=str(path))
            other = Fernet.generate_key().decode()
            with override_settings(BACKUP_ENCRYPTION_KEY=other):
                with self.assertRaises(CommandError):
                    call_command("restore_backup", input=str(path), confirm="YES")
        self.assertTrue(Waybill.objects.filter(waybill_number=number).exists())

    def test_truncated_backup_fails_closed(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "safiroute.enc"
            with override_settings(BACKUP_ENCRYPTION_KEY=self.key):
                call_command("encrypt_backup", output=str(path))
                path.write_bytes(path.read_bytes()[:24])
                with self.assertRaises(CommandError):
                    call_command("restore_backup", input=str(path), confirm="YES")


class SeedDemoGuardTests(TestCase):
    def test_seed_demo_refuses_when_debug_false(self):
        with override_settings(DEBUG=False):
            with self.assertRaises(CommandError):
                call_command("seed_demo")
