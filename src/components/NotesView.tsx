import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getDownloadURL, ref as storageRef, uploadBytes, deleteObject } from "firebase/storage";
import { AlignLeft, BellRing, Bold, Check, CheckSquare, ChevronRight, Clock3, Copy, Download, FileText, Heart, ImagePlus, Italic, Link2, List, ListOrdered, LoaderCircle, Pin, Plus, Printer, RotateCcw, Search, Share2, StickyNote, Trash2, Underline, X } from "lucide-react";
import { db, storage } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

interface RecordItem { id: string; name?: string; title?: string; number?: string; invoiceNumber?: string; customerId?: string; amount?: number; total?: number; }
interface Attachment { id: string; name: string; contentType: string; size: number; url: string; path: string; }
type Priority = "normal" | "important" | "urgent";
type Filter = "all" | "pinned" | "favorites" | "tasks" | "overdue" | "trash";
interface Note {
  id: string; userId?: string; title: string; content: string; color: string; textColor: string; fontSize: number;
  favorite: boolean; pinned: boolean; completed: boolean; createdAt: string; updatedAt: string; category: string;
  tags: string[]; priority: Priority; relatedType: string; relatedId: string; relatedLabel: string;
  reminderAt: string; isDeleted: boolean; deletedAt?: string; attachments: Attachment[];
}
interface Props {
  customers: RecordItem[]; products: RecordItem[]; invoices: RecordItem[]; payments: RecordItem[];
  onNavigateToRecord: (type: string, id: string) => void;
}
const LOCAL_KEY = "alhamdulillah.notes.guest.v1";
const COLORS = [
  ["أبيض", "#ffffff"], ["عاجي", "#fffaf0"], ["أزرق", "#eff6ff"], ["أخضر", "#f0fdf4"],
  ["أصفر", "#fefce8"], ["وردي", "#fdf2f8"], ["بنفسجي", "#f5f3ff"], ["رمادي", "#f8fafc"],
];
const PRIORITY: Record<Priority, string> = { normal: "عادية", important: "مهمة", urgent: "عاجلة" };
const printCss = "@media print { body * { visibility:hidden!important } #notes-print-view,#notes-print-view * { visibility:visible!important } #notes-print-view { display:block!important;position:fixed;inset:0;width:100%;padding:12mm;background:white;color:#111827;direction:rtl;font-family:Arial,sans-serif } #notes-print-view img { max-width:100%;max-height:240px;object-fit:contain } @page { size:A4;margin:10mm } }";

