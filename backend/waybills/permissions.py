from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import User


SALES_ROLES = {User.Role.ADMIN, User.Role.SALES}


class HasWaybillAccess(BasePermission):
    """SafiRoute is a Sales-only product."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.role in SALES_ROLES
        )

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


def can_create(user):
    return bool(user and user.is_authenticated and user.role in SALES_ROLES)


class ReferenceDataPermission(BasePermission):
    """Sales can read customer/product references; Sales Administrators manage them."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated or user.role not in SALES_ROLES:
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.role == User.Role.ADMIN

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
