export type DownloadCategory = "نسخة احتياطية" | "تقرير" | "محادثة" | "ملف";

export interface DownloadRecord {
  id: string;
  name: string;
  category: DownloadCategory | string;
  mimeType: string;
  size: number;
  createdAt: number;
  blob: Blob;
  /** Timestamp when moved to the in-app recycle bin; absent while active. */
  deletedAt?: number;
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

async function readAllDownloadRecords(): Promise<DownloadRecord[]> {
  const db = await openDownloadsDb();
  const records = await new Promise<DownloadRecord[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []) as DownloadRecord[]);
    request.onerror = () => reject(request.error || new Error("تعذر قراءة سجل التنزيلات"));
  });
  db.close();
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listDownloadedFiles(): Promise<DownloadRecord[]> {
  return (await readAllDownloadRecords()).filter((record) => !record.deletedAt);
}

export async function listTrashFiles(): Promise<DownloadRecord[]> {
  return (await readAllDownloadRecords()).filter((record) => Boolean(record.deletedAt));
}

async function updateDownloadRecord(id: string, update: (record: DownloadRecord) => DownloadRecord | null): Promise<void> {
  const db = await openDownloadsDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as DownloadRecord | undefined;
      if (!record) return;
      const next = update(record);
      if (next) store.put(next);
      else store.delete(id);
    };
    request.onerror = () => reject(request.error || new Error("تعذر الوصول إلى الملف"));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("تعذر تحديث الملف"));
    transaction.onabort = () => reject(transaction.error || new Error("تم إلغاء تحديث الملف"));
  });
  db.close();
  announceChange();
}

export async function moveDownloadedFileToTrash(id: string): Promise<void> {
  await updateDownloadRecord(id, (record) => ({ ...record, deletedAt: Date.now() }));
}

export async function restoreDownloadedFile(id: string): Promise<void> {
  await updateDownloadRecord(id, (record) => {
    const restored = { ...record };
    delete restored.deletedAt;
    return restored;
  });
}

export async function permanentlyDeleteDownloadedFile(id: string): Promise<void> {
  await updateDownloadRecord(id, () => null);
}

/** Legacy helper retained for any existing callers; this permanently removes the in-app copy. */
export async function removeDownloadedFile(id: string): Promise<void> {
  await permanentlyDeleteDownloadedFile(id);
}

export async function renameDownloadedFile(id: string, name: string): Promise<void> {
  const cleanName = name.trim().replace(/[\\\\/:*?"<>|]/g, "_");
  if (!cleanName) throw new Error("اكتب اسمًا صالحًا للملف");
  await updateDownloadRecord(id, (record) => ({ ...record, name: cleanName }));
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

export function openStoredFile(record: DownloadRecord): void {
  const url = URL.createObjectURL(record.blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error("المتصفح منع فتح الملف؛ اسمح بفتح النوافذ أو نزّل الملف وافتحه من الهاتف");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function shareStoredFile(record: DownloadRecord): Promise<boolean> {
  const shareNavigator = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (!shareNavigator.share) return false;
  const file = new File([record.blob], record.name, { type: record.mimeType || record.blob.type || "application/octet-stream" });
  if (shareNavigator.canShare && !shareNavigator.canShare({ files: [file] })) return false;
  await shareNavigator.share({ files: [file], title: record.name });
  return true;
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
