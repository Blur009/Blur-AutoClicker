const DB_NAME = "blur-ac-bg";
const STORE_NAME = "images";
const IMAGE_KEY = "background";

/** Sentinel written to settings.json instead of the raw DataURL. */
export const BG_IMAGE_SENTINEL = "__local__";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist a background image DataURL to IndexedDB. */
export async function saveBgImage(dataUrl: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(dataUrl, IMAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load the stored background image DataURL.
 * Returns `null` if no image has been saved yet.
 */
export async function loadBgImage(): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(IMAGE_KEY);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Remove the stored background image from IndexedDB. */
export async function clearBgImage(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(IMAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
