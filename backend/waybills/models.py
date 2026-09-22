import secrets

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models, transaction
from django.utils import timezone

from .fingerprints import audit_entry_hash


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Sales Administrator"
        SALES = "sales", "Sales User"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.SALES)
    phone = models.CharField(max_length=32, blank=True)
    employee_id = models.CharField(max_length=50, blank=True)
    branch = models.CharField(max_length=120, default="Ashaiman Plant")

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"


class Customer(models.Model):
    name = models.CharField(max_length=200)
    account_number = models.CharField(max_length=40, unique=True)
    delivery_address = models.TextField()
    contact_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    ghana_post_gps = models.CharField(max_length=32, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.account_number})"


class Product(models.Model):
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=40, unique=True)
    unit_of_measure = models.CharField(max_length=24, default="bag")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} [{self.sku}]"


class Waybill(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        COMPLETED = "completed", "Completed"
        VOIDED = "voided", "Voided"

    class SyncStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        SYNCING = "syncing", "Syncing"
        SYNCED = "synced", "Synced"
        FAILED = "failed", "Failed"

    waybill_number = models.CharField(max_length=32, unique=True, editable=False)
    verification_token = models.CharField(max_length=48, unique=True, editable=False)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    sync_status = models.CharField(
        max_length=16, choices=SyncStatus.choices, default=SyncStatus.SYNCED
    )
    client_uuid = models.UUIDField(null=True, blank=True, unique=True)

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="waybills")
    sales_order_ref = models.CharField(max_length=64, blank=True)
    invoice_ref = models.CharField(max_length=64, blank=True)
    po_ref = models.CharField(max_length=64, blank=True)
    branch = models.CharField(max_length=120, default="Ashaiman Plant")

    deliver_to = models.CharField(max_length=200, blank=True)
    delivery_contact_name = models.CharField(max_length=160, blank=True)
    delivery_address_text = models.TextField(blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    document_date = models.DateField(null=True, blank=True)
    authorised_by_name = models.CharField(max_length=160, blank=True)
    authorised_remarks = models.TextField(blank=True)
    dispatched_by_name = models.CharField(max_length=160, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_waybills"
    )
    delivery_at = models.DateTimeField(null=True, blank=True)
    delivery_device_at = models.DateTimeField(null=True, blank=True)
    delivery_lat = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    delivery_lng = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    delivery_gps_accuracy = models.FloatField(null=True, blank=True)
    gps_unavailable_reason = models.CharField(max_length=240, blank=True)

    received_by_name = models.CharField(max_length=160, blank=True)
    authorised_signature = models.ImageField(upload_to="signatures/", blank=True, null=True)
    customer_signature = models.ImageField(upload_to="signatures/", blank=True, null=True)
    dispatched_signature = models.ImageField(upload_to="signatures/", blank=True, null=True)
    delivery_notes = models.TextField(blank=True)

    pdf_file = models.FileField(upload_to="waybills/", blank=True, null=True)
    pdf_version = models.PositiveIntegerField(default=0)
    document_fingerprint = models.CharField(max_length=64, blank=True)
    pdf_sha256 = models.CharField(max_length=64, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.waybill_number

    def save(self, *args, **kwargs):
        if not self.verification_token:
            self.verification_token = secrets.token_urlsafe(24)
        if not self.waybill_number:
            self.waybill_number = self._next_number()
        super().save(*args, **kwargs)

    @classmethod
    def _next_number(cls):
        year = timezone.now().year
        prefix = f"SR-{year}-"
        with transaction.atomic():
            last = (
                cls.objects.select_for_update()
                .filter(waybill_number__startswith=prefix)
                .order_by("-waybill_number")
                .first()
            )
            seq = 1
            if last:
                try:
                    seq = int(last.waybill_number.split("-")[-1]) + 1
                except ValueError:
                    seq = cls.objects.filter(waybill_number__startswith=prefix).count() + 1
            return f"{prefix}{seq:06d}"

    @property
    def is_terminal(self):
        return self.status in {self.Status.COMPLETED, self.Status.VOIDED}


class WaybillItem(models.Model):
    waybill = models.ForeignKey(Waybill, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, null=True, blank=True)
    product_name = models.CharField(max_length=200, blank=True)
    notes = models.CharField(max_length=240, blank=True)

    def save(self, *args, **kwargs):
        if self.product_id and not self.product_name:
            self.product_name = self.product.name
        super().save(*args, **kwargs)


class WaybillPhoto(models.Model):
    waybill = models.ForeignKey(Waybill, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to="photos/")
    caption = models.CharField(max_length=200, blank=True)
    captured_at = models.DateTimeField(default=timezone.now)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="uploaded_photos"
    )


class AuditLog(models.Model):
    waybill = models.ForeignKey(Waybill, on_delete=models.CASCADE, related_name="audit_logs")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="audit_events"
    )
    action = models.CharField(max_length=64)
    from_status = models.CharField(max_length=32, blank=True)
    to_status = models.CharField(max_length=32, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    device_timestamp = models.DateTimeField(null=True, blank=True)
    prev_hash = models.CharField(max_length=64, blank=True, default="")
    entry_hash = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} on {self.waybill_id} by {self.actor_id}"


def client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def record_audit(waybill, actor, action, from_status="", to_status="", detail=None, request=None, device_timestamp=None):
    last = (
        AuditLog.objects.filter(waybill=waybill)
        .exclude(entry_hash="")
        .order_by("-id")
        .first()
    )
    prev_hash = last.entry_hash if last else "0" * 64
    payload_detail = detail or {}
    entry_hash = audit_entry_hash(
        waybill_number=waybill.waybill_number,
        actor_id=actor.pk,
        action=action,
        from_status=from_status or "",
        to_status=to_status or "",
        detail=payload_detail,
        prev_hash=prev_hash,
    )
    return AuditLog.objects.create(
        waybill=waybill,
        actor=actor,
        action=action,
        from_status=from_status or "",
        to_status=to_status or "",
        detail=payload_detail,
        ip_address=client_ip(request) if request else None,
        device_timestamp=device_timestamp,
        prev_hash=prev_hash,
        entry_hash=entry_hash,
    )