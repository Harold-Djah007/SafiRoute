const DB_NAME = "safiroute";
const DB_VERSION = 2;
const STORE = "waybills";
const SETTINGS = "settings";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("syncStatus", "syncStatus");
      }
      if (!db.objectStoreNames.contains(SETTINGS)) {
        db.createObjectStore(SETTINGS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore(storeName, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function saveWaybill(waybill) {
  return useStore(STORE, "readwrite", (store) => store.put(waybill));
}

export function getWaybill(id) {
  return useStore(STORE, "readonly", (store) => store.get(id));
}

export async function listWaybills() {
  const items = await useStore(STORE, "readonly", (store) => store.getAll());
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteWaybill(id) {
  return useStore(STORE, "readwrite", (store) => store.delete(id));
}

export async function saveWaybills(items) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    for (const item of items) store.put(item);
    transaction.oncomplete = () => {
      db.close();
      resolve(items.length);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export function getProfile() {
  return useStore(SETTINGS, "readonly", (store) => store.get("profile"));
}

export function saveProfile(profile) {
  return useStore(SETTINGS, "readwrite", (store) => store.put({ ...profile, id: "profile" }));
}

export async function hashPin(pin) {
  const data = new TextEncoder().encode(`safiroute-pin:${pin}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
