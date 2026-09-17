"""Seed SafiRoute with Safisana Ghana demo data for local testing."""

from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from waybills.models import (
    Customer,
    Product,
    User,
    Vehicle,
    Waybill,
    WaybillItem,
    record_audit,
)
from waybills.pdf import generate_waybill_pdf

DEMO_PASSWORD = "safiroute"


class Command(BaseCommand):
    help = "Create demo users, products, customers, and sample waybills."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo is disabled when DEBUG is False. Demo passwords must not exist in production.")
        users = {
            "admin": self._user("admin", "SafiRoute", "Admin", User.Role.ADMIN, is_staff=True, is_superuser=True),
            "sales": self._user("sales", "Ama", "Mensah", User.Role.SALES, employee_id="SF-SAL-014", phone="+233244111014"),
            "supervisor": self._user("supervisor", "Kwame", "Asante", User.Role.SUPERVISOR, employee_id="SF-SAL-002", phone="+233244111002"),
            "warehouse": self._user("warehouse", "Efua", "Boateng", User.Role.WAREHOUSE, employee_id="SF-WH-007", phone="+233244111007"),
            "driver": self._user("driver", "Kofi", "Owusu", User.Role.DRIVER, employee_id="SF-DRV-021", phone="+233244111021"),
            "driver2": self._user("driver2", "Abena", "Sarpong", User.Role.DRIVER, employee_id="SF-DRV-022", phone="+233244111022"),
            "finance": self._user("finance", "Yaw", "Agyeman", User.Role.FINANCE, employee_id="SF-FIN-004", phone="+233244111004"),
        }

        products = [
            self._product("Fortifer Organic Fertilizer 50kg", "FORT-50", "bag", "Pelleted organic fertilizer from treated faecal sludge and organic waste."),
            self._product("Fortifer Organic Fertilizer 25kg", "FORT-25", "bag", "Smaller bag for market gardeners and peri-urban farms."),
            self._product("Compost Blend Bulk", "COMP-BLK", "tonne", "Bulk compost for landscaping and commercial farms."),
            self._product("Soil Conditioner 50kg", "SOIL-50", "bag", "Organic soil conditioner for rehabilitation plots."),
        ]

        customers = [
            self._customer("Ashaiman Vegetable Growers Cooperative", "CUST-1001", "Plot 12, Community 22, Ashaiman", "Madam Akosua", "+233244200101", "GM-014-2468"),
            self._customer("Greater Accra Grains Ltd", "CUST-1002", "Spintex Road, Accra", "Joseph Tetteh", "+233302200202", "GA-123-7890"),
            self._customer("Tema Municipal Assembly Parks", "CUST-1003", "Community 1, Tema", "Nana Adwoa Kumi", "+233303200303", "GT-045-1122"),
            self._customer("Kpong Irrigation Farmers", "CUST-1004", "Kpong Irrigation Scheme, Lower Volta", "Ibrahim Fuseini", "+233244200404", "EV-332-0091"),
        ]

        vehicles = [
            self._vehicle("GS 4517-24"),
            self._vehicle("GN 2204-23"),
            self._vehicle("GT 8891-22", "Safisana contracted haulier"),
        ]

        if not Waybill.objects.exists():
            self._seed_waybills(users, products, customers, vehicles)
        else:
            for waybill in Waybill.objects.select_related("customer"):
                if waybill.deliver_to:
                    continue
                waybill.deliver_to = waybill.customer.name
                waybill.delivery_contact_name = waybill.customer.contact_name
                waybill.delivery_address_text = waybill.customer.delivery_address
                waybill.contact_phone = waybill.customer.phone
                if not waybill.document_date:
                    waybill.document_date = timezone.localdate()
                if not waybill.authorised_by_name:
                    waybill.authorised_by_name = users["sales"].get_full_name()
                waybill.save(
                    update_fields=[
                        "deliver_to",
                        "delivery_contact_name",
                        "delivery_address_text",
                        "contact_phone",
                        "document_date",
                        "authorised_by_name",
                    ]
                )

        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self.stdout.write("  Login with any of: admin, sales, supervisor, warehouse, driver, finance")
        self.stdout.write(f"  Password: {DEMO_PASSWORD}")

    def _user(self, username, first, last, role, **extra):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "first_name": first,
                "last_name": last,
                "email": f"{username}@safisana.org",
                "role": role,
                "branch": "Ashaiman Plant",
                **extra,
            },
        )
        user.set_password(DEMO_PASSWORD)
        user.role = role
        user.first_name = first
        user.last_name = last
        for key, value in extra.items():
            setattr(user, key, value)
        user.save()
        return user

    def _product(self, name, sku, unit, description):
        obj, _ = Product.objects.get_or_create(
            sku=sku,
            defaults={"name": name, "unit_of_measure": unit, "description": description},
        )
        return obj

    def _customer(self, name, account, address, contact, phone, gps):
        obj, _ = Customer.objects.get_or_create(
            account_number=account,
            defaults={
                "name": name,
                "delivery_address": address,
                "contact_name": contact,
                "phone": phone,
                "ghana_post_gps": gps,
            },
        )
        return obj

    def _vehicle(self, reg, company="Safisana Ghana"):
        obj, _ = Vehicle.objects.get_or_create(
            registration_number=reg, defaults={"transport_company": company}
        )
        return obj

    def _paper(self, customer, author):
        return {
            "deliver_to": customer.name,
            "delivery_contact_name": customer.contact_name,
            "delivery_address_text": customer.delivery_address,
            "contact_phone": customer.phone,
            "document_date": timezone.localdate(),
            "authorised_by_name": author.get_full_name(),
        }

    def _seed_waybills(self, users, products, customers, vehicles):
        now = timezone.now()

        draft = Waybill.objects.create(
            customer=customers[0],
            created_by=users["sales"],
            sales_order_ref="SO-2609-018",
            status=Waybill.Status.DRAFT,
            branch="Ashaiman Plant",
            **self._paper(customers[0], users["sales"]),
        )
        WaybillItem.objects.create(waybill=draft, product=products[1], ordered_qty=Decimal("40"))
        record_audit(draft, users["sales"], "created", to_status=draft.status)

        pending = Waybill.objects.create(
            customer=customers[1],
            created_by=users["sales"],
            sales_order_ref="SO-2609-021",
            invoice_ref="INV-4412",
            status=Waybill.Status.PENDING_APPROVAL,
            **self._paper(customers[1], users["sales"]),
        )
        WaybillItem.objects.create(waybill=pending, product=products[0], ordered_qty=Decimal("200"))
        WaybillItem.objects.create(waybill=pending, product=products[3], ordered_qty=Decimal("50"))
        record_audit(pending, users["sales"], "created", to_status=Waybill.Status.DRAFT)
        record_audit(pending, users["sales"], "submitted", Waybill.Status.DRAFT, pending.status)

        approved = Waybill.objects.create(
            customer=customers[2],
            created_by=users["sales"],
            approved_by=users["supervisor"],
            approved_at=now,
            sales_order_ref="SO-2609-022",
            status=Waybill.Status.APPROVED,
            **self._paper(customers[2], users["sales"]),
        )
        WaybillItem.objects.create(waybill=approved, product=products[0], ordered_qty=Decimal("80"))
        record_audit(approved, users["supervisor"], "approved", Waybill.Status.PENDING_APPROVAL, approved.status)

        loaded = Waybill.objects.create(
            customer=customers[3],
            created_by=users["sales"],
            approved_by=users["supervisor"],
            approved_at=now,
            warehouse_officer=users["warehouse"],
            loaded_at=now,
            driver=users["driver"],
            vehicle=vehicles[0],
            driver_phone=users["driver"].phone,
            sales_order_ref="SO-2609-024",
            status=Waybill.Status.LOADED,
            dispatched_by_name=users["warehouse"].get_full_name(),
            **self._paper(customers[3], users["sales"]),
        )
        WaybillItem.objects.create(
            waybill=loaded,
            product=products[0],
            ordered_qty=Decimal("120"),
            loaded_qty=Decimal("120"),
            batch_number="FT-2026-091",
        )
        record_audit(loaded, users["warehouse"], "loaded", Waybill.Status.APPROVED, loaded.status)

        dispatched = Waybill.objects.create(
            customer=customers[0],
            created_by=users["sales"],
            approved_by=users["supervisor"],
            approved_at=now,
            warehouse_officer=users["warehouse"],
            loaded_at=now,
            driver=users["driver"],
            vehicle=vehicles[0],
            driver_phone=users["driver"].phone,
            sales_order_ref="SO-2609-025",
            invoice_ref="INV-4418",
            status=Waybill.Status.IN_TRANSIT,
            dispatch_at=now,
            dispatch_lat=Decimal("5.677400"),
            dispatch_lng=Decimal("0.033200"),
            dispatch_gps_accuracy=8.0,
            dispatched_by_name=users["warehouse"].get_full_name(),
            **self._paper(customers[0], users["sales"]),
        )
        WaybillItem.objects.create(
            waybill=dispatched,
            product=products[1],
            ordered_qty=Decimal("60"),
            loaded_qty=Decimal("60"),
            batch_number="FT-2026-088",
        )
        record_audit(dispatched, users["warehouse"], "dispatched", Waybill.Status.LOADED, Waybill.Status.DISPATCHED)
        record_audit(dispatched, users["driver"], "in_transit", Waybill.Status.DISPATCHED, dispatched.status)

        delivered = Waybill.objects.create(
            customer=customers[1],
            created_by=users["sales"],
            approved_by=users["supervisor"],
            approved_at=now,
            warehouse_officer=users["warehouse"],
            loaded_at=now,
            driver=users["driver2"],
            vehicle=vehicles[1],
            driver_phone=users["driver2"].phone,
            sales_order_ref="SO-2609-011",
            invoice_ref="INV-4390",
            status=Waybill.Status.DELIVERED,
            dispatch_at=now,
            delivery_at=now,
            delivery_device_at=now,
            delivery_lat=Decimal("5.614100"),
            delivery_lng=Decimal("-0.018000"),
            delivery_gps_accuracy=6.4,
            customer_rep_name="Joseph Tetteh",
            customer_rep_role="Warehouse supervisor",
            delivery_notes="All bags received dry and sealed.",
            dispatched_by_name=users["warehouse"].get_full_name(),
            **self._paper(customers[1], users["sales"]),
        )
        WaybillItem.objects.create(
            waybill=delivered,
            product=products[0],
            ordered_qty=Decimal("150"),
            loaded_qty=Decimal("150"),
            delivered_qty=Decimal("150"),
            batch_number="FT-2026-074",
        )
        record_audit(delivered, users["driver2"], "completed", Waybill.Status.IN_TRANSIT, delivered.status)
        generate_waybill_pdf(delivered)
