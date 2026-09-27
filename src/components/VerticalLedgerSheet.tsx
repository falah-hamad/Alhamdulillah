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
  onUpdateInvoice: (updatedInvoice: Invoice) => void;
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
  changeLogs = [],
  isCloudSyncing = false,
  onAddChangeLog,
  onDeleteChangeLog,
  onClearCustomerChangeLogs,
  onRevertChangeLog,
}: VerticalLedgerSheetProps) {
  // Main view tab: "sheet" (ورقة حساب الدين) or "changelog" (سجل التغييرات)
  const [activeViewTab, setActiveViewTab] = useState<"sheet" | "changelog">("sheet");

  // Mode: "view" (عرض علامة عين) or "edit" (تعديل علامة قلم) - الافتراضي هو وضع العرض
  const [sheetMode, setSheetMode] = useState<"edit" | "view">("view");

  // Font Size: Dynamic numeric font size in pixels (default 13, range 10 to 22)
  const [fontSize, setFontSize] = useState<number>(13);

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
  const [viewAllPages, setViewAllPages] = useState<boolean>(false);

  // Sync items and state whenever a different invoice is loaded
  useEffect(() => {
    if (!invoice.items || invoice.items.length === 0) {
      setItems([]);
      setSelectedRowId(null);
    } else {
      setItems(
        invoice.items.map((it) => ({
          ...it,
          pageNumber: it.pageNumber || 1,
        }))
      );
      setSelectedRowId(invoice.items[0]?.id || null);
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

  // Local draft text for amounts currently being typed by the user to avoid cursor jumping or value replacement
  const [editingAmounts, setEditingAmounts] = useState<Record<string, string>>({});

  // Save feedback state
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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

    onUpdateInvoice(updatedInvoice);
    setSaveStatus("تم الحفظ وتحديث الحساب تلقائياً");
    setTimeout(() => setSaveStatus(null), 1800);
  };

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
      details: "فاصلة حساب",
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

      dispatchPaidAmountNotification(currentUserId, {
        operationId: opId,
        customerId: customer.id,
        customerName: customer.name || invoice.customerName || "العميل",
        invoiceId: invoice.id,
        paidAmount: paid,
        remainingAmount: remainingVal,
        currency: settings.currency,
      }).catch((e) => console.warn("Failed to dispatch paid amount notification:", e));
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
        alert("حدث خطأ أثناء تصدير ملف PDF. يمكنك استخدام زر طباعة وصل الدين مباشرة.");
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
        }}
      >
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
                      محلات العاشق للكهربائيات
                    </h1>
                    <span className="text-[10px] font-bold bg-amber-100/90 text-amber-950 border border-amber-300/80 px-2 py-0.5 rounded-full shadow-2xs">
                      تأسيسات وإنارة حديثة
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-700 mt-0.5 leading-snug">
                    لتجارة وتجهيز كافة المواد والشبكات والتأسيسات الكهربائية ومستلزمات الإنارة
                  </p>
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
              <div className="col-span-4 text-center font-bold text-xs">المبلغ</div>
              <div className="col-span-7 text-right pr-3 font-bold text-xs">التفاصيل والبيان</div>
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
                        onClick={() => setSelectedRowId(item.id)}
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
                        <div className="col-span-4 px-2">
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
                        <div className="col-span-7 pr-3 pl-1 flex items-center justify-between">
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
                          className="col-span-4 text-center font-mono font-bold text-slate-900"
                        >
                          {sec.subtotal.toLocaleString()}
                        </div>
                        <div
                          style={{ fontSize: `${fontSize}px` }}
                          className="col-span-7 pr-3 font-bold text-slate-800 flex items-center justify-between"
                        >
                          <span>المجموع</span>
                        </div>
                      </div>

                      {/* الواصل (Paid Amount) */}
                      <div className="grid grid-cols-12 items-center py-1">
                        <div className="col-span-1"></div>
                        <div className="col-span-4 text-center flex items-center justify-center">
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
                        <div className="col-span-7 pr-3 flex items-center justify-between gap-2">
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
                          className="col-span-4 text-center font-mono font-black text-slate-950"
                        >
                          {sec.remaining.toLocaleString()}
                        </div>
                        <div
                          style={{ fontSize: `${fontSize + 1}px` }}
                          className="col-span-7 pr-3 font-black text-slate-950 flex items-center gap-2"
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

            {/* Empty page state placeholder */}
            {pageData.pageItemsCount === 0 && (
              <div className="border-2 border-dashed border-amber-900/20 rounded-xl p-8 text-center my-6 space-y-3 bg-white/40 select-none">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-2xs">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    صفحة رقم {pageData.pageNum} جاهزة لإضافة الديون
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    يمكنك كتابة مواد وطلبات ديون جديدة أو إدراج فواصل حسابية في هذه الصفحة
                  </p>
                </div>
                {sheetMode === "edit" && (
                  <button
                    type="button"
                    onClick={() => handleAddNewRowToPage(pageData.pageNum)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ إضافة أول مادة في صفحة {pageData.pageNum}</span>
                  </button>
                )}
              </div>
            )}

            {/* Interactive Add Row & Add Page controls at the bottom of the page in Edit Mode */}
            {sheetMode === "edit" && (
              <div className="pt-3 pb-1 flex flex-wrap items-center justify-between gap-2 border-t border-amber-900/15 no-print mt-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAddNewRowToPage(pageData.pageNum)}
                    className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    title={`إضافة مادة دين جديدة في صفحة ${pageData.pageNum}`}
                  >
                    <Plus className="w-3 h-3 text-emerald-600" />
                    <span>+ إضافة مادة في صفحة {pageData.pageNum}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInsertSeparator(pageData.pageNum)}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-800 border border-blue-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    title={`إضافة فاصلة حسابية في صفحة ${pageData.pageNum}`}
                  >
                    <Calculator className="w-3 h-3 text-blue-600" />
                    <span>+ فاصلة حسابية 🧮</span>
                  </button>
                </div>

                {isLastPage && (
                  <button
                    type="button"
                    onClick={handleAddNewPage}
                    className="px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                    title="إضافة صفحة ثانية / تالية لإضافة ديون أكثر بحجم A4"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة صفحة {pageCount + 1} (A4) 📄</span>
                  </button>
                )}
              </div>
            )}
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

  const customerLogs = (changeLogs || []).filter((l) => l.customerId === customer.id);

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

          <button
            type="button"
            id="tab-btn-changelog"
            onClick={() => setActiveViewTab("changelog")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeViewTab === "changelog"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>سجل التغييرات</span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                activeViewTab === "changelog"
                  ? "bg-amber-700/90 text-white border-amber-500"
                  : "bg-amber-100 text-amber-900 border-amber-300"
              }`}
            >
              {customerLogs.length}
            </span>
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
          {/* 1. TOP TOOLBAR: COMPACT, ELEGANT, ORGANIZED CONTROLS */}
          <div className="bg-white/95 backdrop-blur-xs p-2.5 sm:p-3 rounded-xl border border-slate-200/90 shadow-2xs no-print space-y-2.5">
        {/* Row 1: Mode Switcher, Font Size, Paper Color, Add Row, Separator & Print/PDF */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
          {/* Primary Controls Group */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* View / Edit Mode Switcher */}
            <div className="flex items-center p-0.5 bg-slate-100/90 rounded-lg border border-slate-200/80">
              <button
                type="button"
                id="btn-mode-view"
                onClick={() => setSheetMode("view")}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  sheetMode === "view"
                    ? "bg-white text-blue-700 shadow-xs ring-1 ring-blue-300/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="وضع العرض: معاينة كشف الحساب للقراءة والطباعة بشكل دفتر ورقي نظيف"
              >
                <Eye className="w-3 h-3 text-blue-600 shrink-0" />
                <span>عرض</span>
              </button>

              <button
                type="button"
                id="btn-mode-edit"
                onClick={() => setSheetMode("edit")}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  sheetMode === "edit"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="وضع التعديل: تحرير مباشر للبيانات والأسطر والمبالغ وإدراج الفواصل الحسابية"
              >
                <Pencil className="w-3 h-3 shrink-0" />
                <span>تعديل</span>
              </button>
            </div>

            {/* Font Size Slider Bar with Numbers */}
            <div
              id="toolbar-font-size-control"
              className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-lg border border-slate-200/80 shadow-2xs"
              title="التحكم بحجم الخط عبر شريط التمرير والأرقام"
            >
              <Type className="w-3 h-3 text-blue-600 shrink-0" />
              <button
                type="button"
                id="btn-font-decrease"
                onClick={() => setFontSize((prev) => Math.max(10, prev - 1))}
                className="w-4 h-4 rounded text-[10px] font-black bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-600 hover:border-blue-300 cursor-pointer shadow-2xs active:scale-90 select-none"
                title="تصغير حجم الخط (-1)"
              >
                -
              </button>
              <input
                id="input-font-size-slider"
                type="range"
                min={10}
                max={22}
                step={1}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-16 sm:w-20 h-1.5 accent-blue-600 bg-slate-200 rounded-lg cursor-pointer"
                title={`حجم الخط: ${fontSize}`}
              />
              <button
                type="button"
                id="btn-font-increase"
                onClick={() => setFontSize((prev) => Math.min(22, prev + 1))}
                className="w-4 h-4 rounded text-[10px] font-black bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-600 hover:border-blue-300 cursor-pointer shadow-2xs active:scale-90 select-none"
                title="تكبير حجم الخط (+1)"
              >
                +
              </button>
              <div className="flex items-center gap-0.5 bg-white border border-blue-200/90 rounded px-1.5 py-0.5 shadow-2xs select-none">
                <span className="text-[11px] font-mono font-black text-blue-700 leading-none">{fontSize}</span>
                <span className="text-[8px] text-slate-400 font-bold leading-none">pt</span>
              </div>
            </div>

            {/* Background Color Selector */}
            <div ref={colorPickerRef} className="relative">
              <button
                type="button"
                id="btn-toggle-bg-color-picker"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="flex items-center gap-1.5 px-2 py-1 bg-slate-100/90 hover:bg-slate-200/80 rounded-lg border border-slate-200/80 shadow-2xs transition-colors cursor-pointer text-[11px] font-bold text-slate-700 active:scale-95"
                title="اختيار وتغيير لون خلفية ورقة الدفتر"
              >
                <Palette className="w-3 h-3 text-indigo-600 shrink-0" />
                <span
                  className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-2xs shrink-0"
                  style={{ backgroundColor: sheetBgColor }}
                />
                <span className="hidden sm:inline">لون الورقة</span>
              </button>

              {showColorPicker && (
                <div
                  id="bg-color-picker-popover"
                  className="absolute top-full right-0 mt-1.5 z-40 bg-white rounded-xl shadow-lg border border-slate-200 p-2.5 w-64 space-y-2 animate-in fade-in zoom-in-95 duration-100 no-print"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 pb-1 border-b border-slate-100">
                    <span className="flex items-center gap-1">
                      <Palette className="w-3 h-3 text-indigo-600" />
                      اختيار لون خلفية الدفتر
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowColorPicker(false)}
                      className="text-slate-400 hover:text-slate-700 text-xs p-0.5 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Preset Swatches */}
                  <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                    {BG_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          handleSelectBgColor(preset.color);
                          setShowColorPicker(false);
                        }}
                        className={`flex flex-col items-center gap-1 p-1 rounded-lg border text-center transition-all cursor-pointer ${
                          sheetBgColor.toLowerCase() === preset.color.toLowerCase()
                            ? "ring-2 ring-blue-500 border-transparent shadow-xs"
                            : "border-slate-200 hover:border-slate-300 hover:shadow-2xs"
                        }`}
                        title={preset.name}
                      >
                        <span
                          className="w-6 h-6 rounded-md border border-black/15 shadow-2xs"
                          style={{ backgroundColor: preset.color }}
                        />
                        <span className="text-[9px] font-medium text-slate-600 truncate w-full">
                          {preset.name.split(" ")[0]}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Color Picker */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <span className="text-[10px] text-slate-500 font-medium">لون حر مخصص:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        id="input-custom-bg-color"
                        value={sheetBgColor}
                        onChange={(e) => handleSelectBgColor(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer border border-slate-200 p-0 bg-transparent"
                        title="اختر أي لون مخصص"
                      />
                      <span className="text-[10px] font-mono text-slate-600 uppercase font-bold">{sheetBgColor}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {sheetMode === "edit" && (
              <>
                {/* Add new row button */}
                <button
                  type="button"
                  id="btn-toolbar-add-row"
                  onClick={() => handleInsertRowBelow()}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer active:scale-95 shrink-0"
                  title="إضافة صف جديد إلى السجل"
                >
                  <Plus className="w-3 h-3 text-white shrink-0" />
                  <span>إضافة صف</span>
                </button>

                {/* Separator Button */}
                <button
                  type="button"
                  id="btn-insert-separator"
                  onClick={() => handleInsertSeparator()}
                  className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer active:scale-95 shrink-0"
                  title="إدراج فاصلة حسابية (المجموع / الواصل / المتبقي)"
                >
                  <Calculator className="w-3 h-3 text-blue-100 shrink-0" />
                  <span>فاصلة حسابية 🧮</span>
                </button>
              </>
            )}

            {saveStatus && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/90 px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                <Check className="w-3 h-3" />
                <span>{saveStatus}</span>
              </span>
            )}
          </div>

          {/* Secondary Actions: Print & PDF */}
          <div className="flex items-center gap-1.5 shrink-0">
            {sheetMode === "edit" && items.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllItems}
                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer border border-rose-200"
                title="تفريغ جميع بنود الحساب وجعله فارغاً"
              >
                <Eraser className="w-3 h-3 text-rose-600 shrink-0" />
                <span>تفريغ السجل</span>
              </button>
            )}

            <button
              type="button"
              id="btn-print-debt-voucher"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-50 select-none"
              title="طباعة وصل الدين كاملاً بجميع القيود والصفحات (A4) بدون أي نقص"
            >
              {isPrinting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Printer className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isPrinting ? "جاري تجهيز الوصل..." : "طباعة وصل الدين (A4)"}</span>
            </button>

            <button
              type="button"
              id="btn-export-debt-pdf"
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300/80 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 disabled:opacity-50 select-none"
              title="تصدير وصل الدين بصيغة PDF عالية الدقة ومتعددة الصفحات"
            >
              {isExportingPDF ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-emerald-600" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              )}
              <span>{isExportingPDF ? "جاري الحفظ..." : "حفظ PDF"}</span>
            </button>
          </div>
        </div>

        {/* Row 2: A4 PAGES MANAGEMENT BAR (شريط إدارة وتصفح صفحات الوصل A4) */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50/90 rounded-xl border border-slate-200/90">
          {/* Page Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 ml-1">
              <Layers className="w-3.5 h-3.5 text-amber-600" />
              <span>صفحات الديون (A4):</span>
            </div>

            {Array.from({ length: pageCount }, (_, i) => i + 1).map((pg) => {
              const isSelected = currentPage === pg && !viewAllPages;
              const countOnPage = items.filter((it) => (it.pageNumber || 1) === pg && !it.isSeparator).length;

              return (
                <button
                  key={pg}
                  type="button"
                  onClick={() => {
                    setCurrentPage(pg);
                    setViewAllPages(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    isSelected
                      ? "bg-amber-500 text-white shadow-xs ring-1 ring-amber-600"
                      : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                  title={`عرض صفحة رقم ${pg}`}
                >
                  <BookOpen className="w-3 h-3 shrink-0" />
                  <span>صفحة {pg}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isSelected ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {countOnPage}
                  </span>
                </button>
              );
            })}

            {/* زر إضافة صفحة جديدة (صفحة 2، صفحة 3...) */}
            <button
              type="button"
              id="btn-add-new-page"
              onClick={handleAddNewPage}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95 select-none"
              title="إضافة صفحة أخرى لكتابة ديون ومواد أكثر بحجم ورقة A4"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ إضافة صفحة جديدة (صفحة {pageCount + 1})</span>
            </button>
          </div>

          {/* View Options & Delete Page */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Toggle View: Single Page vs All Pages */}
            <div className="flex items-center p-0.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewAllPages(false)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  !viewAllPages
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="عرض صفحة واحدة فقط"
              >
                صفحة منفردة
              </button>
              <button
                type="button"
                onClick={() => setViewAllPages(true)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  viewAllPages
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="عرض كافة صفحات الكشف متتالية"
              >
                كافة الصفحات ({pageCount})
              </button>
            </div>

            {pageCount > 1 && (
              <button
                type="button"
                onClick={handleDeleteCurrentPage}
                className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold border border-rose-200 transition-colors cursor-pointer flex items-center gap-1"
                title={`حذف صفحة رقم ${currentPage}`}
              >
                <Trash2 className="w-3 h-3 text-rose-500" />
                <span>حذف صفحة {currentPage}</span>
              </button>
            )}
          </div>
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
                    ? `فاصلة حسابية (صفحة ${selectedItem.pageNumber || 1})`
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

              <button
                type="button"
                id="btn-insert-above"
                onClick={() => handleInsertRowAbove()}
                className="px-1.5 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer border border-slate-200"
                title="إضافة صف جديد أعلى الصف المحدد"
              >
                <ArrowUpToLine className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                <span>أعلى</span>
              </button>

              <button
                type="button"
                id="btn-insert-below"
                onClick={() => handleInsertRowBelow()}
                className="px-1.5 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer border border-slate-200"
                title="إضافة صف جديد أسفل الصف المحدد"
              >
                <ArrowDownToLine className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                <span>أسفل</span>
              </button>

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

              <button
                type="button"
                id="btn-delete-row"
                onClick={() => selectedItem && handleDeleteRow(selectedItem.id)}
                className="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer border border-rose-200"
                title="حذف هذا الصف كاملاً من السجل"
              >
                <Trash2 className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                <span>حذف</span>
              </button>
            </div>
          </div>
        )}
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
