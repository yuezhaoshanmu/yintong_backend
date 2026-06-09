const DB_NAME = "silver-child-demo-media";
const DB_VERSION = 1;
const STORE_NAME = "media";

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持本地媒体保存"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本地媒体库打开失败"));
  });
}

export async function saveMediaBlob(key: string, blob: Blob): Promise<void> {
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("媒体保存失败"));
  });
  db.close();
}

export async function loadMediaBlob(key: string): Promise<Blob | undefined> {
  const db = await openMediaDb();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error ?? new Error("媒体读取失败"));
  });
  db.close();
  return blob;
}

export async function deleteMediaBlob(key: string): Promise<void> {
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("媒体删除失败"));
  });
  db.close();
}
