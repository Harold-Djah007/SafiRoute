import { api } from "@/lib/api";

const DB_NAME = "safiroute-sales-mobile";
const DB_VERSION = 2;
const WAYBILLS = "waybills";
const SETTINGS = "settings";
const REFERENCES = "references";

export type MobileLine = {
  description: string;
  qty: string;
  remarks: string;
};

export type MobileSyncStatus = "device_only" | "pending" | "syncing" | "synced" | "failed";

export type SalesWaybill = {
  id: string;
  localNumber: string;
  serverId?: number;
  serverNumber?: string;
  verificationToken?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  syncedAt?: string;
  status: "draft" | "completed";
  syncStatus: MobileSyncStatus;
  syncError?: string;
  deliverTo: string;
  contactName: string;
  contactPhone: string;
  deliveryAddress: string;
  documentDate: string;
  authorisedBy: string;
  authorisedRemarks: string;
  dispatchedBy: string;
  vehicleNumber: string;
  receivedBy: string;
  receivedByRole: string;
  items: MobileLine[];
  authorisedSignature: string | null;
  dispatchedSignature: string | null;
  customerSignature: string | null;
  latitude: number | null;
  longitude: number | null;
  gpsAccuracy: number | null;
  gpsCapturedAt: string | null;
  gpsUnavailableReason: string;
  photo: string | null;
  notes: string;
};

export type SalesMobileSettings = {
  id: "profile";
  phone: string;
  vehicleNumber: string;
  authorisedSignature: string | null;
  pinHash: string | null;
  lastBackupAt: string | null;
  updatedAt: string;
};

export type SalesReferenceCustomer = {
  id: number;
  name: string;
  delivery_address?: string;
  contact_name?: string;
  phone?: string;
};

export type SalesReferenceProduct = {
  id: number;
  name?: string;
  sku?: string;
  unit_of_measure?: string;
};

export type SalesMobileReferences = {
  id: "references";
  customers: SalesReferenceCustomer[];
  products: SalesReferenceProduct[];
  savedAt: string;
};

type SalesBackup = {
  app: "SafiRoute";
  format: "sales-mobile-backup-v1";
  exportedAt: string;
  settings?: Partial<Pick<SalesMobileSettings, "phone" | "vehicleNumber" | "authorisedSignature">>;
  waybills: SalesWaybill[];
};

const defaultSettings = (): SalesMobileSettings => ({
  id: "profile",
  phone: "",
  vehicleNumber: "",
  authorisedSignature: null,
  pinHash: null,
  lastBackupAt: null,
  updatedAt: new Date().toISOString(),
});

const emptyReferences = (): SalesMobileReferences => ({
  id: "references",
  customers: [],
  products: [],
  savedAt: "",
});

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WAYBILLS)) {
        const store = db.createObjectStore(WAYBILLS, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("syncStatus", "syncStatus");
      }
      if (!db.objectStoreNames.contains(SETTINGS)) {
        db.createObjectStore(SETTINGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(REFERENCES)) {
        db.createObjectStore(REFERENCES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = run(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("SafiRoute could not save to this phone."));
        };
      })
  );
}

async function putMany<T>(storeName: string, values: T[]) {
  if (!values.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    values.forEach((value) => store.put(value));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("SafiRoute could not restore this backup."));
    };
  });
}

function localNumber(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().split("-")[0].slice(0, 5).toUpperCase();
  return `SR-${date}-${suffix}`;
}

export function emptyLine(): MobileLine {
  return { description: "", qty: "", remarks: "" };
}

export function createSalesWaybill(authorisedBy = "", settings?: SalesMobileSettings): SalesWaybill {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    localNumber: localNumber(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: "draft",
    syncStatus: "device_only",
    deliverTo: "",
    contactName: "",
    contactPhone: "",
    deliveryAddress: "",
    documentDate: now.toISOString().slice(0, 10),
    authorisedBy,
    authorisedRemarks: "",
    dispatchedBy: "",
    vehicleNumber: settings?.vehicleNumber || "",
    receivedBy: "",
    receivedByRole: "",
    items: Array.from({ length: 3 }, emptyLine),
    authorisedSignature: settings?.authorisedSignature || null,
    dispatchedSignature: null,
    customerSignature: null,
    latitude: null,
    longitude: null,
    gpsAccuracy: null,
    gpsCapturedAt: null,
    gpsUnavailableReason: "",
    photo: null,
    notes: "",
  };
}

export async function saveSalesWaybill(waybill: SalesWaybill) {
  // Callers update `updatedAt` when the user changes data. Returning the exact
  // same object matters: the editor's debounced autosave must not create a
  // render/save loop simply because IndexedDB accepted the record.
  await tx(WAYBILLS, "readwrite", (store) => store.put(waybill));
  return waybill;
}

