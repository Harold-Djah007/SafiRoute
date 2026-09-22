from django.utils import timezone
from rest_framework import serializers

from .models import AuditLog, Customer, Product, User, Waybill, WaybillItem, WaybillPhoto


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "role",
            "role_display",
            "phone",
            "employee_id",
            "branch",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = "__all__"


class WaybillItemSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = WaybillItem
        fields = ["id", "product", "product_name", "notes"]


class WaybillPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaybillPhoto
        fields = ["id", "image", "caption", "captured_at"]
        read_only_fields = fields


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "from_status",
            "to_status",
            "actor_name",
            "device_timestamp",
            "created_at",
            "detail",
        ]

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() or obj.actor.username


class WaybillSerializer(serializers.ModelSerializer):
    items = WaybillItemSerializer(many=True)
    photos = WaybillPhotoSerializer(many=True, read_only=True)
    audit_logs = AuditLogSerializer(many=True, read_only=True)
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), required=False, allow_null=True
    )
    customer_detail = CustomerSerializer(source="customer", read_only=True)
    created_by_detail = UserSerializer(source="created_by", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    verification_url = serializers.SerializerMethodField()
    received_by = serializers.CharField(source="received_by_name", read_only=True)

    class Meta:
        model = Waybill
        fields = [
            "id",
            "waybill_number",
            "verification_token",
            "verification_url",
            "status",
            "status_display",
            "sync_status",
            "client_uuid",
            "customer",
            "customer_detail",
            "deliver_to",
            "delivery_contact_name",
            "delivery_address_text",
            "contact_phone",
            "document_date",
            "authorised_by_name",
            "authorised_remarks",
            "dispatched_by_name",
            "created_by_detail",
            "delivery_at",
            "delivery_device_at",
            "delivery_lat",
            "delivery_lng",
            "delivery_gps_accuracy",
            "gps_unavailable_reason",
            "received_by",
            "authorised_signature",
            "dispatched_signature",
            "customer_signature",
            "delivery_notes",
            "pdf_file",
            "pdf_version",
            "document_fingerprint",
            "pdf_sha256",
            "items",
            "photos",
            "audit_logs",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "waybill_number",
            "verification_token",
            "status",
            "sync_status",
            "client_uuid",
            "created_by_detail",
            "delivery_at",
            "delivery_device_at",
            "delivery_lat",
            "delivery_lng",
            "delivery_gps_accuracy",
            "gps_unavailable_reason",
            "received_by",
            "authorised_signature",
            "dispatched_signature",
            "customer_signature",
            "delivery_notes",
            "pdf_file",
            "pdf_version",
            "document_fingerprint",
            "pdf_sha256",
            "photos",
            "audit_logs",
            "created_at",
            "updated_at",
        ]

    def get_verification_url(self, obj):
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(f"/api/verify/{obj.verification_token}/")
        return f"/api/verify/{obj.verification_token}/"

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        request = self.context.get("request")
        user = getattr(request, "user", None)
        self._apply_paper_defaults(validated_data, user)
        waybill = Waybill.objects.create(**validated_data)
        self._write_items(waybill, items_data)
        return waybill

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            self._write_items(instance, items_data)
        return instance

    def _apply_paper_defaults(self, data, user):
        customer = data.get("customer")
        deliver_to = (data.get("deliver_to") or "").strip()
        if customer is None:
            if not deliver_to:
                raise serializers.ValidationError({"deliver_to": "Deliver to is required."})
            customer = Customer.objects.filter(name__iexact=deliver_to).first()
            if customer is None:
                stamp = timezone.now().strftime("%y%m%d%H%M%S")
                customer = Customer.objects.create(
                    name=deliver_to,
                    account_number=f"WB-{stamp}",
                    delivery_address=data.get("delivery_address_text") or "",
                    contact_name=data.get("delivery_contact_name") or "",
                    phone=data.get("contact_phone") or "",
                )
            data["customer"] = customer
        if not data.get("deliver_to"):
            data["deliver_to"] = customer.name
        if not data.get("delivery_contact_name"):
            data["delivery_contact_name"] = customer.contact_name
        if not data.get("delivery_address_text"):
            data["delivery_address_text"] = customer.delivery_address
        if not data.get("contact_phone"):
            data["contact_phone"] = customer.phone
        if not data.get("document_date"):
            data["document_date"] = timezone.localdate()
        if not data.get("authorised_by_name") and user and user.is_authenticated:
            data["authorised_by_name"] = user.get_full_name() or user.username

    def _write_items(self, waybill, items_data):
        for item in items_data:
            name = (item.get("product_name") or "").strip()
            product = item.get("product")
            if not product and not name:
                continue
            WaybillItem.objects.create(waybill=waybill, **item)


class WaybillListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    item_count = serializers.IntegerField(source="items.count", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Waybill
        fields = [
            "id",
            "waybill_number",
            "status",
            "status_display",
            "sync_status",
            "customer",
            "customer_name",
            "deliver_to",
            "delivery_contact_name",
            "delivery_address_text",
            "contact_phone",
            "authorised_by_name",
            "dispatched_by_name",
            "created_by_name",
            "item_count",
            "created_at",
            "delivery_at",
            "updated_at",
        ]

    def get_customer_name(self, obj):
        return obj.deliver_to or obj.customer.name

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username
