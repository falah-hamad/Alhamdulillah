import React, { useCallback, useEffect, useState } from "react";
import {
  Download, FileText, FileJson, Trash2, RefreshCw, FolderDown, Clock3, HardDrive,
  Pencil, Share2, ExternalLink, RotateCcw, Trash, Search, Files,
} from "lucide-react";
import {
  downloadStoredFile,
  listDownloadedFiles,
  listTrashFiles,
  moveDownloadedFileToTrash,
  permanentlyDeleteDownloadedFile,
  renameDownloadedFile,
  restoreDownloadedFile,
  openStoredFile,
  shareStoredFile,
  subscribeToDownloads,
  type DownloadRecord,
} from "../lib/downloads";

type DownloadsTab = "files" | "trash";
type DownloadSort = "newest" | "oldest" | "nameAsc" | "nameDesc" | "sizeDesc" | "sizeAsc" | "category";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ar-IQ", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function DownloadsView() {
  const [files, setFiles] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<DownloadsTab>("files");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<DownloadSort>("newest");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(tab === "files" ? await listDownloadedFiles() : await listTrashFiles());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر قراءة الملفات المحفوظة على هذا الجهاز.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void refresh();
    return subscribeToDownloads(() => void refresh());
  }, [refresh]);

  const handleMoveToTrash = async (file: DownloadRecord) => {
    if (!window.confirm(`تنقل «${file.name}» إلى مهملات التطبيق؟ لن يُحذف الملف الأصلي من مجلد تنزيلات الهاتف.`)) return;
    try {
      await moveDownloadedFileToTrash(file.id);
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } catch {
      setError("تعذر نقل الملف إلى المهملات.");
    }
  };

  const handleRestore = async (file: DownloadRecord) => {
    try {
      await restoreDownloadedFile(file.id);
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } catch {
      setError("تعذرت استعادة الملف.");
    }
  };

  const handlePermanentDelete = async (file: DownloadRecord) => {
    if (!window.confirm(`حذف النسخة المحفوظة داخل التطبيق نهائيًا «${file.name}»؟ هذا لا يحذف نسخة الهاتف الأصلية.`)) return;
    try {
      await permanentlyDeleteDownloadedFile(file.id);
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } catch {
      setError("تعذر حذف النسخة نهائيًا.");
    }
  };

  const handleRename = async (file: DownloadRecord) => {
    const nextName = window.prompt("اكتب الاسم الجديد للملف:", file.name);
    if (nextName === null || !nextName.trim() || nextName.trim() === file.name) return;
    try {
      await renameDownloadedFile(file.id, nextName);
      setFiles((current) => current.map((item) => item.id === file.id ? { ...item, name: nextName.trim().replace(/[\\\\/:*?"<>|]/g, "_") } : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذرت إعادة تسمية الملف.");
    }
  };

  const handleOpen = async (file: DownloadRecord) => {
    try {
      await openStoredFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر فتح الملف.");
    }
  };

  const handleShare = async (file: DownloadRecord) => {
    try {
      const shared = await shareStoredFile(file);
      if (!shared) {
        await downloadStoredFile(file);
        window.alert("المشاركة المباشرة غير مدعومة هنا؛ تم حفظ نسخة داخل مجلد Downloads/Alhamdulillah لتشاركها من مدير الملفات.");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "تعذرت مشاركة الملف.");
    }
  };

  const visibleFiles = files
    .filter((file) => file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case "oldest": return a.createdAt - b.createdAt;
        case "nameAsc": return a.name.localeCompare(b.name, "ar");
        case "nameDesc": return b.name.localeCompare(a.name, "ar");
        case "sizeDesc": return b.size - a.size;
        case "sizeAsc": return a.size - b.size;
        case "category": return String(a.category).localeCompare(String(b.category), "ar") || b.createdAt - a.createdAt;
        case "newest":
        default: return b.createdAt - a.createdAt;
      }
    });

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6" dir="rtl">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><FolderDown className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900">التنزيلات</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              افتح ملفاتك أو شاركها أو أعد تسميتها، واسترجع الملفات التي نقلتها إلى مهملات التطبيق.
            </p>
          </div>
          <button type="button" onClick={() => void refresh()} title="تحديث القائمة" aria-label="تحديث القائمة" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button type="button" onClick={() => setTab("files")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold ${tab === "files" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>
            <Files className="h-4 w-4" /> ملفاتي
          </button>
          <button type="button" onClick={() => setTab("trash")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold ${tab === "trash" ? "bg-white text-rose-700 shadow-sm" : "text-slate-600"}`}>
            <Trash2 className="h-4 w-4" /> المهملات
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الملف..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-9 pl-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="downloads-sort" className="text-xs font-semibold text-slate-600">فرز حسب:</label>
          <select id="downloads-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as DownloadSort)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400">
            <option value="newest">الأحدث أولاً</option>
            <option value="oldest">الأقدم أولاً</option>
            <option value="nameAsc">الاسم: أ إلى ي</option>
            <option value="nameDesc">الاسم: ي إلى أ</option>
            <option value="sizeDesc">الحجم: الأكبر أولاً</option>
            <option value="sizeAsc">الحجم: الأصغر أولاً</option>
            <option value="category">نوع الملف</option>
          </select>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          تنزيل ملفات أندرويد من هذه الصفحة يحفظها داخل مجلد Downloads/Alhamdulillah. أما إعادة التسمية والمهملات فتخص النسخة المسجلة داخل التطبيق.
        </p>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">جارٍ تحميل الملفات…</div>
      ) : visibleFiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          {tab === "trash" ? <Trash2 className="mx-auto h-10 w-10 text-slate-300" /> : <FolderDown className="mx-auto h-10 w-10 text-slate-300" />}
          <h3 className="mt-3 text-sm font-bold text-slate-700">{query ? "ما لقينا ملف بهذا الاسم" : tab === "trash" ? "المهملات فارغة" : "ماكو ملفات بالتنزيلات لحد الآن"}</h3>
          <p className="mx-auto mt-1 max-w-md text-xs leading-6 text-slate-500">
            {tab === "trash" ? "الملفات التي تنقلها إلى المهملات ستظهر هنا، ويمكنك استعادتها أو حذف نسختها الداخلية نهائيًا." : "الملفات التي يسجّلها التطبيق ستظهر هنا، مثل التقارير والنسخ الاحتياطية."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
            <span className="text-xs font-bold text-slate-700">{tab === "trash" ? "المهملات" : "الملفات المحفوظة داخل التطبيق"}</span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">{visibleFiles.length} ملف</span>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleFiles.map((file) => (
              <article key={file.id} className="flex min-w-0 items-start gap-3 p-3 sm:p-4">
                <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  {file.mimeType.includes("json") || file.name.toLowerCase().endsWith(".json") ? <FileJson className="h-5 w-5 text-amber-600" /> : <FileText className="h-5 w-5 text-blue-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-sm font-bold text-slate-800">{file.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5">{file.category}</span>
                    <span className="inline-flex items-center gap-1"><HardDrive className="h-3 w-3" />{formatBytes(file.size)}</span>
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDate(file.createdAt)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {tab === "files" ? (
                      <>
                        <button type="button" onClick={() => void handleOpen(file)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink className="h-3.5 w-3.5" /> فتح</button>
                        <button type="button" onClick={() => void handleShare(file)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Share2 className="h-3.5 w-3.5" /> مشاركة</button>
                        <button type="button" onClick={() => void handleRename(file)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /> إعادة تسمية</button>
                        <button type="button" onClick={() => void downloadStoredFile(file).catch((e) => setError(e instanceof Error ? e.message : "تعذر تنزيل الملف."))} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"><Download className="h-3.5 w-3.5" /> تنزيل</button>
                        <button type="button" onClick={() => void handleMoveToTrash(file)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> إلى المهملات</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => void handleRestore(file)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><RotateCcw className="h-3.5 w-3.5" /> استعادة</button>
                        <button type="button" onClick={() => void handlePermanentDelete(file)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash className="h-3.5 w-3.5" /> حذف نهائي</button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
