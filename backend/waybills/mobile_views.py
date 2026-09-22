"""Sales-phone completion endpoint for the offline SafiRoute PWA.

The sales pad is deliberately local-first. A completed waybill remains on the
phone until this authenticated endpoint accepts its client UUID. Replaying the
same UUID is safe and returns the original server record instead of creating a
duplicate.
"""

from __future__ import annotations

import base64
from decimal import Decimal, InvalidOperation
from uuid import UUID

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Customer, User, Waybill, WaybillItem, WaybillPhoto, record_audit
from .pdf import generate_waybill_pdf


def _client_uuid(value):
    try:
        return UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValidationError({"client_uuid": "A valid client UUID is required."}) from exc


def _quantity(value):
    # The physical Safisana waybill does not have a separate quantity column.
    # When Sales writes the quantity as part of the description, retain one
    # logical line item server-side instead of forcing an extra phone field.
    if value in (None, ""):
        return Decimal("1")
    try:
        qty = Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValidationError({"items": f"Invalid quantity: {value}"}) from exc
    if qty <= 0:
        raise ValidationError({"items": "Quantity must be greater than zero."})
    return qty


def _optional_decimal(value, field):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValidationError({field: "Enter a valid number."}) from exc


def _data_url_file(value, filename):
    if not value:
        return None
    if not isinstance(value, str) or not value.startswith("data:") or "," not in value:
        raise ValidationError({filename: "Expected an image captured by the SafiRoute phone app."})
    header, payload = value.split(",", 1)
    try:
        raw = base64.b64decode(payload, validate=True)
    except (ValueError, TypeError) as exc:
        raise ValidationError({filename: "Could not read the captured image."}) from exc
    if not raw:
        return None
    if len(raw) > 12 * 1024 * 1024:
        raise ValidationError({filename: "Captured image is too large."})
    header = header.lower()
    if "jpeg" in header or "jpg" in header:
        ext = "jpg"
    elif "webp" in header:
        ext = "webp"
    else:
        ext = "png"
    return ContentFile(raw, name=f"{filename}.{ext}")


def _response(waybill, duplicate=False):
    return {
        "accepted": True,
        "duplicate": duplicate,
        "id": waybill.pk,
        "waybill_number": waybill.waybill_number,
        "client_uuid": str(waybill.client_uuid),
        "status": waybill.status,
        "verification_token": waybill.verification_token,
    }


