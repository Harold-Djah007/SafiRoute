"""Tamper-evident PDF waybill generation for SafiRoute."""

from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone

from .fingerprints import canonical_fingerprint, sha256_bytes
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
import qrcode

FOREST = colors.HexColor("#0F5C2E")
GOLD = colors.HexColor("#C9A227")
CREAM = colors.HexColor("#F4EFE2")
INK = colors.HexColor("#1A241C")
MUTED = colors.HexColor("#5C6B61")


def _logo_path():
    candidates = [
        Path(settings.BASE_DIR).parent / "assets" / "safiroute-logo.png",
        Path(settings.BASE_DIR).parent / "assets" / "safiroute-icon.png",
        Path(settings.BASE_DIR) / ".." / "frontend" / "public" / "safiroute-logo.png",
    ]
    for path in candidates:
        if path.exists():
            return str(path.resolve())
    return None


def _qr_image(url):
    qr = qrcode.QRCode(box_size=4, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0F5C2E", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Image(buf, width=32 * mm, height=32 * mm)


def _stored_image(field, width, height):
    if not field:
        return None
    try:
        field.open("rb")
        raw = field.read()
        field.close()
        if not raw:
            return None
        return Image(BytesIO(raw), width=width, height=height, kind="proportional")
    except Exception:
        return None


def generate_waybill_pdf(waybill):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title=f"SafiRoute Waybill {waybill.waybill_number}",
        author="Safisana Ghana",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "TitleSR",
        parent=styles["Heading1"],
        textColor=FOREST,
        fontSize=16,
        spaceAfter=2,
        leading=20,
    )
    subtitle = ParagraphStyle(
        "SubSR",
        parent=styles["Normal"],
        textColor=GOLD,
        fontSize=9,
        spaceAfter=8,
    )
    label = ParagraphStyle("LabSR", parent=styles["Normal"], textColor=MUTED, fontSize=8, leading=11)
    body = ParagraphStyle("BodSR", parent=styles["Normal"], textColor=INK, fontSize=9, leading=12)
    small = ParagraphStyle("SmSR", parent=styles["Normal"], textColor=MUTED, fontSize=7.5, leading=10)

    verify_url = f"{settings.PUBLIC_BASE_URL}/verify/{waybill.verification_token}"
    fingerprint = canonical_fingerprint(waybill)
    waybill.document_fingerprint = fingerprint
    story = []

    logo = _logo_path()
    logo_cell = Image(logo, width=55 * mm, height=18 * mm, kind="proportional") if logo else Paragraph("SafiRoute", title)
    header = Table(
        [[
            logo_cell,
            [
                Paragraph("DIGITAL WAYBILL", title),
                Paragraph("Safisana Ghana · Every delivery. Verified.", subtitle),
                Paragraph(f"<b>{waybill.waybill_number}</b> · {waybill.get_status_display()}", body),
            ],
            _qr_image(verify_url),
        ]],
        colWidths=[58 * mm, 85 * mm, 35 * mm],
    )
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                ("BOX", (0, 0), (-1, -1), 0.6, GOLD),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(header)
    story.append(Spacer(1, 8))

    cust = waybill.customer
    deliver_to = waybill.deliver_to or cust.name
    contact = waybill.delivery_contact_name or cust.contact_name
    address = waybill.delivery_address_text or cust.delivery_address
    phone = waybill.contact_phone or cust.phone
    doc_date = waybill.document_date or timezone.localdate()
    meta = [
        [
            Paragraph("Deliver to / Date", label),
            Paragraph("Waybill sign-off", label),
            Paragraph("Record", label),
        ],
        [
            Paragraph(
                f"<b>{deliver_to}</b><br/>"
                f"Contact: {contact or '—'}<br/>"
                f"{address}<br/>"
                f"Phone: {phone or '—'}<br/>"
                f"Date: {doc_date.strftime('%d %b %Y')}",
                body,
            ),
            Paragraph(
                f"Authorised by: {waybill.authorised_by_name or '—'}<br/>"
                f"Dispatched by: {waybill.dispatched_by_name or '—'}<br/>"
                f"Received by: {waybill.received_by_name or '—'}<br/>"
                f"Completed: {timezone.localtime(waybill.delivery_at).strftime('%d %b %Y %H:%M') if waybill.delivery_at else '—'}",
                body,
            ),
            Paragraph(
                f"Created by: {waybill.created_by.get_full_name() or waybill.created_by.username}<br/>"
                f"Created: {timezone.localtime(waybill.created_at).strftime('%d %b %Y %H:%M')}<br/>"
                f"Status: {waybill.get_status_display()}<br/>"
                f"PDF v{waybill.pdf_version + 1}",
                body,
            ),
        ],
    ]
    meta_table = Table(meta, colWidths=[60 * mm, 60 * mm, 58 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (-1, 0), FOREST),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.4, FOREST),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D5DDD7")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 8))

    rows = [["Description", "Remarks"]]
    for item in waybill.items.all():
        desc = item.product_name or (item.product.name if item.product_id else "")
        rows.append([desc, item.notes or "—"])
    if len(rows) == 1:
        rows.append(["—", ""])
    items_table = Table(rows, colWidths=[126 * mm, 52 * mm])
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), FOREST),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#C9D4CB")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 8))

    gps = "—"
    if waybill.delivery_lat is not None and waybill.delivery_lng is not None:
        gps = f"{waybill.delivery_lat}, {waybill.delivery_lng}"
        if waybill.delivery_gps_accuracy not in (None, ""):
            gps += f" (±{float(waybill.delivery_gps_accuracy):.0f}m)"
    elif waybill.gps_unavailable_reason:
        gps = f"Unavailable — {waybill.gps_unavailable_reason}"

    story.append(Paragraph("Sign-off and delivery proof", ParagraphStyle("h2", parent=title, fontSize=11)))
    story.append(
        Paragraph(
            f"Authorised by: <b>{waybill.authorised_by_name or '—'}</b><br/>"
            f"Dispatched by: <b>{waybill.dispatched_by_name or '—'}</b><br/>"
            f"Received by: <b>{waybill.received_by_name or '—'}</b><br/>"
            f"I certify that I have received the above items.<br/>"
            f"Notes: {waybill.delivery_notes or waybill.authorised_remarks or '—'}<br/>"
            f"Delivery GPS: {gps}<br/>"
            f"Device time: {timezone.localtime(waybill.delivery_device_at).strftime('%d %b %Y %H:%M:%S') if waybill.delivery_device_at else '—'} · "
            f"Server time: {timezone.localtime(waybill.delivery_at).strftime('%d %b %Y %H:%M:%S') if waybill.delivery_at else '—'}",
            body,
        )
    )
    story.append(Spacer(1, 6))

    signature_fields = (
        (waybill.authorised_signature, "Sales / Authorised signature"),
        (waybill.dispatched_signature, "Dispatch signature"),
        (waybill.customer_signature, "Customer / Received-by signature"),
    )
    signature_cells = []
    for field, caption in signature_fields:
        cell = [Paragraph(caption, label)]
        image = _stored_image(field, 48 * mm, 19 * mm)
        cell.append(image if image else Paragraph("—", body))
        signature_cells.append(cell)
    sig_table = Table([signature_cells], colWidths=[59.3 * mm, 59.3 * mm, 59.3 * mm])
    sig_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.4, GOLD),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, GOLD),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(sig_table)
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "This document is generated by SafiRoute from server-validated waybill data. "
            "Scan the QR code to verify authenticity. Completed waybills are not silently edited; "
            "completed records remain immutable in the Sales system. "
            f"Fingerprint SHA-256: {fingerprint}. "
            f"PDF v{waybill.pdf_version + 1}. © Safisana Ghana — internal use.",
            small,
        )
    )

    def _footer(canvas, doc_):
        canvas.saveState()
        canvas.setFillColor(FOREST)
        canvas.rect(0, 0, A4[0], 14 * mm, fill=1, stroke=0)
        canvas.setFillColor(GOLD)
        canvas.rect(0, 14 * mm, A4[0], 1.2 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Courier", 6)
        canvas.drawString(16 * mm, 8 * mm, fingerprint)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(16 * mm, 3.5 * mm, "SafiRoute  ·  Every delivery. Verified.")
        canvas.drawRightString(A4[0] - 16 * mm, 3.5 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    pdf_bytes = buffer.getvalue()
    marker = b"% SafiRoute-fingerprint " + fingerprint.encode("ascii")
    if marker not in pdf_bytes and fingerprint.encode("ascii") not in pdf_bytes:
        head, _, rest = pdf_bytes.partition(b"\n")
        pdf_bytes = head + b"\n" + marker + b"\n" + rest
    waybill.pdf_version += 1
    waybill.pdf_sha256 = sha256_bytes(pdf_bytes)
    waybill.pdf_file.save(
        f"{waybill.waybill_number}.pdf",
        ContentFile(pdf_bytes),
        save=False,
    )
    waybill.save(
        update_fields=["pdf_file", "pdf_version", "document_fingerprint", "pdf_sha256", "updated_at"]
    )
    return waybill.pdf_file
