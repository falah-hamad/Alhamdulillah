import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  Pencil,
  Calculator,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Eraser,
  Printer,
  RotateCcw,
  Undo2,
  Redo2,
  Check,
  Layers,
  Sparkles,
  MousePointerClick,
  ArrowUpToLine,
  ArrowDownToLine,
  Calendar,
  Clock,
  X,
  BookOpen,
  Type,
  Palette,
  Zap,
  Lightbulb,
  Phone,
  Download,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  History,
  ShoppingCart,
  HandCoins,
  Info,
  Paperclip,
  ImagePlus,
} from "lucide-react";
import { Invoice, InvoiceItem, Customer, SystemSettings, CustomerChangeLogItem } from "../types";
import { printElement, exportElementToPDF } from "../utils/printUtils";
import CustomerChangeLogTable from "./CustomerChangeLogTable";
import { formatDebtChangeLogDetails, formatPaymentChangeLogDetails } from "../utils/changeLogUtils";
import { auth, uploadUserFile } from "../lib/firebase";
import { dispatchPaidAmountNotification } from "../lib/notifications";

const BG_COLOR_PRESETS = [
  { id: "classic", name: "ورقي دافئ (دفتر كلاسيكي)", color: "#faf6ef" },
  { id: "white", name: "أبيض ناصع", color: "#ffffff" },
  { id: "cream", name: "بيج عاجي", color: "#fdfbf7" },
  { id: "slate", name: "رمادي هادئ", color: "#f8fafc" },
  { id: "mint", name: "أخضر دفتري", color: "#f2f8f2" },
  { id: "parchment", name: "أصفر خفيف", color: "#fef9e7" },
  { id: "ice", name: "أزرق فاتح", color: "#f0f7ff" },
];


interface LedgerComboBoxProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onBlur?: () => void;
  numeric?: boolean;
}

