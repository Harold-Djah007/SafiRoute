import json
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.contrib.auth import authenticate
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

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
@permission_classes([AllowAny])
def health(_request):
    return Response({"ok": True, "service": "SafiRoute", "tagline": "Every delivery. Verified."})


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    user = authenticate(
        username=request.data.get("username"),
        password=request.data.get("password"),
    )
    if not user or not user.is_active:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(user).data})


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
        "waybill_number": waybill.waybill_number,
        "status": waybill.status,
        "status_display": waybill.get_status_display(),
        "customer": waybill.customer.name,
        "branch": waybill.branch,
        "created_at": waybill.created_at,
        "dispatch_at": waybill.dispatch_at,
        "delivery_at": waybill.delivery_at,
        "pdf_version": waybill.pdf_version,
        "item_count": waybill.items.count(),
        "has_customer_signature": bool(waybill.customer_signature),
        "has_driver_signature": bool(waybill.driver_signature),
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
                "user": UserSerializer(request.user).data,
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

    @action(detail=True, methods=["post"])
    def dispatch(self, request, pk=None):
        waybill = self.get_object()
        if not can_dispatch(request.user):
            raise PermissionDenied()
        _require_transition(waybill, {Waybill.Status.LOADED, Waybill.Status.APPROVED})
        driver_id = request.data.get("driver") or (waybill.driver_id)
        vehicle_id = request.data.get("vehicle") or (waybill.vehicle_id)
        if not driver_id or not vehicle_id:
            raise ValidationError({"detail": "Driver and vehicle are required to dispatch."})
        previous = waybill.status
        driver = get_object_or_404(User, pk=driver_id, role=User.Role.DRIVER)
        waybill.driver = driver
        waybill.vehicle_id = vehicle_id
        waybill.driver_phone = request.data.get("driver_phone") or driver.phone
        waybill.status = Waybill.Status.DISPATCHED
        waybill.dispatch_at = timezone.now()
        waybill.dispatch_lat = request.data.get("lat") or None
        waybill.dispatch_lng = request.data.get("lng") or None
        waybill.dispatch_gps_accuracy = request.data.get("gps_accuracy") or None
        waybill.save()
        record_audit(waybill, request.user, "dispatched", previous, waybill.status, request=request)
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def start_transit(self, request, pk=None):
        waybill = self.get_object()
        if request.user.role == User.Role.DRIVER and waybill.driver_id != request.user.id:
            raise PermissionDenied()
        _require_transition(waybill, {Waybill.Status.DISPATCHED})
        previous = waybill.status
        waybill.status = Waybill.Status.IN_TRANSIT
        waybill.save(update_fields=["status", "updated_at"])
        record_audit(waybill, request.user, "in_transit", previous, waybill.status, request=request)
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def complete_delivery(self, request, pk=None):
        waybill = self.get_object()
        if not can_deliver(request.user):
            raise PermissionDenied()
        if request.user.role == User.Role.DRIVER and waybill.driver_id != request.user.id:
            raise PermissionDenied("Drivers can only complete their assigned waybills.")

        client_uuid = request.data.get("client_uuid")
        if client_uuid:
            existing = Waybill.objects.filter(client_uuid=client_uuid).exclude(pk=waybill.pk).first()
            if existing:
                return Response(
                    WaybillSerializer(existing, context={"request": request}).data,
                    status=status.HTTP_200_OK,
                )
            if waybill.is_terminal and str(waybill.client_uuid or "") == str(client_uuid):
                return Response(WaybillSerializer(waybill, context={"request": request}).data)

        if waybill.is_terminal:
            raise ValidationError({"detail": "This waybill is already completed."})

        _require_transition(
            waybill,
            {Waybill.Status.DISPATCHED, Waybill.Status.IN_TRANSIT, Waybill.Status.LOADED},
        )

        outcome = request.data.get("outcome", "delivered")
        if outcome not in {"delivered", "partially_delivered", "delivery_failed"}:
            raise ValidationError({"detail": "outcome must be delivered, partially_delivered, or delivery_failed."})

        items = _as_list(request.data.get("items"))
        item_map = {item.id: item for item in waybill.items.all()}
        for payload in items:
            item = item_map.get(int(payload.get("id", 0)))
            if not item:
                continue
            item.delivered_qty = _qty(payload.get("delivered_qty"), item.loaded_qty or item.ordered_qty)
            item.rejected_qty = _qty(payload.get("rejected_qty"), Decimal("0"))
            item.notes = payload.get("notes", item.notes)
            item.save()

        if waybill.customer_signature and waybill.driver_signature and waybill.is_terminal:
            raise ValidationError({"detail": "This waybill is already completed."})

        previous = waybill.status
        waybill.status = outcome
        waybill.sync_status = Waybill.SyncStatus.SYNCED
        waybill.customer_rep_name = request.data.get("customer_rep_name", "")
        waybill.customer_rep_role = request.data.get("customer_rep_role", "")
        waybill.delivery_notes = request.data.get("delivery_notes", "")
        waybill.failure_reason = request.data.get("failure_reason", "")
        waybill.gps_unavailable_reason = request.data.get("gps_unavailable_reason", "")
        waybill.delivery_lat = request.data.get("lat") or None
        waybill.delivery_lng = request.data.get("lng") or None
        waybill.delivery_gps_accuracy = request.data.get("gps_accuracy") or None
        device_at = request.data.get("device_timestamp")
        waybill.delivery_device_at = parse_datetime(device_at) if device_at else timezone.now()
        waybill.delivery_at = timezone.now()
        if client_uuid:
            waybill.client_uuid = client_uuid
        if request.FILES.get("customer_signature"):
            waybill.customer_signature = request.FILES["customer_signature"]
        if request.FILES.get("driver_signature"):
            waybill.driver_signature = request.FILES["driver_signature"]
        waybill.save()

        photos = request.FILES.getlist("photos") or request.FILES.getlist("photos[]")
        for photo in photos:
            WaybillPhoto.objects.create(
                waybill=waybill,
                image=photo,
                caption=request.data.get("photo_caption", "Delivery photo"),
                uploaded_by=request.user,
            )

        generate_waybill_pdf(waybill)
        record_audit(
            waybill,
            request.user,
            "completed",
            previous,
            waybill.status,
            detail={"outcome": outcome, "client_uuid": str(client_uuid) if client_uuid else None},
            request=request,
            device_timestamp=waybill.delivery_device_at,
        )
        waybill.refresh_from_db()
        return Response(WaybillSerializer(waybill, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        waybill = self.get_object()
        if not can_cancel(request.user):
            raise PermissionDenied()
        if waybill.is_terminal and waybill.status != Waybill.Status.CANCELLED:
            raise ValidationError({"detail": "Completed waybills cannot be cancelled. Create an amendment."})
        reason = request.data.get("reason", "").strip()
        if not reason:
            raise ValidationError({"detail": "A cancellation reason is required."})
        previous = waybill.status
        waybill.status = Waybill.Status.CANCELLED
        waybill.cancellation_reason = reason
        waybill.save(update_fields=["status", "cancellation_reason", "updated_at"])
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

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        waybill = self.get_object()
        if not waybill.pdf_file:
            if waybill.is_terminal:
                generate_waybill_pdf(waybill)
                waybill.refresh_from_db()
            else:
                raise Http404("PDF is generated after delivery is completed.")
        record_audit(waybill, request.user, "pdf_downloaded", request=request)
        return FileResponse(waybill.pdf_file.open("rb"), as_attachment=True, filename=f"{waybill.waybill_number}.pdf")
