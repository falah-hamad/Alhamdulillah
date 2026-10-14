import React, { useCallback, useEffect, useState } from "react";
import { Download, FileText, FileJson, Trash2, RefreshCw, FolderDown, Clock3, HardDrive } from "lucide-react";
import {
  downloadStoredFile,
  listDownloadedFiles,
  removeDownloadedFile,
  subscribeToDownloads,
  type DownloadRecord,
} from "../lib/downloads";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ar-IQ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DownloadsView() {
  const [files, setFiles] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await listDownloadedFiles());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر قراءة التنزيلات المحفوظة على هذا الجهاز.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeToDownloads(() => void refresh());
  }, [refresh]);

  const handleDelete = async (file: DownloadRecord) => {
    if (!window.confirm(`هل تريد إزالة «${file.name}» من سجل التنزيلات داخل التطبيق؟`)) return;
    try {
      await removeDownloadedFile(file.id);
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } catch {
      setError("تعذر إزالة الملف من سجل التنزيلات.");
    }
  };

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6" dir="rtl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
            <FolderDown className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900">التنزيلات</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              مكان واحد للملفات التي يصدرها التطبيق أو ينزّلها. تبقى النسخة المحفوظة هنا متاحة حتى بعد إغلاق التطبيق.
            </p>
          </div>
          <button type="button" onClick={() => void refresh()} title="تحديث القائمة" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          جارٍ تحميل قائمة التنزيلات…
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <FolderDown className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-700">ماكو ملفات بالتنزيلات لحد الآن</h3>
          <p className="mx-auto mt-1 max-w-md text-xs leading-6 text-slate-500">
            أي ملف يتم تصديره من داخل التطبيق ويُسجَّل بنجاح سيظهر هنا، مثل النسخ الاحتياطية وتقارير وملفات المحادثات.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
            <span className="text-xs font-bold text-slate-700">الملفات المحفوظة داخل التطبيق</span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">{files.length} ملف</span>
          </div>
          <div className="divide-y divide-slate-100">
            {files.map((file) => (
              <article key={file.id} className="flex min-w-0 items-center gap-3 p-3 sm:p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  {file.mimeType.includes("json") || file.name.toLowerCase().endsWith(".json")
                    ? <FileJson className="h-5 w-5 text-amber-600" />
                    : <FileText className="h-5 w-5 text-blue-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-sm font-bold text-slate-800">{file.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5">{file.category}</span>
                    <span className="inline-flex items-center gap-1"><HardDrive className="h-3 w-3" />{formatBytes(file.size)}</span>
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDate(file.createdAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => downloadStoredFile(file)} title="تنزيل الملف مرة أخرى" className="rounded-lg bg-blue-50 p-2 text-blue-700 hover:bg-blue-100">
                    <Download className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void handleDelete(file)} title="إزالة من سجل التنزيلات" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
