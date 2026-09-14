from rest_framework import serializers

from .models import (
    AuditLog,
    Customer,
    Product,
    User,
    Vehicle,
    Waybill,
    WaybillItem,
    WaybillPhoto,
)


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


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = "__all__"


class WaybillItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaybillItem
        fields = [
            "id",
            "product",
            "product_name",
            "sku",
            "unit_of_measure",
            "ordered_qty",
            "loaded_qty",
            "delivered_qty",
            "rejected_qty",
            "batch_number",
            "notes",
        ]
        read_only_fields = ["product_name", "sku", "unit_of_measure"]


class WaybillPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaybillPhoto
        fields = ["id", "image", "caption", "captured_at", "uploaded_by"]
        read_only_fields = ["uploaded_by"]


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.get_full_name", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "from_status",
            "to_status",
            "detail",
            "actor",
            "actor_name",
            "device_timestamp",
            "created_at",
        ]


class WaybillSerializer(serializers.ModelSerializer):
    items = WaybillItemSerializer(many=True)
    photos = WaybillPhotoSerializer(many=True, read_only=True)
    audit_logs = AuditLogSerializer(many=True, read_only=True)
    customer_detail = CustomerSerializer(source="customer", read_only=True)
    driver_detail = UserSerializer(source="driver", read_only=True)
    created_by_detail = UserSerializer(source="created_by", read_only=True)
    vehicle_detail = VehicleSerializer(source="vehicle", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    verification_url = serializers.SerializerMethodField()

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
            "sales_order_ref",
            "invoice_ref",
            "po_ref",
            "branch",
            "created_by",
            "created_by_detail",
            "approved_by",
            "approved_at",
            "warehouse_officer",
            "loaded_at",
            "driver",
            "driver_detail",
            "vehicle",
            "vehicle_detail",
            "driver_phone",
            "dispatch_at",
            "dispatch_lat",
            "dispatch_lng",
            "dispatch_gps_accuracy",
            "delivery_at",
            "delivery_device_at",
            "delivery_lat",
            "delivery_lng",
            "delivery_gps_accuracy",
            "gps_unavailable_reason",
            "customer_rep_name",
            "customer_rep_role",
            "customer_signature",
            "driver_signature",
            "delivery_notes",
            "failure_reason",
            "cancellation_reason",
            "pdf_file",
            "pdf_version",
            "items",
            "photos",
            "audit_logs",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "waybill_number",
            "verification_token",
            "created_by",
            "approved_by",
            "approved_at",
            "warehouse_officer",
            "loaded_at",
            "dispatch_at",
            "delivery_at",
            "pdf_file",
            "pdf_version",
            "status",
        ]

    def get_verification_url(self, obj):
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(f"/api/verify/{obj.verification_token}/")
        return f"/api/verify/{obj.verification_token}/"

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        waybill = Waybill.objects.create(**validated_data)
        for item in items_data:
            WaybillItem.objects.create(waybill=waybill, **item)
        return waybill

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                WaybillItem.objects.create(waybill=instance, **item)
        return instance


class WaybillListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    driver_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    item_count = serializers.IntegerField(source="items.count", read_only=True)

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
            "driver",
            "driver_name",
            "branch",
            "sales_order_ref",
            "item_count",
            "created_at",
            "dispatch_at",
            "delivery_at",
            "updated_at",
        ]

    def get_driver_name(self, obj):
        if not obj.driver:
            return ""
        return obj.driver.get_full_name() or obj.driver.username
