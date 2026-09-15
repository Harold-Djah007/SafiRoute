export const UNITS = ["Bags", "Kilograms", "Tonnes", "Litres", "Units"];

export function createWaybillNumber(now = new Date(), random = Math.random) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.floor(random() * 9000 + 1000);
  return `SR-${date}-${suffix}`;
}

export function createEmptyWaybill(now = new Date(), random = Math.random) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${now.getTime()}-${Math.floor(random() * 1e6)}`,
    number: createWaybillNumber(now, random),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: "draft",
    syncStatus: "local_only",
    customerName: "",
    customerPhone: "",
    deliveryAddress: "",
    orderReference: "",
    productName: "",
    quantity: "",
    unit: "Bags",
    driverName: "",
    vehicleNumber: "",
    notes: "",
    latitude: null,
    longitude: null,
    gpsAccuracy: null,
    gpsCapturedAt: null,
    customerSignature: null,
    photo: null
  };
}

export function validateWaybill(waybill) {
  const errors = {};
  if (!waybill.customerName?.trim()) errors.customerName = "Customer name is required.";
  if (!waybill.deliveryAddress?.trim()) errors.deliveryAddress = "Delivery address is required.";
  if (!waybill.productName?.trim()) errors.productName = "Product is required.";
  const quantity = Number(waybill.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) errors.quantity = "Enter a quantity greater than zero.";
  if (!waybill.driverName?.trim()) errors.driverName = "Driver name is required.";
  if (!waybill.vehicleNumber?.trim()) errors.vehicleNumber = "Vehicle number is required.";
  if (!waybill.customerSignature) errors.customerSignature = "Customer signature is required to complete delivery.";
  return errors;
}

export function summarizeWaybills(waybills) {
  return waybills.reduce(
    (summary, item) => {
      summary.total += 1;
      if (item.status === "draft") summary.drafts += 1;
      if (item.status === "completed") summary.completed += 1;
      if (item.syncStatus === "pending") summary.pending += 1;
      return summary;
    },
    { total: 0, drafts: 0, completed: 0, pending: 0 }
  );
}

