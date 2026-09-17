from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.authtoken.views import obtain_auth_token

from waybills.views import csrf_token, health, login, logout_view, me, verify_waybill

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/health", health),
    path("api/auth/token/", obtain_auth_token),
    path("api/auth/csrf/", csrf_token),
    path("api/auth/csrf", csrf_token),
    path("api/auth/login/", login),
    path("api/auth/login", login),
    path("api/auth/logout/", logout_view),
    path("api/auth/logout", logout_view),
    path("api/me/", me),
    path("api/verify/<str:token>/", verify_waybill),
    path("api/", include("waybills.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

admin.site.site_header = "SafiRoute administration"
admin.site.site_title = "SafiRoute"
admin.site.index_title = "Safisana Ghana digital waybills"
