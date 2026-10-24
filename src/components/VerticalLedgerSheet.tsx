import React, { useState, useEffect, useRef } from "react";
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
  History,
  ShoppingCart,
  HandCoins,
} from "lucide-react";
import { Invoice, InvoiceItem, Customer, SystemSettings, CustomerChangeLogItem } from "../types";
import { printElement, exportElementToPDF } from "../utils/printUtils";
import CustomerChangeLogTable from "./CustomerChangeLogTable";
import { formatDebtChangeLogDetails, formatPaymentChangeLogDetails } from "../utils/changeLogUtils";
import { auth } from "../lib/firebase";
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

interface VerticalLedgerSheetProps {
  key?: React.Key;
  invoice: Invoice;
  customer: Customer;
  settings: SystemSettings;
  onUpdateInvoice: (updatedInvoice: Invoice) => Promise<void> | void;
  onOpenProductCart?: (selectedRowId: string) => void;
  onClose?: () => void;
  changeLogs?: CustomerChangeLogItem[];
  isCloudSyncing?: boolean;
  onAddChangeLog?: (item: Omit<CustomerChangeLogItem, "id" | "timestamp" | "formattedDateTime"> & { id?: string; timestamp?: string; formattedDateTime?: string }) => Promise<CustomerChangeLogItem> | void;
  onDeleteChangeLog?: (id: string) => Promise<void> | void;
  onClearCustomerChangeLogs?: (customerId: string) => Promise<void> | void;
  onRevertChangeLog?: (log: CustomerChangeLogItem) => Promise<void> | void;
}

