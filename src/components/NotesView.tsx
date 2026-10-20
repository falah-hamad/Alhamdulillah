import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getDownloadURL, ref as storageRef, uploadBytes, deleteObject } from "firebase/storage";
import { AlignLeft, BellRing, Bold, Check, CheckSquare, ChevronRight, Clock3, Copy, Download, FileText, Folder, FolderPlus, Heart, ImagePlus, Italic, List, ListOrdered, LoaderCircle, Pin, Plus, Printer, RotateCcw, Search, Share2, StickyNote, Trash2, Underline, X, LayoutGrid, Rows3, ListCollapse, MoreVertical, RefreshCw, ArrowUpDown, Star, BookOpen, Strikethrough, Highlighter, AlignRight, AlignCenter, AlignJustify, Undo2, Redo2 } from "lucide-react";
import { db, storage } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

interface RecordItem { id: string; name?: string; title?: string; number?: string; invoiceNumber?: string; customerId?: string; amount?: number; total?: number; }
interface Attachment { id: string; name: string; contentType: string; size: number; url: string; path: string; }
type Priority = "normal" | "important" | "urgent";
type Filter = "all" | "pinned" | "favorites" | "tasks" | "overdue" | "trash";
interface Note {
  id: string; userId?: string; title: string; content: string; color: string; textColor: string; fontSize: number; textAlign?: "right" | "center" | "left" | "justify";
  favorite: boolean; pinned: boolean; completed: boolean; createdAt: string; updatedAt: string; category: string;
  tags: string[]; priority: Priority; folderId?: string; relatedType: string; relatedId: string; relatedLabel: string;
  reminderAt: string; isDeleted: boolean; deletedAt?: string; attachments: Attachment[];
}
interface Props { customers?: RecordItem[]; products?: RecordItem[]; invoices?: RecordItem[]; payments?: RecordItem[]; onNavigateToRecord?: (type: string, id: string) => void; }
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
    title: "", content: "", color: "#fffaf0", textColor: "#1e293b", fontSize: 16, textAlign: "right", favorite: false, pinned: false,
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
    const imageMatch = raw.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/);
    if (imageMatch) return `<img src="${escaped(imageMatch[2])}" alt="${escaped(imageMatch[1])}" style="display:block;max-width:100%;max-height:420px;object-fit:contain;margin:10px auto;border-radius:10px" loading="lazy" />`;
    let line = escaped(raw).replace(/^- \[x\] (.*)$/i, "☑ $1").replace(/^- \[ \] (.*)$/, "☐ $1")
      .replace(/^- (.*)$/, "• $1").replace(/^\d+[.)] (.*)$/, "• $1");
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<u>$1</u>").replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>").replace(/==(.+?)==/g, '<mark style="background:#fef08a;border-radius:3px;padding:0 2px">$1</mark>');
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
  return ["title", "content", "color", "textColor", "fontSize", "textAlign", "favorite", "pinned", "completed", "category", "priority", "relatedType", "relatedId", "relatedLabel", "reminderAt", "isDeleted", "folderId"].some((key) => (a as any)[key] !== (b as any)[key])
    || JSON.stringify(a.tags) !== JSON.stringify(b.tags) || JSON.stringify(a.attachments) !== JSON.stringify(b.attachments);
}

