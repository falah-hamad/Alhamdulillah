import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  BellRing,
  Calendar,
  Clock,
  ExternalLink,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  X,
  Phone,
  CheckCircle2,
  Copy,
  CalendarDays,
  FileSpreadsheet,
  ArrowLeft,
  Filter,
  DollarSign
} from "lucide-react";
import { Invoice, Customer, SystemSettings } from "../types";
import { openExternalUrl } from "../lib/native";
import {
  isInvoiceOverdue,
  getInvoiceOverdueDays,
  getInvoiceDueDateString,
  getOverdueSeverity,
  generateOverdueWhatsAppMessage,
} from "../utils/overdueUtils";

interface OverdueInvoicesAlertProps {
  invoices: Invoice[];
  customers: Customer[];
  settings: SystemSettings;
  setCurrentTab: (tab: string) => void;
  onSelectInvoiceForLedger?: (customerId: string, invoiceId: string) => void;
  onUpdateInvoice?: (invoice: Invoice) => void;
}

export default function OverdueInvoicesAlert({
  invoices,
  customers,
  settings,
  setCurrentTab,
  onSelectInvoiceForLedger,
  onUpdateInvoice,
}: OverdueInvoicesAlertProps) {
  // State for expanded view
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<"all" | "critical" | "high" | "moderate" | "recent">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit due date modal state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [newDueDate, setNewDueDate] = useState<string>("");

  // Share/reminder message modal
  const [reminderModal, setReminderModal] = useState<{
    isOpen: boolean;
    customerName: string;
    phone: string;
    text: string;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Compute overdue invoices
  const overdueList = useMemo(() => {
    return invoices
      .filter((inv) => isInvoiceOverdue(inv))
      .map((inv) => {
        const days = getInvoiceOverdueDays(inv);
        const severity = getOverdueSeverity(days);
        const dueDate = getInvoiceDueDateString(inv);
        return {
          invoice: inv,
          days,
          severity,
          dueDate,
        };
      })
      .sort((a, b) => b.days - a.days); // Sort descending by overdue days
  }, [invoices]);

  // Calculations
  const totalOverdueCount = overdueList.length;
  const totalOverdueAmount = useMemo(() => {
    return overdueList.reduce((sum, item) => sum + item.invoice.remainingAmount, 0);
  }, [overdueList]);

  const maxOverdueDays = overdueList.length > 0 ? overdueList[0].days : 0;

  // Filtered overdue list based on search and selected severity tab
  const filteredOverdue = useMemo(() => {
    return overdueList.filter((item) => {
      // Severity filter
      if (selectedSeverity !== "all" && item.severity.level !== selectedSeverity) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.invoice.customerName.toLowerCase().includes(q);
        const matchesNum = item.invoice.invoiceNumber.toLowerCase().includes(q);
        const matchesPhone = (item.invoice.customerPhone || "").includes(q);
        return matchesName || matchesNum || matchesPhone;
      }
      return true;
    });
  }, [overdueList, selectedSeverity, searchQuery]);

  // Handlers
  const handleOpenReminder = (item: { invoice: Invoice; days: number }) => {
    const text = generateOverdueWhatsAppMessage(item.invoice, settings, item.days);
    setReminderModal({
      isOpen: true,
      customerName: item.invoice.customerName,
      phone: item.invoice.customerPhone,
      text,
    });
  };

  const handleCopyText = (text: string, label = "رسالة التذكير") => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    showToast(`تم نسخ ${label} إلى الحافظة بنجاح!`);
  };

  const handleOpenWhatsApp = async (phone: string, text: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const encoded = encodeURIComponent(text);
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    const opened = await openExternalUrl(url);
    if (!opened) {
      showToast("تعذر فتح واتساب على هذا الجهاز. انسخ الرسالة وأرسلها يدوياً.");
    }
  };

  const handleStartEditDueDate = (inv: Invoice) => {
    setEditingInvoice(inv);
    setNewDueDate(inv.dueDate || getInvoiceDueDateString(inv));
  };

  const handleSaveNewDueDate = () => {
    if (!editingInvoice || !newDueDate || !onUpdateInvoice) return;
    const updated: Invoice = {
      ...editingInvoice,
      dueDate: newDueDate,
    };
    onUpdateInvoice(updated);
    setEditingInvoice(null);
    showToast(`تم تحديث تاريخ استحقاق الفاتورة ${updated.invoiceNumber} إلى ${newDueDate}`);
  };

  const handleSetPresetDueDate = (additionalDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + additionalDays);
    setNewDueDate(d.toISOString().split("T")[0]);
  };

  const handleNavigateToLedger = (customerId: string, invoiceId: string) => {
    if (onSelectInvoiceForLedger) {
      onSelectInvoiceForLedger(customerId, invoiceId);
    } else {
      setCurrentTab("ledger");
    }
  };

  // If no overdue invoices or dismissed, render unobtrusive banner or null
  if (totalOverdueCount === 0) {
    return null;
  }

  if (isDismissed) {
    return (
      <div className="bg-rose-50/70 border border-rose-200 text-rose-800 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs transition-all shadow-sm">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
          </span>
          <span className="font-semibold">
            تنبيه: يوجد {totalOverdueCount} فواتير متأخرة السداد بإجمالي{" "}
            {totalOverdueAmount.toLocaleString()} {settings.currency}
          </span>
        </div>
        <button
          onClick={() => setIsDismissed(false)}
          className="text-xs text-rose-700 hover:text-rose-900 font-bold underline cursor-pointer"
        >
          عرض التنبيهات المرئية التفصيلية
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border-2 border-rose-300/80 shadow-md overflow-hidden relative transition-all">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Alert Header Banner */}
      <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-red-800 text-white px-5 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left info badge & title */}
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl text-white shadow-inner flex items-center justify-center shrink-0">
              <span className="relative flex">
                <span className="animate-ping absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-300 opacity-90"></span>
                <BellRing className="w-6 h-6 text-white" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight flex items-center gap-2">
                  <span>تنبيه الاستحقاق المالي: فواتير متأخرة السداد</span>
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-300 text-rose-950 shadow-sm animate-pulse">
                  {totalOverdueCount} فواتير تجاوزت الموعد
                </span>
              </div>
              <p className="text-xs text-rose-100 mt-1 leading-relaxed">
                هناك فواتير مبيعات بذمة العملاء تجاوزت تاريخ الاستحقاق المحدد دون سداد كامل، تتطلب المتابعة والتحصيل الفوري.
              </p>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
            <div className="bg-black/25 backdrop-blur-sm px-3 py-1.5 rounded-lg text-right border border-white/15">
              <span className="text-[10px] text-rose-200 block font-medium">إجمالي المبالغ المتأخرة</span>
              <span className="font-mono font-black text-sm sm:text-base text-white">
                {totalOverdueAmount.toLocaleString()} {settings.currency}
              </span>
            </div>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title={isExpanded ? "طي قائمة الفواتير" : "عرض قائمة الفواتير"}
            >
              <span>{isExpanded ? "طي التفاصيل" : "استعراض الفواتير"}</span>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsDismissed(true)}
              className="p-1.5 text-rose-200 hover:text-white hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              title="إخفاء التنبيه مؤقتاً"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Interactive Body */}
      {isExpanded && (
        <div className="p-4 sm:p-5 bg-rose-50/20 space-y-4">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
            {/* Severity Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
              <span className="text-slate-400 text-xs font-medium ml-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> تصفية:
              </span>
              <button
                onClick={() => setSelectedSeverity("all")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  selectedSeverity === "all"
                    ? "bg-slate-800 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                الكل ({overdueList.length})
              </button>
              <button
                onClick={() => setSelectedSeverity("critical")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  selectedSeverity === "critical"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-rose-100/70 text-rose-800 hover:bg-rose-100"
                }`}
              >
                حرجة (+45 يوم)
              </button>
              <button
                onClick={() => setSelectedSeverity("high")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  selectedSeverity === "high"
                    ? "bg-red-600 text-white shadow-xs"
                    : "bg-red-100/70 text-red-800 hover:bg-red-100"
                }`}
              >
                مرتفعة (+30 يوم)
              </button>
              <button
                onClick={() => setSelectedSeverity("moderate")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  selectedSeverity === "moderate"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "bg-amber-100/70 text-amber-800 hover:bg-amber-100"
                }`}
              >
                متوسطة (+15 يوم)
              </button>
              <button
                onClick={() => setSelectedSeverity("recent")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  selectedSeverity === "recent"
                    ? "bg-yellow-600 text-white shadow-xs"
                    : "bg-yellow-100/70 text-yellow-800 hover:bg-yellow-100"
                }`}
              >
                حديثة (&lt;15 يوم)
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative min-w-[200px]">
              <input
                type="text"
                placeholder="بحث باسم الزبون، الفاتورة أو الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              <Clock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Overdue Items Grid / Cards */}
          {filteredOverdue.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-xl border border-slate-200 text-slate-400 text-xs">
              لا توجد فواتير متأخرة مطابقة لخيارات التصفية الحالية.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
              {filteredOverdue.map(({ invoice, days, severity, dueDate }) => (
                <div
                  key={invoice.id}
                  className="bg-white rounded-xl border border-rose-200/80 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 relative group"
                >
                  {/* Item Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm hover:text-blue-600 transition-colors">
                          {invoice.customerName}
                        </span>
                        {invoice.customerPhone && (
                          <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {invoice.customerPhone}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-600">
                          {invoice.invoiceNumber}
                        </span>
                        <span>•</span>
                        <span>تاريخ الإصدار: {invoice.date}</span>
                      </div>
                    </div>

                    {/* Delay badge */}
                    <span
                      className={`px-2 py-1 rounded-md text-[11px] font-bold border ${severity.badgeBg} ${severity.badgeText} ${severity.badgeBorder} whitespace-nowrap shadow-2xs flex items-center gap-1`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {severity.label}
                    </span>
                  </div>

                  {/* Item Balance & Due Date row */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2 px-3 bg-slate-50 rounded-lg text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">المبلغ المتبقي</span>
                      <span className="font-mono font-extrabold text-rose-600 text-sm">
                        {invoice.remainingAmount.toLocaleString()} {settings.currency}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block">إجمالي الفاتورة</span>
                      <span className="font-mono text-slate-700 text-xs font-semibold">
                        {invoice.grandTotal.toLocaleString()} {settings.currency}
                      </span>
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <span className="text-[10px] text-slate-400 block">تاريخ الاستحقاق</span>
                      <span className="font-mono text-slate-800 text-xs font-bold flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {dueDate}
                      </span>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => handleNavigateToLedger(invoice.customerId, invoice.id)}
                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>فتح في دفتر الحساب</span>
                      <ArrowLeft className="w-3 h-3" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      {/* Change Due Date button */}
                      <button
                        onClick={() => handleStartEditDueDate(invoice)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition-colors cursor-pointer"
                        title="تأجيل أو تعديل تاريخ الاستحقاق"
                      >
                        <CalendarDays className="w-3.5 h-3.5" />
                      </button>

                      {/* WhatsApp / Reminder Button */}
                      <button
                        onClick={() => handleOpenReminder({ invoice, days })}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>مطالبة بالواتساب</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Unified Reminder / Export Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-600 border-t border-slate-200">
            <span className="text-slate-500">
              💡 يمكنك تعديل مواعيد الاستحقاق لكل فاتورة عند إصدارها أو الضغط على أيقونة التقويم لتمديد الأجل.
            </span>
            <button
              onClick={() => {
                const summaryLines = overdueList.map(
                  (item, idx) =>
                    `${idx + 1}. ${item.invoice.customerName} - فاتورة ${item.invoice.invoiceNumber}: متبقي ${item.invoice.remainingAmount.toLocaleString()} ${settings.currency} (تأخير ${item.days} يوم)`
                );
                const fullText = `📋 كشف الفواتير المتأخرة السداد - ${settings.companyName || "محلات العاشق"}\nإجمالي المتأخرات: ${totalOverdueAmount.toLocaleString()} ${settings.currency}\nعدد الفواتير: ${totalOverdueCount}\n\n${summaryLines.join("\n")}`;
                handleCopyText(fullText, "تقرير الفواتير المتأخرة بالكامل");
              }}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>نسخ تقرير المطالبات الشامل للكل</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal: Edit Due Date */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-600" />
                تعديل تاريخ استحقاق الفاتورة
              </h3>
              <button
                onClick={() => setEditingInvoice(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                <p className="font-bold text-slate-800">{editingInvoice.customerName}</p>
                <p className="text-slate-500">
                  فاتورة رقم: <span className="font-mono font-semibold">{editingInvoice.invoiceNumber}</span> • المتبقي:{" "}
                  <span className="font-mono font-bold text-rose-600">
                    {editingInvoice.remainingAmount.toLocaleString()} {settings.currency}
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  تاريخ الاستحقاق الجديد:
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <span className="block text-slate-400 mb-1.5">تمديد سريع من اليوم:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetPresetDueDate(7)}
                    className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-semibold transition-colors text-[11px]"
                  >
                    +7 أيام
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresetDueDate(15)}
                    className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-semibold transition-colors text-[11px]"
                  >
                    +15 يوماً
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresetDueDate(30)}
                    className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-semibold transition-colors text-[11px]"
                  >
                    +30 يوماً
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveNewDueDate}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                حفظ الموعد الجديد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: WhatsApp & SMS Reminder */}
      {reminderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-scale-up border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                رسالة تذكير ومطالبة مالية لطيفة
              </h3>
              <button
                onClick={() => setReminderModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg">
                <span className="font-semibold text-slate-700">العميل: {reminderModal.customerName}</span>
                <span className="font-mono text-slate-500">{reminderModal.phone}</span>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  نص الرسالة المجهز (جاهز للإرسال الفوري):
                </label>
                <textarea
                  rows={9}
                  readOnly
                  value={reminderModal.text}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans leading-relaxed focus:outline-none select-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => handleCopyText(reminderModal.text)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ النص</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReminderModal(null)}
                  className="px-3 py-2 text-slate-500 hover:text-slate-700 text-xs"
                >
                  إغلاق
                </button>
                <button
                  onClick={() => handleOpenWhatsApp(reminderModal.phone, reminderModal.text)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>فتح في واتساب</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
