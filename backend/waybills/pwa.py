"""Accept completed sales pads from the offline PWA without a phone login."""

from __future__ import annotations

import base64
from decimal import Decimal, InvalidOperation
from uuid import UUID

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Customer, User, Vehicle, Waybill, WaybillItem, WaybillPhoto, record_audit
from .pdf import generate_waybill_pdf

PWA_USERNAME = "pwa-ingest"


def ingest_user():
    user, created = User.objects.get_or_create(
        username=PWA_USERNAME,
        defaults={
            "first_name": "Phone",
            "last_name": "Pad",
            "role": User.Role.SALES,
            "is_active": True,
        },
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])
    return user


def require_ingest_token(request):
    expected = (getattr(settings, "PWA_INGEST_TOKEN", "") or "").strip()
    if not expected:
        return
    provided = request.headers.get("X-SafiRoute-Ingest", "").strip()
    if provided != expected:
        raise PermissionDenied("Ingest token was not accepted.")


def data_url_file(value, filename):
    if not value or not isinstance(value, str):
        return None
    if not value.startswith("data:") or "," not in value:
        return None
    header, payload = value.split(",", 1)
    try:
        raw = base64.b64decode(payload)
    except (ValueError, TypeError) as exc:
        raise ValidationError({"detail": f"Could not read {filename}."}) from exc
    if not raw:
        return None
    ext = "png"
    lower = header.lower()
    if "jpeg" in lower or "jpg" in lower:
        ext = "jpg"
    elif "webp" in lower:
        ext = "webp"
    return ContentFile(raw, name=f"{filename}.{ext}")


def parse_qty(value):
    if value in (None, ""):
        raise ValidationError({"items": "Quantity is required."})
    try:
        qty = Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValidationError({"items": f"Invalid quantity: {value}"}) from exc
    if qty <= 0:
        raise ValidationError({"items": "Quantity must be greater than zero."})
    return qty


def parse_client_uuid(value):
    try:
        return UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValidationError({"client_uuid": "A valid client UUID is required."}) from exc


def _optional_decimal(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValidationError({"detail": f"Invalid number: {value}"}) from exc


@transaction.atomic
def ingest_completed_waybill(data, request=None):
    uid = parse_client_uuid(data.get("client_uuid"))
    existing = Waybill.objects.filter(client_uuid=uid).first()
    if existing:
        return existing, True

    deliver_to = (data.get("deliver_to") or "").strip()
    if not deliver_to:
        raise ValidationError({"deliver_to": "Deliver to is required."})

    raw_items = data.get("items") or []
    if not isinstance(raw_items, list):
        raise ValidationError({"items": "items must be an array."})
    lines = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        name = (item.get("product_name") or "").strip()
        qty = item.get("ordered_qty")
        if not name and qty in (None, ""):
            continue
        if not name:
            raise ValidationError({"items": "Each line needs a description."})
        lines.append(
            {
                "product_name": name[:200],
                "ordered_qty": parse_qty(qty),
                "notes": (item.get("notes") or "")[:240],
            }
        )
    if not lines:
        raise ValidationError({"items": "Add at least one description line."})

    actor = ingest_user()
    stamp = timezone.now().strftime("%y%m%d%H%M%S")
    customer = Customer.objects.filter(name__iexact=deliver_to).first()
    if customer is None:
        customer = Customer.objects.create(
            name=deliver_to[:200],
            account_number=f"PWA-{stamp}-{str(uid).split('-')[0]}",
            delivery_address=(data.get("delivery_address_text") or "")[:2000],
            contact_name=(data.get("delivery_contact_name") or "")[:160],
            phone=(data.get("contact_phone") or "")[:32],
        )

    vehicle = None
    registration = (data.get("vehicle_registration") or "").strip().upper()
    if registration:
        vehicle, _ = Vehicle.objects.get_or_create(
            registration_number=registration[:24],
            defaults={"transport_company": "Safisana Ghana", "is_active": True},
        )

    document_date = parse_date(str(data.get("document_date") or "")) or timezone.localdate()
    device_at = parse_datetime(str(data.get("device_timestamp") or "")) or timezone.now()
    lat = _optional_decimal(data.get("lat"))
    lng = _optional_decimal(data.get("lng"))

    waybill = Waybill(
        client_uuid=uid,
        customer=customer,
        created_by=actor,
        status=Waybill.Status.DELIVERED,
        sync_status=Waybill.SyncStatus.SYNCED,
        sales_order_ref=(data.get("phone_number") or "")[:64],
        deliver_to=deliver_to[:200],
        delivery_contact_name=(data.get("delivery_contact_name") or "")[:160],
        delivery_address_text=data.get("delivery_address_text") or "",
        contact_phone=(data.get("contact_phone") or "")[:32],
        document_date=document_date,
        authorised_by_name=(data.get("authorised_by_name") or data.get("operator_name") or "")[:160],
        authorised_remarks=data.get("authorised_remarks") or "",
        dispatched_by_name=(data.get("dispatched_by_name") or "")[:160],
        vehicle=vehicle,
        customer_rep_name=(data.get("received_by") or "")[:160],
        delivery_notes="Ingested from the offline sales pad.",
        delivery_at=timezone.now(),
        delivery_device_at=device_at,
        delivery_lat=lat,
        delivery_lng=lng,
        delivery_gps_accuracy=float(data["gps_accuracy"]) if data.get("gps_accuracy") not in (None, "") else None,
        gps_unavailable_reason="" if lat is not None else "Not captured on phone pad",
    )
    auth_file = data_url_file(data.get("authorised_signature"), f"auth-{uid}")
    disp_file = data_url_file(data.get("dispatched_signature"), f"disp-{uid}")
    cust_file = data_url_file(data.get("customer_signature"), f"cust-{uid}")
    if auth_file:
        waybill.authorised_signature = auth_file
    if disp_file:
        waybill.driver_signature = disp_file
    if cust_file:
        waybill.customer_signature = cust_file
    waybill.save()

    for line in lines:
        WaybillItem.objects.create(
            waybill=waybill,
            product_name=line["product_name"],
            ordered_qty=line["ordered_qty"],
            loaded_qty=line["ordered_qty"],
            delivered_qty=line["ordered_qty"],
            notes=line["notes"],
        )

    photo = data_url_file(data.get("photo"), f"photo-{uid}")
    if photo:
        WaybillPhoto.objects.create(
            waybill=waybill,
            image=photo,
            caption="Delivery photo (phone pad)",
            uploaded_by=actor,
        )

    record_audit(
        waybill,
        actor,
        "pwa_ingested",
        to_status=waybill.status,
        detail={
            "phone_number": data.get("phone_number"),
            "operator_name": data.get("operator_name"),
        },
        request=request,
        device_timestamp=device_at,
    )
    try:
        generate_waybill_pdf(waybill)
        waybill.refresh_from_db()
    except Exception:
        pass
    return waybill, False


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def pwa_ingest(request):
    require_ingest_token(request)
    waybill, duplicate = ingest_completed_waybill(request.data, request=request)
    payload = {
        "accepted": True,
        "duplicate": duplicate,
        "id": waybill.id,
        "waybill_number": waybill.waybill_number,
        "client_uuid": str(waybill.client_uuid),
        "status": waybill.status,
        "verification_token": waybill.verification_token,
    }
    return Response(payload, status=status.HTTP_200_OK if duplicate else status.HTTP_201_CREATED)