export default function NotesView(_props: Props) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || null;
  const [notes, setNotes] = useState<Note[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [folders,setFolders]=useState<Array<{id:string;name:string;parentId:string|null;favorite?:boolean;color?:string;updatedAt?:string;isDeleted?:boolean;deletedAt?:string}>>(()=>{try{return (JSON.parse(localStorage.getItem("alhamdulillah.notes.folders")||"[]") as Array<{id:string;name:string;parentId?:string|null}>).map(f=>({...f,parentId:typeof f.parentId==="string"&&f.parentId.trim()?f.parentId:null}));}catch{return [];}});
  const [menuOpen,setMenuOpen]=useState(false); const [selectionMode,setSelectionMode]=useState(false); const [selectedNoteIds,setSelectedNoteIds]=useState<string[]>([]); const [refreshToken,setRefreshToken]=useState(0);
  const [currentFolderId,setCurrentFolderId]=useState<string|null>(null); const [folderName,setFolderName]=useState(""); const [showFolderCreate,setShowFolderCreate]=useState(false);
  const [viewMode, setViewMode] = useState<"grid"|"list"|"compact">(()=>{try{return (localStorage.getItem("alhamdulillah.notes.view") as "grid"|"list"|"compact")||"grid";}catch{return "grid";}});
  const [contentFilter,setContentFilter]=useState<"all"|"folders"|"notes">("all");
  const [openItemMenu,setOpenItemMenu]=useState<string|null>(null);
  const [movePicker,setMovePicker]=useState<null|{kind:"folder"|"note"|"copyNote"|"bulk";id?:string;title:string}>(null);
  const [selectedDestinationId,setSelectedDestinationId]=useState("");
  const [moveSearch,setMoveSearch]=useState("");
  const [renameFolderTarget,setRenameFolderTarget]=useState<null|{id:string;name:string}>(null);
  const [renameFolderValue,setRenameFolderValue]=useState("");
  const [detailsFolderTarget,setDetailsFolderTarget]=useState<null|{id:string;name:string;parentId:string|null;updatedAt?:string}>(null);
  const [sortAsc,setSortAsc]=useState(false);
  const [draft, setDraft] = useState<Note | null>(null);
  const [undoStack,setUndoStack]=useState<string[]>([]); const [redoStack,setRedoStack]=useState<string[]>([]);
  const imageInsertPositionRef=useRef<number|null>(null);
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showSearch, setShowSearch] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const notesSectionRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{const closeOutside=(event:MouseEvent)=>{if(notesSectionRef.current&&!notesSectionRef.current.contains(event.target as Node)){setMenuOpen(false);setOpenItemMenu(null);}};document.addEventListener("pointerdown",closeOutside);return()=>document.removeEventListener("pointerdown",closeOutside);},[]);

  useEffect(() => {
    // Clear the previous account's editor/data immediately when authentication changes.
    setDraft(null);
    setNotes([]);
    setCurrentFolderId(null);
    setFilter("all");
    setSelectedNoteIds([]);
    if (uid) setFolders([]);
    else { try { setFolders((JSON.parse(localStorage.getItem("alhamdulillah.notes.folders") || "[]") as Array<{id:string;name:string;parentId?:string|null}>).map(f=>({...f,parentId:typeof f.parentId==="string"&&f.parentId.trim()?f.parentId:null}))); } catch { setFolders([]); } }
    setError("");
    setMessage("");
    setLoading(true);
    if (!uid) {
      try { setNotes(JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as Note[]); }
      catch { setNotes([]); setError("تعذرت قراءة الملاحظات المحفوظة محلياً."); }
      setLoading(false);
      return;
    }
    const stopFolders=onSnapshot(collection(db,"users",uid,"noteFolders"),snap=>setFolders(snap.docs.map(d=>({id:d.id,name:String(d.data().name||"مجلد"),parentId:typeof d.data().parentId==="string"&&d.data().parentId.trim()?d.data().parentId:null,favorite:Boolean(d.data().favorite),color:typeof d.data().color==="string"?d.data().color:"#f59e0b",updatedAt:typeof d.data().updatedAt==="string"?d.data().updatedAt:"",isDeleted:Boolean(d.data().isDeleted),deletedAt:typeof d.data().deletedAt==="string"?d.data().deletedAt:undefined}))),err=>console.error("Folders listener:",err));
    const stopNotes=onSnapshot(collection(db, "users", uid, "notes"), { includeMetadataChanges: true }, (snap) => {
      setNotes(snap.docs.map((d) => ({ ...d.data(), id: d.id, tags: Array.isArray(d.data().tags) ? d.data().tags : [], attachments: Array.isArray(d.data().attachments) ? d.data().attachments : [] } as Note)));
      setLoading(false);
      if (snap.metadata.hasPendingWrites) setSaveState("pending");
      else setSaveState((old) => old === "saving" ? old : "saved");
      setError("");
    }, (err) => {
      console.error("Notes listener error:", err); setLoading(false); setSaveState("error");
      setError("تعذر تحميل الملاحظات من Firestore. تحقق من الحساب وقواعد الوصول.");
    });
    return ()=>{stopNotes();stopFolders();};
  }, [uid, refreshToken]);

  const categories = useMemo(() => Array.from(new Set<string>(notes.filter((n) => !n.isDeleted && n.category.trim()).map((n) => n.category.trim()))).sort((a, b) => a.localeCompare(b, "ar")), [notes]);
  const visible = useMemo(() => {
    if(contentFilter==="folders") return [];
    const q = search.trim().toLocaleLowerCase("ar");
    return notes.filter((n) => filter === "trash" ? n.isDeleted : !n.isDeleted).filter(n=>currentFolderId?n.folderId===currentFolderId:(filter==="trash"||filter==="favorites"?true:!n.folderId)).filter((n) => {
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
      const result = sortBy === "title" ? a.title.localeCompare(b.title, "ar") : new Date(a[sortBy] || 0).getTime() - new Date(b[sortBy] || 0).getTime(); return sortAsc ? result : -result;
    });
  }, [notes, filter, search, categoryFilter, colorFilter, sortBy, sortAsc, currentFolderId]);

  const savedDraft = draft ? notes.find((n) => n.id === draft.id) : undefined;
  const isDirty = Boolean(draft && changed(draft, savedDraft));
  const askDiscard = () => !isDirty || window.confirm("توجد تغييرات غير محفوظة. هل تريد تركها دون حفظ؟");
  const openNote = (note: Note) => { if (draft?.id !== note.id && !askDiscard()) return; setDraft(note); setEditMode(false); setUndoStack([]); setRedoStack([]); imageInsertPositionRef.current=null; setError(""); setMessage(""); };
  const newNote = () => { if (!askDiscard()) return; setDraft({ ...createNote(), folderId: currentFolderId || "" }); setEditMode(true); setUndoStack([]); setRedoStack([]); imageInsertPositionRef.current=null; setFilter("all"); setSaveState("idle"); setError(""); setMessage(""); };
  const patch = (value: Partial<Note>) => setDraft((old) => { if (!old) return old; if (typeof value.content === "string" && value.content !== old.content) { setUndoStack((items) => [...items.slice(-99), old.content]); setRedoStack([]); } return { ...old, ...value }; });
  const undoEdit=()=>{if(!draft||!undoStack.length)return;const previous=undoStack[undoStack.length-1];setUndoStack(items=>items.slice(0,-1));setRedoStack(items=>[...items,draft.content].slice(-100));setDraft({...draft,content:previous});requestAnimationFrame(()=>editorRef.current?.focus());};
  const redoEdit=()=>{if(!draft||!redoStack.length)return;const next=redoStack[redoStack.length-1];setRedoStack(items=>items.slice(0,-1));setUndoStack(items=>[...items,draft.content].slice(-100));setDraft({...draft,content:next});requestAnimationFrame(()=>editorRef.current?.focus());};

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
    const base = draft?.id === note.id ? draft : note;
    const next = { ...base, ...value };
    void save(next);
  };
  const moveToTrash = (note: Note) => {
    if (!window.confirm("نقل الملاحظة إلى المحذوفات؟ يمكنك استعادتها لاحقاً.")) return;
    const base = draft?.id === note.id ? draft : note;
    const next = { ...base, isDeleted: true, deletedAt: new Date().toISOString() };
    void save(next);
    setFilter("trash");
  };
  const restore = (note: Note) => {
    const base = draft?.id === note.id ? draft : note;
    const next = { ...base, isDeleted: false, deletedAt: undefined };
    void save(next);
    setFilter("all");
  };
  const permanentDelete = async (note: Note) => {
    if (!window.confirm("هذا حذف نهائي لا يمكن التراجع عنه. هل تريد المتابعة؟")) return;
    setError("");
    try {
      if (uid) {
        for (const a of note.attachments || []) if (a.path && !notes.some(other => other.id !== note.id && (other.attachments || []).some(shared => shared.path === a.path))) await deleteObject(storageRef(storage, a.path));
        await deleteDoc(doc(db, "users", uid, "notes", note.id));
      } else localStorage.setItem(LOCAL_KEY, JSON.stringify(notes.filter((n) => n.id !== note.id)));
      setNotes((old) => old.filter((n) => n.id !== note.id)); if (draft?.id === note.id) setDraft(null);
      setMessage("تم حذف الملاحظة نهائياً.");
    } catch (e) { console.error("Permanent delete failed:", e); setError("تعذر إكمال الحذف النهائي. تحقق من الاتصال وصلاحيات المرفقات."); }
  };
  const duplicate = async (note: Note) => {
    const base = draft?.id === note.id ? draft : note;
    const copyNote: Note = { ...base, id: createNote().id, title: "نسخة من " + (base.title || "ملاحظة"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), favorite: false, pinned: false, completed: false, isDeleted: false, deletedAt: undefined, attachments: [...(base.attachments || [])] };
    setFilter("all");
    if (await save(copyNote)) { setDraft(copyNote); setEditMode(false); setMessage("تم إنشاء نسخة مستقلة من الملاحظة دون تكرار المرفقات."); }
  };

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
  const markup = (before: string, after = before) => { const input=editorRef.current;if(!input||!draft)return;const start=input.selectionStart,end=input.selectionEnd,selected=draft.content.slice(start,end),chosen=selected||"النص";patch({content:draft.content.slice(0,start)+before+chosen+after+draft.content.slice(end)});requestAnimationFrame(()=>{input.focus();const p=start+before.length;input.setSelectionRange(p,p+chosen.length);}); };
  const handleEditorKeyDown=(e:React.KeyboardEvent<HTMLTextAreaElement>)=>{
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="z") { e.preventDefault(); if (e.shiftKey) redoEdit(); else undoEdit(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="y") { e.preventDefault(); redoEdit(); return; }
    if(e.key!=="Enter"||e.shiftKey||!draft)return;
    const el=e.currentTarget,start=el.selectionStart,end=el.selectionEnd,before=draft.content.slice(0,start),line=before.slice(before.lastIndexOf("\n")+1),m=line.match(/^(\s*)([-*+]\s+|\d+[.)]\s+)(.*)$/);
    if(!m)return;e.preventDefault();
    if(!m[3].trim()){const updated=draft.content.slice(0,start-line.length)+m[1]+draft.content.slice(end);patch({content:updated});requestAnimationFrame(()=>{el.focus();const p=start-line.length+m[1].length;el.setSelectionRange(p,p);});return;}
    const prefix=/^\d+[.)]/.test(m[2])?m[1]+(Number.parseInt(m[2],10)+1)+". ":m[1]+m[2];const inserted="\n"+prefix;patch({content:draft.content.slice(0,start)+inserted+draft.content.slice(end)});requestAnimationFrame(()=>{el.focus();const p=start+inserted.length;el.setSelectionRange(p,p);});
  };

  const addFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []) as File[]; event.currentTarget.value = "";
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
      const inlineImages = uploaded.filter((a) => a.contentType.startsWith("image/"));
      const inlineMarkdown = inlineImages.map((a) => `![${a.name.replace(/\]/g, "")}](${a.url})`).join("\n");
      const insertionPoint = imageInsertPositionRef.current ?? editorRef.current?.selectionStart ?? draft.content.length;
      const safePoint = Math.max(0, Math.min(insertionPoint, draft.content.length));
      const prefix = draft.content.slice(0, safePoint); const suffix = draft.content.slice(safePoint);
      const inlineContent = inlineMarkdown ? prefix + (prefix && !prefix.endsWith("\n") ? "\n\n" : "") + inlineMarkdown + (suffix && !suffix.startsWith("\n") ? "\n\n" : "") + suffix : draft.content;
      const next = { ...draft, content: inlineContent, attachments: [...draft.attachments, ...uploaded] }; imageInsertPositionRef.current=null; setDraft(next);
      if (!await save(next)) setError("رُفعت الملفات، لكن تعذر تأكيد حفظ ارتباطها بالملاحظة. أعد الحفظ بعد إصلاح الاتصال.");
      else setMessage(inlineImages.length ? "تم رفع الصورة وإدراجها داخل نص الملاحظة، وحُفظت المرفقات." : "تم رفع المرفق وحفظ ارتباطه بالملاحظة.");
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
    if (!draft || !uid || !window.confirm("حذف المرفق " + attachment.name + " من هذه الملاحظة؟")) return;
    setUploading(true); setError("");
    try {
      if (!notes.some(other => other.id !== draft.id && (other.attachments || []).some(shared => shared.path === attachment.path))) await deleteObject(storageRef(storage, attachment.path));
      const next = { ...draft, attachments: draft.attachments.filter((a) => a.id !== attachment.id) }; setDraft(next);
      if (!await save(next)) setError("حُذف الملف من التخزين لكن تعذر مزامنة الملاحظة؛ أعد الحفظ.");
    } catch (e) { console.error("Attachment removal failed:", e); setError("تعذر حذف المرفق من التخزين؛ بقي مرجعه في الملاحظة."); }
    finally { setUploading(false); }
  };
  const print = (note: Note) => { setDraft(note); window.setTimeout(() => window.print(), 80); setMessage("من نافذة الطباعة اختر «حفظ بتنسيق PDF» لتصدير PDF."); };

  const openFolder=(folderId:string|null,keepTrash=false)=>{setCurrentFolderId(folderId);setFilter(keepTrash?"trash":"all");setSelectedNoteIds([]);setOpenItemMenu(null);};
  const folderPath=(()=>{const path:Array<{id:string;name:string}>=[];let id=currentFolderId;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const f=folders.find(x=>x.id===id);if(!f)break;path.unshift(f);id=f.parentId;}return path;})(); const childFolders=(filter==="trash"?folders.filter(f=>f.isDeleted&&!folders.some(p=>p.id===f.parentId&&p.isDeleted)):folders.filter(f=>!f.isDeleted&&(f.parentId||null)===currentFolderId)).filter(f=>(!search.trim()||f.name.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar")))&&contentFilter!=="notes");
  const persistFolders=async(next:Array<{id:string;name:string;parentId:string|null;favorite?:boolean;color?:string;updatedAt?:string;isDeleted?:boolean;deletedAt?:string}>)=>{const stamped=next.map(f=>({...f,parentId:f.parentId&&f.parentId.trim()?f.parentId:null,updatedAt:f.updatedAt||new Date().toISOString()}));setFolders(stamped);if(!uid){localStorage.setItem("alhamdulillah.notes.folders",JSON.stringify(stamped));return;}const nextIds=new Set(stamped.map(f=>f.id));for(const f of stamped){await setDoc(doc(db,"users",uid,"noteFolders",f.id),{...f,userId:uid},{merge:true});}for(const f of folders)if(!nextIds.has(f.id))await deleteDoc(doc(db,"users",uid,"noteFolders",f.id));};
  const makeFolder=async()=>{const name=folderName.trim();if(!name)return;if(folders.some(f=>(f.parentId||null)===currentFolderId&&f.name.toLocaleLowerCase("ar")===name.toLocaleLowerCase("ar"))){setError("يوجد مجلد بهذا الاسم في هذا المسار.");return;}const id="folder_"+(typeof crypto!=="undefined"&&"randomUUID"in crypto?crypto.randomUUID().replace(/-/g,""):Date.now().toString(36));try{await persistFolders([...folders,{id,name,parentId:currentFolderId,favorite:false,updatedAt:new Date().toISOString()}]);setFolderName("");setShowFolderCreate(false);setCurrentFolderId(id);setFilter("all");setSelectedNoteIds([]);setMessage("تم إنشاء المجلد.");}catch(e){console.error(e);setError("تعذر حفظ المجلد.");}};
  const renameFolder=(f:{id:string;name:string;parentId:string|null})=>{setRenameFolderTarget({id:f.id,name:f.name});setRenameFolderValue(f.name);setOpenItemMenu(null);};
  const commitRenameFolder=async()=>{if(!renameFolderTarget)return;const name=renameFolderValue.trim();if(!name){setError("اكتب اسم المجلد.");return;}const target=folders.find(x=>x.id===renameFolderTarget.id);if(!target){setRenameFolderTarget(null);return;}if(folders.some(x=>x.id!==target.id&&x.parentId===target.parentId&&!x.isDeleted&&x.name.toLocaleLowerCase("ar")===name.toLocaleLowerCase("ar"))){setError("يوجد مجلد بهذا الاسم في المسار نفسه.");return;}try{await persistFolders(folders.map(x=>x.id===target.id?{...x,name,updatedAt:new Date().toISOString()}:x));setRenameFolderTarget(null);setMessage("تم تغيير اسم المجلد.");}catch(e){console.error(e);setError("تعذر تغيير اسم المجلد.");}};
  const deleteFolder=async(f:{id:string;name:string;parentId:string|null})=>{if(!window.confirm("نقل المجلد «"+f.name+"» ومجلداته الفرعية إلى المهملات؟ ستبقى المحتويات محفوظة ويمكن استعادتها."))return;try{const subtree=new Set<string>([f.id]);let changed=true;while(changed){changed=false;for(const child of folders)if(child.parentId&&subtree.has(child.parentId)&&!subtree.has(child.id)){subtree.add(child.id);changed=true;}}const now=new Date().toISOString();await persistFolders(folders.map(x=>subtree.has(x.id)?{...x,isDeleted:true,deletedAt:now,updatedAt:now}:x));setCurrentFolderId(null);setFilter("trash");setSelectedNoteIds([]);setMessage("نُقل المجلد ومحتوياته إلى المهملات ويمكن استعادتها.");}catch(e){console.error(e);setError("تعذر نقل المجلد إلى المهملات؛ لم تُحذف محتوياته.");}};
  const restoreFolder=async(f:{id:string;name:string;parentId:string|null})=>{try{const subtree=new Set<string>([f.id]);let changed=true;while(changed){changed=false;for(const child of folders)if(child.parentId&&subtree.has(child.parentId)&&!subtree.has(child.id)){subtree.add(child.id);changed=true;}}const now=new Date().toISOString();await persistFolders(folders.map(x=>subtree.has(x.id)?{...x,isDeleted:false,deletedAt:undefined,updatedAt:now}:x));setMessage("تمت استعادة المجلد ومجلداته الفرعية.");}catch(e){console.error(e);setError("تعذرت استعادة المجلد؛ تحقق من الاتصال والمزامنة.");}};
  const permanentDeleteFolder=async(f:{id:string;name:string;parentId:string|null})=>{if(!window.confirm("حذف المجلد «"+f.name+"» ومجلداته الفرعية والملاحظات الموجودة داخلها نهائياً؟ لا يمكن التراجع عن هذا الإجراء."))return;try{const subtree=new Set<string>([f.id]);let changed=true;while(changed){changed=false;for(const child of folders)if(child.parentId&&subtree.has(child.parentId)&&!subtree.has(child.id)){subtree.add(child.id);changed=true;}}const related=notes.filter(n=>n.folderId&&subtree.has(n.folderId));for(const note of related){if(uid){for(const a of note.attachments||[])if(a.path&&!notes.some(other=>other.id!==note.id&&(other.attachments||[]).some(shared=>shared.path===a.path)))try{await deleteObject(storageRef(storage,a.path));}catch(err){console.warn("Attachment cleanup failed",err);}await deleteDoc(doc(db,"users",uid,"notes",note.id));}}const remainingFolders=folders.filter(x=>!subtree.has(x.id));await persistFolders(remainingFolders);const remainingNotes=notes.filter(n=>!related.some(r=>r.id===n.id));setNotes(remainingNotes);if(!uid)localStorage.setItem(LOCAL_KEY,JSON.stringify(remainingNotes));setMessage("تم حذف المجلد ومحتوياته نهائياً.");}catch(e){console.error(e);setError("تعذر إكمال الحذف النهائي؛ افحص البيانات والمزامنة قبل إعادة المحاولة.");}};
  const folderLabel=(folderId:string|null|undefined)=>{if(!folderId)return "المجلد الرئيسي";const parts:string[]=[];let id:string|null|undefined=folderId;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const f=folders.find(x=>x.id===id);if(!f)break;parts.unshift(f.name);id=f.parentId;}return parts.join(" / ")||"المجلد الرئيسي";};
  const moveFolder=(f:{id:string;name:string;parentId:string|null})=>{setMovePicker({kind:"folder",id:f.id,title:"نقل المجلد: "+f.name});setSelectedDestinationId(f.parentId||"");setMoveSearch("");setOpenItemMenu(null);};
  const isFolderDescendant=(candidateId:string,ancestorId:string)=>{let parent:string|null|undefined=candidateId;const seen=new Set<string>();while(parent&&!seen.has(parent)){if(parent===ancestorId)return true;seen.add(parent);parent=folders.find(x=>x.id===parent)?.parentId;}return false;};
  const commitMovePicker=async()=>{if(!movePicker)return;const action=movePicker;const targetId=selectedDestinationId||null;try{if(action.kind==="folder"){const folder=folders.find(x=>x.id===action.id);if(!folder)throw new Error("folder missing");if(targetId&&(targetId===folder.id||isFolderDescendant(targetId,folder.id)))throw new Error("invalid destination");if(folders.some(x=>x.id!==folder.id&&!x.isDeleted&&(x.parentId||null)===targetId&&x.name.toLocaleLowerCase("ar")===folder.name.toLocaleLowerCase("ar")))throw new Error("duplicate name");await persistFolders(folders.map(x=>x.id===folder.id?{...x,parentId:targetId,updatedAt:new Date().toISOString()}:x));setMessage("تم نقل المجلد إلى الوجهة المحددة.");}else if(action.kind==="note"||action.kind==="copyNote"){const note=notes.find(x=>x.id===action.id);if(!note)throw new Error("note missing");if(action.kind==="note"){if(await save({...note,folderId:targetId||"",updatedAt:new Date().toISOString()}))setMessage("تم نقل الملاحظة إلى المجلد المحدد.");else throw new Error("note save failed");}else{const now=new Date().toISOString();const copyNote:Note={...note,id:createNote().id,title:"نسخة من "+(note.title||"ملاحظة"),folderId:targetId||"",createdAt:now,updatedAt:now,favorite:false,pinned:false,isDeleted:false,deletedAt:undefined,attachments:[...(note.attachments||[])]};if(await save(copyNote))setMessage("تم نسخ الملاحظة إلى المجلد المحدد.");else throw new Error("note copy failed");}}else{const selectedFolderIds=selectedNoteIds.filter(id=>id.startsWith("folder:")).map(id=>id.slice(7));const selectedNoteList=notes.filter(n=>selectedNoteIds.includes(n.id)&&!n.isDeleted);const rootSelectedFolderIds=selectedFolderIds.filter(id=>!selectedFolderIds.some(other=>other!==id&&isFolderDescendant(id,other)));for(const folderId of rootSelectedFolderIds){if(targetId&&(targetId===folderId||isFolderDescendant(targetId,folderId)))throw new Error("invalid destination");}for(const n of selectedNoteList){if(!await save({...n,folderId:targetId||"",updatedAt:new Date().toISOString()}))throw new Error("note move failed");}if(rootSelectedFolderIds.length)await persistFolders(folders.map(x=>rootSelectedFolderIds.includes(x.id)?{...x,parentId:targetId,updatedAt:new Date().toISOString()}:x));setSelectedNoteIds([]);setSelectionMode(false);setMessage("تم نقل العناصر المحددة إلى المجلد المختار.");}setMovePicker(null);setMoveSearch("");}catch(e){console.error("Notes move failed:",e);setError(e instanceof Error&&e.message==="invalid destination"?"لا يمكن نقل المجلد إلى نفسه أو إلى أحد مجلداته الفرعية.":e instanceof Error&&e.message==="duplicate name"?"يوجد مجلد بالاسم نفسه في الوجهة المختارة.":"تعذر إكمال العملية؛ لم تُعرض رسالة نجاح لأن الحفظ لم يكتمل.");}};
  const moveNote=(note:Note)=>{setMovePicker({kind:"note",id:note.id,title:"نقل الملاحظة: "+(note.title||"بدون عنوان")});setSelectedDestinationId(note.folderId||"");setMoveSearch("");setOpenItemMenu(null);};
  const duplicateFolder=async(folder:{id:string;name:string;parentId:string|null})=>{
    const sourceTree:Array<{id:string;name:string;parentId:string|null;favorite?:boolean;color?:string;updatedAt?:string;isDeleted?:boolean;deletedAt?:string}>=[];
    const queue=[folder.id];
    while(queue.length){const parent=queue.shift()!;const children=folders.filter(x=>x.parentId===parent);for(const child of children){sourceTree.push(child);queue.push(child.id);}}
    const allSource=[folder,...sourceTree];const idMap=new Map<string,string>();
    for(const item of allSource)idMap.set(item.id,"folder_copy_"+createNote().id);
    const now=new Date().toISOString();
    const copied=allSource.map((item,index)=>({ ...item,id:idMap.get(item.id)!,name:index===0?"نسخة من "+item.name:item.name,parentId:item.id===folder.id?folder.parentId:(item.parentId?idMap.get(item.parentId)||folder.parentId:folder.parentId),favorite:false,updatedAt:now }));
    try{
      await persistFolders([...folders,...copied]);
      const sourceNotes=notes.filter(n=>!n.isDeleted&&allSource.some(f=>f.id===n.folderId));
      for(const note of sourceNotes){const copyNote:Note={...note,id:createNote().id,title:"نسخة من "+(note.title||"ملاحظة"),folderId:idMap.get(note.folderId||"")||copied[0].id,createdAt:now,updatedAt:now,favorite:false,pinned:false,isDeleted:false,deletedAt:undefined,attachments:[...(note.attachments||[])]};if(!await save(copyNote))throw new Error("note copy failed");}
      setMessage("تم نسخ المجلد ومجلداته الفرعية وملاحظاتها.");
    }catch(e){console.error("Folder copy failed:",e);setError("تعذر إكمال نسخ المجلد بالكامل؛ تحقّق من المزامنة قبل إعادة المحاولة.");}
  };
  const folderDetails=(folder:{id:string;name:string;parentId:string|null})=>{setDetailsFolderTarget(folder);setOpenItemMenu(null);};
  

  return <section ref={notesSectionRef} dir="rtl" onClick={()=>{setMenuOpen(false);setOpenItemMenu(null);}} className="min-w-0 space-y-4">
    <style>{printCss}</style>
    <header className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><button type="button" title="رجوع" aria-label="رجوع" onClick={()=>{if(currentFolderId){const current=folders.find(f=>f.id===currentFolderId);openFolder(current?.parentId||null);}else if(draft&&askDiscard())setDraft(null);}} className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronRight className="h-5 w-5"/></button><div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><BookOpen className="h-5 w-5"/></div><div className="min-w-0"><h1 className="text-lg font-black text-slate-900">{currentFolderId ? (folders.find(f=>f.id===currentFolderId)?.name || "الملاحظات") : "الملاحظات"}</h1><p className="mt-0.5 text-[11px] text-slate-500">{childFolders.length} مجلد • {notes.filter(n=>!n.isDeleted&&(n.folderId||null)===currentFolderId).length} ملاحظة • {currentFolderId ? "المستوى "+(folderPath.length+1) : "المستوى الأول"}</p></div></div>
      <div className="flex shrink-0 items-center gap-1"><button onClick={()=>{setFilter("trash");setSearch("");setCurrentFolderId(null);}} title="المحذوفات" aria-label="المحذوفات" className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100"><Trash2 className="h-5 w-5"/><span className="absolute -left-0.5 -top-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-[9px] font-black text-white">{notes.filter(n=>n.isDeleted).length+folders.filter(f=>f.isDeleted).length}</span></button><button onClick={()=>{setShowSearch(v=>!v);}} title="بحث سريع" aria-label="بحث سريع" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"><Search className="h-5 w-5"/></button><button onClick={()=>{const next=viewMode==="grid"?"list":"grid";setViewMode(next);localStorage.setItem("alhamdulillah.notes.view",next);}} title="تغيير العرض" aria-label="تغيير العرض" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100">{viewMode==="grid"?<Rows3 className="h-5 w-5"/>:<LayoutGrid className="h-5 w-5"/>}</button>
      <div className="relative"><button onClick={e=>{e.stopPropagation();setMenuOpen(v=>!v);}} title="خيارات متقدمة" aria-label="خيارات متقدمة" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"><MoreVertical className="h-5 w-5"/></button>{menuOpen&&<div onClick={e=>e.stopPropagation()} className="absolute left-0 top-full z-30 mt-1 max-h-[75vh] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
      <button onClick={()=>{setSelectionMode(v=>!v);setSelectedNoteIds([]);setMenuOpen(false);}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-right text-xs font-bold hover:bg-slate-50"><CheckSquare className="h-4 w-4"/>{selectionMode?"إلغاء التحديد":"تحديد عدة عناصر"}</button>
      <button onClick={()=>{const next=viewMode==="grid"?"list":"grid";setViewMode(next);localStorage.setItem("alhamdulillah.notes.view",next);setMenuOpen(false);}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-right text-xs font-bold hover:bg-slate-50"><LayoutGrid className="h-4 w-4"/>تغيير الوضع: {viewMode==="grid"?"قائمة":"شبكة"}</button>
      <button onClick={()=>{setLoading(true);setRefreshToken(v=>v+1);setMenuOpen(false);setMessage("جارٍ تحديث بيانات الملاحظات ومزامنتها.");}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-right text-xs font-bold hover:bg-slate-50"><RefreshCw className="h-4 w-4"/>تحديث ومزامنة</button>
      <button onClick={()=>{setSortBy(v=>v==="updatedAt"?"createdAt":v==="createdAt"?"title":"updatedAt");setMenuOpen(false);}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-right text-xs font-bold hover:bg-slate-50"><ArrowUpDown className="h-4 w-4"/>فرز حسب: {sortBy==="updatedAt"?"تاريخ التعديل":sortBy==="createdAt"?"تاريخ الإنشاء":"الاسم"}</button>
      <button onClick={()=>{setShowFolderCreate(true);setMenuOpen(false);}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-right text-xs font-bold hover:bg-slate-50"><FolderPlus className="h-4 w-4"/>إضافة مجلد فرعي</button><button onClick={()=>{setMenuOpen(false);newNote();}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-right text-xs font-bold hover:bg-slate-50"><Plus className="h-4 w-4"/>إضافة ملاحظة</button>
      <button onClick={()=>{setMenuOpen(false);setFilter("favorites");setCurrentFolderId(null);setSearch("");}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-right text-xs font-bold hover:bg-slate-50"><Star className="h-4 w-4"/>عرض المفضلة</button><button onClick={()=>{setMenuOpen(false);setFilter("trash");setCurrentFolderId(null);setSearch("");}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-right text-xs font-bold hover:bg-slate-50"><Trash2 className="h-4 w-4"/>المحذوفات ({notes.filter(n=>n.isDeleted).length+folders.filter(f=>f.isDeleted).length})</button>
      </div>}</div>
      <button onClick={newNote} className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white"><Plus className="h-4 w-4"/>ملاحظة</button></div></div>{showSearch&&<div className="mt-3"><input ref={searchInputRef} autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في الملاحظات..." className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-400"/></div>}</header>
    {!uid && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">وضع محلي: النصوص تُحفظ على هذا الجهاز فقط. سجّل الدخول لتفعيل المزامنة السحابية وإرفاق الملفات.</div>}
    {error && <div role="alert" className="flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-6 text-rose-800"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
    {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-6 text-emerald-800">{message}</div>}
    {selectionMode && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3"><span className="me-auto text-xs font-bold text-blue-900">{selectedNoteIds.length} عنصر محدد</span><button onClick={async()=>{const selectedNotes=notes.filter(n=>selectedNoteIds.includes(n.id)&&!n.isDeleted);const selectedFolders=folders.filter(f=>selectedNoteIds.includes("folder:"+f.id));for(const n of selectedNotes)await save({...n,favorite:true});if(selectedFolders.length)await persistFolders(folders.map(f=>selectedNoteIds.includes("folder:"+f.id)?{...f,favorite:true,updatedAt:new Date().toISOString()}:f));setMessage("تمت إضافة العناصر المحددة إلى المفضلة.");setSelectedNoteIds([]);}} className="min-h-9 rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-800">مفضلة المحدد</button><button onClick={async()=>{const selectedNotes=notes.filter(n=>selectedNoteIds.includes(n.id)&&!n.isDeleted);if(!selectedNotes.length){setMessage("حدّد ملاحظة واحدة على الأقل لنقلها إلى المحذوفات.");return;}if(!window.confirm("نقل "+selectedNotes.length+" ملاحظة إلى المحذوفات؟ يمكن استعادتها لاحقاً."))return;let ok=true;for(const n of selectedNotes)if(!await save({...n,isDeleted:true,deletedAt:new Date().toISOString()}))ok=false;if(ok){setFilter("trash");setCurrentFolderId(null);setSelectedNoteIds([]);setMessage("تم نقل الملاحظات المحددة إلى المحذوفات.");}}} className="min-h-9 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">حذف المحدد</button><button onClick={()=>{setSelectionMode(false);setSelectedNoteIds([]);}} className="min-h-9 rounded-lg px-3 text-xs font-bold text-slate-600">إلغاء</button></div>}

    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-1.5 text-xs"><button onClick={()=>openFolder(null)} className="font-black text-blue-700">سجل الملاحظات</button>{folderPath.map(f=><React.Fragment key={f.id}><ChevronRight className="h-3 w-3 text-slate-400"/><button onClick={()=>openFolder(f.id)} className="font-bold text-blue-700">{f.name}</button></React.Fragment>)}</div><div className="flex flex-wrap items-center gap-2"><div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"><button onClick={()=>setContentFilter(v=>v==="folders"?"all":"folders")} aria-pressed={contentFilter==="folders"} className={"inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold "+(contentFilter==="folders"?"bg-amber-500 text-white":"text-amber-800")}><Folder className="h-3.5 w-3.5"/>المجلدات</button><button onClick={()=>setContentFilter(v=>v==="notes"?"all":"notes")} aria-pressed={contentFilter==="notes"} className={"inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold "+(contentFilter==="notes"?"bg-blue-600 text-white":"text-blue-700")}><StickyNote className="h-3.5 w-3.5"/>الملاحظات</button></div><button onClick={()=>setShowFolderCreate(v=>!v)} className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-amber-100 px-3 text-xs font-bold text-amber-900"><FolderPlus className="h-4 w-4"/>مجلد فرعي +</button></div></div>
      {showFolderCreate&&<div className="mt-3 flex gap-2"><input value={folderName} onChange={e=>setFolderName(e.target.value)} placeholder="اسم المجلد الجديد" className="min-h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"/><button onClick={()=>void makeFolder()} className="rounded-lg bg-blue-600 px-3 text-xs font-bold text-white">إنشاء</button></div>}
      <div className="mt-4 flex items-center justify-between gap-2"><h2 className="text-sm font-black text-slate-800">المجلدات ({childFolders.length})</h2><span className="text-[10px] text-slate-500">مجلدات الملاحظات فقط</span></div>
      {childFolders.length===0?(visible.length===0&&!loading&&contentFilter!=="notes"&&filter!=="trash"?<div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Folder className="h-8 w-8"/></div><h3 className="mt-3 text-sm font-black text-slate-800">هذا المجلد فارغ حالياً</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-6 text-slate-500">ابدأ بتنظيم ملفاتك بإنشاء مجلد فرعي أو إضافة ملاحظة جديدة.</p><div className="mx-auto mt-4 flex w-full max-w-md flex-col justify-center gap-2 sm:flex-row"><button onClick={()=>setShowFolderCreate(true)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-black text-white"><FolderPlus className="h-4 w-4"/>إنشاء مجلد هنا</button><button onClick={newNote} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-4 text-sm font-black text-blue-700"><StickyNote className="h-4 w-4"/>إضافة ملاحظة هنا</button></div></div>:<p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">لا توجد مجلدات فرعية هنا.</p>):<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{childFolders.map(f=>{const directNotes=notes.filter(n=>!n.isDeleted&&n.folderId===f.id).length;const subCount=folders.filter(x=>x.parentId===f.id).length;return <div key={f.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-start gap-2"><button onClick={()=>openFolder(f.id)} className="flex min-w-0 flex-1 items-start gap-2 text-right"><Folder className="mt-0.5 h-5 w-5 shrink-0" style={{color:f.color||"#f59e0b"}}/><span className="min-w-0"><span className="block break-words text-sm font-black text-slate-800">{f.name}</span><span className="mt-1 block text-[10px] leading-5 text-slate-500">{subCount} مجلد فرعي • {directNotes} ملاحظة مباشرة</span><span className="mt-1 block text-[10px] text-slate-400">آخر تعديل: {f.updatedAt?dateText(f.updatedAt):"—"}</span></span></button>{selectionMode&&<input type="checkbox" aria-label={"تحديد مجلد "+f.name} onClick={e=>e.stopPropagation()} onChange={()=>setSelectedNoteIds(ids=>ids.includes("folder:"+f.id)?ids.filter(id=>id!=="folder:"+f.id):[...ids,"folder:"+f.id])} checked={selectedNoteIds.includes("folder:"+f.id)} className="mt-1 h-4 w-4"/>}<button onClick={()=>{void persistFolders(folders.map(x=>x.id===f.id?{...x,favorite:!x.favorite,updatedAt:new Date().toISOString()}:x));}} title="المفضلة" className={"rounded-lg p-1.5 "+(f.favorite?"text-amber-500":"text-slate-400")}><Star className={"h-4 w-4 "+(f.favorite?"fill-amber-400":"")}/></button><div className="relative shrink-0"><button type="button" aria-label={"خيارات المجلد "+f.name} onClick={e=>{e.stopPropagation();setOpenItemMenu(v=>v==="folder:"+f.id?null:"folder:"+f.id);}} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"><MoreVertical className="h-4 w-4"/></button>{openItemMenu==="folder:"+f.id&&<div className="absolute left-0 top-full z-40 mt-1 w-52 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-right shadow-xl" onClick={e=>e.stopPropagation()}>{filter==="trash"?<><button onClick={()=>{void restoreFolder(f);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold text-emerald-700 hover:bg-emerald-50">استعادة المجلد</button><button onClick={()=>{void permanentDeleteFolder(f);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold text-rose-700 hover:bg-rose-50">حذف المجلد نهائياً</button></>:<><button onClick={()=>{openFolder(f.id);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">فتح المجلد</button></>{filter!=="trash"&&<><button onClick={()=>{setSelectionMode(true);setSelectedNoteIds(ids=>ids.includes("folder:"+f.id)?ids:[...ids,"folder:"+f.id]);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">تحديد</button><button onClick={async()=>{const text="مجلد: "+f.name+"\nالمسار: "+folderLabel(f.id)+"\nالمحتويات: "+folders.filter(x=>x.parentId===f.id).length+" مجلد فرعي، "+notes.filter(n=>n.folderId===f.id&&!n.isDeleted).length+" ملاحظة";try{if(navigator.share)await navigator.share({title:f.name,text});else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);setMessage("نُسخت تفاصيل المجلد للمشاركة.");}else setError("المشاركة غير مدعومة على هذا الجهاز.");}catch(e){if(!(e instanceof Error&&e.name==="AbortError"))setError("تعذرت مشاركة المجلد.");}setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">مشاركة المجلد</button></>}<button onClick={()=>{folderDetails(f);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">عرض التفاصيل</button><button onClick={()=>{void renameFolder(f);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">إعادة تسمية</button><button onClick={()=>{void moveFolder(f);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">نقل إلى مجلد</button><button onClick={()=>{void duplicateFolder(f);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">نسخ المجلد ومحتوياته</button><button onClick={()=>{void persistFolders(folders.map(x=>x.id===f.id?{...x,favorite:!x.favorite,updatedAt:new Date().toISOString()}:x));setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">{f.favorite?"إزالة من المفضلة":"إضافة إلى المفضلة"}</button><button onClick={()=>{const color=window.prompt("اكتب لون HEX مثل #f59e0b",f.color||"#f59e0b");if(color&&/^#[0-9a-fA-F]{6}$/.test(color))void persistFolders(folders.map(x=>x.id===f.id?{...x,color,updatedAt:new Date().toISOString()}:x));else if(color)setError("صيغة اللون غير صحيحة.");setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">تغيير لون المجلد</button><div className="my-1 border-t border-slate-100"/><button onClick={()=>{void deleteFolder(f);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold text-rose-700 hover:bg-rose-50">حذف المجلد</button></div>}</div></div></div>;})}</div>}</div>
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.35fr)]">
      <div className={(draft ? "hidden lg:block" : "block") + " min-w-0 space-y-3"}>\n        <div className="flex items-center justify-between gap-2 px-1"><h2 className="text-sm font-black text-slate-800">ملاحظات هذا المجلد</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{visible.length} ملاحظة</span></div>
        {loading ? <div className="py-5 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />جارٍ تحميل الملاحظات...</div> : visible.length === 0 ? <></> :
          <div className={viewMode==="list"?"flex flex-col gap-2":viewMode==="compact"?"grid grid-cols-1 gap-1":"grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"}>{visible.map((n) => <article key={n.id} onClick={() => selectionMode ? setSelectedNoteIds(ids=>ids.includes(n.id)?ids.filter(id=>id!==n.id):[...ids,n.id]) : openNote(n)} className={"min-w-0 cursor-pointer rounded-2xl border text-right "+(viewMode==="compact"?"px-2 py-1":"p-3 shadow-sm hover:shadow-md ")+(draft?.id===n.id?"border-blue-400 ring-2 ring-blue-100":"border-slate-200")} style={{backgroundColor:n.color||"#fff"}}>
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-1">{n.pinned && <Pin className="h-3.5 w-3.5 text-blue-600" />}{n.favorite && <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />}{n.priority !== "normal" && <span className={"rounded-full px-2 py-0.5 text-[9px] font-bold " + (n.priority === "urgent" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800")}>{PRIORITY[n.priority]}</span>}{n.completed && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] text-emerald-700">مكتملة</span>}</div><span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: n.color }} /></div>
            <div className="mt-2 flex items-center gap-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-700">{(n.title||"م").trim().charAt(0)}</div><h3 className="min-w-0 break-words text-sm font-black leading-6 text-slate-900">{n.title || "بدون عنوان"}</h3>{selectionMode&&<input type="checkbox" checked={selectedNoteIds.includes(n.id)} onClick={e=>e.stopPropagation()} onChange={()=>setSelectedNoteIds(ids=>ids.includes(n.id)?ids.filter(id=>id!==n.id):[...ids,n.id])} aria-label={"تحديد "+(n.title||"ملاحظة")} className="ms-auto h-4 w-4"/>}</div><p className="mt-1 break-words text-[10px] text-slate-500">{n.relatedLabel || n.category || "بدون تفاصيل إضافية"}</p><p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{plain(n.content).slice(0, 200) || "لا يوجد محتوى بعد..."}</p>
            {n.attachments?.length > 0 && <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><FileText className="h-3 w-3" />{n.attachments.length} مرفق</div>}
            {n.category && <span className="mt-2 inline-flex max-w-full truncate rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">{n.category}</span>}
            
            <div className="mt-3 flex items-center justify-between gap-1 border-t border-black/5 pt-2"><span className="truncate text-[10px] text-slate-500">{dateText(n.updatedAt)}</span><div className="flex shrink-0 items-center">
              {filter === "trash" ? <><button title="استعادة" onClick={(e) => { e.stopPropagation(); restore(n); }} className="rounded-lg p-2 text-emerald-700"><RotateCcw className="h-4 w-4" /></button><button title="حذف نهائي" onClick={(e) => { e.stopPropagation(); void permanentDelete(n); }} className="rounded-lg p-2 text-rose-700"><Trash2 className="h-4 w-4" /></button></> :
                <><button title="تثبيت" onClick={(e) => { e.stopPropagation(); toggleFlag(n, { pinned: !n.pinned }); }} className="rounded-lg p-2 text-slate-500"><Pin className={"h-4 w-4 " + (n.pinned ? "fill-blue-100 text-blue-700" : "")} /></button><button title="المفضلة" onClick={(e) => { e.stopPropagation(); toggleFlag(n, { favorite: !n.favorite }); }} className="rounded-lg p-2 text-slate-500"><Heart className={"h-4 w-4 " + (n.favorite ? "fill-rose-500 text-rose-500" : "")} /></button><button title="نقل للمحذوفات" onClick={(e) => { e.stopPropagation(); moveToTrash(n); }} className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button><div className="relative"><button type="button" aria-label={"خيارات الملاحظة "+(n.title||"ملاحظة")} onClick={e=>{e.stopPropagation();setOpenItemMenu(v=>v==="note:"+n.id?null:"note:"+n.id);}} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><MoreVertical className="h-4 w-4"/></button>{openItemMenu==="note:"+n.id&&<div className="absolute left-0 bottom-full z-40 mb-1 w-52 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-right shadow-xl" onClick={e=>e.stopPropagation()}><button onClick={()=>{openNote(n);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">عرض الملاحظة</button><button onClick={()=>{setDraft(n);setEditMode(true);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">تعديل الملاحظة</button><button onClick={()=>{const title=window.prompt("اكتب عنوان الملاحظة الجديد:",n.title||"");if(title?.trim())void save({...n,title:title.trim(),updatedAt:new Date().toISOString()});setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">إعادة تسمية</button><button onClick={()=>{void duplicate(n);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">نسخ الملاحظة</button><button onClick={()=>{void moveNote(n);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">نقل إلى مجلد</button><button onClick={()=>{setMovePicker({kind:"copyNote",id:n.id,title:"نسخ الملاحظة إلى مجلد"});setSelectedDestinationId(n.folderId||"");setMoveSearch("");setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">نسخ إلى مجلد</button><button onClick={()=>{toggleFlag(n,{favorite:!n.favorite});setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">{n.favorite?"إزالة من المفضلة":"إضافة إلى المفضلة"}</button><button onClick={()=>{setSelectionMode(true);setSelectedNoteIds(ids=>ids.includes(n.id)?ids:[...ids,n.id]);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">تحديد</button><button onClick={()=>{void share(n);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">مشاركة الملاحظة</button><button onClick={()=>{print(n);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold hover:bg-slate-50">طباعة / PDF</button><div className="my-1 border-t border-slate-100"/><button onClick={()=>{moveToTrash(n);setOpenItemMenu(null);}} className="w-full rounded-lg px-3 py-2 text-right text-xs font-bold text-rose-700 hover:bg-rose-50">نقل إلى المهملات</button></div>}</div></>}
            </div></div>
          </article>)}</div>}
      </div>

      <div className={(draft ? "block" : "hidden lg:block") + " min-w-0"}>
        {!draft ? <div className="hidden min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center lg:flex"><div><StickyNote className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">اختر ملاحظة أو أنشئ واحدة جديدة.</p></div></div> :
          <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3">
              <div className="flex items-center gap-2"><button onClick={() => { if (askDiscard()) setDraft(null); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-xs font-bold lg:hidden"><ChevronRight className="h-4 w-4" /> القائمة</button><span className={"text-[11px] font-bold " + (saveState === "saved" ? "text-emerald-700" : saveState === "error" ? "text-rose-700" : "text-amber-700")}>{saveState === "saved" ? "محفوظ" : saveState === "saving" ? "جارٍ الحفظ" : saveState === "pending" ? "بانتظار المزامنة" : saveState === "error" ? "تعذر الحفظ" : "تغييرات غير محفوظة"}</span></div>
              <div className="flex flex-wrap items-center gap-1">{editMode ? <><button onClick={async()=>{if(await save(draft))setEditMode(false);}} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-black text-white"><Check className="h-4 w-4"/> حفظ</button><button onClick={()=>{if(askDiscard()){setDraft(savedDraft||null);setEditMode(false);}}} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-xs font-bold">إلغاء</button></> : <button onClick={()=>setEditMode(true)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-black text-white"><Check className="h-4 w-4"/> تعديل</button>}{isDirty && savedDraft && <button onClick={() => { setDraft(savedDraft); setError(""); setMessage("تم التراجع إلى آخر نسخة محفوظة."); }} title="التراجع إلى آخر نسخة محفوظة" className="rounded-lg p-2 text-amber-700"><RotateCcw className="h-4 w-4" /></button>}<button onClick={() => void copy(draft)} title="نسخ النص" className="rounded-lg p-2 text-slate-500"><Copy className="h-4 w-4" /></button><button onClick={() => void share(draft)} title="مشاركة" className="rounded-lg p-2 text-slate-500"><Share2 className="h-4 w-4" /></button><button onClick={() => print(draft)} title="طباعة أو حفظ PDF" className="rounded-lg p-2 text-slate-500"><Printer className="h-4 w-4" /></button><button onClick={() => duplicate(draft)} title="نسخ الملاحظة" className="rounded-lg p-2 text-slate-500"><Copy className="h-4 w-4" /></button>{draft.isDeleted ? <button onClick={() => void permanentDelete(draft)} title="حذف نهائي" className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button> : <button onClick={() => moveToTrash(draft)} title="نقل للمحذوفات" className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div>
            </div>
            {draft.isDeleted && <div className="flex items-center justify-between bg-amber-50 px-3 py-2 text-xs text-amber-800">هذه الملاحظة في المحذوفات.<button onClick={() => restore(draft)} className="rounded-lg bg-white px-3 py-2 font-bold">استعادة</button></div>}
            <div className="space-y-4 p-3 sm:p-4">
              {editMode ? <input value={draft.title} onChange={e=>patch({title:e.target.value})} placeholder="عنوان الملاحظة..." aria-label="عنوان الملاحظة" className="min-h-12 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-base font-black outline-none focus:border-blue-400"/> : <h2 className="break-words text-xl font-black leading-8">{draft.title||"بدون عنوان"}</h2>}
              {editMode && <label className="block text-xs font-bold text-slate-600">المجلد<select value={draft.folderId||""} onChange={e=>patch({folderId:e.target.value})} className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">المجلد الرئيسي</option>{folders.map(f=><option key={f.id} value={f.id}>{folderLabel(f.id)}</option>)}</select></label>}
              {editMode && <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => patch({ pinned: !draft.pinned })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold"><Pin className="h-3.5 w-3.5" />{draft.pinned ? "مثبتة" : "تثبيت"}</button>
                <button onClick={() => patch({ favorite: !draft.favorite })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold"><Heart className={"h-3.5 w-3.5 " + (draft.favorite ? "fill-rose-500 text-rose-500" : "")} />المفضلة</button>
                <button onClick={() => patch({ completed: !draft.completed })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold"><CheckSquare className="h-3.5 w-3.5" />{draft.completed ? "مكتملة" : "غير مكتملة"}</button>
                <select value={draft.priority} onChange={(e) => patch({ priority: e.target.value as Priority })} aria-label="الأولوية" className="min-h-9 rounded-lg border border-slate-200 px-2 text-xs"><option value="normal">عادية</option><option value="important">مهمة</option><option value="urgent">عاجلة</option></select>
              </div>}
              {editMode && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2"><span className="text-[11px] font-bold text-slate-500">لون الخلفية</span>{COLORS.map(([name, value]) => <button key={value} title={name} aria-label={name} onClick={() => patch({ color: value })} className={"h-7 w-7 rounded-full border " + (draft.color === value ? "ring-2 ring-blue-500 ring-offset-2" : "border-black/10")} style={{ backgroundColor: value }} />)}<input type="color" aria-label="لون مخصص" value={draft.color} onChange={(e) => patch({ color: e.target.value })} className="h-8 w-9 rounded border bg-white p-0.5" /><span className="text-[11px] font-bold text-slate-500">لون النص</span><input type="color" aria-label="لون النص" value={draft.textColor} onChange={(e) => patch({ textColor: e.target.value })} className="h-8 w-9 rounded border bg-white p-0.5" /><select value={draft.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} aria-label="حجم الخط" className="min-h-8 rounded border bg-white px-2 text-xs"><option value={14}>14 px</option><option value={16}>16 px</option><option value={18}>18 px</option><option value={20}>20 px</option><option value={22}>22 px</option></select></div>}
              {editMode && <div className="sticky top-0 z-10 flex flex-nowrap items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-2"><button onClick={() => markup("**")} title="غامق" className="rounded-lg p-2 hover:bg-white"><Bold className="h-4 w-4" /></button><button onClick={() => markup("*")} title="مائل" className="rounded-lg p-2 hover:bg-white"><Italic className="h-4 w-4" /></button><button onClick={() => markup("__")} title="تسطير" className="rounded-lg p-2 hover:bg-white"><Underline className="h-4 w-4" /></button><button onClick={() => markup("~~")} title="يتوسطه خط" className="rounded-lg p-2 hover:bg-white"><Strikethrough className="h-4 w-4" /></button><button onClick={() => markup("==")} title="تمييز النص" className="rounded-lg p-2 hover:bg-white"><Highlighter className="h-4 w-4" /></button><button onClick={undoEdit} disabled={!undoStack.length} title="تراجع" className="rounded-lg p-2 hover:bg-white disabled:opacity-30"><Undo2 className="h-4 w-4" /></button><button onClick={redoEdit} disabled={!redoStack.length} title="إعادة" className="rounded-lg p-2 hover:bg-white disabled:opacity-30"><Redo2 className="h-4 w-4" /></button><span className="mx-1 border-r border-slate-200" /><button onClick={() => markup("- ", "")} title="قائمة نقطية" className="rounded-lg p-2 hover:bg-white"><List className="h-4 w-4" /></button><button onClick={() => markup("1. ", "")} title="قائمة مرقمة" className="rounded-lg p-2 hover:bg-white"><ListOrdered className="h-4 w-4" /></button><button onClick={() => markup("- [ ] ", "")} title="مهمة بمربع اختيار" className="rounded-lg p-2 hover:bg-white"><CheckSquare className="h-4 w-4" /></button><button onClick={() => patch({ content: draft.content + (draft.content ? "\n" : "") + "\n" })} title="فقرة جديدة" className="rounded-lg p-2 hover:bg-white"><AlignLeft className="h-4 w-4" /></button><span className="mx-1 border-r border-slate-200" /><button onClick={() => patch({textAlign:"right"})} title="محاذاة لليمين" className={"rounded-lg p-2 hover:bg-white "+((draft.textAlign||"right")==="right"?"bg-blue-100 text-blue-700":"")}><AlignRight className="h-4 w-4" /></button><button onClick={() => patch({textAlign:"center"})} title="توسيط" className={"rounded-lg p-2 hover:bg-white "+(draft.textAlign==="center"?"bg-blue-100 text-blue-700":"")}><AlignCenter className="h-4 w-4" /></button><button onClick={() => patch({textAlign:"justify"})} title="ضبط النص" className={"rounded-lg p-2 hover:bg-white "+(draft.textAlign==="justify"?"bg-blue-100 text-blue-700":"")}><AlignJustify className="h-4 w-4" /></button><button onClick={() => patch({textAlign:"left"})} title="محاذاة لليسار" className={"rounded-lg p-2 hover:bg-white "+(draft.textAlign==="left"?"bg-blue-100 text-blue-700":"")}><AlignLeft className="h-4 w-4" /></button><span className="text-[10px] text-slate-400">حدد النص للتنسيق • Ctrl+Z للتراجع</span></div>}{!editMode ? <div className="min-h-56 whitespace-pre-wrap break-words rounded-xl border border-slate-100 p-4 leading-8" style={{backgroundColor:draft.color,color:draft.textColor,fontSize:draft.fontSize,textAlign:draft.textAlign||"right"}} dangerouslySetInnerHTML={{__html:preview(draft.content)||"لا يوجد محتوى."}} /> : <textarea ref={editorRef} onKeyDown={handleEditorKeyDown} value={draft.content} onChange={(e) => patch({ content: e.target.value })} placeholder={"اكتب ملاحظتك هنا...\nمثال: الاتصال بأحمد يوم 25 لمتابعة القسط."} aria-label="محتوى الملاحظة" rows={9} className="block min-h-56 w-full min-w-0 resize-y rounded-xl border border-slate-200 p-3 leading-8 outline-none focus:border-blue-400" style={{ backgroundColor: draft.color, color: draft.textColor, fontSize: draft.fontSize, lineHeight: 1.9, textAlign: draft.textAlign || "right" }} />}
              {editMode ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">التصنيف<input value={draft.category} onChange={(e) => patch({ category: e.target.value })} list="notes-categories" placeholder="متابعة العملاء" className="mt-1.5 min-h-10 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-normal" /><datalist id="notes-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist></label><label className="text-xs font-bold text-slate-600">الوسوم (بفاصلة)<input value={draft.tags.join(", ")} onChange={(e) => patch({ tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20) })} placeholder="قسط، عاجل، مخزن" className="mt-1.5 min-h-10 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label></div> : draft.category ? <p className="text-xs text-slate-600">التصنيف: {draft.category}</p> : null}
              {draft.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{draft.tags.map((t) => <span key={t} className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">#{t}</span>)}</div>}
              {editMode ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">موعد التذكير<input type="datetime-local" value={draft.reminderAt} onChange={(e) => patch({ reminderAt: e.target.value })} className="mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm font-normal" /></label><div className="flex flex-col justify-end gap-1 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><span><Clock3 className="me-1 inline h-3.5 w-3.5" />الإنشاء: {dateText(draft.createdAt)}</span><span><Clock3 className="me-1 inline h-3.5 w-3.5" />آخر تعديل: {dateText(draft.updatedAt)}</span>{draft.reminderAt && !draft.completed && new Date(draft.reminderAt).getTime() < Date.now() && <span className="font-black text-rose-700">التذكير متأخر</span>}</div></div> : <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{draft.reminderAt ? "موعد التذكير: "+dateText(draft.reminderAt) : "لا يوجد موعد تذكير."}</div>}
              {editMode && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><div className="flex flex-wrap items-center gap-2"><button onClick={() => { imageInsertPositionRef.current=editorRef.current?.selectionStart ?? draft.content.length; fileRef.current?.click(); }} disabled={uploading || draft.isDeleted} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-50">{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{uploading ? "جارٍ رفع الملف..." : "إرفاق صورة أو ملف"}</button><input ref={fileRef} type="file" multiple accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => void addFiles(e)} />{draft.attachments.length > 0 && <span className="text-xs text-slate-500">{draft.attachments.length} مرفق</span>}</div><span className="text-[10px] text-slate-400">حتى 15 MB لكل ملف</span></div>}
              {draft.attachments.length > 0 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{draft.attachments.map((a) => <div key={a.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 p-2">{a.contentType.startsWith("image/") ? <button onClick={() => window.open(a.url, "_blank", "noopener,noreferrer")} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100"><img src={a.url} alt={a.name} className="h-full w-full object-cover" loading="lazy" /></button> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><FileText className="h-6 w-6" /></div>}<div className="min-w-0 flex-1"><a href={a.url} target="_blank" rel="noreferrer" className="block break-words text-xs font-bold text-blue-700">{a.name}</a><p className="mt-1 break-all text-[10px] text-slate-500">{a.contentType} · {sizeText(a.size)}</p><a href={a.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-600"><Download className="h-3 w-3" /> فتح / تنزيل</a></div>{editMode && <button disabled={uploading || draft.isDeleted} onClick={() => void removeAttachment(a)} title="حذف المرفق" className="rounded-lg p-2 text-rose-600 disabled:opacity-40"><X className="h-4 w-4" /></button>}</div>)}</div>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-400"><span>المعرّف: {draft.id.slice(0, 12)}</span>{isDirty && <span className="font-bold text-amber-700">تغييرات تحتاج إلى حفظ</span>}</div>
            </div>
          </div>}
      </div>
    </div>

    {movePicker && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={movePicker.title} onClick={()=>setMovePicker(null)}><div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="text-base font-black text-slate-900">{movePicker.title}</h2><p className="mt-1 text-xs text-slate-500">اختر المجلد الذي تريد وضع العنصر داخله.</p></div><button onClick={()=>setMovePicker(null)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><div className="p-3"><input value={moveSearch} onChange={e=>setMoveSearch(e.target.value)} placeholder="ابحث عن مجلد..." className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-400"/></div><div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3"><button onClick={()=>setSelectedDestinationId("")} className={"flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-right text-sm "+(!selectedDestinationId?"border-blue-300 bg-blue-50 text-blue-800":"border-transparent hover:bg-slate-50")}><Folder className="h-5 w-5 shrink-0 text-amber-500"/><span className="min-w-0 flex-1 font-bold">المجلد الرئيسي</span>{!selectedDestinationId&&<Check className="h-4 w-4"/>}</button>{folders.filter(f=>!f.isDeleted&&f.name.toLocaleLowerCase("ar").includes(moveSearch.trim().toLocaleLowerCase("ar"))&&!(movePicker.kind==="folder"&&(f.id===movePicker.id||isFolderDescendant(f.id,movePicker.id||"")))).sort((a,b)=>folderLabel(a.id).localeCompare(folderLabel(b.id),"ar")).map(f=><button key={f.id} onClick={()=>setSelectedDestinationId(f.id)} className={"flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-right text-sm "+(selectedDestinationId===f.id?"border-blue-300 bg-blue-50 text-blue-800":"border-transparent hover:bg-slate-50")}><Folder className="h-5 w-5 shrink-0" style={{color:f.color||"#f59e0b"}}/><span className="min-w-0 flex-1"><span className="block break-words font-bold">{f.name}</span><span className="mt-0.5 block break-words text-[10px] text-slate-400">{folderLabel(f.id)}</span></span>{selectedDestinationId===f.id&&<Check className="h-4 w-4 shrink-0"/>}</button>)}{folders.filter(f=>!f.isDeleted&&f.name.toLocaleLowerCase("ar").includes(moveSearch.trim().toLocaleLowerCase("ar"))).length===0&&<p className="p-4 text-center text-xs text-slate-500">لا توجد مجلدات مطابقة للبحث.</p>}</div><div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3"><span className="min-w-0 flex-1 break-words text-[11px] text-slate-500">الوجهة: {selectedDestinationId?folderLabel(selectedDestinationId):"المجلد الرئيسي"}</span><div className="flex gap-2"><button onClick={()=>setMovePicker(null)} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600">إلغاء</button><button onClick={()=>void commitMovePicker()} className="min-h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white">{movePicker.kind==="copyNote"?"نسخ هنا":movePicker.kind==="bulk"?"نقل المحدد هنا":"نقل هنا"}</button></div></div></div></div>}
    {renameFolderTarget && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="إعادة تسمية المجلد" onClick={()=>setRenameFolderTarget(null)}><form onSubmit={e=>{e.preventDefault();void commitRenameFolder();}} className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={e=>e.stopPropagation()}><h2 className="text-base font-black text-slate-900">إعادة تسمية المجلد</h2><label className="mt-3 block text-xs font-bold text-slate-600">اسم المجلد<input autoFocus value={renameFolderValue} onChange={e=>setRenameFolderValue(e.target.value)} maxLength={100} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-amber-400"/></label><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setRenameFolderTarget(null)} className="min-h-10 rounded-xl border px-4 text-xs font-bold">إلغاء</button><button type="submit" className="min-h-10 rounded-xl bg-orange-500 px-4 text-xs font-black text-white">حفظ الاسم</button></div></form></div>}
    {detailsFolderTarget && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="تفاصيل المجلد" onClick={()=>setDetailsFolderTarget(null)}><div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-xl bg-orange-100 p-3 text-orange-600"><Folder className="h-6 w-6"/></div><div><h2 className="text-base font-black text-slate-900">{detailsFolderTarget.name}</h2><p className="mt-1 break-words text-xs text-slate-500">{folderLabel(detailsFolderTarget.id)}</p></div></div><button onClick={()=>setDetailsFolderTarget(null)} aria-label="إغلاق" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4"/></button></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-orange-50 p-3"><span className="block text-[11px] text-slate-500">المجلدات الفرعية</span><strong className="mt-1 block text-lg text-orange-700">{folders.filter(f=>f.parentId===detailsFolderTarget.id&&!f.isDeleted).length}</strong></div><div className="rounded-xl bg-blue-50 p-3"><span className="block text-[11px] text-slate-500">الملاحظات المباشرة</span><strong className="mt-1 block text-lg text-blue-700">{notes.filter(n=>n.folderId===detailsFolderTarget.id&&!n.isDeleted).length}</strong></div></div><div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600"><p>تاريخ آخر تعديل: {detailsFolderTarget.updatedAt?dateText(detailsFolderTarget.updatedAt):"—"}</p><p>المعرّف: <span className="break-all">{detailsFolderTarget.id}</span></p></div><button onClick={()=>setDetailsFolderTarget(null)} className="mt-4 min-h-10 w-full rounded-xl border border-slate-200 text-xs font-bold">إغلاق</button></div></div>}
    {draft && <div id="notes-print-view" className="hidden" dir="rtl"><h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{draft.title || "ملاحظة"}</h1><p style={{ color: "#64748b", fontSize: 11, marginBottom: 20 }}>الإنشاء: {dateText(draft.createdAt)} — آخر تعديل: {dateText(draft.updatedAt)}</p><div style={{ fontSize: draft.fontSize, color: draft.textColor, lineHeight: 2, overflowWrap: "anywhere" }} dangerouslySetInnerHTML={{ __html: preview(draft.content) }} />{draft.attachments.filter((a) => a.contentType.startsWith("image/")).map((a) => <div key={a.id} style={{ marginTop: 16 }}><p style={{ fontSize: 11 }}>{a.name}</p><img src={a.url} alt={a.name} /></div>)}</div>}
  </section>;
}
