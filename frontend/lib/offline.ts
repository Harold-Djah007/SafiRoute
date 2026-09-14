import { api, type Waybill } from "@/lib/api";
import { dataUrlToBlob } from "@/lib/media";

const DB_NAME = "safiroute-field";
const DB_VERSION = 1;

export type QueueItem = {
  waybillId: number;
  waybillNumber: string;
  customerName: string;
  clientUuid: string;
  queuedAt: number;
  outcome: "delivered" | "partially_delivered" | "delivery_failed";
  customerRepName: string;
  customerRepRole: string;
  deliveryNotes: string;
  failureReason: string;
  gpsUnavailableReason: string;
  lat?: number;
  lng?: number;
  gpsAccuracy?: number;
  items: { id: number; delivered_qty: string; rejected_qty: string; notes?: string }[];
  customerSignature: string;
  driverSignature: string;
  photos: string[];
};

export type DeliveryDraft = {
  waybillId: number;
  outcome: QueueItem["outcome"];
  customerRepName: string;
  customerRepRole: string;
  deliveryNotes: string;
  failureReason: string;
  qtys: Record<number, string>;
  rejected: Record<number, string>;
  customerSignature?: string;
  driverSignature?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("waybills")) db.createObjectStore("waybills", { keyPath: "id" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "waybillId" });
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "waybillId" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export async function cacheWaybills(waybills: Waybill[]) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("waybills", "readwrite");
    for (const waybill of waybills) transaction.objectStore("waybills").put(waybill);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  await tx("meta", "readwrite", (store) => store.put(new Date().toISOString(), "downloadedAt"));
}

export async function cacheWaybill(waybill: Waybill) {
  await tx("waybills", "readwrite", (store) => store.put(waybill));
}

export async function readCachedWaybill(id: number): Promise<Waybill | null> {
  return (await tx<Waybill | undefined>("waybills", "readonly", (store) => store.get(id))) || null;
}

export async function listCachedWaybills(): Promise<Waybill[]> {
  return (await tx<Waybill[]>("waybills", "readonly", (store) => store.getAll())) || [];
}

export async function downloadedAt(): Promise<string | null> {
  return (await tx<string | undefined>("meta", "readonly", (store) => store.get("downloadedAt"))) || null;
}

export async function saveQueueItem(item: QueueItem) {
  await tx("queue", "readwrite", (store) => store.put(item));
}

export async function removeQueueItem(waybillId: number) {
  await tx("queue", "readwrite", (store) => store.delete(waybillId));
}

export async function listQueue(): Promise<QueueItem[]> {
  return (await tx<QueueItem[]>("queue", "readonly", (store) => store.getAll())) || [];
}

export async function getQueueItem(waybillId: number): Promise<QueueItem | null> {
  return (await tx<QueueItem | undefined>("queue", "readonly", (store) => store.get(waybillId))) || null;
}

export async function saveDraft(draft: DeliveryDraft) {
  await tx("drafts", "readwrite", (store) => store.put(draft));
}

export async function readDraft(waybillId: number): Promise<DeliveryDraft | null> {
  return (await tx<DeliveryDraft | undefined>("drafts", "readonly", (store) => store.get(waybillId))) || null;
}

export async function clearDraft(waybillId: number) {
  await tx("drafts", "readwrite", (store) => store.delete(waybillId));
}

function clientUuid(waybillId: number) {
  const key = `safiroute_uuid_${waybillId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export function ensureClientUuid(waybillId: number) {
  return clientUuid(waybillId);
}

async function toFormData(item: QueueItem) {
  const form = new FormData();
  form.append("outcome", item.outcome);
  form.append("customer_rep_name", item.customerRepName);
  form.append("customer_rep_role", item.customerRepRole);
  form.append("delivery_notes", item.deliveryNotes);
  form.append("failure_reason", item.failureReason);
  form.append("client_uuid", item.clientUuid);
  form.append("device_timestamp", new Date(item.queuedAt).toISOString());
  form.append("items", JSON.stringify(item.items));
  if (item.lat != null && item.lng != null) {
    form.append("lat", String(item.lat));
    form.append("lng", String(item.lng));
    form.append("gps_accuracy", String(item.gpsAccuracy || ""));
  } else {
    form.append("gps_unavailable_reason", item.gpsUnavailableReason || "GPS unavailable");
  }
  if (item.customerSignature) {
    form.append("customer_signature", dataUrlToBlob(item.customerSignature), "customer.png");
  }
  if (item.driverSignature) {
    form.append("driver_signature", dataUrlToBlob(item.driverSignature), "driver.png");
  }
  item.photos.forEach((photo, index) => {
    form.append("photos", dataUrlToBlob(photo), `photo-${index + 1}.jpg`);
  });
  return form;
}

export async function submitDelivery(item: QueueItem) {
  const form = await toFormData(item);
  await api(`/waybills/${item.waybillId}/start_transit/`, { method: "POST" }).catch(() => undefined);
  await api(`/waybills/${item.waybillId}/complete_delivery/`, { method: "POST", body: form });
  await removeQueueItem(item.waybillId);
  await clearDraft(item.waybillId);
}

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const items = await listQueue();
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await submitDelivery(item);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}

export async function downloadFieldPack() {
  const pack = await api<{ downloaded_at: string; waybills: Waybill[] }>("/waybills/field_pack/");
  await cacheWaybills(pack.waybills);
  return pack;
}
