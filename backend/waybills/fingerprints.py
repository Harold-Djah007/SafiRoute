"""Canonical waybill fingerprints and stored-PDF integrity hashes."""

from __future__ import annotations

import hashlib
import json

from django.core.files.base import File


def _qty(value):
    if value is None:
        return None
    return str(value)


def canonical_payload(waybill) -> dict:
    items = [
        {
            "description": item.product_name,
            "remarks": item.notes,
        }
        for item in waybill.items.all().order_by("id")
    ]
    return {
        "waybill_number": waybill.waybill_number,
        "status": waybill.status,
        "deliver_to": waybill.deliver_to or (waybill.customer.name if waybill.customer_id else ""),
        "delivery_contact_name": waybill.delivery_contact_name,
        "delivery_address_text": waybill.delivery_address_text,
        "contact_phone": waybill.contact_phone,
        "document_date": str(waybill.document_date or ""),
        "authorised_by_name": waybill.authorised_by_name,
        "authorised_remarks": waybill.authorised_remarks,
        "dispatched_by_name": waybill.dispatched_by_name,
        "received_by": waybill.customer_rep_name,
        "delivery_notes": waybill.delivery_notes,
        "delivery_lat": _qty(waybill.delivery_lat),
        "delivery_lng": _qty(waybill.delivery_lng),
        "verification_token": waybill.verification_token,
        "items": items,
    }


def canonical_fingerprint(waybill) -> str:
    blob = json.dumps(canonical_payload(waybill), sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(file_field) -> str:
    if not file_field:
        return ""
    file_field.open("rb")
    try:
        digest = hashlib.sha256()
        for chunk in file_field.chunks():
            digest.update(chunk)
        return digest.hexdigest()
    finally:
        file_field.close()


def pdf_matches_stored_hash(waybill) -> tuple[bool, str]:
    if not waybill.pdf_file:
        return False, "no-pdf"
    if not waybill.pdf_sha256:
        return False, "no-stored-hash"
    digest = sha256_file(waybill.pdf_file)
    if digest != waybill.pdf_sha256:
        return False, digest
    return True, digest


def audit_entry_hash(*, waybill_number: str, actor_id: int, action: str, from_status: str, to_status: str, detail, prev_hash: str) -> str:
    payload = {
        "waybill_number": waybill_number,
        "actor_id": actor_id,
        "action": action,
        "from_status": from_status or "",
        "to_status": to_status or "",
        "detail": detail or {},
        "prev_hash": prev_hash,
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def verify_audit_chain(waybill) -> tuple[bool, str]:
    expected_prev = "0" * 64
    for entry in waybill.audit_logs.order_by("id"):
        if entry.prev_hash != expected_prev:
            return False, f"prev_hash mismatch on audit {entry.id}"
        recomputed = audit_entry_hash(
            waybill_number=waybill.waybill_number,
            actor_id=entry.actor_id,
            action=entry.action,
            from_status=entry.from_status,
            to_status=entry.to_status,
            detail=entry.detail,
            prev_hash=entry.prev_hash,
        )
        if entry.entry_hash != recomputed:
            return False, f"entry_hash mismatch on audit {entry.id}"
        expected_prev = entry.entry_hash
    return True, "ok"


def as_content_file(data: bytes, name: str) -> File:
    from django.core.files.base import ContentFile

    return ContentFile(data, name=name)
