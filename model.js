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

export function applyProfileDefaults(waybill, profile) {
  if (!profile?.operatorName) return waybill;
  waybill.authorisedBy = profile.operatorName;
  if (!waybill.vehicleNumber && profile.vehicleNumber) waybill.vehicleNumber = profile.vehicleNumber;
  if (!waybill.authorisedSignature && profile.authorisedSignature) waybill.authorisedSignature = profile.authorisedSignature;
  return waybill;
}

export function copyAsNew(source, profile = {}, now = new Date(), random = Math.random) {
  const waybill = applyProfileDefaults(createEmptyWaybill(now, random), profile);
  if (!isMeaningfulDraft(source, profile)) return waybill;
  waybill.customerName = source.customerName || "";
  waybill.contactName = source.contactName || "";
  waybill.customerPhone = source.customerPhone || "";
  waybill.deliveryAddress = source.deliveryAddress || "";
  waybill.items = normalizeItems({
    items: (source.items || []).map((item) => ({
      description: item.description || "",
      qty: item.qty || "",
      remarks: item.remarks || ""
    })),
    productName: source.productName,
    quantity: source.quantity
  });
  waybill.productName = source.productName || "";
  waybill.quantity = source.quantity || "";
  waybill.driverName = source.driverName || "";
  if (source.vehicleNumber) waybill.vehicleNumber = source.vehicleNumber;
  waybill.authorisedRemarks = source.authorisedRemarks || "";
  waybill.receivedBy = source.receivedBy || "";
  return waybill;
}

export function gpsErrorMessage(error) {
  const code = error?.code;
  if (code === 1) return "Location permission is off. Turn it on for this site, or continue without GPS.";
  if (code === 2) return "GPS is unavailable right now. Try again outdoors, or continue without GPS.";
  if (code === 3) return "Location timed out. Try again, or continue without GPS.";
  return error?.message
    ? `Location was not captured: ${error.message}`
    : "Location was not captured. You can still complete the pad without GPS.";
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
    authorisedSignature: null,
    dispatchedSignature: null,
    latitude: null,
    longitude: null,
    gpsAccuracy: null,
    gpsCapturedAt: null,
    customerSignature: null,
    photo: null
  };
}

export function isMeaningfulDraft(waybill, profile = {}) {
  const name = (profile.operatorName || "").trim();
  const vehicle = (profile.vehicleNumber || "").trim().toUpperCase();
  const savedSign = profile.authorisedSignature || null;
  const authorisedBy = (waybill.authorisedBy || "").trim();
  const vehicleNumber = (waybill.vehicleNumber || "").trim().toUpperCase();
  const lineFilled = (waybill.items || []).some((item) => item.description?.trim() || item.qty || item.remarks?.trim());
  const ownAuthorisedSign = Boolean(waybill.authorisedSignature && waybill.authorisedSignature !== savedSign);
  const extras = [
    waybill.customerName,
    waybill.contactName,
    waybill.customerPhone,
    waybill.deliveryAddress,
    authorisedBy && authorisedBy !== name ? authorisedBy : "",
    waybill.authorisedRemarks,
    waybill.driverName,
    vehicleNumber && vehicleNumber !== vehicle ? waybill.vehicleNumber : "",
    waybill.receivedBy,
    waybill.dispatchedSignature,
    waybill.customerSignature,
    waybill.photo,
    waybill.latitude
  ];
  return extras.some((value) => value !== null && String(value).trim() !== "") || lineFilled || ownAuthorisedSign;
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
  if (!waybill.authorisedBy?.trim()) errors.authorisedBy = "Authorised by is required.";
  if (!driverName) errors.driverName = "Dispatched by is required.";
  if (!waybill.vehicleNumber?.trim()) errors.vehicleNumber = "Vehicle number is required.";
  if (!waybill.receivedBy?.trim()) errors.receivedBy = "Received by is required.";
  if (!waybill.authorisedSignature) errors.authorisedSignature = "Sales must sign Authorised by.";
  if (!waybill.dispatchedSignature) errors.dispatchedSignature = "Dispatch must sign.";
  if (!waybill.customerSignature) errors.customerSignature = "The customer must sign Received by.";
  return errors;
}

export function parseBackup(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const waybills = Array.isArray(data) ? data : data?.waybills;
  if (!Array.isArray(waybills)) throw new Error("Not a SafiRoute backup file.");
  return {
    exportedAt: data?.exportedAt || null,
    profile: data?.profile && typeof data.profile === "object" ? data.profile : null,
    waybills
  };
}

export function buildBackup({ profile, waybills, exportedAt = new Date().toISOString() }) {
  return {
    app: "safiroute",
    version: 1,
    exportedAt,
    profile: profile
      ? {
          operatorName: profile.operatorName || "",
          phone: profile.phone || "",
          vehicleNumber: profile.vehicleNumber || "",
          authorisedSignature: profile.authorisedSignature || null,
          pinHash: profile.pinHash || null,
          role: "sales"
        }
      : null,
    waybills
  };
}

export function mergeWaybills(existing, incoming) {
  const map = new Map(existing.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const item of incoming) {
    if (!item?.id) {
      skipped += 1;
      continue;
    }
    const previous = map.get(item.id);
    if (!previous) {
      map.set(item.id, item);
      added += 1;
    } else if ((item.updatedAt || "") > (previous.updatedAt || "")) {
      map.set(item.id, item);
      updated += 1;
    } else {
      skipped += 1;
    }
  }
  return { waybills: [...map.values()], added, updated, skipped };
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
