"""Seed SafiRoute with Sales-only demo data for local testing."""

import base64
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from waybills.models import Customer, Product, User, Waybill, WaybillItem, record_audit
from waybills.pdf import generate_waybill_pdf

DEMO_PASSWORD = "safiroute"
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class Command(BaseCommand):
    help = "Create SafiRoute Sales demo users, customers, products, and sample waybills."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "seed_demo is disabled when DEBUG is False. Demo passwords must not exist in production."
            )

        admin = self._user(
            "admin",
            "SafiRoute",
            "Sales Admin",
            User.Role.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        sales = self._user(
            "sales",
            "Ama",
            "Mensah",
            User.Role.SALES,
            employee_id="SF-SAL-014",
            phone="+233244111014",
        )

        products = [
            self._product("Fortifer Organic Fertilizer 50kg", "FORT-50", "bag"),
            self._product("Fortifer Organic Fertilizer 25kg", "FORT-25", "bag"),
            self._product("Compost Blend Bulk", "COMP-BLK", "tonne"),
        ]
        customers = [
            self._customer(
                "Ashaiman Vegetable Growers Cooperative",
                "CUST-1001",
                "Plot 12, Community 22, Ashaiman",
                "Madam Akosua",
                "+233244200101",
            ),
            self._customer(
                "Greater Accra Grains Ltd",
                "CUST-1002",
                "Spintex Road, Accra",
                "Joseph Tetteh",
                "+233302200202",
            ),
        ]

        if not Waybill.objects.exists():
            self._seed_waybills(sales, products, customers)

        self.stdout.write(self.style.SUCCESS("Sales-only demo data ready."))
        self.stdout.write("  Sales user: sales")
        self.stdout.write("  Sales administrator: admin")
        self.stdout.write(f"  Password: {DEMO_PASSWORD}")

    def _user(self, username, first, last, role, **extra):
        user, _ = User.objects.get_or_create(username=username)
        user.first_name = first
        user.last_name = last
        user.email = f"{username}@safisana.org"
        user.role = role
        user.branch = "Ashaiman Plant"
        user.is_active = True
        for key, value in extra.items():
            setattr(user, key, value)
        user.set_password(DEMO_PASSWORD)
        user.save()
        return user

    def _product(self, name, sku, unit):
        obj, _ = Product.objects.get_or_create(
            sku=sku,
            defaults={"name": name, "unit_of_measure": unit},
        )
        return obj

    def _customer(self, name, account, address, contact, phone):
        obj, _ = Customer.objects.get_or_create(
            account_number=account,
            defaults={
                "name": name,
                "delivery_address": address,
                "contact_name": contact,
                "phone": phone,
            },
        )
        return obj

    def _seed_waybills(self, sales, products, customers):
        draft = Waybill.objects.create(
            customer=customers[0],
            created_by=sales,
            status=Waybill.Status.DRAFT,
            deliver_to=customers[0].name,
            delivery_contact_name=customers[0].contact_name,
            delivery_address_text=customers[0].delivery_address,
            contact_phone=customers[0].phone,
            document_date=timezone.localdate(),
            authorised_by_name=sales.get_full_name(),
        )
        WaybillItem.objects.create(
            waybill=draft,
            product=products[1],
            product_name=products[1].name,
            notes="40 bags",
        )
        record_audit(draft, sales, "created", to_status=draft.status)

        completed = Waybill.objects.create(
            customer=customers[1],
            created_by=sales,
            status=Waybill.Status.COMPLETED,
            sync_status=Waybill.SyncStatus.SYNCED,
            deliver_to=customers[1].name,
            delivery_contact_name=customers[1].contact_name,
            delivery_address_text=customers[1].delivery_address,
            contact_phone=customers[1].phone,
            document_date=timezone.localdate(),
            authorised_by_name="Kwame Asante",
            authorised_remarks="Approved and released",
            dispatched_by_name="Ama Mensah",
            received_by_name="Joseph Tetteh",
            delivery_at=timezone.now(),
            delivery_device_at=timezone.now(),
            delivery_notes="Received in good condition",
        )
        completed.authorised_signature.save(
            "demo-authorised.png", ContentFile(TINY_PNG), save=False
        )
        completed.dispatched_signature.save(
            "demo-dispatched.png", ContentFile(TINY_PNG), save=False
        )
        completed.customer_signature.save(
            "demo-received.png", ContentFile(TINY_PNG), save=False
        )
        completed.save()
        WaybillItem.objects.create(
            waybill=completed,
            product=products[0],
            product_name=products[0].name,
            notes="150 bags · Dry and sealed",
        )
        record_audit(
            completed,
            sales,
            "completed",
            Waybill.Status.DRAFT,
            Waybill.Status.COMPLETED,
            detail={"source": "demo"},
        )
        generate_waybill_pdf(completed)
