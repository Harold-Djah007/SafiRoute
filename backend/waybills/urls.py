from rest_framework.routers import DefaultRouter

from .views import CustomerViewSet, ProductViewSet, WaybillViewSet

router = DefaultRouter()
router.register("waybills", WaybillViewSet, basename="waybill")
router.register("customers", CustomerViewSet, basename="customer")
router.register("products", ProductViewSet, basename="product")

urlpatterns = router.urls
