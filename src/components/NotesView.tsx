import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getDownloadURL, ref as storageRef, uploadBytes, deleteObject } from "firebase/storage";
import { AlignLeft, BellRing, Bold, Check, CheckSquare, ChevronRight, Clock3, Copy, Download, FileText, Folder, FolderPlus, Heart, ImagePlus, Italic, List, ListOrdered, LoaderCircle, Pin, Plus, Printer, RotateCcw, Search, Share2, StickyNote, Trash2, Underline, X, LayoutGrid, Rows3, ListCollapse, MoreVertical, RefreshCw, ArrowUpDown, Star, BookOpen, Strikethrough, Highlighter, AlignRight, AlignCenter, AlignJustify, Undo2, Redo2 } from "lucide-react";
import { db, storage } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

interface Attachment { id: string; name: string; contentType: string; size: number; url: string; path: string; }
type Priority = "normal" | "important" | "urgent";
type Filter = "all" | "pinned" | "favorites" | "tasks" | "overdue" | "trash";
interface Note {
  id: string; userId?: string; title: string; content: string; color: string; textColor: string; fontSize: number; textAlign?: "right" | "center" | "left" | "justify";
  favorite: boolean; pinned: boolean; completed: boolean; createdAt: string; updatedAt: string; category: string;
  tags: string[]; priority: Priority; folderId?: string; relatedType: string; relatedId: string; relatedLabel: string;
  reminderAt: string; isDeleted: boolean; deletedAt?: string; attachments: Attachment[];
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
    title: "", content: "", color: "#fffaf0", textColor: "#1e293b", fontSize: 16, textAlign: "right", favorite: false, pinned: false,
    completed: false, createdAt: now, updatedAt: now, category: "", tags: [], priority: "normal",
    relatedType: "", relatedId: "", relatedLabel: "", reminderAt: "", isDeleted: false, attachments: [],
  };
}
const RICH_MARKER = "<!--alhamdulillah-rich-note-->";
function sanitizeRichHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","STRIKE","UL","OL","LI","BLOCKQUOTE","SPAN","FONT","H1","H2","H3","IMG","A"]);
  const clean = (node: ParentNode) => { Array.from(node.childNodes).forEach((child) => { if (child.nodeType === Node.TEXT_NODE) return; if (!(child instanceof HTMLElement)) { child.parentNode?.removeChild(child); return; } if (!allowed.has(child.tagName)) { const parent=child.parentNode; if(parent){while(child.firstChild) parent.insertBefore(child.firstChild,child); parent.removeChild(child);} return; } Array.from(child.attributes).forEach((attr) => { const name=attr.name.toLowerCase(); if (child.tagName==="FONT" && ["face","size","color"].includes(name)) { if(name==="face"&&!/^[\w ,.-]{1,40}$/.test(attr.value)) child.removeAttribute(attr.name); } else if (name==="style") { const safe=attr.value.split(";").map(x=>x.trim()).filter(x=>/^(color|background-color|font-size|font-family|text-align):\s*[#(),.%\w -]+$/i.test(x)).join(";"); if(safe)child.setAttribute("style",safe);else child.removeAttribute("style"); } else if (child.tagName==="IMG" && ["src","alt","width","height"].includes(name)) { if(name==="src"&&!/^https:\/\//i.test(attr.value)) child.removeAttribute(attr.name); } else if (child.tagName==="A" && ["href","target","rel"].includes(name)) { if(name==="href"&&!/^https:\/\//i.test(attr.value)) child.removeAttribute(attr.name); } else child.removeAttribute(attr.name); }); if(child.tagName==="IMG") child.setAttribute("style","max-width:100%;height:auto;border-radius:10px;"); else clean(child); }); };
  clean(doc.body); return doc.body.innerHTML;
}
function plain(text: string): string {
  const value=text.startsWith(RICH_MARKER)?text.slice(RICH_MARKER.length):text;
  if (text.startsWith(RICH_MARKER)) return value.replace(/<br\s*\/?>/gi,"\n").replace(/<\/(p|div|li|h[1-3])>/gi,"\n").replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\n{3,}/g,"\n\n").trim();
  return value.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/^- \[x\] /gim, "☑ ").replace(/^- \[ \] /gm, "☐ ").replace(/^- /gm, "• ").trim();
}
function escaped(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function preview(text: string): string {
  if (text.startsWith(RICH_MARKER)) return sanitizeRichHtml(text.slice(RICH_MARKER.length));
  return text.split("\n").map((raw) => {
    const imageMatch = raw.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/);
    if (imageMatch) return '<img src="' + escaped(imageMatch[2]) + '" alt="' + escaped(imageMatch[1]) + '" style="display:block;max-width:100%;max-height:420px;object-fit:contain;margin:10px auto;border-radius:10px" loading="lazy" />';
    let line = escaped(raw).replace(/^- \[x\] (.*)$/i, "☑ $1").replace(/^- \[ \] (.*)$/, "☐ $1").replace(/^- (.*)$/, "• $1").replace(/^\d+[.)] (.*)$/, "• $1");
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<u>$1</u>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/~~(.+?)~~/g, "<del>$1</del>").replace(/==(.+?)==/g, '<mark style="background:#fef08a;border-radius:3px;padding:0 2px">$1</mark>');
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

export default function NotesView() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || null;
  const [notes, setNotes] = useState<Note[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [folders,setFolders]=useState<Array<{id:string;name:string;parentId:string|null;favorite?:boolean;color?:string;updatedAt?:string;createdAt?:string;description?:string;isDeleted?:boolean;deletedAt?:string}>>(()=>{try{return (JSON.parse(localStorage.getItem("alhamdulillah.notes.folders")||"[]") as Array<{id:string;name:string;parentId?:string|null}>).map(f=>({...f,parentId:typeof f.parentId==="string"&&f.parentId.trim()?f.parentId:null}));}catch{return [];}});
  const [menuOpen,setMenuOpen]=useState(false); const [selectionMode,setSelectionMode]=useState(false); const [selectedNoteIds,setSelectedNoteIds]=useState<string[]>([]); const [refreshToken,setRefreshToken]=useState(0);
  const [currentFolderId,setCurrentFolderId]=useState<string|null>(null); const [folderName,setFolderName]=useState(""); const [showFolderCreate,setShowFolderCreate]=useState(false);
  const [viewMode, setViewMode] = useState<"grid"|"list"|"compact">(()=>{try{return (localStorage.getItem("alhamdulillah.notes.view") as "grid"|"list"|"compact")||"grid";}catch{return "grid";}});

  const [openItemMenu,setOpenItemMenu]=useState<string|null>(null);
  const [movePicker,setMovePicker]=useState<null|{kind:"folder"|"note"|"copyNote"|"bulk";id?:string;title:string}>(null);
  const [selectedDestinationId,setSelectedDestinationId]=useState("");
  const [moveSearch,setMoveSearch]=useState("");
  const [renameFolderTarget,setRenameFolderTarget]=useState<null|{id:string;name:string}>(null);
  const [renameFolderValue,setRenameFolderValue]=useState("");
  const [folderEditMode,setFolderEditMode]=useState<"edit"|"rename">("edit");
  const [folderDescriptionValue,setFolderDescriptionValue]=useState("");
  const [folderColorValue,setFolderColorValue]=useState("#f59e0b");
  const [renameNoteTarget,setRenameNoteTarget]=useState<Note|null>(null);
  const [renameNoteValue,setRenameNoteValue]=useState("");
  const [detailsFolderTarget,setDetailsFolderTarget]=useState<null|{id:string;name:string;parentId:string|null;updatedAt?:string;createdAt?:string;description?:string;color?:string}>(null);
  const [sortAsc,setSortAsc]=useState(false);
  const [draft, setDraft] = useState<Note | null>(null);
  const [undoStack,setUndoStack]=useState<string[]>([]); const [redoStack,setRedoStack]=useState<string[]>([]);
  const imageInsertPositionRef=useRef<number|null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"updatedAt" | "createdAt" | "title">("updatedAt");
  const [showSortDialog,setShowSortDialog]=useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const editorSelectionRef = useRef<Range | null>(null);
  const [fontFamily,setFontFamily]=useState("Arial");
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
    const stopFolders=onSnapshot(collection(db,"users",uid,"noteFolders"),snap=>setFolders(snap.docs.map(d=>({id:d.id,name:String(d.data().name||"مجلد"),parentId:typeof d.data().parentId==="string"&&d.data().parentId.trim()?d.data().parentId:null,favorite:Boolean(d.data().favorite),color:typeof d.data().color==="string"?d.data().color:"#f59e0b",description:typeof d.data().description==="string"?d.data().description:"",updatedAt:typeof d.data().updatedAt==="string"?d.data().updatedAt:"",createdAt:typeof d.data().createdAt==="string"?d.data().createdAt:(typeof d.data().updatedAt==="string"?d.data().updatedAt:""),isDeleted:Boolean(d.data().isDeleted),deletedAt:typeof d.data().deletedAt==="string"?d.data().deletedAt:undefined}))),err=>console.error("Folders listener:",err));
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

    const q = search.trim().toLocaleLowerCase("ar");
    return notes.filter((n) => filter === "trash" ? (n.isDeleted || Boolean(currentFolderId && folders.some(f=>f.id===currentFolderId&&f.isDeleted&&n.folderId===currentFolderId))) : !n.isDeleted).filter(n=>currentFolderId?n.folderId===currentFolderId:(filter==="trash"||filter==="favorites"?true:!n.folderId)).filter((n) => {
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
  }, [notes, folders, filter, search, categoryFilter, colorFilter, sortBy, sortAsc, currentFolderId, "all"]);

  useEffect(() => { if (editMode && draft && editorRef.current) { editorRef.current.innerHTML = draft.content.startsWith(RICH_MARKER) ? sanitizeRichHtml(draft.content.slice(RICH_MARKER.length)) : preview(draft.content); } }, [draft?.id, editMode]);\n\n  const savedDraft = draft ? notes.find((n) => n.id === draft.id) : undefined;
  const isDirty = Boolean(draft && changed(draft, savedDraft));
  const askDiscard = () => !isDirty || window.confirm("توجد تغييرات غير محفوظة. هل تريد تركها دون حفظ؟");
  const openNote = (note: Note) => { if (draft?.id !== note.id && !askDiscard()) return; setDraft(note); setEditMode(false); setUndoStack([]); setRedoStack([]); imageInsertPositionRef.current=null; setError(""); setMessage(""); };
  const newNote = () => { if(filter==="trash"){setError("لا يمكن إنشاء ملاحظة داخل المهملات؛ استعد المجلد أولاً.");return;} if (!askDiscard()) return; setDraft({ ...createNote(), folderId: currentFolderId || "" }); setEditMode(true); setUndoStack([]); setRedoStack([]); imageInsertPositionRef.current=null; setFilter("all"); setSaveState("idle"); setError(""); setMessage(""); };
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
    return setDoc(doc(db, "users", uid, "notes", finalNote.id), { ...finalNote, userId: uid }, { merge: true }).then(() => {
      setNotes((old) => [finalNote, ...old.filter((n) => n.id !== finalNote.id)]);
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
  const moveToTrash = async (note: Note) => {
    if (!window.confirm("نقل الملاحظة إلى سلة المهملات؟ يمكنك استعادتها لاحقاً.")) return;
    const wasOpenInEditor = draft?.id === note.id;
    const base = wasOpenInEditor ? draft : note;
    const next = { ...base, isDeleted: true, deletedAt: new Date().toISOString() };
    const saved = await save(next);
    if (!saved) return;
    // Keep the user in the current folder/list. Opening the trash is an explicit action.
    if (wasOpenInEditor) setDraft(null);
    setMessage("نُقلت الملاحظة إلى سلة المهملات. يمكنك فتحها من زر سلة المهملات عند الحاجة.");
  };
  const restore = (note: Note) => {
    const base = draft?.id === note.id ? draft : note;
    const originalParent=folders.find(f=>f.id===(base.folderId||""));
    const safeFolderId=originalParent?.isDeleted?"":(base.folderId||"");
    const next = { ...base, folderId:safeFolderId, isDeleted: false, deletedAt: undefined };
    void save(next).then(ok=>{if(ok){setFilter("all");setCurrentFolderId(safeFolderId||null);setMessage(originalParent?.isDeleted?"استُعيدت الملاحظة إلى المجلد الرئيسي لأن مجلدها الأصلي ما زال في المهملات.":"تمت استعادة الملاحظة إلى مجلدها.");}});
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
  const syncRichEditor = () => { const el=editorRef.current; if(!el)return; patch({content:RICH_MARKER+sanitizeRichHtml(el.innerHTML)}); };
  const richCommand = (command:string,value?:string) => { const el=editorRef.current;if(!el)return;el.focus();const saved=editorSelectionRef.current;if(saved&&el.contains(saved.commonAncestorContainer)){const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(saved);}document.execCommand(command,false,value);syncRichEditor();rememberEditorSelection(); };
  const rememberEditorSelection = () => { const sel=window.getSelection();if(sel&&sel.rangeCount&&editorRef.current?.contains(sel.anchorNode))editorSelectionRef.current=sel.getRangeAt(0).cloneRange(); };
  const handleEditorKeyDown=(e:React.KeyboardEvent<HTMLDivElement>)=>{
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="s") { e.preventDefault(); if(draft)void save({...draft,content:RICH_MARKER+sanitizeRichHtml(editorRef.current?.innerHTML||"")}).then(ok=>{if(ok)setEditMode(false);}); }
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
      let content = draft.content;
      if (inlineImages.length) {
        const editor = editorRef.current;
        if (editor && editMode) {
          let range = editorSelectionRef.current;
          if (!range || !editor.contains(range.commonAncestorContainer)) {
            range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
          }
          range.deleteContents();
          inlineImages.forEach((image) => {
            const img=document.createElement("img"); img.src=image.url; img.alt=image.name; img.style.maxWidth="100%"; img.style.height="auto"; img.style.borderRadius="10px"; img.style.display="block"; img.style.margin="10px auto";
            const br=document.createElement("br"); range!.insertNode(img); img.parentNode?.insertBefore(br,img); img.parentNode?.insertBefore(document.createElement("br"),img.nextSibling);
            range=document.createRange(); range.setStartAfter(img); range.collapse(true);
          });
          editorSelectionRef.current=range.cloneRange(); content=RICH_MARKER+sanitizeRichHtml(editor.innerHTML);
        } else {
          const base=draft.content.startsWith(RICH_MARKER)?draft.content.slice(RICH_MARKER.length):preview(draft.content);
          content=RICH_MARKER+sanitizeRichHtml(base+inlineImages.map(image=>'<p><img src="'+escaped(image.url)+'" alt="'+escaped(image.name)+'" /></p>').join(""));
        }
      }
      const next = { ...draft, content, attachments: [...draft.attachments, ...uploaded] }; imageInsertPositionRef.current=null; setDraft(next);
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

  const openFolder=(folderId:string|null,keepTrash=false)=>{if(folderId!==currentFolderId&&draft&&!askDiscard())return;setDraft(null);setEditMode(false);setCurrentFolderId(folderId);setFilter(keepTrash?"trash":"all");setSelectedNoteIds([]);setOpenItemMenu(null);setError("");setMessage("");};
  const folderPath=(()=>{const path:Array<{id:string;name:string}>=[];let id=currentFolderId;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const f=folders.find(x=>x.id===id);if(!f)break;path.unshift(f);id=f.parentId;}return path;})(); const childFolders=(filter==="trash"?folders.filter(f=>f.isDeleted&&(currentFolderId?f.parentId===currentFolderId:!folders.some(p=>p.id===f.parentId&&p.isDeleted))):filter==="favorites"?folders.filter(f=>!f.isDeleted&&f.favorite):folders.filter(f=>!f.isDeleted&&(f.parentId||null)===currentFolderId)).filter(f=>(!search.trim()||f.name.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar")))).sort((a,b)=>{const result=sortBy==="title"?a.name.localeCompare(b.name,"ar"):new Date((sortBy==="createdAt"?a.createdAt||a.updatedAt:a.updatedAt)||0).getTime()-new Date((sortBy==="createdAt"?b.createdAt||b.updatedAt:b.updatedAt)||0).getTime();return sortAsc?result:-result;});
  const persistFolders=async(next:Array<{id:string;name:string;parentId:string|null;favorite?:boolean;color?:string;updatedAt?:string;createdAt?:string;description?:string;isDeleted?:boolean;deletedAt?:string}>)=>{
    const now=new Date().toISOString();
    const stamped=next.map(f=>({...f,parentId:f.parentId&&f.parentId.trim()?f.parentId:null,updatedAt:f.updatedAt||now}));
    if(!uid){try{localStorage.setItem("alhamdulillah.notes.folders",JSON.stringify(stamped));setFolders(stamped);return;}catch(e){throw new Error("تعذر حفظ المجلدات محلياً.");}}
    const previousById=new Map<string,(typeof folders)[number]>();for(const folder of folders)previousById.set(folder.id,folder);
    const signature=(f:{id:string;name:string;parentId:string|null;favorite?:boolean;color?:string;updatedAt?:string;createdAt?:string;description?:string;isDeleted?:boolean;deletedAt?:string})=>JSON.stringify([f.id,f.name,f.parentId||null,Boolean(f.favorite),f.color||"#f59e0b",f.description||"",f.createdAt||f.updatedAt||"",f.updatedAt||"",Boolean(f.isDeleted),f.deletedAt||""]);
    const nextIds=new Set(stamped.map(f=>f.id));
    const ops:Array<{kind:"set";folder:typeof stamped[number]}|{kind:"delete";id:string}>=[];
    for(const folder of stamped){const previous=previousById.get(folder.id);if(!previous||signature(previous)!==signature(folder))ops.push({kind:"set",folder});}
    for(const previous of folders)if(!nextIds.has(previous.id))ops.push({kind:"delete",id:previous.id});
    for(let i=0;i<ops.length;i+=450){const batch=writeBatch(db);for(const op of ops.slice(i,i+450)){if(op.kind==="set")batch.set(doc(db,"users",uid,"noteFolders",op.folder.id),{...op.folder,userId:uid},{merge:true});else batch.delete(doc(db,"users",uid,"noteFolders",op.id));}await batch.commit();}
    setFolders(stamped);
  };
  const makeFolder=async()=>{if(filter==="trash"){setError("لا يمكن إنشاء مجلد داخل المهملات؛ استعد المجلد أولاً.");return;}const name=folderName.trim();if(!name)return;if(folders.some(f=>!f.isDeleted&&(f.parentId||null)===currentFolderId&&f.name.toLocaleLowerCase("ar")===name.toLocaleLowerCase("ar"))){setError("يوجد مجلد بهذا الاسم في هذا المسار.");return;}const id="folder_"+(typeof crypto!=="undefined"&&"randomUUID"in crypto?crypto.randomUUID().replace(/-/g,""):Date.now().toString(36));try{await persistFolders([...folders,{id,name,parentId:currentFolderId,favorite:false,color:"#f59e0b",description:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]);setFolderName("");setShowFolderCreate(false);setCurrentFolderId(currentFolderId);setFilter("all");setSelectedNoteIds([]);setMessage("تم إنشاء المجلد داخل المسار الحالي.");}catch(e){console.error(e);setError("تعذر حفظ المجلد.");}};
  const openFolderEdit=(f:{id:string;name:string;parentId:string|null;description?:string;color?:string})=>{setFolderEditMode("edit");setRenameFolderTarget({id:f.id,name:f.name});setRenameFolderValue(f.name);setFolderDescriptionValue(f.description||"");setFolderColorValue(f.color||"#f59e0b");setOpenItemMenu(null);};
  const renameFolder=(f:{id:string;name:string;parentId:string|null;description?:string;color?:string})=>{setFolderEditMode("rename");setRenameFolderTarget({id:f.id,name:f.name});setRenameFolderValue(f.name);setFolderDescriptionValue(f.description||"");setFolderColorValue(f.color||"#f59e0b");setOpenItemMenu(null);};
  const commitRenameFolder=async()=>{if(!renameFolderTarget)return;const name=renameFolderValue.trim();if(!name){setError("اكتب اسم المجلد.");return;}if(!/^#[0-9a-fA-F]{6}$/.test(folderColorValue)){setError("اختر لوناً صالحاً للمجلد.");return;}const target=folders.find(x=>x.id===renameFolderTarget.id);if(!target){setRenameFolderTarget(null);return;}if(folders.some(x=>x.id!==target.id&&x.parentId===target.parentId&&!x.isDeleted&&x.name.toLocaleLowerCase("ar")===name.toLocaleLowerCase("ar"))){setError("يوجد مجلد بهذا الاسم في المسار نفسه.");return;}try{await persistFolders(folders.map(x=>x.id===target.id?{...x,name,...(folderEditMode==="edit"?{description:folderDescriptionValue.trim(),color:folderColorValue}:{}),updatedAt:new Date().toISOString()}:x));setRenameFolderTarget(null);setMessage(folderEditMode==="edit"?"تم حفظ بيانات المجلد.":"تم تغيير اسم المجلد.");}catch(e){console.error(e);setError("تعذر حفظ بيانات المجلد.");}};
  const deleteFolder=async(f:{id:string;name:string;parentId:string|null})=>{if(!window.confirm("نقل المجلد «"+f.name+"» ومجلداته الفرعية إلى المهملات؟ ستبقى المحتويات محفوظة ويمكن استعادتها."))return;try{const subtree=new Set<string>([f.id]);let changed=true;while(changed){changed=false;for(const child of folders)if(child.parentId&&subtree.has(child.parentId)&&!subtree.has(child.id)){subtree.add(child.id);changed=true;}}const now=new Date().toISOString();await persistFolders(folders.map(x=>subtree.has(x.id)?{...x,isDeleted:true,deletedAt:now,updatedAt:now}:x));if(currentFolderId&&subtree.has(currentFolderId))setCurrentFolderId(f.parentId||null);setSelectedNoteIds([]);setSelectionMode(false);setOpenItemMenu(null);setMessage("نُقل المجلد ومحتوياته إلى المهملات. افتح زر سلة المهملات لعرضها.");}catch(e){console.error(e);setError("تعذر نقل المجلد إلى المهملات؛ لم تُحذف محتوياته.");}};
  const restoreFolder=async(f:{id:string;name:string;parentId:string|null})=>{try{const subtree=new Set<string>([f.id]);let changed=true;while(changed){changed=false;for(const child of folders)if(child.parentId&&subtree.has(child.parentId)&&!subtree.has(child.id)){subtree.add(child.id);changed=true;}}const now=new Date().toISOString();const parentStillDeleted=Boolean(f.parentId&&folders.some(x=>x.id===f.parentId&&x.isDeleted));await persistFolders(folders.map(x=>subtree.has(x.id)?{...x,isDeleted:false,deletedAt:undefined,parentId:x.id===f.id&&parentStillDeleted?null:x.parentId,updatedAt:now}:x));setFilter("all");setCurrentFolderId(parentStillDeleted?null:(f.parentId||null));setMessage(parentStillDeleted?"تمت استعادة المجلد إلى المستوى الرئيسي لأن مجلده الأب ما زال في المهملات.":"تمت استعادة المجلد ومجلداته الفرعية.");}catch(e){console.error(e);setError("تعذرت استعادة المجلد؛ تحقق من الاتصال والمزامنة.");}};
  const permanentDeleteFolder=async(f:{id:string;name:string;parentId:string|null})=>{if(!window.confirm("حذف المجلد «"+f.name+"» ومجلداته الفرعية والملاحظات الموجودة داخلها نهائياً؟ لا يمكن التراجع عن هذا الإجراء."))return;try{const subtree=new Set<string>([f.id]);let changed=true;while(changed){changed=false;for(const child of folders)if(child.parentId&&subtree.has(child.parentId)&&!subtree.has(child.id)){subtree.add(child.id);changed=true;}}const related=notes.filter(n=>n.folderId&&subtree.has(n.folderId));for(const note of related){if(uid){for(const a of note.attachments||[])if(a.path&&!notes.some(other=>other.id!==note.id&&(other.attachments||[]).some(shared=>shared.path===a.path)))try{await deleteObject(storageRef(storage,a.path));}catch(err){console.warn("Attachment cleanup failed",err);}await deleteDoc(doc(db,"users",uid,"notes",note.id));}}const remainingFolders=folders.filter(x=>!subtree.has(x.id));await persistFolders(remainingFolders);const remainingNotes=notes.filter(n=>!related.some(r=>r.id===n.id));setNotes(remainingNotes);if(!uid)localStorage.setItem(LOCAL_KEY,JSON.stringify(remainingNotes));setMessage("تم حذف المجلد ومحتوياته نهائياً.");}catch(e){console.error(e);setError("تعذر إكمال الحذف النهائي؛ افحص البيانات والمزامنة قبل إعادة المحاولة.");}};
  const folderLabel=(folderId:string|null|undefined)=>{if(!folderId)return "المجلد الرئيسي";const parts:string[]=[];let id:string|null|undefined=folderId;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const f=folders.find(x=>x.id===id);if(!f)break;parts.unshift(f.name);id=f.parentId;}return parts.join(" / ")||"المجلد الرئيسي";};
  const moveFolder=(f:{id:string;name:string;parentId:string|null})=>{setMovePicker({kind:"folder",id:f.id,title:"نقل المجلد: "+f.name});setSelectedDestinationId(f.parentId||"");setMoveSearch("");setOpenItemMenu(null);};
  const isFolderDescendant=(candidateId:string,ancestorId:string)=>{let parent:string|null|undefined=candidateId;const seen=new Set<string>();while(parent&&!seen.has(parent)){if(parent===ancestorId)return true;seen.add(parent);parent=folders.find(x=>x.id===parent)?.parentId;}return false;};
  const commitMovePicker=async()=>{if(!movePicker)return;const action=movePicker;const targetId=selectedDestinationId||null;try{if(action.kind==="folder"){const folder=folders.find(x=>x.id===action.id);if(!folder)throw new Error("folder missing");if(targetId&&(targetId===folder.id||isFolderDescendant(targetId,folder.id)))throw new Error("invalid destination");if(folders.some(x=>x.id!==folder.id&&!x.isDeleted&&(x.parentId||null)===targetId&&x.name.toLocaleLowerCase("ar")===folder.name.toLocaleLowerCase("ar")))throw new Error("duplicate name");await persistFolders(folders.map(x=>x.id===folder.id?{...x,parentId:targetId,updatedAt:new Date().toISOString()}:x));setMessage("تم نقل المجلد إلى الوجهة المحددة.");}else if(action.kind==="note"||action.kind==="copyNote"){const note=notes.find(x=>x.id===action.id);if(!note)throw new Error("note missing");if(action.kind==="note"){if(await save({...note,folderId:targetId||"",updatedAt:new Date().toISOString()}))setMessage("تم نقل الملاحظة إلى المجلد المحدد.");else throw new Error("note save failed");}else{const now=new Date().toISOString();const copyNote:Note={...note,id:createNote().id,title:"نسخة من "+(note.title||"ملاحظة"),folderId:targetId||"",createdAt:now,updatedAt:now,favorite:false,pinned:false,isDeleted:false,deletedAt:undefined,attachments:[...(note.attachments||[])]};if(await save(copyNote))setMessage("تم نسخ الملاحظة إلى المجلد المحدد.");else throw new Error("note copy failed");}}else{const selectedFolderIds=selectedNoteIds.filter(id=>id.startsWith("folder:")).map(id=>id.slice(7));const rootSelectedFolderIds=selectedFolderIds.filter(id=>!selectedFolderIds.some(other=>other!==id&&isFolderDescendant(id,other)));const rootSet=new Set(rootSelectedFolderIds);const selectedNoteList=notes.filter(n=>selectedNoteIds.includes(n.id)&&!n.isDeleted&&!rootSelectedFolderIds.some(folderId=>Boolean(n.folderId&&isFolderDescendant(n.folderId,folderId))));for(const folderId of rootSelectedFolderIds){if(targetId&&(targetId===folderId||isFolderDescendant(targetId,folderId)))throw new Error("invalid destination");const folder=folders.find(x=>x.id===folderId);if(folder&&folders.some(x=>x.id!==folderId&&!rootSet.has(x.id)&&!x.isDeleted&&(x.parentId||null)===targetId&&x.name.toLocaleLowerCase("ar")===folder.name.toLocaleLowerCase("ar")))throw new Error("duplicate name");}for(let i=0;i<rootSelectedFolderIds.length;i++){const left=folders.find(x=>x.id===rootSelectedFolderIds[i]);if(left&&rootSelectedFolderIds.slice(i+1).some(id=>{const right=folders.find(x=>x.id===id);return Boolean(right&&left.name.toLocaleLowerCase("ar")===right.name.toLocaleLowerCase("ar"));}))throw new Error("duplicate name");}for(const n of selectedNoteList){if(!await save({...n,folderId:targetId||"",updatedAt:new Date().toISOString()}))throw new Error("note move failed");}if(rootSelectedFolderIds.length)await persistFolders(folders.map(x=>rootSelectedFolderIds.includes(x.id)?{...x,parentId:targetId,updatedAt:new Date().toISOString()}:x));setSelectedNoteIds([]);setSelectionMode(false);setMessage("تم نقل العناصر المحددة إلى المجلد المختار.");}setMovePicker(null);setMoveSearch("");}catch(e){console.error("Notes move failed:",e);setError(e instanceof Error&&e.message==="invalid destination"?"لا يمكن نقل المجلد إلى نفسه أو إلى أحد مجلداته الفرعية.":e instanceof Error&&e.message==="duplicate name"?"يوجد مجلد بالاسم نفسه في الوجهة المختارة.":"تعذر إكمال العملية؛ لم تُعرض رسالة نجاح لأن الحفظ لم يكتمل.");}};
  const moveNote=(note:Note)=>{setMovePicker({kind:"note",id:note.id,title:"نقل الملاحظة: "+(note.title||"بدون عنوان")});setSelectedDestinationId(note.folderId||"");setMoveSearch("");setOpenItemMenu(null);};
  const duplicateFolder=async(folder:{id:string;name:string;parentId:string|null})=>{
    const sourceTree:Array<{id:string;name:string;parentId:string|null;favorite?:boolean;color?:string;updatedAt?:string;createdAt?:string;description?:string;isDeleted?:boolean;deletedAt?:string}>=[];
    const queue=[folder.id];
    while(queue.length){const parent=queue.shift()!;const children=folders.filter(x=>x.parentId===parent&&!x.isDeleted);for(const child of children){sourceTree.push(child);queue.push(child.id);}}
    const allSource=[folder,...sourceTree];const idMap=new Map<string,string>();
    for(const item of allSource)idMap.set(item.id,"folder_copy_"+createNote().id);
    const now=new Date().toISOString();
    const copied=allSource.map((item,index)=>({...item,id:idMap.get(item.id)!,name:index===0?"نسخة من "+item.name:item.name,parentId:item.id===folder.id?folder.parentId:(item.parentId?idMap.get(item.parentId)||folder.parentId:folder.parentId),favorite:false,isDeleted:false,deletedAt:undefined,createdAt:now,updatedAt:now}));
    const copiedFolderIds=copied.map(f=>f.id);const copiedNoteIds:string[]=[];
    try{
      await persistFolders([...folders,...copied]);
      const sourceNotes=notes.filter(n=>!n.isDeleted&&allSource.some(f=>f.id===n.folderId));
      for(const note of sourceNotes){const copyNote:Note={...note,id:createNote().id,title:"نسخة من "+(note.title||"ملاحظة"),folderId:idMap.get(note.folderId||"")||copied[0].id,createdAt:now,updatedAt:now,favorite:false,pinned:false,isDeleted:false,deletedAt:undefined,attachments:[...(note.attachments||[])]};copiedNoteIds.push(copyNote.id);if(!await save(copyNote))throw new Error("note copy failed");}
      setMessage("تم نسخ المجلد ومجلداته الفرعية وملاحظاتها.");
    }catch(e){
      console.error("Folder copy failed:",e);let rollbackFailed=false;
      if(uid){
        const cleanupOps:Array<{kind:"note"|"folder";id:string}>=[...copiedNoteIds.map(id=>({kind:"note" as const,id})),...copiedFolderIds.map(id=>({kind:"folder" as const,id}))];
        try{for(let i=0;i<cleanupOps.length;i+=450){const batch=writeBatch(db);for(const op of cleanupOps.slice(i,i+450))batch.delete(doc(db,"users",uid,op.kind==="note"?"notes":"noteFolders",op.id));await batch.commit();}}catch(rollbackError){rollbackFailed=true;console.error("Folder copy rollback failed:",rollbackError);}
        setNotes(old=>old.filter(n=>!copiedNoteIds.includes(n.id)));setFolders(old=>old.filter(f=>!copiedFolderIds.includes(f.id)));
      }else{
        try{const storedNotes=JSON.parse(localStorage.getItem(LOCAL_KEY)||"[]") as Note[];const remainingNotes=storedNotes.filter(n=>!copiedNoteIds.includes(n.id));localStorage.setItem(LOCAL_KEY,JSON.stringify(remainingNotes));setNotes(remainingNotes);const storedFolders=JSON.parse(localStorage.getItem("alhamdulillah.notes.folders")||"[]") as Array<{id:string}>;const remainingFolders=storedFolders.filter(f=>!copiedFolderIds.includes(f.id));localStorage.setItem("alhamdulillah.notes.folders",JSON.stringify(remainingFolders));setFolders(remainingFolders as typeof folders);}catch(rollbackError){rollbackFailed=true;console.error("Local folder copy rollback failed:",rollbackError);}
      }
      setError(rollbackFailed?"تعذر إكمال النسخ ولم يكتمل إلغاء النسخة الجزئية؛ افحص المزامنة قبل إعادة المحاولة.":"تعذر إكمال نسخ المجلد؛ تم إلغاء النسخة الجزئية.");
    }
  };
  const folderDetails=(folder:{id:string;name:string;parentId:string|null})=>{setDetailsFolderTarget(folder);setOpenItemMenu(null);};
  

  const restoreSelectedItems=async()=>{
    const selectedFolderIds=folders.filter(f=>selectedNoteIds.includes("folder:"+f.id)&&f.isDeleted).map(f=>f.id);
    const rootIds=selectedFolderIds.filter(id=>!selectedFolderIds.some(other=>other!==id&&isFolderDescendant(id,other)));
    const restoreFolderIds=new Set<string>();
    for(const rootId of rootIds){restoreFolderIds.add(rootId);let changed=true;while(changed){changed=false;for(const child of folders)if(child.parentId&&restoreFolderIds.has(child.parentId)&&!restoreFolderIds.has(child.id)){restoreFolderIds.add(child.id);changed=true;}}}
    const selectedNotes=notes.filter(n=>selectedNoteIds.includes(n.id)&&(n.isDeleted||Boolean(n.folderId&&folders.some(f=>f.id===n.folderId&&f.isDeleted))));
    if(!selectedNotes.length&&!restoreFolderIds.size){setMessage("حدّد عنصراً واحداً على الأقل من المهملات.");return;}
    try{
      for(const note of selectedNotes){if(!note.isDeleted&&note.folderId&&restoreFolderIds.has(note.folderId))continue;const parent=folders.find(f=>f.id===(note.folderId||""));const folderId=parent?.isDeleted&&!restoreFolderIds.has(parent.id)?"":(note.folderId||"");if(!await save({...note,folderId,isDeleted:false,deletedAt:undefined,updatedAt:new Date().toISOString()}))throw new Error("note restore failed");}
      if(restoreFolderIds.size){const now=new Date().toISOString();const next=folders.map(f=>{if(!restoreFolderIds.has(f.id))return f;const orphanedParent=Boolean(f.parentId&&!restoreFolderIds.has(f.parentId)&&folders.some(p=>p.id===f.parentId&&p.isDeleted));return {...f,isDeleted:false,deletedAt:undefined,parentId:orphanedParent?null:f.parentId,updatedAt:now};});await persistFolders(next);}
      setFilter("all");setCurrentFolderId(null);setSelectedNoteIds([]);setSelectionMode(false);setOpenItemMenu(null);setMessage("تمت استعادة العناصر المحددة.");
    }catch(e){console.error("Bulk restore failed:",e);setError("تعذرت استعادة جميع العناصر المحددة؛ راجع حالة المزامنة قبل إعادة المحاولة.");}
  };
  const permanentlyDeleteSelectedItems=async()=>{
    const selectedFolderIds=folders.filter(f=>selectedNoteIds.includes("folder:"+f.id)&&f.isDeleted).map(f=>f.id);
    const rootIds=selectedFolderIds.filter(id=>!selectedFolderIds.some(other=>other!==id&&isFolderDescendant(id,other)));
    const removeFolderIds=new Set<string>();
    for(const rootId of rootIds){removeFolderIds.add(rootId);let changed=true;while(changed){changed=false;for(const child of folders)if(child.parentId&&removeFolderIds.has(child.parentId)&&!removeFolderIds.has(child.id)){removeFolderIds.add(child.id);changed=true;}}}
    const inTrash=(n:Note)=>n.isDeleted||Boolean(n.folderId&&folders.some(f=>f.id===n.folderId&&f.isDeleted));
    const notesToDelete=notes.filter(n=>(selectedNoteIds.includes(n.id)&&inTrash(n))||Boolean(n.folderId&&removeFolderIds.has(n.folderId)));
    const removeNoteIds=new Set<string>(notesToDelete.map(n=>n.id));
    if(!removeNoteIds.size&&!removeFolderIds.size){setMessage("حدّد عنصراً واحداً على الأقل من المهملات.");return;}
    if(!window.confirm("حذف "+(removeNoteIds.size+removeFolderIds.size)+" عنصراً من المهملات نهائياً؟ لا يمكن التراجع عن هذا الإجراء."))return;
    try{
      if(uid){
        const ops:Array<{kind:"note"|"folder";id:string}>=[...Array.from(removeNoteIds,id=>({kind:"note" as const,id})),...Array.from(removeFolderIds,id=>({kind:"folder" as const,id}))];
        for(let i=0;i<ops.length;i+=450){const batch=writeBatch(db);for(const op of ops.slice(i,i+450))batch.delete(doc(db,"users",uid,op.kind==="note"?"notes":"noteFolders",op.id));await batch.commit();}
      }else{
        localStorage.setItem(LOCAL_KEY,JSON.stringify(notes.filter(n=>!removeNoteIds.has(n.id))));
      }
      setNotes(old=>old.filter(n=>!removeNoteIds.has(n.id)));
      if(removeFolderIds.size){const remaining=folders.filter(f=>!removeFolderIds.has(f.id));if(uid)setFolders(remaining);else await persistFolders(remaining);}
      if(draft&&(removeNoteIds.has(draft.id)||(draft.folderId&&removeFolderIds.has(draft.folderId)))){setDraft(null);setEditMode(false);}
      if(uid){
        const attachmentPaths:string[]=Array.from(new Set<string>(notesToDelete.flatMap(n=>(n.attachments||[]).map(a=>a.path).filter((path):path is string=>typeof path==="string"&&path.length>0))));
        for(const path of attachmentPaths){if(notes.some(other=>!removeNoteIds.has(other.id)&&(other.attachments||[]).some(a=>a.path===path)))continue;try{await deleteObject(storageRef(storage,path));}catch(e){console.warn("Attachment cleanup after permanent trash deletion failed:",e);}}
      }
      setFilter("trash");setCurrentFolderId(null);setSelectedNoteIds([]);setSelectionMode(false);setOpenItemMenu(null);setMessage("تم حذف العناصر المحددة نهائياً.");
    }catch(e){console.error("Bulk permanent deletion failed:",e);setError("تعذر إكمال الحذف النهائي لكل العناصر؛ افحص مزامنة البيانات ثم أعد المحاولة.");}
  };
  const menuEntry=(label:string,_description:string,Icon:React.ElementType,onClick:()=>void,danger=false)=> <button key={label} type="button" onClick={e=>{e.stopPropagation();onClick();}} className={"flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-right transition-colors "+(danger?"text-rose-700 hover:bg-rose-50":"text-slate-800 hover:bg-slate-50")}><span className="min-w-0 flex-1 text-xs font-bold leading-5">{label}</span><Icon className={"h-4 w-4 shrink-0 "+(danger?"text-rose-600":"text-slate-500")}/></button>;
  const beginRenameNote=(note:Note)=>{setRenameNoteTarget(note);setRenameNoteValue(note.title||"");setOpenItemMenu(null);};
  const commitRenameNote=async()=>{if(!renameNoteTarget)return;const title=renameNoteValue.trim();if(!title){setError("اكتب عنوان الملاحظة.");return;}if(await save({...renameNoteTarget,title,updatedAt:new Date().toISOString()})){setRenameNoteTarget(null);setMessage("تم تغيير عنوان الملاحظة.");}else setError("تعذر حفظ العنوان الجديد.");};
  const folderCountForHeader=folders.filter(f=>filter==="trash"?f.isDeleted&&(currentFolderId?f.parentId===currentFolderId:!folders.some(p=>p.id===f.parentId&&p.isDeleted)):filter==="favorites"?!f.isDeleted&&f.favorite:!f.isDeleted&&(f.parentId||null)===currentFolderId).length;
  const noteCountForHeader=notes.filter(n=>filter==="trash"?(n.isDeleted||Boolean(n.folderId&&folders.some(f=>f.id===n.folderId&&f.isDeleted)))&&(!currentFolderId||(n.folderId||null)===currentFolderId):filter==="favorites"?!n.isDeleted&&n.favorite&&!currentFolderId:!n.isDeleted&&(n.folderId||null)===currentFolderId).length;
  const showMainEmptyState=!draft&&!loading&&filter==="all"&&childFolders.length===0&&visible.length===0&&!search.trim();
  return <section ref={notesSectionRef} dir="rtl" onClick={()=>{setMenuOpen(false);setOpenItemMenu(null);}} className="min-w-0 space-y-4">
    <style>{printCss}</style>
    <header className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><button type="button" title="رجوع" aria-label="رجوع" onClick={()=>{if(currentFolderId){const current=folders.find(f=>f.id===currentFolderId);openFolder(current?.parentId||null,filter==="trash");}else if(filter==="trash"){setFilter("all");setCurrentFolderId(null);setDraft(null);setEditMode(false);setSelectedNoteIds([]);setSelectionMode(false);setSearch("");setError("");setMessage("");}else if(filter==="favorites"){setFilter("all");setCurrentFolderId(null);setSearch("");}else if(draft&&askDiscard()){setDraft(null);setEditMode(false);}}} className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronRight className="h-5 w-5"/></button><div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><BookOpen className="h-5 w-5"/></div><div className="min-w-0"><h1 className="text-lg font-black text-slate-900">{currentFolderId ? (folders.find(f=>f.id===currentFolderId)?.name || "الملاحظات") : (filter==="trash"?"سلة المهملات":"الملاحظات")}</h1><p className="mt-0.5 text-[11px] text-slate-500">{folderCountForHeader} مجلد • {noteCountForHeader} ملاحظة • {currentFolderId ? "المستوى "+(folderPath.length+1) : "المستوى الأول"}</p></div></div>
      <div className="flex max-w-full flex-wrap items-center gap-1"><button onClick={()=>{setFilter("trash");setSearch("");setCurrentFolderId(null);}} title="المحذوفات" aria-label="المحذوفات" className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100"><Trash2 className="h-5 w-5"/><span className="absolute -left-0.5 -top-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-[9px] font-black text-white">{notes.filter(n=>n.isDeleted||Boolean(n.folderId&&folders.some(f=>f.id===n.folderId&&f.isDeleted))).length+folders.filter(f=>f.isDeleted).length}</span></button><button onClick={()=>{setShowSearch(v=>!v);}} title="بحث سريع" aria-label="بحث سريع" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"><Search className="h-5 w-5"/></button><button onClick={()=>{const next=viewMode==="grid"?"list":"grid";setViewMode(next);localStorage.setItem("alhamdulillah.notes.view",next);}} title="تغيير العرض" aria-label="تغيير العرض" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100">{viewMode==="grid"?<Rows3 className="h-5 w-5"/>:<LayoutGrid className="h-5 w-5"/>}</button>
      <div className="relative"><button onClick={e=>{e.stopPropagation();setMenuOpen(v=>!v);}} title="خيارات متقدمة" aria-label="خيارات متقدمة" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"><MoreVertical className="h-5 w-5"/></button>{menuOpen&&<div onClick={e=>e.stopPropagation()} className="absolute left-0 top-full z-40 mt-1 max-h-[75vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
      <div className="px-3 pb-1 pt-2 text-[10px] font-black tracking-wide text-slate-400">العرض والتنظيم</div>
      {menuEntry(selectionMode?"إلغاء التحديد":"تحديد العناصر","اختيار مجلدات وملاحظات متعددة",CheckSquare,()=>{setSelectionMode(v=>!v);setSelectedNoteIds([]);setMenuOpen(false);})}
      {menuEntry("طريقة العرض: "+(viewMode==="grid"?"شبكة":"قائمة"),"التبديل بين البطاقات والصفوف",viewMode==="grid"?Rows3:LayoutGrid,()=>{const next=viewMode==="grid"?"list":"grid";setViewMode(next);localStorage.setItem("alhamdulillah.notes.view",next);setMenuOpen(false);})}
      {menuEntry("تحديث المحتويات","إعادة جلب البيانات من مصدرها",RefreshCw,()=>{setLoading(true);setRefreshToken(v=>v+1);setMenuOpen(false);setMessage("جارٍ تحديث بيانات الملاحظات ومزامنتها.");})}
      {menuEntry("فرز","اختيار طريقة ترتيب العناصر",ArrowUpDown,()=>{setMenuOpen(false);setShowSortDialog(true);})}
      {menuEntry("الفرز حسب تاريخ الإنشاء",sortBy==="createdAt"?"محدد حالياً":"الأقدم أو الأحدث",Clock3,()=>{setSortBy("createdAt");setMenuOpen(false);})}
      {menuEntry("الفرز حسب آخر تعديل",sortBy==="updatedAt"?"محدد حالياً":"الأكثر تحديثاً",RefreshCw,()=>{setSortBy("updatedAt");setMenuOpen(false);})}
      {menuEntry(sortAsc?"الترتيب التصاعدي":"الترتيب التنازلي","اضغط للتبديل بين الاتجاهين",ArrowUpDown,()=>{setSortAsc(v=>!v);setMenuOpen(false);})}
      <div className="my-2 border-t border-slate-100"/>
      <div className="px-3 pb-1 pt-1 text-[10px] font-black tracking-wide text-slate-400">إنشاء وتنظيم</div>
      {filter!=="trash"&&menuEntry("إضافة مجلد","داخل المجلد الحالي",FolderPlus,()=>{setShowFolderCreate(true);setMenuOpen(false);})}
      {filter!=="trash"&&menuEntry("إضافة ملاحظة","لهذا المجلد",StickyNote,()=>{setMenuOpen(false);newNote();})}
      {menuEntry("مشاركة المجلد الحالي","نسخ مسار المجلد أو مشاركته",Share2,async()=>{const folder=currentFolderId?folders.find(f=>f.id===currentFolderId):null;const shareText=folder?"مجلد: "+folder.name+"\nالمسار: "+folderLabel(folder.id):"سجل الملاحظات - المجلد الرئيسي";try{if(navigator.share)await navigator.share({title:folder?.name||"سجل الملاحظات",text:shareText});else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(shareText);setMessage("تم نسخ مسار المجلد.");}else setError("المشاركة غير مدعومة.");}catch(e){if(!(e instanceof Error&&e.name==="AbortError"))setError("تعذرت المشاركة.");}setMenuOpen(false);})}
      {currentFolderId&&filter!=="trash"&&menuEntry(folders.find(f=>f.id===currentFolderId)?.favorite?"إزالة المجلد من المفضلة":"إضافة المجلد إلى المفضلة","وصول سريع للمجلد المفتوح",Star,()=>{const id=currentFolderId;void persistFolders(folders.map(f=>f.id===id?{...f,favorite:!f.favorite,updatedAt:new Date().toISOString()}:f));setMenuOpen(false);})}
      {currentFolderId&&filter!=="trash"&&menuEntry("حذف هذا المجلد","نقله مع محتوياته إلى المهملات",Trash2,()=>{const folder=folders.find(f=>f.id===currentFolderId);if(folder)void deleteFolder(folder);setMenuOpen(false);},true)}
      <div className="my-2 border-t border-slate-100"/>
      <div className="px-3 pb-1 pt-1 text-[10px] font-black tracking-wide text-slate-400">المفضلة والمهملات</div>
      {menuEntry("عرض المفضلة","الوصول السريع للعناصر المهمة",Star,()=>{setMenuOpen(false);setFilter("favorites");setCurrentFolderId(null);setSearch("");})}
      {menuEntry("سلة المهملات","استعادة العناصر أو حذفها نهائياً",Trash2,()=>{setMenuOpen(false);setFilter("trash");setCurrentFolderId(null);setSearch("");})}
    </div>}</div>
      <button onClick={newNote} disabled={filter==="trash"} className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4"/>ملاحظة</button></div></div>{showSearch&&<div className="mt-3"><input ref={searchInputRef} autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في الملاحظات..." className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-400"/></div>}</header>
    {showSortDialog&&<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={()=>setShowSortDialog(false)}><div role="dialog" aria-modal="true" aria-label="فرز العناصر" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-black text-slate-900">فرز العناصر</h2><button type="button" onClick={()=>setShowSortDialog(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4"/></button></div><div className="space-y-2">{([{value:"title",label:"حسب الاسم",Icon:ArrowUpDown},{value:"createdAt",label:"حسب تاريخ الإنشاء",Icon:Clock3},{value:"updatedAt",label:"حسب آخر تعديل",Icon:RefreshCw}] as const).map(option=><button key={option.value} type="button" onClick={()=>{setSortBy(option.value);setShowSortDialog(false);}} className={"flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-right text-sm font-bold "+(sortBy===option.value?"border-blue-300 bg-blue-50 text-blue-800":"border-slate-200 text-slate-700 hover:bg-slate-50")}><span>{option.label}</span><span className="flex items-center gap-2"><option.Icon className="h-4 w-4"/>{sortBy===option.value&&<CheckSquare className="h-4 w-4"/>}</span></button>)}</div><div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={()=>setSortAsc(v=>!v)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">{sortAsc?"تصاعدي ↑":"تنازلي ↓"}</button><button type="button" onClick={()=>setShowSortDialog(false)} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">تم</button></div></div></div>}
    {!uid && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">وضع محلي: النصوص تُحفظ على هذا الجهاز فقط. سجّل الدخول لتفعيل المزامنة السحابية وإرفاق الملفات.</div>}
    {error && <div role="alert" className="flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-6 text-rose-800"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
    {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-6 text-emerald-800">{message}</div>}
    {selectionMode && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3"><span className="me-auto text-xs font-bold text-blue-900">{selectedNoteIds.length} عنصر محدد</span>{filter==="trash"?<><button onClick={()=>void restoreSelectedItems()} disabled={!selectedNoteIds.length} className="min-h-9 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-bold text-emerald-700 disabled:opacity-40">استعادة المحدد</button><button onClick={()=>void permanentlyDeleteSelectedItems()} disabled={!selectedNoteIds.length} className="min-h-9 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 disabled:opacity-40">حذف نهائي المحدد</button></>:<><button onClick={()=>{setMovePicker({kind:"bulk",title:"نقل العناصر المحددة"});setSelectedDestinationId("");setMoveSearch("");}} disabled={!selectedNoteIds.length} className="min-h-9 rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-800 disabled:opacity-40">نقل المحدد</button><button onClick={async()=>{try{const selectedNotes=notes.filter(n=>selectedNoteIds.includes(n.id)&&!n.isDeleted);const selectedFolders=folders.filter(f=>selectedNoteIds.includes("folder:"+f.id)&&!f.isDeleted);for(const n of selectedNotes){if(!await save({...n,favorite:true}))throw new Error("note favorite failed");}if(selectedFolders.length)await persistFolders(folders.map(f=>selectedNoteIds.includes("folder:"+f.id)?{...f,favorite:true,updatedAt:new Date().toISOString()}:f));setMessage("تمت إضافة العناصر المحددة إلى المفضلة.");setSelectedNoteIds([]);}catch(e){console.error(e);setError("تعذرت إضافة جميع العناصر المحددة إلى المفضلة.");}}} className="min-h-9 rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-800">مفضلة المحدد</button><button onClick={async()=>{const selectedNotes=notes.filter(n=>selectedNoteIds.includes(n.id)&&!n.isDeleted);const selectedFolderIds=folders.filter(f=>selectedNoteIds.includes("folder:"+f.id)&&!f.isDeleted).map(f=>f.id);if(!selectedNotes.length&&!selectedFolderIds.length){setMessage("حدّد ملاحظة أو مجلداً أولاً.");return;}if(!window.confirm("نقل العناصر المحددة إلى المهملات؟ ستبقى قابلة للاستعادة."))return;try{for(const n of selectedNotes)if(!await save({...n,isDeleted:true,deletedAt:new Date().toISOString()}))throw new Error("note trash failed");const roots=selectedFolderIds.filter(id=>!selectedFolderIds.some(other=>other!==id&&isFolderDescendant(id,other)));const subtree=new Set<string>(roots);if(roots.length){let changed=true;while(changed){changed=false;for(const child of folders)if(child.parentId&&subtree.has(child.parentId)&&!subtree.has(child.id)){subtree.add(child.id);changed=true;}}const now=new Date().toISOString();await persistFolders(folders.map(f=>subtree.has(f.id)?{...f,isDeleted:true,deletedAt:now,updatedAt:now}:f));}if(currentFolderId&&subtree.has(currentFolderId)){const current=folders.find(f=>f.id===currentFolderId);setCurrentFolderId(current?.parentId&&!subtree.has(current.parentId)?current.parentId:null);}setSelectedNoteIds([]);setSelectionMode(false);setMessage("تم نقل العناصر المحددة إلى المهملات. افتح زر سلة المهملات لعرضها.");}catch(e){console.error(e);setError("تعذر إكمال نقل كل العناصر إلى المهملات؛ راجع المزامنة قبل إعادة المحاولة.");}}} className="min-h-9 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">حذف المحدد</button></>}<button onClick={()=>{setSelectionMode(false);setSelectedNoteIds([]);}} className="min-h-9 rounded-lg px-3 text-xs font-bold text-slate-600">إلغاء</button></div>}

    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-1.5 text-xs"><button onClick={()=>openFolder(null,filter==="trash")} className="font-black text-blue-700">{filter==="trash"?"سلة المهملات":"سجل الملاحظات"}</button>{folderPath.map(f=><React.Fragment key={f.id}><ChevronRight className="h-3 w-3 text-slate-400"/><button onClick={()=>openFolder(f.id,filter==="trash")} className="font-bold text-blue-700">{f.name}</button></React.Fragment>)}</div><div className="flex w-full flex-wrap items-center justify-between gap-2"><button onClick={()=>setShowFolderCreate(v=>!v)} className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-amber-100 px-3 text-xs font-bold text-amber-900"><FolderPlus className="h-4 w-4"/>مجلد فرعي +</button></div></div>
      {showFolderCreate&&filter!=="trash"&&<div className="mt-3 flex gap-2"><input value={folderName} onChange={e=>setFolderName(e.target.value)} placeholder="اسم المجلد الجديد" className="min-h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"/><button onClick={()=>void makeFolder()} className="rounded-lg bg-blue-600 px-3 text-xs font-bold text-white">إنشاء</button></div>}
    {showMainEmptyState ? <div className="flex min-h-[330px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center shadow-sm sm:min-h-[390px]"><div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-orange-50 text-orange-500 ring-1 ring-orange-100"><Folder className="h-11 w-11"/></div><h2 className="mt-5 text-base font-black text-slate-900">هذا المجلد فارغ حالياً</h2><p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-slate-500">ابدأ بتنظيم ملفاتك بإنشاء مجلد فرعي أو إضافة ملاحظة جديدة داخل هذا المجلد.</p><div className="mt-5 flex w-full max-w-lg flex-col gap-3 sm:flex-row"><button onClick={()=>setShowFolderCreate(true)} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-black text-white shadow-sm hover:bg-orange-600"><FolderPlus className="h-5 w-5"/>إنشاء مجلد هنا</button><button onClick={newNote} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-4 text-sm font-black text-blue-700 hover:bg-blue-50"><StickyNote className="h-5 w-5"/>إضافة ملاحظة هنا</button></div></div> : <div className="flex min-w-0 flex-col gap-4">
      <div className={(draft ? "hidden lg:block" : "block") + " min-w-0 space-y-3"}>
        <div className="flex items-center justify-between gap-2 px-1"><h2 className="text-sm font-black text-slate-800">ملاحظات هذا المجلد</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{visible.length} ملاحظة</span></div>
        {loading ? <div className="py-5 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />جارٍ تحميل الملاحظات...</div> : visible.length === 0 ? <></> :
          <div className={viewMode==="list"?"flex flex-col gap-2":viewMode==="compact"?"grid grid-cols-1 gap-1":"grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"}>{visible.map((n) => <article key={n.id} onClick={() => selectionMode ? setSelectedNoteIds(ids=>ids.includes(n.id)?ids.filter(id=>id!==n.id):[...ids,n.id]) : openNote(n)} className={"group relative min-w-0 cursor-pointer rounded-2xl border text-right transition-all "+(viewMode==="compact"?"px-2 py-1":"p-3 shadow-sm hover:border-blue-300 hover:shadow-md ")+(draft?.id===n.id?"border-blue-400 bg-blue-50/60 ring-2 ring-blue-100":"border-slate-200/90")} style={{backgroundColor:n.color||"#fff"}}>
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-1">{n.pinned && <Pin className="h-3.5 w-3.5 text-blue-600" />}{n.favorite && <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />}{n.priority !== "normal" && <span className={"rounded-full px-2 py-0.5 text-[9px] font-bold " + (n.priority === "urgent" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800")}>{PRIORITY[n.priority]}</span>}{n.completed && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] text-emerald-700">مكتملة</span>}</div><span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: n.color }} /></div>
            <div className="mt-2 flex items-center gap-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-700">{(n.title||"م").trim().charAt(0)}</div><h3 className="min-w-0 break-words text-sm font-black leading-6 text-slate-900">{n.title || "بدون عنوان"}</h3>{selectionMode&&<input type="checkbox" checked={selectedNoteIds.includes(n.id)} onClick={e=>e.stopPropagation()} onChange={()=>setSelectedNoteIds(ids=>ids.includes(n.id)?ids.filter(id=>id!==n.id):[...ids,n.id])} aria-label={"تحديد "+(n.title||"ملاحظة")} className="ms-auto h-4 w-4"/>}</div><p className="mt-1 break-words text-[10px] text-slate-500">{n.relatedLabel || n.category || "بدون تفاصيل إضافية"}</p><p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{plain(n.content).slice(0, 200) || "لا يوجد محتوى بعد..."}</p>
            {n.attachments?.length > 0 && <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><FileText className="h-3 w-3" />{n.attachments.length} مرفق</div>}
            {n.category && <span className="mt-2 inline-flex max-w-full truncate rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">{n.category}</span>}
            
            <div className="mt-3 flex items-center justify-between gap-1 border-t border-black/5 pt-2"><span className="truncate text-[10px] text-slate-500">{dateText(n.updatedAt)}</span><div className="flex shrink-0 items-center">
              {filter === "trash" ? <><button title="استعادة" onClick={(e) => { e.stopPropagation(); restore(n); }} className="rounded-lg p-2 text-emerald-700"><RotateCcw className="h-4 w-4" /></button><button title="حذف نهائي" onClick={(e) => { e.stopPropagation(); void permanentDelete(n); }} className="rounded-lg p-2 text-rose-700"><Trash2 className="h-4 w-4" /></button></> :
                <><button title="تثبيت" onClick={(e) => { e.stopPropagation(); toggleFlag(n, { pinned: !n.pinned }); }} className="rounded-lg p-2 text-slate-500"><Pin className={"h-4 w-4 " + (n.pinned ? "fill-blue-100 text-blue-700" : "")} /></button><button title="المفضلة" onClick={(e) => { e.stopPropagation(); toggleFlag(n, { favorite: !n.favorite }); }} className="rounded-lg p-2 text-slate-500"><Heart className={"h-4 w-4 " + (n.favorite ? "fill-rose-500 text-rose-500" : "")} /></button><button title="نقل للمحذوفات" onClick={(e) => { e.stopPropagation(); moveToTrash(n); }} className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button><div className="relative"><button type="button" aria-label={"خيارات الملاحظة "+(n.title||"ملاحظة")} onClick={e=>{e.stopPropagation();setOpenItemMenu(v=>v==="note:"+n.id?null:"note:"+n.id);}} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><MoreVertical className="h-4 w-4"/></button>{openItemMenu==="note:"+n.id&&<div className="fixed left-1/2 top-1/2 z-[100] w-[min(88vw,20rem)] max-h-[75vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 text-right shadow-2xl" onClick={e=>e.stopPropagation()}>{filter==="trash"?<>{menuEntry("استعادة الملاحظة","إرجاعها إلى مجلدها الأصلي",RotateCcw,()=>{restore(n);setOpenItemMenu(null);})}{menuEntry("حذف نهائياً","حذف الملاحظة والمرفقات غير المشتركة",Trash2,()=>{void permanentDelete(n);setOpenItemMenu(null);},true)}</>:<>{menuEntry("عرض الملاحظة","قراءة المحتوى كاملاً",BookOpen,()=>{openNote(n);setOpenItemMenu(null);})}{menuEntry("تعديل الملاحظة","فتح محرر المحتوى",Bold,()=>{setDraft(n);setEditMode(true);setOpenItemMenu(null);})}{menuEntry("إعادة تسمية","تغيير عنوان الملاحظة فقط",FileText,()=>beginRenameNote(n))}{menuEntry("نسخ الملاحظة","إنشاء نسخة مستقلة",Copy,()=>{void duplicate(n);setOpenItemMenu(null);})}{menuEntry("نقل إلى مجلد","تغيير موقع الملاحظة",Folder,()=>moveNote(n))}{menuEntry("نسخ إلى مجلد","الإبقاء على الأصل وإنشاء نسخة بالوجهة",Copy,()=>{setMovePicker({kind:"copyNote",id:n.id,title:"نسخ الملاحظة إلى مجلد"});setSelectedDestinationId(n.folderId||"");setMoveSearch("");setOpenItemMenu(null);})}{menuEntry(n.favorite?"إزالة من المفضلة":"إضافة إلى المفضلة","وصول أسرع للملاحظات المهمة",Star,()=>{toggleFlag(n,{favorite:!n.favorite});setOpenItemMenu(null);})}{menuEntry("تحديد","إضافة إلى الاختيار الجماعي",CheckSquare,()=>{setSelectionMode(true);setSelectedNoteIds(ids=>ids.includes(n.id)?ids:[...ids,n.id]);setOpenItemMenu(null);})}{menuEntry("مشاركة الملاحظة","مشاركة النص باستخدام خيارات الجهاز",Share2,()=>{void share(n);setOpenItemMenu(null);})}{menuEntry("طباعة / PDF","فتح خيارات الطباعة المتاحة",Printer,()=>{print(n);setOpenItemMenu(null);})}<div className="my-1 border-t border-slate-100"/>{menuEntry("نقل إلى المهملات","يمكن استعادتها لاحقاً",Trash2,()=>{moveToTrash(n);setOpenItemMenu(null);},true)}</>}</div>}</div></>}
            </div></div>
          </article>)}</div>}
      </div>

      <div className={(draft ? "block" : "hidden lg:block") + " min-w-0"}>
        {!draft ? <div className="hidden min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center lg:flex"><div><StickyNote className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">اختر ملاحظة أو أنشئ واحدة جديدة.</p></div></div> :
          <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3">
              <div className="flex items-center gap-2"><button onClick={() => { if (askDiscard()) setDraft(null); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-xs font-bold lg:hidden"><ChevronRight className="h-4 w-4" /> القائمة</button><span className={"text-[11px] font-bold " + (saveState === "saved" ? "text-emerald-700" : saveState === "error" ? "text-rose-700" : "text-amber-700")}>{saveState === "saved" ? "محفوظ" : saveState === "saving" ? "جارٍ الحفظ" : saveState === "pending" ? "بانتظار المزامنة" : saveState === "error" ? "تعذر الحفظ" : "تغييرات غير محفوظة"}</span></div>
              <div className="flex flex-wrap items-center gap-1">{editMode ? <><button onClick={async()=>{const isNewNote=!savedDraft;if(await save(draft)){setEditMode(false);}}} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-black text-white"><Check className="h-4 w-4"/> حفظ</button><button onClick={()=>{if(askDiscard()){setDraft(savedDraft||null);setEditMode(false);}}} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-xs font-bold">إلغاء</button></> : <button onClick={()=>setEditMode(true)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-black text-white"><Check className="h-4 w-4"/> تعديل</button>}{isDirty && savedDraft && <button onClick={() => { setDraft(savedDraft); setError(""); setMessage("تم التراجع إلى آخر نسخة محفوظة."); }} title="التراجع إلى آخر نسخة محفوظة" className="rounded-lg p-2 text-amber-700"><RotateCcw className="h-4 w-4" /></button>}<button onClick={() => void copy(draft)} title="نسخ النص" className="rounded-lg p-2 text-slate-500"><Copy className="h-4 w-4" /></button><button onClick={() => void share(draft)} title="مشاركة" className="rounded-lg p-2 text-slate-500"><Share2 className="h-4 w-4" /></button><button onClick={() => print(draft)} title="طباعة أو حفظ PDF" className="rounded-lg p-2 text-slate-500"><Printer className="h-4 w-4" /></button><button onClick={() => duplicate(draft)} title="نسخ الملاحظة" className="rounded-lg p-2 text-slate-500"><Copy className="h-4 w-4" /></button>{draft.isDeleted ? <button onClick={() => void permanentDelete(draft)} title="حذف نهائي" className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button> : <button onClick={() => moveToTrash(draft)} title="نقل للمحذوفات" className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div>
            </div>
            {draft.isDeleted && <div className="flex items-center justify-between bg-amber-50 px-3 py-2 text-xs text-amber-800">هذه الملاحظة في المحذوفات.<button onClick={() => restore(draft)} className="rounded-lg bg-white px-3 py-2 font-bold">استعادة</button></div>}
            <div className="space-y-4 p-3 sm:p-4">
              {editMode ? <input value={draft.title} onChange={e=>patch({title:e.target.value})} placeholder="عنوان الملاحظة..." aria-label="عنوان الملاحظة" className="min-h-12 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-base font-black outline-none focus:border-blue-400"/> : <h2 className="break-words text-xl font-black leading-8">{draft.title||"بدون عنوان"}</h2>}
              {editMode && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2"><span className="text-[11px] font-bold text-slate-500">لون الخلفية</span>{COLORS.map(([name, value]) => <button key={value} title={name} aria-label={name} onClick={() => patch({ color: value })} className={"h-7 w-7 rounded-full border " + (draft.color === value ? "ring-2 ring-blue-500 ring-offset-2" : "border-black/10")} style={{ backgroundColor: value }} />)}<input type="color" aria-label="لون مخصص" value={draft.color} onChange={(e) => patch({ color: e.target.value })} className="h-8 w-9 rounded border bg-white p-0.5" /><span className="text-[11px] font-bold text-slate-500">لون النص</span><input type="color" aria-label="لون النص" value={draft.textColor} onChange={(e) => patch({ textColor: e.target.value })} className="h-8 w-9 rounded border bg-white p-0.5" /><select value={draft.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} aria-label="حجم الخط" className="min-h-8 rounded border bg-white px-2 text-xs"><option value={14}>14 px</option><option value={16}>16 px</option><option value={18}>18 px</option><option value={20}>20 px</option><option value={22}>22 px</option></select></div>}
              {editMode && <><div className="sticky top-0 z-10 flex flex-nowrap items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-2" role="toolbar" aria-label="تنسيق الملاحظة">
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>richCommand("bold")} title="غامق" className="shrink-0 rounded-lg p-2 hover:bg-white"><Bold className="h-4 w-4"/></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>richCommand("italic")} title="مائل" className="shrink-0 rounded-lg p-2 hover:bg-white"><Italic className="h-4 w-4"/></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>richCommand("underline")} title="تسطير" className="shrink-0 rounded-lg p-2 hover:bg-white"><Underline className="h-4 w-4"/></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>richCommand("strikeThrough")} title="يتوسطه خط" className="shrink-0 rounded-lg p-2 hover:bg-white"><Strikethrough className="h-4 w-4"/></button>
                <select aria-label="نوع الخط" value={fontFamily} onChange={e=>{setFontFamily(e.target.value);richCommand("fontName",e.target.value);}} className="min-h-9 shrink-0 rounded-lg border bg-white px-2 text-xs"><option value="Arial">Arial</option><option value="Tahoma">Tahoma</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="monospace">Monospace</option></select>
                <select aria-label="حجم النص المحدد" defaultValue="3" onChange={e=>richCommand("fontSize",e.target.value)} className="min-h-9 shrink-0 rounded-lg border bg-white px-2 text-xs"><option value="2">صغير</option><option value="3">عادي</option><option value="4">كبير</option><option value="5">كبير جداً</option><option value="6">عنوان</option></select>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>richCommand("insertUnorderedList")} title="قائمة نقطية" className="shrink-0 rounded-lg p-2 hover:bg-white"><List className="h-4 w-4"/></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>richCommand("insertOrderedList")} title="قائمة مرقمة" className="shrink-0 rounded-lg p-2 hover:bg-white"><ListOrdered className="h-4 w-4"/></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>richCommand("justifyRight")} title="محاذاة لليمين" className="shrink-0 rounded-lg p-2 hover:bg-white"><AlignRight className="h-4 w-4"/></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>richCommand("justifyCenter")} title="توسيط" className="shrink-0 rounded-lg p-2 hover:bg-white"><AlignCenter className="h-4 w-4"/></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>richCommand("justifyFull")} title="ضبط النص" className="shrink-0 rounded-lg p-2 hover:bg-white"><AlignJustify className="h-4 w-4"/></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{editorRef.current?.focus();document.execCommand("undo");syncRichEditor();}} title="تراجع" className="shrink-0 rounded-lg p-2 hover:bg-white"><Undo2 className="h-4 w-4"/></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{editorRef.current?.focus();document.execCommand("redo");syncRichEditor();}} title="إعادة" className="shrink-0 rounded-lg p-2 hover:bg-white"><Redo2 className="h-4 w-4"/></button>
                <label title="لون الخط" className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold">A<input type="color" aria-label="لون الخط المحدد" defaultValue="#1e293b" onChange={e=>richCommand("foreColor",e.target.value)} className="h-6 w-6 border-0 bg-transparent p-0"/></label>
                <label title="تمييز النص" className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold">تمييز<input type="color" aria-label="لون تمييز النص" defaultValue="#fef08a" onChange={e=>richCommand("hiliteColor",e.target.value)} className="h-6 w-6 border-0 bg-transparent p-0"/></label>
                <button type="button" onMouseDown={e=>{e.preventDefault();rememberEditorSelection();}} onClick={()=>fileRef.current?.click()} title="إدراج صورة داخل النص" className="shrink-0 rounded-lg p-2 hover:bg-white"><ImagePlus className="h-4 w-4"/></button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addFiles}/>
              </div><p className="text-[10px] text-slate-400">حدد النص أولاً لتطبيق التنسيق. اسحب الشريط أفقياً لرؤية بقية الأدوات.</p></>}{!editMode ? <div className="min-h-56 whitespace-pre-wrap break-words rounded-xl border border-slate-100 p-4 leading-8" style={{backgroundColor:draft.color,color:draft.textColor,fontSize:draft.fontSize,textAlign:draft.textAlign||"right"}} dangerouslySetInnerHTML={{__html:preview(draft.content)||"لا يوجد محتوى."}} /> : <div ref={editorRef} contentEditable suppressContentEditableWarning onKeyDown={handleEditorKeyDown} onInput={syncRichEditor} onMouseUp={rememberEditorSelection} onKeyUp={rememberEditorSelection} role="textbox" aria-multiline="true" aria-label="محتوى الملاحظة" className="block min-h-56 w-full min-w-0 overflow-x-hidden break-words rounded-xl border border-slate-200 p-3 leading-8 outline-none focus:border-blue-400 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_ul]:list-disc [&_ul]:pe-6 [&_ol]:list-decimal [&_ol]:pe-6" style={{backgroundColor:draft.color,color:draft.textColor,fontSize:draft.fontSize,lineHeight:1.9,textAlign:draft.textAlign||"right"}} />}
                            {draft.attachments.length > 0 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{draft.attachments.map((a) => <div key={a.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 p-2">{a.contentType.startsWith("image/") ? <button onClick={() => window.open(a.url, "_blank", "noopener,noreferrer")} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100"><img src={a.url} alt={a.name} className="h-full w-full object-cover" loading="lazy" /></button> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><FileText className="h-6 w-6" /></div>}<div className="min-w-0 flex-1"><a href={a.url} target="_blank" rel="noreferrer" className="block break-words text-xs font-bold text-blue-700">{a.name}</a><p className="mt-1 break-all text-[10px] text-slate-500">{a.contentType} · {sizeText(a.size)}</p><a href={a.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-600"><Download className="h-3 w-3" /> فتح / تنزيل</a></div>{editMode && <button disabled={uploading || draft.isDeleted} onClick={() => void removeAttachment(a)} title="حذف المرفق" className="rounded-lg p-2 text-rose-600 disabled:opacity-40"><X className="h-4 w-4" /></button>}</div>)}</div>}
            </div>
          </div>}
      </div>
    </div>}

    {!draft&&<><div className="my-2 border-t-2 border-slate-200" aria-hidden="true"></div>
      {!showMainEmptyState&&<><div className="mt-4 flex items-center justify-between gap-2"><h2 className="text-sm font-black text-slate-800">المجلدات ({childFolders.length})</h2><span className="text-[10px] text-slate-500">مجلدات الملاحظات فقط</span></div>
      {childFolders.length===0?<p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">لا توجد مجلدات فرعية في هذا المسار.</p>:<div className={viewMode==="list"?"mt-2 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-1.5":"mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"}>{childFolders.map(f=>{const directNotes=notes.filter(n=>(filter==="trash"||!n.isDeleted)&&n.folderId===f.id).length;const subCount=folders.filter(x=>x.parentId===f.id).length;return <div key={f.id} className={"group relative min-w-0 rounded-2xl border border-slate-200/90 bg-white p-3 transition-all hover:border-amber-300 hover:shadow-md "+(viewMode==="list"?"flex items-center gap-2.5":"flex min-h-[105px] flex-col justify-between")}><div className={"flex min-w-0 gap-2 "+(viewMode==="list"?"flex-1 items-center":"items-start")}><button onClick={()=>openFolder(f.id,filter==="trash")} className={"flex min-w-0 flex-1 gap-2 text-right "+(viewMode==="list"?"items-center":"items-start")}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 shadow-sm"><Folder className="h-5 w-5" style={{color:f.color||"#f59e0b"}}/></span><span className="min-w-0"><span className="block break-words text-xs font-black leading-tight text-slate-800">{f.name}</span>{f.description&&<span className="mt-1 block break-words text-[10px] leading-4 text-slate-500">{f.description}</span>}<span className="mt-1 block text-[10px] leading-5 text-slate-500">{subCount} مجلد فرعي • {directNotes} ملاحظة</span><span className="mt-1 block text-[10px] text-slate-400">آخر تعديل: {f.updatedAt?dateText(f.updatedAt):"—"}</span></span></button>{selectionMode&&<input type="checkbox" aria-label={"تحديد مجلد "+f.name} onClick={e=>e.stopPropagation()} onChange={()=>setSelectedNoteIds(ids=>ids.includes("folder:"+f.id)?ids.filter(id=>id!=="folder:"+f.id):[...ids,"folder:"+f.id])} checked={selectedNoteIds.includes("folder:"+f.id)} className="mt-1 h-4 w-4"/>}<button onClick={()=>{void persistFolders(folders.map(x=>x.id===f.id?{...x,favorite:!x.favorite,updatedAt:new Date().toISOString()}:x));}} title="المفضلة" className={"rounded-lg p-1.5 "+(f.favorite?"text-amber-500":"text-slate-400")}><Star className={"h-4 w-4 "+(f.favorite?"fill-amber-400":"")}/></button><div className="relative shrink-0"><button type="button" aria-label={"خيارات المجلد "+f.name} onClick={e=>{e.stopPropagation();setOpenItemMenu(v=>v==="folder:"+f.id?null:"folder:"+f.id);}} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"><MoreVertical className="h-4 w-4"/></button>{openItemMenu==="folder:"+f.id&&<div className="fixed left-1/2 top-1/2 z-[100] w-[min(88vw,20rem)] max-h-[75vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 text-right shadow-2xl" onClick={e=>e.stopPropagation()}>{filter==="trash"?<>{menuEntry("استعادة المجلد","إرجاع المجلد وشجرته إلى مكانها",RotateCcw,()=>{void restoreFolder(f);setOpenItemMenu(null);})}{menuEntry("حذف المجلد نهائياً","حذف محتوياته نهائياً بعد التأكيد",Trash2,()=>{void permanentDeleteFolder(f);setOpenItemMenu(null);},true)}</>:<>{menuEntry("فتح المجلد","عرض المجلدات والملاحظات بداخله",Folder,()=>{openFolder(f.id,filter==="trash");setOpenItemMenu(null);})}{menuEntry("عرض التفاصيل","المسار والتواريخ وعدد المحتويات",FileText,()=>folderDetails(f))}{menuEntry("تعديل المجلد","تعديل الاسم والوصف واللون",BookOpen,()=>openFolderEdit(f))}{menuEntry("إعادة تسمية","تغيير اسم المجلد فقط",FileText,()=>renameFolder(f))}{menuEntry("نقل إلى مجلد","اختيار وجهة من شجرة المجلدات",Folder,()=>moveFolder(f))}{menuEntry("نسخ المجلد ومحتوياته","إنشاء نسخة مستقلة من الشجرة",Copy,()=>{void duplicateFolder(f);setOpenItemMenu(null);})}{menuEntry(f.favorite?"إزالة من المفضلة":"إضافة إلى المفضلة","وصول سريع إلى المجلد",Star,()=>{void persistFolders(folders.map(x=>x.id===f.id?{...x,favorite:!x.favorite,updatedAt:new Date().toISOString()}:x));setOpenItemMenu(null);})}<div className="my-1 border-t border-slate-100"/>{menuEntry("تحديد","إضافة المجلد إلى الاختيار الجماعي",CheckSquare,()=>{setSelectionMode(true);setSelectedNoteIds(ids=>ids.includes("folder:"+f.id)?ids:[...ids,"folder:"+f.id]);setOpenItemMenu(null);})}{menuEntry("مشاركة المجلد","مشاركة المسار أو نسخه",Share2,async()=>{const shareText="مجلد: "+f.name+"\nالمسار: "+folderLabel(f.id);try{if(navigator.share)await navigator.share({title:f.name,text:shareText});else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(shareText);setMessage("تم نسخ تفاصيل المجلد للمشاركة.");}else setError("المشاركة غير مدعومة.");}catch(e){if(!(e instanceof Error&&e.name==="AbortError"))setError("تعذرت مشاركة المجلد.");}setOpenItemMenu(null);})}<div className="my-1 border-t border-slate-100"/>{menuEntry("حذف المجلد","نقله مع محتوياته إلى المهملات",Trash2,()=>{void deleteFolder(f);setOpenItemMenu(null);},true)}</>}</div>}</div></div></div>;})}</div>}</> }</>}</div>



    {movePicker && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={movePicker.title} onClick={()=>setMovePicker(null)}><div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="text-base font-black text-slate-900">{movePicker.title}</h2><p className="mt-1 text-xs text-slate-500">اختر المجلد الذي تريد وضع العنصر داخله.</p></div><button onClick={()=>setMovePicker(null)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><div className="p-3"><input value={moveSearch} onChange={e=>setMoveSearch(e.target.value)} placeholder="ابحث عن مجلد..." className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-400"/></div><div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3"><button onClick={()=>setSelectedDestinationId("")} className={"flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-right text-sm "+(!selectedDestinationId?"border-blue-300 bg-blue-50 text-blue-800":"border-transparent hover:bg-slate-50")}><Folder className="h-5 w-5 shrink-0 text-amber-500"/><span className="min-w-0 flex-1 font-bold">المجلد الرئيسي</span>{!selectedDestinationId&&<Check className="h-4 w-4"/>}</button>{folders.filter(f=>!f.isDeleted&&f.name.toLocaleLowerCase("ar").includes(moveSearch.trim().toLocaleLowerCase("ar"))&&!(movePicker.kind==="folder"&&(f.id===movePicker.id||isFolderDescendant(f.id,movePicker.id||"")))).sort((a,b)=>folderLabel(a.id).localeCompare(folderLabel(b.id),"ar")).map(f=><button key={f.id} onClick={()=>setSelectedDestinationId(f.id)} className={"flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-right text-sm "+(selectedDestinationId===f.id?"border-blue-300 bg-blue-50 text-blue-800":"border-transparent hover:bg-slate-50")}><Folder className="h-5 w-5 shrink-0" style={{color:f.color||"#f59e0b"}}/><span className="min-w-0 flex-1"><span className="block break-words font-bold">{f.name}</span><span className="mt-0.5 block break-words text-[10px] text-slate-400">{folderLabel(f.id)}</span></span>{selectedDestinationId===f.id&&<Check className="h-4 w-4 shrink-0"/>}</button>)}{folders.filter(f=>!f.isDeleted&&f.name.toLocaleLowerCase("ar").includes(moveSearch.trim().toLocaleLowerCase("ar"))).length===0&&<p className="p-4 text-center text-xs text-slate-500">لا توجد مجلدات مطابقة للبحث.</p>}</div><div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3"><span className="min-w-0 flex-1 break-words text-[11px] text-slate-500">الوجهة: {selectedDestinationId?folderLabel(selectedDestinationId):"المجلد الرئيسي"}</span><div className="flex gap-2"><button onClick={()=>setMovePicker(null)} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600">إلغاء</button><button onClick={()=>void commitMovePicker()} className="min-h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white">{movePicker.kind==="copyNote"?"نسخ هنا":movePicker.kind==="bulk"?"نقل المحدد هنا":"نقل هنا"}</button></div></div></div></div>}
    {renameNoteTarget && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="إعادة تسمية الملاحظة" onClick={()=>setRenameNoteTarget(null)}><form onSubmit={e=>{e.preventDefault();void commitRenameNote();}} className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={e=>e.stopPropagation()}><h2 className="text-base font-black text-slate-900">إعادة تسمية الملاحظة</h2><label className="mt-3 block text-xs font-bold text-slate-600">عنوان الملاحظة<input autoFocus value={renameNoteValue} onChange={e=>setRenameNoteValue(e.target.value)} maxLength={200} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"/></label><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setRenameNoteTarget(null)} className="min-h-10 rounded-xl border px-4 text-xs font-bold">إلغاء</button><button type="submit" className="min-h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white">حفظ العنوان</button></div></form></div>}
    {renameFolderTarget && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="إعادة تسمية المجلد" onClick={()=>setRenameFolderTarget(null)}><form onSubmit={e=>{e.preventDefault();void commitRenameFolder();}} className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={e=>e.stopPropagation()}><h2 className="text-base font-black text-slate-900">{folderEditMode==="edit"?"تعديل بيانات المجلد":"إعادة تسمية المجلد"}</h2><label className="mt-3 block text-xs font-bold text-slate-600">اسم المجلد<input autoFocus value={renameFolderValue} onChange={e=>setRenameFolderValue(e.target.value)} maxLength={100} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-amber-400"/></label>{folderEditMode==="edit"&&<label className="mt-3 block text-xs font-bold text-slate-600">وصف المجلد (اختياري)<textarea value={folderDescriptionValue} onChange={e=>setFolderDescriptionValue(e.target.value)} rows={2} maxLength={500} placeholder="اكتب وصفاً قصيراً لمحتويات المجلد" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400"/></label>}{folderEditMode==="edit"&&<label className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-slate-600">لون المجلد<input type="color" aria-label="لون المجلد" value={folderColorValue} onChange={e=>setFolderColorValue(e.target.value)} className="h-10 w-12 rounded-lg border border-slate-200 bg-white p-1"/></label>}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setRenameFolderTarget(null)} className="min-h-10 rounded-xl border px-4 text-xs font-bold">إلغاء</button><button type="submit" className="min-h-10 rounded-xl bg-orange-500 px-4 text-xs font-black text-white">{folderEditMode==="edit"?"حفظ البيانات":"حفظ الاسم"}</button></div></form></div>}
    {detailsFolderTarget && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="تفاصيل المجلد" onClick={()=>setDetailsFolderTarget(null)}><div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-xl bg-orange-100 p-3 text-orange-600"><Folder className="h-6 w-6"/></div><div><h2 className="text-base font-black text-slate-900">{detailsFolderTarget.name}</h2><p className="mt-1 break-words text-xs text-slate-500">{folderLabel(detailsFolderTarget.id)}</p></div></div><button onClick={()=>setDetailsFolderTarget(null)} aria-label="إغلاق" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4"/></button></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-orange-50 p-3"><span className="block text-[11px] text-slate-500">المجلدات الفرعية</span><strong className="mt-1 block text-lg text-orange-700">{folders.filter(f=>f.parentId===detailsFolderTarget.id&&!f.isDeleted).length}</strong></div><div className="rounded-xl bg-blue-50 p-3"><span className="block text-[11px] text-slate-500">الملاحظات المباشرة</span><strong className="mt-1 block text-lg text-blue-700">{notes.filter(n=>n.folderId===detailsFolderTarget.id&&!n.isDeleted).length}</strong></div></div><div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">{detailsFolderTarget.description&&<p className="mb-2 break-words">الوصف: {detailsFolderTarget.description}</p>}<p>تاريخ الإنشاء: {detailsFolderTarget.createdAt?dateText(detailsFolderTarget.createdAt):"—"}</p><p>تاريخ آخر تعديل: {detailsFolderTarget.updatedAt?dateText(detailsFolderTarget.updatedAt):"—"}</p><p>المعرّف: <span className="break-all">{detailsFolderTarget.id}</span></p></div><button onClick={()=>setDetailsFolderTarget(null)} className="mt-4 min-h-10 w-full rounded-xl border border-slate-200 text-xs font-bold">إغلاق</button></div></div>}
    {draft && <div id="notes-print-view" className="hidden" dir="rtl"><h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{draft.title || "ملاحظة"}</h1><p style={{ color: "#64748b", fontSize: 11, marginBottom: 20 }}>الإنشاء: {dateText(draft.createdAt)} — آخر تعديل: {dateText(draft.updatedAt)}</p><div style={{ fontSize: draft.fontSize, color: draft.textColor, lineHeight: 2, overflowWrap: "anywhere" }} dangerouslySetInnerHTML={{ __html: preview(draft.content) }} />{draft.attachments.filter((a) => a.contentType.startsWith("image/")).map((a) => <div key={a.id} style={{ marginTop: 16 }}><p style={{ fontSize: 11 }}>{a.name}</p><img src={a.url} alt={a.name} /></div>)}</div>}
  </section>;
}
