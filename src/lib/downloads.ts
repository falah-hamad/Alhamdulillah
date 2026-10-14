export type DownloadCategory = "نسخة احتياطية" | "تقرير" | "محادثة" | "ملف";

export interface DownloadRecord {
  id: string;
  name: string;
  category: DownloadCategory | string;
  mimeType: string;
  size: number;
  createdAt: number;
  blob: Blob;
}

const DB_NAME = "alhamdulillah-downloads";
const STORE_NAME = "files";
const CHANGE_EVENT = "alhamdulillah-downloads-changed";

function openDownloadsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("التخزين المحلي للملفات غير متاح في هذا الجهاز"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("تعذر فتح سجل التنزيلات"));
  });
}

function announceChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export async function recordDownloadedFile(
  name: string,
  blob: Blob,
  category: DownloadCategory | string = "ملف",
): Promise<void> {
  const db = await openDownloadsDb();
  const record: DownloadRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: name || "download",
    category,
    mimeType: blob.type || "application/octet-stream",
    size: blob.size,
    createdAt: Date.now(),
    blob,
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("تعذر حفظ سجل التنزيل"));
    transaction.onabort = () => reject(transaction.error || new Error("تم إلغاء حفظ سجل التنزيل"));
  });
  db.close();
  announceChange();
}

export async function listDownloadedFiles(): Promise<DownloadRecord[]> {
  const db = await openDownloadsDb();
  const records = await new Promise<DownloadRecord[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []) as DownloadRecord[]);
    request.onerror = () => reject(request.error || new Error("تعذر قراءة سجل التنزيلات"));
  });
  db.close();
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeDownloadedFile(id: string): Promise<void> {
  const db = await openDownloadsDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("تعذر حذف الملف من سجل التنزيلات"));
  });
  db.close();
  announceChange();
}

export function subscribeToDownloads(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export async function trackDownloadAnchor(anchor: HTMLAnchorElement): Promise<void> {
  const name = anchor.download?.trim();
  const href = anchor.href;
  if (!name || !href || href.startsWith("javascript:")) return;
  try {
    const response = await fetch(href);
    if (!response.ok) throw new Error("Could not read download payload");
    const blob = await response.blob();
    const lowerName = name.toLowerCase();
    const category = lowerName.includes("backup") || lowerName.includes("نسخة") || lowerName.endsWith(".json")
      ? "نسخة احتياطية"
      : lowerName.includes("report") || lowerName.includes("تقرير") || lowerName.endsWith(".pdf")
        ? "تقرير"
        : lowerName.includes("chat") || lowerName.includes("محادث")
          ? "محادثة"
          : "ملف";
    await recordDownloadedFile(name, blob, category);
  } catch (error) {
    console.warn("Could not add file to in-app downloads:", error);
  }
}

export function downloadStoredFile(record: DownloadRecord): void {
  const url = URL.createObjectURL(record.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = record.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