@transaction.atomic
def _ingest_sales_waybill(request):
    if request.user.role not in {User.Role.SALES, User.Role.ADMIN}:
        raise PermissionDenied("The mobile waybill pad is for Sales users.")

    data = request.data
    uid = _client_uuid(data.get("client_uuid"))
    existing = Waybill.objects.select_for_update().filter(client_uuid=uid).first()
    if existing:
        if existing.created_by_id != request.user.id and request.user.role != User.Role.ADMIN:
            raise PermissionDenied("This phone waybill belongs to another SafiRoute user.")
        return existing, True

    deliver_to = (data.get("deliver_to") or "").strip()
    address = (data.get("delivery_address_text") or "").strip()
    authorised_by = (data.get("authorised_by_name") or "").strip()
    dispatched_by = (data.get("dispatched_by_name") or "").strip()
    received_by = (data.get("received_by") or "").strip()
    gps_reason = (data.get("gps_unavailable_reason") or "").strip()

    required = {
        "deliver_to": deliver_to,
        "delivery_address_text": address,
        "authorised_by_name": authorised_by,
        "dispatched_by_name": dispatched_by,
        "received_by": received_by,
    }
    missing = [key for key, value in required.items() if not value]
    if missing:
        raise ValidationError({"detail": f"Missing required mobile waybill fields: {', '.join(missing)}."})

    raw_items = data.get("items") or []
    if not isinstance(raw_items, list):
        raise ValidationError({"items": "items must be an array."})
    lines = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        description = (raw.get("product_name") or "").strip()
        qty_value = raw.get("ordered_qty")
        if not description and qty_value in (None, ""):
            continue
        if not description:
            raise ValidationError({"items": "Each line needs a description."})
        lines.append(
            {
                "product_name": description[:200],
                "ordered_qty": _quantity(qty_value),
                "notes": (raw.get("notes") or "")[:240],
            }
        )
    if not lines:
        raise ValidationError({"items": "Add at least one description line."})

    authorised_signature = _data_url_file(data.get("authorised_signature"), f"sales-{uid}")
    dispatch_signature = _data_url_file(data.get("dispatched_signature"), f"dispatch-{uid}")
    customer_signature = _data_url_file(data.get("customer_signature"), f"customer-{uid}")
    photo = _data_url_file(data.get("photo"), f"delivery-{uid}")
    if not authorised_signature or not dispatch_signature or not customer_signature:
        raise ValidationError({"detail": "Authorised, Dispatch, and Received signatures are required."})

    # GPS and photos remain supported digital proof, but they are optional so
    # the phone form can stay faithful to the Safisana paper waybill.
    lat = _optional_decimal(data.get("lat"), "lat")
    lng = _optional_decimal(data.get("lng"), "lng")

    customer = Customer.objects.filter(name__iexact=deliver_to).first()
    if customer is None:
        customer = Customer.objects.create(
            name=deliver_to[:200],
            account_number=f"MOB-{str(uid).split('-')[0].upper()}",
            delivery_address=address,
            contact_name=(data.get("delivery_contact_name") or "")[:120],
            phone=(data.get("contact_phone") or "")[:32],
        )

    device_timestamp = parse_datetime(str(data.get("device_timestamp") or "")) or timezone.now()
    document_date = parse_date(str(data.get("document_date") or "")) or timezone.localdate()

    waybill = Waybill(
        client_uuid=uid,
        customer=customer,
        created_by=request.user,
        status=Waybill.Status.COMPLETED,
        sync_status=Waybill.SyncStatus.SYNCED,
        sales_order_ref=(data.get("phone_number") or "")[:64],
        deliver_to=deliver_to[:200],
        delivery_contact_name=(data.get("delivery_contact_name") or "")[:160],
        delivery_address_text=address,
        contact_phone=(data.get("contact_phone") or "")[:32],
        document_date=document_date,
        authorised_by_name=authorised_by[:160],
        authorised_remarks=data.get("authorised_remarks") or "",
        dispatched_by_name=dispatched_by[:160],
        customer_rep_name=received_by[:160],
        delivery_notes=data.get("delivery_notes") or "",
        delivery_at=timezone.now(),
        delivery_device_at=device_timestamp,
        delivery_lat=lat,
        delivery_lng=lng,
        delivery_gps_accuracy=float(data["gps_accuracy"]) if data.get("gps_accuracy") not in (None, "") else None,
        gps_unavailable_reason=gps_reason[:240],
    )
    waybill.authorised_signature = authorised_signature
    waybill.dispatched_signature = dispatch_signature
    waybill.customer_signature = customer_signature
    waybill.save()

    for line in lines:
        WaybillItem.objects.create(
            waybill=waybill,
            product_name=line["product_name"],
            ordered_qty=line["ordered_qty"],
            notes=line["notes"],
        )

    if photo:
        WaybillPhoto.objects.create(
            waybill=waybill,
            image=photo,
            caption="Delivery photo captured on SafiRoute Sales",
            uploaded_by=request.user,
        )

    record_audit(
        waybill,
        request.user,
        "mobile_sales_completed",
        to_status=waybill.status,
        detail={
            "client_uuid": str(uid),
            "phone_number": data.get("phone_number"),
            "source": "sales_pwa",
        },
        request=request,
        device_timestamp=device_timestamp,
    )
    generate_waybill_pdf(waybill)
    waybill.refresh_from_db()
    return waybill, False


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mobile_waybill_ingest(request):
    """Accept one completed Sales-phone waybill exactly once."""

    waybill, duplicate = _ingest_sales_waybill(request)
    return Response(
        _response(waybill, duplicate),
        status=status.HTTP_200_OK if duplicate else status.HTTP_201_CREATED,
    )
