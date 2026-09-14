from rest_framework.routers import DefaultRouter

from .views import (
    CustomerViewSet,
    DriverViewSet,
    ProductViewSet,
    VehicleViewSet,
    WaybillViewSet,
)

router = DefaultRouter()
router.register("waybills", WaybillViewSet, basename="waybill")
router.register("customers", CustomerViewSet, basename="customer")
router.register("products", ProductViewSet, basename="product")
router.register("vehicles", VehicleViewSet, basename="vehicle")
router.register("drivers", DriverViewSet, basename="driver")

urlpatterns = router.urls
