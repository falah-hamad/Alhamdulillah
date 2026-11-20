Warning: truncated output (original token count: 124380)
Total output lines: 7066

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ShoppingCart,
  Minus,
  Package,
  Search,
  PlusCircle,
  FileText,
  DollarSign,
  Printer,
  Trash2,
  Calendar,
  Phone,
  MapPin,
  ChevronLeft,
  ChevronRight,
  User,
  Plus,
  X,
  Edit,
  Pencil,
  Eye,
  ArrowLeft,
  ArrowRight,
  Home,
  Download,
  LayoutGrid,
  List,
  Folder,
  FolderOpen,
  FolderArchive,
  Sparkles,
  Share2,
  Copy,
  FolderPlus,
  UserPlus,
  MoreVertical,
  Check,
  MoveRight,
  ChevronDown,
  Loader2,
  GripVertical,
  Layers,
  Volume2,
  VolumeX,
  BookMarked,
  Calculator,
  ArrowUp,
  ArrowDown,
  Hash,
  ListOrdered,
  MoveUp,
  MoveDown,
  FolderTree,
  Eraser,
  ClipboardList,
  Type,
  Palette,
  History,
  ScanBarcode,
  ContactRound,
  Pin,
  Star,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Customer, Product, Invoice, Payment, InvoiceItem, SystemSettings, CustomerFolder, CustomerChangeLogItem, AccountingSheetRow, AccountingSheet, AccountingSheetCategory } from "../types";
import { printElement, exportElementToPDF } from "../utils/printUtils";
import {
  calculateCumulativeSeparators,
  getArabicDayName,
  getCurrentDateFormatted,
  getCurrentTimeFormatted,
  getTotalPaidFromItems,
  formatInvoiceAccountingText,
} from "../utils/separatorUtils";
import CustomerProfileModal from "./CustomerProfileModal";
import VerticalLedgerSheet from "./VerticalLedgerSheet";
import CustomerChangeLogTable from "./CustomerChangeLogTable";
import DeleteConfirmModal from "./DeleteConfirmModal";
import HierarchicalFolderNav from "./HierarchicalFolderNav";
import FileManagerView from "./FileManagerView";
import BarcodeScannerModal from "./BarcodeScannerModal";
import { auth, db } from "../lib/firebase";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { dispatchPaidAmountNotification } from "../lib/notifications";
import { getCustomerLedgerTotals } from "../lib/debtLedgerSources";
import FormattedNumberInput from "./FormattedNumberInput";
import { formatThousands } from "../utils/numberFormatting";
import { flattenAccountingSheets, getCustomerAccountingCategories, getCustomerAccountingSheets } from "../lib/accountingSheets";

type ProductCartSavedRecord = {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  ledgerMode: "accounting" | "vertical";
  createdAt: number;
  updatedAt: number;
  quantities: Record<string, number>;
  unitPrices: Record<string, number>;
  totals: Record<string, number>;
  unitDiscounts: Record<string, number>;
  discountTotals: Record<string, number>;
  productSnapshots: Record<string, Product>;
  insertionCount: number;
  lastInsertedAt?: number;
};
type ProductCartCategoryNode = { id: string; path: string; parentPath: string; name: string; order: number };
type ProductCartInsertContext = { mode: "accounting"; rowIndex: number; rowId?: string; customerId?: string } | { mode: "vertical"; rowId: string; invoiceId: string; customerId?: string; insertItems: (cartItems: InvoiceItem[]) => boolean };
type AccountingManagerDialog = { kind: "createCategory" | "renameCategory" | "deleteCategory" | "createSheet" | "renameSheet" | "moveSheet" | "deleteSheet"; value: string; targetCategoryId: string };

function AccountPickerDropdown({ anchor, label, onClose, children }: {
  anchor: HTMLButtonElement | null;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [position, setPosition] = useState<React.CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!anchor) { closeRef.current(); return; }
    const viewport = window.visualViewport;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const left = viewport?.offsetLeft || 0;
      const top = viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height || window.innerHeight);
      const right = left + (viewport?.width || window.innerWidth);
      const width = Math.min(rect.width, right - left - 16);
      setPosition({ top: rect.bottom + 6, left: Math.max(left + 8, Math.min(rect.left, right - width - 8)), width, maxHeight: Math.max(0, Math.min(480, bottom - rect.bottom - 14)) });
    };
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) closeRef.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); anchor.focus({ preventScroll: true }); }
    };
    place();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, [anchor]);
  return createPortal(
    <div ref={menuRef} role="region" aria-label={label} dir="rtl" style={position}
      className="fixed z-[190] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl no-print">
      {children}
    </div>, document.body
  );
}

