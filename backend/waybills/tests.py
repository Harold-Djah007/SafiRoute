from django.core.cache import cache
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from waybills.models import AuditLog, Customer, Product, User, Waybill, WaybillItem


TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class SalesWaybillTests(TestCase):
    def setUp(self):
        cache.clear()
        self.sales = User.objects.create_user(
            "sales",
            password="safiroute",
            role=User.Role.SALES,
            first_name="Ama",
        )
        self.admin = User.objects.create_user(
            "sales-admin",
            password="safiroute",
            role=User.Role.ADMIN,
        )
        self.customer = Customer.objects.create(
            name="Test Farm",
            account_number="CUST-9",
            delivery_address="Ashaiman",
        )
        self.product = Product.objects.create(
            name="Fortifer 50kg",
            sku="FORT-50",
            unit_of_measure="bag",
        )
        self.client = APIClient()

    def _auth(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def test_sales_can_create_a_draft_without_approval_pipeline(self):
        self._auth(self.sales)
        response = self.client.post(
            "/api/waybills/",
            {
                "customer": self.customer.id,
                "deliver_to": "Test Farm",
                "delivery_address_text": "Ashaiman",
                "authorised_by_name": "Ama Sales",
                "items": [{"product": self.product.id, "product_name": "Fortifer 50kg", "notes": "20 bags"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], Waybill.Status.DRAFT)
        self.assertTrue(response.data["waybill_number"].startswith("SR-"))

        for retired_action in ["submit", "approve", "reject", "load", "dispatch", "start_transit", "complete_delivery"]:
            retired = self.client.post(f"/api/waybills/{response.data['id']}/{retired_action}/")
            self.assertEqual(retired.status_code, 404)

    def test_completed_waybill_is_immutable(self):
        waybill = Waybill.objects.create(
            customer=self.customer,
            created_by=self.sales,
            status=Waybill.Status.COMPLETED,
            deliver_to="Test Farm",
        )
        WaybillItem.objects.create(
            waybill=waybill,
            product=self.product,
            product_name=self.product.name,
        )
        self._auth(self.sales)
        response = self.client.patch(
            f"/api/waybills/{waybill.id}/",
            {"deliver_to": "Changed"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        waybill.refresh_from_db()
        self.assertEqual(waybill.deliver_to, "Test Farm")

    def test_retired_driver_and_vehicle_routes_do_not_exist(self):
        self._auth(self.sales)
        self.assertEqual(self.client.get("/api/drivers/").status_code, 404)
        self.assertEqual(self.client.get("/api/vehicles/").status_code, 404)

    def test_session_login_uses_only_sales_accounts(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "sales", "password": "safiroute"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["session"])
        self.assertEqual(response.data["user"]["role"], "sales")

        legacy = User.objects.create_user(
            "old-driver",
            password="safiroute",
            role="driver",
        )
        response = self.client.post(
            "/api/auth/login/",
            {"username": legacy.username, "password": "safiroute"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_sales_mobile_waybill_completion_is_complete_and_idempotent(self):
        client_uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        payload = {
            "client_uuid": client_uuid,
            "phone_number": "SR-20260917-1234",
            "deliver_to": "Mobile Test Customer",
            "delivery_contact_name": "Kojo Mensah",
            "contact_phone": "0244000000",
            "delivery_address_text": "Community 22, Ashaiman",
            "document_date": "2026-09-17",
            "authorised_by_name": "Kwame Asante",
            "authorised_remarks": "Approved on the waybill",
            "dispatched_by_name": "Ama Mensah",
            "received_by": "Adwoa Customer",
            "items": [
                {
                    "product_name": "Fortifer Organic Fertilizer 50kg",
                    "notes": "20 bags · Dry",
                }
            ],
            "authorised_signature": TINY_PNG,
            "dispatched_signature": TINY_PNG,
            "customer_signature": TINY_PNG,
            "lat": "5.683000",
            "lng": "-0.033000",
            "gps_accuracy": "8",
            "photo": TINY_PNG,
            "delivery_notes": "Received in good condition",
            "device_timestamp": "2026-09-17T10:30:00Z",
        }

        self._auth(self.sales)
        created = self.client.post("/api/mobile-waybills/ingest/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertTrue(created.data["accepted"])
        self.assertFalse(created.data["duplicate"])

        waybill = Waybill.objects.get(client_uuid=client_uuid)
        self.assertEqual(waybill.status, Waybill.Status.COMPLETED)
        self.assertEqual(waybill.created_by, self.sales)
        self.assertEqual(waybill.authorised_by_name, "Kwame Asante")
        self.assertEqual(waybill.dispatched_by_name, "Ama Mensah")
        self.assertEqual(waybill.received_by_name, "Adwoa Customer")
        self.assertTrue(waybill.authorised_signature)
        self.assertTrue(waybill.dispatched_signature)
        self.assertTrue(waybill.customer_signature)
        self.assertTrue(waybill.pdf_file)
        self.assertEqual(waybill.photos.count(), 1)
        self.assertTrue(
            AuditLog.objects.filter(
                waybill=waybill,
                action="mobile_sales_completed",
            ).exists()
        )

        replay = self.client.post("/api/mobile-waybills/ingest/", payload, format="json")
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertTrue(replay.data["duplicate"])
        self.assertEqual(Waybill.objects.filter(client_uuid=client_uuid).count(), 1)

        self.client.credentials()
        verify = self.client.get(f"/api/verify/{waybill.verification_token}/")
        self.assertEqual(verify.status_code, 200, verify.data)
        self.assertEqual(verify.data["status"], "completed")
        self.assertTrue(verify.data["has_authorised_signature"])
        self.assertTrue(verify.data["has_dispatched_signature"])
        self.assertTrue(verify.data["has_received_signature"])

    def test_non_sales_role_cannot_use_mobile_ingest(self):
        legacy = User.objects.create_user(
            "legacy-warehouse",
            password="safiroute",
            role="warehouse",
        )
        self._auth(legacy)
        response = self.client.post(
            "/api/mobile-waybills/ingest/",
            {"client_uuid": "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
