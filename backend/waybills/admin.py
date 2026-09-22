from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AuditLog, Customer, Product, User, Waybill, WaybillItem, WaybillPhoto


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "first_name", "last_name", "role", "branch", "is_active")
    list_filter = ("role", "is_active", "branch")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("SafiRoute Sales", {"fields": ("role", "phone", "employee_id", "branch")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("SafiRoute Sales", {"fields": ("role", "phone", "employee_id", "branch")}),
    )


class WaybillItemInline(admin.TabularInline):
    model = WaybillItem
    extra = 0
    fields = ("product_name", "notes")


class AuditInline(admin.TabularInline):
    model = AuditLog
    extra = 0
    readonly_fields = ("actor", "action", "from_status", "to_status", "created_at")


@admin.register(Waybill)
class WaybillAdmin(admin.ModelAdmin):
    list_display = (
        "waybill_number",
        "deliver_to",
        "status",
        "authorised_by_name",
        "dispatched_by_name",
        "created_at",
    )
    list_filter = ("status", "sync_status")
    search_fields = (
        "waybill_number",
        "customer__name",
        "deliver_to",
        "authorised_by_name",
        "dispatched_by_name",
        "customer_rep_name",
    )
    inlines = [WaybillItemInline, AuditInline]
    readonly_fields = (
        "waybill_number",
        "verification_token",
        "document_fingerprint",
        "pdf_sha256",
        "created_at",
        "updated_at",
    )


admin.site.register(Customer)
admin.site.register(Product)
admin.site.register(WaybillPhoto)
admin.site.register(AuditLog)
