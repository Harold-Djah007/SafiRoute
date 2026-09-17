from django.core.cache import cache
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from waybills.models import AuditLog, Customer, Product, User, Vehicle, Waybill, WaybillItem


class WaybillWorkflowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.sales = User.objects.create_user("sales", password="safiroute", role=User.Role.SALES, first_name="Ama")
        self.supervisor = User.objects.create_user("sup", password="safiroute", role=User.Role.SUPERVISOR)
        self.warehouse = User.objects.create_user("wh", password="safiroute", role=User.Role.WAREHOUSE)
        self.driver = User.objects.create_user("drv", password="safiroute", role=User.Role.DRIVER, phone="0244000000")
        self.customer = Customer.objects.create(
            name="Test Farm",
            account_number="CUST-9",
            delivery_address="Ashaiman",
        )
        self.product = Product.objects.create(name="Fortifer 50kg", sku="FORT-50", unit_of_measure="bag")
        self.vehicle = Vehicle.objects.create(registration_number="GS-1")
        self.client = APIClient()

    def _auth(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def test_sales_to_delivery_and_verify(self):
        self._auth(self.sales)
        create = self.client.post(
            "/api/waybills/",
            {
                "customer": self.customer.id,
                "sales_order_ref": "SO-1",
                "items": [{"product": self.product.id, "ordered_qty": "10"}],
            },
            format="json",
        )
        self.assertEqual(create.status_code, 201, create.data)
        wb_id = create.data["id"]
        self.assertTrue(create.data["waybill_number"].startswith("SR-"))

        submit = self.client.post(f"/api/waybills/{wb_id}/submit/")
        self.assertEqual(submit.status_code, 200)

        self._auth(self.supervisor)
        approve = self.client.post(f"/api/waybills/{wb_id}/approve/")
        self.assertEqual(approve.status_code, 200)

        self._auth(self.warehouse)
        load = self.client.post(
            f"/api/waybills/{wb_id}/load/",
            {"items": [{"id": submit.data["items"][0]["id"], "loaded_qty": "10", "batch_number": "B1"}]},
            format="json",
        )
        self.assertEqual(load.status_code, 200, load.data)

        dispatch = self.client.post(
            f"/api/waybills/{wb_id}/dispatch/",
            {"driver": self.driver.id, "vehicle": self.vehicle.id},
            format="json",
        )
        self.assertEqual(dispatch.status_code, 200, dispatch.data)

        self._auth(self.driver)
        complete = self.client.post(
            f"/api/waybills/{wb_id}/complete_delivery/",
            {
                "outcome": "delivered",
                "customer_rep_name": "Kojo",
                "customer_rep_role": "Storekeeper",
                "client_uuid": "11111111-1111-1111-1111-111111111111",
                "items": [{"id": load.data["items"][0]["id"], "delivered_qty": "10", "rejected_qty": "0"}],
                "lat": "5.67",
                "lng": "0.03",
                "gps_accuracy": "8",
            },
            format="json",
        )
        self.assertEqual(complete.status_code, 200, complete.data)
        self.assertEqual(complete.data["status"], "delivered")
        self.assertTrue(complete.data["pdf_file"])
        self.assertEqual(len(complete.data["document_fingerprint"]), 64)
        self.assertEqual(len(complete.data["pdf_sha256"]), 64)

        token = complete.data["verification_token"]
        self.client.credentials()
        verify = self.client.get(f"/api/verify/{token}/")
        self.assertEqual(verify.status_code, 200)
        self.assertTrue(verify.data["valid"])
        self.assertEqual(verify.data["waybill_number"], complete.data["waybill_number"])

        self._auth(self.driver)
        replay = self.client.post(
            f"/api/waybills/{wb_id}/complete_delivery/",
            {
                "outcome": "delivered",
                "customer_rep_name": "Kojo",
                "client_uuid": "11111111-1111-1111-1111-111111111111",
            },
            format="json",
        )
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(Waybill.objects.count(), 1)

    def test_paper_form_create_without_customer_id(self):
        self._auth(self.sales)
        res = self.client.post(
            "/api/waybills/",
            {
                "deliver_to": "Ashaiman Vegetable Growers Cooperative",
                "delivery_contact_name": "Madam Akosua",
                "delivery_address_text": "Community 22, Ashaiman",
                "contact_phone": "0244200101",
                "authorised_by_name": "Ama Mensah",
                "items": [
                    {"product_name": "Fortifer Organic Fertilizer 50kg", "ordered_qty": "40", "notes": "Dry bags"}
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["deliver_to"], "Ashaiman Vegetable Growers Cooperative")
        self.assertEqual(res.data["items"][0]["product_name"], "Fortifer Organic Fertilizer 50kg")

    def test_driver_cannot_see_unassigned(self):
        wb = Waybill.objects.create(customer=self.customer, created_by=self.sales)
        WaybillItem.objects.create(waybill=wb, product=self.product, ordered_qty=1)
        self._auth(self.driver)
        listing = self.client.get("/api/waybills/")
        self.assertEqual(listing.data["count"], 0)

    def test_login_uses_session_without_exposing_api_token(self):
        res = self.client.post(
            "/api/auth/login/",
            {"username": "sales", "password": "safiroute"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["session"])
        self.assertNotIn("token", res.data)
        self.assertEqual(res.data["user"]["username"], "sales")
        noslash = self.client.post(
            "/api/auth/login",
            {"username": "sales", "password": "safiroute"},
            format="json",
        )
        self.assertEqual(noslash.status_code, 200, noslash.data)
        self.assertNotIn("token", noslash.data)

    def test_driver_field_pack_downloads_assigned_waybills(self):
        wb = Waybill.objects.create(
            customer=self.customer,
            created_by=self.sales,
            driver=self.driver,
            vehicle=self.vehicle,
            status=Waybill.Status.IN_TRANSIT,
            deliver_to="Test Farm",
            contact_phone="0244000000",
        )
        WaybillItem.objects.create(waybill=wb, product=self.product, ordered_qty=4, loaded_qty=4)
        other = Waybill.objects.create(
            customer=self.customer,
            created_by=self.sales,
            status=Waybill.Status.IN_TRANSIT,
        )
        WaybillItem.objects.create(waybill=other, product=self.product, ordered_qty=1)
        self._auth(self.driver)
        pack = self.client.get("/api/waybills/field_pack/")
        self.assertEqual(pack.status_code, 200, pack.data)
        self.assertEqual(pack.data["count"], 1)
        self.assertEqual(pack.data["waybills"][0]["id"], wb.id)
        self.assertEqual(len(pack.data["waybills"][0]["items"]), 1)

    def test_delivery_requires_gps_or_reason(self):
        wb = Waybill.objects.create(
            customer=self.customer,
            created_by=self.sales,
            driver=self.driver,
            vehicle=self.vehicle,
            status=Waybill.Status.DISPATCHED,
        )
        item = WaybillItem.objects.create(waybill=wb, product=self.product, ordered_qty=2, loaded_qty=2)
        self._auth(self.driver)
        missing = self.client.post(
            f"/api/waybills/{wb.id}/complete_delivery/",
            {
                "outcome": "delivered",
                "customer_rep_name": "Kojo",
                "items": [{"id": item.id, "delivered_qty": "2", "rejected_qty": "0"}],
            },
            format="json",
        )
        self.assertEqual(missing.status_code, 400)

    def test_sales_mobile_waybill_sync_is_complete_and_idempotent(self):
        tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        client_uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        payload = {
            "client_uuid": client_uuid,
            "phone_number": "SR-20260917-1234",
            "deliver_to": "Mobile Test Customer",
            "delivery_contact_name": "Kojo Mensah",
            "contact_phone": "0244000000",
            "delivery_address_text": "Community 22, Ashaiman",
            "document_date": "2026-09-17",
            "authorised_by_name": "Ama Sales",
            "authorised_remarks": "Checked",
            "dispatched_by_name": "Kofi Dispatch",
            "vehicle_registration": "GT 1234-26",
            "received_by": "Adwoa Customer",
            "received_by_role": "Storekeeper",
            "items": [
                {
                    "product_name": "Fortifer Organic Fertilizer 50kg",
                    "ordered_qty": "20",
                    "notes": "Dry bags",
                }
            ],
            "authorised_signature": tiny_png,
            "dispatched_signature": tiny_png,
            "customer_signature": tiny_png,
            "lat": "5.683000",
            "lng": "-0.033000",
            "gps_accuracy": "8",
            "photo": tiny_png,
            "delivery_notes": "Delivered in good condition",
            "device_timestamp": "2026-09-17T10:30:00Z",
        }
        self._auth(self.sales)
        created = self.client.post("/api/mobile-waybills/ingest/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertTrue(created.data["accepted"])
        self.assertFalse(created.data["duplicate"])

        wb = Waybill.objects.get(client_uuid=client_uuid)
        self.assertEqual(wb.status, Waybill.Status.DELIVERED)
        self.assertEqual(wb.created_by, self.sales)
        self.assertEqual(wb.authorised_by_name, "Ama Sales")
        self.assertEqual(wb.dispatched_by_name, "Kofi Dispatch")
        self.assertTrue(wb.authorised_signature)
        self.assertTrue(wb.driver_signature)
        self.assertTrue(wb.customer_signature)
        self.assertTrue(wb.pdf_file)
        self.assertEqual(wb.photos.count(), 1)
        self.assertTrue(AuditLog.objects.filter(waybill=wb, action="mobile_sales_completed").exists())

        replay = self.client.post("/api/mobile-waybills/ingest/", payload, format="json")
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertTrue(replay.data["duplicate"])
        self.assertEqual(Waybill.objects.filter(client_uuid=client_uuid).count(), 1)

    def test_driver_cannot_use_sales_mobile_completion_endpoint(self):
        self._auth(self.driver)
        denied = self.client.post(
            "/api/mobile-waybills/ingest/",
            {"client_uuid": "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)
