export const UNITS = ["Bags", "Kilograms", "Tonnes", "Litres", "Units"];

export function createWaybillNumber(now = new Date(), random = Math.random) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.floor(random() * 9000 + 1000);
  return `SR-${date}-${suffix}`;
}

export function emptyItem() {
  return { description: "", qty: "", remarks: "" };
}

export function firstFilledItem(waybill) {
  return (waybill.items || []).find((item) => item.description?.trim() || item.qty) || null;
}

export function normalizeItems(waybill) {
  const items = Array.isArray(waybill.items)
    ? waybill.items.map((item) => ({
        description: item.description || "",
        qty: item.qty ?? "",
        remarks: item.remarks || ""
      }))
    : [];
  if (!firstFilledItem({ items }) && (waybill.productName || waybill.quantity)) {
    if (!items.length) items.push(emptyItem());
    items[0] = {
      ...items[0],
      description: items[0].description || waybill.productName || "",
      qty: items[0].qty || waybill.quantity || ""
    };
  }
  while (items.length < 5) items.push(emptyItem());
  return items;
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
    contactName: "",
    customerPhone: "",
    deliveryAddress: "",
    documentDate: now.toISOString().slice(0, 10),
    orderReference: "",
    productName: "",
    quantity: "",
    unit: "Bags",
    items: Array.from({ length: 5 }, emptyItem),
    authorisedBy: "",
    authorisedRemarks: "",
    driverName: "",
    vehicleNumber: "",
    notes: "",
    receivedBy: "",
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
  const line = firstFilledItem(waybill);
  const productName = waybill.productName?.trim() || line?.description?.trim() || "";
  const quantity = waybill.quantity || line?.qty;
  const driverName = waybill.driverName?.trim() || waybill.dispatchedBy?.trim() || "";
  if (!waybill.customerName?.trim()) errors.customerName = "Deliver to is required.";
  if (!waybill.deliveryAddress?.trim()) errors.deliveryAddress = "Address is required.";
  if (!productName) errors.productName = "Add at least one description line.";
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) errors.quantity = "Enter a quantity greater than zero.";
  if (!driverName) errors.driverName = "Dispatched by is required.";
  if (!waybill.vehicleNumber?.trim()) errors.vehicleNumber = "Vehicle number is required.";
  if (!waybill.customerSignature) errors.customerSignature = "Received-by signature is required to complete delivery.";
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
