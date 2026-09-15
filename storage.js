const DB_NAME = "safiroute";
const DB_VERSION = 1;
const STORE = "waybills";

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function saveWaybill(waybill) {
  return useStore("readwrite", (store) => store.put(waybill));
}

export function getWaybill(id) {
  return useStore("readonly", (store) => store.get(id));
}

export async function listWaybills() {
  const items = await useStore("readonly", (store) => store.getAll());
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteWaybill(id) {
  return useStore("readwrite", (store) => store.delete(id));
}

