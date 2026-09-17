import json
from decimal import Decimal, InvalidOperation

from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .models import (
    Customer,
    Product,
    User,
    Vehicle,
    Waybill,
    WaybillPhoto,
    record_audit,
)
from .pdf import generate_waybill_pdf
from .fingerprints import pdf_matches_stored_hash
from .permissions import (
    HasWaybillAccess,
    can_approve,
    can_cancel,
    can_create,
    can_deliver,
    can_dispatch,
    can_load,
)
from .serializers import (
    CustomerSerializer,
    ProductSerializer,
    UserSerializer,
    VehicleSerializer,
    WaybillListSerializer,
    WaybillSerializer,
)


class LoginRateThrottle(SimpleRateThrottle):
    """Limit credential guessing by source address on every login endpoint."""

    scope = "login"
    rate = "10/min"

    def get_cache_key(self, request, view):
        ident = request.META.get("REMOTE_ADDR") or self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


def _as_list(value):
    if value is None or value == "":
        return []
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValidationError({"detail": "items must be a JSON array."}) from exc
        return parsed
    return value


def _optional_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"detail": f"Invalid number: {value}"}) from exc


def _qty(value, default=None):
    if value is None or value == "":
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValidationError({"detail": f"Invalid quantity: {value}"}) from exc


