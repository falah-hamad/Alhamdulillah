import React, { useState, useMemo } from "react";
import {
  Trash2,
  RotateCcw,
  ArrowRight,
  Folder,
  User,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  FolderOpen,
  Calendar,
  MapPin,
  Phone,
  DollarSign,
  ShieldCheck,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Customer, CustomerFolder, Invoice, Payment, SystemSettings } from "../types";
import DeleteConfirmModal, { DeleteConfirmType } from "./DeleteConfirmModal";

export interface TrashManagerViewProps {
  folders: CustomerFolder[];
  customers: Customer[];
  invoices?: Invoice[];
  payments?: Payment[];
  settings?: SystemSettings;
  rootName?: string;
  onClose: () => void;
  onRestoreFolder: (folderId: string) => void;
  onPermanentDeleteFolder: (folderId: string) => void;
  onRestoreCustomer: (customerId: string) => void;
  onPermanentDeleteCustomer: (customerId: string) => void;
  onBulkRestore: (folderIds: string[], customerIds: string[]) => void;
  onBulkPermanentDelete: (folderIds: string[], customerIds: string[]) => void;
  onEmptyTrash: () => void;
  onRestoreAllTrash: () => void;
  showToast?: (message: string) => void;
}

export default function TrashManagerView({
  folders,
  customers,
  invoices = [],
  payments = [],
  settings,
  rootName = "سجل الديون",
  onClose,
  onRestoreFolder,
  onPermanentDeleteFolder,
  onRestoreCustomer,
  onPermanentDeleteCustomer,
  onBulkRestore,
  onBulkPermanentDelete,
  onEmptyTrash,
  onRestoreAllTrash,
  showToast,
}: TrashManagerViewProps) {
  // Tabs: "all" | "folders" | "customers"
  const [activeTab, setActiveTab] = useState<"all" | "folders" | "customers">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());

  // Confirm modal state
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    type: DeleteConfirmType;
    id?: string;
    name?: string;
    itemDetails?: string;
    warningMessage?: string;
    isPermanent?: boolean;
    onExecute?: () => void;
  }>({
    isOpen: false,
    type: "permanent_folder",
  });

  const currencySymbol = settings?.currency || "د.ع";

  // Filter deleted items
  const deletedFolders = useMemo(() => {
    return folders.filter((f) => !!f.isDeleted);
  }, [folders]);

  const deletedCustomers = useMemo(() => {
    return customers.filter((c) => !!c.isDeleted);
  }, [customers]);

  const totalDeletedCount = deletedFolders.length + deletedCustomers.length;

  // Build a helper to get original path text for any folder or customer
  const getOriginalFolderPath = (folderId: string | null | undefined): string => {
    if (!folderId || folderId === "root" || folderId === "all") {
      return `${rootName} (الرئيسي)`;
    }
    const path: string[] = [];
    let currId: string | null | undefined = folderId;
    const visited = new Set<string>();

    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const found = folders.find((f) => f.id === currId);
      if (!found) break;
      path.unshift(found.name);
      currId = found.originalParentId || found.parentId;
    }

    if (path.length === 0) return `${rootName} (الرئيسي)`;
    return `${rootName} ← ${path.join(" ← ")}`;
  };

  // Customer debt calculation
  const customerDebtMap = useMemo(() => {
    const map = new Map<string, { debt: number; invoiceCount: number }>();
    deletedCustomers.forEach((c) => {
      const custInvoices = invoices.filter((inv) => inv.customerId === c.id);
      const custPayments = payments.filter((p) => p.customerId === c.id);
      const totalInv = custInvoices.reduce((sum, inv) => sum + (inv.remainingAmount || 0), 0);
      const totalPay = custPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const net = Math.max(0, totalInv - totalPay);
      map.set(c.id, { debt: net, invoiceCount: custInvoices.length });
    });
    return map;
  }, [deletedCustomers, invoices, payments]);

  // Subfolder & customer count for deleted folders
  const folderChildrenCounts = useMemo(() => {
    const map = new Map<string, { subfolders: number; customers: number }>();
    deletedFolders.forEach((f) => {
      const sub = folders.filter((child) => child.parentId === f.id || child.originalParentId === f.id).length;
      const cust = customers.filter((c) => c.folderId === f.id || c.originalFolderId === f.id).length;
      map.set(f.id, { subfolders: sub, customers: cust });
    });
    return map;
  }, [deletedFolders, folders, customers]);

  // Filtered by search
  const filteredFolders = useMemo(() => {
    if (activeTab === "customers") return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return deletedFolders;
    return deletedFolders.filter((f) => {
      const path = getOriginalFolderPath(f.originalParentId || f.parentId).toLowerCase();
      return f.name.toLowerCase().includes(q) || path.includes(q);
    });
  }, [deletedFolders, searchQuery, activeTab, folders]);

  const filteredCustomers = useMemo(() => {
    if (activeTab === "folders") return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return deletedCustomers;
    return deletedCustomers.filter((c) => {
      const path = getOriginalFolderPath(c.originalFolderId || c.folderId).toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        path.includes(q)
      );
    });
  }, [deletedCustomers, searchQuery, activeTab, folders]);

  // Format date
  const formatDate = (isoString?: string) => {
    if (!isoString) return "غير محدد";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  // Selection handlers
  const toggleFolderSelection = (fId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(fId)) next.delete(fId);
      else next.add(fId);
      return next;
    });
  };

  const toggleCustomerSelection = (cId: string) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(cId)) next.delete(cId);
      else next.add(cId);
      return next;
    });
  };

  const selectedTotalCount = selectedFolderIds.size + selectedCustomerIds.size;

  const selectAll = () => {
    setSelectedFolderIds(new Set(filteredFolders.map((f) => f.id)));
    setSelectedCustomerIds(new Set(filteredCustomers.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelectedFolderIds(new Set());
    setSelectedCustomerIds(new Set());
  };

  // Restore handlers
  const handleSingleRestoreFolder = (folder: CustomerFolder) => {
    onRestoreFolder(folder.id);
    const targetPath = getOriginalFolderPath(folder.originalParentId || folder.parentId);
    if (showToast) {
      showToast(`تم استعادة المجلد "${folder.name}" إلى ${targetPath} بنجاح`);
    }
  };

  const handleSingleRestoreCustomer = (customer: Customer) => {
    onRestoreCustomer(customer.id);
    const targetPath = getOriginalFolderPath(customer.originalFolderId || customer.folderId);
    if (showToast) {
      showToast(`تم استعادة الزبون "${customer.name}" إلى ${targetPath} بنجاح`);
    }
  };

  // Permanent Delete handlers with explicit confirmation
  const requestPermanentDeleteFolder = (folder: CustomerFolder) => {
    const counts = folderChildrenCounts.get(folder.id) || { subfolders: 0, customers: 0 };
    setConfirmModalState({
      isOpen: true,
      type: "permanent_folder",
      id: folder.id,
      name: folder.name,
      warningMessage: "هل أنت متأكد من حذف هذا العنصر نهائيًا؟ لا يمكن استعادته بعد ذلك.",
      itemDetails:
        counts.subfolders > 0 || counts.customers > 0
          ? `يحتوي المجلد على ${counts.customers} زبون و ${counts.subfolders} مجلد فرعي. سيتم حذف كل محتوياته بشكل دائم لا رجعة فيه.`
          : `سيتم حذف المجلد "${folder.name}" نهائياً من قاعدة البيانات.`,
      isPermanent: true,
      onExecute: () => {
        onPermanentDeleteFolder(folder.id);
        if (showToast) showToast(`تم حذف المجلد "${folder.name}" نهائياً`);
      },
    });
  };

  const requestPermanentDeleteCustomer = (customer: Customer) => {
    setConfirmModalState({
      isOpen: true,
      type: "permanent_customer",
      id: customer.id,
      name: customer.name,
      warningMessage: "هل أنت متأكد من حذف هذا العنصر نهائيًا؟ لا يمكن استعادته بعد ذلك.",
      itemDetails: `سيتم حذف الزبون "${customer.name}" وجميع فواتيره وسجل ديونه نهائياً ولا يمكن استعادتها لاحقاً.`,
      isPermanent: true,
      onExecute: () => {
        onPermanentDeleteCustomer(customer.id);
        if (showToast) showToast(`تم حذف الزبون "${customer.name}" نهائياً`);
      },
    });
  };

  const requestBulkRestore = () => {
    const fIds: string[] = Array.from(selectedFolderIds);
    const cIds: string[] = Array.from(selectedCustomerIds);
    if (fIds.length === 0 && cIds.length === 0) return;

    onBulkRestore(fIds, cIds);
    clearSelection();
    setIsSelectionMode(false);
    if (showToast) {
      showToast(`تمت استعادة ${fIds.length + cIds.length} عنصر إلى أماكنها الأصلية بنجاح`);
    }
  };

  const requestBulkPermanentDelete = () => {
    const fIds: string[] = Array.from(selectedFolderIds);
    const cIds: string[] = Array.from(selectedCustomerIds);
    if (fIds.length === 0 && cIds.length === 0) return;

    const total = fIds.length + cIds.length;
    setConfirmModalState({
      isOpen: true,
      type: "permanent_bulk",
      warningMessage: "هل أنت متأكد من حذف هذا العنصر نهائيًا؟ لا يمكن استعادته بعد ذلك.",
      itemDetails: `سيتم حذف ${total} عنصر محدد نهائياً من قاعدة البيانات مع كافة السجلات التابعة لها.`,
      isPermanent: true,
      onExecute: () => {
        onBulkPermanentDelete(fIds, cIds);
        clearSelection();
        setIsSelectionMode(false);
        if (showToast) showToast(`تم حذف ${total} عنصر نهائياً`);
      },
    });
  };

  const requestEmptyTrash = () => {
    if (totalDeletedCount === 0) return;
    setConfirmModalState({
      isOpen: true,
      type: "empty_trash",
      warningMessage: "هل أنت متأكد من إفراغ سلة المهملات نهائيًا؟ لا يمكن استعادتها بعد ذلك.",
      itemDetails: `سيتم حذف جميع المجلدات (${deletedFolders.length}) والزبائن (${deletedCustomers.customers ? deletedCustomers.length : deletedCustomers.length}) المحذوفة نهائياً.`,
      isPermanent: true,
      onExecute: () => {
        onEmptyTrash();
        clearSelection();
        setIsSelectionMode(false);
        if (showToast) showToast("تم إفراغ سلة المهملات بالكامل");
      },
    });
  };

  const requestRestoreAll = () => {
    if (totalDeletedCount === 0) return;
    onRestoreAllTrash();
    clearSelection();
    setIsSelectionMode(false);
    if (showToast) {
      showToast("تمت استعادة كافة المجلدات والزبائن إلى أماكنها الأصلية في سجل الديون بنجاح");
    }
  };

  return (
    <div className="w-full bg-slate-50/70 min-h-[550px] rounded-3xl p-4 sm:p-6 text-right font-sans border border-slate-200 shadow-xs" dir="rtl">
      {/* ========================================================
          1. Top App Bar - Trash Screen
          ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors shadow-2xs cursor-pointer"
            title="العودة إلى سجل الديون"
          >
            <ArrowRight className="w-4 h-4 text-slate-500" />
            <span>العودة لسجل الديون</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-800">
                  سلة المهملات
                </h2>
                <span className="bg-rose-100 text-rose-700 text-xs font-black px-2.5 py-0.5 rounded-full">
                  {totalDeletedCount} عنصر
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                المجلدات والزبائن المحذوفة مؤقتاً، مع إمكانية استعادتها لمواقعها الأصلية
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {totalDeletedCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  if (isSelectionMode) clearSelection();
                }}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelectionMode
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <CheckSquare className="w-4 h-4" />
                <span>{isSelectionMode ? "إلغاء التحديد" : "تحديد"}</span>
              </button>

              <button
                type="button"
                onClick={requestRestoreAll}
                className="px-3.5 py-2 text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="استعادة كافة العناصر المحذوفة إلى مواقعها الأصلية"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>استعادة الكل</span>
              </button>

              <button
                type="button"
                onClick={requestEmptyTrash}
                className="px-3.5 py-2 text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="حذف جميع العناصر في سلة المهملات نهائياً"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إفراغ سلة المهملات</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ========================================================
          2. Controls Bar (Tabs + Search)
          ======================================================== */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        {/* Tabs */}
        <div className="inline-flex p-1 bg-white border border-slate-200 rounded-xl shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>الكل</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {totalDeletedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("folders")}
            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "folders"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>المجلدات</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {deletedFolders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("customers")}
            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "customers"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>الزبائن والعملاء</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {deletedCustomers.length}
            </span>
          </button>
        </div>

        {/* Search inside trash */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث في سلة المهملات بالاسم، الهاتف، أو المسار..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl pr-9 pl-4 py-2 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              مسح
            </button>
          )}
        </div>
      </div>

      {/* ========================================================
          3. Multi-Selection Action Bar (if active)
          ======================================================== */}
      {isSelectionMode && (
        <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-3 mb-5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-blue-900">
              تم تحديد {selectedTotalCount} عنصر
            </span>
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
            >
              تحديد الكل
            </button>
            <span className="text-blue-300">|</span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
            >
              إلغاء التحديد
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedTotalCount === 0}
              onClick={requestBulkRestore}
              className="px-3.5 py-1.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة المحددة ({selectedTotalCount})</span>
            </button>

            <button
              type="button"
              disabled={selectedTotalCount === 0}
              onClick={requestBulkPermanentDelete}
              className="px-3.5 py-1.5 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف نهائي للمحددة</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          4. Content: Deleted Folders and Customers
          ======================================================== */}
      {totalDeletedCount === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center my-6 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="text-base font-black text-slate-800 mb-1">
            سلة المهملات فارغة
          </h3>
          <p className="text-xs text-slate-500 max-w-md mb-5 leading-relaxed">
            لا توجد أي مجلدات أو زبائن محذوفة حالياً. كافة بياناتك وفواتيرك آمنة
            ومحفوظة داخل سجل الديون.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            العودة إلى سجل الديون
          </button>
        </div>
      ) : filteredFolders.length === 0 && filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center my-6">
          <p className="text-xs font-bold text-slate-500">
            لا توجد عناصر تطابق بحثك في سلة المهملات.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Deleted Folders Section */}
          {filteredFolders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Folder className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-black text-slate-700">
                  المجلدات المحذوفة ({filteredFolders.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredFolders.map((folder) => {
                  const isSelected = selectedFolderIds.has(folder.id);
                  const originalPath = getOriginalFolderPath(
                    folder.originalParentId || folder.parentId
                  );
                  const counts = folderChildrenCounts.get(folder.id) || {
                    subfolders: 0,
                    customers: 0,
                  };

                  return (
                    <motion.div
                      layout
                      key={folder.id}
                      className={`relative bg-white rounded-2xl p-4 border transition-all ${
                        isSelected
                          ? "border-blue-400 bg-blue-50/20 shadow-xs"
                          : "border-slate-200 hover:border-slate-300 shadow-2xs"
                      }`}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          {isSelectionMode && (
                            <button
                              type="button"
                              onClick={() => toggleFolderSelection(folder.id)}
                              className="text-slate-400 hover:text-blue-600 transition-colors"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: folder.color
                                ? `${folder.color}20`
                                : "#fef3c7",
                              color: folder.color || "#d97706",
                            }}
                          >
                            <Folder className="w-5 h-5" />
                          </div>

                          <div>
                            <h4 className="text-sm font-black text-slate-800 truncate max-w-[170px]">
                              {folder.name}
                            </h4>
                            <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md mt-0.5">
                              مجلد محذوف
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="space-y-1.5 my-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-400">المسار الأصلي:</span>
                          <span className="font-bold text-slate-700 truncate" title={originalPath}>
                            {originalPath}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-400">المحتويات المحفوظة:</span>
                          <span className="font-bold text-slate-700">
                            {counts.customers} زبون، {counts.subfolders} مجلد فرعي
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-400">تاريخ الحذف:</span>
                          <span className="font-mono text-slate-600">
                            {formatDate(folder.deletedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleSingleRestoreFolder(folder)}
                          className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          title="استعادة المجلد ومحتوياته إلى موقعه الأصلي"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>استعادة</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => requestPermanentDeleteFolder(folder)}
                          className="flex-1 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          title="حذف المجلد نهائياً"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف نهائي</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deleted Customers Section */}
          {filteredCustomers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-black text-slate-700">
                  الزبائن المحذوفين ({filteredCustomers.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCustomers.map((customer) => {
                  const isSelected = selectedCustomerIds.has(customer.id);
                  const originalPath = getOriginalFolderPath(
                    customer.originalFolderId || customer.folderId
                  );
                  const debtInfo = customerDebtMap.get(customer.id) || {
                    debt: 0,
                    invoiceCount: 0,
                  };

                  return (
                    <motion.div
                      layout
                      key={customer.id}
                      className={`relative bg-white rounded-2xl p-4 border transition-all ${
                        isSelected
                          ? "border-blue-400 bg-blue-50/20 shadow-xs"
                          : "border-slate-200 hover:border-slate-300 shadow-2xs"
                      }`}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          {isSelectionMode && (
                            <button
                              type="button"
                              onClick={() => toggleCustomerSelection(customer.id)}
                              className="text-slate-400 hover:text-blue-600 transition-colors"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-black text-xs">
                            <User className="w-5 h-5" />
                          </div>

                          <div>
                            <h4 className="text-sm font-black text-slate-800 truncate max-w-[170px]">
                              {customer.name}
                            </h4>
                            <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md mt-0.5">
                              زبون محذوف
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="space-y-1.5 my-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                        {customer.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-slate-700" dir="ltr">
                              {customer.phone}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-400">الموقع الأصلي:</span>
                          <span className="font-bold text-slate-700 truncate" title={originalPath}>
                            {originalPath}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-slate-400">الرصيد المحفوظ:</span>
                          <span className="font-bold font-mono text-emerald-700">
                            {debtInfo.debt.toLocaleString()} {currencySymbol}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({debtInfo.invoiceCount} فاتورة وقائمة)
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-400">تاريخ الحذف:</span>
                          <span className="font-mono text-slate-600">
                            {formatDate(customer.deletedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleSingleRestoreCustomer(customer)}
                          className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          title="استعادة الزبون وكافة ديونه وفواتيره إلى موقعه الأصلي"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>استعادة</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => requestPermanentDeleteCustomer(customer)}
                          className="flex-1 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          title="حذف الزبون نهائياً"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف نهائي</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          5. Explicit Confirmation Modal (For Permanent Delete / Empty)
          ======================================================== */}
      <DeleteConfirmModal
        isOpen={confirmModalState.isOpen}
        type={confirmModalState.type}
        itemName={confirmModalState.name}
        itemDetails={confirmModalState.itemDetails}
        warningMessage={confirmModalState.warningMessage}
        isPermanent={confirmModalState.isPermanent}
        onConfirm={() => {
          if (confirmModalState.onExecute) confirmModalState.onExecute();
          setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => {
          setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
        }}
      />
    </div>
  );
}