export async function getSalesWaybill(id: string): Promise<SalesWaybill | null> {
  return (await tx<SalesWaybill | undefined>(WAYBILLS, "readonly", (store) => store.get(id))) || null;
}

export async function listSalesWaybills(): Promise<SalesWaybill[]> {
  const items = (await tx<SalesWaybill[]>(WAYBILLS, "readonly", (store) => store.getAll())) || [];
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteSalesWaybill(id: string) {
  await tx(WAYBILLS, "readwrite", (store) => store.delete(id));
}

export async function getSalesMobileSettings(): Promise<SalesMobileSettings> {
  return (await tx<SalesMobileSettings | undefined>(SETTINGS, "readonly", (store) => store.get("profile"))) || defaultSettings();
}

export async function saveSalesMobileSettings(settings: SalesMobileSettings) {
  const next = { ...settings, id: "profile" as const, updatedAt: new Date().toISOString() };
  await tx(SETTINGS, "readwrite", (store) => store.put(next));
  return next;
}

export async function getSalesReferences(): Promise<SalesMobileReferences> {
  return (await tx<SalesMobileReferences | undefined>(REFERENCES, "readonly", (store) => store.get("references"))) || emptyReferences();
}

function resultList<T>(payload: T[] | { results?: T[] }) {
  return Array.isArray(payload) ? payload : payload.results || [];
}

export async function refreshSalesReferences(): Promise<SalesMobileReferences> {
  const cached = await getSalesReferences();
  try {
    const [customerPayload, productPayload] = await Promise.all([
      api<SalesReferenceCustomer[] | { results?: SalesReferenceCustomer[] }>("/customers/?is_active=true"),
      api<SalesReferenceProduct[] | { results?: SalesReferenceProduct[] }>("/products/?is_active=true"),
    ]);
    const next: SalesMobileReferences = {
      id: "references",
      customers: resultList(customerPayload),
      products: resultList(productPayload),
      savedAt: new Date().toISOString(),
    };
    await tx(REFERENCES, "readwrite", (store) => store.put(next));
    return next;
  } catch {
    return cached;
  }
}

export async function hashPin(pin: string) {
  const bytes = new TextEncoder().encode(`safiroute-sales-pin:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function waybillChecklist(waybill: SalesWaybill) {
  const meaningfulLines = waybill.items.filter((item) => item.description.trim() || item.qty || item.remarks.trim());
  const itemLinesValid =
    meaningfulLines.length > 0 &&
    meaningfulLines.every((item) => item.description.trim() && Number.isFinite(Number(item.qty)) && Number(item.qty) > 0);
  return [
    { id: "customer", label: "Customer / deliver to", done: Boolean(waybill.deliverTo.trim()) },
    { id: "address", label: "Delivery address", done: Boolean(waybill.deliveryAddress.trim()) },
    { id: "item", label: "Product and quantity", done: itemLinesValid },
    { id: "sales", label: "Sales name and signature", done: Boolean(waybill.authorisedBy.trim() && waybill.authorisedSignature) },
    { id: "dispatch", label: "Dispatch name, vehicle and signature", done: Boolean(waybill.dispatchedBy.trim() && waybill.vehicleNumber.trim() && waybill.dispatchedSignature) },
    { id: "customer-sign", label: "Customer name and signature", done: Boolean(waybill.receivedBy.trim() && waybill.customerSignature) },
    { id: "proof", label: "GPS or reason", done: (waybill.latitude != null && waybill.longitude != null) || Boolean(waybill.gpsUnavailableReason.trim()) },
    { id: "photo", label: "Delivery photo", done: Boolean(waybill.photo) },
  ];
}

export function validateSalesWaybill(waybill: SalesWaybill) {
  return waybillChecklist(waybill)
    .filter((item) => !item.done)
    .map((item) => item.label);
}

export function isMeaningfulSalesDraft(waybill: SalesWaybill) {
  return Boolean(
    waybill.deliverTo.trim() ||
      waybill.deliveryAddress.trim() ||
      waybill.contactName.trim() ||
      waybill.contactPhone.trim() ||
      waybill.items.some((item) => item.description.trim() || item.qty || item.remarks.trim()) ||
      waybill.dispatchedBy.trim() ||
      waybill.receivedBy.trim() ||
      waybill.photo ||
      waybill.latitude != null ||
      waybill.authorisedSignature ||
      waybill.dispatchedSignature ||
      waybill.customerSignature
  );
}

function ingestPayload(waybill: SalesWaybill) {
  return {
    client_uuid: waybill.id,
    phone_number: waybill.localNumber,
    deliver_to: waybill.deliverTo,
    delivery_contact_name: waybill.contactName,
    contact_phone: waybill.contactPhone,
    delivery_address_text: waybill.deliveryAddress,
    document_date: waybill.documentDate,
    authorised_by_name: waybill.authorisedBy,
    authorised_remarks: waybill.authorisedRemarks,
    dispatched_by_name: waybill.dispatchedBy,
    vehicle_registration: waybill.vehicleNumber,
    received_by: waybill.receivedBy,
    received_by_role: waybill.receivedByRole,
    items: waybill.items
      .filter((item) => item.description.trim() || item.qty || item.remarks.trim())
      .map((item) => ({ product_name: item.description.trim(), ordered_qty: item.qty, notes: item.remarks })),
    authorised_signature: waybill.authorisedSignature,
    dispatched_signature: waybill.dispatchedSignature,
    customer_signature: waybill.customerSignature,
    lat: waybill.latitude,
    lng: waybill.longitude,
    gps_accuracy: waybill.gpsAccuracy,
    gps_captured_at: waybill.gpsCapturedAt,
    gps_unavailable_reason: waybill.gpsUnavailableReason,
    photo: waybill.photo,
    delivery_notes: waybill.notes,
    device_timestamp: waybill.completedAt || waybill.updatedAt,
  };
}

export async function syncSalesWaybill(waybill: SalesWaybill) {
  if (waybill.status !== "completed") return waybill;
  const syncing: SalesWaybill = { ...waybill, syncStatus: "syncing", syncError: "" };
  await saveSalesWaybill(syncing);
  try {
    const result = await api<{
      accepted: boolean;
      id: number;
      waybill_number: string;
      verification_token?: string;
    }>("/mobile-waybills/ingest/", {
      method: "POST",
      body: JSON.stringify(ingestPayload(syncing)),
    });
    const synced: SalesWaybill = {
      ...syncing,
      syncStatus: "synced",
      syncError: "",
      syncedAt: new Date().toISOString(),
      serverId: result.id,
      serverNumber: result.waybill_number,
      verificationToken: result.verification_token,
    };
    await saveSalesWaybill(synced);
    return synced;
  } catch (error) {
    const failed: SalesWaybill = {
      ...syncing,
      syncStatus: "failed",
      syncError: error instanceof Error ? error.message : "HQ did not accept this waybill yet.",
    };
    await saveSalesWaybill(failed);
    return failed;
  }
}

export async function flushSalesWaybills() {
  const items = (await listSalesWaybills()).filter(
    (item) => item.status === "completed" && item.syncStatus !== "synced"
  );
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    const synced = await syncSalesWaybill({ ...item, syncStatus: "pending" });
    if (synced.syncStatus === "synced") sent += 1;
    else failed += 1;
  }
  return { sent, failed, pending: Math.max(0, items.length - sent) };
}

export function buildSalesBackup(settings: SalesMobileSettings, waybills: SalesWaybill[]): SalesBackup {
  return {
    app: "SafiRoute",
    format: "sales-mobile-backup-v1",
    exportedAt: new Date().toISOString(),
    settings: {
      phone: settings.phone,
      vehicleNumber: settings.vehicleNumber,
      authorisedSignature: settings.authorisedSignature,
    },
    waybills,
  };
}

function isRestorableWaybill(value: unknown): value is SalesWaybill {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SalesWaybill>;
  return Boolean(
    typeof item.id === "string" &&
      typeof item.localNumber === "string" &&
      typeof item.createdAt === "string" &&
      typeof item.updatedAt === "string" &&
      (item.status === "draft" || item.status === "completed") &&
      Array.isArray(item.items)
  );
}

export async function restoreSalesBackup(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new Error("This is not a SafiRoute backup file.");
  const backup = payload as Partial<SalesBackup>;
  if (backup.app !== "SafiRoute" || backup.format !== "sales-mobile-backup-v1" || !Array.isArray(backup.waybills)) {
    throw new Error("This backup is not a supported SafiRoute Sales backup.");
  }
  const waybills = backup.waybills.filter(isRestorableWaybill);
  if (waybills.length !== backup.waybills.length) throw new Error("The backup contains an invalid waybill record.");
  await putMany(WAYBILLS, waybills);

  const current = await getSalesMobileSettings();
  const restoredSettings = await saveSalesMobileSettings({
    ...current,
    phone: typeof backup.settings?.phone === "string" ? backup.settings.phone : current.phone,
    vehicleNumber: typeof backup.settings?.vehicleNumber === "string" ? backup.settings.vehicleNumber : current.vehicleNumber,
    authorisedSignature:
      typeof backup.settings?.authorisedSignature === "string" || backup.settings?.authorisedSignature === null
        ? backup.settings.authorisedSignature
        : current.authorisedSignature,
  });
  return { restored: waybills.length, settings: restoredSettings };
}
