from django.contrib.auth import logout as django_logout
from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .fingerprints import pdf_matches_stored_hash
from .models import Customer, Product, User, Waybill, record_audit
from .pdf import generate_waybill_pdf
from .permissions import HasWaybillAccess, ReferenceDataPermission, can_create
from .serializers import (
    CustomerSerializer,
    ProductSerializer,
    UserSerializer,
    WaybillListSerializer,
    WaybillSerializer,
)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(_request):
    return Response(
        {
            "ok": True,
            "service": "SafiRoute",
            "audience": "Safisana Sales",
            "tagline": "Every delivery. Verified.",
        }
    )


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def csrf_token(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    django_logout(request)
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    if request.user.role not in {User.Role.SALES, User.Role.ADMIN}:
        raise PermissionDenied("SafiRoute is for the Safisana Sales team.")
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
        "created_at": waybill.created_at,
        "completed_at": waybill.delivery_at,
        "pdf_version": waybill.pdf_version,
        "item_count": waybill.items.count(),
        "has_authorised_signature": bool(waybill.authorised_signature),
        "has_dispatched_signature": bool(waybill.driver_signature),
        "has_received_signature": bool(waybill.customer_signature),
        "has_gps": waybill.delivery_lat is not None and waybill.delivery_lng is not None,
        "photo_count": waybill.photos.count(),
        "document_fingerprint": waybill.document_fingerprint,
        "pdf_sha256": waybill.pdf_sha256,
        "pdf_integrity_ok": pdf_matches_stored_hash(waybill)[0] if waybill.pdf_file else None,
    }
    return Response(payload)


class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, ReferenceDataPermission]
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    search_fields = ["name", "account_number", "phone"]
    filterset_fields = ["is_active"]


class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, ReferenceDataPermission]
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    search_fields = ["name", "sku"]
    filterset_fields = ["is_active"]


class WaybillViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasWaybillAccess]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = [
        "waybill_number",
        "deliver_to",
        "delivery_contact_name",
        "contact_phone",
        "customer__name",
        "customer__account_number",
        "authorised_by_name",
        "dispatched_by_name",
        "customer_rep_name",
    ]
    filterset_fields = ["status", "sync_status", "customer"]
    ordering_fields = ["created_at", "updated_at", "delivery_at"]

    def get_queryset(self):
        return (
            Waybill.objects.select_related("customer", "created_by")
            .prefetch_related("items", "photos", "audit_logs")
            .all()
        )

    def get_serializer_class(self):
        if self.action == "list":
            return WaybillListSerializer
        return WaybillSerializer

    def perform_create(self, serializer):
        if not can_create(self.request.user):
            raise PermissionDenied("Only SafiRoute Sales users can create waybills.")
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
            raise ValidationError(
                {"detail": "Completed waybills are immutable. Create a new corrected waybill instead."}
            )
        if not can_create(self.request.user):
            raise PermissionDenied()
        serializer.save()
        record_audit(waybill, self.request.user, "updated", request=self.request)

    def perform_destroy(self, instance):
        raise PermissionDenied("Waybills are retained for audit. They cannot be deleted.")

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        qs = self.get_queryset()
        counts = qs.aggregate(
            total=Count("id"),
            draft=Count("id", filter=Q(status=Waybill.Status.DRAFT)),
            completed=Count("id", filter=Q(status=Waybill.Status.COMPLETED)),
            voided=Count("id", filter=Q(status=Waybill.Status.VOIDED)),
            waiting_sync=Count("id", filter=~Q(sync_status=Waybill.SyncStatus.SYNCED)),
        )
        today = timezone.localdate()
        today_qs = qs.filter(created_at__date=today)
        recent = WaybillListSerializer(
            qs[:10],
            many=True,
            context={"request": request},
        ).data
        return Response(
            {
                "counts": counts,
                "today": {
                    "created": today_qs.count(),
                    "completed": today_qs.filter(status=Waybill.Status.COMPLETED).count(),
                },
                "recent": recent,
                "user": UserSerializer(request.user).data,
            }
        )

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        waybill = self.get_object()
        if not waybill.pdf_file:
            if waybill.status == Waybill.Status.COMPLETED:
                generate_waybill_pdf(waybill)
                waybill.refresh_from_db()
            else:
                raise Http404("PDF is generated after the Sales waybill is completed.")
        record_audit(waybill, request.user, "pdf_downloaded", request=request)
        return FileResponse(
            waybill.pdf_file.open("rb"),
            as_attachment=True,
            filename=f"{waybill.waybill_number}.pdf",
        )
