from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AuditLog, Customer, Product, User, Vehicle, Waybill, WaybillItem, WaybillPhoto


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "first_name", "last_name", "role", "branch", "is_active")
    list_filter = ("role", "is_active", "branch")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("SafiRoute", {"fields": ("role", "phone", "employee_id", "branch")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("SafiRoute", {"fields": ("role", "phone", "employee_id", "branch")}),
    )


class WaybillItemInline(admin.TabularInline):
    model = WaybillItem
    extra = 0


class AuditInline(admin.TabularInline):
    model = AuditLog
    extra = 0
    readonly_fields = ("actor", "action", "from_status", "to_status", "created_at")


@admin.register(Waybill)
class WaybillAdmin(admin.ModelAdmin):
    list_display = ("waybill_number", "customer", "status", "driver", "created_at")
    list_filter = ("status", "branch", "sync_status")
    search_fields = ("waybill_number", "customer__name", "sales_order_ref")
    inlines = [WaybillItemInline, AuditInline]
    readonly_fields = ("waybill_number", "verification_token", "created_at", "updated_at")


admin.site.register(Customer)
admin.site.register(Product)
admin.site.register(Vehicle)
admin.site.register(WaybillPhoto)
admin.site.register(AuditLog)
