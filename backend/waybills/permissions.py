from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import User


class HasWaybillAccess(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role in {User.Role.ADMIN, User.Role.SUPERVISOR, User.Role.FINANCE, User.Role.SALES, User.Role.WAREHOUSE}:
            if request.method in SAFE_METHODS:
                return True
            if user.role == User.Role.FINANCE:
                return False
            return True
        if user.role == User.Role.DRIVER:
            return obj.driver_id == user.id
        return False


def can_create(user):
    return user.role in {User.Role.ADMIN, User.Role.SALES, User.Role.SUPERVISOR}


def can_approve(user):
    return user.role in {User.Role.ADMIN, User.Role.SUPERVISOR}


def can_load(user):
    return user.role in {User.Role.ADMIN, User.Role.WAREHOUSE}


def can_dispatch(user):
    return user.role in {User.Role.ADMIN, User.Role.WAREHOUSE, User.Role.SUPERVISOR}


def can_deliver(user):
    return user.role in {User.Role.ADMIN, User.Role.DRIVER}


def can_cancel(user):
    return user.role in {User.Role.ADMIN, User.Role.SUPERVISOR}


class ReferenceDataPermission(BasePermission):
    """Allow authenticated lookups, but reserve master-data writes for office control roles."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.role in {User.Role.ADMIN, User.Role.SUPERVISOR}

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