def _require_transition(waybill, allowed):
    if waybill.status not in allowed:
        raise ValidationError(
            {
                "detail": f"Cannot perform this action from status '{waybill.get_status_display()}'.",
                "status": waybill.status,
            }
        )


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(_request):
    return Response({"ok": True, "service": "SafiRoute", "tagline": "Every delivery. Verified."})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def csrf_token(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def login(request):
    user = authenticate(
        username=request.data.get("username"),
        password=request.data.get("password"),
    )
    if not user or not user.is_active:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)
    django_login(request, user)
    return Response(
        {
            "ok": True,
            "session": True,
            "user": UserSerializer(user).data,
        }
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def token_login(request):
    """Issue API tokens for trusted scripts without exposing them to browser session login."""

    user = authenticate(
        username=request.data.get("username"),
        password=request.data.get("password"),
    )
    if not user or not user.is_active:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    django_logout(request)
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def verify_waybill(request, token):
    waybill = get_object_or_404(Waybill, verification_token=token)
    payload = {
        "valid": True,
        "authentic": True,
        "issuer": "Safisana Ghana Limited",
        "waybill_number": waybill.waybill_number,
        "status": waybill.status,
        "status_display": waybill.get_status_display(),
        "customer": waybill.customer.name,
        "deliver_to": waybill.deliver_to or waybill.customer.name,
        "delivery_contact_name": waybill.delivery_contact_name or waybill.customer.contact_name,
        "contact_phone": waybill.contact_phone or waybill.customer.phone,
        "branch": waybill.branch,
        "created_at": waybill.created_at,
        "dispatch_at": waybill.dispatch_at,
        "delivery_at": waybill.delivery_at,
        "pdf_version": waybill.pdf_version,
        "item_count": waybill.items.count(),
        "has_customer_signature": bool(waybill.customer_signature),
        "has_driver_signature": bool(waybill.driver_signature),
        "has_gps": waybill.delivery_lat is not None and waybill.delivery_lng is not None,
        "photo_count": waybill.photos.count(),
        "document_fingerprint": waybill.document_fingerprint,
        "pdf_sha256": waybill.pdf_sha256,
        "pdf_integrity_ok": pdf_matches_stored_hash(waybill)[0] if waybill.pdf_file else None,
    }
    return Response(payload)


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    search_fields = ["name", "account_number", "phone"]
    filterset_fields = ["is_active"]


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    search_fields = ["name", "sku"]
    filterset_fields = ["is_active"]


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer
    search_fields = ["registration_number", "transport_company"]
    filterset_fields = ["is_active"]


class DriverViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserSerializer

    def get_queryset(self):
        return User.objects.filter(role=User.Role.DRIVER, is_active=True).order_by("first_name")


class WaybillViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasWaybillAccess]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = [
        "waybill_number",
        "sales_order_ref",
        "invoice_ref",
        "po_ref",
        "deliver_to",
        "delivery_contact_name",
        "contact_phone",
        "customer__name",
        "customer__account_number",
        "driver__first_name",
        "driver__last_name",
        "vehicle__registration_number",
    ]
    filterset_fields = ["status", "sync_status", "branch", "driver", "customer"]
    ordering_fields = ["created_at", "updated_at", "dispatch_at", "delivery_at"]

    def get_queryset(self):
        qs = Waybill.objects.select_related(
            "customer", "driver", "vehicle", "created_by", "approved_by"
        ).prefetch_related("items", "photos", "audit_logs")
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
        if user.role == User.Role.DRIVER:
            qs = qs.filter(driver=user)
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return WaybillListSerializer
        return WaybillSerializer

    def perform_create(self, serializer):
        if not can_create(self.request.user):
            raise PermissionDenied("Only sales officers can create waybills.")
        waybill = serializer.save(created_by=self.request.user, status=Waybill.Status.DRAFT)
        record_audit(
            waybill,
            self.request.user,
            "created",
            to_status=waybill.status,
            request=self.request,
        )

    def perform_update(self, serializer):
        waybill = self.get_object()
        if waybill.status != Waybill.Status.DRAFT:
            raise ValidationError({"detail": "Only draft waybills can be edited. Use an amendment for completed records."})
        if not can_create(self.request.user):
            raise PermissionDenied()
        serializer.save()
        record_audit(waybill, self.request.user, "updated", request=self.request)

    def perform_destroy(self, instance):
        raise PermissionDenied("Waybills cannot be deleted. Cancel them instead.")

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        qs = self.get_queryset()
        counts = qs.aggregate(
            total=Count("id"),
            draft=Count("id", filter=Q(status=Waybill.Status.DRAFT)),
            pending_approval=Count("id", filter=Q(status=Waybill.Status.PENDING_APPROVAL)),
            approved=Count("id", filter=Q(status=Waybill.Status.APPROVED)),
            loaded=Count("id", filter=Q(status=Waybill.Status.LOADED)),
            dispatched=Count("id", filter=Q(status=Waybill.Status.DISPATCHED)),
            in_transit=Count("id", filter=Q(status=Waybill.Status.IN_TRANSIT)),
            delivered=Count("id", filter=Q(status=Waybill.Status.DELIVERED)),
            partially_delivered=Count("id", filter=Q(status=Waybill.Status.PARTIALLY_DELIVERED)),
            delivery_failed=Count("id", filter=Q(status=Waybill.Status.DELIVERY_FAILED)),
            cancelled=Count("id", filter=Q(status=Waybill.Status.CANCELLED)),
        )
        today = timezone.localdate()
        today_qs = qs.filter(created_at__date=today)
        recent = WaybillListSerializer(qs[:8], many=True, context={"request": request}).data
        awaiting = WaybillListSerializer(
            qs.filter(status=Waybill.Status.PENDING_APPROVAL)[:8],
            many=True,
            context={"request": request},
        ).data
        in_field = WaybillListSerializer(
            qs.filter(
                status__in=[
                    Waybill.Status.LOADED,
                    Waybill.Status.DISPATCHED,
                    Waybill.Status.IN_TRANSIT,
                ]
            )[:8],
            many=True,
            context={"request": request},
        ).data
        return Response(
            {
                "counts": counts,
                "today": {
                    "created": today_qs.count(),
                    "delivered": today_qs.filter(
                        status__in=[Waybill.Status.DELIVERED, Waybill.Status.PARTIALLY_DELIVERED]
                    ).count(),
                    "in_field": qs.filter(
                        status__in=[
                            Waybill.Status.DISPATCHED,
                            Waybill.Status.IN_TRANSIT,
                            Waybill.Status.LOADED,
                        ]
                    ).count(),
                },
                "recent": recent,
                "awaiting": awaiting,
                "in_field": in_field,
                "user": UserSerializer(request.user).data,
            }
        )

    @action(detail=False, methods=["get"])
    def field_pack(self, request):
        qs = self.get_queryset().filter(
            status__in=[
                Waybill.Status.LOADED,
                Waybill.Status.DISPATCHED,
                Waybill.Status.IN_TRANSIT,
            ]
        )
        if request.user.role == User.Role.DRIVER:
            qs = qs.filter(driver=request.user)
        payload = WaybillSerializer(qs, many=True, context={"request": request}).data
        return Response(
            {
                "downloaded_at": timezone.now(),
                "count": len(payload),
                "waybills": payload,
                "hint": "Keep this pack on the device. Completions queue until 4G returns.",
            }
        )

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        waybill = self.get_object()
        if not can_create(request.user):
            raise PermissionDenied()
        _require_transition(waybill, {Waybill.Status.DRAFT})
        if not waybill.items.exists():
            raise ValidationError({"detail": "Add at least one product line before submitting."})
        previous = waybill.status
        waybill.status = Waybill.Status.PENDING_APPROVAL
        waybill.save(update_fields=["status", "updated_at"])
        record_audit(waybill, request.user, "submitted", previous, waybill.status, request=request)
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        waybill = self.get_object()
        if not can_approve(request.user):
            raise PermissionDenied("Only supervisors can approve waybills.")
        _require_transition(waybill, {Waybill.Status.PENDING_APPROVAL})
        previous = waybill.status
        waybill.status = Waybill.Status.APPROVED
        waybill.approved_by = request.user
        waybill.approved_at = timezone.now()
        waybill.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        record_audit(waybill, request.user, "approved", previous, waybill.status, request=request)
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        waybill = self.get_object()
        if not can_approve(request.user):
            raise PermissionDenied()
        _require_transition(waybill, {Waybill.Status.PENDING_APPROVAL})
        reason = request.data.get("reason", "").strip()
        if not reason:
            raise ValidationError({"detail": "A rejection reason is required."})
        previous = waybill.status
        waybill.status = Waybill.Status.DRAFT
        waybill.save(update_fields=["status", "updated_at"])
        record_audit(
            waybill,
            request.user,
            "rejected",
            previous,
            waybill.status,
            detail={"reason": reason},
            request=request,
        )
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def load(self, request, pk=None):
        waybill = self.get_object()
        if not can_load(request.user):
            raise PermissionDenied("Only warehouse officers can confirm loading.")
        _require_transition(waybill, {Waybill.Status.APPROVED})
        items = _as_list(request.data.get("items"))
        item_map = {item.id: item for item in waybill.items.all()}
        for payload in items:
            item = item_map.get(int(payload.get("id", 0)))
            if not item:
                continue
            item.loaded_qty = _qty(payload.get("loaded_qty"), item.ordered_qty)
            item.batch_number = payload.get("batch_number", item.batch_number)
            item.save()
        for item in waybill.items.all():
            if item.loaded_qty is None:
                item.loaded_qty = item.ordered_qty
                item.save(update_fields=["loaded_qty"])
        previous = waybill.status
        waybill.status = Waybill.Status.LOADED
        waybill.warehouse_officer = request.user
        waybill.loaded_at = timezone.now()
        waybill.save(update_fields=["status", "warehouse_officer", "loaded_at", "updated_at"])
        record_audit(waybill, request.user, "loaded", previous, waybill.status, request=request)
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="dispatch")
    def dispatch_waybill(self, request, pk=None):
        waybill = self.get_object()
        if not can_dispatch(request.user):
            raise PermissionDenied()
        _require_transition(waybill, {Waybill.Status.LOADED, Waybill.Status.APPROVED})
        driver_id = request.data.get("driver_id") or request.data.get("driver")
        vehicle_id = request.data.get("vehicle_id") or request.data.get("vehicle")
        if not driver_id or not vehicle_id:
            raise ValidationError({"detail": "Driver and vehicle are required before dispatch."})
        driver = get_object_or_404(User, pk=driver_id, role=User.Role.DRIVER, is_active=True)
        vehicle = get_object_or_404(Vehicle, pk=vehicle_id, is_active=True)
        previous = waybill.status
        waybill.status = Waybill.Status.DISPATCHED
        waybill.driver = driver
        waybill.vehicle = vehicle
        waybill.dispatch_at = timezone.now()
        waybill.save(update_fields=["status", "driver", "vehicle", "dispatch_at", "updated_at"])
        record_audit(waybill, request.user, "dispatched", previous, waybill.status, request=request)
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        waybill = self.get_object()
        if not can_cancel(request.user):
            raise PermissionDenied()
        if waybill.status in {Waybill.Status.DELIVERED, Waybill.Status.PARTIALLY_DELIVERED, Waybill.Status.CANCELLED}:
            raise ValidationError({"detail": "This waybill can no longer be cancelled."})
        reason = request.data.get("reason", "").strip()
        if not reason:
            raise ValidationError({"detail": "A cancellation reason is required."})
        previous = waybill.status
        waybill.status = Waybill.Status.CANCELLED
        waybill.save(update_fields=["status", "updated_at"])
        record_audit(
            waybill,
            request.user,
            "cancelled",
            previous,
            waybill.status,
            detail={"reason": reason},
            request=request,
        )
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def deliver(self, request, pk=None):
        waybill = self.get_object()
        if not can_deliver(request.user, waybill):
            raise PermissionDenied("Only the assigned driver can complete this delivery.")
        if waybill.status in {Waybill.Status.DELIVERED, Waybill.Status.PARTIALLY_DELIVERED, Waybill.Status.DELIVERY_FAILED}:
            if request.data.get("client_uuid") and str(waybill.delivery_client_uuid or "") == str(request.data.get("client_uuid")):
                return Response(WaybillSerializer(waybill, context={"request": request}).data)
            raise ValidationError({"detail": "Delivery is already completed."})
        _require_transition(waybill, {Waybill.Status.LOADED, Waybill.Status.DISPATCHED, Waybill.Status.IN_TRANSIT})
        items = _as_list(request.data.get("items"))
        outcome = request.data.get("outcome", "delivered")
        status_map = {
            "delivered": Waybill.Status.DELIVERED,
            "partial": Waybill.Status.PARTIALLY_DELIVERED,
            "failed": Waybill.Status.DELIVERY_FAILED,
        }
        if outcome not in status_map:
            raise ValidationError({"detail": "Invalid delivery outcome."})
        item_map = {item.id: item for item in waybill.items.all()}
        if outcome != "failed" and not items:
            raise ValidationError({"detail": "Delivered quantities are required."})
        for payload in items:
            item = item_map.get(int(payload.get("id", 0)))
            if not item:
                continue
            delivered_qty = _qty(payload.get("delivered_qty"), Decimal("0"))
            loaded = item.loaded_qty if item.loaded_qty is not None else item.ordered_qty
            if delivered_qty < 0 or delivered_qty > loaded:
                raise ValidationError({"detail": f"Delivered quantity for {item.product.name} must be between 0 and {loaded}."})
            item.delivered_qty = delivered_qty
            item.save(update_fields=["delivered_qty"])
        latitude = _optional_float(request.data.get("delivery_lat"))
        longitude = _optional_float(request.data.get("delivery_lng"))
        accuracy = _optional_float(request.data.get("gps_accuracy_m"))
        if outcome != "failed" and (latitude is None or longitude is None):
            raise ValidationError({"detail": "GPS position is required for completed deliveries."})
        if latitude is not None and not -90 <= latitude <= 90:
            raise ValidationError({"detail": "Latitude is out of range."})
        if longitude is not None and not -180 <= longitude <= 180:
            raise ValidationError({"detail": "Longitude is out of range."})
        if accuracy is not None and accuracy < 0:
            raise ValidationError({"detail": "GPS accuracy cannot be negative."})
        customer_signature = request.FILES.get("customer_signature")
        driver_signature = request.FILES.get("driver_signature")
        if outcome != "failed" and not (customer_signature or waybill.customer_signature):
            raise ValidationError({"detail": "Customer signature is required."})
        if outcome != "failed" and not (driver_signature or waybill.driver_signature):
            raise ValidationError({"detail": "Driver signature is required."})
        previous = waybill.status
        if customer_signature:
            waybill.customer_signature = customer_signature
        if driver_signature:
            waybill.driver_signature = driver_signature
        waybill.delivery_lat = latitude
        waybill.delivery_lng = longitude
        waybill.gps_accuracy_m = accuracy
        waybill.delivery_notes = request.data.get("delivery_notes", "")
        waybill.delivery_client_uuid = request.data.get("client_uuid") or waybill.delivery_client_uuid
        waybill.delivery_at = parse_datetime(request.data.get("delivery_at", "")) or timezone.now()
        waybill.status = status_map[outcome]
        waybill.sync_status = Waybill.SyncStatus.SYNCED
        waybill.save()
        for uploaded in request.FILES.getlist("photos"):
            if uploaded.size > 8 * 1024 * 1024:
                raise ValidationError({"detail": "Each delivery photo must be 8 MB or smaller."})
            WaybillPhoto.objects.create(waybill=waybill, image=uploaded, uploaded_by=request.user)
        record_audit(waybill, request.user, "delivery_completed", previous, waybill.status, request=request)
        generate_waybill_pdf(waybill)
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        waybill = self.get_object()
        if not waybill.pdf_file:
            generate_waybill_pdf(waybill)
        if not waybill.pdf_file:
            raise Http404("PDF is not available.")
        return FileResponse(waybill.pdf_file.open("rb"), content_type="application/pdf", as_attachment=True, filename=f"{waybill.waybill_number}.pdf")