function createNote(): Note {
  const now = new Date().toISOString();
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : "note_" + Date.now() + Math.random().toString(36).slice(2),
    title: "", content: "", color: "#fffaf0", textColor: "#1e293b", fontSize: 16, favorite: false, pinned: false,
    completed: false, createdAt: now, updatedAt: now, category: "", tags: [], priority: "normal",
    relatedType: "", relatedId: "", relatedLabel: "", reminderAt: "", isDeleted: false, attachments: [],
  };
}
function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\*([^*]+)\*/g, "$1")
    .replace(/^- \[x\] /gim, "☑ ").replace(/^- \[ \] /gim, "☐ ").replace(/^- /gm, "• ").trim();
}
function escaped(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function preview(text: string): string {
  return text.split("\n").map((raw) => {
    let line = escaped(raw).replace(/^- \[x\] (.*)$/i, "☑ $1").replace(/^- \[ \] (.*)$/i, "☐ $1")
      .replace(/^- (.*)$/, "• $1").replace(/^\d+[.)] (.*)$/, "• $1");
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<u>$1</u>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return line || "&nbsp;";
  }).join("<br/>");
}
function dateText(value?: string): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat("ar-IQ", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function sizeText(bytes: number): string {
  return bytes < 1024 ? bytes + " بايت" : bytes < 1048576 ? (bytes / 1024).toFixed(1) + " KB" : (bytes / 1048576).toFixed(1) + " MB";
}
function notificationId(id: string): number {
  let hash = 11; for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return Math.max(1, hash);
}
function changed(a: Note, b?: Note): boolean {
  if (!b) return true;
  return ["title", "content", "color", "textColor", "fontSize", "favorite", "pinned", "completed", "category", "priority", "relatedType", "relatedId", "relatedLabel", "reminderAt", "isDeleted"].some((key) => (a as any)[key] !== (b as any)[key])
    || JSON.stringify(a.tags) !== JSON.stringify(b.tags) || JSON.stringify(a.attachments) !== JSON.stringify(b.attachments);
}

export default function NotesView({ customers, products, invoices, payments, onNavigateToRecord }: Props) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || null;
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState<Note | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"updatedAt" | "createdAt" | "title">("updatedAt");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    if (!uid) {
      try { setNotes(JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as Note[]); }
      catch { setNotes([]); setError("تعذرت قراءة الملاحظات المحفوظة محلياً."); }
      setLoading(false);
      return;
    }
    return onSnapshot(collection(db, "users", uid, "notes"), { includeMetadataChanges: true }, (snap) => {
      setNotes(snap.docs.map((d) => ({ ...d.data(), id: d.id, tags: Array.isArray(d.data().tags) ? d.data().tags : [], attachments: Array.isArray(d.data().attachments) ? d.data().attachments : [] } as Note)));
      setLoading(false);
      if (snap.metadata.hasPendingWrites) setSaveState("pending");
      else setSaveState((old) => old === "saving" ? old : "saved");
      setError("");
    }, (err) => {
      console.error("Notes listener error:", err); setLoading(false); setSaveState("error");
      setError("تعذر تحميل الملاحظات من Firestore. تحقق من الحساب وقواعد الوصول.");
    });
  }, [uid]);

  const categories = useMemo(() => Array.from(new Set(notes.filter((n) => !n.isDeleted && n.category.trim()).map((n) => n.category.trim())).values()).sort((a, b) => a.localeCompare(b, "ar")), [notes]);
  const recordOptions = useMemo(() => {
    const options: Array<{ value: string; type: string; id: string; label: string }> = [{ value: "task:", type: "task", id: "", label: "مهمة أو تذكير عام" }];
    customers.forEach((x) => options.push({ value: "customer:" + x.id, type: "customer", id: x.id, label: "عميل: " + (x.name || x.title || x.id) }));
    invoices.forEach((x) => options.push({ value: "invoice:" + x.id, type: "invoice", id: x.id, label: "فاتورة: " + (x.invoiceNumber || x.number || x.title || x.id) }));
    products.forEach((x) => options.push({ value: "product:" + x.id, type: "product", id: x.id, label: "بضاعة: " + (x.name || x.title || x.id) }));
    payments.forEach((x) => options.push({ value: "payment:" + x.id, type: "payment", id: x.id, label: "دفعة: " + (x.amount == null ? x.id : Number(x.amount).toLocaleString("ar-IQ")) }));
    return options;
  }, [customers, invoices, products, payments]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("ar");
    return notes.filter((n) => filter === "trash" ? n.isDeleted : !n.isDeleted).filter((n) => {
      if (filter === "pinned" && !n.pinned) return false;
      if (filter === "favorites" && !n.favorite) return false;
      if (filter === "tasks" && (n.completed || (!n.reminderAt && !n.content.includes("- [ ] ")))) return false;
      if (filter === "overdue" && (n.completed || !n.reminderAt || new Date(n.reminderAt).getTime() >= Date.now())) return false;
      if (q && !(n.title + " " + n.content + " " + n.category + " " + n.tags.join(" ") + " " + n.relatedLabel).toLocaleLowerCase("ar").includes(q)) return false;
      if (categoryFilter !== "all" && n.category !== categoryFilter) return false;
      if (colorFilter !== "all" && n.color !== colorFilter) return false;
      return true;
    }).sort((a, b) => {
      if (filter !== "trash" && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return sortBy === "title" ? a.title.localeCompare(b.title, "ar") : new Date(b[sortBy] || 0).getTime() - new Date(a[sortBy] || 0).getTime();
    });
  }, [notes, filter, search, categoryFilter, colorFilter, sortBy]);

  const savedDraft = draft ? notes.find((n) => n.id === draft.id) : undefined;
  const isDirty = Boolean(draft && changed(draft, savedDraft));
  const askDiscard = () => !isDirty || window.confirm("توجد تغييرات غير محفوظة. هل تريد تركها دون حفظ؟");
  const openNote = (note: Note) => { if (draft?.id !== note.id && !askDiscard()) return; setDraft(note); setError(""); setMessage(""); };
  const newNote = () => { if (!askDiscard()) return; setDraft(createNote()); setFilter("all"); setSaveState("idle"); setError(""); setMessage(""); };
  const patch = (value: Partial<Note>) => setDraft((old) => old ? { ...old, ...value } : old);

  const scheduleReminder = async (note: Note) => {
    if (!Capacitor.isNativePlatform()) {
      if (note.reminderAt) setMessage("حُفظ موعد التذكير داخل الملاحظة؛ إشعارات الويب غير مفعّلة من هذا القسم.");
      return;
    }
    const id = notificationId(note.id);
    try {
      if (!note.reminderAt || new Date(note.reminderAt).getTime() <= Date.now()) {
        await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => undefined); return;
      }
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") permission = await LocalNotifications.requestPermissions();
      if (permission.display !== "granted") { setMessage("حُفظت الملاحظة، لكن إذن الإشعارات غير مفعّل ولم يُجدول التذكير."); return; }
      await LocalNotifications.schedule({ notifications: [{ id, title: note.title || "تذكير من الملاحظات", body: plain(note.content).slice(0, 160) || "حان موعد متابعة الملاحظة.", schedule: { at: new Date(note.reminderAt) }, extra: { noteId: note.id } }] });
      setMessage("تم حفظ الملاحظة وجدولة إشعار التذكير على الجهاز.");
    } catch (e) { console.error("Schedule notification failed:", e); setMessage("حُفظت الملاحظة، لكن تعذرت جدولة إشعار التذكير. تحقق من إعدادات الجهاز."); }
  };

  const save = (candidate: Note): Promise<boolean> => {
    const finalNote = { ...candidate, title: candidate.title.trim() || plain(candidate.content).split("\n")[0].slice(0, 55) || "ملاحظة جديدة", updatedAt: new Date().toISOString(), userId: uid || undefined };
    setDraft(finalNote); setError(""); setMessage("");
    if (!uid) {
      try {
        const next = [finalNote, ...notes.filter((n) => n.id !== finalNote.id)];
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); setNotes(next); setSaveState("saved");
        setMessage("حُفظت الملاحظة على هذا الجهاز فقط."); return Promise.resolve(true);
      } catch (e) {
        console.error("Local note save failed:", e); setSaveState("error"); setError("تعذر الحفظ محلياً؛ قد تكون مساحة تخزين الجهاز ممتلئة."); return Promise.resolve(false);
      }
    }
    setSaveState(navigator.onLine ? "saving" : "pending");
    setNotes((old) => [finalNote, ...old.filter((n) => n.id !== finalNote.id)]);
    return setDoc(doc(db, "users", uid, "notes", finalNote.id), { ...finalNote, userId: uid }, { merge: true }).then(() => {
      setSaveState("saved"); setMessage("تم حفظ الملاحظة ومزامنتها مع الحساب."); void scheduleReminder(finalNote); return true;
    }).catch((e) => {
      console.error("Cloud note save failed:", e); setSaveState("error");
      setError("لم يؤكد Firebase حفظ الملاحظة. بقي النص في المحرر؛ تحقق من الاتصال والصلاحيات ثم أعد الحفظ."); return false;
    });
  };

  const toggleFlag = (note: Note, value: Partial<Note>) => {
    const next = { ...note, ...value }; void save(next); if (draft?.id === note.id) setDraft(next);
  };
  const moveToTrash = (note: Note) => {
    if (!window.confirm("نقل الملاحظة إلى المحذوفات؟ يمكنك استعادتها لاحقاً.")) return;
    const next = { ...note, isDeleted: true, deletedAt: new Date().toISOString() }; void save(next);
    if (draft?.id === note.id) setDraft(next); setFilter("trash");
  };
  const restore = (note: Note) => { const next = { ...note, isDeleted: false, deletedAt: undefined }; void save(next); setDraft(next); setFilter("all"); };
  const permanentDelete = async (note: Note) => {
    if (!window.confirm("هذا حذف نهائي لا يمكن التراجع عنه. هل تريد المتابعة؟")) return;
    setError("");
    try {
      if (uid) {
        for (const a of note.attachments || []) if (a.path) await deleteObject(storageRef(storage, a.path));
        await deleteDoc(doc(db, "users", uid, "notes", note.id));
      } else localStorage.setItem(LOCAL_KEY, JSON.stringify(notes.filter((n) => n.id !== note.id)));
      setNotes((old) => old.filter((n) => n.id !== note.id)); if (draft?.id === note.id) setDraft(null);
      setMessage("تم حذف الملاحظة نهائياً.");
    } catch (e) { console.error("Permanent delete failed:", e); setError("تعذر إكمال الحذف النهائي. تحقق من الاتصال وصلاحيات المرفقات."); }
  };
  const duplicate = (note: Note) => setDraft({ ...note, id: createNote().id, title: "نسخة من " + (note.title || "ملاحظة"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), favorite: false, pinned: false, completed: false, isDeleted: false, deletedAt: undefined, attachments: [] });

  const copy = async (note: Note) => {
    const text = (note.title ? note.title + "\n\n" : "") + plain(note.content);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { const el = document.createElement("textarea"); el.value = text; el.style.position = "fixed"; el.style.opacity = "0"; document.body.appendChild(el); el.select(); const ok = document.execCommand("copy"); el.remove(); if (!ok) throw new Error("copy unavailable"); }
      setMessage("تم نسخ نص الملاحظة.");
    } catch (e) { console.error("Copy failed:", e); setError("تعذر نسخ النص من الجهاز."); }
  };
  const share = async (note: Note) => {
    try { if (navigator.share) await navigator.share({ title: note.title || "ملاحظة", text: (note.title ? note.title + "\n\n" : "") + plain(note.content) }); else await copy(note); }
    catch (e) { if (!(e instanceof Error && e.name === "AbortError")) { console.error(e); setError("تعذرت مشاركة الملاحظة."); } }
  };
  const markup = (before: string, after = before) => {
    const input = editorRef.current; if (!input || !draft) return;
    const start = input.selectionStart; const end = input.selectionEnd; const chosen = draft.content.slice(start, end) || "النص";
    patch({ content: draft.content.slice(0, start) + before + chosen + after + draft.content.slice(end) });
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, start + before.length + chosen.length); });
  };

  const addFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = "";
    if (!files.length || !draft) return;
    if (!uid) { setError("سجّل الدخول أولاً لرفع المرفقات ومزامنتها؛ النصوص فقط متاحة محلياً."); return; }
    if (!navigator.onLine) { setError("رفع الملفات يحتاج اتصالاً بالإنترنت. لم يتم رفع أي ملف."); return; }
    const accepted = files.filter((f) => {
      const typeOk = f.type.startsWith("image/") || f.type === "application/pdf" || f.type.startsWith("text/") || f.type.includes("wordprocessingml") || f.type === "application/msword" || f.type.includes("spreadsheetml") || f.type === "application/vnd.ms-excel";
      if (!typeOk) setError("تم تجاهل نوع ملف غير مدعوم؛ استخدم صورة أو PDF أو مستنداً شائعاً.");
      if (f.size > 15 * 1024 * 1024) setError("تم تجاهل ملف يتجاوز الحد الأقصى 15 MB.");
      return typeOk && f.size <= 15 * 1024 * 1024;
    });
    if (!accepted.length) return;
    setUploading(true); setError(""); const uploaded: Attachment[] = [];
    try {
      for (const file of accepted) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
        const path = "users/" + uid + "/notes/" + draft.id + "/" + Date.now() + "_" + safeName;
        const result = await uploadBytes(storageRef(storage, path), file, { contentType: file.type || "application/octet-stream" });
        uploaded.push({ id: "att_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), name: file.name, contentType: file.type || "application/octet-stream", size: file.size, url: await getDownloadURL(result.ref), path });
      }
      const next = { ...draft, attachments: [...draft.attachments, ...uploaded] }; setDraft(next);
      if (!await save(next)) setError("رُفعت الملفات، لكن تعذر تأكيد حفظ ارتباطها بالملاحظة. أعد الحفظ بعد إصلاح الاتصال.");
      else setMessage("تم رفع المرفق وحفظ ارتباطه بالملاحظة.");
    } catch (e) {
      console.error("Attachment upload failed:", e);
      if (uploaded.length) {
        const next = { ...draft, attachments: [...draft.attachments, ...uploaded] }; setDraft(next);
        if (await save(next)) setMessage("حُفظت الملفات التي اكتمل رفعها؛ تعذر رفع ملف واحد أو أكثر.");
        else setError("فشل رفع بعض الملفات وتعذر حفظ المرفقات المرفوعة؛ تحقق من الاتصال.");
      } else setError("فشل رفع المرفق؛ لم تتم إضافته. تحقق من اتصال Firebase Storage وصلاحياته.");
    } finally { setUploading(false); }
  };
  const removeAttachment = async (attachment: Attachment) => {
    if (!draft || !uid || !window.confirm("حذف المرفق " + attachment.name + "؟")) return;
    setUploading(true); setError("");
    try {
      await deleteObject(storageRef(storage, attachment.path));
      const next = { ...draft, attachments: draft.attachments.filter((a) => a.id !== attachment.id) }; setDraft(next);
      if (!await save(next)) setError("حُذف الملف من التخزين لكن تعذر مزامنة الملاحظة؛ أعد الحفظ.");
    } catch (e) { console.error("Attachment removal failed:", e); setError("تعذر حذف المرفق من التخزين؛ بقي مرجعه في الملاحظة."); }
    finally { setUploading(false); }
  };
  const print = (note: Note) => { setDraft(note); window.setTimeout(() => window.print(), 80); setMessage("من نافذة الطباعة اختر «حفظ بتنسيق PDF» لتصدير PDF."); };

  const filterItems: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "الكل" }, { id: "pinned", label: "المثبتة" }, { id: "favorites", label: "المفضلة" },
    { id: "tasks", label: "المهام" }, { id: "overdue", label: "المتأخرة" }, { id: "trash", label: "المحذوفات" },
  ];
  const relationValue = draft?.relatedType ? draft.relatedType + ":" + (draft.relatedId || "") : "";

  return <section dir="rtl" className="min-w-0 space-y-4">
    <style>{printCss}</style>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><div className="rounded-2xl bg-amber-100 p-3 text-amber-700"><StickyNote className="h-6 w-6" /></div><div><h1 className="text-xl font-black text-slate-900">الملاحظات</h1><p className="mt-1 text-xs text-slate-500">ملاحظات المحل والمهام والتذكيرات والمرفقات</p></div></div>
      <button onClick={newNote} className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> ملاحظة جديدة</button>
    </header>
    {!uid && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">وضع محلي: النصوص تُحفظ على هذا الجهاز فقط. سجّل الدخول لتفعيل المزامنة السحابية وإرفاق الملفات.</div>}
    {error && <div role="alert" className="flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-6 text-rose-800"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
    {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-6 text-emerald-800">{message}</div>}

    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.35fr)]">
      <div className={(draft ? "hidden lg:block" : "block") + " min-w-0 space-y-3"}>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في العنوان والمحتوى..." className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pe-9 ps-3 text-sm outline-none focus:border-blue-400" /></div>
          <div className="mt-3 flex flex-wrap gap-1.5">{filterItems.map((f) => <button key={f.id} onClick={() => setFilter(f.id)} className={"min-h-9 rounded-lg px-3 text-xs font-bold " + (filter === f.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600")}>{f.label}</button>)}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select aria-label="التصنيف" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="min-h-10 min-w-0 rounded-lg border border-slate-200 px-2 text-xs"><option value="all">كل التصنيفات</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
            <select aria-label="لون الملاحظة" value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} className="min-h-10 min-w-0 rounded-lg border border-slate-200 px-2 text-xs"><option value="all">كل الألوان</option>{COLORS.map(([name, value]) => <option key={value} value={value}>{name}</option>)}</select>
            <select aria-label="ترتيب الملاحظات" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="min-h-10 rounded-lg border border-slate-200 px-2 text-xs"><option value="updatedAt">الأحدث تعديلاً</option><option value="createdAt">الأحدث إنشاءً</option><option value="title">العنوان</option></select>
            <span className="flex min-h-10 items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-500">{visible.length} ملاحظة</span>
          </div>
        </div>
        {loading ? <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />جارٍ تحميل الملاحظات...</div> : visible.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><StickyNote className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 text-sm font-black text-slate-800">{filter === "trash" ? "المحذوفات فارغة" : search ? "لا توجد نتائج" : "ابدأ أول ملاحظة"}</h2><p className="mt-2 text-xs leading-6 text-slate-500">دوّن اتفاقاً مع زبون أو نقصاً في البضاعة أو مهمة لمتابعتها.</p>{filter !== "trash" && <button onClick={newNote} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white"><Plus className="h-4 w-4" /> إنشاء ملاحظة</button>}</div> :
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{visible.map((n) => <article key={n.id} onClick={() => openNote(n)} className={"min-w-0 cursor-pointer rounded-2xl border p-3 text-right shadow-sm hover:shadow-md " + (draft?.id === n.id ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200")} style={{ backgroundColor: n.color || "#fff" }}>
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-1">{n.pinned && <Pin className="h-3.5 w-3.5 text-blue-600" />}{n.favorite && <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />}{n.priority !== "normal" && <span className={"rounded-full px-2 py-0.5 text-[9px] font-bold " + (n.priority === "urgent" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800")}>{PRIORITY[n.priority]}</span>}{n.completed && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] text-emerald-700">مكتملة</span>}</div><span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: n.color }} /></div>
            <h3 className="mt-2 break-words text-sm font-black leading-6 text-slate-900">{n.title || "بدون عنوان"}</h3><p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{plain(n.content).slice(0, 200) || "لا يوجد محتوى بعد..."}</p>
            {n.attachments?.length > 0 && <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><FileText className="h-3 w-3" />{n.attachments.length} مرفق</div>}
            {n.category && <span className="mt-2 inline-flex max-w-full truncate rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">{n.category}</span>}
            {n.relatedLabel && <p className="mt-2 truncate text-[10px] text-blue-700"><Link2 className="me-1 inline h-3 w-3" />{n.relatedLabel}</p>}
            <div className="mt-3 flex items-center justify-between gap-1 border-t border-black/5 pt-2"><span className="truncate text-[10px] text-slate-500">{dateText(n.updatedAt)}</span><div className="flex shrink-0 items-center">
              {filter === "trash" ? <><button title="استعادة" onClick={(e) => { e.stopPropagation(); restore(n); }} className="rounded-lg p-2 text-emerald-700"><RotateCcw className="h-4 w-4" /></button><button title="حذف نهائي" onClick={(e) => { e.stopPropagation(); void permanentDelete(n); }} className="rounded-lg p-2 text-rose-700"><Trash2 className="h-4 w-4" /></button></> :
                <><button title="تثبيت" onClick={(e) => { e.stopPropagation(); toggleFlag(n, { pinned: !n.pinned }); }} className="rounded-lg p-2 text-slate-500"><Pin className={"h-4 w-4 " + (n.pinned ? "fill-blue-100 text-blue-700" : "")} /></button><button title="المفضلة" onClick={(e) => { e.stopPropagation(); toggleFlag(n, { favorite: !n.favorite }); }} className="rounded-lg p-2 text-slate-500"><Heart className={"h-4 w-4 " + (n.favorite ? "fill-rose-500 text-rose-500" : "")} /></button><button title="نقل للمحذوفات" onClick={(e) => { e.stopPropagation(); moveToTrash(n); }} className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button></>}
            </div></div>
          </article>)}</div>}
      </div>

      <div className={(draft ? "block" : "hidden lg:block") + " min-w-0"}>
        {!draft ? <div className="hidden min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center lg:flex"><div><StickyNote className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">اختر ملاحظة أو أنشئ واحدة جديدة.</p></div></div> :
          <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3">
              <div className="flex items-center gap-2"><button onClick={() => { if (askDiscard()) setDraft(null); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-xs font-bold lg:hidden"><ChevronRight className="h-4 w-4" /> القائمة</button><span className={"text-[11px] font-bold " + (saveState === "saved" ? "text-emerald-700" : saveState === "error" ? "text-rose-700" : "text-amber-700")}>{saveState === "saved" ? "محفوظ" : saveState === "saving" ? "جارٍ الحفظ" : saveState === "pending" ? "بانتظار المزامنة" : saveState === "error" ? "تعذر الحفظ" : "تغييرات غير محفوظة"}</span></div>
              <div className="flex flex-wrap items-center gap-1"><button onClick={() => void save(draft)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-black text-white"><Check className="h-4 w-4" /> حفظ</button><button onClick={() => void copy(draft)} title="نسخ النص" className="rounded-lg p-2 text-slate-500"><Copy className="h-4 w-4" /></button><button onClick={() => void share(draft)} title="مشاركة" className="rounded-lg p-2 text-slate-500"><Share2 className="h-4 w-4" /></button><button onClick={() => print(draft)} title="طباعة أو حفظ PDF" className="rounded-lg p-2 text-slate-500"><Printer className="h-4 w-4" /></button><button onClick={() => duplicate(draft)} title="نسخ الملاحظة" className="rounded-lg p-2 text-slate-500"><Copy className="h-4 w-4" /></button>{draft.isDeleted ? <button onClick={() => void permanentDelete(draft)} title="حذف نهائي" className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button> : <button onClick={() => moveToTrash(draft)} title="نقل للمحذوفات" className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div>
            </div>
            {draft.isDeleted && <div className="flex items-center justify-between bg-amber-50 px-3 py-2 text-xs text-amber-800">هذه الملاحظة في المحذوفات.<button onClick={() => restore(draft)} className="rounded-lg bg-white px-3 py-2 font-bold">استعادة</button></div>}
            <div className="space-y-4 p-3 sm:p-4">
              <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="عنوان الملاحظة..." aria-label="عنوان الملاحظة" className="min-h-12 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-base font-black outline-none focus:border-blue-400" />
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => patch({ pinned: !draft.pinned })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold"><Pin className="h-3.5 w-3.5" />{draft.pinned ? "مثبتة" : "تثبيت"}</button>
                <button onClick={() => patch({ favorite: !draft.favorite })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold"><Heart className={"h-3.5 w-3.5 " + (draft.favorite ? "fill-rose-500 text-rose-500" : "")} />المفضلة</button>
                <button onClick={() => patch({ completed: !draft.completed })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold"><CheckSquare className="h-3.5 w-3.5" />{draft.completed ? "مكتملة" : "غير مكتملة"}</button>
                <select value={draft.priority} onChange={(e) => patch({ priority: e.target.value as Priority })} aria-label="الأولوية" className="min-h-9 rounded-lg border border-slate-200 px-2 text-xs"><option value="normal">عادية</option><option value="important">مهمة</option><option value="urgent">عاجلة</option></select>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2"><span className="text-[11px] font-bold text-slate-500">لون الخلفية</span>{COLORS.map(([name, value]) => <button key={value} title={name} aria-label={name} onClick={() => patch({ color: value })} className={"h-7 w-7 rounded-full border " + (draft.color === value ? "ring-2 ring-blue-500 ring-offset-2" : "border-black/10")} style={{ backgroundColor: value }} />)}<input type="color" aria-label="لون مخصص" value={draft.color} onChange={(e) => patch({ color: e.target.value })} className="h-8 w-9 rounded border bg-white p-0.5" /><span className="text-[11px] font-bold text-slate-500">لون النص</span><input type="color" aria-label="لون النص" value={draft.textColor} onChange={(e) => patch({ textColor: e.target.value })} className="h-8 w-9 rounded border bg-white p-0.5" /><select value={draft.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} aria-label="حجم الخط" className="min-h-8 rounded border bg-white px-2 text-xs"><option value={14}>14 px</option><option value={16}>16 px</option><option value={18}>18 px</option><option value={20}>20 px</option><option value={22}>22 px</option></select></div>
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2"><button onClick={() => markup("**")} title="غامق" className="rounded-lg p-2 hover:bg-white"><Bold className="h-4 w-4" /></button><button onClick={() => markup("*")} title="مائل" className="rounded-lg p-2 hover:bg-white"><Italic className="h-4 w-4" /></button><button onClick={() => markup("__")} title="تسطير" className="rounded-lg p-2 hover:bg-white"><Underline className="h-4 w-4" /></button><span className="mx-1 border-r border-slate-200" /><button onClick={() => markup("- ", "")} title="قائمة نقطية" className="rounded-lg p-2 hover:bg-white"><List className="h-4 w-4" /></button><button onClick={() => markup("1. ", "")} title="قائمة مرقمة" className="rounded-lg p-2 hover:bg-white"><ListOrdered className="h-4 w-4" /></button><button onClick={() => markup("- [ ] ", "")} title="مهمة بمربع اختيار" className="rounded-lg p-2 hover:bg-white"><CheckSquare className="h-4 w-4" /></button><button onClick={() => patch({ content: draft.content + (draft.content ? "\n" : "") + "\n" })} title="فقرة جديدة" className="rounded-lg p-2 hover:bg-white"><AlignLeft className="h-4 w-4" /></button><span className="text-[10px] text-slate-400">حدد النص لتطبيق التنسيق</span></div>
              <textarea ref={editorRef} value={draft.content} onChange={(e) => patch({ content: e.target.value })} placeholder={"اكتب ملاحظتك هنا...\nمثال: الاتصال بأحمد يوم 25 لمتابعة القسط."} aria-label="محتوى الملاحظة" rows={9} className="block min-h-56 w-full min-w-0 resize-y rounded-xl border border-slate-200 p-3 leading-8 outline-none focus:border-blue-400" style={{ backgroundColor: draft.color, color: draft.textColor, fontSize: draft.fontSize, lineHeight: 1.9 }} />
              <div className="rounded-xl border border-slate-200 p-3"><p className="mb-2 text-xs font-black text-slate-700">معاينة التنسيق</p><div className="break-words rounded-lg p-3 text-sm leading-7" style={{ backgroundColor: draft.color, color: draft.textColor, fontSize: draft.fontSize }} dangerouslySetInnerHTML={{ __html: preview(draft.content) || "اكتب المحتوى للمعاينة." }} /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">التصنيف<input value={draft.category} onChange={(e) => patch({ category: e.target.value })} list="notes-categories" placeholder="متابعة العملاء" className="mt-1.5 min-h-10 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-normal" /><datalist id="notes-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist></label><label className="text-xs font-bold text-slate-600">الوسوم (بفاصلة)<input value={draft.tags.join(", ")} onChange={(e) => patch({ tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20) })} placeholder="قسط، عاجل، مخزن" className="mt-1.5 min-h-10 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label></div>
              {draft.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{draft.tags.map((t) => <span key={t} className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">#{t}</span>)}</div>}
              <label className="block text-xs font-bold text-slate-600">ربط اختياري ببيانات المحل<select value={relationValue} onChange={(e) => { const item = recordOptions.find((x) => x.value === e.target.value); patch({ relatedType: item?.type || "", relatedId: item?.id || "", relatedLabel: item?.label || "" }); }} className="mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">بدون ربط</option>{recordOptions.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
              {draft.relatedLabel && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-800"><span className="min-w-0 break-words"><Link2 className="me-1 inline h-4 w-4" />{draft.relatedLabel}</span>{draft.relatedId && <button onClick={() => onNavigateToRecord(draft.relatedType, draft.relatedId)} className="min-h-9 rounded-lg bg-white px-3 font-bold">فتح العنصر</button>}</div>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">موعد التذكير<input type="datetime-local" value={draft.reminderAt} onChange={(e) => patch({ reminderAt: e.target.value })} className="mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm font-normal" /></label><div className="flex flex-col justify-end gap-1 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><span><Clock3 className="me-1 inline h-3.5 w-3.5" />الإنشاء: {dateText(draft.createdAt)}</span><span><Clock3 className="me-1 inline h-3.5 w-3.5" />آخر تعديل: {dateText(draft.updatedAt)}</span>{draft.reminderAt && !draft.completed && new Date(draft.reminderAt).getTime() < Date.now() && <span className="font-black text-rose-700">التذكير متأخر</span>}</div></div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><div className="flex flex-wrap items-center gap-2"><button onClick={() => fileRef.current?.click()} disabled={uploading || draft.isDeleted} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-50">{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{uploading ? "جارٍ رفع الملف..." : "إرفاق صورة أو ملف"}</button><input ref={fileRef} type="file" multiple accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => void addFiles(e)} />{draft.attachments.length > 0 && <span className="text-xs text-slate-500">{draft.attachments.length} مرفق</span>}</div><span className="text-[10px] text-slate-400">حتى 15 MB لكل ملف</span></div>
              {draft.attachments.length > 0 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{draft.attachments.map((a) => <div key={a.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 p-2">{a.contentType.startsWith("image/") ? <button onClick={() => window.open(a.url, "_blank", "noopener,noreferrer")} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100"><img src={a.url} alt={a.name} className="h-full w-full object-cover" loading="lazy" /></button> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><FileText className="h-6 w-6" /></div>}<div className="min-w-0 flex-1"><a href={a.url} target="_blank" rel="noreferrer" className="block break-words text-xs font-bold text-blue-700">{a.name}</a><p className="mt-1 break-all text-[10px] text-slate-500">{a.contentType} · {sizeText(a.size)}</p><a href={a.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-600"><Download className="h-3 w-3" /> فتح / تنزيل</a></div><button disabled={uploading || draft.isDeleted} onClick={() => void removeAttachment(a)} title="حذف المرفق" className="rounded-lg p-2 text-rose-600 disabled:opacity-40"><X className="h-4 w-4" /></button></div>)}</div>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-400"><span>المعرّف: {draft.id.slice(0, 12)}</span>{isDirty && <span className="font-bold text-amber-700">تغييرات تحتاج إلى حفظ</span>}</div>
            </div>
          </div>}
      </div>
    </div>

    {draft && <div id="notes-print-view" className="hidden" dir="rtl"><h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{draft.title || "ملاحظة"}</h1><p style={{ color: "#64748b", fontSize: 11, marginBottom: 20 }}>الإنشاء: {dateText(draft.createdAt)} — آخر تعديل: {dateText(draft.updatedAt)}</p>{draft.relatedLabel && <p style={{ fontSize: 12, marginBottom: 12 }}>مرتبط بـ: {draft.relatedLabel}</p>}<div style={{ fontSize: draft.fontSize, color: draft.textColor, lineHeight: 2, overflowWrap: "anywhere" }} dangerouslySetInnerHTML={{ __html: preview(draft.content) }} />{draft.attachments.filter((a) => a.contentType.startsWith("image/")).map((a) => <div key={a.id} style={{ marginTop: 16 }}><p style={{ fontSize: 11 }}>{a.name}</p><img src={a.url} alt={a.name} /></div>)}</div>}
  </section>;
}
