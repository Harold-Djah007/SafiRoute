"""Encrypted logical backups (JSON fixtures + media) using Fernet."""

from __future__ import annotations

import gzip
import json
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.core.files.storage import default_storage
from io import StringIO

BACKUP_VERSION = 1
APPS_TO_DUMP = ["waybills", "authtoken"]


def backup_key() -> bytes:
    raw = (getattr(settings, "BACKUP_ENCRYPTION_KEY", "") or "").strip()
    if not raw:
        raise CommandError(
            "Set BACKUP_ENCRYPTION_KEY to a Fernet key before backup/restore. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return raw.encode("utf-8")


def fernet() -> Fernet:
    try:
        return Fernet(backup_key())
    except ValueError as exc:
        raise CommandError("BACKUP_ENCRYPTION_KEY is not a valid Fernet key.") from exc


def collect_media() -> dict[str, str]:
    import base64

    root = Path(settings.MEDIA_ROOT)
    files: dict[str, str] = {}
    if not root.exists():
        return files
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        files[rel] = base64.b64encode(path.read_bytes()).decode("ascii")
    return files


def write_media(files: dict[str, str]) -> int:
    import base64

    root = Path(settings.MEDIA_ROOT)
    written = 0
    for rel, encoded in (files or {}).items():
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(base64.b64decode(encoded))
        written += 1
    return written


def build_payload() -> dict:
    buf = StringIO()
    call_command("dumpdata", *APPS_TO_DUMP, indent=2, stdout=buf, natural_foreign=True)
    return {
        "version": BACKUP_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "fixtures": json.loads(buf.getvalue() or "[]"),
        "media": collect_media(),
        "default_storage": default_storage.__class__.__name__,
    }


def encrypt_payload(payload: dict) -> bytes:
    raw = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
    return fernet().encrypt(gzip.compress(raw, compresslevel=9))


def decrypt_payload(blob: bytes) -> dict:
    if not blob:
        raise CommandError("Backup file is empty.")
    try:
        raw = gzip.decompress(fernet().decrypt(blob))
    except InvalidToken as exc:
        raise CommandError("Could not decrypt backup. Wrong BACKUP_ENCRYPTION_KEY or file is not a SafiRoute backup.") from exc
    except OSError as exc:
        raise CommandError("Backup file is truncated or not valid gzip after decrypt.") from exc
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise CommandError("Backup decrypted but JSON is invalid.") from exc
    if not isinstance(payload, dict) or payload.get("version") != BACKUP_VERSION:
        raise CommandError("Backup version is not recognised.")
    if "fixtures" not in payload:
        raise CommandError("Backup is missing fixtures.")
    return payload


def normalise_legacy_fixtures(fixtures: list[dict]) -> list[dict]:
    """Make pre-Sales-only backups loadable after the workflow simplification."""

    retired_waybill_fields = {
        "approved_by",
        "approved_at",
        "warehouse_officer",
        "loaded_at",
        "driver",
        "vehicle",
        "driver_phone",
        "dispatch_at",
        "dispatch_lat",
        "dispatch_lng",
        "dispatch_gps_accuracy",
        "customer_rep_role",
        "failure_reason",
        "cancellation_reason",
    }
    retired_item_fields = {
        "sku",
        "unit_of_measure",
        "ordered_qty",
        "loaded_qty",
        "delivered_qty",
        "rejected_qty",
        "batch_number",
    }
    status_map = {
        "pending_approval": "draft",
        "approved": "draft",
        "loaded": "draft",
        "dispatched": "draft",
        "in_transit": "draft",
        "delivered": "completed",
        "partially_delivered": "completed",
        "delivery_failed": "completed",
        "cancelled": "voided",
    }

    normalised = []
    for entry in fixtures or []:
        if not isinstance(entry, dict):
            continue
        model = entry.get("model")
        if model == "waybills.vehicle":
            continue

        item = dict(entry)
        fields = dict(item.get("fields") or {})

        if model == "waybills.user":
            if fields.get("role") in {"supervisor", "warehouse", "driver", "finance"}:
                fields["role"] = "sales"
                fields["is_active"] = False

        elif model == "waybills.waybill":
            if "driver_signature" in fields and "dispatched_signature" not in fields:
                fields["dispatched_signature"] = fields.pop("driver_signature")
            if "customer_rep_name" in fields and "received_by_name" not in fields:
                fields["received_by_name"] = fields.pop("customer_rep_name")
            fields["status"] = status_map.get(fields.get("status"), fields.get("status"))
            for key in retired_waybill_fields:
                fields.pop(key, None)

        elif model == "waybills.waybillitem":
            notes = (fields.get("notes") or "").strip()
            extras = []
            qty = fields.get("ordered_qty")
            if qty not in (None, "", "0", "0.0", "0.00", 0):
                extras.append(f"Qty: {qty}")
            batch = fields.get("batch_number")
            if batch:
                extras.append(f"Batch: {batch}")
            if extras:
                fields["notes"] = " · ".join(part for part in [notes, *extras] if part)[:240]
            for key in retired_item_fields:
                fields.pop(key, None)

        item["fields"] = fields
        normalised.append(item)
    return normalised


def write_encrypted_backup(destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    blob = encrypt_payload(build_payload())
    destination.write_bytes(blob)
    return destination


def restore_encrypted_backup(source: Path, *, replace: bool = True) -> dict:
    if not source.exists():
        raise CommandError(f"Backup file not found: {source}")
    payload = decrypt_payload(source.read_bytes())
    if replace:
        from waybills.models import (
            AuditLog,
            Customer,
            Product,
            Waybill,
            WaybillItem,
            WaybillPhoto,
        )

        from rest_framework.authtoken.models import Token

        WaybillPhoto.objects.all().delete()
        WaybillItem.objects.all().delete()
        AuditLog.objects.all().delete()
        Waybill.objects.all().delete()
        Customer.objects.all().delete()
        Product.objects.all().delete()
        Token.objects.all().delete()
    fixture_path = source.with_suffix(".restore.json")
    try:
        fixture_path.write_text(json.dumps(normalise_legacy_fixtures(payload["fixtures"])), encoding="utf-8")
        call_command("loaddata", str(fixture_path))
    finally:
        if fixture_path.exists():
            fixture_path.unlink()
    media_count = write_media(payload.get("media") or {})
    return {
        "created_at": payload.get("created_at"),
        "fixture_count": len(payload.get("fixtures") or []),
        "media_count": media_count,
    }
