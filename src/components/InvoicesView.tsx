import React, { useState } from "react";
import {
  FileText,
  Search,
  Printer,
  Trash2,
  Calendar,
  User,
  DollarSign,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  AlertTriangle,
  Clock,
  Download,
  Loader2,
  Building,
  Phone,
  BookOpen,
  Copy,
  Check,
  Filter,
  RotateCcw
} from "lucide-react";
import { Invoice, SystemSettings } from "../types";
import { isInvoiceOverdue, getInvoiceOverdueDays } from "../utils/overdueUtils";
import { printElement, exportElementToPDF } from "../utils/printUtils";
import {
  calculateCumulativeSeparators,
  formatInvoiceAccountingText,
  getArabicDayName,
  getCurrentDateFormatted,
  getCurrentTimeFormatted,
} from "../utils/separatorUtils";

interface InvoicesViewProps {
  invoices: Invoice[];
  settings: SystemSettings;
  deleteInvoice: (id: string) => void;
  onSelectInvoiceForLedger: (customerId: string, invoiceId: string) => void;
}

export default function InvoicesView({
  invoices,
  settings,
  deleteInvoice,
  onSelectInvoiceForLedger,
}: InvoicesViewProps) {
  // Advanced Search & Filter States
  const [customerQuery, setCustomerQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"all" | "paid" | "remaining" | "overdue">("all");
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null);

  const handleCopyInvoiceAccountingText = (inv: Invoice) => {
    const text = formatInvoiceAccountingText(inv, {
      includeHeader: true,
      currency: settings.currency,
    });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedInvoiceId(inv.id);
      setTimeout(() => setCopiedInvoiceId(null), 2500);
    }
  };

  const handleDelete = (id: string, num: string) => {
    if (confirm(`هل أنت متأكد من حذف الفاتورة رقم "${num}"؟ سيعاد إرجاع كميات البضائع لمستودعك ويُلغى متبقي الدين.`)) {
      deleteInvoice(id);
      if (previewInvoiceId === id) setPreviewInvoiceId(null);
    }
  };

  const handleResetFilters = () => {
    setCustomerQuery("");
    setDateFilter("");
    setPaymentStatus("all");
  };

  const isFilteringActive = Boolean(customerQuery || dateFilter || paymentStatus !== "all");

  const filteredInvoices = invoices.filter((inv) => {
    // Search by customer name or invoice number
    const trimmedCustomer = customerQuery.trim().toLowerCase();
    const matchesCustomer =
      !trimmedCustomer ||
      inv.customerName.toLowerCase().includes(trimmedCustomer) ||
      inv.invoiceNumber.toLowerCase().includes(trimmedCustomer);

    // Search / filter by issue date (YYYY-MM-DD or partial date string)
    const matchesDate = !dateFilter || inv.date.includes(dateFilter);

    // Filter by payment status (مدفوعة / متبقية / متأخرة)
    const isPaid = (Number(inv.remainingAmount) || 0) === 0;
    const isRemaining = (Number(inv.remainingAmount) || 0) > 0;
    const overdue = isInvoiceOverdue(inv);

    const matchesStatus =
      paymentStatus === "all" ||
      (paymentStatus === "paid" && isPaid) ||
      (paymentStatus === "remaining" && isRemaining) ||
      (paymentStatus === "overdue" && overdue);

    return matchesCustomer && matchesDate && matchesStatus;
  });

  const previewInvoice = invoices.find((inv) => inv.id === previewInvoiceId);

  // Quick statistics based on filtered list
  const totalInvoicesSum = filteredInvoices.reduce((acc, inv) => acc + (Number(inv.grandTotal) || 0), 0);
  const totalPaidSum = filteredInvoices.reduce((acc, inv) => acc + (Number(inv.paidAmount) || 0), 0);
  const totalRemainingSum = filteredInvoices.reduce((acc, inv) => acc + (Number(inv.remainingAmount) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Description bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-100 shadow-sm no-print">
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            دفتر الفواتير والمبيعات الآجلة
          </h1>
          <p className="text-slate-500 text-xs">
            سجل موحد لجميع الفواتير والقيود الحسابية المسجلة لمراقبة المدفوعات والديون والتحكم بالطباعة.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4 no-print">
        {/* Advanced Search & Filtering Bar */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Search className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-800 text-xs">شريط البحث المتقدم للفواتير</span>
              <span className="text-[11px] text-slate-500 font-sans hidden sm:inline">
                (البحث باسم العميل أو تاريخ الإصدار أو حالة الدفع)
              </span>
            </div>
            {isFilteringActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-800 font-bold bg-white px-2.5 py-1 rounded-md border border-rose-200 shadow-2xs transition-colors cursor-pointer"
                title="إعادة ضبط وتفريغ كل حقول البحث"
              >
                <RotateCcw className="w-3 h-3" />
                <span>إعادة ضبط البحث</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* 1. Customer Name or Invoice Number */}
            <div className="md:col-span-5 space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">
                اسم العميل أو رقم الفاتورة
              </label>
              <div className="relative">
                <User className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="اكتب اسم العميل أو رقم الفاتورة..."
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-sans"
                />
                {customerQuery && (
                  <button
                    type="button"
                    onClick={() => setCustomerQuery("")}
                    className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 2. Issue Date */}
            <div className="md:col-span-4 space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">
                تاريخ الإصدار
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                  title="اختر تاريخ إصدار الفاتورة للبحث"
                />
                {dateFilter && (
                  <button
                    type="button"
                    onClick={() => setDateFilter("")}
                    className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="تفريغ التاريخ"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 3. Payment Status Filter */}
            <div className="md:col-span-3 space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">
                حالة الدفع
              </label>
              <div className="relative">
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as any)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">🧾 جميع الحالات</option>
                  <option value="paid">🟢 مدفوعة (مسددة بالكامل)</option>
                  <option value="remaining">🔴 متبقية (بذمتها دين)</option>
                  <option value="overdue">⚠️ متأخرة تجاوزت الاستحقاق</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quick Active Filter Badges and Match Counter */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-500 font-sans">
              <span className="font-bold text-slate-700">عدد النتائج:</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-mono font-bold">
                {filteredInvoices.length}
              </span>
              <span>من أصل {invoices.length} فاتورة</span>
            </div>

            {/* Quick Summary Cards for filtered selection */}
            {filteredInvoices.length > 0 && (
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-slate-600">
                  المجموع: <strong className="text-slate-900 font-bold">{totalInvoicesSum.toLocaleString()}</strong> {settings.currency}
                </span>
                <span className="text-emerald-700">
                  المدفوع: <strong className="font-bold">{totalPaidSum.toLocaleString()}</strong> {settings.currency}
                </span>
                <span className="text-rose-700">
                  المتبقي: <strong className="font-bold">{totalRemainingSum.toLocaleString()}</strong> {settings.currency}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Invoices List */}
        {filteredInvoices.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            لا توجد فواتير مطابقة لخيارات الفلترة الحالية.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                  <th className="p-3">رقم الفاتورة</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3 text-center">التاريخ / الاستحقاق</th>
                  <th className="p-3 text-left">المجموع الكلي</th>
                  <th className="p-3 text-left">المدفوع فوراً</th>
                  <th className="p-3 text-left">المتبقي المطلوب</th>
                  <th className="p-3 text-center">حالة السداد</th>
                  <th className="p-3 text-center">التحكم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredInvoices.map((inv) => {
                  const isPaid = inv.remainingAmount === 0;
                  const overdue = isInvoiceOverdue(inv);
                  const overdueDays = overdue ? getInvoiceOverdueDays(inv) : 0;
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="p-3 font-bold text-slate-700">
                        {inv.invoiceNumber}
                      </td>
                      <td className="p-3 font-sans font-bold text-slate-800 text-sm">
                        {inv.customerName}
                      </td>
                      <td className="p-3 text-center font-sans text-[11px]">
                        <span className="text-slate-500">{inv.date}</span>
                        {inv.dueDate && (
                          <div className={`text-[10px] font-bold ${overdue ? "text-rose-600" : "text-slate-400"}`}>
                            استحقاق: {inv.dueDate}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-left text-slate-900 font-bold">
                        {inv.grandTotal.toLocaleString()} {settings.currency}
                      </td>
                      <td className="p-3 text-left text-blue-600 font-bold">
                        {inv.paidAmount.toLocaleString()} {settings.currency}
                      </td>
                      <td className="p-3 text-left text-rose-600 font-bold">
                        {inv.remainingAmount.toLocaleString()} {settings.currency}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-sans inline-flex items-center gap-1 ${
                              isPaid
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : overdue
                                ? "bg-rose-100 text-rose-800 border border-rose-300 animate-pulse"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {isPaid ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" /> مسددة
                              </>
                            ) : overdue ? (
                              <>
                                <AlertTriangle className="w-3 h-3 text-rose-600" /> متأخرة ({overdueDays} يوم)
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3" /> غير مسددة
                              </>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setPreviewInvoiceId(inv.id)}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer font-sans transition-colors"
                            title="معاينة وطباعة وصل الفاتورة"
                          >
                            <Printer className="w-3.5 h-3.5" /> طباعة الوصل
                          </button>
                          <button
                            onClick={() => onSelectInvoiceForLedger(inv.customerId, inv.id)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer font-sans transition-colors"
                            title="فتح بالدفتر الورقي"
                          >
                            <Eye className="w-3.5 h-3.5" /> الدفتر
                          </button>
                          <button
                            onClick={() => handleDelete(inv.id, inv.invoiceNumber)}
                            className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                            title="حذف الفاتورة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Voucher Modal for Printing & PDF Export */}
      {previewInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header & Actions */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="font-extrabold text-slate-800 text-sm">
                  وصل فاتورة مبيعات: {previewInvoice.invoiceNumber}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectInvoiceForLedger(previewInvoice.customerId, previewInvoice.id);
                    setPreviewInvoiceId(null);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="فتح في دفتر وسجل الحسابات لتعديل المواد أو إضافة فواصل حسابية"
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>فتح في سجل الحساب</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyInvoiceAccountingText(previewInvoice)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    copiedInvoiceId === previewInvoice.id
                      ? "bg-emerald-600 text-white"
                      : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                  }`}
                  title="نسخ نص القائمة مع فواصل الحساب لمشاركتها"
                >
                  {copiedInvoiceId === previewInvoice.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>تم النسخ! 📋</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ نص القائمة</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsPrinting(true);
                    printElement("invoice-receipt-voucher", {
                      title: `وصل_فاتورة_${previewInvoice.invoiceNumber}_${previewInvoice.customerName}`,
                      onComplete: () => setIsPrinting(false),
                    });
                    setTimeout(() => setIsPrinting(false), 2000);
                  }}
                  disabled={isPrinting}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                  title="طباعة الوصل فوراً دون أي صفحات بيضاء"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {isPrinting ? "جاري التجهيز..." : "طباعة الوصل"}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setIsExportingPDF(true);
                    try {
                      await exportElementToPDF("invoice-receipt-voucher", {
                        filename: `وصل_فاتورة_${previewInvoice.invoiceNumber}_${previewInvoice.customerName}`,
                      });
                    } catch (err) {
                      console.error("PDF export error", err);
                      alert("حدث خطأ أثناء إنشاء PDF، يمكنك استخدام زر الطباعة المباشرة.");
                    } finally {
                      setIsExportingPDF(false);
                    }
                  }}
                  disabled={isExportingPDF}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                  title="حفظ الوصل كملف PDF"
                >
                  {isExportingPDF ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {isExportingPDF ? "جاري الإنشاء..." : "حفظ PDF"}
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewInvoiceId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Voucher Content */}
            <div className="p-6 max-h-[75vh] overflow-y-auto">
              <div
                id="invoice-receipt-voucher"
                className="print-container bg-white border-2 border-slate-300 rounded-xl p-6 text-slate-800 space-y-5 relative"
              >
                {/* Decorative side border */}
                <div className="absolute top-0 right-0 bottom-0 w-2.5 bg-blue-600" />

                {/* Voucher Header */}
                <div className="flex justify-between items-start pb-4 border-b border-dashed border-slate-200 mr-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-blue-600" />
                      <h2 className="text-base font-extrabold text-slate-900">
                        {settings.companyName}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      الهاتف: {settings.companyPhone || "غير مسجل"}
                    </p>
                  </div>

                  <div className="text-left font-mono text-xs space-y-1">
                    <p className="font-bold text-slate-900 bg-blue-50 text-blue-800 px-2.5 py-1 rounded">
                      وصل قائمة رقم: {previewInvoice.invoiceNumber}
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      التاريخ: {previewInvoice.date}
                    </p>
                    {previewInvoice.dueDate && (
                      <p className="text-slate-500 text-[11px]">
                        تاريخ الاستحقاق: {previewInvoice.dueDate}
                      </p>
                    )}
                  </div>
                </div>

                {/* Customer Information */}
                <div className="mr-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-slate-500 font-semibold ml-1">اسم العميل:</span>
                    <span className="font-extrabold text-slate-900">{previewInvoice.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold ml-1">حالة السداد:</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                        previewInvoice.remainingAmount === 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {previewInvoice.remainingAmount === 0 ? "مسددة بالكامل" : "آجلة / غير مسددة"}
                    </span>
                  </div>
                </div>

                {/* Items Table */}
                <div className="mr-2.5">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-300">
                        <th className="p-2 border border-slate-300 w-10 text-center">ت</th>
                        <th className="p-2 border border-slate-300">المادة / التفاصيل</th>
                        <th className="p-2 border border-slate-300 w-16 text-center">العدد</th>
                        <th className="p-2 border border-slate-300 w-24 text-center">السعر</th>
                        <th className="p-2 border border-slate-300 w-28 text-center">المجموع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const calculatedItems = calculateCumulativeSeparators(previewInvoice.items);
                        let regularIndex = 0;
                        return calculatedItems.map((item, idx) => {
                          if (item.isSeparator) {
                            const autoDate = item.paidDate || getCurrentDateFormatted();
                            const autoDay = item.paidDay || getArabicDayName(autoDate);
                            const autoTime = item.paidTime || getCurrentTimeFormatted();

                            return (
                              <React.Fragment key={item.id || `sep-${idx}`}>
                                {/* Divider line spanning entire width */}
                                <tr className="bg-[#faf8f4]/90 border-t border-slate-700">
                                  <td colSpan={5} className="p-0 border border-slate-300">
                                    <div className="w-full h-[1.5px] bg-slate-700/80"></div>
                                  </td>
                                </tr>

                                {/* 1. المجموع (Subtotal) */}
                                <tr className="bg-[#faf8f4]/90 border-b border-slate-300 font-bold select-text">
                                  <td className="p-2 border border-slate-300 text-center font-mono text-slate-400">-</td>
                                  <td className="p-2 border border-slate-300 font-bold text-slate-800 text-xs">المجموع</td>
                                  <td className="p-2 border border-slate-300 text-center font-mono text-slate-400">-</td>
                                  <td className="p-2 border border-slate-300 text-center font-mono text-slate-400">-</td>
                                  <td className="p-2 border border-slate-300 text-center font-mono font-bold text-slate-900 text-xs">
                                    {(item.subtotal || 0).toLocaleString()} {settings.currency}
                                  </td>
                                </tr>

                                {/* 2. الواصل (Paid Amount) */}
                                <tr className="bg-[#faf8f4]/90 border-b border-slate-300 font-bold select-text">
                                  <td className="p-2 border border-slate-300 text-center font-mono text-slate-400">-</td>
                                  <td className="p-2 border border-slate-300 text-xs">
                                    <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
                                      <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">
                                        الواصل
                                      </span>
                                      <span className="font-medium text-slate-700 whitespace-nowrap shrink-0 text-[11px]">
                                        ( يوم {autoDay} بتاريخ <span dir="ltr" className="font-mono">{autoDate}</span>{autoTime ? ` — الساعة ${autoTime}` : ""} )
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-2 border border-slate-300 text-center font-mono text-slate-400">-</td>
                                  <td className="p-2 border border-slate-300 text-center font-mono text-slate-400">-</td>
                                  <td className="p-2 border border-slate-300 text-center font-mono font-bold text-emerald-800 text-xs">
                                    {(Number(item.paidAmount) || 0).toLocaleString()} {settings.currency}
                                  </td>
                                </tr>

                                {/* Divider line spanning entire width */}
                                <tr className="bg-[#faf8f4]/90">
                                  <td colSpan={5} className="p-0 border border-slate-300">
                                    <div className="w-full h-[1.5px] bg-slate-700/80"></div>
                                  </td>
                                </tr>

                                {/* 3. المتبقي (Remaining) */}
                                <tr className="bg-black/5 border-b border-slate-700 font-black select-text">
                                  <td className="p-2 border border-slate-300 text-center font-mono text-slate-400 bg-black/5">-</td>
                                  <td className="p-2 border border-slate-300 text-xs font-black text-slate-950">
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
                                  <td className="p-2 border border-slate-300 text-center font-mono text-slate-400 bg-black/5">-</td>
                                  <td className="p-2 border border-slate-300 text-center font-mono text-slate-400 bg-black/5">-</td>
                                  <td className="p-2 border border-slate-300 text-center font-mono font-black text-slate-950 text-sm bg-black/5">
                                    {(item.remainingAmount || 0).toLocaleString()} {settings.currency}
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          }

                          regularIndex++;
                          return (
                            <tr key={item.id || `item-${idx}`} className="border-b border-slate-200">
                              <td className="p-2 border border-slate-200 text-center font-mono">{regularIndex}</td>
                              <td className="p-2 border border-slate-200 font-medium text-slate-800">{item.details}</td>
                              <td className="p-2 border border-slate-200 text-center font-mono font-bold">{item.quantity}</td>
                              <td className="p-2 border border-slate-200 text-center font-mono">
                                {item.unitPrice.toLocaleString()} {settings.currency}
                              </td>
                              <td className="p-2 border border-slate-200 text-center font-mono font-bold text-slate-900">
                                {item.total.toLocaleString()} {settings.currency}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Financial Summary */}
                <div className="mr-2.5 pt-2 border-t border-slate-200 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between items-center py-1">
                    <span className="font-sans font-semibold text-slate-600">المجموع الكلي:</span>
                    <span className="font-bold text-slate-900">
                      {previewInvoice.grandTotal.toLocaleString()} {settings.currency}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-t border-dotted border-slate-200">
                    <span className="font-sans font-semibold text-emerald-700">المبلغ الواصل (المسدد):</span>
                    <span className="font-bold text-emerald-700">
                      {previewInvoice.paidAmount.toLocaleString()} {settings.currency}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 bg-slate-50 px-2 rounded font-black border border-slate-200">
                    <span className="font-sans font-bold text-slate-800">المتبقي بذمة العميل:</span>
                    <span className={`text-sm ${previewInvoice.remainingAmount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {previewInvoice.remainingAmount.toLocaleString()} {settings.currency}
                    </span>
                  </div>
                </div>

                {/* Signatures */}
                <div className="mr-2.5 pt-6 border-t border-dashed border-slate-200 grid grid-cols-2 gap-6 text-[11px] text-slate-600 text-center">
                  <div>
                    <p className="font-semibold">توقيع البائع / المحاسب</p>
                    <p className="mt-8 border-t border-dotted border-slate-300 pt-1 font-bold text-slate-800">
                      {settings.signaturePlaceholder || "الإدارة"}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">توقيع المستلم (العميل)</p>
                    <p className="mt-8 border-t border-dotted border-slate-300 pt-1 font-bold text-slate-800">
                      {previewInvoice.customerName}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
