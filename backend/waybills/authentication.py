from django.conf import settings
from django.core import signing
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from .models import User


MOBILE_TOKEN_SALT = "safiroute.mobile-token.v1"


def mobile_signer():
    return signing.TimestampSigner(salt=MOBILE_TOKEN_SALT)


class MobileTokenAuthentication(BaseAuthentication):
    """Short-lived signed token authentication for the native Sales app.

    Tokens are stateless, expire automatically, and become invalid when the
    user's password changes because the session auth hash is embedded in the
    signed payload.
    """

    keyword = b"mobile"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword:
            return None
        if len(parts) != 2:
            raise exceptions.AuthenticationFailed("Invalid mobile authorization header.")

        try:
            token = parts[1].decode("utf-8")
            payload = mobile_signer().unsign_object(
                token,
                max_age=settings.MOBILE_TOKEN_MAX_AGE_SECONDS,
            )
        except (UnicodeDecodeError, signing.BadSignature, signing.SignatureExpired) as exc:
            raise exceptions.AuthenticationFailed("Mobile session expired. Sign in again.") from exc

        try:
            user = User.objects.get(pk=payload["uid"], is_active=True)
        except (KeyError, User.DoesNotExist) as exc:
            raise exceptions.AuthenticationFailed("Mobile session is no longer valid.") from exc

        if payload.get("auth") != user.get_session_auth_hash():
            raise exceptions.AuthenticationFailed("Mobile session was revoked. Sign in again.")

        if user.role not in {User.Role.SALES, User.Role.ADMIN}:
            raise exceptions.AuthenticationFailed("The mobile waybill app is for Sales users.")

        return user, token