function LedgerComboBox({ label, value, options, onChange, onBlur, numeric = false }: LedgerComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 160, maxHeight: 220 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = React.useId();
  const choices = query ? options.filter(option => option.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : options;
  const placeMenu = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewport = window.visualViewport;
    const visibleTop = viewport?.offsetTop ?? 0;
    const visibleLeft = viewport?.offsetLeft ?? 0;
    const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
    const visibleRight = visibleLeft + (viewport?.width ?? window.innerWidth);
    const width = Math.min(Math.max(rect.width, 160), visibleRight - visibleLeft - 16);
    const below = visibleBottom - rect.bottom - 8;
    const above = rect.top - visibleTop - 8;
    const desiredHeight = Math.min(220, Math.max(40, choices.length * 36 + 8));
    const upwards = below < desiredHeight && above > below;
    const maxHeight = Math.max(40, Math.min(220, upwards ? above : below));
    setPosition({
      top: upwards ? Math.max(visibleTop + 8, rect.top - Math.min(desiredHeight, maxHeight) - 4) : rect.bottom + 4,
      left: Math.max(visibleLeft + 8, Math.min(rect.right - width, visibleRight - width - 8)),
      width, maxHeight,
    });
  };
  const openMenu = () => { setQuery(""); setActiveIndex(0); placeMenu(); setOpen(true); };
  const choose = (option: string) => { onChange(option); setQuery(""); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const scroll = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const resize = () => placeMenu();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [open, choices.length]);
  useEffect(() => { if (open) optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" }); }, [open, activeIndex]);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openMenu();
      else setActiveIndex(index => Math.max(0, Math.min(choices.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter" && open && choices[activeIndex]) {
      event.preventDefault(); choose(choices[activeIndex]);
    } else if (event.key === "Tab") setOpen(false);
  };
  return (
    <div ref={rootRef} className="inline-flex min-w-0 items-center rounded border border-slate-200 bg-white/70 focus-within:ring-1 focus-within:ring-blue-500"
      style={numeric ? { width: `calc(${Math.max(4, value.length + 1)}ch + 1.25rem)`, minWidth: "calc(4ch + 1.25rem)", flexShrink: 0 } : { width: `${Math.max(5.5, value.length * 0.8 + 2)}em`, minWidth: "4em", flexShrink: 1 }}>
      <input type="text" role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open}
        aria-controls={listId} aria-activedescendant={open && choices[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        inputMode={numeric ? "decimal" : "text"} dir={numeric ? "ltr" : "rtl"} autoComplete="off" value={value} placeholder={numeric ? "0" : "الوحدة"}
        onChange={event => { onChange(event.target.value); setQuery(event.target.value); setActiveIndex(0); }}
        onKeyDown={onKeyDown} onBlur={event => {
          onBlur?.();
          if (!rootRef.current?.contains(event.relatedTarget as Node) && !menuRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
        className="w-full min-w-0 flex-1 rounded border-0 bg-transparent px-0.5 py-0.5 text-center outline-none" />
      <button type="button" aria-label={`فتح قائمة ${label}`} aria-expanded={open} aria-controls={listId} aria-haspopup="listbox"
        onMouseDown={event => event.preventDefault()}
        onClick={() => { if (open) setOpen(false); else openMenu(); }}
        onKeyDown={onKeyDown} className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-blue-50">
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && createPortal(
        <div ref={menuRef} id={listId} role="listbox" aria-label={`خيارات ${label}`} dir="rtl"
          className="fixed z-[10030] flex flex-col overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl no-print"
          style={position}>
          {choices.length ? choices.map((option, index) =>
            <button key={option} ref={element => { optionRefs.current[index] = element; }} id={`${listId}-${index}`} type="button"
              role="option" aria-selected={value === option} tabIndex={-1}
              onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}
              className={`w-full shrink-0 px-3 py-2 text-right text-sm leading-5 ${index === activeIndex ? "bg-blue-50 text-blue-800" : "text-slate-800 hover:bg-slate-50"}`}>{option}</button>
          ) : <span className="px-3 py-2 text-xs text-slate-500">اكتب قيمة مخصصة في الحقل</span>}
        </div>, document.body
      )}
    </div>
  );
}

interface VerticalLedgerSheetProps {
  key?: React.Key;
  invoice: Invoice;
  customer: Customer;
  settings: SystemSettings;
  productUnits?: string[];
  onUpdateInvoice: (updatedInvoice: Invoice) => Promise<void> | void;
  onOpenProductCart?: (selectedRowId: string, insertItems: (cartItems: InvoiceItem[]) => boolean) => void;
  onClose?: () => void;
  changeLogs?: CustomerChangeLogItem[];
  isCloudSyncing?: boolean;
  onAddChangeLog?: (item: Omit<CustomerChangeLogItem, "id" | "timestamp" | "formattedDateTime"> & { id?: string; timestamp?: string; formattedDateTime?: string }) => Promise<CustomerChangeLogItem> | void;
  onDeleteChangeLog?: (id: string) => Promise<void> | void;
  onClearCustomerChangeLogs?: (customerId: string, invoiceId?: string) => Promise<void> | void;
  onRevertChangeLog?: (log: CustomerChangeLogItem) => Promise<void> | void;
}

export default function VerticalLedgerSheet({
  invoice,
  customer,
  settings,
  productUnits = [],
  onUpdateInvoice,
  onOpenProductCart,
  changeLogs = [],
  isCloudSyncing = false,
  onAddChangeLog: commitChangeLog,
  onDeleteChangeLog,
  onClearCustomerChangeLogs,
  onRevertChangeLog,
}: VerticalLedgerSheetProps) {
  // Keep the original baseline for the entire edit session, even if an optimistic
  // parent update happens during a failed cloud save attempt.
  const originalInvoiceRef = useRef(invoice);
  useEffect(() => {
    if (originalInvoiceRef.current.id !== invoice.id) originalInvoiceRef.current = invoice;
  }, [invoice.id]);

  // Main view tab: "sheet" (ورقة حساب الدين) or "changelog" (سجل التغييرات)
  const [activeViewTab, setActiveViewTab] = useState<"sheet" | "changelog">("sheet");

  // Mode: "view" (عرض علامة عين) or "edit" (تعديل علامة قلم) - الافتراضي هو وضع العرض
  const [sheetMode, setSheetMode] = useState<"edit" | "view">("view");
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [detailIsPayment, setDetailIsPayment] = useState(false);
  const [pressedViewRowId, setPressedViewRowId] = useState<string | null>(null);
  const viewLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearViewLongPress = () => {
    if (viewLongPressTimer.current) clearTimeout(viewLongPressTimer.current);
    viewLongPressTimer.current = null;
  };
  const [detailSeller, setDetailSeller] = useState("");
  const [detailNotes, setDetailNotes] = useState("");
  const [detailFiles, setDetailFiles] = useState<Array<{ name: string; url: string }>>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [expandedPhoto, setExpandedPhoto] = useState<{ url: string; name: string } | null>(null);
  const photoTouchX = useRef<number | null>(null);
  const [detailUploading, setDetailUploading] = useState(false);
  const openRowDetails = (item: InvoiceItem) => {
    setDetailRowId(item.id);
    setDetailIsPayment(Boolean(item.isSeparator));
    setDetailSeller(item.sellerName || "");
    setDetailNotes(item.saleNotes || "");
    setDetailFiles(Array.isArray(item.saleAttachments) ? item.saleAttachments : []);
    setPhotoIndex(0);
  };
  const saveRowDetails = () => {
    if (!detailRowId || sheetMode !== "edit") return;
    persistChanges(items.map(item => item.id === detailRowId ? { ...item, sellerName: detailSeller.trim(), saleNotes: detailNotes.trim(), saleAttachments: detailFiles } : item));
    setDetailRowId(null);
  };
  const attachRowFile = async (file?: File) => {
    if (!file || !detailRowId || !auth.currentUser) return;
    if (file.size > 10 * 1024 * 1024) { alert("حجم الملف يجب أن لا يتجاوز 10 ميغابايت"); return; }
    if (!file.type.startsWith("image/")) { alert("المسموح صور فقط"); return; }
    setDetailUploading(true);
    try {
      const url = await uploadUserFile(auth.currentUser.uid, "ledger-row-files/" + invoice.id + "/" + detailRowId, file.name, file);
      setDetailFiles(prev => [...prev, { name: file.name, url }]);
    } catch (error) { console.error(error); alert("تعذر رفع المرفق"); }
    finally { setDetailUploading(false); }
  };

  // Font Size: Dynamic numeric font size in pixels (default 13, range 10 to 22)
  const [fontSize, setFontSize] = useState<number>(13);
  const [toolbarTab, setToolbarTab] = useState<"font" | "add" | "delete" | "move" | "page" | "favorites">("font");
  const [ledgerFontColor, setLedgerFontColor] = useState("#111827");
  const [ledgerFontBold, setLedgerFontBold] = useState(true);
  const [ledgerFontItalic, setLedgerFontItalic] = useState(false);
  const [ledgerFontUnderline, setLedgerFontUnderline] = useState(false);
  const [ledgerFontStrike, setLedgerFontStrike] = useState(false);
  const [ledgerToolbarFavorites, setLedgerToolbarFavorites] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("vertical_ledger_favorites") || '["bold","addBelow","moveUp","italic","underline","strike","cart"]'); } catch { return ["bold","addBelow","moveUp","italic","underline","strike","cart"]; } });
  const [showLedgerFavoritesEditor, setShowLedgerFavoritesEditor] = useState(false);
  const [ledgerFavoritesDraft, setLedgerFavoritesDraft] = useState<string[]>([]);
  useEffect(() => { try { localStorage.setItem("vertical_ledger_favorites", JSON.stringify(ledgerToolbarFavorites)); } catch {} }, [ledgerToolbarFavorites]);

  // Background Color State (لون خلفية الكشف وورقة الدفتر)
  const [sheetBgColor, setSheetBgColor] = useState<string>(() => {
    try {
      return localStorage.getItem("ledger_sheet_bg_color") || "#faf6ef";
    } catch {
      return "#faf6ef";
    }
  });
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Debounce ref to prevent duplicate or keystroke-level notifications for "واصل"
  const paidCommitDebounceRef = useRef<{ [sepId: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    return () => {
      Object.values(paidCommitDebounceRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
    }
    if (showColorPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showColorPicker]);

  const handleSelectBgColor = (color: string) => {
    setSheetBgColor(color);
    try {
      localStorage.setItem("ledger_sheet_bg_color", color);
    } catch {}
  };

  // Separator Info Dialog State (لوحة معلومات ثابتة لليوم والتاريخ والساعة)
  const [activeSeparatorForModal, setActiveSeparatorForModal] = useState<InvoiceItem | null>(null);

  // Helpers for Arabic date, day name and formatted time
  const getArabicDayName = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(d);
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(d);
    } catch {
      return "";
    }
  };

  const getCurrentDateFormatted = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getCurrentTimeFormatted = () => {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "مساءً" : "صباحاً";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const openSeparatorInfoModal = (sep: InvoiceItem) => {
    setActiveSeparatorForModal(sep);
  };

  // Local editable copy of items
  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (!invoice.items || invoice.items.length === 0) {
      return [];
    }
    // Ensure all existing items default to pageNumber: 1 if not set
    return invoice.items.map((it) => ({
      ...it,
      pageNumber: it.pageNumber || 1,
    }));
  });

  // Pages Management State
  const [pageCount, setPageCount] = useState<number>(() => {
    const maxItemPage = (invoice.items || []).reduce(
      (max, it) => Math.max(max, it.pageNumber || 1),
      1
    );
    return Math.max(1, invoice.pageCount || 1, maxItemPage);
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [viewAllPages, setViewAllPages] = useState<boolean>(true);

  // Sync items and state whenever a different invoice is loaded
  useEffect(() => {
    if (!invoice.items || invoice.items.length === 0) {
      setItems([]);
      setSelectedRowId(null);
      setHasExplicitRowSelection(false);
    } else {
      setItems(
        invoice.items.map((it) => ({
          ...it,
          pageNumber: it.pageNumber || 1,
        }))
      );
      setSelectedRowId(invoice.items[0]?.id || null);
      setHasExplicitRowSelection(false);
    }
    const maxItemPage = (invoice.items || []).reduce(
      (max, it) => Math.max(max, it.pageNumber || 1),
      1
    );
    setPageCount(Math.max(1, invoice.pageCount || 1, maxItemPage));
    setCurrentPage(1);
  }, [invoice.id]);

  // Keep pageCount in sync if items exceed it
  useEffect(() => {
    const maxItemPage = items.reduce((max, it) => Math.max(max, it.pageNumber || 1), 1);
    if (maxItemPage > pageCount) {
      setPageCount(maxItemPage);
    }
  }, [items, pageCount]);

  // Selected row state for classic Excel-like row manipulation
  const [selectedRowId, setSelectedRowId] = useState<string | null>(() => {
    if (invoice.items && invoice.items.length > 0) {
      return invoice.items[0].id;
    }
    return null;
  });
  const [hasExplicitRowSelection, setHasExplicitRowSelection] = useState(false);
  // Multi-row selection for the vertical debt ledger (edit mode only).
  const [rowSelectionMode, setRowSelectionMode] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const rowLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowLongPressTriggered = useRef(false);

  const clearRowLongPress = () => {
    if (rowLongPressTimer.current) {
      clearTimeout(rowLongPressTimer.current);
      rowLongPressTimer.current = null;
    }
  };
  const startRowLongPress = (rowId: string, button: number) => {
    if (sheetMode !== "edit" || button !== 0 || rowSelectionMode) return;
    clearRowLongPress();
    rowLongPressTriggered.current = false;
    rowLongPressTimer.current = setTimeout(() => {
      rowLongPressTriggered.current = true;
      setRowSelectionMode(true);
      setSelectedRowIds([rowId]);
      setSelectedRowId(rowId);
      setHasExplicitRowSelection(true);
      setToolbarTab("font");
      rowLongPressTimer.current = null;
    }, 550);
  };
  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((previous) =>
      previous.includes(rowId) ? previous.filter((id) => id !== rowId) : [...previous, rowId]
    );
  };
  const exitRowSelectionMode = () => {
    clearRowLongPress();
    rowLongPressTriggered.current = false;
    setRowSelectionMode(false);
    setSelectedRowIds([]);
  };
  useEffect(() => () => clearRowLongPress(), []);
  useEffect(() => { if (sheetMode !== "edit" && rowSelectionMode) exitRowSelectionMode(); }, [sheetMode, rowSelectionMode]);

  const applyLedgerRowFormat = (patch: Partial<InvoiceItem>) => {
    const targetIds = rowSelectionMode && selectedRowIds.length ? selectedRowIds : selectedRowId ? [selectedRowId] : [];
    if (!targetIds.length) return;
    setItems((previous) => previous.map((item) => targetIds.includes(item.id) ? { ...item, ...patch } : item));
    setHasUnsavedChanges(true);
    setSaveStatus("توجد تغييرات تنسيق غير محفوظة");
  };

  // Local draft text for amounts currently being typed by the user to avoid cursor jumping or value replacement
  const [editingAmounts, setEditingAmounts] = useState<Record<string, string>>({});
  const [editingQuantities, setEditingQuantities] = useState<Record<string, string>>({});
  const unitSuggestions = [...new Set(["قطعة", "رولة", "متر", "باكيت", "درجة", "كرتون", "علبة", "كيس", "كيلوغرام", "لتر", "زوج", "طقم", ...productUnits, ...items.map(item => String(item.unit || ""))].map(unit => unit.trim()).filter(Boolean))];

  // Save feedback state
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingChangeLogs, setPendingChangeLogs] = useState<Array<Parameters<NonNullable<typeof commitChangeLog>>[0]>>([]);
  const [pendingPaidNotifications, setPendingPaidNotifications] = useState<Array<{ userId: string; payload: Parameters<typeof dispatchPaidAmountNotification>[1] }>>([]);

  // Keep unsaved rows and their queued side effects together when undoing.
  type EditSnapshot = {
    items: InvoiceItem[]; pageCount: number; dirty: boolean; background: string;
    logs: typeof pendingChangeLogs; notifications: typeof pendingPaidNotifications;
  };
  const editHistory = useRef<{ invoiceId: string; entries: EditSnapshot[]; index: number }>({ invoiceId: invoice.id, entries: [], index: -1 });
  const restoringEdit = useRef(false);
  const [, setHistoryVersion] = useState(0);
  useEffect(() => {
    const snapshot: EditSnapshot = { items, pageCount, dirty: hasUnsavedChanges, background: sheetBgColor, logs: pendingChangeLogs, notifications: pendingPaidNotifications };
    const history = editHistory.current;
    if (sheetMode !== "edit" || history.invoiceId !== invoice.id || history.index < 0) {
      editHistory.current = { invoiceId: invoice.id, entries: [snapshot], index: 0 };
      restoringEdit.current = false;
      setHistoryVersion(version => version + 1);
      return;
    }
    if (restoringEdit.current) { restoringEdit.current = false; return; }
    if (JSON.stringify(history.entries[history.index]) === JSON.stringify(snapshot)) return;
    const entries = [...history.entries.slice(0, history.index + 1), snapshot].slice(-100);
    editHistory.current = { invoiceId: invoice.id, entries, index: entries.length - 1 };
    setHistoryVersion(version => version + 1);
  }, [items, pageCount, hasUnsavedChanges, pendingChangeLogs, pendingPaidNotifications, sheetBgColor, sheetMode, invoice.id]);
  const restoreEdit = (direction: -1 | 1) => {
    const history = editHistory.current;
    const index = history.index + direction;
    if (sheetMode !== "edit" || index < 0 || index >= history.entries.length) return;
    const snapshot = history.entries[index];
    restoringEdit.current = true;
    history.index = index;
    setItems(snapshot.items);
    setPageCount(snapshot.pageCount);
    setCurrentPage(page => Math.min(page, snapshot.pageCount));
    setPendingChangeLogs(snapshot.logs);
    setPendingPaidNotifications(snapshot.notifications);
    setHasUnsavedChanges(snapshot.dirty);
    setSheetBgColor(snapshot.background);
    try { localStorage.setItem("ledger_sheet_bg_color", snapshot.background); } catch {}
    setEditingAmounts({});
    setEditingQuantities({});
    setDetailRowId(null);
    setSelectedRowIds(ids => ids.filter(id => snapshot.items.some(item => item.id === id)));
    if (!snapshot.items.some(item => item.id === selectedRowId)) {
      setSelectedRowId(snapshot.items[0]?.id || null);
      setHasExplicitRowSelection(false);
    }
    setSaveStatus(direction === -1 ? "تم التراجع عن التعديل" : "تمت إعادة التعديل");
    setHistoryVersion(version => version + 1);
  };
  const canUndo = editHistory.current.index > 0;
  const canRedo = editHistory.current.index < editHistory.current.entries.length - 1;

  // Match the visible sequence number printed on the ledger, not the raw array index.
  // The sheet numbers debt rows across pages and excludes separators/payment/remaining rows.
  const getLedgerSequence = (sourceItems: InvoiceItem[], targetItemId?: string): number | undefined => {
    if (!targetItemId) return undefined;
    const maxPage = Math.max(pageCount, 1, ...sourceItems.map((item) => item.pageNumber || 1));
    const orderedItems = Array.from({ length: maxPage }, (_, index) =>
      sourceItems.filter((item) => (item.pageNumber || 1) === index + 1)
    ).flat();
    let sequence = 0;
    for (const item of orderedItems) {
      const isNumberedRow = !item.isPaymentRow && !item.isRemainingRow;
      if (item.id === targetItemId) return isNumberedRow ? sequence + 1 : undefined;
      if (isNumberedRow) sequence += 1;
    }
    return undefined;
  };

  // Queue history entries until the user explicitly confirms saving.
  const onAddChangeLog = (entry: Parameters<NonNullable<typeof commitChangeLog>>[0]) => {
    const entryWithLocation = {
      ...entry,
      location: entry.location ?? getLedgerSequence(items, entry.targetItemId),
    };
    setPendingChangeLogs((previous) => [...previous, entryWithLocation]);
  };

  // Sync back to parent whenever items change
  const persistChanges = (updatedItems: InvoiceItem[], explicitPageCount?: number) => {
    setItems(updatedItems);
    const maxItemPg = updatedItems.reduce((max, it) => Math.max(max, it.pageNumber || 1), 1);
    const finalPageCount = explicitPageCount || Math.max(pageCount, maxItemPg);
    setPageCount(finalPageCount);

    let grandTotal = 0;
    let totalPaid = 0;

    updatedItems.forEach((it) => {
      if (!it.isSeparator && !it.isPaymentRow && !it.isRemainingRow) {
        grandTotal += Number(it.total || it.unitPrice || 0);
      }
      if (it.isSeparator) {
        totalPaid += Number(it.paidAmount || 0);
      }
    });

    if (!updatedItems.some((it) => it.isSeparator)) {
      totalPaid = invoice.paidAmount;
    }

    const updatedInvoice: Invoice = {
      ...invoice,
      items: updatedItems,
      grandTotal,
      paidAmount: totalPaid,
      remainingAmount: Math.max(0, grandTotal - totalPaid),
      pageCount: finalPageCount,
    };

    setHasUnsavedChanges(true);
    setSaveStatus("توجد تغييرات غير محفوظة");
  };


  // The selected row may exist only in this unsaved sheet, not in invoice.items.
  const cartDraftRef = useRef({ items, mode: sheetMode, invoiceId: invoice.id, mounted: true });
  cartDraftRef.current.items = items;
  cartDraftRef.current.mode = sheetMode;
  cartDraftRef.current.invoiceId = invoice.id;
  useEffect(() => {
    cartDraftRef.current.mounted = true;
    return () => { cartDraftRef.current.mounted = false; };
  }, []);
  const isEmptyCartRow = (row?: InvoiceItem) => Boolean(row &&
    !row.isSeparator && !row.isPaymentRow && !row.isRemainingRow &&
    !row.details.trim() && !row.productId && !Number(row.total || 0) && !Number(row.unitPrice || 0));
  const openLedgerProductCart = () => {
    const row = items.find(item => item.id === selectedRowId);
    if (sheetMode !== "edit" || !hasExplicitRowSelection || !selectedRowId || !isEmptyCartRow(row)) {
      alert("حدّد صفًا فارغًا في وضع التعديل أولًا، ثم افتح عربة البضاعة.");
      return;
    }
    const targetRowId = selectedRowId;
    const targetInvoiceId = invoice.id;
    onOpenProductCart?.(targetRowId, cartItems => {
      const draft = cartDraftRef.current;
      if (!draft.mounted || draft.mode !== "edit" || draft.invoiceId !== targetInvoiceId || !cartItems.length) return false;
      const index = draft.items.findIndex(item => item.id === targetRowId);
      const target = draft.items[index];
      if (index < 0 || !isEmptyCartRow(target)) {
        alert("الصف المحدد لم يعد فارغًا. أغلق العربة وحدّد صفًا فارغًا ثم أعد المحاولة.");
        return false;
      }
      const pageNumber = target.pageNumber || 1;
      const inserted = cartItems.map((item, itemIndex) => ({
        ...(itemIndex === 0 ? target : {}),
        ...item,
        id: itemIndex === 0 ? targetRowId : item.id,
        pageNumber,
        isLoggedDebt: true,
      }));
      const nextItems = [...draft.items];
      nextItems.splice(index, 1, ...inserted);
      cartDraftRef.current.items = nextItems;
      persistChanges(nextItems);
      setPendingChangeLogs(previous => [...previous, ...inserted.map(item => ({
        customerId: customer.id,
        invoiceId: targetInvoiceId,
        actionType: "إضافة دين",
        details: formatDebtChangeLogDetails(item.details, item.total, settings.currency),
        rawAmount: item.total,
        itemName: item.details,
        targetItemId: item.id,
        location: getLedgerSequence(nextItems, item.id),
        previousState: item,
      }))]);
      setSelectedRowId(targetRowId);
      setHasExplicitRowSelection(true);
      return true;
    });
  };

  const handleConfirmSave = async (): Promise<boolean> => {
    const previousItems = new Map<string, InvoiceItem>(originalInvoiceRef.current.items.map((row: InvoiceItem): [string, InvoiceItem] => [row.id, row]));
    const savedAt = new Date().toISOString();
    const latestItems = items.map(row => {
      const previous = previousItems.get(row.id);
      const isPurchase = !row.isSeparator && !row.isPaymentRow && !row.isRemainingRow && (row.details.trim() || row.total !== 0);
      const wasPurchase = previous && !previous.isSeparator && !previous.isPaymentRow && !previous.isRemainingRow && (previous.details.trim() || previous.total !== 0);
      if (wasPurchase && previous.createdAt) return { ...row, createdAt: previous.createdAt };
      return isPurchase && !wasPurchase ? { ...row, createdAt: previous ? savedAt : (row.createdAt || savedAt) } : row;
    });
    let grandTotal = 0;
    let totalPaid = 0;
    latestItems.forEach((it) => {
      if (!it.isSeparator && !it.isPaymentRow && !it.isRemainingRow) {
        grandTotal += Number(it.total || it.unitPrice || 0);
      }
      if (it.isSeparator) totalPaid += Number(it.paidAmount || 0);
    });
    if (!latestItems.some((it) => it.isSeparator)) totalPaid = originalInvoiceRef.current.paidAmount;
    const updatedInvoice: Invoice = {
      ...invoice,
      items: latestItems,
      grandTotal,
      paidAmount: totalPaid,
      remainingAmount: Math.max(0, grandTotal - totalPaid),
      pageCount,
    };
    // Existing rows changed during this editing session must also create a history entry,
    // but only after the user confirms saving.
    const originalItems = (originalInvoiceRef.current.items || []) as InvoiceItem[];
    const originalById = new Map<string, InvoiceItem>(originalItems.map((item): [string, InvoiceItem] => [item.id, item]));
    const editLogs = latestItems.flatMap((item) => {
      const previous = originalById.get(item.id);
      if (!previous) return [];
      if (item.isSeparator && previous.isSeparator) {
        const oldPaid = Number(previous.paidAmount || 0);
        const newPaid = Number(item.paidAmount || 0);
        if (oldPaid === newPaid) return [];
        const oldTotal = calculateSeparatorTotal(originalItems, previous.id);
        const newTotal = calculateSeparatorTotal(latestItems, item.id);
        return [{
          customerId: customer.id,
          invoiceId: invoice.id,
          actionType: "تعديل واصل",
          details: `تعديل التسديد: المجموع ${oldTotal.toLocaleString("en-US")} ${settings.currency}، التسديد ${oldPaid.toLocaleString("en-US")} ← ${newPaid.toLocaleString("en-US")} ${settings.currency}`,
          rawAmount: newPaid,
          targetItemId: item.id,
          location: getLedgerSequence(latestItems, item.id),
          previousState: { ...previous, subtotal: oldTotal, afterSubtotal: newTotal, afterPaidAmount: newPaid },
        }];
      }
      if (item.isSeparator || previous.isSeparator) return [];
      const oldAmount = Number(previous.total || previous.unitPrice || 0);
      const newAmount = Number(item.total || item.unitPrice || 0);
      const oldName = (previous.details || "").trim();
      const newName = (item.details || "").trim();
      const oldQuantity = Number(previous.quantity ?? 1);
      const newQuantity = Number(item.quantity ?? 1);
      const oldUnit = previous.unit || "";
      const newUnit = item.unit || "";
      if (oldAmount === newAmount && oldName === newName && oldQuantity === newQuantity && oldUnit === newUnit) return [];
      return [{
        customerId: customer.id,
        invoiceId: invoice.id,
        actionType: "تعديل دين",
        details: `تعديل: ${formatDebtChangeLogDetails(oldName, oldAmount, settings.currency)} (${oldQuantity} ${oldUnit}) ← ${formatDebtChangeLogDetails(newName, newAmount, settings.currency)} (${newQuantity} ${newUnit})`,
        rawAmount: newAmount,
        itemName: newName,
        targetItemId: item.id,
        location: getLedgerSequence(latestItems, item.id),
        previousState: previous,
      }];
    });
    // Resolve queued actions against the last saved snapshot and the final draft.
    // This prevents intermediate edits (even hundreds of them) from being recorded as
    // separate saved changes; the history records the final state at the moment of Save.
    const savedById = new Map<string, InvoiceItem>(originalItems.map((item) => [item.id, item]));
    const latestById = new Map<string, InvoiceItem>(latestItems.map((item) => [item.id, item]));
    const consolidatedPending = new Map<string, (typeof pendingChangeLogs)[number]>();
    for (const entry of pendingChangeLogs) {
      const targetId = entry.targetItemId;
      if (!targetId) {
        consolidatedPending.set(`untargeted:${entry.actionType}:${entry.details}`, entry);
        continue;
      }
      const savedRow = savedById.get(targetId);
      const latestRow = latestById.get(targetId);
      const isAdd = entry.actionType === "إضافة دين" || entry.actionType === "إضافة واصل";
      const isDelete = entry.actionType === "حذف دين" || entry.actionType === "حذف واصل";
      // An item created and removed before Save has no persisted change to record.
      if (isAdd && !latestRow) continue;
      // A full row deletion is only real if that row existed in the last saved version.
      if (isDelete && !latestRow && !savedRow) continue;
      // If a row still exists, ignore stale full-row delete records. Clearing an amount
      // leaves the row in place and is intentionally retained as a delete movement.
      if (isDelete && latestRow && (Number(latestRow.total || latestRow.unitPrice || 0) > 0 || Number(latestRow.paidAmount || 0) > 0)) continue;
      const sourceRow = latestRow || savedRow || entry.previousState;
      let finalEntry = entry;
      if (sourceRow && isAdd) {
        const finalAmount = sourceRow.isSeparator ? Number(sourceRow.paidAmount || 0) : Number(sourceRow.total || sourceRow.unitPrice || 0);
        const finalName = (sourceRow.details || "").trim();
        if (finalAmount <= 0 && !finalName) continue;
        finalEntry = {
          ...entry,
          details: sourceRow.isSeparator
            ? formatPaymentChangeLogDetails(finalAmount, settings.currency)
            : formatDebtChangeLogDetails(finalName, finalAmount, settings.currency),
          rawAmount: finalAmount,
          itemName: finalName,
          previousState: sourceRow.isSeparator
            ? { ...sourceRow, subtotal: calculateSeparatorTotal(latestItems, sourceRow.id) }
            : sourceRow,
        };
      } else if (sourceRow && isDelete) {
        const originalRow = savedRow || sourceRow;
        const finalAmount = originalRow.isSeparator ? Number(originalRow.paidAmount || 0) : Number(originalRow.total || originalRow.unitPrice || 0);
        const finalName = (originalRow.details || "").trim();
        finalEntry = {
          ...entry,
          details: originalRow.isSeparator
            ? formatPaymentChangeLogDetails(finalAmount, settings.currency)
            : formatDebtChangeLogDetails(finalName, finalAmount, settings.currency),
          rawAmount: finalAmount,
          itemName: finalName,
          previousState: originalRow.isSeparator
            ? { ...originalRow, subtotal: calculateSeparatorTotal(originalItems, originalRow.id) }
            : originalRow,
        };
      }
      const key = targetId + ":" + entry.actionType;
      consolidatedPending.set(key, finalEntry);
    }
    try {
      await onUpdateInvoice(updatedInvoice);
      originalInvoiceRef.current = updatedInvoice;
      setItems(latestItems);
      const finalPendingLogs = [...consolidatedPending.values()];
      const pendingAdditionIds = new Set(
        finalPendingLogs
          .filter((entry) => entry.actionType === "إضافة دين" || entry.actionType === "إضافة واصل")
          .map((entry) => entry.targetItemId)
          .filter((id): id is string => Boolean(id))
      );
      for (const entry of [...finalPendingLogs, ...editLogs.filter((item) => !item.targetItemId || !pendingAdditionIds.has(item.targetItemId))]) {
        await Promise.resolve(commitChangeLog?.(entry));
      }
      for (const notification of pendingPaidNotifications) {
        await dispatchPaidAmountNotification(notification.userId, notification.payload);
      }
      setPendingPaidNotifications([]);
      setPendingChangeLogs([]);
      setHasUnsavedChanges(false);
      setSheetMode("view");
      setSaveStatus("تم حفظ التغييرات وتسجيل الحركة");
      setTimeout(() => setSaveStatus(null), 2200);
      return true;
    } catch (error) {
      console.error("Failed to save ledger sheet changes:", error);
      setSaveStatus("تعذر الحفظ؛ بقيت التغييرات محفوظة مؤقتاً داخل الورقة");
      return false;
    }
  };

  const handleCancelChanges = () => {
    if (!hasUnsavedChanges && pendingChangeLogs.length === 0) {
      setSheetMode("view");
      setSaveStatus(null);
      return;
    }

    const originalInvoice = originalInvoiceRef.current;
    const originalItems = (originalInvoice.items || []).map((it) => ({ ...it, pageNumber: it.pageNumber || 1 }));
    setItems(originalItems);
    setPageCount(Math.max(1, originalInvoice.pageCount || 1, ...originalItems.map((it) => it.pageNumber || 1)));
    setEditingAmounts({});
    setEditingQuantities({});
    setPendingChangeLogs([]);
    setPendingPaidNotifications([]);
    setHasUnsavedChanges(false);
    setSheetMode("view");
    setSaveStatus("تم إلغاء التغييرات");
    setTimeout(() => setSaveStatus(null), 1800);
  };

  useEffect(() => {
    const notifyGuard = () => {
      window.dispatchEvent(new CustomEvent("ledger-unsaved-change", {
        detail: {
          source: "debt-sheet",
          dirty: hasUnsavedChanges || pendingChangeLogs.length > 0,
          label: "ورقة الدفتر",
          save: async () => {
            if (!hasUnsavedChanges && pendingChangeLogs.length === 0) return true;
            return await handleConfirmSave();
          },
          cancel: () => { handleCancelChanges(); },
        },
      }));
    };
    notifyGuard();
    return () => {
      window.dispatchEvent(new CustomEvent("ledger-unsaved-change", { detail: { source: "debt-sheet", dirty: false } }));
    };
  }, [hasUnsavedChanges, pendingChangeLogs, items, pageCount, invoice.id]);

  // Add New Page handler
  const handleAddNewPage = () => {
    const nextPg = pageCount + 1;
    setPageCount(nextPg);
    setCurrentPage(nextPg);

    // Automatically add an initial row on the new page so it is immediately ready
    const newRow: InvoiceItem = {
      id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      details: "",
      quantity: 1,
      unitPrice: 0,
      total: 0,
      pageNumber: nextPg,
      isLoggedDebt: false,
      createdAt: new Date().toISOString(),
    };

    const updated = [...items, newRow];
    persistChanges(updated, nextPg);
    setSelectedRowId(newRow.id);
  };

  // Delete current page handler
  const handleDeleteCurrentPage = () => {
    if (pageCount <= 1) return;
    const pageToDelete = currentPage;
    const hasData = items.some(
      (it) =>
        (it.pageNumber || 1) === pageToDelete &&
        ((it.details && it.details.trim()) || it.total || it.paidAmount)
    );

    if (hasData) {
      const confirmDelete = window.confirm(
        `الصفحة رقم ${pageToDelete} تحتوي على ديون مسجلة.\nهل أنت متأكد من حذف هذه الصفحة ونقل ديونها للصفحة السابقة؟`
      );
      if (!confirmDelete) return;
    }

    // Move any items on pageToDelete to pageToDelete - 1
    const updated = items
      .map((it) => {
        const itemPg = it.pageNumber || 1;
        if (itemPg === pageToDelete) {
          return { ...it, pageNumber: Math.max(1, pageToDelete - 1) };
        } else if (itemPg > pageToDelete) {
          return { ...it, pageNumber: itemPg - 1 };
        }
        return it;
      })
      .filter((it) => it.details?.trim() || it.total || it.paidAmount || it.isSeparator);

    const newPageCount = pageCount - 1;
    const newCurrent = Math.min(currentPage, newPageCount);
    setPageCount(newPageCount);
    setCurrentPage(newCurrent);
    persistChanges(updated, newPageCount);
  };

  // Move row to another page
  const handleMoveRowToPage = (targetId: string, targetPage: number) => {
    const updated = items.map((it) => {
      if (it.id === targetId) {
        return { ...it, pageNumber: targetPage };
      }
      return it;
    });
    persistChanges(updated);
    if (!viewAllPages && targetPage !== currentPage) {
      setCurrentPage(targetPage);
    }
  };

  // 1. Insert separator according to cursor / selected row position
  const handleInsertSeparator = (targetPageNum?: number) => {
    const todayStr = getCurrentDateFormatted();
    const timeStr = getCurrentTimeFormatted();
    const dayStr = getArabicDayName(todayStr);

    const selectedItem = items.find((it) => it.id === selectedRowId);
    const pageToAssign =
      targetPageNum || (selectedItem ? selectedItem.pageNumber || 1 : currentPage);

    const newSeparator: InvoiceItem = {
      id: `sep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      details: "تسديد",
      quantity: 1,
      unitPrice: 0,
      total: 0,
      isSeparator: true,
      paidAmount: 0,
      paidDate: todayStr,
      paidTime: timeStr,
      paidDay: dayStr,
      deliveryDate: todayStr,
      deliveryTime: timeStr,
      pageNumber: pageToAssign,
      isLoggedPaid: false,
    };

    if (!selectedRowId) {
      const updated = [...items, newSeparator];
      persistChanges(updated);
      setSelectedRowId(newSeparator.id);
      return;
    }

    const idx = items.findIndex((it) => it.id === selectedRowId);
    if (idx === -1) {
      const updated = [...items, newSeparator];
      persistChanges(updated);
      setSelectedRowId(newSeparator.id);
    } else {
      const updated = [...items];
      updated.splice(idx + 1, 0, newSeparator);
      persistChanges(updated);
      setSelectedRowId(newSeparator.id);
    }
  };

  // Add quick new row to a specific page
  const handleAddNewRowToPage = (pgNum: number) => {
    const newRow: InvoiceItem = {
      id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      details: "",
      quantity: 1,
      unitPrice: 0,
      total: 0,
      pageNumber: pgNum,
      isLoggedDebt: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [...items, newRow];
    persistChanges(updated);
    setSelectedRowId(newRow.id);
  };

  // 2. Insert row ABOVE the selected row
  const handleInsertRowAbove = (targetId?: string) => {
    const idToUse = targetId || selectedRowId;
    const targetItem = items.find((it) => it.id === idToUse);
    const newRow: InvoiceItem = {
      id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      details: "",
      quantity: 1,
      unitPrice: 0,
      total: 0,
      pageNumber: targetItem?.pageNumber || currentPage,
      isLoggedDebt: false,
      createdAt: new Date().toISOString(),
    };

    if (!idToUse) {
      const updated = [newRow, ...items];
      persistChanges(updated);
      setSelectedRowId(newRow.id);
      return;
    }

    const idx = items.findIndex((it) => it.id === idToUse);
    if (idx === -1) {
      const updated = [newRow, ...items];
      persistChanges(updated);
    } else {
      const updated = [...items];
      updated.splice(idx, 0, newRow);
      persistChanges(updated);
    }
    setSelectedRowId(newRow.id);
  };

  // 3. Insert row BELOW the selected row
  const handleInsertRowBelow = (targetId?: string) => {
    const idToUse = targetId || selectedRowId;
    const targetItem = items.find((it) => it.id === idToUse);
    const newRow: InvoiceItem = {
      id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      details: "",
      quantity: 1,
      unitPrice: 0,
      total: 0,
      pageNumber: targetItem?.pageNumber || currentPage,
      isLoggedDebt: false,
      createdAt: new Date().toISOString(),
    };

    if (!idToUse) {
      const updated = [...items, newRow];
      persistChanges(updated);
      setSelectedRowId(newRow.id);
      return;
    }

    const idx = items.findIndex((it) => it.id === idToUse);
    if (idx === -1) {
      const updated = [...items, newRow];
      persistChanges(updated);
    } else {
      const updated = [...items];
      updated.splice(idx + 1, 0, newRow);
      persistChanges(updated);
    }
    setSelectedRowId(newRow.id);
  };

  // 4. Move row UP
  const handleMoveRowUp = (idToMove?: string) => {
    const targetId = idToMove || selectedRowId;
    if (!targetId) return;

    const idx = items.findIndex((it) => it.id === targetId);
    if (idx <= 0) return; // already at top

    const updated = [...items];
    const temp = updated[idx];
    updated[idx] = updated[idx - 1];
    updated[idx - 1] = temp;

    persistChanges(updated);
    setSelectedRowId(targetId);
  };

  // 5. Move row DOWN
  const handleMoveRowDown = (idToMove?: string) => {
    const targetId = idToMove || selectedRowId;
    if (!targetId) return;

    const idx = items.findIndex((it) => it.id === targetId);
    if (idx === -1 || idx >= items.length - 1) return; // already at bottom

    const updated = [...items];
    const temp = updated[idx];
    updated[idx] = updated[idx + 1];
    updated[idx + 1] = temp;

    persistChanges(updated);
    setSelectedRowId(targetId);
  };

  // 6. Delete amount of the row ONLY
  const handleClearRowAmount = (idToClear?: string) => {
    const targetId = idToClear || selectedRowId;
    if (!targetId) return;

    setEditingAmounts((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });

    const itemToClear = items.find((it) => it.id === targetId && !it.isSeparator);
    const oldAmt = Number(itemToClear?.total || itemToClear?.unitPrice || 0);

    const updated = items.map((it) => {
      if (it.id === targetId && !it.isSeparator) {
        return {
          ...it,
          unitPrice: 0,
          total: 0,
        };
      }
      return it;
    });

    persistChanges(updated);

    if (oldAmt > 0 && itemToClear && onAddChangeLog) {
      onAddChangeLog({
        customerId: customer.id,
        invoiceId: invoice.id,
        actionType: "حذف دين",
        details: `تفريغ مبلغ: ${formatDebtChangeLogDetails(itemToClear.details, oldAmt, settings.currency)}`,
        rawAmount: oldAmt,
        itemName: itemToClear.details,
        targetItemId: itemToClear.id,
        previousState: itemToClear,
      });
    }
  };

  // 7. Delete row completely with automatic Change Log entry
  const handleDeleteRow = (idToDelete?: string) => {
    const targetId = idToDelete || selectedRowId;
    if (!targetId) return;

    const itemToDelete = items.find((it) => it.id === targetId);
    if (itemToDelete && onAddChangeLog) {
      if (itemToDelete.isSeparator) {
        const paid = Number(itemToDelete.paidAmount || 0);
        if (paid > 0) {
          onAddChangeLog({
            customerId: customer.id,
            invoiceId: invoice.id,
            actionType: "حذف واصل",
            details: formatPaymentChangeLogDetails(paid, settings.currency),
            rawAmount: paid,
            targetItemId: itemToDelete.id,
            previousState: {
              ...itemToDelete,
              subtotal: calculateSeparatorTotal(items, itemToDelete.id),
            },
          });
        }
      } else {
        const amount = Number(itemToDelete.total || itemToDelete.unitPrice || 0);
        const name = (itemToDelete.details || "").trim();
        if (name.length > 0 || amount > 0) {
          onAddChangeLog({
            customerId: customer.id,
            invoiceId: invoice.id,
            actionType: "حذف دين",
            details: formatDebtChangeLogDetails(name, amount, settings.currency),
            rawAmount: amount,
            itemName: name,
            targetItemId: itemToDelete.id,
            previousState: itemToDelete,
          });
        }
      }
    }

    const idx = items.findIndex((it) => it.id === targetId);
    const updated = items.filter((it) => it.id !== targetId);

    persistChanges(updated);

    if (selectedRowId === targetId) {
      if (updated.length > 0) {
        const nextIdx = Math.min(idx, updated.length - 1);
        setSelectedRowId(updated[nextIdx].id);
      } else {
        setSelectedRowId(null);
      }
    }
  };

  // Commit debt row logging on blur / Enter
  const handleCommitRowDebtLog = (rowId: string) => {
    const row = items.find((it) => it.id === rowId);
    if (!row || row.isSeparator) return;

    const amt = Number(row.total || row.unitPrice || 0);
    const name = (row.details || "").trim();

    if (amt <= 0 && name.length === 0) return;

    if (!row.isLoggedDebt) {
      const updated = items.map((it) =>
        it.id === rowId ? { ...it, isLoggedDebt: true } : it
      );
      persistChanges(updated);

      if (onAddChangeLog) {
        onAddChangeLog({
          customerId: customer.id,
          invoiceId: invoice.id,
          actionType: "إضافة دين",
          details: formatDebtChangeLogDetails(name, amt, settings.currency),
          rawAmount: amt,
          itemName: name,
          targetItemId: row.id,
          previousState: row,
        });
      }
    }
  };

  // Calculate the running debt total at the separator for accurate payment history.
  const calculateSeparatorTotal = (sourceItems: InvoiceItem[], sepId: string): number => {
    let runningDebt = 0;
    for (const it of sourceItems) {
      if (it.id === sepId) return runningDebt;
      if (!it.isSeparator && !it.isPaymentRow && !it.isRemainingRow) {
        runningDebt += Number(it.total || it.unitPrice || 0);
      }
    }
    return runningDebt;
  };

  // Helper to calculate remaining balance at the time of a separator
  const calculateSeparatorRemaining = (sepId: string): number => {
    let runningDebt = 0;
    let runningPaid = 0;
    for (const it of items) {
      if (it.isSeparator) {
        runningPaid += Number(it.paidAmount || 0);
        if (it.id === sepId) {
          return Math.max(0, runningDebt - runningPaid);
        }
      } else if (!it.isPaymentRow && !it.isRemainingRow) {
        runningDebt += Number(it.total || it.unitPrice || 0);
      }
    }
    return Math.max(0, runningDebt - runningPaid);
  };

  // Commit separator paid logging on blur / Enter
  const handleCommitSeparatorPaidLog = (sepId: string) => {
    // Clear debounce timer if present
    if (paidCommitDebounceRef.current[sepId]) {
      clearTimeout(paidCommitDebounceRef.current[sepId]);
      delete paidCommitDebounceRef.current[sepId];
    }

    const sep = items.find((it) => it.id === sepId);
    if (!sep || !sep.isSeparator) return;

    const paid = Number(sep.paidAmount || 0);
    if (paid <= 0) return;

    if (!sep.isLoggedPaid) {
      const updated = items.map((it) =>
        it.id === sepId ? { ...it, isLoggedPaid: true } : it
      );
      persistChanges(updated);

      if (onAddChangeLog) {
        onAddChangeLog({
          customerId: customer.id,
          invoiceId: invoice.id,
          actionType: "إضافة واصل",
          details: formatPaymentChangeLogDetails(paid, settings.currency),
          rawAmount: paid,
          targetItemId: sep.id,
          previousState: {
            ...sep,
            subtotal: calculateSeparatorTotal(items, sep.id),
          },
        });
      }
    }

    // 🔔 Trigger Event 3 Notification: سداد جزء من الدين أو كامل الدين
    // Only fires for the final committed operation, strictly deduplicated by operation ID
    const currentUserId = auth.currentUser?.uid || invoice.userId;
    if (currentUserId) {
      const remainingVal = calculateSeparatorRemaining(sepId);
      const opId = `${customer.id}_${invoice.id}_${sep.id}_${paid}`;

      setPendingPaidNotifications((previous) => [...previous, {
        userId: currentUserId,
        payload: {
          operationId: opId,
          customerId: customer.id,
          customerName: customer.name || invoice.customerName || "العميل",
          invoiceId: invoice.id,
          paidAmount: paid,
          remainingAmount: remainingVal,
          currency: settings.currency,
        },
      }]);
    }
  };

  // 8. Update row details (inline editing)
  const handleUpdateDetails = (id: string, newDetailsVal: string) => {
    const updated = items.map((it) => {
      if (it.id === id) {
        return { ...it, details: newDetailsVal };
      }
      return it;
    });
    persistChanges(updated);
  };

  // 9. Update row amount (inline editing)
  const handleUpdateQuantity = (id: string, value: string) => {
    const normalized = value
      .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/٫/g, ".");
    if (normalized !== "" && !/^\d*\.?\d*$/.test(normalized)) return;
    const quantity = normalized === "" ? 0 : Number(normalized);
    if (!Number.isFinite(quantity) || quantity < 0) return;
    setEditingQuantities(previous => ({ ...previous, [id]: value }));
    persistChanges(items.map(item => item.id === id ? { ...item, quantity } : item));
  };

  const handleUpdateUnit = (id: string, unit: string) => {
    persistChanges(items.map(item => item.id === id ? { ...item, unit } : item));
  };

  const handleUpdateAmount = (id: string, amountStr: string) => {
    // Keep exact user draft text so cursor, typing, backspace, and deletion work smoothly
    setEditingAmounts((prev) => ({ ...prev, [id]: amountStr }));

    // Extract clean number: support Arabic/Persian digits and decimals
    const normalizedStr = amountStr
      .replace(/[٠-٩]/g, (d) => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)])
      .replace(/[^\d.]/g, "");
    const cleanNum = normalizedStr === "" ? 0 : Number(normalizedStr) || 0;

    const updated = items.map((it) => {
      if (it.id === id) {
        return {
          ...it,
          unitPrice: cleanNum,
          total: cleanNum,
        };
      }
      return it;
    });
    persistChanges(updated);
  };

  // Blur handler for row amount: clear draft so formatted display or clean value shows
  const handleRowAmountBlur = (id: string) => {
    setEditingAmounts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // 10. Update paid amount for separator (updates UI state immediately, debounces commit notification)
  const handleUpdatePaidAmount = (sepId: string, paidValStr: string) => {
    // Keep exact draft text for separator paid amount
    setEditingAmounts((prev) => ({ ...prev, [sepId]: paidValStr }));

    const normalizedStr = paidValStr
      .replace(/[٠-٩]/g, (d) => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)])
      .replace(/[^\d.]/g, "");
    const rawVal = normalizedStr === "" ? 0 : Number(normalizedStr) || 0;

    const todayStr = getCurrentDateFormatted();
    const timeStr = getCurrentTimeFormatted();
    const dayStr = getArabicDayName(todayStr);

    const updated = items.map((it) => {
      if (it.id === sepId) {
        return {
          ...it,
          paidAmount: Math.max(0, rawVal),
          paidDate: it.paidDate || todayStr,
          paidTime: it.paidTime || timeStr,
          paidDay: it.paidDay || dayStr,
          deliveryDate: it.deliveryDate || todayStr,
          deliveryTime: it.deliveryTime || timeStr,
        };
      }
      return it;
    });
    persistChanges(updated);

    // Debounce commit in case user pauses typing and doesn't press Enter or blur
    if (paidCommitDebounceRef.current[sepId]) {
      clearTimeout(paidCommitDebounceRef.current[sepId]);
    }
    if (rawVal > 0) {
      paidCommitDebounceRef.current[sepId] = setTimeout(() => {
        handleCommitSeparatorPaidLog(sepId);
      }, 1500);
    }
  };

  // Blur handler for separator paid amount
  const handleSeparatorPaidBlur = (sepId: string) => {
    setEditingAmounts((prev) => {
      const next = { ...prev };
      delete next[sepId];
      return next;
    });
    handleCommitSeparatorPaidLog(sepId);
  };

  // 11. Clear all items from this ledger sheet
  const handleClearAllItems = () => {
    if (items.length === 0) return;
    const confirmClear = window.confirm(
      `هل أنت متأكد من تفريغ كافة بنود وأصناف حساب الزبون "${customer.name}" وجعل الحساب فارغاً؟`
    );
    if (!confirmClear) return;

    if (onAddChangeLog) {
      const debtItems = items.filter((it) => !it.isSeparator && (it.total || it.details?.trim()));
      for (const it of debtItems) {
        const amt = Number(it.total || it.unitPrice || 0);
        const name = (it.details || "").trim();
        onAddChangeLog({
          customerId: customer.id,
          invoiceId: invoice.id,
          actionType: "حذف دين",
          details: formatDebtChangeLogDetails(name, amt, settings.currency),
          rawAmount: amt,
          itemName: name,
          targetItemId: it.id,
          previousState: it,
        });
      }
    }

    persistChanges([], 1);
    setSelectedRowId(null);
    setCurrentPage(1);
    setSaveStatus("تم تفريغ الحساب بالكامل 🧹");
    setTimeout(() => setSaveStatus(null), 2500);
  };

  // Print & PDF Export State
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Print sheet reliably with complete data across all A4 pages
  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    const prevViewAll = viewAllPages;
    setViewAllPages(true);

    setTimeout(async () => {
      try {
        await printElement("vertical-ledger-sheet", {
          title: `وصل_دين_${customer.name}_${invoice.invoiceNumber}`,
          onComplete: () => {
            setIsPrinting(false);
            setViewAllPages(prevViewAll);
          },
        });
      } catch (err) {
        console.error("Print execution failed:", err);
        setIsPrinting(false);
        setViewAllPages(prevViewAll);
      } finally {
        setTimeout(() => {
          setIsPrinting(false);
          setViewAllPages(prevViewAll);
        }, 1200);
      }
    }, 100);
  };

  const handleExportPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    const prevViewAll = viewAllPages;
    setViewAllPages(true);

    setTimeout(async () => {
      try {
        await exportElementToPDF("vertical-ledger-sheet", {
          filename: `وصل_دين_${customer.name}_${invoice.invoiceNumber}`,
        });
      } catch (err) {
        console.error("PDF export error", err);
        alert("تعذر تصدير PDF: " + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsExportingPDF(false);
        setViewAllPages(prevViewAll);
      }
    }, 100);
  };

  // --- Calculate Sections and Totals by Page (Cumulative Accounting Across A4 Pages) ---
  type SectionData = {
    sectionIndex: number;
    items: { item: InvoiceItem; lineIndex: number }[];
    separator?: InvoiceItem;
    separatorLineIndex?: number;
    previousRemaining: number;
    currentItemsTotal: number;
    subtotal: number;
    paid: number;
    remaining: number;
  };

  type PageData = {
    pageNum: number;
    startingBalance: number; // الرصيد المرحل من الصفحة السابقة
    sections: SectionData[];
    endingBalance: number; // الرصيد المتبقي في نهاية الصفحة
    pageItemsCount: number;
  };

  const pagesData: PageData[] = [];
  let runningCarriedForward = 0;
  let globalLineCounter = 1;

  for (let p = 1; p <= pageCount; p++) {
    const pageItems = items.filter((it) => (it.pageNumber || 1) === p);
    const pageStartingBalance = runningCarriedForward;

    const pageSections: SectionData[] = [];
    let currentSecItems: { item: InvoiceItem; lineIndex: number }[] = [];
    let currentItemsSum = 0;
    let sectionPreviousRemaining = pageStartingBalance;
    let sectionCounter = 1;

    pageItems.forEach((it) => {
      if (it.isSeparator) {
        const paidVal = Number(it.paidAmount || 0);
        const subtotalVal = sectionPreviousRemaining + currentItemsSum;
        const remainingVal = Math.max(0, subtotalVal - paidVal);

        pageSections.push({
          sectionIndex: sectionCounter++,
          items: currentSecItems,
          separator: it,
          separatorLineIndex: globalLineCounter++,
          previousRemaining: sectionPreviousRemaining,
          currentItemsTotal: currentItemsSum,
          subtotal: subtotalVal,
          paid: paidVal,
          remaining: remainingVal,
        });

        sectionPreviousRemaining = remainingVal;
        currentSecItems = [];
        currentItemsSum = 0;
      } else if (!it.isPaymentRow && !it.isRemainingRow) {
        const amt = Number(it.total || it.unitPrice || 0);
        currentItemsSum += amt;
        currentSecItems.push({
          item: it,
          lineIndex: globalLineCounter++,
        });
      }
    });

    let pageEndingBalance = sectionPreviousRemaining;
    if (currentSecItems.length > 0 || pageSections.length === 0) {
      const subtotalVal = sectionPreviousRemaining + currentItemsSum;
      pageSections.push({
        sectionIndex: sectionCounter++,
        items: currentSecItems,
        previousRemaining: sectionPreviousRemaining,
        currentItemsTotal: currentItemsSum,
        subtotal: subtotalVal,
        paid: 0,
        remaining: subtotalVal,
      });
      pageEndingBalance = subtotalVal;
    }

    pagesData.push({
      pageNum: p,
      startingBalance: pageStartingBalance,
      sections: pageSections,
      endingBalance: pageEndingBalance,
      pageItemsCount: pageItems.length,
    });

    // The ending balance carries over as starting balance to the next page!
    runningCarriedForward = pageEndingBalance;
  }

  // Selected item info
  const selectedItem = items.find((it) => it.id === selectedRowId);
  const selectedIndex = items.findIndex((it) => it.id === selectedRowId);
  const isSelectedSeparator = selectedItem?.isSeparator === true;

  // Grand totals across all sections and pages
  const overallDebts = items
    .filter((it) => !it.isSeparator && !it.isPaymentRow && !it.isRemainingRow)
    .reduce((acc, it) => acc + (Number(it.total || it.unitPrice) || 0), 0);

  const overallPaid = items
    .filter((it) => it.isSeparator)
    .reduce((acc, it) => acc + (Number(it.paidAmount) || 0), 0);

  const overallRemaining = Math.max(0, overallDebts - overallPaid);

  // Helper to render a single A4 page
  const renderA4Page = (pageData: PageData) => {
    const isFirstPage = pageData.pageNum === 1;
    const isLastPage = pageData.pageNum === pageCount;

    return (
      <div
        key={`a4-page-${pageData.pageNum}`}
        id={`vertical-ledger-page-${pageData.pageNum}`}
        className="a4-page w-full max-w-[794px] min-h-[1123px] border border-amber-900/25 shadow-xl rounded-2xl p-6 sm:p-8 text-slate-900 font-sans relative transition-all flex flex-col justify-between mx-auto"
        style={{ backgroundColor: sheetBgColor }}
        data-ledger-font="true"
      >
        <style>{`#vertical-ledger-sheet .vertical-ledger-grid{grid-template-columns:minmax(0,.5fr) repeat(3,minmax(0,.65fr)) repeat(5,minmax(0,1.35fr)) repeat(3,minmax(2.5rem,1fr)) var(--ledger-row-tools-width,0px)!important}@media print{#vertical-ledger-sheet .vertical-ledger-grid{grid-template-columns:minmax(0,.5fr) repeat(3,minmax(0,.65fr)) repeat(5,minmax(0,1.35fr)) repeat(3,minmax(2.5rem,1fr)) 0px!important}}[data-row-font-color="true"] .text-slate-900,[data-row-font-color="true"] .text-slate-800,[data-row-font-color="true"] .text-slate-700,[data-row-font-color="true"] .text-slate-600,[data-row-font-color="true"] input{color:var(--row-font-color)!important}[data-row-font-size="true"] .text-slate-900,[data-row-font-size="true"] .text-slate-800,[data-row-font-size="true"] .text-slate-700,[data-row-font-size="true"] .text-slate-600,[data-row-font-size="true"] input{font-size:var(--row-font-size)!important}[data-row-font-bold="true"] .text-slate-900,[data-row-font-bold="true"] .text-slate-800,[data-row-font-bold="true"] .text-slate-700,[data-row-font-bold="true"] .text-slate-600,[data-row-font-bold="true"] input{font-weight:var(--row-font-weight)!important}[data-row-font-italic="true"] .text-slate-900,[data-row-font-italic="true"] .text-slate-800,[data-row-font-italic="true"] .text-slate-700,[data-row-font-italic="true"] .text-slate-600,[data-row-font-italic="true"] input{font-style:var(--row-font-style)!important}[data-row-font-decoration="true"] .text-slate-900,[data-row-font-decoration="true"] .text-slate-800,[data-row-font-decoration="true"] .text-slate-700,[data-row-font-decoration="true"] .text-slate-600,[data-row-font-decoration="true"] input{text-decoration:var(--row-text-decoration)!important}`}</style>
        {/* TOP SECTION OF THE A4 SHEET */}
        <div>
          {/* Header Box: محلات العاشق للكهربائيات (Store Brand & Debt Ledger Header) */}
          <div id={`ledger-sheet-brand-header-${pageData.pageNum}`} className="border-b-2 border-amber-900/25 pb-3.5 mb-4 select-none">
            {/* Top Row: Store Branding, Logo, and Electrical Slogan */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-amber-900/15">
              <div className="flex items-center gap-3 text-right">
                {/* Store Electrical Logo Emblem */}
                <div className="relative shrink-0 flex items-center justify-center">
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-700 via-amber-800 to-slate-950 text-amber-300 flex items-center justify-center shadow-md ring-2 ring-amber-400/50 border border-amber-300/30">
                    <Zap className="w-7 h-7 sm:w-8 sm:h-8 fill-amber-400 text-amber-300 drop-shadow" />
                  </div>
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center ring-2 ring-white shadow-xs" title="إنارة وتأسيسات">
                    <Lightbulb className="w-3 h-3 text-amber-200 fill-amber-300" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center ring-1 ring-white shadow-2xs">
                    <Sparkles className="w-2.5 h-2.5" />
                  </div>
                </div>

                {/* Store Name & Description */}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg sm:text-xl md:text-2xl font-black text-slate-950 font-sans leading-tight">
                      {settings.companyName || "اسم المتجر"}
                    </h1>
                  </div>
                  {settings.companyDescription?.trim() && <p className="text-[10px] sm:text-xs font-semibold text-slate-700 mt-1 leading-relaxed whitespace-normal break-words max-w-2xl">{settings.companyDescription}</p>}
                </div>
              </div>

              {/* Document Identity Badge: سجل حساب الديون ورقم الصفحة */}
              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-1 bg-amber-950/5 border border-amber-900/15 p-2 rounded-xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-900/15 border border-amber-900/25 rounded-lg text-amber-950 font-black text-xs">
                  <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                  <span>سجل حساب الديون</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold bg-amber-200/90 text-amber-950 px-2 py-0.5 rounded-md border border-amber-300/80">
                    ورقة A4 — صفحة {pageData.pageNum} من {pageCount}
                  </span>
                  <div className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                    <span dir="ltr" className="font-mono">
                      {invoice.invoiceNumber || "INV-501380"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Customer Information & Transaction Date */}
            <div className="pt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-white/70 border border-amber-900/20 px-3 py-1 rounded-lg shadow-2xs">
                  <span className="text-slate-500 font-bold text-[11px]">حساب السيد:</span>
                  <span className="font-black text-slate-950 text-sm">
                    {customer.name}
                  </span>
                </div>

                {customer.phone && (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-white/70 border border-amber-900/20 px-2.5 py-1 rounded-lg shadow-2xs">
                    <Phone className="w-3 h-3 text-amber-800 shrink-0" />
                    <span dir="ltr" className="font-mono">
                      {customer.phone}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 bg-white/70 border border-amber-900/20 px-3 py-1 rounded-lg shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                <span>التاريخ:</span>
                <span dir="ltr" className="font-mono">
                  {invoice.date || new Date().toISOString().split("T")[0]}
                </span>
              </div>
            </div>
          </div>

          {/* CARRIED-FORWARD BALANCE BANNER (الرصيد المدور من الصفحة السابقة) */}
          {!isFirstPage && (
            <div className="bg-amber-100/80 border border-amber-300 rounded-xl px-3.5 py-2.5 mb-3.5 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  <RotateCcw className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                    <span>رصيد مدوّر ومرحّل من الصفحة السابقة</span>
                    <span className="bg-amber-200/90 text-amber-950 border border-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      صفحة {pageData.pageNum - 1}
                    </span>
                  </div>
                  <div className="text-[10px] text-amber-800 font-medium">
                    تم ترحيل متبقي الحساب تراكمياً لبدء حساب صفحة {pageData.pageNum}
                  </div>
                </div>
              </div>
              <div className="text-left bg-white/90 border border-amber-300/80 px-3 py-1 rounded-lg">
                <span className="text-[9px] font-bold text-amber-800 block">المبلغ المرحّل:</span>
                <span className="text-xs sm:text-sm font-black font-mono text-slate-950">
                  {pageData.startingBalance.toLocaleString()} {settings.currency}
                </span>
              </div>
            </div>
          )}

          {/* The Ledger Table */}
          <div className="w-full" style={{ "--ledger-row-tools-width": sheetMode === "edit" ? "5rem" : "0px" } as React.CSSProperties}>
            {/* Table Header: ت | المبلغ | التفاصيل | الكمية */}
            <div className="grid grid-cols-12 vertical-ledger-grid border-b border-amber-900/30 pb-2 text-xs font-bold text-slate-600 select-none">
              <div className="col-span-1 text-center font-bold text-slate-500 text-xs">ت</div>
              <div className="col-span-3 text-center font-bold text-xs">المبلغ</div>
              <div className="col-span-5 text-right pr-1 font-bold text-xs">التفاصيل والبيان</div>
              <div className="col-span-3 text-center font-bold text-xs">الكمية</div>
              {sheetMode === "edit" && <div aria-hidden="true" className="no-print" style={{ gridColumn: 13 }} />}
            </div>

            {/* Empty Account State Notice */}
            {items.length === 0 && (
              <div className="py-12 px-6 text-center flex flex-col items-center justify-center gap-3 no-print bg-amber-50/50 rounded-xl border border-dashed border-amber-300 my-4">
                <div className="w-12 h-12 rounded-full bg-blue-100/70 text-blue-700 flex items-center justify-center shadow-xs">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md text-center">
                  <p className="font-bold text-sm text-slate-800">
                    قائمة حساب فارغة للزبون: {customer.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    الحساب فارغ تماماً بدون أي ديون أو بنود افتراضية (المجموع: 0، الواصل: 0، المتبقي: 0).
                  </p>
                </div>
                {sheetMode === "edit" && (
                  <button
                    type="button"
                    onClick={() => handleInsertRowBelow()}
                    className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة أول بند / مادة في الحساب</span>
                  </button>
                )}
              </div>
            )}

            {/* Render Sections (Calculated for this A4 page) */}
            {pageData.sections.map((sec, sIdx) => {
              return (
                <div key={`page-${pageData.pageNum}-section-${sIdx}`} className="space-y-0.5">
                  {/* Section Operations Rows */}
                  {sec.items.map(({ item, lineIndex }) => {
                    const isSelected = selectedRowId === item.id;
                    const isMultiSelected = selectedRowIds.includes(item.id);

                    return (
                      <div
                        key={item.id}
                        id={`row-${item.id}`}
                        onClick={() => {
                          if (sheetMode === "view") return;
                          if (rowSelectionMode) {
                            if (!item.isSeparator && !item.isPaymentRow && !item.isRemainingRow) toggleRowSelection(item.id);
                            return;
                          }
                          setSelectedRowId(item.id);
                          setHasExplicitRowSelection(true);
                        }}
                        onPointerDown={event => {
                          if (sheetMode !== "view" || event.button !== 0 || item.isSeparator || item.isPaymentRow || item.isRemainingRow) return;
                          clearViewLongPress();
                          setPressedViewRowId(item.id);
                          viewLongPressTimer.current = setTimeout(() => {
                            setSelectedRowId(item.id);
                            setHasExplicitRowSelection(true);
                            openRowDetails(item);
                            viewLongPressTimer.current = null;
                          }, 550);
                        }}
                        onPointerUp={() => { clearViewLongPress(); setPressedViewRowId(null); }}
                        onPointerLeave={() => { clearViewLongPress(); setPressedViewRowId(null); }}
                        onPointerCancel={() => { clearViewLongPress(); setPressedViewRowId(null); }}
                        onContextMenu={event => { if (sheetMode === "view" && !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow) event.preventDefault(); }}
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            handleCommitRowDebtLog(item.id);
                          }
                        }}
                        className={`grid grid-cols-12 vertical-ledger-grid items-center py-1 border-b border-amber-900/10 transition-all rounded-md group relative cursor-pointer ${
                          rowSelectionMode && isMultiSelected
                            ? "bg-blue-100/80 ring-1 ring-blue-500/80 shadow-2xs"
                             : sheetMode === "edit" && isSelected
                            ? "bg-amber-100/70 ring-1 ring-amber-500/80 shadow-2xs"
                            : sheetMode === "view" && (pressedViewRowId === item.id || detailRowId === item.id)
                            ? "ring-1 ring-blue-300/60"
                            : "hover:bg-amber-900/5"
                        }`}
                        data-row-font-color={item.rowFontColor ? "true" : undefined}
                        data-row-font-size={item.rowFontSize ? "true" : undefined}
                        data-row-font-bold={item.rowFontBold !== undefined ? "true" : undefined}
                        data-row-font-italic={item.rowFontItalic !== undefined ? "true" : undefined}
                        data-row-font-decoration={item.rowFontUnderline !== undefined || item.rowFontStrike !== undefined ? "true" : undefined}
                        style={{ backgroundColor: sheetMode === "view" && (pressedViewRowId === item.id || detailRowId === item.id) ? "rgba(147, 197, 253, 0.28)" : rowSelectionMode && isMultiSelected ? undefined : item.rowBackgroundColor, "--row-font-color": item.rowFontColor || "#111827", "--row-font-size": `${item.rowFontSize || 13}px`, "--row-font-weight": item.rowFontBold ? 800 : 400, "--row-font-style": item.rowFontItalic ? "italic" : "normal", "--row-text-decoration": [item.rowFontUnderline ? "underline" : "", item.rowFontStrike ? "line-through" : ""].filter(Boolean).join(" ") || "none" } as React.CSSProperties}
                      >
                        {/* 1. ت (Line Index) */}
                        <div className="col-span-1 text-center text-[11px] font-mono font-medium text-slate-400 flex items-center justify-center gap-1">
                          {sheetMode === "edit" && rowSelectionMode && !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow ? (
                            <button
                              type="button"
                              aria-label={isMultiSelected ? `إلغاء تحديد الصف ${lineIndex}` : `تحديد الصف ${lineIndex}`}
                              aria-pressed={isMultiSelected}
                              onClick={(event) => { event.stopPropagation(); if (rowLongPressTriggered.current) { rowLongPressTriggered.current = false; return; } toggleRowSelection(item.id); }}
                              className={`flex items-center justify-center rounded-none border-2 ${isMultiSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-400 bg-white text-transparent"}`} style={{ width: 20, height: 20, minWidth: 20, minHeight: 20, maxWidth: 20, maxHeight: 20, flex: "0 0 20px", aspectRatio: "1 / 1", boxSizing: "border-box" }}
                            >{isMultiSelected ? <Check className="h-3.5 w-3.5"/> : <span className="h-2 w-2"/>}</button>
                          ) : sheetMode === "edit" && !rowSelectionMode && !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow ? (
                            <button
                              type="button"
                              aria-label={`رقم الصف ${lineIndex}، اضغط مطولاً للتحديد المتعدد`}
                              onPointerDown={(event) => startRowLongPress(item.id, event.button)}
                              onPointerUp={clearRowLongPress}
                              onPointerCancel={clearRowLongPress}
                              onContextMenu={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.stopPropagation();
                                clearRowLongPress();
                                if (rowLongPressTriggered.current) { rowLongPressTriggered.current = false; return; }
                                setSelectedRowId(item.id);
                                setHasExplicitRowSelection(true);
                              }}
                              className="min-w-5 rounded px-0.5 py-1 text-slate-500 active:bg-blue-100"
                            >{lineIndex}</button>
                          ) : (
                            <span>{lineIndex}</span>
                          )}
                        </div>

                        {/* 2. المبلغ (Amount) */}
                        <div className="col-span-3 px-1">
                          {sheetMode === "view" ? (
                            <div
                              style={{ fontSize: `${fontSize}px` }}
                              className="w-full text-center font-mono font-bold text-slate-900 py-0.5 select-text"
                            >
                              {item.total !== undefined && item.total !== 0
                                ? Number(item.total).toLocaleString()
                                : "—"}
                            </div>
                          ) : (
                            <input
                              type="text"
                              inputMode="numeric"
                              style={{ fontSize: `${fontSize}px` }}
                              value={
                                editingAmounts[item.id] !== undefined
                                  ? editingAmounts[item.id]
                                  : item.total !== undefined && item.total !== 0
                                  ? String(item.total)
                                  : ""
                              }
                              placeholder="0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRowId(item.id);
                                setHasExplicitRowSelection(true);
                              }}
                              onChange={(e) => handleUpdateAmount(item.id, e.target.value)}
                              onBlur={() => handleRowAmountBlur(item.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleRowAmountBlur(item.id);
                                  handleCommitRowDebtLog(item.id);
                                }
                              }}
                              className="w-full text-center font-mono font-bold text-slate-900 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 transition-all border border-transparent hover:border-slate-300/70"
                            />
                          )}
                        </div>

                        {/* 3. التفاصيل (Details) */}
                        <div className="col-span-5 min-w-0 pr-1 pl-1 flex items-center justify-between">
                          {sheetMode === "view" ? (
                            <div
                              style={{ fontSize: `${fontSize}px` }}
                              className="w-full text-right font-medium text-slate-800 py-0.5 select-text"
                            >
                              {item.details || "—"}
                            </div>
                          ) : (
                            <>
                              <input
                                type="text"
                                style={{ fontSize: `${fontSize}px` }}
                                value={item.details}
                                placeholder="اسم المادة أو البيان..."
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRowId(item.id);
                                  setHasExplicitRowSelection(true);
                                }}
                                onChange={(e) => handleUpdateDetails(item.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleCommitRowDebtLog(item.id);
                                  }
                                }}
                                className="w-full text-right font-medium text-slate-800 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-0.5 transition-all border border-transparent hover:border-slate-300/70 leading-normal"
                              />

                            </>
                          )}
                        </div>

                        {/* Quantity and unit share one compact cell. Amount remains the entered row total. */}
                        <div className="col-span-3 min-w-0 px-0.5 text-center" style={{ fontSize: `${fontSize}px` }}>
                          {sheetMode === "view" ? (
                            <span className="inline-flex max-w-full items-center justify-center gap-1 whitespace-nowrap select-text">
                              <span dir="ltr">{item.quantity ?? 1}</span>
                              <span>{item.unit || ""}</span>
                            </span>
                          ) : (
                            <div className="flex w-full min-w-0 items-center justify-center gap-1" onClick={event => { event.stopPropagation(); setSelectedRowId(item.id); setHasExplicitRowSelection(true); }}>
                              <LedgerComboBox label="الكمية" numeric
                                value={editingQuantities[item.id] ?? String(item.quantity ?? 1)}
                                options={Array.from({ length: 10 }, (_, index) => String(index + 1))}
                                onChange={value => handleUpdateQuantity(item.id, value)}
                                onBlur={() => setEditingQuantities(previous => { const next = { ...previous }; delete next[item.id]; return next; })} />
                              <LedgerComboBox label="وحدة الكمية" value={item.unit ?? ""} options={unitSuggestions}
                                onChange={value => handleUpdateUnit(item.id, value)} />
                            </div>
                          )}
                        </div>

                        {/* Row tools follow the quantity column in RTL. */}
                        {sheetMode === "edit" && (
                              <div
                                className={`flex items-center justify-end gap-0.5 px-1 no-print ${
                                  isSelected ? "visible" : "invisible group-hover:visible group-focus-within:visible"
                                }`}
                                style={{ gridColumn: 13, gridRow: 1 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleInsertRowAbove(item.id)}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-500 hover:text-blue-700 hover:bg-white/80 rounded"
                                  title="إضافة صف جديد أعلى هذا الصف"
                                >
                                  <ArrowUpToLine className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInsertRowBelow(item.id)}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-500 hover:text-blue-700 hover:bg-white/80 rounded"
                                  title="إضافة صف جديد أسفل هذا الصف"
                                >
                                  <ArrowDownToLine className="w-4 h-4" />
                                </button>


                                <button type="button" title="تفاصيل الصف" aria-label="تفاصيل الصف" onClick={() => openRowDetails(item)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-white/80 hover:text-blue-700"><Info className="h-4 w-4" /></button>
                              </div>
                        )}
                      </div>
                    );
                  })}

                  {/* 4. SEPARATOR BLOCK (الفاصلة الحسابية) */}
                  {sec.separator && (
                    <div
                      id={`sep-${sec.separator.id}`}
                      onClick={() => { if (sheetMode === "edit") setSelectedRowId(sec.separator!.id); }}
                      onPointerDown={event => {
                        if (sheetMode !== "view" || event.button !== 0) return;
                        clearViewLongPress();
                        setPressedViewRowId(sec.separator!.id);
                        viewLongPressTimer.current = setTimeout(() => {
                          setSelectedRowId(sec.separator!.id);
                          openRowDetails(sec.separator!);
                          viewLongPressTimer.current = null;
                        }, 550);
                      }}
                      onPointerUp={() => { clearViewLongPress(); setPressedViewRowId(null); }}
                      onPointerLeave={() => { clearViewLongPress(); setPressedViewRowId(null); }}
                      onPointerCancel={() => { clearViewLongPress(); setPressedViewRowId(null); }}
                      onContextMenu={event => { if (sheetMode === "view") event.preventDefault(); }}
                      className={`pt-1.5 pb-2.5 transition-all rounded-lg ${
                        sheetMode === "edit" && selectedRowId === sec.separator.id
                          ? "ring-1 ring-blue-500 bg-blue-50/40 p-2 my-1.5 shadow-2xs"
                          : sheetMode === "view" && (pressedViewRowId === sec.separator.id || detailRowId === sec.separator.id)
                          ? "ring-1 ring-blue-300 bg-blue-100/30"
                          : ""
                      }`}
                    >
                      {sheetMode === "edit" && <button type="button" className="no-print float-left rounded-md bg-white/90 p-1 text-slate-500" aria-label="تفاصيل المجموع والتسديد" onClick={event => { event.stopPropagation(); openRowDetails(sec.separator!); }}><Info className="h-3.5 w-3.5"/></button>}
                      {/* ━━━━━━━━━ Line 1: Refined clean divider ━━━━━━━━━ */}
                      <div className="w-full h-[1.5px] bg-slate-700/80 rounded-full my-1.5"></div>

                      {/* المجموع (Subtotal) */}
                      <div className="grid grid-cols-12 vertical-ledger-grid items-center py-1">
                        <div className="col-span-1"></div>
                        <div
                          style={{ fontSize: `${fontSize + 1}px` }}
                          className="col-span-3 text-center font-mono font-bold text-slate-900"
                        >
                          {sec.subtotal.toLocaleString()}
                        </div>
                        <div
                          style={{ fontSize: `${fontSize}px` }}
                          className="col-span-8 pr-1 font-bold text-slate-800 flex items-center justify-between"
                        >
                          <span>المجموع</span>
                        </div>
                      </div>

                      {/* الواصل (Paid Amount) */}
                      <div className="grid grid-cols-12 vertical-ledger-grid items-center py-1">
                        <div className="col-span-1 text-center text-[11px] font-mono font-medium text-slate-400">
                          {sec.separatorLineIndex ?? ""}
                        </div>
                        <div className="col-span-3 text-center flex items-center justify-center">
                          {sheetMode === "view" ? (
                            <span
                              style={{ fontSize: `${fontSize + 1}px` }}
                              className="font-mono font-bold text-emerald-800 py-0.5 select-text"
                            >
                              {sec.paid ? Number(sec.paid).toLocaleString() : "0"}
                            </span>
                          ) : (
                            <input
                              type="text"
                              inputMode="numeric"
                              style={{ fontSize: `${fontSize + 1}px` }}
                              value={
                                editingAmounts[sec.separator!.id] !== undefined
                                  ? editingAmounts[sec.separator!.id]
                                  : sec.paid
                                  ? String(sec.paid)
                                  : ""
                              }
                              placeholder="0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRowId(sec.separator!.id);
                              }}
                              onChange={(e) => handleUpdatePaidAmount(sec.separator!.id, e.target.value)}
                              onBlur={() => handleSeparatorPaidBlur(sec.separator!.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleSeparatorPaidBlur(sec.separator!.id);
                                }
                              }}
                              className="w-28 text-center font-mono font-bold text-emerald-800 bg-white/95 border border-slate-300/90 rounded px-2 py-0.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs"
                              title="أدخل المبلغ المسدد/الواصل من العميل"
                            />
                          )}
                        </div>
                        <div className="col-span-8 pr-1 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap shrink-0">
                            <span
                              style={{ fontSize: `${fontSize}px` }}
                              className="font-bold text-slate-800 select-text whitespace-nowrap shrink-0"
                            >
                              الواصل
                            </span>

                            {/* كتابة تفاصيل الواصل (اليوم والتاريخ والساعة) */}
                            {(() => {
                              const autoDate = sec.separator.paidDate || getCurrentDateFormatted();
                              const autoDay = sec.separator.paidDay || getArabicDayName(autoDate);
                              const autoTime = sec.separator.paidTime || getCurrentTimeFormatted();

                              return (
                                <span
                                  id={`paid-text-${sec.separator.id}`}
                                  style={{ fontSize: `${fontSize}px` }}
                                  onClick={(e) => {
                                    if (sheetMode === "edit") {
                                      e.stopPropagation();
                                      openSeparatorInfoModal(sec.separator!);
                                    }
                                  }}
                                  className={`font-medium text-slate-700 select-text whitespace-nowrap shrink-0 ${
                                    sheetMode === "edit"
                                      ? "cursor-pointer hover:text-amber-900 hover:underline"
                                      : ""
                                  }`}
                                  title={
                                    sheetMode === "edit"
                                      ? "انقر لتعديل وقت وتاريخ الواصل"
                                      : undefined
                                  }
                                >
                                  ( يوم {autoDay} بتاريخ <span dir="ltr" className="font-mono">{autoDate}</span>{autoTime ? ` — الساعة ${autoTime}` : ""} )
                                </span>
                              );
                            })()}
                          </div>

                          {/* Quick controls for this separator in Edit Mode */}
                          {sheetMode === "edit" && (
                            <div className="flex items-center gap-1 no-print">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveRowUp(sec.separator!.id);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-700 hover:bg-white/80 rounded"
                                title="نقل الفاصلة خطوة للأعلى"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveRowDown(sec.separator!.id);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-700 hover:bg-white/80 rounded"
                                title="نقل الفاصلة خطوة للأسفل"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRow(sec.separator!.id);
                                }}
                                className="text-[11px] text-rose-600 hover:text-rose-800 p-1 hover:bg-white/80 rounded flex items-center gap-1"
                                title="حذف هذه الفاصلة ودمج الكشف"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span className="text-[10px]">حذف الفاصلة</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ━━━━━━━━━ Line 2: Refined clean divider ━━━━━━━━━ */}
                      <div className="w-full h-[1.5px] bg-slate-700/80 rounded-full my-1.5"></div>

                      {/* المتبقي (Remaining) */}
                      <div className="grid grid-cols-12 vertical-ledger-grid items-center py-1.5 px-1 bg-black/5 rounded-md border border-slate-300/40">
                        <div className="col-span-1"></div>
                        <div
                          style={{ fontSize: `${fontSize + 2}px` }}
                          className="col-span-3 text-center font-mono font-black text-slate-950"
                        >
                          {sec.remaining.toLocaleString()}
                        </div>
                        <div
                          style={{ fontSize: `${fontSize + 1}px` }}
                          className="col-span-8 pr-1 font-black text-slate-950 flex items-center gap-2"
                        >
                          <span>المتبقي</span>
                          {sec.remaining === 0 ? (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                              مسدد بالكامل ✓
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full font-sans">
                              مطلوب بذمة الزبون
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        </div>

        {/* BOTTOM FOOTER OF THE A4 SHEET (Clean, Authentic Ledger Page Footer) */}
        <div className="pt-4 mt-6 border-t-2 border-amber-900/20 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2 select-none">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">محلات العاشق للكهربائيات</span>
            <span className="text-slate-400">|</span>
            <span>تجهيز المواد والشبكات الكهربائية</span>
            {settings.companyPhone && (
              <>
                <span className="text-slate-400">|</span>
                <span dir="ltr" className="font-mono font-bold text-slate-700">{settings.companyPhone}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 font-bold">
            {!isLastPage ? (
              <div className="text-amber-800 bg-amber-100/90 px-2.5 py-0.5 rounded-md border border-amber-300 flex items-center gap-1">
                <span>يتبع باقي الديون في الصفحة رقم {pageData.pageNum + 1}</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </div>
            ) : (
              <div className="text-emerald-900 bg-emerald-100/90 px-2.5 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1">
                <span>✓ نهاية كشف الحساب — صافي المتبقي:</span>
                <span className="font-mono font-black">{overallRemaining.toLocaleString()} {settings.currency}</span>
              </div>
            )}

            <div className="bg-amber-950/10 text-amber-950 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
              صفحة {pageData.pageNum} / {pageCount}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const customerLogs = (changeLogs || []).filter((l) => l.customerId === customer.id && l.invoiceId === invoice.id);

  useEffect(() => {
    const openHistory = () => setActiveViewTab("changelog");
    const printSheet = () => { void handlePrint(); };
    const exportSheetPDF = () => { void handleExportPDF(); };
    window.addEventListener("vertical-ledger-open-history", openHistory);
    window.addEventListener("vertical-ledger-print", printSheet);
    window.addEventListener("vertical-ledger-export-pdf", exportSheetPDF);
    return () => {
      window.removeEventListener("vertical-ledger-open-history", openHistory);
      window.removeEventListener("vertical-ledger-print", printSheet);
      window.removeEventListener("vertical-ledger-export-pdf", exportSheetPDF);
    };
  }, [handlePrint, handleExportPDF]);

  return (
    <div className="space-y-4 select-none">
      {/* شريط وضع الورقة: عرض أو تعديل مع حفظ/إلغاء التغييرات */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white/95 rounded-2xl border border-slate-200/90 shadow-2xs no-print" dir="rtl">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            id="ledger-mode-view"
            onClick={() => {
              if (hasUnsavedChanges || pendingChangeLogs.length > 0) {
                setSaveStatus("لديك تغييرات غير محفوظة؛ اختر حفظ التغييرات أو إلغاء.");
                return;
              }
              setSheetMode("view");
            }}
            aria-pressed={sheetMode === "view"}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
              sheetMode === "view" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Eye className="h-4 w-4" /> عرض
          </button>
          <button
            type="button"
            id="ledger-mode-edit"
            onClick={() => setSheetMode("edit")}
            aria-pressed={sheetMode === "edit"}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
              sheetMode === "edit" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Pencil className="h-4 w-4" /> تعديل
          </button>
        </div>
        {sheetMode === "edit" && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" id="ledger-undo" disabled={!canUndo} onClick={() => restoreEdit(-1)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40" title="التراجع عن التعديل السابق"><Undo2 className="h-4 w-4" />تراجع</button>
            <button type="button" id="ledger-redo" disabled={!canRedo} onClick={() => restoreEdit(1)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40" title="إعادة التعديل الذي تم التراجع عنه"><Redo2 className="h-4 w-4" />إعادة</button>
            <button
              type="button"
              id="ledger-save-changes"
              onClick={() => { void handleConfirmSave(); }}
              disabled={!hasUnsavedChanges && pendingChangeLogs.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> حفظ التغييرات
            </button>
            <button
              type="button"
              id="ledger-cancel-changes"
              onClick={handleCancelChanges}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
            >
              <X className="h-4 w-4" /> إلغاء
            </button>
          </div>
        )}
      </div>

      {detailRowId && (() => {
        const detailRow = items.find(item => item.id === detailRowId);
        if (!detailRow) return null;
        return (
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/60 p-3 no-print" dir="rtl">
            <div role="dialog" aria-modal="true" aria-label={detailIsPayment ? "تفاصيل المجموع والتسديد" : "تفاصيل صف الدين"} className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b bg-amber-50 p-4"><h3 className="font-black">{detailIsPayment ? "تفاصيل المجموع والتسديد" : "تفاصيل صف الدين"}</h3><button type="button" onClick={() => setDetailRowId(null)} aria-label="إغلاق"><X className="h-5 w-5"/></button></div>
              <div className="space-y-4 overflow-y-auto p-4">
                <p className="text-sm">{detailRow.details}</p>
                <div><label className="mb-2 block rounded-lg bg-amber-100/70 px-3 py-2 text-sm font-extrabold text-amber-950">الطابع الزمني</label><p className="rounded-lg bg-slate-50 p-2 text-sm">{detailRow.createdAt ? (() => { const date = new Date(detailRow.createdAt); if (Number.isNaN(date.getTime())) return "تاريخ غير صالح"; const weekday = new Intl.DateTimeFormat("ar-IQ", { weekday: "long", timeZone: "Asia/Baghdad" }).format(date); const day = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Baghdad" }).format(date).replace(/-/g, "/"); const time = new Intl.DateTimeFormat("ar-IQ", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Baghdad" }).format(date); return weekday + " — " + day + " — " + time; })() : "غير مسجل لهذا الصف القديم"}</p></div>
                <div><label className="mb-2 block rounded-lg bg-amber-100/70 px-3 py-2 text-sm font-extrabold text-amber-950">{detailIsPayment ? "اسم المستلم" : "اسم البائع"}</label>{sheetMode === "edit" ? <input className="w-full rounded-lg border p-2" value={detailSeller} onChange={e => setDetailSeller(e.target.value)} /> : <p className="rounded-lg bg-slate-50 p-2">{detailSeller || "ــــ"}</p>}</div>
                <div><label className="mb-2 block rounded-lg bg-amber-100/70 px-3 py-2 text-sm font-extrabold text-amber-950">الملاحظات</label>{sheetMode === "edit" ? <textarea className="min-h-24 w-full rounded-lg border p-2" value={detailNotes} onChange={e => setDetailNotes(e.target.value)} /> : <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2">{detailNotes || "ــــ"}</p>}</div>
                <div><label className="mb-2 block rounded-lg bg-amber-100/70 px-3 py-2 text-sm font-extrabold text-amber-950">الصور</label>
                  {(() => {
                    const photos = detailFiles.filter(file => !file.name.toLowerCase().endsWith(".pdf") && !file.url.toLowerCase().includes(".pdf"));
                    const current = Math.min(photoIndex, Math.max(0, photos.length - 1));
                    const photo = photos[current];
                    const navigate = (delta: number) => setPhotoIndex(index => (index + delta + photos.length) % photos.length);
                    if (!photo) return <p className="rounded-lg border p-4 text-center text-xs text-slate-500">لا توجد صور مرفقة</p>;
                    return <div className="relative mx-auto aspect-square w-full max-w-80 overflow-hidden rounded-xl border bg-slate-100">
                      <div className="absolute inset-0 flex items-center justify-center"
                        onTouchStart={e => { photoTouchX.current = e.touches[0]?.clientX ?? null; }}
                        onTouchEnd={e => {
                          if (photoTouchX.current === null || photos.length < 2) return;
                          const difference = e.changedTouches[0].clientX - photoTouchX.current;
                          photoTouchX.current = null;
                          if (Math.abs(difference) > 45) navigate(difference < 0 ? 1 : -1);
                        }}>
                        <button type="button" aria-label="تكبير الصورة" onClick={() => setExpandedPhoto(photo)} className="flex h-full w-full items-center justify-center overflow-hidden"><img src={photo.url} alt={photo.name} draggable={false} className="h-full w-full select-none object-contain" /></button>
                        {photos.length > 1 && <>
                          <button type="button" aria-label="السابق" onClick={() => navigate(-1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 shadow">❯</button>
                          <button type="button" aria-label="التالي" onClick={() => navigate(1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 shadow">❮</button>
                        </>}
                        {sheetMode === "edit" && <button type="button" aria-label="حذف الصورة الحالية" onClick={() => { setDetailFiles(files => files.filter(file => file !== photo)); setPhotoIndex(0); }} className="absolute left-2 top-2 rounded-full bg-white/90 p-2 text-rose-600 shadow"><Trash2 className="h-4 w-4"/></button>}
                      </div>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-center text-xs text-white" dir="ltr">{current + 1} / {photos.length}</div>
                    </div>;
                  })()}
                  {sheetMode === "edit" && <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold"><ImagePlus className="h-4 w-4"/>{detailUploading ? "جاري رفع الصورة..." : "إضافة صور"}<input type="file" accept="image/*" multiple className="hidden" disabled={detailUploading} onChange={e => { const files: File[] = Array.from(e.currentTarget.files ?? []); void (async () => { for (const file of files) await attachRowFile(file); })(); e.target.value = ""; }}/></label>}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t p-3"><button type="button" className="rounded-lg border px-4 py-2" onClick={() => setDetailRowId(null)}>إغلاق</button>{sheetMode === "edit" && <button type="button" disabled={detailUploading} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white" onClick={saveRowDetails}>اعتماد التفاصيل</button>}</div>
            </div>
          </div>
        );
      })()}
      {expandedPhoto && <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/90 p-3 no-print" role="dialog" aria-modal="true" aria-label="عرض الصورة بالحجم الكامل" onClick={() => setExpandedPhoto(null)}>
        <button type="button" aria-label="إغلاق الصورة" onClick={() => setExpandedPhoto(null)} className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-slate-900"><X className="h-6 w-6"/></button>
        <img src={expandedPhoto.url} alt={expandedPhoto.name} onClick={event => event.stopPropagation()} className="max-h-[94dvh] max-w-full object-contain" />
      </div>}
      {activeViewTab === "changelog" ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 no-print" dir="rtl" onClick={(event) => { if (event.target === event.currentTarget) setActiveViewTab("sheet"); }}>
          <div role="dialog" aria-modal="true" aria-label="سجل تغييرات السجل العمودي" className="flex h-[96dvh] max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b bg-amber-50 p-3 sm:p-4">
              <div className="flex items-center gap-2"><History className="h-5 w-5 text-amber-700"/><div><h3 className="font-black text-slate-900">سجل تغييرات السجل العمودي</h3><p className="text-xs text-slate-600">حساب الزبون: {customer.name}</p></div></div>
              <button type="button" onClick={() => setActiveViewTab("sheet")} className="rounded-lg border bg-white p-2 text-slate-600" aria-label="إغلاق سجل التغييرات"><X className="h-4 w-4"/></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-4">
              <CustomerChangeLogTable
                customerId={customer.id}
                customerName={customer.name}
                invoiceId={invoice.id}
                changeLogs={changeLogs}
                currency={settings.currency}
                onDeleteLog={onDeleteChangeLog}
                onClearCustomerLogs={onClearCustomerChangeLogs}
                onRevertAction={onRevertChangeLog}
                isCloudSyncing={isCloudSyncing}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* أدوات السجل مرتبة ضمن تبويبات قصيرة، وحالتها مستقلة عن القائمة الحسابية */}
          <div className="bg-white/95 backdrop-blur-xs p-2 rounded-xl border border-slate-200/90 shadow-sm no-print space-y-2">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="أدوات سجل الحساب العمودي">
              {sheetMode === "edit" && <>
              <button type="button" role="tab" aria-selected={toolbarTab === "font"} onClick={() => setToolbarTab("font")} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "font" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"}`}><Type className="inline h-3.5 w-3.5 me-1"/>تنسيق الخط</button>
              <button type="button" role="tab" aria-selected={toolbarTab === "add"} onClick={() => !rowSelectionMode && setToolbarTab("add")} disabled={rowSelectionMode} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "add" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"}`}><Plus className="inline h-3.5 w-3.5 me-1"/>إضافة</button>
              <button type="button" role="tab" aria-selected={toolbarTab === "delete"} onClick={() => !rowSelectionMode && setToolbarTab("delete")} disabled={rowSelectionMode} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "delete" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"}`}><Trash2 className="inline h-3.5 w-3.5 me-1"/>حذف</button>
              <button type="button" role="tab" aria-selected={toolbarTab === "move"} onClick={() => !rowSelectionMode && setToolbarTab("move")} disabled={rowSelectionMode} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "move" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"}`}><ArrowUp className="inline h-3.5 w-3.5 me-1"/>نقل</button>
              <button type="button" role="tab" aria-selected={toolbarTab === "page"} onClick={() => !rowSelectionMode && setToolbarTab("page")} disabled={rowSelectionMode} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "page" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"}`}><Palette className="inline h-3.5 w-3.5 me-1"/>لون الصفحة</button>
              <button type="button" role="tab" aria-selected={toolbarTab === "favorites"} onClick={() => !rowSelectionMode && setToolbarTab("favorites")} disabled={rowSelectionMode} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "favorites" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-700 border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"}`}><Zap className="inline h-3.5 w-3.5 me-1"/>المفضلة</button>
              </>}

            </div>
            {sheetMode === "edit" && toolbarTab === "font" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              <label className="flex items-center gap-2 text-[11px] font-bold">حجم الخط <input type="range" min={10} max={22} value={fontSize} onChange={(e) => { const value = Number(e.target.value); setFontSize(value); applyLedgerRowFormat({ rowFontSize: value }); }} className="w-24 accent-blue-600"/><span className="min-w-6 text-blue-700">{fontSize}</span></label>
              <label className="flex items-center gap-1 text-[11px] font-bold">لون الخط <input type="color" value={ledgerFontColor} onChange={(e) => { const value = e.target.value; setLedgerFontColor(value); applyLedgerRowFormat({ rowFontColor: value }); }} className="h-7 w-8 cursor-pointer rounded border bg-white p-0.5"/></label>
              <button type="button" onClick={() => { const value = !ledgerFontBold; setLedgerFontBold(value); applyLedgerRowFormat({ rowFontBold: value }); }} aria-pressed={ledgerFontBold} className={`rounded-lg border px-3 py-1.5 text-xs font-black ${ledgerFontBold ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-slate-200"}`}>غامق B</button>
              <button type="button" onClick={() => { const value = !ledgerFontItalic; setLedgerFontItalic(value); applyLedgerRowFormat({ rowFontItalic: value }); }} aria-pressed={ledgerFontItalic} className={`rounded-lg border px-3 py-1.5 text-xs italic ${ledgerFontItalic ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-slate-200"}`}>مائل I</button>
              <button type="button" onClick={() => { const value = !ledgerFontUnderline; setLedgerFontUnderline(value); applyLedgerRowFormat({ rowFontUnderline: value }); }} aria-pressed={ledgerFontUnderline} className={`rounded-lg border px-3 py-1.5 text-xs underline ${ledgerFontUnderline ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-slate-200"}`}>تسطير U</button>
              <button type="button" onClick={() => { const value = !ledgerFontStrike; setLedgerFontStrike(value); applyLedgerRowFormat({ rowFontStrike: value }); }} aria-pressed={ledgerFontStrike} className={`rounded-lg border px-3 py-1.5 text-xs line-through ${ledgerFontStrike ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-slate-200"}`}>شطب النص</button>
              <label className="flex items-center gap-1 text-[11px] font-bold">تلوين الصف <input type="color" defaultValue="#fff2b3" onChange={(e) => applyLedgerRowFormat({ rowBackgroundColor: e.target.value })} className="h-7 w-8 cursor-pointer rounded border bg-white p-0.5" aria-label="لون خلفية الصف"/></label>
            </div>}
            {sheetMode === "edit" && rowSelectionMode && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-2 py-1.5 no-print text-xs font-bold" role="status">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={exitRowSelectionMode} aria-label="إنهاء تحديد الصفوف" title="إنهاء التحديد" className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-white"><X className="h-4 w-4"/></button>
                  <button type="button" onClick={() => setSelectedRowIds(items.filter((it) => !it.isSeparator && !it.isPaymentRow && !it.isRemainingRow).map((it) => it.id))} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-blue-800">تحديد الكل</button>
                </div>
                <span className="whitespace-nowrap text-blue-800">تم تحديد {selectedRowIds.length} عنصر</span>
              </div>
            )}

                        {sheetMode === "edit" && toolbarTab === "add" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              <button type="button" onClick={() => handleInsertRowAbove()} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"><Plus className="inline h-3.5 w-3.5 me-1"/>إضافة صف أعلاه</button>
              <button type="button" onClick={() => handleInsertRowBelow()} className="rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white"><Plus className="inline h-3.5 w-3.5 me-1"/>إضافة صف أدناه</button>
              <button type="button" onClick={openLedgerProductCart} className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white"><ShoppingCart className="inline h-3.5 w-3.5 me-1"/>عربة التسوق</button>
              <button type="button" id="btn-insert-separator" onClick={() => handleInsertSeparator()} title="إضافة تسديد (المجموع / الواصل / المتبقي)" className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white"><HandCoins className="inline h-3.5 w-3.5 me-1"/>إضافة تسديد</button>
            </div>}
            {sheetMode === "edit" && toolbarTab === "delete" && sheetMode === "edit" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              {selectedItem && <button type="button" onClick={() => handleDeleteRow()} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700"><Eraser className="inline h-3.5 w-3.5 me-1"/>حذف الصف</button>}
              <button type="button" onClick={handleClearAllItems} disabled={items.length === 0} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 disabled:opacity-40"><Eraser className="inline h-3.5 w-3.5 me-1"/>تفريغ السجل</button>
            </div>}
            {sheetMode === "edit" && toolbarTab === "move" && sheetMode === "edit" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><button type="button" onClick={() => handleMoveRowUp()} disabled={selectedIndex <= 0} className="rounded-lg border bg-white px-3 py-2 text-[11px] font-bold disabled:opacity-40"><ArrowUp className="inline h-3.5 w-3.5 me-1"/>نقل للأعلى</button><button type="button" onClick={() => handleMoveRowDown()} disabled={selectedIndex === -1 || selectedIndex >= items.length - 1} className="rounded-lg border bg-white px-3 py-2 text-[11px] font-bold disabled:opacity-40"><ArrowDown className="inline h-3.5 w-3.5 me-1"/>نقل للأسفل</button></div>}
            {sheetMode === "edit" && toolbarTab === "favorites" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">{ledgerToolbarFavorites.map(key => <button key={key} type="button" onClick={() => { if (key === "bold") setLedgerFontBold(x => !x); else if (key === "italic") setLedgerFontItalic(x => !x); else if (key === "underline") setLedgerFontUnderline(x => !x); else if (key === "strike") setLedgerFontStrike(x => !x); else if (key === "addAbove") handleInsertRowAbove(); else if (key === "addBelow") handleInsertRowBelow(); else if (key === "deleteRow") handleDeleteRow(); else if (key === "clear") handleClearAllItems(); else if (key === "moveUp") handleMoveRowUp(); else if (key === "moveDown") handleMoveRowDown(); else if (key === "cart") openLedgerProductCart(); else if (key === "page") setToolbarTab("page"); }} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-[11px] font-bold text-blue-700">{({bold:<Type className="inline h-3.5 w-3.5 me-1"/>,addAbove:<ArrowUpToLine className="inline h-3.5 w-3.5 me-1"/>,addBelow:<Plus className="inline h-3.5 w-3.5 me-1"/>,moveUp:<ArrowUp className="inline h-3.5 w-3.5 me-1"/>,italic:<Type className="inline h-3.5 w-3.5 me-1 italic"/>,underline:<Type className="inline h-3.5 w-3.5 me-1 underline"/>,strike:<Type className="inline h-3.5 w-3.5 me-1 line-through"/>,cart:<ShoppingCart className="inline h-3.5 w-3.5 me-1"/>,deleteRow:<Trash2 className="inline h-3.5 w-3.5 me-1"/>,clear:<Eraser className="inline h-3.5 w-3.5 me-1"/>,moveDown:<ArrowDown className="inline h-3.5 w-3.5 me-1"/>,page:<Palette className="inline h-3.5 w-3.5 me-1"/>} as Record<string, React.ReactNode>)[key]} <span>{({bold:"غامق",addAbove:"إضافة صف أعلى",addBelow:"إضافة صف",moveUp:"نقل للأعلى",italic:"مائل",underline:"تسطير",strike:"شطب",cart:"عربة التسوق",deleteRow:"حذف الصف",clear:"تفريغ السجل",moveDown:"نقل للأسفل",page:"لون الصفحة"} as Record<string,string>)[key]}</span></button>)}<button type="button" onClick={() => { setLedgerFavoritesDraft([...ledgerToolbarFavorites]); setShowLedgerFavoritesEditor(true); }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800"><Pencil className="inline h-3.5 w-3.5 me-1"/>تعديل</button></div>}{showLedgerFavoritesEditor && createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-3" role="dialog" aria-modal="true" aria-label="تعديل الأدوات المفضلة"><div className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-2xl" dir="rtl"><div className="border-b p-3"><h3 className="text-sm font-bold text-slate-800">تعديل الأدوات المفضلة</h3><p className="mt-1 text-[11px] text-slate-500">ضع علامة ✓ لإظهار الأداة، وأزلها لإخفائها.</p></div><div className="min-h-0 space-y-3 overflow-y-auto p-3 sm:p-4">{[[ "تنسيق الخط", [["bold","غامق"],["italic","مائل"],["underline","تسطير"],["strike","شطب النص"]] ],[ "إضافة", [["addAbove","إضافة صف أعلى"],["addBelow","إضافة صف أسفل"],["cart","عربة التسوق"]] ],[ "حذف", [["deleteRow","حذف الصف"],["clear","تفريغ السجل"]] ],[ "نقل", [["moveUp","نقل للأعلى"],["moveDown","نقل للأسفل"]] ],[ "لون الصفحة", [["page","لون الصفحة"]] ]].map(([category,tools]) => <section key={category as string}><h4 className="mb-1.5 border-b pb-1 text-xs font-bold text-slate-700">{category as string}</h4><div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{(tools as string[][]).map(([key,label]) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={ledgerFavoritesDraft.includes(key)} onChange={() => setLedgerFavoritesDraft(old => old.includes(key) ? old.filter(item => item !== key) : [...old,key])}/><span>{label}</span></label>)}</div></section>)}</div><div className="flex justify-end gap-2 border-t bg-slate-50 p-2.5"><button type="button" onClick={() => setShowLedgerFavoritesEditor(false)} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-600">إلغاء</button><button type="button" onClick={() => { setLedgerToolbarFavorites(ledgerFavoritesDraft); setShowLedgerFavoritesEditor(false); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">حفظ</button></div></div></div>, document.body)}{sheetMode === "edit" && toolbarTab === "page" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              <label className="flex items-center gap-2 text-[11px] font-bold">لون الصفحة <input type="color" value={sheetBgColor} onChange={(e) => handleSelectBgColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-white p-0.5"/></label>
              <div className="flex flex-wrap gap-1.5">{BG_COLOR_PRESETS.slice(0,8).map((preset) => <button key={preset.id} type="button" title={preset.name} aria-label={preset.name} onClick={() => handleSelectBgColor(preset.color)} className="h-7 w-7 rounded-lg border border-black/10" style={{backgroundColor:preset.color}}/>)}</div>
            </div>}
            {saveStatus && <div className="text-[10px] font-bold text-emerald-700">{saveStatus}</div>}
          </div>
      {/* 2. THE MAIN PAPER LEDGER SHEET CONTAINER (EXACT A4 PROPORTIONS & PAGES) */}
      <div id="vertical-ledger-sheet" className="space-y-6">
        {viewAllPages ? (
          // View All Pages sequentially
          pagesData.map((pageData, index) => (
            <React.Fragment key={`page-wrap-${pageData.pageNum}`}>
              {index > 0 && (
                <div className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-amber-800/60 no-print select-none">
                  <div className="h-px bg-amber-900/20 flex-1 max-w-xs"></div>
                  <span className="bg-amber-100 text-amber-900 px-3 py-0.5 rounded-full border border-amber-300 text-[10px]">
                    فاصل صفحة A4 — بداية صفحة رقم {pageData.pageNum}
                  </span>
                  <div className="h-px bg-amber-900/20 flex-1 max-w-xs"></div>
                </div>
              )}
              {renderA4Page(pageData)}
            </React.Fragment>
          ))
        ) : (
          // View Single Selected Page
          pagesData
            .filter((p) => p.pageNum === currentPage)
            .map((pageData) => renderA4Page(pageData))
        )}
      </div>

      {/* 2.5 Quick Change Log Preview Box directly below the Ledger Paper */}
      <div className="mt-6 no-print bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-3.5 sm:p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                سجل التغييرات — حركات الحساب الأخيرة
              </h3>
              <p className="text-[11px] text-slate-500">
                توثيق فوري لعمليات إضافة وحذف الدين والواصل بالوقت والتاريخ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveViewTab("changelog")}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>عرض السجل كاملاً ({customerLogs.length})</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3.5 sm:p-4">
          {customerLogs.length === 0 ? (
            <div className="text-center py-5 text-xs text-slate-400">
              لا توجد حركات مسجلة بعد لهذا الزبون. أي عملية إضافة أو حذف دين ستسجل هنا تلقائياً.
            </div>
          ) : (
            <div className="space-y-2">
              {customerLogs.slice(0, 3).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50/60 hover:bg-slate-50 rounded-xl border border-slate-100 text-xs transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        log.actionType === "إضافة دين"
                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                          : log.actionType === "حذف دين"
                          ? "bg-slate-200 text-slate-700 border border-slate-300"
                          : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      }`}
                    >
                      {log.actionType}
                    </span>
                    <span className="font-bold text-slate-800">{log.details}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                    {log.formattedDateTime}
                  </div>
                </div>
              ))}
              {customerLogs.length > 3 && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveViewTab("changelog")}
                    className="text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
                  >
                    + عرض بقية العمليات السابقة ({customerLogs.length - 3} حركات أخرى)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )}

      {/* 3. DIALOG / MODAL: لوحة معلومات ثابتة للتاريخ واليوم والساعة فقط */}
      {activeSeparatorForModal && (
        <div
          id="paid-info-dialog-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print"
          onClick={() => setActiveSeparatorForModal(null)}
        >
          <div
            id="paid-info-dialog"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Dialog Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">لوحة معلومات التوقيت</h3>
                  <p className="text-[11px] text-slate-300">سجل توقيت سداد الواصل</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSeparatorForModal(null)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Dialog Body */}
            <div className="p-5 space-y-3">
              {/* بطاقة اليوم */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 text-slate-600 text-xs font-bold">
                  <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>اليوم:</span>
                </div>
                <span className="text-sm font-bold text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  {activeSeparatorForModal.paidDay ||
                    getArabicDayName(activeSeparatorForModal.paidDate || getCurrentDateFormatted())}
                </span>
              </div>

              {/* بطاقة التاريخ */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 text-slate-600 text-xs font-bold">
                  <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>التاريخ:</span>
                </div>
                <span className="text-sm font-bold font-mono text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  {activeSeparatorForModal.paidDate || getCurrentDateFormatted()}
                </span>
              </div>

              {/* بطاقة الساعة والوقت */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 text-slate-600 text-xs font-bold">
                  <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>الساعة:</span>
                </div>
                <span className="text-sm font-bold font-mono text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  {activeSeparatorForModal.paidTime || getCurrentTimeFormatted()}
                </span>
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveSeparatorForModal(null)}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer text-center"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