export default function VerticalLedgerSheet({
  invoice,
  customer,
  settings,
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

  // Font Size: Dynamic numeric font size in pixels (default 13, range 10 to 22)
  const [fontSize, setFontSize] = useState<number>(13);
  const [toolbarTab, setToolbarTab] = useState<"font" | "add" | "delete" | "page">("font");
  const [ledgerFontColor, setLedgerFontColor] = useState("#111827");
  const [ledgerFontBold, setLedgerFontBold] = useState(true);
  const [ledgerFontItalic, setLedgerFontItalic] = useState(false);
  const [ledgerFontUnderline, setLedgerFontUnderline] = useState(false);

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

  // Local draft text for amounts currently being typed by the user to avoid cursor jumping or value replacement
  const [editingAmounts, setEditingAmounts] = useState<Record<string, string>>({});

  // Save feedback state
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingChangeLogs, setPendingChangeLogs] = useState<Array<Parameters<NonNullable<typeof commitChangeLog>>[0]>>([]);
  const [pendingPaidNotifications, setPendingPaidNotifications] = useState<Array<{ userId: string; payload: Parameters<typeof dispatchPaidAmountNotification>[1] }>>([]);

  // Queue history entries until the user explicitly confirms saving.
  const onAddChangeLog = (entry: Parameters<NonNullable<typeof commitChangeLog>>[0]) => {
    setPendingChangeLogs((previous) => [...previous, entry]);
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

  const handleConfirmSave = async (): Promise<boolean> => {
    const latestItems = items;
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
    const originalById = new Map((originalInvoiceRef.current.items || []).map((item) => [item.id, item]));
    const editLogs = latestItems.flatMap((item) => {
      const previous = originalById.get(item.id);
      if (!previous || item.isSeparator || previous.isSeparator) return [];
      const oldAmount = Number(previous.total || previous.unitPrice || 0);
      const newAmount = Number(item.total || item.unitPrice || 0);
      const oldName = (previous.details || "").trim();
      const newName = (item.details || "").trim();
      if (oldAmount === newAmount && oldName === newName) return [];
      return [{
        customerId: customer.id,
        invoiceId: invoice.id,
        actionType: "تعديل دين",
        details: `تعديل: ${formatDebtChangeLogDetails(oldName, oldAmount, settings.currency)} ← ${formatDebtChangeLogDetails(newName, newAmount, settings.currency)}`,
        rawAmount: newAmount,
        itemName: newName,
        targetItemId: item.id,
        previousState: previous,
      }];
    });
    try {
      await onUpdateInvoice(updatedInvoice);
      originalInvoiceRef.current = updatedInvoice;
      for (const entry of [...pendingChangeLogs, ...editLogs]) {
        await Promise.resolve(commitChangeLog?.(entry));
      }
      for (const notification of pendingPaidNotifications) {
        await dispatchPaidAmountNotification(notification.userId, notification.payload);
      }
      setPendingPaidNotifications([]);
      setPendingChangeLogs([]);
      setHasUnsavedChanges(false);
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
    if (!hasUnsavedChanges && pendingChangeLogs.length === 0) return;

    const originalInvoice = originalInvoiceRef.current;
    const originalItems = (originalInvoice.items || []).map((it) => ({ ...it, pageNumber: it.pageNumber || 1 }));
    setItems(originalItems);
    setPageCount(Math.max(1, originalInvoice.pageCount || 1, ...originalItems.map((it) => it.pageNumber || 1)));
    setEditingAmounts({});
    setPendingChangeLogs([]);
    setPendingPaidNotifications([]);
    setHasUnsavedChanges(false);
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
            previousState: itemToDelete,
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
          previousState: sep,
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
        style={{
          backgroundColor: sheetBgColor,
          color: ledgerFontColor,
          fontWeight: ledgerFontBold ? 800 : 400,
          fontStyle: ledgerFontItalic ? "italic" : "normal",
          textDecoration: ledgerFontUnderline ? "underline" : "none",
        }}
        data-ledger-font="true"
      >
        <style>{`.a4-page[data-ledger-font="true"] .text-slate-900,.a4-page[data-ledger-font="true"] .text-slate-800,.a4-page[data-ledger-font="true"] .text-slate-700,.a4-page[data-ledger-font="true"] .text-slate-600,.a4-page[data-ledger-font="true"] input{color:${ledgerFontColor}!important;font-weight:${ledgerFontBold ? 800 : 400}!important;font-style:${ledgerFontItalic ? "italic" : "normal"}!important;text-decoration:${ledgerFontUnderline ? "underline" : "none"}!important}`}</style>
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
          <div className="w-full">
            {/* Table Header: ت | المبلغ | التفاصيل */}
            <div className="grid grid-cols-12 border-b border-amber-900/30 pb-2 text-xs font-bold text-slate-600 select-none">
              <div className="col-span-1 text-center font-bold text-slate-500 text-xs">ت</div>
              <div className="col-span-3 text-center font-bold text-xs">المبلغ</div>
              <div className="col-span-8 text-right pr-1 font-bold text-xs">التفاصيل والبيان</div>
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

                    return (
                      <div
                        key={item.id}
                        id={`row-${item.id}`}
                        onClick={() => { setSelectedRowId(item.id); setHasExplicitRowSelection(true); }}
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            handleCommitRowDebtLog(item.id);
                          }
                        }}
                        className={`grid grid-cols-12 items-center py-1 border-b border-amber-900/10 transition-all rounded-md group relative cursor-pointer ${
                          sheetMode === "edit" && isSelected
                            ? "bg-amber-100/70 ring-1 ring-amber-500/80 shadow-2xs"
                            : "hover:bg-amber-900/5"
                        }`}
                      >
                        {/* 1. ت (Line Index) */}
                        <div className="col-span-1 text-center text-[11px] font-mono font-medium text-slate-400 flex items-center justify-center gap-1">
                          {sheetMode === "edit" && isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block no-print"></span>
                          )}
                          <span>{lineIndex}</span>
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
                        <div className="col-span-8 pr-1 pl-1 flex items-center justify-between">
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

                              {/* Quick row actions floating/inline on hover or active row */}
                              <div
                                className={`flex items-center gap-0.5 no-print pr-1 ${
                                  isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                } transition-opacity`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleInsertRowAbove(item.id)}
                                  className="p-1 text-slate-500 hover:text-blue-700 hover:bg-white/80 rounded"
                                  title="إضافة صف جديد أعلى هذا الصف"
                                >
                                  <ArrowUpToLine className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInsertRowBelow(item.id)}
                                  className="p-1 text-slate-500 hover:text-blue-700 hover:bg-white/80 rounded"
                                  title="إضافة صف جديد أسفل هذا الصف"
                                >
                                  <ArrowDownToLine className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleClearRowAmount(item.id)}
                                  className="p-1 text-slate-400 hover:text-amber-700 hover:bg-white/80 rounded"
                                  title="تفريغ المبلغ فقط"
                                >
                                  <Eraser className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(item.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white/80 rounded"
                                  title="حذف هذا الصف كاملاً"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* 4. SEPARATOR BLOCK (الفاصلة الحسابية) */}
                  {sec.separator && (
                    <div
                      id={`sep-${sec.separator.id}`}
                      onClick={() => setSelectedRowId(sec.separator!.id)}
                      className={`pt-1.5 pb-2.5 transition-all rounded-lg ${
                        sheetMode === "edit" && selectedRowId === sec.separator.id
                          ? "ring-1 ring-blue-500 bg-blue-50/40 p-2 my-1.5 shadow-2xs"
                          : ""
                      }`}
                    >
                      {/* ━━━━━━━━━ Line 1: Refined clean divider ━━━━━━━━━ */}
                      <div className="w-full h-[1.5px] bg-slate-700/80 rounded-full my-1.5"></div>

                      {/* المجموع (Subtotal) */}
                      <div className="grid grid-cols-12 items-center py-1">
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
                      <div className="grid grid-cols-12 items-center py-1">
                        <div className="col-span-1"></div>
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
                      <div className="grid grid-cols-12 items-center py-1.5 px-1 bg-black/5 rounded-md border border-slate-300/40">
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
      {/* 0. TAB SWITCHER: ورقة الحساب (3 أعمدة) vs سجل التغييرات */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white/95 rounded-2xl border border-slate-200/90 shadow-2xs no-print">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            id="tab-btn-ledger-sheet"
            onClick={() => setActiveViewTab("sheet")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeViewTab === "sheet"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>ورقة حساب الدين (3 أعمدة)</span>
          </button>

        </div>

        <div className="text-xs text-slate-500 font-medium px-2 flex items-center gap-2">
          <span>حساب:</span>
          <span className="font-bold text-slate-800">{customer.name}</span>
          {customerLogs.length > 0 && (
            <span className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
              {customerLogs.length} حركة مسجلة
            </span>
          )}
        </div>
      </div>

      {activeViewTab === "changelog" ? (
        <CustomerChangeLogTable
          customerId={customer.id}
          customerName={customer.name}
          changeLogs={changeLogs}
          currency={settings.currency}
          onDeleteLog={onDeleteChangeLog}
          onClearCustomerLogs={onClearCustomerChangeLogs}
          onRevertAction={onRevertChangeLog}
          isCloudSyncing={isCloudSyncing}
        />
      ) : (
        <>
          {/* أدوات السجل مرتبة ضمن تبويبات قصيرة، وحالتها مستقلة عن القائمة الحسابية */}
          <div className="bg-white/95 backdrop-blur-xs p-2 rounded-xl border border-slate-200/90 shadow-sm no-print space-y-2">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="أدوات سجل الحساب العمودي">
              <button type="button" role="tab" aria-selected={toolbarTab === "font"} onClick={() => setToolbarTab("font")} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "font" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200"}`}>تنسيق الخط</button>
              <button type="button" role="tab" aria-selected={toolbarTab === "add"} onClick={() => setToolbarTab("add")} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "add" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200"}`}>إضافة</button>
              <button type="button" role="tab" aria-selected={toolbarTab === "delete"} onClick={() => setToolbarTab("delete")} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "delete" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200"}`}>حذف</button>
              <button type="button" role="tab" aria-selected={toolbarTab === "page"} onClick={() => setToolbarTab("page")} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${toolbarTab === "page" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200"}`}>لون الصفحة</button>
              <div className="ms-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button type="button" onClick={() => setSheetMode("view")} className={`rounded-md px-2 py-1 text-[11px] font-bold ${sheetMode === "view" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}><Eye className="inline h-3 w-3 me-1"/>عرض</button>
                <button type="button" onClick={() => setSheetMode("edit")} className={`rounded-md px-2 py-1 text-[11px] font-bold ${sheetMode === "edit" ? "bg-blue-600 text-white" : "text-slate-600"}`}><Pencil className="inline h-3 w-3 me-1"/>تعديل</button>
              </div>
            </div>
            {toolbarTab === "font" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              <label className="flex items-center gap-2 text-[11px] font-bold">حجم الخط <input type="range" min={10} max={22} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-24 accent-blue-600"/><span className="min-w-6 text-blue-700">{fontSize}</span></label>
              <label className="flex items-center gap-1 text-[11px] font-bold">لون الخط <input type="color" value={ledgerFontColor} onChange={(e) => setLedgerFontColor(e.target.value)} className="h-7 w-8 cursor-pointer rounded border bg-white p-0.5"/></label>
              <button type="button" onClick={() => setLedgerFontBold(x => !x)} aria-pressed={ledgerFontBold} className={`rounded-lg border px-3 py-1.5 text-xs font-black ${ledgerFontBold ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-slate-200"}`}>غامق B</button>
              <button type="button" onClick={() => setLedgerFontItalic(x => !x)} aria-pressed={ledgerFontItalic} className={`rounded-lg border px-3 py-1.5 text-xs italic ${ledgerFontItalic ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-slate-200"}`}>مائل I</button>
              <button type="button" onClick={() => setLedgerFontUnderline(x => !x)} aria-pressed={ledgerFontUnderline} className={`rounded-lg border px-3 py-1.5 text-xs underline ${ledgerFontUnderline ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-slate-200"}`}>تسطير U</button>
            </div>}
            {toolbarTab === "add" && sheetMode === "edit" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              <button type="button" onClick={() => handleInsertRowAbove()} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"><Plus className="inline h-3.5 w-3.5 me-1"/>إضافة صف أعلاه</button>
              <button type="button" onClick={() => handleInsertRowBelow()} className="rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white"><Plus className="inline h-3.5 w-3.5 me-1"/>إضافة صف أدناه</button>
              <button type="button" onClick={() => { if (!hasExplicitRowSelection || !selectedRowId) { alert("يرجى تحديد الصف المطلوب أولاً، ثم فتح عربة البضاعة."); return; } onOpenProductCart?.(selectedRowId); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white"><ShoppingCart className="inline h-3.5 w-3.5 me-1"/>عربة التسوق</button>
              <button type="button" id="btn-insert-separator" onClick={() => handleInsertSeparator()} title="إضافة تسديد (المجموع / الواصل / المتبقي)" className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white"><HandCoins className="inline h-3.5 w-3.5 me-1"/>إضافة تسديد</button>
            </div>}
            {toolbarTab === "delete" && sheetMode === "edit" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              {selectedItem && <button type="button" onClick={() => handleDeleteRow()} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700"><Eraser className="inline h-3.5 w-3.5 me-1"/>حذف الصف</button>}
              <button type="button" onClick={handleClearAllItems} disabled={items.length === 0} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 disabled:opacity-40"><Eraser className="inline h-3.5 w-3.5 me-1"/>تفريغ السجل</button>
            </div>}
            {toolbarTab === "page" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              <label className="flex items-center gap-2 text-[11px] font-bold">لون الصفحة <input type="color" value={sheetBgColor} onChange={(e) => handleSelectBgColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-white p-0.5"/></label>
              <div className="flex flex-wrap gap-1.5">{BG_COLOR_PRESETS.slice(0,8).map((preset) => <button key={preset.id} type="button" title={preset.name} aria-label={preset.name} onClick={() => handleSelectBgColor(preset.color)} className="h-7 w-7 rounded-lg border border-black/10" style={{backgroundColor:preset.color}}/>)}</div>
            </div>}
            {saveStatus && <div className="text-[10px] font-bold text-emerald-700">{saveStatus}</div>}
            {sheetMode === "edit" && hasUnsavedChanges && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2"><span className="text-[10px] font-bold text-amber-800">تغييرات غير محفوظة</span><button type="button" onClick={handleConfirmSave} className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"><Check className="inline h-3.5 w-3.5 me-1"/>تم الحفظ</button><button type="button" onClick={handleCancelChanges} className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700"><X className="inline h-3.5 w-3.5 me-1"/>إلغاء</button></div>}
          </div>
        {/* Row 3: Active Row Controls in Edit Mode */}
        {sheetMode === "edit" && (
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5 border-t border-slate-100 text-[11px]">
            {/* Active selection indicator */}
            <div className="flex items-center gap-1.5 max-w-full overflow-hidden">
              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
                <MousePointerClick className="w-3 h-3 text-blue-600 shrink-0" />
                الصف المحدد:
              </span>

              {selectedItem ? (
                <div className="truncate bg-blue-50/90 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md font-bold text-[10px]">
                  {selectedItem.isSeparator
                    ? `تسديد (صفحة ${selectedItem.pageNumber || 1})`
                    : `#${selectedIndex + 1}: ${selectedItem.details || "صف فارغ"} (${Number(
                        selectedItem.total || selectedItem.unitPrice || 0
                      ).toLocaleString()} ${settings.currency}) — صفحة ${selectedItem.pageNumber || 1}`}
                </div>
              ) : (
                <span className="text-slate-400 italic text-[10px]">
                  حدد أي صف لاستخدام أدوات التحكم
                </span>
              )}
            </div>

            {/* Quick Row Buttons */}
            <div className="flex flex-wrap items-center gap-1">
              {/* Move to another page dropdown */}
              {pageCount > 1 && selectedItem && (
                <div className="flex items-center gap-1 bg-amber-50/90 border border-amber-200 px-1.5 py-0.5 rounded-md text-[10px]">
                  <span className="text-amber-900 font-bold">نقل إلى:</span>
                  <select
                    value={selectedItem.pageNumber || 1}
                    onChange={(e) => handleMoveRowToPage(selectedItem.id, Number(e.target.value))}
                    className="bg-white border border-amber-300 text-amber-950 font-bold rounded px-1 py-0.2 text-[10px] cursor-pointer"
                    title="نقل هذا السطر إلى صفحة أخرى"
                  >
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                      <option key={p} value={p}>
                        صفحة {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="h-3 w-px bg-slate-200 mx-0.5"></div>

              <button
                type="button"
                id="btn-move-up"
                onClick={() => handleMoveRowUp()}
                disabled={selectedIndex <= 0}
                className="p-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 rounded-md transition-colors cursor-pointer border border-slate-200"
                title="تحريك الصف للأعلى"
              >
                <ArrowUp className="w-2.5 h-2.5" />
              </button>

              <button
                type="button"
                id="btn-move-down"
                onClick={() => handleMoveRowDown()}
                disabled={selectedIndex === -1 || selectedIndex >= items.length - 1}
                className="p-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 rounded-md transition-colors cursor-pointer border border-slate-200"
                title="تحريك الصف للأسفل"
              >
                <ArrowDown className="w-2.5 h-2.5" />
              </button>

              <div className="h-3 w-px bg-slate-200 mx-0.5"></div>

              {!isSelectedSeparator && (
                <button
                  type="button"
                  id="btn-clear-amount"
                  onClick={() => selectedItem && handleClearRowAmount(selectedItem.id)}
                  className="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer border border-amber-200"
                  title="تفريغ مبلغ هذا الصف فقط مع الإبقاء على البيان"
                >
                  <Eraser className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  <span>تفريغ المبلغ</span>
                </button>
              )}

              </div>
          </div>
        )}

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
