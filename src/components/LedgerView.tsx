import React, { useState, useEffect, useMemo } from "react";
import {
  BookOpen,
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
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Customer, Product, Invoice, Payment, InvoiceItem, SystemSettings, CustomerFolder, CustomerChangeLogItem } from "../types";
import { printElement, exportElementToPDF } from "../utils/printUtils";
import {
  calculateCumulativeSeparators,
  getArabicDayName,
  getCurrentDateFormatted,
  getCurrentTimeFormatted,
  getTotalPaidFromItems,
  formatInvoiceAccountingText,
} from "../utils/separatorUtils";
import VerticalLedgerSheet from "./VerticalLedgerSheet";
import DeleteConfirmModal from "./DeleteConfirmModal";
import HierarchicalFolderNav from "./HierarchicalFolderNav";
import FileManagerView from "./FileManagerView";
import { auth } from "../lib/firebase";
import { dispatchPaidAmountNotification } from "../lib/notifications";

interface LedgerViewProps {
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
  addInvoice: (invoice: Omit<Invoice, "id" | "createdAt">) => Invoice;
  updateInvoice: (invoice: Invoice) => void;
  addPayment: (payment: Omit<Payment, "id" | "createdAt">) => Payment;
  deleteInvoice: (id: string) => void;
  onOpenNewCustomerModal: () => void;
  addCustomer?: (customer: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer?: (customer: Customer) => void;
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
  changeLogs?: CustomerChangeLogItem[];
  isCloudSyncing?: boolean;
  addChangeLog?: (item: Omit<CustomerChangeLogItem, "id" | "timestamp" | "formattedDateTime"> & { id?: string; timestamp?: string; formattedDateTime?: string }) => Promise<CustomerChangeLogItem>;
  deleteChangeLog?: (id: string) => Promise<void>;
  clearCustomerChangeLogs?: (customerId: string) => Promise<void>;
  revertChangeLogAction?: (logItem: CustomerChangeLogItem) => Promise<void>;
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
  changeLogs = [],
  isCloudSyncing = false,
  addChangeLog,
  deleteChangeLog,
  clearCustomerChangeLogs,
  revertChangeLogAction,
}: LedgerViewProps) {
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
  const [ledgerDisplayMode, setLedgerDisplayMode] = useState<"vertical" | "formal">("vertical");

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
      if (addInvoice) {
        const initialEmptyInv = addInvoice({
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
          date: new Date().toISOString().split("T")[0],
          customerId: created.id,
          customerName: created.name,
          customerPhone: created.phone,
          customerAddress: created.address || "",
          items: [],
          grandTotal: 0,
          paidAmount: 0,
          remainingAmount: 0,
          notes: "",
          employeeName: "",
          signature: "",
        });
        setSelectedInvoiceId(initialEmptyInv.id);
      }
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
إجمالي الديون: ${stats.totalDebts.toLocaleString()} ${settings.currency}
إجمالي المسدد: ${stats.totalPaid.toLocaleString()} ${settings.currency}
المطلوب المتبقي: ${stats.totalRemaining.toLocaleString()} ${settings.currency}
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
إجمالي الديون: ${totalDebts.toLocaleString()} ${settings.currency}
إجمالي المطلوب المتبقي: ${totalRemaining.toLocaleString()} ${settings.currency}
--------------------------
قائمة الزبائن:
${folderCustomers
  .map((c) => {
    const s = getCustomerStats(c.id);
    return `• ${c.name} (${c.phone}): مطلوب ${s.totalRemaining.toLocaleString()} ${settings.currency}`;
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

  // Auto-select first invoice when customer is opened if none is selected
  React.useEffect(() => {
    if (selectedCustomerId && selectedCustomer) {
      const custInvs = invoices.filter((inv) => inv.customerId === selectedCustomerId && !inv.isDeleted);
      if (custInvs.length > 0) {
        if (!selectedInvoiceId || !custInvs.some((inv) => inv.id === selectedInvoiceId)) {
          setSelectedInvoiceId(custInvs[0].id);
        }
      } else {
        const newInv = addInvoice({
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
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
  }, [selectedCustomerId, invoices, selectedInvoiceId, selectedCustomer]);

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

  // Calculate aggregate metrics per customer for the overview
  const getCustomerStats = (custId: string) => {
    const custInvoices = invoices.filter((inv) => inv.customerId === custId);
    const custPayments = payments.filter((p) => p.customerId === custId);

    const totalDebts = custInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
    const totalPaid = custPayments.reduce((acc, p) => acc + p.amount, 0);
    const totalRemaining = custInvoices.reduce((acc, inv) => acc + inv.remainingAmount, 0);

    return {
      totalDebts,
      totalPaid,
      totalRemaining,
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
    if (totalSeparatorsPaid > 0) {
      setNewInvPaidAmount(totalSeparatorsPaid);
    }
  };

  const handleUpdateSeparatorField = (index: number, field: string, value: any) => {
    const items = [...newInvItems];
    items[index] = {
      ...items[index],
      [field]: value,
    };
    if (field === "paidDate") {
      items[index].paidDay = getArabicDayName(value);
    }
    const calculated = calculateCumulativeSeparators(items);
    setNewInvItems(calculated);
  };

  const handleClearModalRows = () => {
    const emptyRows = [
      { details: "", quantity: 1, unitPrice: 0 },
      { details: "", quantity: 1, unitPrice: 0 },
      { details: "", quantity: 1, unitPrice: 0 },
    ];
    setNewInvItems(emptyRows);
    setNewInvPaidAmount(0);
    pushHistory(emptyRows, 0, invColumns);
    showToast("تم إفراغ جدول الفاتورة بنجاح!");
  };

  const handleMoveRow = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newInvItems.length) return;
    const items = [...newInvItems];
    const temp = items[index];
    items[index] = items[targetIdx];
    items[targetIdx] = temp;
    const calculated = calculateCumulativeSeparators(items);
    setNewInvItems(calculated);
    pushHistory(calculated, newInvPaidAmount, invColumns);
  };

  const handleInsertRow = (idx: number, position: "before" | "after") => {
    const items = [...newInvItems];
    const targetIdx = position === "before" ? idx : idx + 1;
    items.splice(targetIdx, 0, { details: "", quantity: 1, unitPrice: 0 });
    const calculated = calculateCumulativeSeparators(items);
    setNewInvItems(calculated);
    pushHistory(calculated, newInvPaidAmount, invColumns);
  };

  const handleRemoveRow = (idx: number) => {
    const items = [...newInvItems];
    items.splice(idx, 1);
    if (items.length === 0) {
      items.push({ details: "", quantity: 1, unitPrice: 0 });
    }
    const calculated = calculateCumulativeSeparators(items);
    setNewInvItems(calculated);
    pushHistory(calculated, newInvPaidAmount, invColumns);
  };

  const handleAddColumn = () => {
    const colId = `custom_${Date.now()}`;
    const newCol = { id: colId, label: "عمود جديد", type: "custom", width: "100px" };
    const updatedCols = [...invColumns, newCol];
    setInvColumns(updatedCols);

    const updatedItems = newInvItems.map((item) => ({
      ...item,
      [colId]: "",
    }));
    setNewInvItems(updatedItems);
    pushHistory(updatedItems, newInvPaidAmount, updatedCols);
  };

  const handleRemoveColumn = (colId: string) => {
    if (colId === "details" || colId === "amount") {
      alert("لا يمكن حذف الأعمدة الأساسية للفاتورة.");
      return;
    }
    const updatedCols = invColumns.filter((col) => col.id !== colId);
    setInvColumns(updatedCols);

    const updatedItems = newInvItems.map((item) => {
      const newItem = { ...item };
      delete newItem[colId];
      return newItem;
    });
    setNewInvItems(updatedItems);
    pushHistory(updatedItems, newInvPaidAmount, updatedCols);
  };

  const handleRenameColumn = (colId: string, newLabel: string) => {
    const updatedCols = invColumns.map((col) =>
      col.id === colId ? { ...col, label: newLabel } : col
    );
    setInvColumns(updatedCols);
    pushHistory(newInvItems, newInvPaidAmount, updatedCols);
  };

  const handleMoveColumn = (idx: number, direction: "left" | "right") => {
    const updatedCols = [...invColumns];
    const targetIdx = direction === "left" ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < updatedCols.length) {
      const temp = updatedCols[idx];
      updatedCols[idx] = updatedCols[targetIdx];
      updatedCols[targetIdx] = temp;
      setInvColumns(updatedCols);
      pushHistory(newInvItems, newInvPaidAmount, updatedCols);
    }
  };

  const handleSelectProduct = (index: number, prod: Product) => {
    const items = [...newInvItems];
    items[index] = {
      ...items[index],
      details: prod.name,
      productId: prod.id,
      quantity: items[index].quantity || 1,
      unitPrice: prod.salePrice,
    };
    setNewInvItems(items);
    pushHistory(items, newInvPaidAmount, invColumns);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const items = [...newInvItems];
    items[index] = {
      ...items[index],
      [field]: value,
    };

    // If updating payment row price, sync with paidAmount and update remaining amount
    if (items[index].isPaymentRow && field === "unitPrice") {
      const newPaid = Number(value) || 0;
      setNewInvPaidAmount(newPaid);
      
      const subTotal = items
        .filter((item) => item.details.trim() !== "" && !item.isPaymentRow && !item.isRemainingRow)
        .reduce((acc, item) => acc + (Number(item.unitPrice) || 0), 0);
        
      const remIdx = items.findIndex((item) => item.isRemainingRow);
      if (remIdx !== -1) {
        items[remIdx] = {
          ...items[remIdx],
          unitPrice: Math.max(0, subTotal - newPaid),
        };
      }
    }

    // If updating regular item prices, automatically update the remaining amount if a remaining row exists
    if (!items[index].isPaymentRow && !items[index].isRemainingRow && field === "unitPrice") {
      const subTotal = items
        .filter((item) => item.details.trim() !== "" && !item.isPaymentRow && !item.isRemainingRow)
        .reduce((acc, item) => acc + (Number(item.unitPrice) || 0), 0);

      const payIdx = items.findIndex((item) => item.isPaymentRow);
      const paid = payIdx !== -1 ? (Number(items[payIdx].unitPrice) || 0) : newInvPaidAmount;

      const remIdx = items.findIndex((item) => item.isRemainingRow);
      if (remIdx !== -1) {
        items[remIdx] = {
          ...items[remIdx],
          unitPrice: Math.max(0, subTotal - paid),
        };
      }
    }

    const calculated = calculateCumulativeSeparators(items);
    setNewInvItems(calculated);
  };

  const handleAddPaymentRows = () => {
    // Check if payment row already exists in newInvItems
    const hasPayment = newInvItems.some((item) => item.isPaymentRow);
    if (hasPayment) {
      alert("صف التسديد موجود بالفعل في الفاتورة.");
      return;
    }

    // Calculate sum of regular items (excluding any payment/remaining rows)
    const itemsWithoutPayment = newInvItems.filter(
      (item) => item.details.trim() !== "" && !item.isPaymentRow && !item.isRemainingRow
    );

    const subTotal = itemsWithoutPayment.reduce(
      (acc, item) => acc + (Number(item.unitPrice) || 0),
      0
    );

    const paymentVal = Number(newInvPaidAmount) || 0;
    const remainingVal = Math.max(0, subTotal - paymentVal);

    // Create payment row
    const paymentRow = {
      details: "التسديد",
      quantity: 1,
      unitPrice: paymentVal,
      isPaymentRow: true,
    };

    // Create remaining row
    const remainingRow = {
      details: "المتبقي",
      quantity: 1,
      unitPrice: remainingVal,
      isRemainingRow: true,
    };

    // Filter out completely empty rows and append, then pad to at least 12 rows
    const nonEmptyItems = newInvItems.filter((item) => item.details.trim() !== "");
    const updatedItems = [...nonEmptyItems, paymentRow, remainingRow];

    // Pad to 12 if less
    const finalItems = [
      ...updatedItems,
      ...Array.from({ length: Math.max(0, 12 - updatedItems.length) }, () => ({
        details: "",
        quantity: 1,
        unitPrice: 0,
      })),
    ];

    setNewInvItems(finalItems);
    pushHistory(finalItems, paymentVal, invColumns);
  };

  const handleCellBlur = () => {
    pushHistory(newInvItems, newInvPaidAmount, invColumns);
  };

  const handleImportPastedRows = (text: string) => {
    if (!text.trim()) return;
    const lines = text.split("\n");
    const parsed: any[] = [];

    lines.forEach((line) => {
      if (!line.trim()) return;
      const cells = line.split(/\t/);
      if (cells.length > 0) {
        const details = cells[0]?.trim() || "";
        let amountVal = 0;
        if (cells.length === 2) {
          amountVal = Number(cells[1]?.replace(/[^\d.]/g, "")) || 0;
        } else if (cells.length > 2) {
          amountVal = Number(cells[1]?.replace(/[^\d.]/g, "")) || Number(cells[2]?.replace(/[^\d.]/g, "")) || 0;
        }

        const rowObj: any = { details, quantity: 1, unitPrice: amountVal };

        let cellIdx = 3;
        invColumns.forEach((col) => {
          if (col.type === "custom" && cells[cellIdx]) {
            rowObj[col.id] = cells[cellIdx].trim();
            cellIdx++;
          }
        });

        parsed.push(rowObj);
      }
    });

    if (parsed.length > 0) {
      const isAllCurrentEmpty = newInvItems.every((item) => item.details.trim() === "");
      let updatedItems = [];
      if (isAllCurrentEmpty) {
        updatedItems = parsed;
      } else {
        const nonEmpty = newInvItems.filter((item) => item.details.trim() !== "");
        updatedItems = [...nonEmpty, ...parsed];
      }

      while (updatedItems.length < 12) {
        updatedItems.push({ details: "", quantity: 1, unitPrice: 0 });
      }

      setNewInvItems(updatedItems);
      pushHistory(updatedItems, newInvPaidAmount, invColumns);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number, colId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const colOrder = invColumns.filter((c) => c.type !== "num" && c.type !== "amount").map((c) => c.id);
      let nextRowIdx = rowIdx;
      let nextColIdx = colIdx + 1;
      if (nextColIdx >= colOrder.length) {
        nextColIdx = 0;
        nextRowIdx = rowIdx + 1;
      }

      if (nextRowIdx < newInvItems.length) {
        const nextColId = colOrder[nextColIdx];
        const nextInput = document.getElementById(`input-${nextRowIdx}-${nextColId}`);
        if (nextInput) {
          nextInput.focus();
          (nextInput as any).select?.();
        }
      } else {
        handleAddItem();
        setTimeout(() => {
          const nextColId = colOrder[0];
          const nextInput = document.getElementById(`input-${nextRowIdx}-${nextColId}`);
          if (nextInput) {
            nextInput.focus();
          }
        }, 80);
      }
    }
  };

  const handleInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    // Build items with total, ID, and separator details
    const formattedItems: InvoiceItem[] = newInvItems
      .filter((item) => (item.details && item.details.trim() !== "") || item.isSeparator)
      .map((item, idx) => {
        if (item.isSeparator) {
          return {
            id: item.id || `sep-${Date.now()}-${idx}`,
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
          } as any;
        }

        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice) || 0;
        const total = quantity * unitPrice;

        const itemObj: any = {
          id: item.id || `item-${Date.now()}-${idx}`,
          details: item.details,
          productId: item.productId,
          quantity,
          unitPrice,
          total,
        };
        // Copy any custom column values
        Object.keys(item).forEach((k) => {
          if (!["details", "productId", "quantity", "unitPrice", "total", "id", "isSeparator"].includes(k)) {
            itemObj[k] = item[k];
          }
        });
        return itemObj as InvoiceItem;
      });

    if (formattedItems.length === 0) {
      alert("الرجاء إضافة بند واحد على الأقل يحتوي على تفاصيل صالحة.");
      return;
    }

    const calculatedItems = calculateCumulativeSeparators(formattedItems);

    // Calculate grand total excluding special payment/remaining rows and separators
    const grandTotal = calculatedItems
      .filter((item) => !item.isPaymentRow && !item.isRemainingRow && !item.isSeparator)
      .reduce((acc, item) => acc + item.total, 0);

    const totalSeparatorsPaid = calculatedItems
      .filter((it) => it.isSeparator)
      .reduce((sum, it) => sum + (Number(it.paidAmount) || 0), 0);

    const paidAmount = totalSeparatorsPaid > 0 ? totalSeparatorsPaid : (Number(newInvPaidAmount) || 0);
    const remainingAmount = Math.max(0, grandTotal - paidAmount);

    if (editingInvoice) {
      const prevPaid = Number(editingInvoice.paidAmount || 0);
      updateInvoice({
        ...editingInvoice,
        invoiceNumber: newInvNumber,
        date: newInvDate,
        dueDate: newInvDueDate || undefined,
        items: calculatedItems,
        grandTotal,
        paidAmount,
        remainingAmount,
        notes: newInvNotes,
        employeeName: newInvEmployee,
        signature: newInvSignature,
        columns: invColumns,
      });

      // 🔔 Trigger Event 3 Notification if paid amount increased in this modal save
      if (paidAmount > prevPaid) {
        const currentUserId = auth.currentUser?.uid || editingInvoice.userId;
        if (currentUserId) {
          const addedVal = paidAmount - prevPaid;
          const opId = `${editingInvoice.customerId}_${editingInvoice.id}_modal_${paidAmount}`;
          dispatchPaidAmountNotification(currentUserId, {
            operationId: opId,
            customerId: editingInvoice.customerId,
            customerName: editingInvoice.customerName || selectedCustomer.name,
            invoiceId: editingInvoice.id,
            paidAmount: addedVal,
            remainingAmount,
            currency: settings.currency,
          }).catch((e) => console.warn("Failed to dispatch modal paid amount notification:", e));
        }
      }

      setEditingInvoice(null);
    } else {
      addInvoice({
        invoiceNumber: newInvNumber,
        date: newInvDate,
        dueDate: newInvDueDate || undefined,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        customerAddress: selectedCustomer.address,
        items: calculatedItems,
        grandTotal,
        paidAmount,
        remainingAmount,
        notes: newInvNotes,
        employeeName: newInvEmployee,
        signature: newInvSignature,
        columns: invColumns,
      });
    }

    // Reset Form
    setIsAddingInvoice(false);
    setNewInvDueDate("");
    const defaultCols = [
      { id: "amount", label: "المبلغ", type: "amount", width: "150px" },
      { id: "details", label: "البيـــــــــــــــــــــــــــــــــــان (التفاصيل)", type: "details" },
    ];
    setInvColumns(defaultCols);
    const initialItems = Array.from({ length: 12 }, () => ({ details: "", quantity: 1, unitPrice: 0 }));
    setNewInvItems(initialItems);
    setNewInvPaidAmount(0);
    setNewInvNotes("");
    setNewInvEmployee("");
    setNewInvNumber(`INV-${Date.now().toString().slice(-6)}`);
    setHistory([{ items: JSON.parse(JSON.stringify(initialItems)), paidAmount: 0, columns: JSON.parse(JSON.stringify(defaultCols)) }]);
    setHistoryPointer(0);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    if (payAmount <= 0) {
      alert("الرجاء إدخال مبلغ دفع صالح أكبر من الصفر.");
      return;
    }

    addPayment({
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      amount: Number(payAmount),
      date: payDate,
      method: payMethod,
      notes: payNotes,
    });

    // Reset Form
    setIsRecordingPayment(false);
    setPayAmount(0);
    setPayNotes("");
  };

  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    try {
      await printElement("paper-ledger", {
        title: `قائمة_حساب_${currentInvoice?.invoiceNumber || "فاتورة"}_${currentInvoice?.customerName || ""}`,
        onComplete: () => setIsPrinting(false),
      });
    } catch (err) {
      console.error("Print error:", err);
      setIsPrinting(false);
    } finally {
      setTimeout(() => setIsPrinting(false), 1500);
    }
  };

  const handleExportPDF = async () => {
    if (!currentInvoice || isExportingPDF) return;
    setIsExportingPDF(true);

    try {
      // Pause slightly so all pages render flat and visible in the DOM during export
      await new Promise((resolve) => setTimeout(resolve, 80));

      await exportElementToPDF("paper-ledger", {
        filename: `قائمة_حساب_${currentInvoice.invoiceNumber}_${currentInvoice.customerName || "عميل"}`,
        title: `قائمة حساب رقم ${currentInvoice.invoiceNumber} - ${currentInvoice.customerName || ""}`,
      });
    } catch (error) {
      console.error("PDF Export error:", error);
      alert("حدث خطأ أثناء تصدير ملف PDF. يرجى المحاولة مرة أخرى أو استخدام زر الطباعة.");
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Specific invoice details view
  const currentInvoice = invoices.find((inv) => inv.id === selectedInvoiceId);

  const getDisplayedItems = (invoice: Invoice | undefined) => {
    if (!invoice) return [];
    let items = [...invoice.items];
    const hasSeparator = items.some((item) => item && item.isSeparator);
    const hasPayment = items.some(
      (item) => item && (item.isPaymentRow || item.details === "التسديد")
    );
    if (!hasPayment && !hasSeparator && invoice.paidAmount > 0) {
      items.push({
        id: `dyn-pay-${invoice.id}`,
        details: "التسديد",
        quantity: 1,
        unitPrice: invoice.paidAmount,
        total: invoice.paidAmount,
        isPaymentRow: true,
      } as any);
      items.push({
        id: `dyn-rem-${invoice.id}`,
        details: "المتبقي",
        quantity: 1,
        unitPrice: invoice.remainingAmount,
        total: invoice.remainingAmount,
        isRemainingRow: true,
      } as any);
    }
    if (hasSeparator) {
      items = calculateCumulativeSeparators(items) as any;
    }
    return items;
  };

  // --- A4 Automatic Ledger Pagination Helpers ---
  interface LedgerPageChunk {
    pageIndex: number;
    pageNum: number;
    items: any[];
    paddedItems: any[];
    isFirstPage: boolean;
    isLastPage: boolean;
    totalPages: number;
    startIndex: number;
  }

  const toArabicDigits = (n: number | string): string => {
    const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    return String(n).replace(/[0-9]/g, (digit) => arabicDigits[+digit]);
  };

  /**
   * Automatically partitions ledger items into standard A4 sheets:
   * - Page 1 holds up to 14 items, leaving ample room for store branding, banner box, and customer metadata.
   * - Page 2 and subsequent pages are automatically created whenever data extends beyond page 1.
   *   Page 2 EXCLUDES the header (store logo, banner, and fixed metadata) to start DIRECTLY with the data table.
   */
  const paginateLedgerItems = (
    rawItems: any[],
    page1Capacity = 14,
    subsequentCapacity = 18
  ): LedgerPageChunk[] => {
    const totalItems = rawItems.length;

    if (totalItems <= page1Capacity) {
      const padded = [...rawItems];
      while (padded.length < Math.max(12, rawItems.length)) {
        padded.push(null);
      }
      return [
        {
          pageIndex: 0,
          pageNum: 1,
          items: rawItems,
          paddedItems: padded,
          isFirstPage: true,
          isLastPage: true,
          totalPages: 1,
          startIndex: 0,
        },
      ];
    }

    const chunks: any[][] = [];
    chunks.push(rawItems.slice(0, page1Capacity));
    let cursor = page1Capacity;

    while (cursor < totalItems) {
      const remaining = totalItems - cursor;
      const size = Math.min(subsequentCapacity, remaining);
      chunks.push(rawItems.slice(cursor, cursor + size));
      cursor += size;
    }

    const totalPages = chunks.length;
    let offset = 0;

    return chunks.map((chunk, idx) => {
      const isFirstPage = idx === 0;
      const isLastPage = idx === totalPages - 1;
      const startIndex = offset;
      offset += chunk.length;

      const targetRows = isFirstPage ? page1Capacity : (isLastPage ? 16 : 20);
      const padded = [...chunk];
      while (padded.length < targetRows) {
        padded.push(null);
      }

      return {
        pageIndex: idx,
        pageNum: idx + 1,
        items: chunk,
        paddedItems: padded,
        isFirstPage,
        isLastPage,
        totalPages,
        startIndex,
      };
    });
  };

  // Keyboard navigation for turning ledger pages (Left = Next page in RTL, Right = Previous page)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const tag = activeEl?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!currentInvoice) return;

      const items = getDisplayedItems(currentInvoice);
      const pages = paginateLedgerItems(items);
      const totalPages = pages.length;
      if (totalPages <= 1) return;

      if (e.key === "ArrowLeft") {
        if (currentLedgerPage < totalPages) {
          handleNextPage(totalPages);
        }
      } else if (e.key === "ArrowRight") {
        if (currentLedgerPage > 1) {
          handlePrevPage();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentInvoice, currentLedgerPage, soundEnabled]);

  const renderCustomerActions = (c: Customer) => (
    <div className="relative customer-menu-container" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setActiveCustomerMenuId(activeCustomerMenuId === c.id ? null : c.id);
        }}
        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        title="خيارات الزبون (إعادة تسمية، نسخ، مشاركة، نقل)"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {activeCustomerMenuId === c.id && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1 w-52 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-1.5 z-50 animate-in fade-in zoom-in-95 text-right">
          <div className="px-3 py-1.5 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-800 truncate">{c.name}</p>
            <p className="text-[10px] text-slate-400 font-mono">{c.phone}</p>
          </div>

          {/* 1. إعادة تسمية */}
          <button
            type="button"
            onClick={() => {
              setActiveCustomerMenuId(null);
              openRenameModal("customer", c.id, c.name);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-bold transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-blue-600" />
            <span>إعادة تسمية الزبون</span>
          </button>

          {/* 2. نسخ الاسم */}
          <button
            type="button"
            onClick={() => {
              setActiveCustomerMenuId(null);
              handleCopyText(c.name, "اسم الزبون");
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-xs font-bold transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-emerald-600" />
            <span>نسخ الاسم للحافظة</span>
          </button>

          {/* 3. مشاركة */}
          <button
            type="button"
            onClick={() => {
              setActiveCustomerMenuId(null);
              handleShareCustomer(c);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>مشاركة كشف الحساب</span>
          </button>

          {/* 4. نقل إلى مجلد */}
          <button
            type="button"
            onClick={() => {
              setActiveCustomerMenuId(null);
              setMoveModal({
                isOpen: true,
                customer: c,
                targetFolderId: c.folderId || "none",
              });
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-amber-50 text-slate-700 hover:text-amber-700 text-xs font-bold transition-colors cursor-pointer"
          >
            <MoveRight className="w-3.5 h-3.5 text-amber-600" />
            <span>نقل إلى مجلد آخر...</span>
          </button>

          {/* 5. تسلسل المدين في الحافظة المستقلة */}
          <div className="pt-1 mt-1 border-t border-slate-100">
            <div className="px-3 py-1 flex items-center justify-between text-[11px] text-slate-500 font-bold bg-slate-50/80">
              <span>تسلسل الحافظة:</span>
              <span className="font-mono bg-blue-600 text-white px-1.5 py-0.2 rounded text-[10px] font-black">
                #{getCustomerSequenceInFolder(c).seq}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveCustomerMenuId(null);
                handleOpenSequenceModal(c);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-bold transition-colors cursor-pointer"
            >
              <ListOrdered className="w-3.5 h-3.5 text-blue-600" />
              <span>تعديل رقم التسلسل بالدفتر...</span>
            </button>

            {getCustomerSequenceInFolder(c).seq > 1 && (
              <button
                type="button"
                onClick={() => {
                  setActiveCustomerMenuId(null);
                  handleMoveCustomerSequence(c, "up");
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-xs font-medium transition-colors cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />
                <span>تقديم التسلسل للأعلى (↑)</span>
              </button>
            )}

            {getCustomerSequenceInFolder(c).seq < getCustomerSequenceInFolder(c).totalInFolder && (
              <button
                type="button"
                onClick={() => {
                  setActiveCustomerMenuId(null);
                  handleMoveCustomerSequence(c, "down");
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-amber-50 text-slate-700 hover:text-amber-700 text-xs font-medium transition-colors cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5 text-amber-600" />
                <span>تأخير التسلسل للأسفل (↓)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="space-y-6">
      {/* 1. File Manager Folder System for Debt Register (سجل الديون) */}
      {!selectedCustomerId && (
        <FileManagerView
          rootName="سجل الديون"
          folders={folders}
          customers={customers}
          invoices={invoices}
          payments={payments}
          settings={settings}
          currentFolderId={activeFolderId}
          onNavigate={(fId) => setActiveFolderId(fId)}
          onSelectCustomer={(custId) => {
            setSelectedCustomerId(custId);
          }}
          onAddFolder={handleAddFolder}
          onUpdateFolder={handleUpdateFolder}
          onDeleteFolder={handleDeleteFolder}
          onRestoreFolder={handleRestoreFolder}
          onPermanentDeleteFolder={handlePermanentDeleteFolder}
          onAddCustomer={addCustomer}
          onUpdateCustomer={updateCustomer}
          onDeleteCustomer={deleteCustomer}
          onRestoreCustomer={handleRestoreCustomer}
          onPermanentDeleteCustomer={handlePermanentDeleteCustomer}
          onMoveItems={handleMoveItems}
          onBulkDelete={handleBulkDelete}
          onBulkRestore={handleBulkRestore}
          onBulkPermanentDelete={handleBulkPermanentDelete}
          onEmptyTrash={propOnEmptyTrash}
          onRestoreAllTrash={propOnRestoreAllTrash}
        />
      )}

      {/* 2. Selected Customer Ledger Notebook screen */}
      {selectedCustomerId && selectedCustomer && (
        <div className="space-y-6">
          {/* Top Back Panel */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm no-print">
            <button
              onClick={() => {
                setSelectedCustomerId(null);
                setSelectedInvoiceId(null);
                setIsAddingInvoice(false);
                setEditingInvoice(null);
                setIsRecordingPayment(false);
              }}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" /> العودة إلى سجل الديون
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCustomerDeleteConfirmOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                title="حذف هذا الزبون ونقله إلى سلة المهملات"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف الزبون</span>
              </button>
            </div>
          </div>

          {/* Form: Add Invoice */}
          {(isAddingInvoice || editingInvoice) && (
            <div className="space-y-4 no-print">
              {/* Info alert / Hint */}
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs p-3 rounded-xl flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  {editingInvoice
                    ? "أنت الآن في وضع التعديل للقائمة. يمكنك زيادة الكميات، تغيير الأسعار، أو إضافة بنود إضافية مباشرة لحفظها بالدفتر الحسابي للعميل."
                    : "أدخل تفاصيل قائمة الحساب (البيان، العدد، وسعر المفرد) مباشرة في أسطر الجدول أدناه. يمكنك ملء الأسطر المطلوبة وترك الأسطر الباقية فارغة، وسيتم تسجيل البنود الممتلئة فقط تلقائياً."}
                </span>
              </div>

              {/* Realistic Interactive Notepad Form Box */}
              <div className="shadow-xl rounded-xl overflow-hidden bg-white border border-slate-200">
                {/* Notepad Top Bound Cover */}
                <div className="h-6 bg-[#b29774] border-b-2 border-[#8e7552] flex justify-center items-center shadow-inner relative z-10">
                  <div className="flex gap-4 justify-around w-full max-w-sm px-4">
                    <div className="w-3 h-1.5 bg-[#5c4a31]/30 rounded-full"></div>
                    <div className="w-3 h-1.5 bg-[#5c4a31]/30 rounded-full"></div>
                    <div className="w-3 h-1.5 bg-[#5c4a31]/30 rounded-full"></div>
                    <div className="w-3 h-1.5 bg-[#5c4a31]/30 rounded-full"></div>
                  </div>
                </div>

                <div className="bg-[#fcfbf5] p-4 sm:p-8 text-slate-800 relative">
                  {/* The solid frame like the print view */}
                  <form onSubmit={handleInvoiceSubmit} className="border-2 border-slate-800 p-4 sm:p-6 rounded-md space-y-4 relative">
                    
                    {/* Top info row */}
                    <div className="flex justify-between items-center text-[11px] text-slate-500 font-extrabold border-b border-dashed border-slate-300 pb-2 mb-2">
                      <div className="text-sky-700 font-sans tracking-wide">
                        {editingInvoice ? `تعديل قائمة الحساب رقم (${editingInvoice.invoiceNumber})` : "إنشاء قائمة حساب جديدة"}
                      </div>
                      <div className="text-slate-600">العميل: <span className="text-slate-900 font-black">{selectedCustomer.name}</span></div>
                    </div>

                    {/* 1. Traditional Heading Banner Box with high-contrast glossy metallic style */}
                    <div className="border-2 border-slate-800 bg-gradient-to-r from-slate-200 via-white to-slate-200 p-3 rounded-lg relative overflow-hidden flex items-center justify-between shadow-md">
                      <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-black/5 pointer-events-none"></div>
                      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-300/40 via-white/10 to-transparent skew-x-12 transform origin-top-left pointer-events-none"></div>
                      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-300/40 via-white/10 to-transparent -skew-x-12 transform origin-top-right pointer-events-none"></div>

                      {/* Left Box (Odd / مفرد) */}
                      <div className="border border-slate-800 text-center px-3 py-1 bg-gradient-to-b from-white to-slate-50 min-w-[70px] z-10 shrink-0 shadow-sm rounded-sm">
                        <p className="text-[10px] font-black text-slate-900 border-b border-slate-300 pb-0.5">مفرد</p>
                        <p className="text-[9px] font-black text-slate-500 font-mono mt-0.5">ODD</p>
                      </div>

                      {/* Centered Title */}
                      <div className="text-center z-10 flex-1 px-2">
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-wider">قائمة حســاب</h1>
                        <h2 className="text-xs sm:text-sm font-extrabold text-slate-800 font-serif tracking-widest uppercase mt-0.5">Account Bill</h2>
                      </div>

                      {/* Right Box (Whole / جملة) */}
                      <div className="border border-slate-800 text-center px-3 py-1 bg-gradient-to-b from-white to-slate-50 min-w-[70px] z-10 shrink-0 shadow-sm rounded-sm">
                        <p className="text-[10px] font-black text-slate-900 border-b border-slate-300 pb-0.5">جملة</p>
                        <p className="text-[9px] font-black text-slate-500 font-mono mt-0.5">WHOLE</p>
                      </div>
                    </div>

                    {/* 2. Metadata Input Fields: Serial Number, Date, Due Date, Employee */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 py-3 text-xs sm:text-sm border-b border-dashed border-slate-300 pb-4">
                      {/* Serial Number */}
                      <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                        <span className="text-red-600 font-black font-serif text-base shrink-0">№</span>
                        <input
                          type="text"
                          value={newInvNumber}
                          onChange={(e) => setNewInvNumber(e.target.value)}
                          required
                          placeholder="رقم القائمة"
                          className="w-full max-w-[160px] p-1.5 border border-slate-300 rounded-lg font-mono text-xs font-black text-red-600 focus:ring-1 focus:ring-blue-500 bg-white text-center shadow-sm"
                        />
                      </div>

                      {/* Date */}
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="shrink-0">التاريخ:</span>
                        <input
                          type="date"
                          value={newInvDate}
                          onChange={(e) => setNewInvDate(e.target.value)}
                          required
                          className="w-full max-w-[160px] p-1.5 border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-900 focus:ring-1 focus:ring-blue-500 bg-white text-center shadow-sm"
                        />
                      </div>

                      {/* Due Date (تاريخ الاستحقاق للتنبيهات) */}
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="shrink-0 text-amber-800" title="تاريخ الاستحقاق للتنبيهات التلقائية">الاستحقاق:</span>
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            type="date"
                            value={newInvDueDate}
                            onChange={(e) => setNewInvDueDate(e.target.value)}
                            placeholder="تاريخ الاستحقاق"
                            className="w-full p-1.5 border border-amber-300 rounded-lg font-mono text-xs font-bold text-amber-900 focus:ring-1 focus:ring-amber-500 bg-amber-50/50 text-center shadow-sm"
                            title="حدد موعد استحقاق الفاتورة لتنبيهك تلقائياً في لوحة التحكم عند التأخير"
                          />
                          {newInvDueDate && (
                            <button
                              type="button"
                              onClick={() => setNewInvDueDate("")}
                              className="text-[10px] text-slate-400 hover:text-rose-600 p-1"
                              title="إلغاء تاريخ الاستحقاق"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Employee (المحاسب المسؤول) */}
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="shrink-0">الموظف:</span>
                        <input
                          type="text"
                          placeholder="اسم الموظف المسؤول"
                          value={newInvEmployee}
                          onChange={(e) => setNewInvEmployee(e.target.value)}
                          className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
                        />
                      </div>
                    </div>

                    {/* Customer Info row */}
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-800 font-bold w-full py-1">
                      <span className="shrink-0 text-slate-900 font-black">حضرة السيد :</span>
                      <div className="flex-1 border-b border-dotted border-slate-500 pb-0.5 text-center min-h-[28px] flex items-center justify-center">
                        <span className="px-6 text-sm sm:text-base font-black text-slate-950 bg-transparent underline decoration-dotted decoration-slate-500 decoration-2">
                          {selectedCustomer.name}
                        </span>
                      </div>
                      <span className="shrink-0 font-sans text-slate-900 font-black">المحترم</span>
                    </div>

                    {/* --- TABLE MANAGEMENT CONTROLS --- */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 no-print">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAddColumn}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg cursor-pointer transition-all shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" /> إضافة عمود مخصص جديد
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPasteModal(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg cursor-pointer transition-all shadow-sm"
                        >
                          <FileText className="w-3.5 h-3.5" /> استيراد / لصق صفوف متعددة 📋
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleUndo}
                          disabled={historyPointer <= 0}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                          title="تراجع (Ctrl+Z)"
                        >
                          ↩️ تراجع
                        </button>
                        <button
                          type="button"
                          onClick={handleRedo}
                          disabled={historyPointer >= history.length - 1}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                          title="إعادة (Ctrl+Y)"
                        >
                          إعادة ↪️
                        </button>
                      </div>
                    </div>

                    {/* 3. The exact receipt paper Grid (Interactive table rows with inputs) */}
                    <div className="border-2 border-slate-800 bg-white rounded overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs border-collapse min-w-[750px]">
                          <thead>
                            <tr className="bg-slate-100 text-slate-900 font-black border-b-2 border-slate-800 text-xs">
                              {invColumns.map((col, cIdx) => {
                                const isCore = ["num", "amount", "details", "quantity", "unitPrice"].includes(col.id);
                                return (
                                  <th
                                    key={col.id}
                                    className="py-2 px-2 border-l border-slate-800 text-center font-bold relative group"
                                    style={{ width: col.width || 'auto' }}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      {/* Column Label */}
                                      {editingColumnId === col.id ? (
                                        <input
                                          type="text"
                                          value={editingColumnLabel}
                                          onChange={(e) => setEditingColumnLabel(e.target.value)}
                                          onBlur={() => {
                                            if (editingColumnLabel.trim()) {
                                              handleRenameColumn(col.id, editingColumnLabel);
                                            }
                                            setEditingColumnId(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              if (editingColumnLabel.trim()) {
                                                handleRenameColumn(col.id, editingColumnLabel);
                                              }
                                              setEditingColumnId(null);
                                            }
                                          }}
                                          className="p-0.5 border border-blue-400 rounded text-slate-900 text-xs text-center w-full bg-white font-bold"
                                          autoFocus
                                        />
                                      ) : (
                                        <span
                                          onClick={() => {
                                            setEditingColumnId(col.id);
                                            setEditingColumnLabel(col.label);
                                          }}
                                          className="cursor-pointer hover:underline flex-1 text-center font-bold"
                                          title="اضغط لتغيير اسم العمود"
                                        >
                                          {col.label}
                                        </span>
                                      )}

                                      {/* Shift/Remove Controls (visible on hover/focus) */}
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                        {cIdx > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => handleMoveColumn(cIdx, 'left')}
                                            title="نقل لليمين"
                                            className="p-0.5 hover:bg-slate-200 rounded text-slate-600 text-[9px] cursor-pointer"
                                          >
                                            →
                                          </button>
                                        )}
                                        {cIdx < invColumns.length - 1 && (
                                          <button
                                            type="button"
                                            onClick={() => handleMoveColumn(cIdx, 'right')}
                                            title="نقل لليسار"
                                            className="p-0.5 hover:bg-slate-200 rounded text-slate-600 text-[9px] cursor-pointer"
                                          >
                                            ←
                                          </button>
                                        )}
                                        {!isCore && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveColumn(col.id)}
                                            title="حذف العمود"
                                            className="p-0.5 hover:bg-red-100 text-red-600 rounded text-[10px] cursor-pointer"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </th>
                                );
                              })}
                              {/* Operations/Actions Column Header */}
                              <th className="py-2 px-1 text-center font-bold w-28 no-print">إجراءات الصف</th>
                            </tr>
                          </thead>
                          <tbody>
                            {newInvItems.map((item, idx) => {
                              if (item.isSeparator) {
                                const autoDate = item.paidDate || getCurrentDateFormatted();
                                const autoDay = item.paidDay || getArabicDayName(autoDate);
                                const autoTime = item.paidTime || getCurrentTimeFormatted();

                                return (
                                  <React.Fragment key={`sep-${idx}`}>
                                    {/* Divider line spanning entire table width */}
                                    <tr className="bg-[#faf8f4]/90 border-t border-slate-700">
                                      <td colSpan={invColumns.length} className="p-0 border-l border-slate-800">
                                        <div className="w-full h-[1.5px] bg-slate-700/80"></div>
                                      </td>
                                      <td className="p-0 no-print border-r border-slate-800 bg-slate-50"></td>
                                    </tr>

                                    {/* 1. المجموع (Subtotal) */}
                                    <tr className="bg-[#faf8f4]/90 text-slate-900 font-bold select-text">
                                      {invColumns.map((col) => {
                                        if (col.id === "amount") {
                                          return (
                                            <td key={col.id} className="py-1.5 px-2 border-l border-slate-800 text-center font-mono font-bold text-slate-900 text-sm">
                                              {(item.subtotal || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-sans">{settings.currency}</span>
                                            </td>
                                          );
                                        }
                                        if (col.id === "details") {
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
                                      {/* Action placeholder */}
                                      <td className="py-1.5 px-1 text-center text-xs no-print border-r border-slate-800 bg-slate-50"></td>
                                    </tr>

                                    {/* 2. الواصل (Paid Amount) - قابل للتعديل */}
                                    <tr className="bg-[#faf8f4]/90 text-slate-900 font-bold select-text">
                                      {invColumns.map((col) => {
                                        if (col.id === "amount") {
                                          return (
                                            <td key={col.id} className="py-1.5 px-2 border-l border-slate-800 text-center">
                                              <div className="flex items-center justify-center gap-1">
                                                <input
                                                  type="number"
                                                  min="0"
                                                  placeholder="0"
                                                  value={item.paidAmount || ""}
                                                  onChange={(e) => handleUpdateSeparatorPaid(idx, Number(e.target.value))}
                                                  className="w-24 text-center font-mono font-bold text-sm text-emerald-800 bg-white border border-emerald-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                                                  title="أدخل المبلغ الواصل المسدد"
                                                />
                                                <span className="text-[10px] text-emerald-800 font-bold shrink-0">{settings.currency}</span>
                                              </div>
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
                                      {/* Action controls for separator */}
                                      <td className="py-1.5 px-1 text-center text-xs no-print border-r border-slate-800 align-middle bg-slate-50">
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleInsertRow(idx, "after")}
                                            title="إدراج سطر جديد بعد هذه الفاصلة"
                                            className="p-1 text-slate-600 hover:text-blue-700 hover:bg-slate-200 rounded transition-colors cursor-pointer text-xs font-bold"
                                          >
                                            +⬇️
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveRow(idx)}
                                            title="حذف هذه الفاصلة"
                                            className="p-1 text-rose-600 hover:bg-rose-100 rounded transition-colors cursor-pointer"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      </td>
                                    </tr>

                                    {/* Divider line spanning entire table width */}
                                    <tr className="bg-[#faf8f4]/90">
                                      <td colSpan={invColumns.length} className="p-0 border-l border-slate-800">
                                        <div className="w-full h-[1.5px] bg-slate-700/80"></div>
                                      </td>
                                      <td className="p-0 no-print border-r border-slate-800 bg-slate-50"></td>
                                    </tr>

                                    {/* 3. المتبقي (Remaining) */}
                                    <tr className="bg-black/5 border-b border-slate-700 text-slate-950 font-black select-text">
                                      {invColumns.map((col) => {
                                        if (col.id === "amount") {
                                          return (
                                            <td key={col.id} className="py-2 px-2 border-l border-slate-800 text-center font-mono font-black text-slate-950 text-base bg-black/5">
                                              {(item.remainingAmount || 0).toLocaleString()} <span className="text-[10px] text-slate-600 font-sans font-normal">{settings.currency}</span>
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
                                      {/* Action placeholder */}
                                      <td className="py-2 px-1 text-center text-xs no-print border-r border-slate-800 bg-slate-50"></td>
                                    </tr>
                                  </React.Fragment>
                                );
                              }

                              const rowTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

                              return (
                                <tr key={idx} className="border-b border-dashed border-slate-400 h-11 hover:bg-slate-50/40 text-slate-900 font-bold relative">
                                  {invColumns.map((col, colIdx) => {
                                    if (col.id === "num") {
                                      const arabicNum = [
                                        "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠",
                                        "١١", "١٢", "١٣", "١٤", "١٥", "١٦", "١٧", "١٨", "١٩", "٢٠"
                                      ][idx] || String(idx + 1);
                                      return (
                                        <td key={col.id} className="py-1 px-1 border-l border-slate-800 text-center text-[12px] text-slate-600 font-sans bg-slate-100/50">
                                          {arabicNum}
                                        </td>
                                      );
                                    }

                                    if (col.id === "amount") {
                                      const isRemaining = item.isRemainingRow;
                                      return (
                                        <td key={col.id} className={`py-1 px-1 border-l border-slate-800 text-center text-xs text-slate-900 font-mono min-w-[110px] ${item.isPaymentRow ? "bg-emerald-50/40" : isRemaining ? "bg-rose-50/40" : ""}`}>
                                          <input
                                            id={`input-${idx}-amount`}
                                            type="number"
                                            min="0"
                                            placeholder="المبلغ"
                                            value={item.unitPrice || ""}
                                            onChange={(e) => handleItemChange(idx, "unitPrice", Number(e.target.value))}
                                            onBlur={handleCellBlur}
                                            onKeyDown={(e) => handleKeyDown(e, idx, colIdx, col.id)}
                                            disabled={isRemaining}
                                            className={`w-full bg-transparent border-b border-dotted border-slate-300/80 text-center p-0.5 focus:outline-none focus:ring-0 text-xs font-bold font-mono text-slate-900 ${isRemaining ? "cursor-not-allowed opacity-80" : ""}`}
                                          />
                                        </td>
                                      );
                                    }

                                    if (col.id === "details") {
                                      const isSpecial = item.isPaymentRow || item.isRemainingRow;
                                      return (
                                        <td key={col.id} className={`py-1 px-3 border-l border-slate-800 text-right text-xs text-slate-900 font-sans relative ${item.isPaymentRow ? "bg-emerald-50/20" : item.isRemainingRow ? "bg-rose-50/20" : ""}`}>
                                          <div className="flex items-center justify-between gap-2 w-full relative">
                                            <input
                                              id={`input-${idx}-details`}
                                              type="text"
                                              placeholder=""
                                              value={item.details}
                                              onChange={(e) => {
                                                handleItemChange(idx, "details", e.target.value);
                                                setFocusedRowIdx(idx);
                                              }}
                                              onFocus={() => {
                                                if (!isSpecial) setFocusedRowIdx(idx);
                                              }}
                                              onBlur={() => {
                                                // Delay slightly to allow product list clicks
                                                setTimeout(() => setFocusedRowIdx(null), 250);
                                                handleCellBlur();
                                              }}
                                              onKeyDown={(e) => handleKeyDown(e, idx, colIdx, col.id)}
                                              disabled={isSpecial}
                                              className={`flex-1 bg-transparent border-b border-dotted border-slate-300/80 py-1 px-0.5 focus:outline-none focus:ring-0 text-xs font-bold text-slate-900 ${isSpecial ? "cursor-not-allowed text-slate-800" : ""}`}
                                            />
                                            
                                            {/* Autocomplete Dropdown */}
                                            {focusedRowIdx === idx && item.details && item.details.trim() !== "" && (
                                              <div className="absolute top-full right-0 z-50 w-full max-w-[320px] mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 text-right">
                                                {products
                                                  .filter((p) => p.name.toLowerCase().includes(item.details.toLowerCase()))
                                                  .map((p) => (
                                                    <button
                                                      key={p.id}
                                                      type="button"
                                                      onMouseDown={() => {
                                                        handleSelectProduct(idx, p);
                                                      }}
                                                      className="w-full text-right px-3 py-2 text-xs hover:bg-slate-50 transition-colors flex justify-between items-center cursor-pointer"
                                                    >
                                                      <span className="font-bold text-slate-800">{p.name}</span>
                                                      <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold">
                                                        {p.salePrice.toLocaleString()} {settings.currency}
                                                      </span>
                                                    </button>
                                                  ))}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    }

                                    if (col.id === "quantity") {
                                      return (
                                        <td key={col.id} className="py-1 px-1 border-l border-slate-800 text-center text-xs text-slate-900 font-mono">
                                          <input
                                            id={`input-${idx}-quantity`}
                                            type="number"
                                            min="1"
                                            placeholder=""
                                            value={item.quantity || ""}
                                            onChange={(e) => handleItemChange(idx, "quantity", Number(e.target.value))}
                                            onBlur={handleCellBlur}
                                            onKeyDown={(e) => handleKeyDown(e, idx, colIdx, col.id)}
                                            className="w-full bg-transparent border-b border-dotted border-slate-300/80 text-center p-0.5 focus:outline-none focus:ring-0 text-xs font-bold font-mono text-slate-900"
                                          />
                                        </td>
                                      );
                                    }

                                    if (col.id === "unitPrice") {
                                      return (
                                        <td key={col.id} className="py-1 px-1 border-l border-slate-800 text-center text-xs text-slate-800 font-mono">
                                          <input
                                            id={`input-${idx}-unitPrice`}
                                            type="number"
                                            min="0"
                                            placeholder=""
                                            value={item.unitPrice || ""}
                                            onChange={(e) => handleItemChange(idx, "unitPrice", Number(e.target.value))}
                                            onBlur={handleCellBlur}
                                            onKeyDown={(e) => handleKeyDown(e, idx, colIdx, col.id)}
                                            className="w-full bg-transparent border-b border-dotted border-slate-300/80 text-center p-0.5 focus:outline-none focus:ring-0 text-xs font-bold font-mono text-slate-900"
                                          />
                                        </td>
                                      );
                                    }

                                    // Custom Column Cell
                                    return (
                                      <td key={col.id} className="py-1 px-1 border-l border-slate-800 text-center text-xs text-slate-800">
                                        <input
                                          id={`input-${idx}-${col.id}`}
                                          type="text"
                                          placeholder=""
                                          value={item[col.id] || ""}
                                          onChange={(e) => handleItemChange(idx, col.id, e.target.value)}
                                          onBlur={handleCellBlur}
                                          onKeyDown={(e) => handleKeyDown(e, idx, colIdx, col.id)}
                                          className="w-full bg-transparent border-b border-dotted border-slate-300/80 text-center p-0.5 focus:outline-none focus:ring-0 text-xs font-bold text-slate-900"
                                        />
                                      </td>
                                    );
                                  })}

                                  {/* Row controls */}
                                  <td className="py-1 px-1 text-center text-xs no-print">
                                    <div className="flex items-center justify-center gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => handleInsertRow(idx, "before")}
                                        title="إدراج سطر قبل"
                                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                      >
                                        +⬆️
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleInsertRow(idx, "after")}
                                        title="إدراج سطر بعد"
                                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                      >
                                        +⬇️
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleAddSeparatorRow(idx)}
                                        title="إدراج فاصلة حسابية بعد هذا البند مباشرة"
                                        className="p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors cursor-pointer font-bold text-xs"
                                      >
                                        ➗
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveRow(idx)}
                                        title="حذف هذا السطر"
                                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {/* Action to add extra rows if 12 isn't enough */}
                            <tr className="border-t border-slate-800 no-print">
                              <td colSpan={invColumns.length + 1} className="py-2 px-3 bg-slate-50/50">
                                <div className="flex flex-wrap justify-center items-center gap-2.5">
                                  <button
                                    type="button"
                                    onClick={handleAddItem}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-dashed border-blue-300 bg-white hover:bg-blue-50 text-blue-700 rounded-md text-xs font-bold cursor-pointer transition-colors shadow-sm"
                                  >
                                    <Plus className="w-3.5 h-3.5" /> إضافة سطر فارغ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAddSeparatorRow()}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-md text-xs font-bold cursor-pointer transition-colors shadow-sm"
                                    title="إدراج فاصلة حسابية تحسب المجموع، الواصل، والمتبقي"
                                  >
                                    <Calculator className="w-3.5 h-3.5 text-amber-700" />
                                    <span>إدراج فاصلة حسابية 🧮</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleClearModalRows}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md text-xs font-bold cursor-pointer transition-colors shadow-sm"
                                    title="إفراغ الجدول وتصفير جميع الصفوف"
                                  >
                                    <Eraser className="w-3.5 h-3.5 text-slate-500" />
                                    <span>إفراغ الجدول 🧹</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleAddPaymentRows}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-dashed border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700 rounded-md text-xs font-bold cursor-pointer transition-colors shadow-sm"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" /> صف تسديد
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* The "المجموع" row at the bottom of the table exactly like the image */}
                            <tr className="border-t-2 border-slate-800 bg-slate-100 font-black text-xs">
                              {invColumns.map((col, colIdx) => {
                                if (col.id === "num") {
                                  return (
                                    <td key={col.id} className="py-2 px-1 border-l border-slate-800 text-center font-sans">
                                      -
                                    </td>
                                  );
                                }
                                if (col.id === "amount") {
                                  return (
                                    <td key={col.id} className="py-2 px-2 border-l border-slate-800 text-center text-slate-950 font-mono font-black bg-[#fafafa]">
                                      {getGrandTotal(newInvItems).toLocaleString()}
                                    </td>
                                  );
                                }
                                if (col.id === "details") {
                                  return (
                                    <td key={col.id} className="py-2 px-4 border-l border-slate-800 text-right text-slate-950 text-sm font-bold">
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
                              <td className="py-2 px-1 text-center font-mono no-print">-</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 4. Bottom Form Controls (Notes & Payment Amounts) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t-2 border-slate-800">
                      
                      {/* Right: Notes and Signature */}
                      <div className="space-y-4">
                        {/* Notes text area */}
                        <div>
                          <label className="block text-slate-700 text-xs font-bold mb-1">ملاحظات أو شروط الدفع:</label>
                          <textarea
                            value={newInvNotes}
                            onChange={(e) => setNewInvNotes(e.target.value)}
                            placeholder="اكتب أي ملاحظات أو شروط دفع للدين هنا..."
                            className="w-full p-2 border border-slate-300 rounded text-xs h-16 focus:outline-blue-500 resize-none bg-white font-medium"
                          />
                        </div>

                        <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                          <span>الخطأ والسهو مرجوع للطرفين</span>
                          <div className="text-left">
                            <span className="block text-slate-500 text-[11px] mb-0.5">طريقة توثيق السند:</span>
                            <input
                              type="text"
                              value={newInvSignature}
                              onChange={(e) => setNewInvSignature(e.target.value)}
                              className="p-1 border border-slate-300 rounded text-[11px] font-mono text-slate-600 bg-white focus:outline-blue-500"
                            />
                          </div>
                        </div>

                        <div className="text-center text-[10px] text-slate-400 font-sans pt-2">
                          ستخضع هذه القائمة للرقابة والتدقيق وتثبت مباشرة في الدفتر العمومي للعميل المحترم.
                        </div>
                      </div>

                      {/* Left: Professional Cashier Payment Panel (قسم التسديد) */}
                      <div className="border-2 border-slate-800 p-4 bg-[#fbfbfa] rounded-xl text-xs space-y-3 shadow-md relative overflow-hidden flex flex-col justify-between">
                        <div>
                          <div className="bg-slate-800 text-white text-center py-1 font-extrabold text-[11px] tracking-wide rounded-t-md">
                            قســم التســديد (CASHIER PANEL)
                          </div>
                          
                          <div className="pt-3 space-y-2">
                            {/* 1. Grand Total */}
                            <div className="flex justify-between items-center text-slate-800 font-extrabold text-xs">
                              <span className="text-slate-600">المجموع الكلي:</span>
                              <span className="font-mono font-black text-sm text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {getGrandTotal(newInvItems).toLocaleString()} {settings.currency}
                              </span>
                            </div>

                            {/* 2. Paid Amount */}
                            <div className="flex justify-between items-center text-slate-800 font-extrabold text-xs border-t border-dashed border-slate-300 pt-2">
                              <span className="text-blue-700 flex items-center gap-1 font-black">💸 مبلغ التسديد:</span>
                              <div className="relative max-w-[150px] w-full">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={newInvPaidAmount || ""}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0;
                                    setNewInvPaidAmount(val);
                                    
                                    // Sync with payment/remaining rows if they exist in the table
                                    const items = [...newInvItems];
                                    const payIdx = items.findIndex((item) => item.isPaymentRow);
                                    if (payIdx !== -1) {
                                      items[payIdx] = { ...items[payIdx], unitPrice: val };
                                    }
                                    const subTotal = items
                                      .filter((item) => item.details.trim() !== "" && !item.isPaymentRow && !item.isRemainingRow)
                                      .reduce((acc, item) => acc + (Number(item.unitPrice) || 0), 0);
                                    const remIdx = items.findIndex((item) => item.isRemainingRow);
                                    if (remIdx !== -1) {
                                      items[remIdx] = { ...items[remIdx], unitPrice: Math.max(0, subTotal - val) };
                                    }
                                    setNewInvItems(items);
                                    pushHistory(items, val, invColumns);
                                  }}
                                  className="w-full p-1 border-2 border-blue-500 rounded font-mono text-xs font-black text-blue-800 focus:outline-blue-500 bg-white text-center shadow-inner"
                                />
                              </div>
                            </div>

                            {/* Calculations */}
                            {(() => {
                              const grandTotal = getGrandTotal(newInvItems);
                              const paid = Number(newInvPaidAmount) || 0;
                              
                              let remaining = 0;
                              let change = 0;
                              
                              if (paid >= grandTotal) {
                                remaining = 0;
                                change = paid - grandTotal;
                              } else {
                                remaining = grandTotal - paid;
                                change = 0;
                              }

                              return (
                                <>
                                  {/* 3. Remaining */}
                                  <div className="flex justify-between items-center text-rose-700 font-extrabold text-xs border-t border-dashed border-slate-300 pt-2">
                                    <span>الصافي المتبقي (دين):</span>
                                    <span className="font-mono text-xs bg-rose-50 border border-rose-100 text-rose-800 px-2 py-0.5 rounded font-black">
                                      {remaining.toLocaleString()} {settings.currency}
                                    </span>
                                  </div>

                                  {/* 4. Change amount if any */}
                                  {change > 0 && (
                                    <div className="flex justify-between items-center text-emerald-700 font-extrabold text-xs border-t-2 border-double border-emerald-500 pt-2 animate-pulse">
                                      <span className="flex items-center gap-1 font-black">💰 المبلغ الراجع للزبون:</span>
                                      <span className="font-mono text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-1 rounded-md font-black">
                                        {change.toLocaleString()} {settings.currency}
                                      </span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Form submit buttons */}
                        <div className="flex gap-2 pt-4 border-t border-dashed border-slate-300 mt-4">
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingInvoice(false);
                              setEditingInvoice(null);
                            }}
                            className="flex-1 py-2 px-4 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                          >
                            إلغاء وتراجع
                          </button>
                          
                          <button
                            type="submit"
                            className="flex-[2] py-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shadow transition-colors cursor-pointer text-center"
                          >
                            {editingInvoice ? "حفظ وتعديل القائمة 📥" : "حفظ وتثبيت الدين بالدفتر 📥"}
                          </button>
                        </div>
                      </div>

                    </div>

                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Form: Record Payment */}
          {isRecordingPayment && (
            <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm space-y-4 no-print">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  تسجيل تسديد دفعة للعميل: {selectedCustomer.name}
                </h2>
                <button
                  onClick={() => setIsRecordingPayment(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handlePaymentSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">قيمة دفعة التسديد ({settings.currency})</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">تاريخ الدفع</label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">طريقة الدفع</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                  >
                    <option value="نقدي">💵 نقدي (كاش)</option>
                    <option value="تحويل بنكي">🏦 تحويل بنكي</option>
                    <option value="شيك">✍️ شيك</option>
                    <option value="مدى">💳 بطاقة مدى / الكتروني</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-slate-500 text-xs font-semibold mb-1">ملاحظات على الدفعة (اختياري)</label>
                  <input
                    type="text"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="أدخل أي ملاحظات (مثل رقم الحوالة، اسم المستلم، دفعة تحت الحساب...)"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                  />
                </div>

                <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRecordingPayment(false)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                  >
                    تثبيت دفعة التسديد وتخفيض الدين
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Digital Traditional Paper Ledger Book View */}
          <div className="w-full">
            {!selectedInvoiceId ? (
                <div className="bg-white p-12 rounded-xl border border-slate-100 text-center text-slate-400 text-xs shadow-sm h-full flex flex-col items-center justify-center gap-4">
                  <BookOpen className="w-12 h-12 text-slate-300" />
                  <div className="space-y-1 text-center">
                    <p className="font-bold text-slate-700 text-sm">لم يتم تحديد صفحة حساب حالياً</p>
                    <p className="text-slate-400">يرجى اختيار أحد صفحات الدفتر من القائمة، أو بدء دفتر حساب جديد للعميل بنمط الصورة المرفقة.</p>
                  </div>
                  {selectedCustomer && (
                    <button
                      onClick={() => {
                        const newInv = addInvoice({
                          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
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
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      بدء كشف حساب فارغ للعميل
                    </button>
                  )}
                </div>
              ) : (
                currentInvoice && (
                  <div className="space-y-4">
                    {/* View Mode Switcher */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm no-print">
                      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
                        <button
                          onClick={() => setLedgerDisplayMode("vertical")}
                          className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            ledgerDisplayMode === "vertical"
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          سجل الحساب العمودي (نمط الصورة)
                        </button>
                        <button
                          onClick={() => setLedgerDisplayMode("formal")}
                          className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            ledgerDisplayMode === "formal"
                              ? "bg-slate-800 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          فاتورة مبيعات رسمية (A4)
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        {(() => {
                          const custInvs = selectedCustomer ? getCustomerStats(selectedCustomer.id).custInvoices : [];
                          if (custInvs.length > 1) {
                            return (
                              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700">
                                <FileText className="w-3.5 h-3.5 text-blue-600" />
                                <span>القائمة:</span>
                                <select
                                  value={currentInvoice.id}
                                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                                  className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800 focus:outline-none cursor-pointer"
                                >
                                  {custInvs.map((inv, idx) => (
                                    <option key={inv.id} value={inv.id}>
                                      #{idx + 1} - {inv.invoiceNumber} ({inv.grandTotal.toLocaleString()} {settings.currency})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          }
                          return null;
                        })()}


                      </div>
                    </div>

                    {ledgerDisplayMode === "vertical" ? (
                      <VerticalLedgerSheet
                        key={currentInvoice.id}
                        invoice={currentInvoice}
                        customer={selectedCustomer}
                        settings={settings}
                        onUpdateInvoice={updateInvoice}
                        changeLogs={changeLogs}
                        isCloudSyncing={isCloudSyncing}
                        onAddChangeLog={addChangeLog}
                        onDeleteChangeLog={deleteChangeLog}
                        onClearCustomerChangeLogs={clearCustomerChangeLogs}
                        onRevertChangeLog={revertChangeLogAction}
                      />
                    ) : (
                      <div className="space-y-4">
                        {/* Action buttons above the ledger */}
                        <div className="flex flex-wrap items-center justify-between gap-2 no-print bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={handlePrint}
                          disabled={isPrinting}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                          title="طباعة وصل الدين كاملاً بحجم A4 بدون أي نقص أو صفحات بيضاء"
                        >
                          {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                          <span>{isPrinting ? "جاري تجهيز الوصل..." : "طباعة وصل الدين (A4)"}</span>
                        </button>

                        <button
                          disabled={isExportingPDF}
                          onClick={handleExportPDF}
                          className="px-4 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className={`w-4 h-4 ${isExportingPDF ? "animate-pulse" : ""}`} />
                          {isExportingPDF ? "جاري التصدير..." : "تصدير كـ PDF 📄"}
                        </button>

                        <button
                          onClick={() => {
                            handleStartEditInvoice(currentInvoice);
                          }}
                          className="px-4 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Pencil className="w-4 h-4" /> تعديل القائمة (أخذ شيء إضافي)
                        </button>

                        <button
                          onClick={() => {
                            const txt = formatInvoiceAccountingText(currentInvoice, {
                              includeHeader: true,
                              currency: settings.currency,
                            });
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                              navigator.clipboard.writeText(txt);
                              showToast("تم نسخ نص قائمة الحساب مع فواصل الحساب بنجاح! 📋");
                            }
                          }}
                          className="px-4 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          title="نسخ نص القائمة مع فواصل الحساب (المجموع، الواصل، المتبقي)"
                        >
                          <Copy className="w-4 h-4" /> نسخ نص القائمة 📋
                        </button>

                        {/* Quick button to test auto-extending to page 2 */}
                        <button
                          onClick={() => {
                            const demoItems = [
                              { id: `demo-${Date.now()}-1`, details: "سلك نحاس مبروم 2.5 ملم أصلي (لفة)", quantity: 2, unitPrice: 45000, total: 90000 },
                              { id: `demo-${Date.now()}-2`, details: "قاطع دورة شنايدر 32 أمبير", quantity: 4, unitPrice: 8500, total: 34000 },
                              { id: `demo-${Date.now()}-3`, details: "سبوت لايت ليد 12 واط دافئ", quantity: 10, unitPrice: 3500, total: 35000 },
                              { id: `demo-${Date.now()}-4`, details: "شريط لاصق عازل 3M أصلي", quantity: 6, unitPrice: 1500, total: 9000 },
                              { id: `demo-${Date.now()}-5`, details: "مفتاح مجوز إنجليزي مع إطار", quantity: 8, unitPrice: 6000, total: 48000 },
                              { id: `demo-${Date.now()}-6`, details: "أنبوب كهرباء بلاستيك 20 ملم", quantity: 15, unitPrice: 2000, total: 30000 },
                            ];
                            const currentList = currentInvoice.items || [];
                            const updated = [...currentList, ...demoItems];
                            const newGrandTotal = updated.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
                            const newRemaining = Math.max(0, newGrandTotal - currentInvoice.paidAmount);
                            updateInvoice({
                              ...currentInvoice,
                              items: updated,
                              grandTotal: newGrandTotal,
                              remainingAmount: newRemaining,
                            });
                          }}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          title="إضافة مواد لتجاوز سعة الورقة الأولى (14 مادة) وتمديد السجل تلقائياً إلى صفحة A4 ثانية"
                        >
                          <Layers className="w-4 h-4" />
                          <span>تجربة تمديد لصفحة 2 تلقائياً 📄</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {(() => {
                          const items = getDisplayedItems(currentInvoice);
                          const pages = paginateLedgerItems(items);
                          if (pages.length > 1) {
                            return (
                              <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg">
                                📄 السجل ممتد تلقائياً: {pages.length} صفحات A4 (الصفحة 2 تبدأ مباشرة بالجدول)
                              </span>
                            );
                          }
                          return (
                            <span className="text-[11px] text-slate-500 font-medium">
                              صفحة A4 واحدة ({items.length} مادة)
                            </span>
                          );
                        })()}

                        <button
                          onClick={() => {
                            if (confirm("هل أنت متأكد من رغبتك في حذف صفحة الحساب هذه؟ سيعاد المخزون للمستودع وسيُلغى الدين.")) {
                              deleteInvoice(currentInvoice.id);
                              setSelectedInvoiceId(null);
                            }
                          }}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" /> حذف صفحة الحساب
                        </button>
                      </div>
                    </div>

                    {/* 📄 شريط التنقل بين الصفحات (Page Navigation Bar) */}
                    {(() => {
                      const displayedItems = getDisplayedItems(currentInvoice);
                      const ledgerPages = paginateLedgerItems(displayedItems);
                      const totalLedgerPages = Math.max(1, ledgerPages.length);
                      const safePageNum = Math.min(Math.max(1, currentLedgerPage), totalLedgerPages);
                      const custInvoices = selectedCustomer ? getCustomerStats(selectedCustomer.id).custInvoices : [];
                      const currentInvoiceIndex = custInvoices.findIndex((inv) => inv.id === currentInvoice.id);

                      return (
                        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-3 md:p-3.5 rounded-2xl shadow-lg border border-slate-700/80 mb-3 flex flex-wrap items-center justify-between gap-3 no-print select-none">
                          {/* أزرار التنقل الرئيسية بين الصفحات */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* زر الصفحة السابقة (Previous Page) */}
                            <button
                              type="button"
                              onClick={handlePrevPage}
                              disabled={safePageNum <= 1}
                              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer select-none ${
                                safePageNum <= 1
                                  ? "bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-50"
                                  : "bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black shadow-md hover:shadow-amber-500/20 active:scale-95"
                              }`}
                              title="الانتقال إلى الصفحة السابقة (أو سهم اليمين [→])"
                            >
                              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                              <span>الصفحة السابقة</span>
                            </button>

                            {/* مؤشر الصفحة وأرقام الصفحات */}
                            <div className="flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-700/80 font-mono">
                              <span className="text-xs font-bold text-amber-400 font-sans">
                                ورقة {safePageNum} من {totalLedgerPages}
                              </span>
                              {totalLedgerPages > 1 && (
                                <div className="flex items-center gap-1 mr-2 border-r border-slate-700/80 pr-2">
                                  {ledgerPages.map((p) => (
                                    <button
                                      key={`page-top-btn-${p.pageNum}`}
                                      type="button"
                                      onClick={() => handleGoToPage(p.pageNum)}
                                      className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
                                        safePageNum === p.pageNum
                                          ? "bg-amber-500 text-slate-950 font-black shadow-xs ring-2 ring-amber-300/50 scale-105"
                                          : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                                      }`}
                                      title={`الانتقال مباشرة للورقة ${p.pageNum}`}
                                    >
                                      {p.pageNum}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* زر الصفحة التالية (Next Page) */}
                            <button
                              type="button"
                              onClick={() => handleNextPage(totalLedgerPages)}
                              disabled={safePageNum >= totalLedgerPages}
                              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer select-none ${
                                safePageNum >= totalLedgerPages
                                  ? "bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-50"
                                  : "bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black shadow-md hover:shadow-amber-500/20 active:scale-95"
                              }`}
                              title="الانتقال إلى الصفحة التالية (أو سهم اليسار [←])"
                            >
                              <span>الصفحة التالية</span>
                              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          </div>

                          {/* أدوات إضافية: تقليب الصفحة 3D، كتم الصوت، والتنقل بين قوائم الزبون */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* تبديل وضع العرض */}
                            <div className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-slate-700/80 text-xs">
                              <button
                                type="button"
                                onClick={() => setPageViewMode("flip")}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  pageViewMode === "flip"
                                    ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                                    : "text-slate-400 hover:text-white"
                                }`}
                                title="وضع حركة تقليب الصفحة ثلاثية الأبعاد (3D Page Flip)"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>قلب الصفحة (3D)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPageViewMode("all")}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  pageViewMode === "all"
                                    ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                                    : "text-slate-400 hover:text-white"
                                }`}
                                title="عرض جميع الصفحات متتابعة رأسياً"
                              >
                                <List className="w-3.5 h-3.5" />
                                <span>عرض الكل</span>
                              </button>
                            </div>

                            {/* زر تشغيل / كتم صوت قلب الورق */}
                            <button
                              type="button"
                              onClick={() => {
                                const next = !soundEnabled;
                                setSoundEnabled(next);
                                if (next) setTimeout(playPaperFlipSound, 50);
                              }}
                              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1 text-xs ${
                                soundEnabled
                                  ? "bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700"
                                  : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400"
                              }`}
                              title={soundEnabled ? "صوت تقليب الورق مفعل (اضغط للكتم)" : "صوت تقليب الورق مكتوم (اضغط للتفعيل)"}
                            >
                              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                            </button>

                            {/* التنقل بين قوائم وفواتير الزبون */}
                            {custInvoices.length > 1 && (
                              <div className="flex items-center gap-1.5 bg-slate-950/70 px-2.5 py-1 rounded-xl border border-slate-700/80 text-[11px]">
                                <span className="text-slate-400">دفتر الزبون:</span>
                                <button
                                  type="button"
                                  disabled={currentInvoiceIndex <= 0}
                                  onClick={() => {
                                    if (currentInvoiceIndex > 0) {
                                      setSelectedInvoiceId(custInvoices[currentInvoiceIndex - 1].id);
                                    }
                                  }}
                                  className="p-1 text-slate-300 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-slate-300 cursor-pointer"
                                  title="القائمة السابقة في دفتر الزبون"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                                <span className="font-mono text-amber-300 font-bold">
                                  {currentInvoiceIndex + 1}/{custInvoices.length}
                                </span>
                                <button
                                  type="button"
                                  disabled={currentInvoiceIndex >= custInvoices.length - 1}
                                  onClick={() => {
                                    if (currentInvoiceIndex < custInvoices.length - 1) {
                                      setSelectedInvoiceId(custInvoices[currentInvoiceIndex + 1].id);
                                    }
                                  }}
                                  className="p-1 text-slate-300 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-slate-300 cursor-pointer"
                                  title="القائمة التالية في دفتر الزبون"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Paper Ledger Simulation Container */}
                    <div className="shadow-xl rounded-xl overflow-hidden bg-white border border-slate-200">
                      {/* Notepad Top Bound Cover */}
                      <div className="h-6 bg-[#b29774] border-b-2 border-[#8e7552] flex justify-center items-center shadow-inner relative z-10 no-print">
                        <div className="flex gap-4 justify-around w-full max-w-sm px-4">
                          <div className="w-3 h-1.5 bg-[#5c4a31]/30 rounded-full"></div>
                          <div className="w-3 h-1.5 bg-[#5c4a31]/30 rounded-full"></div>
                          <div className="w-3 h-1.5 bg-[#5c4a31]/30 rounded-full"></div>
                          <div className="w-3 h-1.5 bg-[#5c4a31]/30 rounded-full"></div>
                        </div>
                      </div>

                      <div
                        id="paper-ledger"
                        className="print-container bg-[#fcfbf5] p-5 md:p-8 text-slate-800 relative space-y-10"
                        style={{
                          fontFamily: '"Cairo", "Inter", sans-serif',
                        }}
                      >
                        {(() => {
                          const displayedItems = getDisplayedItems(currentInvoice);
                          const ledgerPages = paginateLedgerItems(displayedItems);
                          const totalLedgerPages = Math.max(1, ledgerPages.length);
                          const safePageNum = Math.min(Math.max(1, currentLedgerPage), totalLedgerPages);
                          const activePage = ledgerPages[safePageNum - 1] || ledgerPages[0];

                          const renderCols = currentInvoice.columns || [
                            { id: "amount", label: "المبلغ", type: "number", width: "150px" },
                            { id: "details", label: "البيـــــــــــــــــــــــــــــــــــان (التفاصيل)", type: "text" }
                          ];

                          const renderPageSheet = (page: LedgerPageChunk) => (
                            <div
                              key={`paper-page-${page.pageNum}`}
                              id={`paper-page-${page.pageNum}`}
                              data-page-sheet="true"
                              className="paper-page-sheet relative"
                              style={{
                                pageBreakAfter: page.isLastPage ? 'auto' : 'always',
                              }}
                            >
                              {/* Visual separation banner on screen when multi-page */}
                              {!page.isFirstPage && (
                                <div className="mb-6 pt-2 pb-3 border-b-2 border-dashed border-amber-900/30 flex flex-wrap items-center justify-between gap-2 no-print">
                                  <div className="flex items-center gap-2">
                                    <span className="bg-amber-800 text-white text-xs font-black px-3 py-1 rounded shadow-xs">
                                      ورقة A4 رقم {page.pageNum} من {page.totalPages}
                                    </span>
                                    <span className="text-xs font-bold text-amber-900 bg-amber-100/90 px-3 py-1 rounded border border-amber-300">
                                      تمديد تلقائي: تبدأ مباشرة بجدول البيانات (تم استبعاد الترويسة والشعار)
                                    </span>
                                  </div>
                                  <span className="text-xs font-mono text-slate-600 font-bold">
                                    المواد {page.startIndex + 1} إلى {page.startIndex + page.items.length}
                                  </span>
                                </div>
                              )}

                              {/* The double/single solid line frame */}
                              <div
                                className="border-2 border-slate-800 p-4 md:p-6 rounded-md space-y-4 relative flex flex-col justify-between"
                                style={{
                                  minHeight: page.isFirstPage ? '842px' : '720px',
                                  backgroundColor: '#fcfbf5',
                                }}
                              >
                                {/* 1. Header Section - ONLY ON FIRST PAGE (استبعاد الترويسة من الصفحة الثانية وما بعدها) */}
                                {page.isFirstPage ? (
                                  <>
                                    {/* Store details at the very top */}
                                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold border-b border-dashed border-slate-300 pb-1.5">
                                      <div>{settings.companyName || "مستودع السندات والديون العامة"}</div>
                                      <div>هاتف: {settings.companyPhone || "غير مسجل"}</div>
                                    </div>

                                    {/* Traditional Heading Banner Box */}
                                    <div className="border-2 border-slate-800 bg-white p-3 rounded-lg relative overflow-hidden flex items-center justify-between shadow-sm">
                                      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-200 via-slate-100/30 to-transparent skew-x-12 transform origin-top-left pointer-events-none"></div>
                                      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-200 via-slate-100/30 to-transparent -skew-x-12 transform origin-top-right pointer-events-none"></div>

                                      {/* Left Box (Odd / مفرد) */}
                                      <div className="border border-slate-800 text-center px-2.5 py-0.5 bg-[#fafafa] min-w-[65px] z-10 shrink-0 shadow-sm">
                                        <p className="text-[10px] font-black text-slate-900 border-b border-slate-300 pb-0.5">مفرد</p>
                                        <p className="text-[9px] font-extrabold text-slate-500 font-mono mt-0.5">ODD</p>
                                      </div>

                                      {/* Centered Title */}
                                      <div className="text-center z-10 flex-1 px-2">
                                        <h1 className="text-2xl md:text-3xl font-black text-slate-950 tracking-normal select-none">قائمة حســاب</h1>
                                        <h2 className="text-sm md:text-base font-extrabold text-slate-800 font-serif tracking-widest uppercase mt-0.5">Account Bill</h2>
                                      </div>

                                      {/* Right Box (Whole / جملة) */}
                                      <div className="border border-slate-800 text-center px-2.5 py-0.5 bg-[#fafafa] min-w-[65px] z-10 shrink-0 shadow-sm">
                                        <p className="text-[10px] font-black text-slate-900 border-b border-slate-300 pb-0.5">جملة</p>
                                        <p className="text-[9px] font-extrabold text-slate-500 font-mono mt-0.5">WHOLE</p>
                                      </div>
                                    </div>

                                    {/* Metadata Lines: Serial Number, Date, Customer Name */}
                                    <div className="space-y-2.5 py-1">
                                      <div className="flex justify-between items-center text-xs md:text-sm">
                                        {/* Stamped Serial Number in red */}
                                        <div className="flex items-center gap-1">
                                          <span className="text-red-500 font-bold font-serif text-sm">№</span>
                                          <span className="text-red-600 font-extrabold font-mono text-base tracking-widest bg-red-50/50 px-1 border border-red-200 rounded">
                                            {String(currentInvoice.invoiceNumber).padStart(7, '0')}
                                          </span>
                                        </div>

                                        {/* Traditional Date line */}
                                        <div className="flex items-center gap-1 font-bold text-slate-800 font-mono">
                                          <span className="font-sans">التاريخ :</span>
                                          <span className="underline decoration-dotted decoration-slate-800 underline-offset-4 px-2">
                                            {currentInvoice.date}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Customer Name Line */}
                                      <div className="flex items-center gap-2 text-xs md:text-sm text-slate-800 font-bold w-full">
                                        <span className="shrink-0">حضرة السيد :</span>
                                        <div className="flex-1 border-b border-dotted border-slate-800 pb-0.5 text-center min-h-[24px] flex items-center justify-center gap-2">
                                          <span className="px-2 text-sm md:text-base font-black text-slate-950 bg-transparent">
                                            {currentInvoice.customerName}
                                          </span>
                                          {selectedCustomer && (
                                            <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                                              (تسلسل: #{getCustomerSequenceInFolder(selectedCustomer).seq})
                                            </span>
                                          )}
                                        </div>
                                        <span className="shrink-0 font-sans">المحترم</span>
                                      </div>
                                    </div>
                                  </>
                                ) : null}

                                {/* 2. The Data Table - Starts DIRECTLY on Page 2 and subsequent pages! */}
                                <div className="border-2 border-slate-800 bg-white rounded overflow-hidden">
                                  <table className="w-full text-right text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-900 font-black border-b-2 border-slate-800 text-xs">
                                        {renderCols.map((col) => (
                                          <th
                                            key={col.id}
                                            className="py-2 px-2 border-l border-slate-800 text-center font-bold"
                                            style={{ width: col.width || 'auto' }}
                                          >
                                            {col.label}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {page.paddedItems.map((item, localIdx) => {
                                        const globalIdx = page.startIndex + localIdx;
                                        const arabicNum = toArabicDigits(globalIdx + 1);

                                        if (item) {
                                          if (item.isSeparator) {
                                            const autoDate = item.paidDate || getCurrentDateFormatted();
                                            const autoDay = item.paidDay || getArabicDayName(autoDate);
                                            const autoTime = item.paidTime || getCurrentTimeFormatted();

                                            return (
                                              <React.Fragment key={item.id || `sep-${globalIdx}`}>
                                                {/* Divider line spanning entire table width */}
                                                <tr className="bg-[#faf8f4]/90 border-t border-slate-700">
                                                  <td colSpan={renderCols.length} className="p-0 border-l border-slate-800">
                                                    <div className="w-full h-[1.5px] bg-slate-700/80"></div>
                                                  </td>
                                                </tr>

                                                {/* 1. المجموع (Subtotal) aligned with renderCols */}
                                                <tr className="bg-[#faf8f4]/90 text-slate-900 font-bold select-text">
                                                  {renderCols.map((col) => {
                                                    if (col.id === "amount") {
                                                      return (
                                                        <td key={col.id} className="py-1.5 px-3 border-l border-slate-800 text-center font-mono font-bold text-slate-900 text-sm">
                                                          {(item.subtotal || 0).toLocaleString()} <span className="text-[11px] text-slate-600 font-sans font-normal">{settings.currency}</span>
                                                        </td>
                                                      );
                                                    }
                                                    if (col.id === "details") {
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
                                                          {(Number(item.paidAmount) || 0).toLocaleString()} <span className="text-[11px] text-emerald-700 font-sans font-normal">{settings.currency}</span>
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
                                                          {(item.remainingAmount || 0).toLocaleString()} <span className="text-[11px] text-slate-700 font-sans font-normal">{settings.currency}</span>
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
                                                      {item.total.toLocaleString()}
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
                                                      {isSpecial ? "-" : item.unitPrice.toLocaleString()}
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
                                                  {currentInvoice.grandTotal.toLocaleString()}
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
                                          <span className="font-mono font-bold text-slate-900">{currentInvoice.grandTotal.toLocaleString()} {settings.currency}</span>
                                        </p>
                                        <p className="flex justify-between text-blue-700 font-bold">
                                          <span>المسدد نقداً:</span>
                                          <span className="font-mono">{currentInvoice.paidAmount.toLocaleString()} {settings.currency}</span>
                                        </p>
                                        <p className="flex justify-between text-rose-700 font-extrabold border-t border-dashed border-slate-300 pt-0.5">
                                          <span>الصافي المتبقي بالذمة:</span>
                                          <span className="font-mono">{currentInvoice.remainingAmount.toLocaleString()} {settings.currency}</span>
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
                  <input
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