interface LedgerViewProps {
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
  addInvoice: (invoice: Omit<Invoice, "id" | "createdAt">) => Invoice;
  updateInvoice: (invoice: Invoice) => Promise<void> | void;
  addPayment: (payment: Omit<Payment, "id" | "createdAt">) => Payment;
  deleteInvoice: (id: string) => void;
  onOpenNewCustomerModal: () => void;
  addCustomer?: (customer: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer?: (customer: Customer) => Promise<void> | void;
  deleteCustomer?: (id: string) => void;
  restoreCustomer?: (id: string) => void;
  permanentDeleteCustomer?: (id: string) => void;
  folders?: CustomerFolder[];
  addFolder?: (folder: Omit<CustomerFolder, "id" | "createdAt"> | CustomerFolder) => CustomerFolder | void;
  updateFolder?: (folder: CustomerFolder) => void;
  deleteFolder?: (folderId: string) => void;
  restoreFolder?: (folderId: string) => void;
  permanentDeleteFolder?: (folderId: string) => void;
  onMoveItems?: (folderIds: string[], customerIds: string[], targetFolderId: string | null) => void;
  onBulkDelete?: (folderIds: string[], customerIds: string[]) => void;
  onBulkRestore?: (folderIds: string[], customerIds: string[]) => void;
  onBulkPermanentDelete?: (folderIds: string[], customerIds: string[]) => void;
  onEmptyTrash?: () => void;
  onRestoreAllTrash?: () => void;
  selectedCustomerId?: string | null;
  setSelectedCustomerId?: (id: string | null) => void;
  selectedInvoiceId?: string | null;
  setSelectedInvoiceId?: (id: string | null) => void;
  onReturnToCustomerDataTable?: () => void;
  changeLogs?: CustomerChangeLogItem[];
  isCloudSyncing?: boolean;
  addChangeLog?: (item: Omit<CustomerChangeLogItem, "id" | "timestamp" | "formattedDateTime"> & { id?: string; timestamp?: string; formattedDateTime?: string }) => Promise<CustomerChangeLogItem>;
  deleteChangeLog?: (id: string) => Promise<void>;
  clearCustomerChangeLogs?: (customerId: string, invoiceId?: string) => Promise<void>;
  revertChangeLogAction?: (logItem: CustomerChangeLogItem) => Promise<void>;
  returnToListLabel?: string;
  accountEntityLabel?: string;
  supplierAccountingLists?: boolean;
}

export default function LedgerView({
  customers,
  products,
  invoices,
  payments,
  settings,
  addInvoice,
  updateInvoice,
  addPayment,
  deleteInvoice,
  onOpenNewCustomerModal,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  permanentDeleteCustomer,
  folders: propFolders,
  addFolder: propAddFolder,
  updateFolder: propUpdateFolder,
  deleteFolder: propDeleteFolder,
  restoreFolder: propRestoreFolder,
  permanentDeleteFolder: propPermanentDeleteFolder,
  onMoveItems: propOnMoveItems,
  onBulkDelete: propOnBulkDelete,
  onBulkRestore: propOnBulkRestore,
  onBulkPermanentDelete: propOnBulkPermanentDelete,
  onEmptyTrash: propOnEmptyTrash,
  onRestoreAllTrash: propOnRestoreAllTrash,
  selectedCustomerId: propSelectedCustomerId,
  setSelectedCustomerId: propSetSelectedCustomerId,
  selectedInvoiceId: propSelectedInvoiceId,
  setSelectedInvoiceId: propSetSelectedInvoiceId,
  onReturnToCustomerDataTable,
  changeLogs = [],
  isCloudSyncing = false,
  addChangeLog,
  deleteChangeLog,
  clearCustomerChangeLogs,
  revertChangeLogAction,
  returnToListLabel = "العودة إلى سجل الديون",
  accountEntityLabel = "الزبون",
  supplierAccountingLists = false,
}: LedgerViewProps) {
  const [profileCustomerId, setProfileCustomerId] = useState<string | null>(null);
  const [localCustomerId, setLocalCustomerId] = useState<string | null>(null);
  const [localInvoiceId, setLocalInvoiceId] = useState<string | null>(null);

  const selectedCustomerId = propSelectedCustomerId !== undefined ? propSelectedCustomerId : localCustomerId;
  const setSelectedCustomerId = propSetSelectedCustomerId !== undefined ? propSetSelectedCustomerId : setLocalCustomerId;

  const selectedInvoiceId = propSelectedInvoiceId !== undefined ? propSelectedInvoiceId : localInvoiceId;
  const setSelectedInvoiceId = propSetSelectedInvoiceId !== undefined ? propSetSelectedInvoiceId : setLocalInvoiceId;

  // Active folder within the Debt Register (سجل الديون)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingInvoice, setIsAddingInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [accountingRowDraft, setAccountingRowDraft] = useState({ details: "", quantity: "1", unit: "قطعة", unitPrice: "" });
  const [accountingDraftRows, setAccountingDraftRows] = useState<AccountingSheetRow[]>([]);
  const [activeAccountingSheetId, setActiveAccountingSheetId] = useState("");
  const [accountingSheetSelectionReady, setAccountingSheetSelectionReady] = useState(false);
  const [activeAccountingCategoryId, setActiveAccountingCategoryId] = useState("");
  const [accountingCategoryMenuOpen, setAccountingCategoryMenuOpen] = useState(false);
  const [accountingSheetMenuOpen, setAccountingSheetMenuOpen] = useState(false);
  const [supplierAccountingManagerOpen, setSupplierAccountingManagerOpen] = useState(false);
  const [supplierAccountingActionMenu, setSupplierAccountingActionMenu] = useState<string | null>(null);
  const [supplierAccountingPicker, setSupplierAccountingPicker] = useState<"category" | "sheet" | null>(null);
  const [expandedSupplierAccountingCategories, setExpandedSupplierAccountingCategories] = useState<string[]>(["__uncategorized__"]);
  const [accountingManagerDialog, setAccountingManagerDialog] = useState<AccountingManagerDialog | null>(null);
  const verticalCategoryButtonRef = useRef<HTMLButtonElement>(null);
  const verticalStatementButtonRef = useRef<HTMLButtonElement>(null);
  const accountingCategoryButtonRef = useRef<HTMLButtonElement>(null);
  const accountingSheetButtonRef = useRef<HTMLButtonElement>(null);
  const [verticalLedgerPicker, setVerticalLedgerPicker] = useState<"category" | "statement" | null>(null);
  const [verticalLedgerManagerOpen, setVerticalLedgerManagerOpen] = useState(false);
  const [verticalCategoryDraft, setVerticalCategoryDraft] = useState("");
  const [verticalCategoryEditingId, setVerticalCategoryEditingId] = useState<string | null>(null);
  const [verticalCategoryFormOpen, setVerticalCategoryFormOpen] = useState(false);
  const [verticalLedgerActionMenu, setVerticalLedgerActionMenu] = useState<string | null>(null);
  const [verticalLedgerExpandedCategories, setVerticalLedgerExpandedCategories] = useState<string[]>(["__uncategorized__"]);
  const [verticalStatementEditingId, setVerticalStatementEditingId] = useState<string | null>(null);
  const [verticalStatementNameDraft, setVerticalStatementNameDraft] = useState("");
  const [verticalDeleteConfirmId, setVerticalDeleteConfirmId] = useState<string | null>(null);
  const [activeVerticalCategoryId, setActiveVerticalCategoryId] = useState("__uncategorized__");
  const legacyCategoryMigrationInFlightRef = useRef(new Set<string>());
  const accountingDraftRowsRef = useRef<AccountingSheetRow[]>(accountingDraftRows);
  accountingDraftRowsRef.current = accountingDraftRows;
  const [accountingRowsDirty, setAccountingRowsDirty] = useState(false);
  const [editingAccountingRowId, setEditingAccountingRowId] = useState<string | null>(null);
  const [accountingSheetMode, setAccountingSheetMode] = useState<"view" | "edit">("view");
  const [accountingFontSize, setAccountingFontSize] = useState(13);
  const [accountingToolbarTab, setAccountingToolbarTab] = useState<"font" | "add" | "delete" | "move" | "page" | "favorites">("font");
  const [accountingFontColor, setAccountingFontColor] = useState("#111827");
  const [accountingFontBold, setAccountingFontBold] = useState(true);
  const [accountingFontItalic, setAccountingFontItalic] = useState(false);
  const [accountingFontUnderline, setAccountingFontUnderline] = useState(false);
  const [accountingFontStrike, setAccountingFontStrike] = useState(false);
  const [accountingRowFontSize, setAccountingRowFontSize] = useState(13);
  const [accountingRowFontColor, setAccountingRowFontColor] = useState("#111827");
  const [accountingRowFontBold, setAccountingRowFontBold] = useState(true);
  const [accountingRowFontItalic, setAccountingRowFontItalic] = useState(false);
  const [accountingRowFontUnderline, setAccountingRowFontUnderline] = useState(false);
  const [accountingRowFontStrike, setAccountingRowFontStrike] = useState(false);
  const [accountingToolbarFavorites, setAccountingToolbarFavorites] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("accounting_sheet_favorites") || '["bold","addBelow","moveUp","italic","underline","strike","cart"]'); } catch { return ["bold","addBelow","moveUp","italic","underline","strike","cart"]; } });
  const [showAccountingFavoritesEditor, setShowAccountingFavoritesEditor] = useState(false);
  const [accountingFavoritesDraft, setAccountingFavoritesDraft] = useState<string[]>([]);
  useEffect(() => { try { localStorage.setItem("accounting_sheet_favorites", JSON.stringify(accountingToolbarFavorites)); } catch {} }, [accountingToolbarFavorites]);
  const [accountingBgColor, setAccountingBgColor] = useState(() => { try { return localStorage.getItem("accounting_sheet_bg_color") || "#ffffff"; } catch { return "#ffffff"; } });
  const [accountingSelectedRow, setAccountingSelectedRow] = useState(0);
  const [accountingCursorSelected, setAccountingCursorSelected] = useState(false);
  const [accountingSelectionMode, setAccountingSelectionMode] = useState(false);
  const [accountingSelectedRowIds, setAccountingSelectedRowIds] = useState<string[]>([]);
  const accountingLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountingLongPressTriggered = useRef(false);
  const startAccountingRowLongPress = (rowId: string) => {
    if (accountingSheetMode !== "edit" || accountingSelectionMode) return;
    if (accountingLongPressTimer.current) clearTimeout(accountingLongPressTimer.current);
    accountingLongPressTriggered.current = false;
    accountingLongPressTimer.current = setTimeout(() => {
      accountingLongPressTriggered.current = true;
      const rowIndex = accountingDraftRows.findIndex((row) => row.id === rowId);
      if (rowIndex >= 0) setAccountingSelectedRow(rowIndex);
      setAccountingSelectionMode(true);
      setAccountingSelectedRowIds([rowId]);
      setAccountingToolbarTab("font");
      accountingLongPressTimer.current = null;
    }, 550);
  };
  const clearAccountingRowLongPress = () => {
    if (accountingLongPressTimer.current) {
      clearTimeout(accountingLongPressTimer.current);
      accountingLongPressTimer.current = null;
    }
  };
  const exitAccountingSelectionMode = () => {
    clearAccountingRowLongPress();
    setAccountingSelectionMode(false);
    setAccountingSelectedRowIds([]);
    accountingLongPressTriggered.current = false;
  };
  const toggleAccountingSelectedRow = (rowId: string) => {
    setAccountingSelectedRowIds((previous) => previous.includes(rowId) ? previous.filter((id) => id !== rowId) : [...previous, rowId]);
  };
  useEffect(() => {
    if (accountingSheetMode !== "edit" && accountingSelectionMode) {
      setAccountingSelectionMode(false);
      setAccountingSelectedRowIds([]);
      clearAccountingRowLongPress();
      accountingLongPressTriggered.current = false;
    }
    return () => clearAccountingRowLongPress();
  }, [accountingSheetMode, accountingSelectionMode]);
  const [isAccountingChangeLogOpen, setIsAccountingChangeLogOpen] = useState(false);
  const [productCartInsertContext, setProductCartInsertContext] = useState<ProductCartInsertContext | null>(null);
  const [isAccountingPrinting, setIsAccountingPrinting] = useState(false);
  const [isAccountingExportingPDF, setIsAccountingExportingPDF] = useState(false);

  // Product cart used to add existing inventory items directly to a customer ledger.
  const [isProductCartOpen, setIsProductCartOpen] = useState(false);
  const [showProductCartScanner, setShowProductCartScanner] = useState(false);
  const [productCartSearch, setProductCartSearch] = useState("");
  const [productCartCategory, setProductCartCategory] = useState("الكل");
  const [productCartCategoryTreeOpen, setProductCartCategoryTreeOpen] = useState(false);
  const [expandedProductCartCategoryPaths, setExpandedProductCartCategoryPaths] = useState<Set<string>>(() => new Set());
  const [productCartCategoryNodes, setProductCartCategoryNodes] = useState<ProductCartCategoryNode[]>(() => {
    try {
      const userId = auth.currentUser?.uid;
      const key = userId ? `acc_u_${userId}_product_categories` : "acc_guest_product_categories";
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(saved) ? saved.filter(node => node && typeof node.path === "string") : [];
    } catch { return []; }
  });
  const [productCartVisibleLimit, setProductCartVisibleLimit] = useState(60);
  const [productCartQuantities, setProductCartQuantities] = useState<Record<string, number>>({});
  const [productCartStage, setProductCartStage] = useState<"select" | "review">("select");
  const [productCartUnitPrices, setProductCartUnitPrices] = useState<Record<string, number>>({});
  const [productCartTotals, setProductCartTotals] = useState<Record<string, number>>({});
  const [productCartUnitDiscounts, setProductCartUnitDiscounts] = useState<Record<string, number>>({});
  const [productCartDiscountTotals, setProductCartDiscountTotals] = useState<Record<string, number>>({});
  const [productCartProductSnapshots, setProductCartProductSnapshots] = useState<Record<string, Product>>({});
  const [productCartRecords, setProductCartRecords] = useState<ProductCartSavedRecord[]>([]);
  const [activeProductCartRecordId, setActiveProductCartRecordId] = useState<string | null>(null);
  const [showProductCartHistory, setShowProductCartHistory] = useState(false);
  const [renamingProductCartRecordId, setRenamingProductCartRecordId] = useState<string | null>(null);
  const [productCartRecordNameDraft, setProductCartRecordNameDraft] = useState("");
  const [isAddingCartItems, setIsAddingCartItems] = useState(false);
  const [isSavingProductCartRecord, setIsSavingProductCartRecord] = useState(false);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setProductCartRecords([]);
      return;
    }
    return onSnapshot(
      collection(db, "users", userId, "productCartRecords"),
      (snapshot) => setProductCartRecords(snapshot.docs.map((savedDoc) => ({ ...(savedDoc.data() as Omit<ProductCartSavedRecord, "id">), id: savedDoc.id } as ProductCartSavedRecord))
        .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))),
      (error) => console.error("Unable to load product cart records:", error)
    );
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    const storageKey = userId ? `acc_u_${userId}_product_categories` : "acc_guest_product_categories";
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      setProductCartCategoryNodes(Array.isArray(saved) ? saved.filter(node => node && typeof node.path === "string") : []);
    } catch { setProductCartCategoryNodes([]); }
    if (!userId) return;
    return onSnapshot(collection(db, "users", userId, "productCategories"), snapshot => {
      const nodes = snapshot.docs
        .map(item => ({ id: item.id, ...(item.data() as Omit<ProductCartCategoryNode, "id">) }))
        .filter(node => typeof node.path === "string" && node.path.trim())
        .sort((a, b) => a.path.localeCompare(b.path, "ar", { numeric: true }));
      setProductCartCategoryNodes(nodes);
      try { localStorage.setItem(storageKey, JSON.stringify(nodes)); } catch {}
    }, error => console.error("Unable to load product categories for the cart:", error));
  }, [auth.currentUser?.uid]);

  // New Invoice Form State
  const [newInvDate, setNewInvDate] = useState(new Date().toISOString().split("T")[0]);
  const [newInvDueDate, setNewInvDueDate] = useState<string>("");
  const [newInvNumber, setNewInvNumber] = useState(`INV-${Date.now().toString().slice(-6)}`);
  const [newInvItems, setNewInvItems] = useState<Omit<InvoiceItem, "id" | "total">[]>(
    Array.from({ length: 12 }, () => ({ details: "", quantity: 1, unitPrice: 0 }))
  );
  const [newInvPaidAmount, setNewInvPaidAmount] = useState<number>(0);
  const [newInvNotes, setNewInvNotes] = useState("");
  const [newInvEmployee, setNewInvEmployee] = useState("");
  const [newInvSignature, setNewInvSignature] = useState("موقع إلكترونياً");

  // New Payment Form State
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payMethod, setPayMethod] = useState("نقدي");
  const [payNotes, setPayNotes] = useState("");

  // Mode: "vertical" (traditional ledger sheet matching user photo) or "formal" (classic A4 invoice)
  const [ledgerDisplayMode, setLedgerDisplayMode] = useState<"vertical" | "formal" | "accounting">("vertical");
  const accountingListManagementEnabled = supplierAccountingLists || accountEntityLabel === "الزبون";
  const accountingEntityName = accountEntityLabel === "المورد" ? "المورد" : "الزبون";
  useEffect(() => {
    if (ledgerDisplayMode !== "accounting") setSupplierAccountingManagerOpen(false);
  }, [ledgerDisplayMode]);
  useEffect(() => {
    if (!accountingListManagementEnabled || !activeAccountingCategoryId) return;
    setExpandedSupplierAccountingCategories(current => current.includes(activeAccountingCategoryId) ? current : [...current, activeAccountingCategoryId]);
  }, [accountingListManagementEnabled, activeAccountingCategoryId]);

  // Debt Customer Names View Mode: "grid" | "list" | "large_icons" | "small_icons"
  const [customerViewMode, setCustomerViewMode] = useState<"grid" | "list" | "large_icons" | "small_icons">(() => {
    try {
      return (localStorage.getItem("ledger_customer_view_mode") as any) || "grid";
    } catch {
      return "grid";
    }
  });

  const [isCustomerDeleteConfirmOpen, setIsCustomerDeleteConfirmOpen] = useState(false);

  const handleSetCustomerViewMode = (mode: "grid" | "list" | "large_icons" | "small_icons") => {
    setCustomerViewMode(mode);
    try {
      localStorage.setItem("ledger_customer_view_mode", mode);
    } catch {}
  };

  // --- FOLDERS & GROUPING SYSTEM ---
  const DEFAULT_FOLDERS: CustomerFolder[] = [
    { id: "folder-regular", name: "زبائن دائميين", color: "emerald", createdAt: "2026-01-01" },
    { id: "folder-wholesale", name: "تجار جملة", color: "amber", createdAt: "2026-01-01" },
    { id: "folder-installments", name: "أقساط شهرية", color: "purple", createdAt: "2026-01-01" },
  ];

  const [internalFolders, setInternalFolders] = useState<CustomerFolder[]>(() => {
    return DEFAULT_FOLDERS;
  });

  const folders = propFolders !== undefined ? propFolders : internalFolders;

  const handleAddFolder = (folder: Omit<CustomerFolder, "id" | "createdAt"> | CustomerFolder) => {
    if (propAddFolder) return propAddFolder(folder);
    const newF: CustomerFolder = {
      ...folder,
      id: "id" in folder && folder.id ? folder.id : `folder-${Date.now()}`,
      createdAt: "createdAt" in folder && folder.createdAt ? folder.createdAt : new Date().toISOString(),
      parentId: folder.parentId || null,
    };
    const updated = [...internalFolders, newF];
    setInternalFolders(updated);
    return newF;
  };

  const handleUpdateFolder = (folder: CustomerFolder) => {
    if (propUpdateFolder) return propUpdateFolder(folder);
    const updated = internalFolders.map((f) => (f.id === folder.id ? folder : f));
    setInternalFolders(updated);
  };

  const handleDeleteFolder = (fId: string) => {
    if (propDeleteFolder) return propDeleteFolder(fId);
    const updated = internalFolders.map((f) => (f.id === fId ? { ...f, isDeleted: true, deletedAt: new Date().toISOString() } : f));
    setInternalFolders(updated);
  };

  const handleRestoreFolder = (fId: string) => {
    if (propRestoreFolder) return propRestoreFolder(fId);
    const updated = internalFolders.map((f) => (f.id === fId ? { ...f, isDeleted: false, deletedAt: undefined } : f));
    setInternalFolders(updated);
  };

  const handlePermanentDeleteFolder = (fId: string) => {
    if (propPermanentDeleteFolder) return propPermanentDeleteFolder(fId);
    const updated = internalFolders.filter((f) => f.id !== fId);
    setInternalFolders(updated);
  };

  const handleRestoreCustomer = (cId: string) => {
    if (restoreCustomer) return restoreCustomer(cId);
  };

  const handlePermanentDeleteCustomer = (cId: string) => {
    if (permanentDeleteCustomer) return permanentDeleteCustomer(cId);
  };

  const handleBulkRestore = (folderIds: string[], customerIds: string[]) => {
    if (propOnBulkRestore) return propOnBulkRestore(folderIds, customerIds);
    folderIds.forEach(handleRestoreFolder);
    customerIds.forEach(handleRestoreCustomer);
  };

  const handleBulkPermanentDelete = (folderIds: string[], customerIds: string[]) => {
    if (propOnBulkPermanentDelete) return propOnBulkPermanentDelete(folderIds, customerIds);
    folderIds.forEach(handlePermanentDeleteFolder);
    customerIds.forEach(handlePermanentDeleteCustomer);
  };

  const handleMoveItems = (folderIds: string[], customerIds: string[], targetFolderId: string | null) => {
    if (propOnMoveItems) {
      propOnMoveItems(folderIds, customerIds, targetFolderId);
      return;
    }
    folderIds.forEach((fId) => {
      const f = folders.find((x) => x.id === fId);
      if (f) handleUpdateFolder({ ...f, parentId: targetFolderId });
    });
    customerIds.forEach((cId) => {
      const c = customers.find((x) => x.id === cId);
      if (c && updateCustomer) updateCustomer({ ...c, folderId: targetFolderId || undefined });
    });
  };

  const handleBulkDelete = (folderIds: string[], customerIds: string[]) => {
    if (propOnBulkDelete) {
      propOnBulkDelete(folderIds, customerIds);
      return;
    }
    folderIds.forEach((fId) => handleDeleteFolder(fId));
    customerIds.forEach((cId) => {
      if (deleteCustomer) deleteCustomer(cId);
    });
  };

  const saveFolders = (newFolders: CustomerFolder[]) => {
    setInternalFolders(newFolders);
  };

  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [folderLayoutMode, setFolderLayoutMode] = useState<"tabs" | "boxes" | "tree">(() => {
    try {
      return (localStorage.getItem("acc_folder_layout_mode") as "tabs" | "boxes" | "tree") || "boxes";
    } catch {
      return "boxes";
    }
  });

  // Drag-and-Drop Reorder State for Folders
  const [draggedFolderIndex, setDraggedFolderIndex] = useState<number | null>(null);
  const [dragOverFolderIndex, setDragOverFolderIndex] = useState<number | null>(null);

  const handleReorderFolder = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= folders.length ||
      toIndex >= folders.length
    ) {
      return;
    }
    const updated = [...folders];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    saveFolders(updated);
    showToast(`تم حفظ ترتيب الحافظات: "${moved.name}"`);
  };

  // Page Navigation & 3D Page Flip Animation State
  const [currentLedgerPage, setCurrentLedgerPage] = useState<number>(1);
  const [pageFlipDirection, setPageFlipDirection] = useState<"next" | "prev">("next");
  const [pageViewMode, setPageViewMode] = useState<"flip" | "all">("flip");
  const [isPageFlipping, setIsPageFlipping] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Synthesize a realistic, soft paper flip sound using pure Web Audio API
  const playPaperFlipSound = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const duration = 0.12;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const decay = Math.exp(-i / (bufferSize * 0.25));
        data[i] = (Math.random() * 2 - 1) * decay * 0.16;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(850, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + duration);
      filter.Q.value = 1.0;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } catch {
      // AudioContext blocked or not supported, ignore gracefully
    }
  };

  // Reset page to 1 whenever invoice changes
  useEffect(() => {
    setCurrentLedgerPage(1);
  }, [selectedInvoiceId]);

  const handleNextPage = (totalPages: number) => {
    if (currentLedgerPage >= totalPages) return;
    setPageFlipDirection("next");
    setIsPageFlipping(true);
    playPaperFlipSound();
    setCurrentLedgerPage((p) => Math.min(totalPages, p + 1));
    setTimeout(() => setIsPageFlipping(false), 450);
  };

  const handlePrevPage = () => {
    if (currentLedgerPage <= 1) return;
    setPageFlipDirection("prev");
    setIsPageFlipping(true);
    playPaperFlipSound();
    setCurrentLedgerPage((p) => Math.max(1, p - 1));
    setTimeout(() => setIsPageFlipping(false), 450);
  };

  const handleGoToPage = (pageNum: number) => {
    if (pageNum === currentLedgerPage) return;
    setPageFlipDirection(pageNum > currentLedgerPage ? "next" : "prev");
    setIsPageFlipping(true);
    playPaperFlipSound();
    setCurrentLedgerPage(pageNum);
    setTimeout(() => setIsPageFlipping(false), 450);
  };

  // Top Action Dropdown
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  // Modals
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [newCustFolderId, setNewCustFolderId] = useState("all");

  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("amber");
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);

  // Rename modal: { isOpen: boolean; type: "customer" | "folder"; id: string; currentName: string; }
  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    type: "customer" | "folder";
    id: string;
    currentName: string;
  } | null>(null);
  const [renameInputVal, setRenameInputVal] = useState("");

  // Move Customer modal: { isOpen: boolean; customer: Customer | null; targetFolderId: string }
  const [moveModal, setMoveModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
    targetFolderId: string;
  } | null>(null);

  // Share modal: { isOpen: boolean; title: string; text: string; phone?: string }
  const [shareModal, setShareModal] = useState<{
    isOpen: boolean;
    title: string;
    text: string;
    phone?: string;
  } | null>(null);

  // Sequence modal: { isOpen: boolean; customer: Customer | null; currentSeq: number; totalInFolder: number; folderName: string; targetSeq: number }
  const [sequenceModal, setSequenceModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
    currentSeq: number;
    totalInFolder: number;
    folderName: string;
    targetSeq: number;
  } | null>(null);

  // Active per-item dropdown menus
  const [activeCustomerMenuId, setActiveCustomerMenuId] = useState<string | null>(null);
  const [activeFolderMenuId, setActiveFolderMenuId] = useState<string | null>(null);
  const [folderOptionsModal, setFolderOptionsModal] = useState<CustomerFolder | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  // Close menus on click outside
  React.useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#header-actions-dropdown-container")) {
        setIsHeaderMenuOpen(false);
      }
      if (!target.closest(".customer-menu-container")) {
        setActiveCustomerMenuId(null);
      }
      if (!target.closest(".folder-menu-container")) {
        setActiveFolderMenuId(null);
      }
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  // Action Handlers
  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;
    const targetFolderId = newCustFolderId !== "all" ? newCustFolderId : undefined;
    const debtorsInFolder = customers.filter((c) => (c.folderId || undefined) === targetFolderId);
    const nextSeq = debtorsInFolder.length + 1;

    const newCustomerPayload = {
      name: newCustName.trim(),
      phone: newCustPhone.trim() || "07700000000",
      address: newCustAddress.trim() || undefined,
      folderId: targetFolderId,
      sequence: nextSeq,
    };

    if (addCustomer) {
      const created = addCustomer(newCustomerPayload);
      setIsAddCustomerModalOpen(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustAddress("");
      showToast(`تمت إضافة الزبون "${created.name}" بحساب فارغ وجاهز لإدخال البيانات!`);
      setSelectedCustomerId(created.id);
    } else {
      onOpenNewCustomerModal();
    }
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const newFolder: CustomerFolder = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      color: newFolderColor || "amber",
      createdAt: new Date().toISOString(),
      parentId: newFolderParentId || null,
    };
    saveFolders([...folders, newFolder]);
    setNewFolderName("");
    setNewFolderParentId(null);
    setIsAddFolderModalOpen(false);
    setSelectedFolderId(newFolder.id);
    showToast(`تم إنشاء المجلد "${newFolder.name}" بنجاح!`);
  };

  const openRenameModal = (type: "customer" | "folder", id: string, currentName: string) => {
    setRenameModal({
      isOpen: true,
      type,
      id,
      currentName,
    });
    setRenameInputVal(currentName);
  };

  const handleRenameCustomer = (custId: string, newName: string) => {
    if (!newName.trim()) return;
    const target = customers.find((c) => c.id === custId);
    if (!target) return;
    const updated = { ...target, name: newName.trim() };
    if (updateCustomer) {
      updateCustomer(updated);
      showToast(`تمت إعادة تسمية الزبون إلى "${newName.trim()}"`);
    }
  };

  const handleRenameFolder = (folderId: string, newName: string) => {
    if (!newName.trim()) return;
    const targetF = folders.find((f) => f.id === folderId);
    if (targetF) {
      handleUpdateFolder({ ...targetF, name: newName.trim() });
    }
    showToast(`تمت إعادة تسمية المجلد إلى "${newName.trim()}"`);
  };

  const handleMoveCustomer = (custId: string, targetFolderId: string) => {
    const target = customers.find((c) => c.id === custId);
    if (!target) return;
    const destFolderId = targetFolderId === "none" ? undefined : targetFolderId;
    const debtorsInDestFolder = customers.filter(
      (c) => (c.folderId || undefined) === destFolderId && c.id !== custId
    );
    const nextSeq = debtorsInDestFolder.length + 1;

    const updated = { ...target, folderId: destFolderId, sequence: nextSeq };
    if (updateCustomer) {
      updateCustomer(updated);
      const folderObj = folders.find((f) => f.id === targetFolderId);
      showToast(`تم نقل الزبون "${target.name}" إلى ${folderObj ? folderObj.name : "بدون حافظة"} بالتسلسل #${nextSeq}`);
    }
  };

  const handleCopyText = (text: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    showToast(`تم نسخ ${label}: "${text}"`);
  };

  const handleShareCustomer = (c: Customer) => {
    const stats = getCustomerStats(c.id);
    const text = `📄 كشف حساب زبون - ${settings.companyName || "محلات العاشق للكهربائيات"}
الاسم: ${c.name}
الهاتف: ${c.phone}
الموقع: ${c.address || "غير محدد"}
--------------------------
عدد القوائم: ${stats.invoiceCount}
إجمالي الديون: ${formatThousands(stats.totalDebts)} ${settings.currency}
إجمالي المسدد: ${formatThousands(stats.totalPaid)} ${settings.currency}
المطلوب المتبقي: ${formatThousands(stats.totalRemaining)} ${settings.currency}
--------------------------
تاريخ التقرير: ${new Date().toLocaleDateString("ar-SA")}`;

    setShareModal({
      isOpen: true,
      title: `مشاركة كشف حساب: ${c.name}`,
      text,
      phone: c.phone,
    });
  };

  const handleShareFolder = (folder: CustomerFolder) => {
    const folderCustomers = customers.filter((c) =>
      folder.id === "all" ? true : c.folderId === folder.id
    );
    let totalRemaining = 0;
    let totalDebts = 0;
    folderCustomers.forEach((c) => {
      const s = getCustomerStats(c.id);
      totalRemaining += s.totalRemaining;
      totalDebts += s.totalDebts;
    });

    const text = `📁 تقرير مجلد [${folder.name}] - ${settings.companyName || "محلات العاشق للكهربائيات"}
عدد الزبائن: ${folderCustomers.length}
إجمالي الديون: ${formatThousands(totalDebts)} ${settings.currency}
إجمالي المطلوب المتبقي: ${formatThousands(totalRemaining)} ${settings.currency}
--------------------------
قائمة الزبائن:
${folderCustomers
  .map((c) => {
    const s = getCustomerStats(c.id);
    return `• ${c.name} (${c.phone}): مطلوب ${formatThousands(s.totalRemaining)} ${settings.currency}`;
  })
  .join("\n")}
--------------------------
تاريخ التقرير: ${new Date().toLocaleDateString("ar-SA")}`;

    setShareModal({
      isOpen: true,
      title: `مشاركة تقرير مجلد: ${folder.name}`,
      text,
      phone: "",
    });
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId && !c.isDeleted);
  const currentAccountingSheets = selectedCustomer ? getCustomerAccountingSheets(selectedCustomer) : [];
  const currentAccountingCategories = selectedCustomer ? getCustomerAccountingCategories(selectedCustomer) : [];
  const activeAccountingSheet = activeAccountingSheetId
    ? currentAccountingSheets.find(sheet => sheet.id === activeAccountingSheetId)
    : accountingSheetSelectionReady ? undefined : currentAccountingSheets[0];
  const visibleAccountingSheets = currentAccountingSheets.filter(sheet => !activeAccountingCategoryId || activeAccountingCategoryId === "__all__" || (activeAccountingCategoryId === "__uncategorized__" ? !sheet.categoryId : sheet.categoryId === activeAccountingCategoryId));
  const currentVerticalCategories = (selectedCustomer?.verticalLedgerCategories || []).filter(category =>
    (!category.ownerAccountId || category.ownerAccountId === selectedCustomer?.id) &&
    (!category.id.startsWith("vertical-category-") || category.id.startsWith(`vertical-category-${selectedCustomer?.id}-`))
  );
  const defaultVerticalCategoryId = currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomerId}-default`;
  const currentVerticalStatements = selectedCustomer ? invoices.filter(invoice => !invoice.isDeleted && invoice.customerId === selectedCustomer.id) : [];
  const getVerticalCategoryId = (invoice: Invoice) => invoice.verticalCategoryId && currentVerticalCategories.some(category => category.id === invoice.verticalCategoryId)
    ? invoice.verticalCategoryId : defaultVerticalCategoryId;
  const visibleVerticalStatements = currentVerticalStatements.filter(invoice => activeVerticalCategoryId === "__all__" || (activeVerticalCategoryId === "__uncategorized__" ? !getVerticalCategoryId(invoice) : getVerticalCategoryId(invoice) === activeVerticalCategoryId));
  const verticalActionCategoryId = verticalLedgerActionMenu?.startsWith("category:") ? verticalLedgerActionMenu.slice("category:".length) : "";
  const verticalActionStatementId = verticalLedgerActionMenu?.startsWith("statement:") ? verticalLedgerActionMenu.slice("statement:".length) : "";
  const verticalActionCategory = currentVerticalCategories.find(category => category.id === verticalActionCategoryId);
  const verticalActionStatement = currentVerticalStatements.find(statement => statement.id === verticalActionStatementId);
  const supplierActionCategoryId = supplierAccountingActionMenu?.startsWith("category:") ? supplierAccountingActionMenu.slice("category:".length) : "";
  const supplierActionSheetId = supplierAccountingActionMenu?.startsWith("sheet:") ? supplierAccountingActionMenu.slice("sheet:".length) : "";
  const supplierActionCategory = currentAccountingCategories.find(category => category.id === supplierActionCategoryId);
  const supplierActionSheet = currentAccountingSheets.find(sheet => sheet.id === supplierActionSheetId);
  const accountingOriginalRowsRef = useRef<AccountingSheetRow[]>(activeAccountingSheet?.rows || []);
  let saveAccountingRows: () => Promise<boolean> = async () => true;

  useLayoutEffect(() => {
    // Resolve customer-owned selection and rows before the first visible frame.
    // The account manager and its selected category/list belong to one customer.
    // Clear transient UI selection when moving to a different customer.
    setSupplierAccountingManagerOpen(false);
    setSupplierAccountingActionMenu(null);
    setSupplierAccountingPicker(null);
    setExpandedSupplierAccountingCategories([currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomerId}-default`]);
    setAccountingCategoryMenuOpen(false);
    setAccountingSheetMenuOpen(false);
    setVerticalLedgerPicker(null);
    setVerticalLedgerManagerOpen(false);
    setVerticalLedgerActionMenu(null);
    setVerticalDeleteConfirmId(null);
    setVerticalStatementEditingId(null);
    setVerticalCategoryFormOpen(false);
    setVerticalCategoryDraft("");
    setVerticalCategoryEditingId(null);
    setVerticalLedgerExpandedCategories([currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomerId}-default`]);
    setActiveVerticalCategoryId(currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomerId}-default`);
    if (!selectedCustomer) {
      setAccountingSheetSelectionReady(false);
      accountingOriginalRowsRef.current = [];
      setAccountingDraftRows([]);
      return;
    }
    const sheets = currentAccountingSheets;
    const chosen = sheets.find(sheet => sheet.id === selectedCustomer.activeAccountingSheetId) || sheets[0];
    setAccountingSheetSelectionReady(true);
    setActiveAccountingSheetId(chosen?.id || "");
    setActiveAccountingCategoryId(chosen?.categoryId || currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer.id}-default`);
    accountingOriginalRowsRef.current = chosen?.rows || [];
    setAccountingDraftRows(accountingOriginalRowsRef.current);
    setAccountingRowsDirty(false);
    setAccountingRowDraft({ details: "", quantity: "1", unit: "قطعة", unitPrice: "" });
    setEditingAccountingRowId(null);
  }, [selectedCustomer?.id]);

  useLayoutEffect(() => {
    if (!selectedCustomer || !activeAccountingSheetId) return;
    const chosen = currentAccountingSheets.find(sheet => sheet.id === activeAccountingSheetId);
    if (!chosen) return;
    accountingOriginalRowsRef.current = chosen.rows;
    setAccountingDraftRows(chosen.rows);
    setAccountingRowsDirty(false);
  }, [selectedCustomer?.id, selectedCustomer?.accountingSheets, activeAccountingSheetId]);

  useEffect(() => {
    // Move each pre-feature customer's existing default account records into
    // one default category, without replacing or duplicating their records.
    if (!selectedCustomer || !updateCustomer || isCloudSyncing) return;
    const customerId = selectedCustomer.id;
    if (legacyCategoryMigrationInFlightRef.current.has(customerId)) return;

    const accountingCategories = currentAccountingCategories.length
      ? currentAccountingCategories
      : [{ id: `accounting-category-${customerId}-default`, ownerAccountId: customerId, name: "تصنيف 1" }];
    const verticalCategories = currentVerticalCategories.length
      ? currentVerticalCategories
      : [{ id: `vertical-category-${customerId}-default`, ownerAccountId: customerId, name: "تصنيف 1" }];
    const shouldAttachAccountingSheets = true;
    const shouldAttachVerticalStatements = true;
    const targetAccountingCategoryId = accountingCategories[0].id;
    const targetVerticalCategoryId = verticalCategories[0].id;
    const nextSheets = currentAccountingSheets.map(sheet => ({
      ...sheet,
      ownerAccountId: customerId,
      ...(shouldAttachAccountingSheets && (!sheet.categoryId || !accountingCategories.some(category => category.id === sheet.categoryId)) ? { categoryId: targetAccountingCategoryId } : {}),
    }));
    const nextInvoices = shouldAttachVerticalStatements
      ? currentVerticalStatements.filter(statement => !statement.verticalCategoryId || !verticalCategories.some(category => category.id === statement.verticalCategoryId))
      : [];
    const accountingNeedsSave = !Array.isArray(selectedCustomer.accountingSheetCategories)
      || selectedCustomer.accountingSheetCategories.length === 0
      || !Array.isArray(selectedCustomer.accountingSheets)
      || nextSheets.some((sheet, index) => sheet.categoryId !== currentAccountingSheets[index]?.categoryId || sheet.ownerAccountId !== currentAccountingSheets[index]?.ownerAccountId);
    const verticalNeedsSave = !Array.isArray(selectedCustomer.verticalLedgerCategories)
      || selectedCustomer.verticalLedgerCategories.length === 0;
    if (!accountingNeedsSave && !verticalNeedsSave && !nextInvoices.length) return;

    legacyCategoryMigrationInFlightRef.current.add(customerId);
    void (async () => {
      try {
        if (accountingNeedsSave || verticalNeedsSave) {
          await Promise.resolve(updateCustomer({
            ...selectedCustomer,
            accountingSheets: accountingNeedsSave ? nextSheets : selectedCustomer.accountingSheets,
            accountingSheetCategories: accountingNeedsSave ? accountingCategories.map(category => ({ ...category, ownerAccountId: customerId })) : selectedCustomer.accountingSheetCategories,
            activeAccountingSheetId: selectedCustomer.activeAccountingSheetId || currentAccountingSheets[0]?.id,
            accountingSheetRows: accountingNeedsSave ? flattenAccountingSheets(nextSheets) : selectedCustomer.accountingSheetRows,
            verticalLedgerCategories: verticalNeedsSave ? verticalCategories.map(category => ({ ...category, ownerAccountId: customerId })) : selectedCustomer.verticalLedgerCategories,
          }));
        }
        for (const [index, statement] of nextInvoices.entries()) {
          await Promise.resolve(updateInvoice({
            ...statement,
            displayName: statement.displayName || `كشف الحساب ${currentVerticalStatements.findIndex(item => item.id === statement.id) + 1 || index + 1}`,
            verticalCategoryId: targetVerticalCategoryId,
          }));
        }
        if (shouldAttachVerticalStatements) setActiveVerticalCategoryId(targetVerticalCategoryId);
        if (shouldAttachAccountingSheets) setActiveAccountingCategoryId(targetAccountingCategoryId);
      } catch (error) {
        console.error("تعذر تنظيم الحسابات القديمة ضمن التصنيف الافتراضي:", error);
      } finally {
        legacyCategoryMigrationInFlightRef.current.delete(customerId);
      }
    })();
  }, [selectedCustomer?.id, selectedCustomer?.accountingSheets, selectedCustomer?.accountingSheetCategories, selectedCustomer?.verticalLedgerCategories, invoices, updateCustomer, updateInvoice, isCloudSyncing]);

  const persistAccountingRows = (nextRows: AccountingSheetRow[]) => {
    if (!selectedCustomer || !updateCustomer) {
      showToast("تعذر تعديل القائمة الحسابية: تحديث بيانات الزبون غير متاح.");
      return;
    }
    // Update synchronously so an input blur cannot overwrite toolbar formatting
    // with an older render-time draft before React completes the next render.
    accountingDraftRowsRef.current = nextRows;
    setAccountingDraftRows(nextRows);
    setAccountingRowsDirty(true);
  };

  const persistAccountingCollections = async (
    sheets: AccountingSheet[],
    categories: AccountingSheetCategory[],
    nextActiveId: string = activeAccountingSheetId,
    nextCategoryId: string = activeAccountingCategoryId,
  ) => {
    if (!selectedCustomer || !updateCustomer) return false;
    if (accountingRowsDirty && sheets.some(sheet => sheet.id === activeAccountingSheetId)) await saveAccountingRows();
    const materializedSheets = sheets.map(sheet => ({
      ...sheet,
      ownerAccountId: selectedCustomer.id,
      ...(sheet.id === activeAccountingSheetId && accountingRowsDirty ? { rows: accountingDraftRows } : {}),
    }));
    const materializedCategories = categories.map(category => ({ ...category, ownerAccountId: selectedCustomer.id }));
    await Promise.resolve(updateCustomer({
      ...selectedCustomer,
      accountingSheets: materializedSheets,
      accountingSheetCategories: materializedCategories,
      activeAccountingSheetId: nextActiveId,
      accountingSheetRows: flattenAccountingSheets(materializedSheets),
    }));
    const nextActive = materializedSheets.find(sheet => sheet.id === nextActiveId);
    if (nextActive) {
      accountingOriginalRowsRef.current = nextActive.rows;
      accountingDraftRowsRef.current = nextActive.rows;
      setAccountingDraftRows(nextActive.rows);
      setActiveAccountingSheetId(nextActive.id);
      setActiveAccountingCategoryId(nextCategoryId);
    } else {
      accountingOriginalRowsRef.current = [];
      accountingDraftRowsRef.current = [];
      setAccountingDraftRows([]);
      setActiveAccountingSheetId("");
      setActiveAccountingCategoryId(nextCategoryId);
    }
    setAccountingRowsDirty(false);
    setAccountingSheetMode("view");
    return true;
  };

  const openAccountingManagerDialog = (kind: AccountingManagerDialog["kind"], value = "") => {
    setAccountingCategoryMenuOpen(false);
    setAccountingSheetMenuOpen(false);
    setSupplierAccountingManagerOpen(false);
      setAccountingManagerDialog({ kind, value, targetCategoryId: currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer?.id || "default"}-default` });
  };

  const createAccountingCategory = () => openAccountingManagerDialog("createCategory");

  const renameAccountingCategory = () => {
    const category = currentAccountingCategories.find(item => item.id === activeAccountingCategoryId);
    if (!category) { showToast("اختر تصنيفاً أولاً."); return; }
    openAccountingManagerDialog("renameCategory", category.name);
  };

  const toggleAccountingCategoryFlag = async (key: "isPinned" | "isFavorite") => {
    const category = currentAccountingCategories.find(item => item.id === activeAccountingCategoryId);
    if (!category) { showToast("اختر تصنيفاً أولاً."); return; }
    await persistAccountingCollections(currentAccountingSheets, currentAccountingCategories.map(item => item.id === category.id ? { ...item, [key]: !item[key] } : item));
    setAccountingCategoryMenuOpen(false);
    setSupplierAccountingManagerOpen(false);
  };

  const deleteAccountingCategory = () => {
    const category = currentAccountingCategories.find(item => item.id === activeAccountingCategoryId);
    if (!category) return;
    if (currentAccountingCategories.length <= 1) {
      showToast("لا يمكن حذف هذا التصنيف، يجب أن يبقى تصنيف واحد على الأقل.");
      return;
    }
    openAccountingManagerDialog("deleteCategory", category.name);
  };

  const createAccountingSheet = () => {
    if (!selectedCustomer) return;
    const fallbackName = `قائمة حسابية ${currentAccountingSheets.length + 1}`;
    openAccountingManagerDialog("createSheet", fallbackName);
  };

  const renameAccountingSheet = () => {
    if (!activeAccountingSheet) return;
    openAccountingManagerDialog("renameSheet", activeAccountingSheet.name);
  };

  const toggleAccountingSheetFlag = async (key: "isPinned" | "isFavorite") => {
    if (!activeAccountingSheet) return;
    const sheets = currentAccountingSheets.map(sheet => sheet.id === activeAccountingSheet.id ? { ...sheet, [key]: !sheet[key] } : sheet);
    await persistAccountingCollections(sheets, currentAccountingCategories);
    setAccountingSheetMenuOpen(false);
    setSupplierAccountingManagerOpen(false);
  };

  const moveAccountingSheet = () => {
    if (!activeAccountingSheet) return;
    openAccountingManagerDialog("moveSheet", activeAccountingSheet.name);
  };

  const copyAccountingSheet = async () => {
    if (!selectedCustomer || !activeAccountingSheet) return;
    const copy: AccountingSheet = {
      ...activeAccountingSheet,
      id: `accounting-sheet-${selectedCustomer.id}-${Date.now()}`,
      ownerAccountId: selectedCustomer.id,
      name: `نسخة من ${activeAccountingSheet.name}`,
      categoryId: activeAccountingSheet.categoryId || currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer.id}-default`,
      createdAt: new Date().toISOString(),
      isPinned: false,
      isFavorite: false,
      rows: accountingRowsDirty ? accountingDraftRows : activeAccountingSheet.rows,
    };
    copy.rows = copy.rows.map((row, index) => ({ ...row, id: `${copy.id}-row-${index + 1}-${Date.now()}` }));
    await persistAccountingCollections([...currentAccountingSheets, copy], currentAccountingCategories, copy.id, copy.categoryId || currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer.id}-default`);
    setAccountingSheetMenuOpen(false);
    setAccountingSelectedRow(0);
    showToast("تم نسخ القائمة دون نسخ التسديدات.");
  };

  const deleteAccountingSheet = () => {
    if (!selectedCustomer || !activeAccountingSheet) return;
    openAccountingManagerDialog("deleteSheet", activeAccountingSheet.name);
  };

  const submitAccountingManagerDialog = async () => {
    if (!selectedCustomer || !accountingManagerDialog) return;
    const { kind, value } = accountingManagerDialog;
    const name = value.trim();
    if (["createCategory", "renameCategory", "createSheet", "renameSheet"].includes(kind) && !name) {
      showToast("اكتب اسماً أولاً.");
      return;
    }
    if (kind === "createCategory") {
      const category: AccountingSheetCategory = { id: `accounting-category-${selectedCustomer.id}-${Date.now()}`, ownerAccountId: selectedCustomer.id, name };
      await persistAccountingCollections(currentAccountingSheets, [...currentAccountingCategories, category], activeAccountingSheetId, activeAccountingCategoryId);
      showToast("تمت إضافة التصنيف.");
    } else if (kind === "renameCategory") {
      const category = currentAccountingCategories.find(item => item.id === activeAccountingCategoryId);
      if (!category) return;
      await persistAccountingCollections(currentAccountingSheets, currentAccountingCategories.map(item => item.id === category.id ? { ...item, name } : item));
      showToast("تمت إعادة تسمية التصنيف.");
    } else if (kind === "deleteCategory") {
      const category = currentAccountingCategories.find(item => item.id === activeAccountingCategoryId);
      if (!category) return;
      if (currentAccountingCategories.length <= 1) {
        setAccountingManagerDialog(null);
        showToast("لا يمكن حذف هذا التصنيف، يجب أن يبقى تصنيف واحد على الأقل.");
        return;
      }
      const remainingCategories = currentAccountingCategories.filter(item => item.id !== category.id);
      const fallbackCategory = remainingCategories[0] || { id: `accounting-category-${selectedCustomer.id}-default`, ownerAccountId: selectedCustomer.id, name: "تصنيف 1" };
      const nextCategories = remainingCategories.length ? remainingCategories : [fallbackCategory];
      const sheets = currentAccountingSheets.map(sheet => sheet.categoryId === category.id || !sheet.categoryId ? { ...sheet, categoryId: fallbackCategory.id } : sheet);
      await persistAccountingCollections(sheets, nextCategories, activeAccountingSheetId, activeAccountingCategoryId === category.id ? fallbackCategory.id : activeAccountingCategoryId);
      showToast("حُذف التصنيف ونُقلت قوائمه إلى التصنيف المتبقي.");
    } else if (kind === "createSheet") {
      const sheet: AccountingSheet = {
        id: `accounting-sheet-${selectedCustomer.id}-${Date.now()}`,
        ownerAccountId: selectedCustomer.id,
        name,
        categoryId: currentAccountingCategories.some(category => category.id === activeAccountingCategoryId) ? activeAccountingCategoryId : currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer.id}-default`,
        rows: [],
        createdAt: new Date().toISOString(),
      };
      await persistAccountingCollections([...currentAccountingSheets, sheet], currentAccountingCategories, sheet.id, sheet.categoryId || currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer.id}-default`);
      setAccountingSelectedRow(0);
      showToast("تم إنشاء القائمة الحسابية الجديدة.");
    } else if (kind === "renameSheet") {
      if (!activeAccountingSheet) return;
      const sheets = currentAccountingSheets.map(sheet => sheet.id === activeAccountingSheet.id ? { ...sheet, name } : sheet);
      await persistAccountingCollections(sheets, currentAccountingCategories);
      showToast("تمت إعادة تسمية القائمة.");
    } else if (kind === "moveSheet") {
      if (!activeAccountingSheet) return;
      const categoryId = accountingManagerDialog.targetCategoryId || currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer.id}-default`;
      const sheets = currentAccountingSheets.map(sheet => sheet.id === activeAccountingSheet.id ? { ...sheet, categoryId } : sheet);
      await persistAccountingCollections(sheets, currentAccountingCategories, activeAccountingSheet.id, categoryId);
      showToast("تم نقل القائمة إلى التصنيف.");
    } else if (kind === "deleteSheet") {
      if (!activeAccountingSheet) return;
    let nextSheets = currentAccountingSheets.filter(sheet => sheet.id !== activeAccountingSheet.id);
    if (!nextSheets.length) nextSheets = [{
      id: `accounting-sheet-${selectedCustomer.id}-${Date.now()}`,
      name: "القائمة الحسابية 1",
      categoryId: currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer.id}-default`,
      rows: [],
      createdAt: new Date().toISOString(),
    }];
    const nextActive = nextSheets.find(sheet => sheet.categoryId === activeAccountingCategoryId) || nextSheets[0];
    await persistAccountingCollections(nextSheets, currentAccountingCategories, nextActive.id, nextActive.categoryId || currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer.id}-default`);
    setAccountingSelectedRow(0);
    showToast("تم حذف القائمة.");
    }
    setAccountingManagerDialog(null);
  };

  const chooseAccountingCategory = async (categoryId: string) => {
    const resolvedCategoryId = categoryId === "__uncategorized__" ? currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer?.id || "default"}-default` : categoryId;
    const nextSheet = currentAccountingSheets
      .filter(sheet => !resolvedCategoryId || sheet.categoryId === resolvedCategoryId)
      .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)))[0];
    await persistAccountingCollections(currentAccountingSheets, currentAccountingCategories, nextSheet?.id || "", resolvedCategoryId);
  };

  const chooseAccountingSheet = async (sheetId: string) => {
    if (!sheetId) return;
    const nextSheet = currentAccountingSheets.find(sheet => sheet.id === sheetId);
    await persistAccountingCollections(currentAccountingSheets, currentAccountingCategories, sheetId, nextSheet?.categoryId || currentAccountingCategories[0]?.id || `accounting-category-${selectedCustomer?.id || "default"}-default`);
    setAccountingSheetMenuOpen(false);
  };

  const persistVerticalCategories = async (categories: AccountingSheetCategory[]) => {
    if (!selectedCustomer || !updateCustomer) return;
    await Promise.resolve(updateCustomer({ ...selectedCustomer, verticalLedgerCategories: categories.map(category => ({ ...category, ownerAccountId: selectedCustomer.id })) }));
  };

  const saveVerticalCategory = async () => {
    if (!selectedCustomer) return;
    const name = verticalCategoryDraft.trim();
    if (!name) { showToast("اكتب اسم التصنيف أولاً."); return; }
    const next = verticalCategoryEditingId
      ? currentVerticalCategories.map(category => category.id === verticalCategoryEditingId ? { ...category, name } : category)
      : [...currentVerticalCategories, { id: `vertical-category-${selectedCustomer.id}-${Date.now()}`, ownerAccountId: selectedCustomer.id, name }];
    await persistVerticalCategories(next);
    if (!verticalCategoryEditingId) setActiveVerticalCategoryId(next[next.length - 1].id);
    setVerticalCategoryDraft(""); setVerticalCategoryEditingId(null);
    setVerticalCategoryFormOpen(false);
    showToast(verticalCategoryEditingId ? "تم تعديل اسم التصنيف." : "تم إنشاء التصنيف.");
  };

  const toggleVerticalCategoryFlag = async (categoryId: string, key: "isPinned" | "isFavorite") => {
    await persistVerticalCategories(currentVerticalCategories.map(category => category.id === categoryId ? { ...category, [key]: !category[key] } : category));
  };

  const toggleVerticalStatementFlag = async (statementId: string, key: "isPinned" | "isFavorite") => {
    const current = invoices.find(invoice => invoice.id === statementId);
    if (current) await Promise.resolve(updateInvoice({ ...current, [key]: !current[key] }));
  };

  const deleteVerticalCategory = async (categoryId: string) => {
    const category = currentVerticalCategories.find(item => item.id === categoryId);
    if (!category) return;
    if (currentVerticalCategories.length <= 1) {
      showToast("لا يمكن حذف هذا التصنيف، يجب أن يبقى تصنيف واحد على الأقل.");
      return;
    }
    const remainingCategories = currentVerticalCategories.filter(item => item.id !== categoryId);
    const fallbackCategory = remainingCategories[0] || { id: `vertical-category-${selectedCustomer?.id || "default"}-default`, ownerAccountId: selectedCustomer?.id, name: "تصنيف 1" };
    const nextCategories = remainingCategories.length ? remainingCategories : [fallbackCategory];
    await persistVerticalCategories(nextCategories);
    for (const invoice of currentVerticalStatements.filter(item => item.verticalCategoryId === categoryId)) {
      await Promise.resolve(updateInvoice({ ...invoice, verticalCategoryId: fallbackCategory.id }));
    }
    if (activeVerticalCategoryId === categoryId) setActiveVerticalCategoryId(fallbackCategory.id);
    showToast("حُذف التصنيف ونُقلت كشوفه إلى التصنيف المتبقي.");
  };

  const moveVerticalStatement = async (statementId: string, categoryId: string) => {
    const current = invoices.find(invoice => invoice.id === statementId);
    if (!current) return;
    const verticalCategoryId = categoryId === "__uncategorized__" || categoryId === "__all__"
      ? currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomer?.id || "default"}-default`
      : categoryId;
    await Promise.resolve(updateInvoice({ ...current, verticalCategoryId }));
    setActiveVerticalCategoryId(verticalCategoryId);
    showToast("تم نقل الكشف إلى التصنيف.");
  };

  const createVerticalStatement = (categoryOverride?: string, keepManagerOpen = false) => {
    if (!selectedCustomer) return;
    const selectedCategoryId = categoryOverride || activeVerticalCategoryId;
    const categoryId = selectedCategoryId === "__uncategorized__" || selectedCategoryId === "__all__"
      ? currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomer.id}-default`
      : selectedCategoryId;
    const nextNumber = currentVerticalStatements.length + 1;
    const created = addInvoice({
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      displayName: `كشف الحساب ${nextNumber}`,
      verticalCategoryId: categoryId,
      date: new Date().toISOString().slice(0, 10), customerId: selectedCustomer.id,
      customerName: selectedCustomer.name, customerPhone: selectedCustomer.phone,
      customerAddress: selectedCustomer.address || "", items: [], grandTotal: 0, paidAmount: 0,
      remainingAmount: 0, notes: "", employeeName: "المحاسب", signature: "",
    });
    setSelectedInvoiceId(created.id);
    setActiveVerticalCategoryId(categoryId);
    if (!keepManagerOpen) setVerticalLedgerManagerOpen(false);
    showToast("تم إنشاء كشف حساب جديد.");
  };

  const copyVerticalStatement = (statementId: string) => {
    const current = invoices.find(invoice => invoice.id === statementId);
    if (!current) return;
    const copy = addInvoice({ ...current, invoiceNumber: `INV-${Date.now().toString().slice(-6)}`, displayName: `${current.displayName || current.invoiceNumber || "كشف الحساب"} - نسخة`, items: current.items.map(item => ({ ...item, id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })) });
    setSelectedInvoiceId(copy.id);
    setActiveVerticalCategoryId(copy.verticalCategoryId || currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomer?.id || "default"}-default`);
    showToast("تم نسخ الكشف.");
  };

  const saveVerticalStatementName = async (statementId: string, name: string) => {
    const current = invoices.find(invoice => invoice.id === statementId);
    if (!current || !name.trim()) return;
    await Promise.resolve(updateInvoice({ ...current, displayName: name.trim() }));
    setVerticalStatementEditingId(null);
    setVerticalStatementNameDraft("");
    showToast("تم حفظ اسم الكشف.");
  };

  const requestDeleteVerticalStatement = (statementId: string) => {
    const current = invoices.find(invoice => invoice.id === statementId);
    if (!current) return;
    if (currentVerticalStatements.length <= 1) { showToast("يجب إبقاء كشف واحد على الأقل للحساب."); return; }
    setVerticalDeleteConfirmId(statementId);
  };

  const confirmDeleteVerticalStatement = () => {
    const current = invoices.find(invoice => invoice.id === verticalDeleteConfirmId);
    if (!current) return;
    const currentCategoryId = current.verticalCategoryId || currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomer?.id || "default"}-default`;
    const next = currentVerticalStatements.find(invoice => invoice.id !== current.id && (invoice.verticalCategoryId || currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomer?.id || "default"}-default`) === currentCategoryId) || currentVerticalStatements.find(invoice => invoice.id !== current.id);
    deleteInvoice(current.id);
    if (next) { setSelectedInvoiceId(next.id); setActiveVerticalCategoryId(next.verticalCategoryId || currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomer?.id || "default"}-default`); }
    setVerticalDeleteConfirmId(null);
    showToast("تم حذف الكشف.");
  };

  const applyAccountingRowFormat = (patch: Partial<AccountingSheetRow>) => {
    const currentRows = accountingDraftRowsRef.current;
    const targetIds = accountingSelectionMode
      ? accountingSelectedRowIds
      : currentRows[accountingSelectedRow] ? [currentRows[accountingSelectedRow].id] : [];
    if (!targetIds.length) {
      showToast(accountingSelectionMode ? "حدد صفاً واحداً على الأقل أولاً." : "حدد الصف المطلوب تنسيقه أولاً.");
      return;
    }
    const nextRows = currentRows.map((row) =>
      targetIds.includes(row.id) ? { ...row, ...patch } : row
    );
    persistAccountingRows(nextRows);
  };

  saveAccountingRows = async (): Promise<boolean> => {
    if (!accountingRowsDirty) {
      setAccountingSheetMode("view");
      return true;
    }
    if (!selectedCustomer || !updateCustomer) throw new Error("تحديث بيانات الزبون غير متاح.");
    const previousRows = (accountingOriginalRowsRef.current || []) as AccountingSheetRow[];
    const previousByIdForDates = new Map(previousRows.map(row => [row.id, row]));
    const savedAt = new Date().toISOString();
    const nextRows = accountingDraftRows.map(row => {
      const previous = previousByIdForDates.get(row.id);
      const isPurchase = !row.isSeparator && (row.details.trim() || row.total !== 0);
      const wasPurchase = previous && !previous.isSeparator && (previous.details.trim() || previous.total !== 0);
      if (wasPurchase && previous.createdAt) return { ...row, createdAt: previous.createdAt };
      return isPurchase && !wasPurchase ? { ...row, createdAt: previous ? savedAt : (row.createdAt || savedAt) } : row;
    });
    const nextSheets = currentAccountingSheets.map(sheet => ({
      ...sheet,
      ownerAccountId: selectedCustomer.id,
      ...(sheet.id === activeAccountingSheet?.id ? { rows: nextRows } : {}),
    }));
    await Promise.resolve(updateCustomer({
      ...selectedCustomer,
      accountingSheets: nextSheets,
      accountingSheetCategories: currentAccountingCategories.map(category => ({ ...category, ownerAccountId: selectedCustomer.id })),
      activeAccountingSheetId: activeAccountingSheet?.id,
      accountingSheetRows: flattenAccountingSheets(nextSheets),
    }));

    // Write accounting-list history independently from invoice/debt-sheet history.
    if (addChangeLog) {
      const previousById = new Map<string, AccountingSheetRow>(previousRows.map((row): [string, AccountingSheetRow] => [row.id, row]));
      const nextById = new Map<string, AccountingSheetRow>(nextRows.map((row): [string, AccountingSheetRow] => [row.id, row]));
      const entries: Array<Parameters<NonNullable<typeof addChangeLog>>[0]> = [];
      for (const row of nextRows) {
        const previous = previousById.get(row.id);
        const amount = Number(row.total) || (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
        const details = `القائمة الحسابية: ${row.details || "بند بدون تفاصيل"} — ${row.quantity} ${row.unit || "قطعة"} × ${formatThousands(Number(row.unitPrice || 0))} = ${formatThousands(amount)} ${settings.currency}`;
        if (!previous) {
          entries.push({ customerId: selectedCustomer.id, actionType: "إضافة دين", details, rawAmount: amount, itemName: row.details, targetItemId: row.id, location: nextRows.findIndex((item) => item.id === row.id) + 1, previousState: { ...row, afterDetails: row.details, afterQuantity: row.quantity, afterUnit: row.unit, afterUnitPrice: row.unitPrice, afterTotal: amount } });
          continue;
        }
        const oldAmount = Number(previous.total) || (Number(previous.quantity) || 0) * (Number(previous.unitPrice) || 0);
        if (previous.details !== row.details || Number(previous.quantity) !== Number(row.quantity) || previous.unit !== row.unit || Number(previous.unitPrice) !== Number(row.unitPrice)) {
          entries.push({ customerId: selectedCustomer.id, actionType: "تعديل دين", details: `القائمة الحسابية — تعديل: ${previous.details || "بدون تفاصيل"} (${formatThousands(oldAmount)} ${settings.currency}) ← ${row.details || "بدون تفاصيل"} (${formatThousands(amount)} ${settings.currency})`, rawAmount: amount, itemName: row.details, targetItemId: row.id, location: nextRows.findIndex((item) => item.id === row.id) + 1, previousState: { ...previous, afterDetails: row.details, afterQuantity: row.quantity, afterUnit: row.unit, afterUnitPrice: row.unitPrice, afterTotal: amount } });
        }
      }
      for (const row of previousRows) {
        if (!nextById.has(row.id)) {
          const amount = Number(row.total) || (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
          entries.push({ customerId: selectedCustomer.id, actionType: "حذف دين", details: `القائمة الحسابية: حذف ${row.details || "بند بدون تفاصيل"} — ${formatThousands(amount)} ${settings.currency}`, rawAmount: amount, itemName: row.details, targetItemId: row.id, location: previousRows.findIndex((item) => item.id === row.id) + 1, previousState: row });
        }
      }
      for (const entry of entries) {
        try { await addChangeLog(entry); }
        catch (logError) { console.warn("Accounting list saved, but a history entry could not be written:", logError); }
      }
    }

    setAccountingRowsDirty(false);
    accountingOriginalRowsRef.current = nextRows;
    setAccountingSheetMode("view");
    showToast("تم حفظ القائمة الحسابية وتسجيل التغييرات.");
    return true;
  };

  const cancelAccountingRows = () => {
    setAccountingDraftRows(accountingOriginalRowsRef.current);
    setAccountingRowsDirty(false);
    setAccountingRowDraft({ details: "", quantity: "1", unit: "قطعة", unitPrice: "" });
    setEditingAccountingRowId(null);
    setAccountingSheetMode("view");
    showToast("تم إلغاء التغييرات غير المحفوظة.");
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ledger-unsaved-change", {
      detail: {
        source: "accounting-sheet",
        dirty: accountingRowsDirty,
        label: "القائمة الحسابية",
        save: saveAccountingRows,
        cancel: cancelAccountingRows,
      },
    }));
    return () => {
      window.dispatchEvent(new CustomEvent("ledger-unsaved-change", { detail: { source: "accounting-sheet", dirty: false } }));
    };
  }, [accountingRowsDirty, accountingDraftRows, selectedCustomer?.id]);

  const saveAccountingRow = () => {
    if (!selectedCustomer) return;
    const details = accountingRowDraft.details.trim();
    const quantity = Number(accountingRowDraft.quantity);
    const unitPrice = Number(accountingRowDraft.unitPrice);
    if (!details || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      showToast("أدخل التفاصيل والكمية والسعر بشكل صحيح.");
      return;
    }
    const currentRows = accountingDraftRows;
    const row: AccountingSheetRow = {
      id: editingAccountingRowId || `asr-${Date.now()}`,
      details,
      quantity,
      unit: accountingRowDraft.unit.trim() || "قطعة",
      unitPrice,
      total: quantity * unitPrice,
    };
    persistAccountingRows(editingAccountingRowId
      ? currentRows.map((item) => item.id === editingAccountingRowId ? row : item)
      : [...currentRows, row]);
    setAccountingRowDraft({ details: "", quantity: "1", unit: "قطعة", unitPrice: "" });
    setEditingAccountingRowId(null);
    showToast(editingAccountingRowId ? "تم تعديل البند في المسودة؛ احفظ التغييرات لتثبيتها." : "تمت إضافة البند إلى المسودة؛ احفظ التغييرات لتثبيتها.");
  };

  const startEditAccountingRow = (row: AccountingSheetRow) => {
    setEditingAccountingRowId(row.id);
    setAccountingRowDraft({ details: row.details || "", quantity: String(row.quantity ?? 1), unit: row.unit || "قطعة", unitPrice: String(row.unitPrice ?? 0) });
  };

  const deleteAccountingRow = (rowId: string) => {
    if (!selectedCustomer) return;
    if (!window.confirm("هل تريد حذف هذا البند من القائمة الحسابية؟")) return;
    persistAccountingRows(accountingDraftRows.filter((row) => row.id !== rowId));
    if (editingAccountingRowId === rowId) {
      setEditingAccountingRowId(null);
      setAccountingRowDraft({ details: "", quantity: "1", unit: "قطعة", unitPrice: "" });
    }
    showToast("تم حذف البند من المسودة؛ احفظ التغييرات لتثبيتها.");
  };

  const insertAccountingRow = (position: "above" | "below") => {
    if (!selectedCustomer) return;
    const rows = [...accountingDraftRows];
    if (rows.length === 0) {
      rows.push({ id: "asr-" + selectedCustomer.id + "-" + Date.now(), details: "", quantity: 0, unit: "", unitPrice: 0, total: 0, isManual: true });
      setAccountingDraftRows(rows);
      persistAccountingRows(rows);
      setAccountingSelectedRow(0);
      window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-accounting-cell="0-details"]')?.focus(), 0);
      return;
    }
    const selectedIndex = Math.min(Math.max(0, accountingSelectedRow), rows.length - 1);
    const insertIndex = position === "above" ? selectedIndex : selectedIndex + 1;
    rows.splice(insertIndex, 0, { id: "asr-" + selectedCustomer.id + "-" + Date.now(), details: "", quantity: 0, unit: "", unitPrice: 0, total: 0, isManual: true });
    setAccountingDraftRows(rows);
    persistAccountingRows(rows);
    setAccountingSelectedRow(insertIndex);
    window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-accounting-cell="' + insertIndex + '-details"]')?.focus(), 0);
  };
  const moveAccountingSelectedRow = (direction: -1 | 1) => {
    const rows = [...accountingDraftRows]; const from = accountingSelectedRow; const to = from + direction;
    if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return;
    const item = rows[from]; rows[from] = rows[to]; rows[to] = item;
    setAccountingDraftRows(rows); persistAccountingRows(rows); setAccountingSelectedRow(to);
  };
  const deleteAccountingSelectedRow = () => {
    if (!selectedCustomer || accountingSelectedRow < 0 || accountingSelectedRow >= accountingDraftRows.length) { showToast("حدد صفاً فعلياً لحذفه أولاً."); return; }
    if (!window.confirm("هل تريد حذف الصف المحدد بالكامل من الجدول؟")) return;
    const rows = [...accountingDraftRows];
    rows.splice(accountingSelectedRow, 1);
    setAccountingDraftRows(rows);
    persistAccountingRows(rows);
    setAccountingSelectedRow(Math.min(Math.max(0, accountingSelectedRow - 1), Math.max(0, rows.length - 1)));
    if (editingAccountingRowId && !rows.some((row) => row.id === editingAccountingRowId)) setEditingAccountingRowId(null);
    showToast("تم حذف الصف بالكامل من الجدول.");
  };
  const clearAccountingSelectedAmount = () => {
    const selected = accountingDraftRows[accountingSelectedRow]; if (!selected || selected.isSeparator) return;
    const rows = accountingDraftRows.map((row, index) => index === accountingSelectedRow ? { ...row, unitPrice: 0, total: 0 } : row);
    setAccountingDraftRows(rows); persistAccountingRows(rows); showToast("تم تفريغ مبلغ الصف المحدد.");
  };
  const clearAccountingSheet = () => {
    if (!selectedCustomer || !window.confirm('هل تريد تفريغ جميع بنود القائمة الحسابية للزبون "' + selectedCustomer.name + '"؟')) return;
    setAccountingDraftRows([]); persistAccountingRows([]); setAccountingSelectedRow(0); showToast("تم تفريغ القائمة الحسابية.");
  };
  const handlePrintAccountingSheet = async () => {
    if (isAccountingPrinting) return; setIsAccountingPrinting(true);
    try { await printElement("accounting-report-document", { title: "قائمة_حسابية_" + (selectedCustomer?.name || "زبون") }); }
    catch (error) { console.error("Accounting sheet print failed:", error); showToast("تعذرت الطباعة. حاول مرة أخرى."); }
    finally { setIsAccountingPrinting(false); }
  };
  const handleExportAccountingSheetPDF = async () => {
    if (isAccountingExportingPDF) return; setIsAccountingExportingPDF(true);
    try { await exportElementToPDF("accounting-report-document", { filename: "قائمة_حسابية_" + (selectedCustomer?.name || "زبون") }); showToast("تم تجهيز طلب حفظ PDF."); }
    catch (error) { console.error("Accounting sheet PDF export failed:", error); showToast("تعذر حفظ PDF. حاول مرة أخرى."); }
    finally { setIsAccountingExportingPDF(false); }
  };

  // The accounting list is an independent customer-owned ledger and remains available even when empty.


  // Keep the selected statement inside the active category. A category with
  // no statements intentionally stays empty so its create action can be shown.
  useLayoutEffect(() => {
    if (selectedCustomerId && selectedCustomer) {
      const custInvs = invoices.filter((inv) => inv.customerId === selectedCustomerId && !inv.isDeleted);
      if (custInvs.length > 0) {
        const isCategoryScoped = ledgerDisplayMode === "vertical" && activeVerticalCategoryId !== "__all__";
        const scopedInvoices = isCategoryScoped
          ? custInvs.filter(invoice => activeVerticalCategoryId === "__uncategorized__" ? !getVerticalCategoryId(invoice) : getVerticalCategoryId(invoice) === activeVerticalCategoryId)
          : custInvs;
        if (scopedInvoices.length > 0) {
          if (!selectedInvoiceId || !scopedInvoices.some((inv) => inv.id === selectedInvoiceId)) setSelectedInvoiceId(scopedInvoices[0].id);
        } else if (isCategoryScoped && selectedInvoiceId && custInvs.some(invoice => invoice.id === selectedInvoiceId)) {
          setSelectedInvoiceId(null);
        }
      } else {
        const newInv = addInvoice({
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
          displayName: "كشف الحساب 1",
          verticalCategoryId: currentVerticalCategories.find(category => category.name === "تصنيف 1")?.id || currentVerticalCategories[0]?.id || `vertical-category-${selectedCustomer.id}-default`,
          date: new Date().toISOString().split("T")[0],
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone,
          customerAddress: selectedCustomer.address || "",
          items: [],
          grandTotal: 0,
          paidAmount: 0,
          remainingAmount: 0,
          notes: "",
          employeeName: "المحاسب",
          signature: "",
        });
        setSelectedInvoiceId(newInv.id);
      }
    }
  }, [selectedCustomerId, invoices, selectedInvoiceId, selectedCustomer, ledgerDisplayMode, activeVerticalCategoryId]);

  // --- ADVANCED COMMERCIAL ACCOUNTING STATES ---
  const [invColumns, setInvColumns] = useState<{ id: string; label: string; type: string; width?: string }[]>([
    { id: "amount", label: "المبلغ", type: "amount", width: "150px" },
    { id: "details", label: "البيـــــــــــــــــــــــــــــــــــان (التفاصيل)", type: "details" },
  ]);

  const [focusedRowIdx, setFocusedRowIdx] = useState<number | null>(null);

  // Undo/Redo stacks
  const [history, setHistory] = useState<{ items: any[]; paidAmount: number; columns: any[] }[]>([]);
  const [historyPointer, setHistoryPointer] = useState<number>(-1);

  // Excel paste modal state
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Editing column header state
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnLabel, setEditingColumnLabel] = useState("");

  // Helper to push history
  const pushHistory = (items: any[], paid: number, cols: any[]) => {
    const newHistory = history.slice(0, historyPointer + 1);
    newHistory.push({
      items: JSON.parse(JSON.stringify(items)),
      paidAmount: paid,
      columns: JSON.parse(JSON.stringify(cols)),
    });
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    setHistory(newHistory);
    setHistoryPointer(newHistory.length - 1);
  };

  const getGrandTotal = (items: any[]) => {
    return items
      .filter((item) => item && item.details && item.details.trim() !== "" && !item.isPaymentRow && !item.isRemainingRow && !item.isSeparator)
      .reduce((acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  };

  const handleUndo = () => {
    if (historyPointer > 0) {
      const prev = history[historyPointer - 1];
      setNewInvItems(prev.items);
      setNewInvPaidAmount(prev.paidAmount);
      setInvColumns(prev.columns);
      setHistoryPointer(historyPointer - 1);
    }
  };

  const handleRedo = () => {
    if (historyPointer < history.length - 1) {
      const next = history[historyPointer + 1];
      setNewInvItems(next.items);
      setNewInvPaidAmount(next.paidAmount);
      setInvColumns(next.columns);
      setHistoryPointer(historyPointer + 1);
    }
  };

  // Keyboard undo/redo listener
  React.useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (!isAddingInvoice && !editingInvoice) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDownGlobal);
    return () => window.removeEventListener("keydown", handleKeyDownGlobal);
  }, [isAddingInvoice, editingInvoice, historyPointer, history]);

  // Customer summaries come from the two debt ledgers; payment view-models are only for receipt display.
  const getCustomerStats = (custId: string) => {
    const custInvoices = invoices.filter((inv) => !inv.isDeleted && inv.customerId === custId);
    const customer = customers.find((entry) => entry.id === custId);
    const custPayments = payments.filter((payment) => payment.customerId === custId);
    const totals = customer
      ? getCustomerLedgerTotals(customer, invoices)
      : { sales: 0, paid: 0, remaining: 0, capital: 0, quantity: 0 };

    return {
      totalDebts: totals.sales,
      totalPaid: totals.paid,
      totalRemaining: totals.remaining,
      invoiceCount: custInvoices.length,
      custInvoices,
      custPayments,
    };
  };

  // --- INDEPENDENT SEQUENCE PER FOLDER (تسلسل مستقل لكل حافظة) ---
  // Group customers by folder and sort them stably to establish an independent 1-based sequence
  const folderCustomersMap = useMemo(() => {
    const map = new Map<string, Customer[]>();
    customers.filter((c) => !c.isDeleted).forEach((c) => {
      const fId = c.folderId || "none";
      if (!map.has(fId)) {
        map.set(fId, []);
      }
      map.get(fId)!.push(c);
    });

    // Sort each folder's list: by explicit sequence if defined, otherwise by creation order / original index
    map.forEach((list) => {
      list.sort((a, b) => {
        if (a.sequence !== undefined && b.sequence !== undefined) {
          return a.sequence - b.sequence;
        }
        if (a.sequence !== undefined) return -1;
        if (b.sequence !== undefined) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    });

    return map;
  }, [customers]);

  // Lookup sequence information for any customer within their folder
  const getCustomerSequenceInFolder = (customer: Customer): { seq: number; folderName: string; totalInFolder: number } => {
    const fId = customer.folderId || "none";
    const list = folderCustomersMap.get(fId) || [];
    const idx = list.findIndex((c) => c.id === customer.id);
    const seq = customer.sequence !== undefined && customer.sequence > 0
      ? customer.sequence
      : (idx >= 0 ? idx + 1 : 1);

    const folder = folders.find((f) => f.id === customer.folderId);
    const folderName = folder ? folder.name : "الحافظة العامة";
    return { seq, folderName, totalInFolder: list.length };
  };

  const handleOpenSequenceModal = (customer: Customer) => {
    const seqInfo = getCustomerSequenceInFolder(customer);
    setSequenceModal({
      isOpen: true,
      customer,
      currentSeq: seqInfo.seq,
      totalInFolder: seqInfo.totalInFolder,
      folderName: seqInfo.folderName,
      targetSeq: seqInfo.seq,
    });
  };

  const handleSaveCustomerSequence = (customer: Customer, targetSeq: number) => {
    if (!updateCustomer) return;
    const fId = customer.folderId || "none";
    const list = [...(folderCustomersMap.get(fId) || [])];
    const currentIndex = list.findIndex((c) => c.id === customer.id);
    if (currentIndex === -1) return;

    const clampedSeq = Math.max(1, Math.min(targetSeq, list.length));
    const [moved] = list.splice(currentIndex, 1);
    list.splice(clampedSeq - 1, 0, moved);

    // Re-index all customers in this folder to ensure consecutive 1..N numbers
    list.forEach((c, idx) => {
      const assigned = idx + 1;
      updateCustomer({ ...c, sequence: assigned });
    });

    const seqInfo = getCustomerSequenceInFolder(customer);
    showToast(`تم تعيين تسلسل الزبون "${customer.name}" إلى رقم #${clampedSeq} في حافظة "${seqInfo.folderName}" بنجاح!`);
    setSequenceModal(null);
  };

  const handleSaveSequenceModal = () => {
    if (!sequenceModal) return;
    handleSaveCustomerSequence(sequenceModal.customer, sequenceModal.targetSeq);
  };

  const handleMoveCustomerSequence = (customer: Customer, direction: "up" | "down") => {
    if (!updateCustomer) return;
    const fId = customer.folderId || "none";
    const list = [...(folderCustomersMap.get(fId) || [])];
    const currentIndex = list.findIndex((c) => c.id === customer.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const [moved] = list.splice(currentIndex, 1);
    list.splice(targetIndex, 0, moved);

    list.forEach((c, idx) => {
      const assigned = idx + 1;
      updateCustomer({ ...c, sequence: assigned });
    });

    showToast(`تم ${direction === "up" ? "تقديم" : "تأخير"} تسلسل "${customer.name}" إلى #${targetIndex + 1}`);
  };

  // Filter and sort customers by search, selected folder, and independent sequence
  const filteredCustomers = useMemo(() => {
    const list = customers.filter((c) => !c.isDeleted).filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        (c.address && c.address.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (selectedFolderId === "all") return true;
      if (selectedFolderId === "uncategorized") return !c.folderId;
      return c.folderId === selectedFolderId;
    });

    return list.sort((a, b) => {
      const seqA = getCustomerSequenceInFolder(a);
      const seqB = getCustomerSequenceInFolder(b);

      if (selectedFolderId !== "all") {
        return seqA.seq - seqB.seq;
      }

      const fA = a.folderId || "none";
      const fB = b.folderId || "none";
      if (fA !== fB) {
        return fA.localeCompare(fB);
      }
      return seqA.seq - seqB.seq;
    });
  }, [customers, searchQuery, selectedFolderId, folders, folderCustomersMap]);

  // Form helpers
  const handleStartEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setIsAddingInvoice(false);
    setIsRecordingPayment(false);

    // Pre-fill fields
    setNewInvDate(inv.date);
    setNewInvDueDate(inv.dueDate || "");
    setNewInvNumber(inv.invoiceNumber);
    setNewInvPaidAmount(inv.paidAmount);
    setNewInvNotes(inv.notes || "");
    setNewInvEmployee(inv.employeeName || "");
    setNewInvSignature(inv.signature || "موقع إلكترونياً");

    // Copy columns
    const defaultCols = [
      { id: "amount", label: "المبلغ", type: "amount", width: "150px" },
      { id: "details", label: "البيـــــــــــــــــــــــــــــــــــان (التفاصيل)", type: "details" },
    ];
    const loadedCols = inv.columns || defaultCols;
    setInvColumns(loadedCols);

    // Copy items, retaining accounting separators properly, and pad with empty rows up to 12 rows total
    const existingItems = inv.items.map((item) => {
      if (item.isSeparator) {
        return {
          id: item.id || `sep-${Date.now()}`,
          details: item.details || "فاصلة حساب",
          quantity: 1,
          unitPrice: 0,
          total: 0,
          isSeparator: true,
          paidAmount: Number(item.paidAmount) || 0,
          subtotal: Number(item.subtotal) || 0,
          remainingAmount: Number(item.remainingAmount) || 0,
          paidDate: item.paidDate || getCurrentDateFormatted(),
          paidDay: item.paidDay || getArabicDayName(item.paidDate || getCurrentDateFormatted()),
          paidTime: item.paidTime || getCurrentTimeFormatted(),
          paidNote: item.paidNote || "",
        };
      }
      const itemCopy: any = {
        details: item.details,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      };
      // copy extra fields
      Object.keys(item).forEach((k) => {
        if (!["details", "productId", "quantity", "unitPrice", "total", "id", "isSeparator"].includes(k)) {
          itemCopy[k] = item[k];
        }
      });
      return itemCopy;
    });

    const calculatedItems = calculateCumulativeSeparators(existingItems);
    const paddedItems = [
      ...calculatedItems,
      ...Array.from({ length: Math.max(0, 12 - calculatedItems.length) }, () => ({
        details: "",
        quantity: 1,
        unitPrice: 0,
      }))
    ];
    setNewInvItems(paddedItems);
    setHistory([{ items: JSON.parse(JSON.stringify(paddedItems)), paidAmount: inv.paidAmount, columns: JSON.parse(JSON.stringify(loadedCols)) }]);
    setHistoryPointer(0);
  };

  const handleAddItem = () => {
    const items = [...newInvItems, { details: "", quantity: 1, unitPrice: 0 }];
    const calculated = calculateCumulativeSeparators(items);
    setNewInvItems(calculated);
    pushHistory(calculated, newInvPaidAmount, invColumns);
  };

  const handleAddSeparatorRow = (afterIndex?: number) => {
    const todayDate = getCurrentDateFormatted();
    const dayName = getArabicDayName(todayDate);
    const timeStr = getCurrentTimeFormatted();

    const newSeparator: any = {
      id: `sep-${Date.now()}`,
      details: "فاصلة حساب",
      quantity: 1,
      unitPrice: 0,
      total: 0,
      isSeparator: true,
      paidAmount: 0,
      paidDate: todayDate,
      paidDay: dayName,
      paidTime: timeStr,
      paidNote: "",
    };

    let updatedItems = [...newInvItems];
    if (typeof afterIndex === "number" && afterIndex >= 0 && afterIndex < updatedItems.length) {
      updatedItems.splice(afterIndex + 1, 0, newSeparator);
    } else {
      // Find the last filled item to insert after it, or append
      const lastFilledIdx = updatedItems.reduce((lastIdx, item, idx) => {
        return ((item.details && item.details.trim() !== "") || item.isSeparator) ? idx : lastIdx;
      }, -1);

      if (lastFilledIdx >= 0) {
        updatedItems.splice(lastFilledIdx + 1, 0, newSeparator);
      } else {
        updatedItems.unshift(newSeparator);
      }
    }

    const calculated = calculateCumulativeSeparators(updatedItems);
    setNewInvItems(calculated);
    pushHistory(calculated, newInvPaidAmount, invColumns);
  };

  const handleUpdateSeparatorPaid = (index: number, paidValue: number) => {
    const items = [...newInvItems];
    items[index] = {
      ...items[index],
      paidAmount: Number(paidValue) || 0,
    };
    const calculated = calculateCumulativeSeparators(items);
    setNewInvItems(calculated);

    // Automatically sync total paid amount from all separators if present
    const totalSeparatorsPaid = calculated
      .filter((it) => it.isSeparator)
      .reduce((sum, it) => sum + (Number(it.paidAmount) || 0), 0);
    if (totalSeparatorsPaid > 0)…74380 tokens truncated…                                                 if (col.id === "details") {
                                                      return (
                                                        <td key={col.id} className="py-1.5 px-3 border-l border-slate-800 text-right font-bold text-slate-800 text-xs">
                                                          المجموع
                                                        </td>
                                                      );
                                                    }
                                                    return (
                                                      <td key={col.id} className="py-1.5 px-2 border-l border-slate-800 text-center text-xs text-slate-400 font-mono">
                                                        -
                                                      </td>
                                                    );
                                                  })}
                                                </tr>

                                                {/* 2. الواصل (Paid Amount) aligned with renderCols */}
                                                <tr className="bg-[#faf8f4]/90 text-slate-900 font-bold select-text">
                                                  {renderCols.map((col) => {
                                                    if (col.id === "amount") {
                                                      return (
                                                        <td key={col.id} className="py-1.5 px-3 border-l border-slate-800 text-center font-mono font-bold text-emerald-800 text-sm">
                                                          {formatThousands((Number(item.paidAmount) || 0))} <span className="text-[11px] text-emerald-700 font-sans font-normal">{settings.currency}</span>
                                                        </td>
                                                      );
                                                    }
                                                    if (col.id === "details") {
                                                      return (
                                                        <td key={col.id} className="py-1.5 px-3 border-l border-slate-800 text-right text-xs">
                                                          <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
                                                            <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">
                                                              الواصل
                                                            </span>
                                                            <span className="font-medium text-slate-700 whitespace-nowrap shrink-0 text-[11px]">
                                                              ( يوم {autoDay} بتاريخ <span dir="ltr" className="font-mono">{autoDate}</span>{autoTime ? ` — الساعة ${autoTime}` : ""} )
                                                            </span>
                                                          </div>
                                                        </td>
                                                      );
                                                    }
                                                    return (
                                                      <td key={col.id} className="py-1.5 px-2 border-l border-slate-800 text-center text-xs text-slate-400 font-mono">
                                                        -
                                                      </td>
                                                    );
                                                  })}
                                                </tr>

                                                {/* Divider line spanning entire table width */}
                                                <tr className="bg-[#faf8f4]/90">
                                                  <td colSpan={renderCols.length} className="p-0 border-l border-slate-800">
                                                    <div className="w-full h-[1.5px] bg-slate-700/80"></div>
                                                  </td>
                                                </tr>

                                                {/* 3. المتبقي (Remaining) aligned with renderCols */}
                                                <tr className="bg-black/5 border-b border-slate-700 text-slate-950 font-black select-text">
                                                  {renderCols.map((col) => {
                                                    if (col.id === "amount") {
                                                      return (
                                                        <td key={col.id} className="py-2 px-3 border-l border-slate-800 text-center font-mono font-black text-slate-950 text-base bg-black/5">
                                                          {formatThousands((item.remainingAmount || 0))} <span className="text-[11px] text-slate-700 font-sans font-normal">{settings.currency}</span>
                                                        </td>
                                                      );
                                                    }
                                                    if (col.id === "details") {
                                                      return (
                                                        <td key={col.id} className="py-2 px-3 border-l border-slate-800 text-right text-xs font-black text-slate-950">
                                                          <div className="flex items-center gap-2">
                                                            <span>المتبقي</span>
                                                            {(item.remainingAmount || 0) === 0 ? (
                                                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-sans">
                                                                مسدد بالكامل ✓
                                                              </span>
                                                            ) : (
                                                              <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full font-sans">
                                                                مطلوب بذمة الزبون
                                                              </span>
                                                            )}
                                                          </div>
                                                        </td>
                                                      );
                                                    }
                                                    return (
                                                      <td key={col.id} className="py-2 px-2 border-l border-slate-800 text-center text-xs text-slate-400 font-mono">
                                                        -
                                                      </td>
                                                    );
                                                  })}
                                                </tr>
                                              </React.Fragment>
                                            );
                                          }

                                          const isSpecial = item.isPaymentRow || item.isRemainingRow;
                                          return (
                                            <tr
                                              key={item.id || `item-${globalIdx}`}
                                              className={`hover:bg-[#fcfbf4] border-b border-dashed border-slate-300 h-9 text-slate-900 font-bold ${item.isPaymentRow ? "bg-emerald-50/50 text-emerald-900 font-extrabold" : item.isRemainingRow ? "bg-rose-50/50 text-rose-900 font-extrabold" : ""}`}
                                            >
                                              {renderCols.map((col) => {
                                                if (col.id === "num") {
                                                  return (
                                                    <td key={col.id} className="py-1 px-1.5 border-l border-slate-800 text-center text-[11px] text-slate-500 font-sans">
                                                      {arabicNum}
                                                    </td>
                                                  );
                                                }
                                                if (col.id === "amount") {
                                                  return (
                                                    <td key={col.id} className="py-1 px-3 border-l border-slate-800 text-center font-mono font-black text-slate-900 bg-slate-50/20">
                                                      {formatThousands(item.total)}
                                                    </td>
                                                  );
                                                }
                                                if (col.id === "details") {
                                                  return (
                                                    <td key={col.id} className="py-1 px-3 border-l border-slate-800 text-right text-xs text-slate-900 font-sans">
                                                      {item.details}
                                                    </td>
                                                  );
                                                }
                                                if (col.id === "quantity") {
                                                  return (
                                                    <td key={col.id} className="py-1 px-2 border-l border-slate-800 text-center text-xs text-slate-900 font-mono">
                                                      {isSpecial ? "-" : item.quantity}
                                                    </td>
                                                  );
                                                }
                                                if (col.id === "unitPrice") {
                                                  return (
                                                    <td key={col.id} className="py-1 px-3 border-l border-slate-800 text-center text-xs text-slate-800 font-mono">
                                                      {isSpecial ? "-" : formatThousands(item.unitPrice)}
                                                    </td>
                                                  );
                                                }
                                                return (
                                                  <td key={col.id} className="py-1 px-2 border-l border-slate-800 text-center text-xs text-slate-800">
                                                    {item[col.id] || "-"}
                                                  </td>
                                                );
                                              })}
                                            </tr>
                                          );
                                        } else {
                                          return (
                                            <tr key={`empty-${globalIdx}`} className="border-b border-dashed border-slate-200 h-9">
                                              {renderCols.map((col) => {
                                                if (col.id === "num") {
                                                  return (
                                                    <td key={col.id} className="py-1 px-1.5 border-l border-slate-800 text-center text-[11px] text-slate-400 font-sans">
                                                      {arabicNum}
                                                    </td>
                                                  );
                                                }
                                                return (
                                                  <td key={col.id} className="py-1 px-2 border-l border-slate-800 text-center text-xs text-slate-400"></td>
                                                );
                                              })}
                                            </tr>
                                          );
                                        }
                                      })}

                                      {/* Grand total row at bottom of the LAST page */}
                                      {page.isLastPage && (
                                        <tr className="border-t-2 border-slate-800 bg-slate-100 font-black text-xs">
                                          {renderCols.map((col) => {
                                            if (col.id === "num") {
                                              return (
                                                <td key={col.id} className="py-2 px-1.5 border-l border-slate-800 text-center font-sans">
                                                  -
                                                </td>
                                              );
                                            }
                                            if (col.id === "amount") {
                                              return (
                                                <td key={col.id} className="py-2 px-3 border-l border-slate-800 text-center text-slate-950 font-mono font-black bg-[#fafafa]">
                                                  {formatThousands(currentInvoice.grandTotal)}
                                                </td>
                                              );
                                            }
                                            if (col.id === "details") {
                                              return (
                                                <td key={col.id} className="py-2 px-4 border-l border-slate-800 text-right text-slate-950 text-sm font-bold font-sans">
                                                  الـمـجـمـوع الكلي (Total)
                                                </td>
                                              );
                                            }
                                            return (
                                              <td key={col.id} className="py-2 px-1 border-l border-slate-800 text-center font-mono">
                                                -
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>

                                {/* 3. Receipt Book Bottom Layout (Notes & Signatures on Last Page, or Continuation on earlier pages) */}
                                {page.isLastPage ? (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t-2 border-slate-800">
                                    {/* Notes and Statement Details */}
                                    <div className="space-y-2">
                                      {currentInvoice.notes && (
                                        <div className="p-2.5 bg-slate-50 border border-slate-300 rounded text-xs">
                                          <span className="font-extrabold text-slate-700 block mb-0.5">ملاحظات:</span>
                                          <span className="text-slate-800 font-medium">{currentInvoice.notes}</span>
                                        </div>
                                      )}
                                      <div className="border border-slate-800 p-2 bg-[#fafafa] rounded text-[10px] space-y-1 text-slate-600 font-medium">
                                        <p className="flex justify-between">
                                          <span>المجموع الأصلي:</span>
                                          <span className="font-mono font-bold text-slate-900">{formatThousands(currentInvoice.grandTotal)} {settings.currency}</span>
                                        </p>
                                        <p className="flex justify-between text-blue-700 font-bold">
                                          <span>المسدد نقداً:</span>
                                          <span className="font-mono">{formatThousands(currentInvoice.paidAmount)} {settings.currency}</span>
                                        </p>
                                        <p className="flex justify-between text-rose-700 font-extrabold border-t border-dashed border-slate-300 pt-0.5">
                                          <span>الصافي المتبقي بالذمة:</span>
                                          <span className="font-mono">{formatThousands(currentInvoice.remainingAmount)} {settings.currency}</span>
                                        </p>
                                      </div>
                                    </div>

                                    {/* Traditional Arabic Footer items */}
                                    <div className="flex flex-col justify-between items-stretch text-xs font-black text-slate-800 pt-2 pr-2">
                                      <div className="flex justify-between items-center w-full">
                                        <span className="font-sans">الخطأ والسهو مرجوع للطرفين</span>
                                        <div className="text-left flex flex-col items-center">
                                          <span className="font-sans">التوقيع</span>
                                          <div className="w-24 border-b border-dashed border-slate-800 mt-5"></div>
                                        </div>
                                      </div>
                                      <div className="text-center text-[9px] text-slate-400 font-sans pt-4 mt-auto">
                                        حررت هذه القائمة آلياً وتخضع لتعليمات الرقابة الضريبية والمحاسبية لعام 2026.
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap justify-between items-center text-xs text-slate-600 font-bold border-t border-dashed border-slate-400 pt-2 gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-700 font-sans">يتبع في الصفحة التالية...</span>
                                      <button
                                        type="button"
                                        onClick={() => handleNextPage(page.totalPages)}
                                        className="no-print inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black rounded-lg text-xs cursor-pointer shadow-xs transition-colors"
                                        title="الانتقال إلى الصفحة التالية مع حركة تقليب الورقة"
                                      >
                                        <span>الانتقال للورقة التالية ({page.pageNum + 1})</span>
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <span className="font-mono text-slate-900 bg-slate-200/60 px-2 py-0.5 rounded text-[11px]">
                                      صفحة {page.pageNum} من {page.totalPages}
                                    </span>
                                  </div>
                                )}

                              </div>
                            </div>
                          );

                          return (
                            <div>
                              {pageViewMode === "flip" && !isExportingPDF && !isPrinting ? (
                                <>
                                  <div style={{ perspective: "1600px" }} className="relative no-print">
                                    <AnimatePresence mode="wait" custom={pageFlipDirection}>
                                      <motion.div
                                        key={`paper-page-motion-${activePage.pageNum}`}
                                        custom={pageFlipDirection}
                                        initial={(dir) => ({
                                          rotateY: dir === "next" ? 65 : -65,
                                          opacity: 0.35,
                                          scale: 0.96,
                                          transformOrigin: dir === "next" ? "right center" : "left center",
                                          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                                        })}
                                        animate={{
                                          rotateY: 0,
                                          opacity: 1,
                                          scale: 1,
                                          boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.08)",
                                          transition: {
                                            duration: 0.45,
                                            ease: [0.22, 1, 0.36, 1],
                                          },
                                        }}
                                        exit={(dir) => ({
                                          rotateY: dir === "next" ? -65 : 65,
                                          opacity: 0.25,
                                          scale: 0.96,
                                          transformOrigin: dir === "next" ? "left center" : "right center",
                                          transition: {
                                            duration: 0.35,
                                            ease: [0.4, 0, 0.2, 1],
                                          },
                                        })}
                                        style={{
                                          transformStyle: "preserve-3d",
                                        }}
                                        className="relative"
                                      >
                                        {isPageFlipping && (
                                          <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 0.25 }}
                                            exit={{ opacity: 0 }}
                                            className="absolute inset-0 bg-gradient-to-r from-slate-900/20 via-slate-900/5 to-transparent pointer-events-none z-30 rounded-md"
                                          />
                                        )}
                                        {renderPageSheet(activePage)}
                                      </motion.div>
                                    </AnimatePresence>
                                  </div>

                                  {/* أثناء الطباعة العادية عبر المتصفح: يتم إخراج جميع صفحات A4 كاملة بالتتابع */}
                                  <div className="hidden print:block space-y-10">
                                    {ledgerPages.map((page) => renderPageSheet(page))}
                                  </div>
                                </>
                              ) : (
                                <div className="space-y-10">
                                  {ledgerPages.map((page) => renderPageSheet(page))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        </div>
                      </div>

                      {/* 📄 شريط التنقل السفلي بين الصفحات (Bottom Page Navigation) */}
                      {(() => {
                        const displayedItems = getDisplayedItems(currentInvoice);
                        const ledgerPages = paginateLedgerItems(displayedItems);
                        const totalLedgerPages = Math.max(1, ledgerPages.length);
                        const safePageNum = Math.min(Math.max(1, currentLedgerPage), totalLedgerPages);

                        return (
                          <div className="mt-4 p-3 bg-white rounded-xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3 no-print select-none">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handlePrevPage}
                                disabled={safePageNum <= 1}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  safePageNum <= 1
                                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                                    : "bg-slate-900 hover:bg-slate-800 text-white shadow-xs active:scale-95"
                                }`}
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                                <span>الصفحة السابقة</span>
                              </button>
                              <span className="text-xs font-bold text-slate-700 font-mono px-3 py-1 bg-slate-100 rounded-md border border-slate-200">
                                ورقة {safePageNum} من {totalLedgerPages}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleNextPage(totalLedgerPages)}
                                disabled={safePageNum >= totalLedgerPages}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  safePageNum >= totalLedgerPages
                                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                                    : "bg-slate-900 hover:bg-slate-800 text-white shadow-xs active:scale-95"
                                }`}
                              >
                                <span>الصفحة التالية</span>
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                              <span className="hidden sm:inline">
                                ⌨️ يمكنك استخدام مفاتيح الأسهم [←] و [→] في لوحة المفاتيح لقلب الصفحات
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>

      {/* MODAL: FOLDER OPTIONS (3-DOTS DIALOG) */}
      {folderOptionsModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-right">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <Folder className="w-5 h-5 text-amber-600 fill-amber-500/20" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">خيارات المجلد</h3>
                  <p className="text-[11px] text-slate-500 font-bold max-w-[200px] truncate">
                    {folderOptionsModal.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFolderOptionsModal(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Folder stats info badge */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 my-3 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">عدد الزبائن في المجلد:</span>
              <span className="text-xs font-bold font-mono text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {customers.filter((c) => c.folderId === folderOptionsModal.id).length} زبائن
              </span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-1.5">
              {/* إعادة ترتيب الحافظة */}
              <div className="bg-amber-50/70 p-2 rounded-xl border border-amber-200/70 mb-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 mb-1.5 px-1">
                  <span className="flex items-center gap-1">
                    <GripVertical className="w-3 h-3 text-amber-700" />
                    مكان وترتيب الحافظة:
                  </span>
                  <span className="text-[10px] text-amber-700 font-mono">
                    الموقع {folders.findIndex((f) => f.id === folderOptionsModal.id) + 1} من {folders.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={folders.findIndex((f) => f.id === folderOptionsModal.id) === 0}
                    onClick={() => {
                      const idx = folders.findIndex((f) => f.id === folderOptionsModal.id);
                      if (idx > 0) {
                        handleReorderFolder(idx, idx - 1);
                      }
                    }}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 bg-white hover:bg-amber-100/80 text-slate-700 hover:text-amber-900 disabled:opacity-40 disabled:pointer-events-none rounded-lg text-xs font-bold border border-slate-200 hover:border-amber-300 transition-colors shadow-2xs"
                    title="نقل الحافظة خطوة للأمام"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-amber-700" />
                    <span>تقديم للأمام</span>
                  </button>

                  <button
                    type="button"
                    disabled={folders.findIndex((f) => f.id === folderOptionsModal.id) === folders.length - 1}
                    onClick={() => {
                      const idx = folders.findIndex((f) => f.id === folderOptionsModal.id);
                      if (idx !== -1 && idx < folders.length - 1) {
                        handleReorderFolder(idx, idx + 1);
                      }
                    }}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 bg-white hover:bg-amber-100/80 text-slate-700 hover:text-amber-900 disabled:opacity-40 disabled:pointer-events-none rounded-lg text-xs font-bold border border-slate-200 hover:border-amber-300 transition-colors shadow-2xs"
                    title="نقل الحافظة خطوة للخلف"
                  >
                    <span>تأخير للخلف</span>
                    <ChevronLeft className="w-3.5 h-3.5 text-amber-700" />
                  </button>
                </div>
              </div>

              {/* 1. إعادة تسمية المجلد */}
              <button
                type="button"
                onClick={() => {
                  const f = folderOptionsModal;
                  setFolderOptionsModal(null);
                  openRenameModal("folder", f.id, f.name);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-transparent hover:border-blue-100"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 text-right">
                  <p className="leading-tight">إعادة تسمية المجلد</p>
                  <p className="text-[10px] text-slate-400 font-normal">تغيير اسم المجلد الحالي</p>
                </div>
              </button>

              {/* 2. نسخ اسم المجلد */}
              <button
                type="button"
                onClick={() => {
                  const f = folderOptionsModal;
                  setFolderOptionsModal(null);
                  handleCopyText(f.name, "اسم المجلد");
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-transparent hover:border-emerald-100"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Copy className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 text-right">
                  <p className="leading-tight">نسخ اسم المجلد</p>
                  <p className="text-[10px] text-slate-400 font-normal">نسخ الاسم إلى الحافظة</p>
                </div>
              </button>

              {/* 3. مشاركة كشف المجلد */}
              <button
                type="button"
                onClick={() => {
                  const f = folderOptionsModal;
                  setFolderOptionsModal(null);
                  handleShareFolder(f);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-transparent hover:border-indigo-100"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Share2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 text-right">
                  <p className="leading-tight">مشاركة كشف المجلد</p>
                  <p className="text-[10px] text-slate-400 font-normal">إرسال كشف الزبائن والديون عبر واتساب</p>
                </div>
              </button>

              {/* 4. حذف المجلد */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const f = folderOptionsModal;
                    setFolderOptionsModal(null);
                    handleDeleteFolder(f.id);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 text-right">
                    <p className="leading-tight">حذف المجلد</p>
                    <p className="text-[10px] text-rose-400 font-normal">حذف التصنيف (يبقى الزبائن بدون حذف)</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD CUSTOMER MODAL */}
      {isAddCustomerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">إضافة زبون جديد</h3>
                  <p className="text-[10px] text-slate-400">فتح سجل جديد في دفتر الديون</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCustomerModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الزبون / العميل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد عبد الله العبيدي"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                <input
                  type="tel"
                  placeholder="0770xxxxxxx"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموقع / العنوان</label>
                <input
                  type="text"
                  placeholder="بغداد - الكرادة / شارع الصناعة"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المجلد التابع له</label>
                <select
                  value={newCustFolderId}
                  onChange={(e) => setNewCustFolderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-all cursor-pointer"
                >
                  <option value="all">بدون مجلد محدد (عام)</option>
                  {folders.filter((f) => f.id !== "all").map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  حفظ وفتح الدفتر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD FOLDER MODAL */}
      {isAddFolderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">إضافة مجلد جديد</h3>
                  <p className="text-[10px] text-slate-400">تصنيف الزبائن لتسهيل إدارة الديون</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddFolderModalOpen(false);
                  setNewFolderParentId(null);
                }}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المجلد *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: تجار الجملة، زبائن الكرخ، أقساط شهرية..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المجلد الرئيسي (الأب - اختياري للتفرع الشجري)</label>
                <select
                  value={newFolderParentId || ""}
                  onChange={(e) => setNewFolderParentId(e.target.value ? e.target.value : null)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all cursor-pointer font-sans"
                >
                  <option value="">📁 مجلد رئيسي (المستوى الأول)</option>
                  {folders.filter((f) => f.id !== "all").map((f) => (
                    <option key={f.id} value={f.id}>
                      📂 داخل: {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">لون المجلد</label>
                <div className="flex items-center gap-2">
                  {[
                    { id: "amber", name: "عنبري", bg: "bg-amber-500" },
                    { id: "blue", name: "أزرق", bg: "bg-blue-500" },
                    { id: "emerald", name: "أخضر", bg: "bg-emerald-500" },
                    { id: "purple", name: "بنفسجي", bg: "bg-purple-500" },
                    { id: "rose", name: "وردي", bg: "bg-rose-500" },
                  ].map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setNewFolderColor(color.id)}
                      className={`w-7 h-7 rounded-full ${color.bg} flex items-center justify-center transition-transform cursor-pointer ${
                        newFolderColor === color.id ? "ring-2 ring-offset-2 ring-slate-800 scale-110" : "opacity-75 hover:opacity-100"
                      }`}
                      title={color.name}
                    >
                      {newFolderColor === color.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddFolderModalOpen(false);
                    setNewFolderParentId(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  إنشاء المجلد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RENAME MODAL (CUSTOMER OR FOLDER) */}
      {renameModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">
                  {renameModal.type === "customer" ? "إعادة تسمية الزبون" : "إعادة تسمية المجلد"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRenameModal(null)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (renameModal.type === "customer") {
                  handleRenameCustomer(renameModal.id, renameInputVal);
                } else {
                  handleRenameFolder(renameModal.id, renameInputVal);
                }
                setRenameModal(null);
              }}
              className="space-y-4 mt-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">الاسم الجديد:</label>
                <input
                  type="text"
                  required
                  value={renameInputVal}
                  onChange={(e) => setRenameInputVal(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  autoFocus
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameModal(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
                >
                  حفظ التسمية الجديدة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: MOVE CUSTOMER TO FOLDER */}
      {moveModal?.isOpen && moveModal.customer && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <MoveRight className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">نقل الزبون إلى مجلد</h3>
              </div>
              <button
                type="button"
                onClick={() => setMoveModal(null)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 mt-4">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <p className="text-[10px] text-slate-400">الزبون الحالي:</p>
                <p className="text-xs font-bold text-slate-800">{moveModal.customer.name}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اختر المجلد الوجهة:</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  <label className="flex items-center gap-2.5 p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="targetFolder"
                      checked={moveModal.targetFolderId === "none" || !moveModal.targetFolderId}
                      onChange={() => setMoveModal({ ...moveModal, targetFolderId: "none" })}
                    />
                    <span className="text-xs font-bold text-slate-700">بدون مجلد محدد (عام)</span>
                  </label>
                  {folders.filter((f) => f.id !== "all").map((f) => (
                    <label key={f.id} className="flex items-center gap-2.5 p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
                      <input
                        type="radio"
                        name="targetFolder"
                        checked={moveModal.targetFolderId === f.id}
                        onChange={() => setMoveModal({ ...moveModal, targetFolderId: f.id })}
                      />
                      <span className="text-xs font-bold text-slate-700">{f.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMoveModal(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (moveModal.customer) {
                      handleMoveCustomer(moveModal.customer.id, moveModal.targetFolderId);
                    }
                    setMoveModal(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs cursor-pointer"
                >
                  تأكيد النقل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: SHARE MODAL */}
      {shareModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">{shareModal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShareModal(null)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-[11px] text-slate-500">نص التقرير والبيانات الجاهزة للمشاركة:</p>
              <textarea
                readOnly
                value={shareModal.text}
                rows={8}
                className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 focus:outline-none select-all resize-none"
              />

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleCopyText(shareModal.text, "نص التقرير");
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ النص</span>
                </button>

                <a
                  href={`https://wa.me/${shareModal.phone ? shareModal.phone.replace(/[^0-9]/g, '') : ''}?text=${encodeURIComponent(shareModal.text)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>مشاركة عبر واتساب</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}


      {profileCustomerId && selectedCustomer?.id === profileCustomerId && (
        <CustomerProfileModal folders={folders} customer={selectedCustomer} invoices={invoices} payments={payments} currency={settings.currency} onSave={updateCustomer} onClose={() => setProfileCustomerId(null)} />
      )}

      {/* PRODUCT CART — Add inventory items directly to the selected customer's debt ledger */}
      {isAccountingChangeLogOpen && selectedCustomer && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4" dir="rtl" onClick={(event) => { if (event.target === event.currentTarget) setIsAccountingChangeLogOpen(false); }}>
          <div className="flex h-[96dvh] max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b bg-amber-50 p-3 sm:p-4">
              <div className="flex items-center gap-2"><History className="h-5 w-5 text-amber-700"/><div><h3 className="font-black text-slate-900">سجل تغييرات القائمة الحسابية</h3><p className="text-xs text-slate-600">حساب الزبون: {selectedCustomer.name}</p></div></div>
              <button type="button" onClick={() => setIsAccountingChangeLogOpen(false)} className="rounded-lg border bg-white p-2 text-slate-600" aria-label="إغلاق سجل التغييرات"><X className="h-4 w-4"/></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-4">
              <CustomerChangeLogTable
                customerId={selectedCustomer.id}
                customerName={selectedCustomer.name}
                changeLogs={(changeLogs || []).filter((log) => log.customerId === selectedCustomer.id && !log.invoiceId)}
                accountingListMode
                currency={settings.currency}
                onDeleteLog={deleteChangeLog}
                onClearCustomerLogs={clearCustomerChangeLogs}
                onRevertAction={revertChangeLogAction}
                isCloudSyncing={isCloudSyncing}
              />
            </div>
          </div>
        </div>
      )}

      {showProductCartScanner && isProductCartOpen && (
        <BarcodeScannerModal
          onDetected={handleProductCartBarcodeDetected}
          onClose={() => setShowProductCartScanner(false)}
        />
      )}

      {isProductCartOpen && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isAddingCartItems && !isSavingProductCartRecord) closeProductCart();
          }}
        >
          <div dir="rtl" role="dialog" aria-modal="true" aria-label="عربة البضاعة" className="relative bg-white w-full max-w-2xl max-h-[94dvh] rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-l from-emerald-50 to-white flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">عربة البضاعة</h3>
                  <p className="text-xs text-slate-500 mt-1">{productCartStage === "select" ? "اختر البضائع والكميات أولًا، ثم راجع الأسعار قبل إدراجها." : "راجع الأسعار؛ يُحفظ السجل تلقائيًا لتكمل عليه لاحقًا."}</p>
                  <p className="text-xs font-bold text-emerald-800 mt-1.5">الزبون: {selectedCustomer?.name || "غير محدد"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={isAddingCartItems || isSavingProductCartRecord}
                  onClick={() => setShowProductCartHistory(true)}
                  className="relative w-9 h-9 rounded-xl border border-emerald-100 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 flex items-center justify-center"
                  aria-label="سجل عربة التسوق"
                  title="سجل العربة"
                >
                  <History className="w-4 h-4" />
                  {currentContextProductCartRecords.length > 0 && <span className="absolute -top-1 -left-1 min-w-4 h-4 rounded-full bg-blue-600 px-1 text-[9px] font-black text-white">{currentContextProductCartRecords.length}</span>}
                </button>
                <button
                  type="button"
                  disabled={isAddingCartItems || isSavingProductCartRecord}
                  onClick={closeProductCart}
                  className="w-9 h-9 rounded-xl text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-40 flex items-center justify-center"
                  aria-label="إغلاق العربة"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {showProductCartHistory && (
              <section className="absolute inset-0 z-20 flex flex-col bg-white" aria-label="سجل عربة التسوق">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-emerald-50 to-white px-4 py-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">سجل عربة التسوق</h4>
                    <p className="mt-0.5 text-[11px] text-slate-500">سجلات هذا الزبون ونوع الكشف، محفوظة حتى تحذفها.</p>
                  </div>
                  <button type="button" onClick={() => setShowProductCartHistory(false)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">عودة للعربة</button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-3 sm:p-4">
                  {currentContextProductCartRecords.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
                      <History className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-sm font-bold text-slate-700">ماكو سجلات محفوظة لهذه العربة بعد</p>
                      <p className="mt-1 text-xs text-slate-500">بعد ما تختار البضاعة وتضغط «مراجعة الأسعار»، ينحفظ سجلها هنا تلقائيًا.</p>
                    </div>
                  ) : currentContextProductCartRecords.map((record) => {
                    const recordProductsCount = Object.values(record.quantities || {}).filter((quantity) => Number(quantity) > 0).length;
                    const recordUnitCount = Object.values(record.quantities || {}).reduce<number>((sum, quantity) => sum + (Number(quantity) || 0), 0);
                    const recordTotal = Object.entries(record.quantities || {}).reduce((sum, [productId, quantity]) => {
                      const gross = Number(record.totals?.[productId]) || (Number(record.unitPrices?.[productId]) || 0) * (Number(quantity) || 0);
                      return sum + Math.max(0, gross - (Number(record.discountTotals?.[productId]) || 0));
                    }, 0);
                    const isRenaming = renamingProductCartRecordId === record.id;
                    return (
                      <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {isRenaming ? (
                              <div className="flex gap-1.5">
                                <input autoFocus value={productCartRecordNameDraft} onChange={(event) => setProductCartRecordNameDraft(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-emerald-300 px-2.5 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-100" aria-label="اسم سجل العربة" />
                                <button type="button" onClick={() => void saveProductCartRecordName(record)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">حفظ</button>
                                <button type="button" onClick={() => { setRenamingProductCartRecordId(null); setProductCartRecordNameDraft(""); }} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-600">إلغاء</button>
                              </div>
                            ) : (
                              <h5 className="truncate text-sm font-black text-slate-900">{record.name || "عربة محفوظة"}</h5>
                            )}
                            <p className="mt-1 text-[11px] text-slate-500">{record.customerName || selectedCustomer?.name} · {new Date(Number(record.createdAt) || Date.now()).toLocaleString("ar-IQ")}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className={Number(record.insertionCount) > 0 ? "rounded-full bg-blue-50 px-2 py-1 font-bold text-blue-700" : "rounded-full bg-amber-50 px-2 py-1 font-bold text-amber-700"}>{Number(record.insertionCount) > 0 ? "أُدرج " + Number(record.insertionCount) + " مرة" : "بانتظار الإدراج"}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{recordProductsCount} أصناف · {formatThousands(recordUnitCount)} وحدة</span>
                              <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">{formatThousands(recordTotal)} {settings.currency}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {!isRenaming && <button type="button" onClick={() => { setRenamingProductCartRecordId(record.id); setProductCartRecordNameDraft(record.name || ""); }} className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />إعادة تسمية</button>}
                            <button type="button" onClick={() => void deleteSavedProductCartRecord(record)} className="flex h-9 items-center gap-1 rounded-lg border border-rose-100 px-2 text-xs font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />حذف</button>
                          </div>
                        </div>
                        <button type="button" onClick={() => openSavedProductCartRecord(record)} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white hover:bg-emerald-700">
                          <ShoppingCart className="h-4 w-4" />{Number(record.insertionCount) > 0 ? "فتح لإعادة الإدراج" : "فتح ومتابعة المراجعة"}
                        </button>
                      </article>
                    );
                  })}
                </div>
                <div className="border-t border-slate-100 bg-white px-4 py-2 text-[10px] leading-relaxed text-slate-400">حذف السجل يحذف بيانات العربة المحفوظة فقط، ولا يحذف السطور التي سبق إدراجها في حساب الزبون.</div>
              </section>
            )}

            {productCartStage === "select" && <div className="p-3 sm:p-4 border-b border-slate-100 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="search"
                  value={productCartSearch}
                  onChange={(event) => { setProductCartSearch(event.target.value); setProductCartVisibleLimit(60); }}
                  placeholder="ابحث باسم البضاعة أو التصنيف أو الباركود..."
                  className="w-full pr-9 pl-3 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-400 focus:outline-none text-sm"
                />
              </div>
              <button
                type="button"
                disabled={isAddingCartItems || isSavingProductCartRecord}
                onClick={() => setShowProductCartScanner(true)}
                className="shrink-0 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2"
                aria-label="مسح باركود وإضافة المنتج للعربة"
              >
                <ScanBarcode className="w-5 h-5" />
                <span>مسح وإضافة</span>
              </button>
            </div>}
            {productCartStage === "select" && <div className="relative border-b border-slate-100 bg-slate-50/70 px-3 py-2.5 sm:px-4">
              <button
                type="button"
                aria-expanded={productCartCategoryTreeOpen}
                aria-label="اختيار تصنيف البضاعة"
                onClick={() => {
                  if (!productCartCategoryTreeOpen && expandedProductCartCategoryPaths.size === 0) {
                    setExpandedProductCartCategoryPaths(new Set(productCartCategoryTree.childrenByParent.get("") || []));
                  }
                  setProductCartCategoryTreeOpen(open => !open);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-right shadow-sm"
              >
                <FolderTree className="h-4 w-4 shrink-0 text-emerald-700" />
                <span className="shrink-0 text-xs font-bold text-slate-500">التصنيفات</span>
                <span className="min-w-0 flex-1 truncate text-xs font-extrabold text-slate-800">{productCartCategory === "الكل" ? "كل التصنيفات" : productCartCategory}</span>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{productCartCategoryCount(productCartCategory)}</span>
                <ChevronDown className={"h-4 w-4 shrink-0 text-slate-500 transition-transform " + (productCartCategoryTreeOpen ? "rotate-180" : "")} />
              </button>
              {productCartCategoryTreeOpen && <div className="absolute inset-x-3 top-[calc(100%-2px)] z-30 max-h-[45dvh] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl sm:inset-x-4" role="group" aria-label="شجرة تصنيفات البضاعة">
                <button type="button" onClick={() => selectProductCartCategory("الكل")} aria-pressed={productCartCategory === "الكل"} className={"mb-1.5 flex min-h-10 w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-right " + (productCartCategory === "الكل" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700")}>
                  <Layers className="h-4 w-4 shrink-0" /><span className="flex-1 text-xs font-bold">كل التصنيفات</span><span className="rounded-full bg-white/85 px-1.5 py-0.5 text-[10px] font-bold">{productCartAllCount}</span>{productCartCategory === "الكل" && <Check className="h-4 w-4 text-emerald-700" />}
                </button>
                <div className="space-y-1.5">{renderProductCartCategoryBranch("")}</div>
              </div>}
            </div>}

            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
              {productCartStage === "select" ? (
                <>
                  {cartVisibleProducts.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">
                      {products.some((product) => !product.isDeleted)
                        ? "ما لقينا صنف يطابق البحث."
                        : "ماكو بضاعة مسجلة حالياً. أضف الأصناف من قسم البضاعة أولاً."}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {productCartCategory === "الكل"
                        ? <>
                            <div className="mb-1 flex items-center gap-2 px-1 text-xs font-bold text-slate-500"><FolderTree className="h-4 w-4 text-emerald-700" />البضاعة مرتبة حسب تصنيفاتها</div>
                            {renderProductCartCategoryGoods("")}
                          </>
                        : <div className="grid grid-cols-3 gap-2">{cartVisibleProducts.map(renderProductCartProductCard)}</div>}
                    </div>
                  )}
                  {matchingCartProducts.length > cartVisibleProducts.length && (
                    <button type="button" onClick={() => setProductCartVisibleLimit((limit) => limit + 60)} className="mx-auto mt-3 block rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100">
                      عرض المزيد ({formatThousands(matchingCartProducts.length - cartVisibleProducts.length)} بضاعة)
                    </button>
                  )}
                </>
              ) : selectedCartProducts.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">ماكو بضاعة محددة. ارجع للاختيار وأضف الأصناف المطلوبة.</div>
              ) : (
                <div className="space-y-3">
                  {selectedCartProducts.map((product) => {
                    const quantity = Number(productCartQuantities[product.id]) || 0;
                    const unitCost = Math.max(0, Math.round(Number(product.purchasePrice) || 0));
                    const totalCost = unitCost * quantity;
                    const unitSale = getCartUnitPrice(product);
                    const totalSale = getCartLineTotal(product);
                    const unitProfit = unitSale - unitCost;
                    const totalProfit = totalSale - totalCost;
                    const unitDiscount = getCartUnitDiscount(product);
                    const totalDiscount = getCartDiscountTotal(product);
                    const netSaleUnit = getCartNetUnitPrice(product);
                    const netSaleTotal = getCartNetTotal(product);
                    const netProfitUnit = netSaleUnit - unitCost;
                    const netProfitTotal = netSaleTotal - totalCost;
                    return (
                      <section key={product.id} className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-300 bg-slate-50 px-3 py-2.5">
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-black text-slate-900">{product.name}</h4>
                            <p className="text-[10px] text-slate-500">الكمية المحددة: {formatThousands(quantity)} {product.unitName || "قطعة"}</p>
                          </div>
                          <button type="button" onClick={() => updateCartQuantity(product, 0)} className="shrink-0 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700">إزالة</button>
                        </div>
                        <div className="w-full overflow-hidden">
                          <table dir="rtl" className="w-full table-fixed border-collapse text-center text-[15px] leading-snug">
                            <thead>
                              <tr className="bg-[#b6c8e4] text-slate-900">
                                <th className="w-[10%] border border-slate-500 px-0.5 py-1.5 break-words align-middle text-[14px] leading-snug"></th>
                                <th className="w-[8%] border border-slate-500 px-0.5 py-1.5 break-words align-middle text-[14px] leading-snug">العدد</th>
                                <th className="w-[17%] border border-slate-500 px-0.5 py-1.5 break-words align-middle text-[14px] leading-snug">مبلغ رأس المال</th>
                                <th className="w-[12%] border border-slate-500 px-0.5 py-1.5 break-words align-middle text-[14px] leading-snug">مبلغ البيع</th>
                                <th className="w-[12%] border border-slate-500 px-0.5 py-1.5 break-words align-middle text-[14px] leading-snug">مبلغ الربح</th>
                                <th className="w-[12%] border border-slate-500 px-0.5 py-1.5 break-words align-middle text-[14px] leading-snug">مبلغ الخصم</th>
                                <th className="w-[14.5%] border border-slate-500 px-0.5 py-1.5 break-words align-middle text-[14px] leading-snug">مبلغ البيع بعد الخصم</th>
                                <th className="w-[14.5%] border border-slate-500 px-0.5 py-1.5 break-words align-middle text-[14px] leading-snug">مبلغ الربح بعد الخصم</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-white">
                                <th className="border border-slate-400 px-0.5 py-1 text-[15px] leading-snug [overflow-wrap:anywhere] font-black">المفرد</th>
                                <td className="border border-slate-400 px-0.5 py-1 text-[15px] leading-snug [overflow-wrap:anywhere]">1</td>
                                <td className="border border-slate-400 px-0.5 py-1 text-[15px] leading-snug [overflow-wrap:anywhere]">{formatThousands(unitCost)}</td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ البيع للمفرد " + product.name} type="number" min="0" step="1" value={unitSale} onChange={(event) => updateCartUnitPrice(product, Number(event.target.value))} className="w-full min-w-0 rounded border border-slate-300 px-1 py-1.5 text-center text-[14px] font-bold focus:border-blue-500 focus:outline-none" /></td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ الربح للمفرد " + product.name} type="number" step="1" value={unitProfit} onChange={(event) => updateCartUnitPrice(product, unitCost + Number(event.target.value))} className="w-full min-w-0 rounded border border-slate-300 bg-white px-0.5 py-1 text-center text-[14px] font-bold focus:border-blue-500 focus:outline-none" /></td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ الخصم للمفرد " + product.name} type="number" min="0" max={unitSale} step="1" value={unitDiscount} onChange={(event) => updateCartUnitDiscount(product, Number(event.target.value))} className="w-full min-w-0 rounded border border-amber-300 bg-amber-50 px-1 py-1.5 text-center text-[14px] font-bold focus:border-amber-500 focus:outline-none" /></td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ البيع بعد الخصم للمفرد " + product.name} type="number" min="0" step="1" value={netSaleUnit} onChange={(event) => updateCartNetUnitPrice(product, Number(event.target.value))} className="w-full min-w-0 rounded border border-slate-300 bg-emerald-50 px-0.5 py-1 text-center text-[14px] font-bold focus:border-emerald-500 focus:outline-none" /></td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ الربح بعد الخصم للمفرد " + product.name} type="number" step="1" value={netProfitUnit} onChange={(event) => updateCartNetUnitPrice(product, unitCost + Number(event.target.value))} className="w-full min-w-0 rounded border border-slate-300 bg-emerald-50 px-0.5 py-1 text-center text-[14px] font-bold focus:border-emerald-500 focus:outline-none" /></td>
                              </tr>
                              <tr className="bg-white">
                                <th className="border border-slate-400 px-0.5 py-1 text-[15px] leading-snug [overflow-wrap:anywhere] font-black">الجمع</th>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"العدد للجميع " + product.name} type="number" min="0" max={Math.max(0, Number(product.quantity) || 0)} step="1" value={quantity} onChange={(event) => updateCartQuantity(product, Number(event.target.value))} className="w-full min-w-0 rounded border border-slate-300 px-0.5 py-1 text-center text-[14px] font-bold focus:border-blue-500 focus:outline-none" /></td>
                                <td className="border border-slate-400 px-0.5 py-1 text-[15px] leading-snug [overflow-wrap:anywhere]">{formatThousands(totalCost)}</td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ البيع للجميع " + product.name} type="number" min="0" step="1" value={totalSale} onChange={(event) => updateCartLineTotal(product, Number(event.target.value))} className="w-full min-w-0 rounded border border-slate-300 px-1 py-1.5 text-center text-[14px] font-bold focus:border-blue-500 focus:outline-none" /></td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ الربح للجميع " + product.name} type="number" step="1" value={totalProfit} onChange={(event) => updateCartLineTotal(product, totalCost + Number(event.target.value))} className="w-full min-w-0 rounded border border-slate-300 bg-white px-0.5 py-1 text-center text-[14px] font-bold focus:border-blue-500 focus:outline-none" /></td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ الخصم للجميع " + product.name} type="number" min="0" max={totalSale} step="1" value={totalDiscount} onChange={(event) => updateCartDiscountTotal(product, Number(event.target.value))} className="w-full min-w-0 rounded border border-amber-300 bg-amber-50 px-1 py-1.5 text-center text-[14px] font-bold focus:border-amber-500 focus:outline-none" /></td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ البيع بعد الخصم للجميع " + product.name} type="number" min="0" step="1" value={netSaleTotal} onChange={(event) => updateCartNetLineTotal(product, Number(event.target.value))} className="w-full min-w-0 rounded border border-slate-300 bg-emerald-50 px-0.5 py-1 text-center text-[14px] font-bold focus:border-emerald-500 focus:outline-none" /></td>
                                <td className="border border-slate-400 px-0.5 py-0.5"><FormattedNumberInput aria-label={"مبلغ الربح بعد الخصم للجميع " + product.name} type="number" step="1" value={netProfitTotal} onChange={(event) => updateCartNetLineTotal(product, totalCost + Number(event.target.value))} className="w-full min-w-0 rounded border border-slate-300 bg-emerald-50 px-0.5 py-1 text-center text-[14px] font-bold focus:border-emerald-500 focus:outline-none" /></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {netSaleTotal < totalCost && <p className="border-t border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">البيع بعد الخصم أقل من رأس المال؛ هذه البضاعة تُباع بخسارة.</p>}
                      </section>
                    );
                  })}
                  <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
                    <table dir="rtl" className="w-full table-fixed border-collapse text-xs sm:text-sm">
                      <thead><tr><th colSpan={2} className="border border-slate-400 bg-[#b6c8e4] px-3 py-2 text-center text-sm font-black text-slate-900">الإجمالي</th></tr></thead>
                      <tbody>
                        <tr><th colSpan={2} className="border border-slate-300 bg-[#e0eaf5] px-3 py-2 text-center font-black">الإجمالي قبل الخصم</th></tr>
                        <tr><th className="w-[42%] border border-slate-300 px-3 py-2 text-right font-bold">إجمالي عدد البضاعة</th><td className="border border-slate-300 px-3 py-2 text-center font-bold">{formatThousands(productCartCount)}</td></tr>
                        <tr><th className="border border-slate-300 px-3 py-2 text-right font-bold">إجمالي مبلغ رأس المال</th><td className="border border-slate-300 px-3 py-2 text-center font-bold">{formatThousands(productCartTotalCapital)}</td></tr>
                        <tr><th className="border border-slate-300 px-3 py-2 text-right font-bold">إجمالي مبلغ البيع</th><td className="border border-slate-300 px-3 py-2 text-center font-bold">{formatThousands(productCartTotalBeforeDiscount)}</td></tr>
                        <tr><th className="border border-slate-300 px-3 py-2 text-right font-bold">إجمالي مبلغ الربح</th><td className="border border-slate-300 px-3 py-2 text-center font-bold text-emerald-700">{formatThousands(productCartProfitBeforeDiscount)}</td></tr>
                        <tr><th colSpan={2} className="border border-slate-300 bg-[#e0eaf5] px-3 py-2 text-center font-black">الإجمالي بعد الخصم</th></tr>
                        <tr><th className="border border-slate-300 px-3 py-2 text-right font-bold">إجمالي مبلغ الخصم</th><td className="border border-slate-300 px-3 py-2 text-center font-bold">{formatThousands(productCartDiscountTotal)}</td></tr>
                        <tr><th className="border border-slate-300 px-3 py-2 text-right font-bold">إجمالي مبلغ البيع</th><td className="border border-slate-300 px-3 py-2 text-center font-bold">{formatThousands(productCartTotal)}</td></tr>
                        <tr><th className="border border-slate-300 px-3 py-2 text-right font-bold">إجمالي مبلغ الربح</th><td className="border border-slate-300 px-3 py-2 text-center font-bold text-emerald-700">{formatThousands(productCartTotalProfit)}</td></tr>
                      </tbody>
                    </table>
                  </section>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-slate-900">{selectedCartProducts.length}</span> أصناف ·
                  <span className="font-bold text-slate-900"> {formatThousands(productCartCount)}</span> وحدة محددة
                </div>
                <div className="text-left">
                  <p className="text-[11px] text-slate-500">{productCartStage === "review" ? "الإجمالي بعد الخصم" : "الإجمالي قبل الخصم"}</p>
                  <p className="text-lg font-black text-emerald-700">{formatThousands(productCartStage === "review" ? productCartTotal : productCartTotalBeforeDiscount)} {settings.currency}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {productCartStage === "review" && (
                  <button type="button" disabled={isAddingCartItems || isSavingProductCartRecord} onClick={() => setProductCartStage("select")} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700 disabled:opacity-40">رجوع للاختيار</button>
                )}
                <button
                  type="button"
                  disabled={isAddingCartItems || isSavingProductCartRecord || selectedCartProducts.length === 0}
                  onClick={handleConfirmProductCart}
                  className="flex-1 min-h-11 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isAddingCartItems || isSavingProductCartRecord ? <Loader2 className="w-4 h-4 animate-spin" /> : productCartStage === "select" ? <ArrowLeft className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  {isSavingProductCartRecord ? "جاري حفظ سجل العربة..." : isAddingCartItems ? "جاري الإدراج..." : productCartStage === "select" ? "مراجعة الأسعار" : productCartRecords.find((record) => record.id === activeProductCartRecordId)?.insertionCount ? "إعادة الإدراج في سجل الدين" : "إدراج في سجل الدين"}
                </button>
                <button
                  type="button"
                  disabled={isAddingCartItems || isSavingProductCartRecord}
                  onClick={() => {
                    if (activeProductCartRecordId) {
                      closeProductCart();
                      return;
                    }
                    setProductCartQuantities({});
                    setProductCartUnitPrices({});
                    setProductCartTotals({});
                    setProductCartUnitDiscounts({});
                    setProductCartDiscountTotals({});
                    setProductCartProductSnapshots({});
                    setProductCartStage("select");
                    closeProductCart();
                  }}
                  className="px-4 py-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-sm font-bold disabled:opacity-40"
                >
                  {activeProductCartRecordId ? "حفظ وإغلاق" : "إلغاء"}
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-400">{productCartStage === "select" ? "اختَر البضاعة وحدد الكميات، ثم انتقل لمراجعة أسعار كل صنف." : "سجل العربة محفوظ باسم مستقل؛ يمكنك إغلاقه ومتابعته أو إعادة إدراجه لاحقًا حسب مكان المؤشر."}</p>
            </div>
          </div>
        </div>
      )}

      {/* SEQUENCE MODAL — تعديل تسلسل المدين في الحافظة المستقلة */}
      {sequenceModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <ListOrdered className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">تسلسل المدين في الحافظة</h3>
                  <p className="text-[11px] text-slate-400">تعديل الترتيب المستقل الخاص بهذه الحافظة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSequenceModal(null)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Customer info & folder info */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">{sequenceModal.customer.name}</span>
                  <span className="text-[11px] font-mono text-slate-400">{sequenceModal.customer.phone}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200/60">
                  <Folder className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="font-medium">
                    الحافظة: <strong className="font-bold">{getCustomerSequenceInFolder(sequenceModal.customer).folderName}</strong>
                  </span>
                </div>
              </div>

              {/* Number Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رقم التسلسل المطلوب في الحافظة:
                </label>
                <div className="relative flex items-center">
                  <Hash className="absolute right-3.5 w-4 h-4 text-blue-600" />
                  <FormattedNumberInput
                    type="number"
                    min="1"
                    value={sequenceModal.targetSeq}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setSequenceModal({
                        ...sequenceModal,
                        targetSeq: isNaN(val) ? 1 : Math.max(1, val),
                      });
                    }}
                    className="w-full pr-10 pl-4 py-2.5 bg-white border-2 border-blue-200 focus:border-blue-600 rounded-xl font-mono text-sm font-black text-slate-900 focus:outline-none transition-colors"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  * كل حافظة مستقلة بتسلسلها الرقمي الخاص ويبدأ من 1. عند إدخال رقم تسلسل، سيتم إدراج هذا المدين فيه وإزاحة بقية المدينين في الحافظة تلقائياً.
                </p>
              </div>

              {/* Quick Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSequenceModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveSequenceModal}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>تثبيت التسلسل</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isCustomerDeleteConfirmOpen}
        type="customer"
        itemName={selectedCustomer?.name}
        itemDetails="سيتم نقل هذا الزبون وسجل ديونه وقوائم حساباته إلى سلة المهملات بأمان. يمكنك استعادته في أي وقت مع الاحتفاظ بكافة فواتيره ودفعاته."
        onConfirm={() => {
          if (selectedCustomer && deleteCustomer) {
            deleteCustomer(selectedCustomer.id);
          }
          setSelectedCustomerId(null);
          setSelectedInvoiceId(null);
          setIsCustomerDeleteConfirmOpen(false);
          setToastMessage(`تم نقل الزبون "${selectedCustomer?.name}" إلى سلة المهملات`);
          setTimeout(() => setToastMessage(""), 3500);
        }}
        onCancel={() => setIsCustomerDeleteConfirmOpen(false)}
      />

      {/* FLOATING TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold z-50 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-3 backdrop-blur-sm border border-slate-700">
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
