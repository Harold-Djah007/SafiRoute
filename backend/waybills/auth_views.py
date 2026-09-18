"""Authentication endpoints kept separate from waybill workflow views.

Browser clients use Django's HttpOnly session cookie. Long-lived DRF tokens are
only issued by the explicit token endpoint for trusted scripts/integrations.
Both credential endpoints share a source-address rate limit.
"""

from django.conf import settings
from django.contrib.auth import authenticate, login as django_login
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .authentication import mobile_signer
from .models import User
from .serializers import UserSerializer


class LoginRateThrottle(SimpleRateThrottle):
    scope = "login"
    rate = "10/min"

    def get_cache_key(self, request, view):
        # Do not trust caller-controlled X-Forwarded-For unless deployment-level
        # proxy handling has explicitly normalized it before Django.
        ident = request.META.get("REMOTE_ADDR") or self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


def _authenticate(request):
    return authenticate(
        username=request.data.get("username"),
        password=request.data.get("password"),
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def session_login(request):
    user = _authenticate(request)
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
    user = _authenticate(request)
    if not user or not user.is_active:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def mobile_token_login(request):
    """Issue a short-lived signed token for the native Sales app."""

    user = _authenticate(request)
    if not user or not user.is_active:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)
    if user.role not in {User.Role.SALES, User.Role.ADMIN}:
        return Response(
            {"detail": "The SafiRoute mobile app is for Sales users."},
            status=status.HTTP_403_FORBIDDEN,
        )

    token = mobile_signer().sign_object(
        {
            "uid": user.pk,
            "auth": user.get_session_auth_hash(),
        }
    )
    return Response(
        {
            "token": token,
            "token_type": "Mobile",
            "expires_in": settings.MOBILE_TOKEN_MAX_AGE_SECONDS,
            "user": UserSerializer(user).data,
        }
    )
