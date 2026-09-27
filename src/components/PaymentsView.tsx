import React, { useState } from "react";
import {
  DollarSign,
  Search,
  PlusCircle,
  Calendar,
  CreditCard,
  Printer,
  Trash2,
  X,
  FileCheck,
  Building,
  UserCheck,
  Download,
  Loader2
} from "lucide-react";
import { Customer, Payment, SystemSettings } from "../types";
import { printElement, exportElementToPDF } from "../utils/printUtils";

interface PaymentsViewProps {
  payments: Payment[];
  customers: Customer[];
  settings: SystemSettings;
  addPayment: (payment: Omit<Payment, "id" | "createdAt">) => Payment;
  deletePayment: (id: string) => void;
}

export default function PaymentsView({
  payments,
  customers,
  settings,
  addPayment,
  deletePayment,
}: PaymentsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string>("all");
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  // Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("نقدي");
  const [notes, setNotes] = useState("");

  // Print & PDF Export State
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || amount <= 0) {
      alert("الرجاء اختيار العميل وإدخال قيمة تسديد صالحة.");
      return;
    }

    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return;

    addPayment({
      customerId: cust.id,
      customerName: cust.name,
      amount: Number(amount),
      date,
      method,
      notes: notes.trim() || undefined,
    });

    setIsAddModalOpen(false);
    setCustomerId("");
    setAmount(0);
    setNotes("");
  };

  const handleDelete = (id: string, amountVal: number, cName: string) => {
    if (confirm(`هل أنت متأكد من حذف سند القبض بقيمة ${amountVal.toLocaleString()} ${settings.currency} للعميل "${cName}"؟ سيعاد احتساب الديون المستحقة.`)) {
      deletePayment(id);
      if (selectedReceiptId === id) setSelectedReceiptId(null);
    }
  };

  // Filter payments
  const filteredPayments = payments.filter((p) => {
    const matchesSearch = p.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMethod = selectedMethod === "all" || p.method === selectedMethod;
    return matchesSearch && matchesMethod;
  });

  const selectedReceipt = payments.find((p) => p.id === selectedReceiptId);

  return (
    <div className="space-y-6">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-100 shadow-sm no-print">
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            حركة الدفعات والتسديدات (المقبوضات)
          </h1>
          <p className="text-slate-500 text-xs">
            تسجيل وإدارة عمليات تسديد ديون العملاء وإصدار سندات قبض رسمية قابلة للطباعة.
          </p>
        </div>
        <button
          onClick={() => {
            setCustomerId("");
            setAmount(0);
            setNotes("");
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm cursor-pointer transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          تسجيل دفعة تسديد جديدة
        </button>
      </div>

      {/* Grid Layout for Split receipts & history */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Payments History List */}
        <div className={`lg:col-span-7 space-y-4 no-print`}>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative sm:col-span-2">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="ابحث باسم العميل..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-9 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <select
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                >
                  <option value="all">💳 جميع الطرق</option>
                  <option value="نقدي">💵 نقدي (كاش)</option>
                  <option value="تحويل بنكي">🏦 تحويل بنكي</option>
                  <option value="شيك">✍️ شيك</option>
                  <option value="مدى">💳 بطاقة مدى / الكتروني</option>
                </select>
              </div>
            </div>

            {filteredPayments.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                لم يتم العثور على أي دفعات مسجلة.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
                {filteredPayments.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedReceiptId(p.id)}
                    className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 cursor-pointer ${
                      selectedReceiptId === p.id
                        ? "bg-slate-900 text-white border-slate-900 shadow-md"
                        : "bg-slate-50 hover:bg-slate-100/60 text-slate-700 border-slate-100 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${selectedReceiptId === p.id ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"}`}>
                        <DollarSign className="w-4 h-4" />
                      </div>
                      <div>
                        <p className={`text-xs font-bold ${selectedReceiptId === p.id ? "text-white" : "text-slate-800"}`}>
                          {p.customerName}
                        </p>
                        <p className="text-[10px] opacity-70 mt-1 font-mono">
                          {p.date} • {p.method}
                        </p>
                      </div>
                    </div>

                    <div className="text-left font-mono shrink-0 flex items-center gap-3">
                      <div>
                        <p className={`text-sm font-extrabold ${selectedReceiptId === p.id ? "text-blue-400" : "text-blue-600"}`}>
                          +{p.amount.toLocaleString()} {settings.currency}
                        </p>
                        {p.notes && (
                          <p className="text-[9px] opacity-75 max-w-[150px] truncate font-sans">
                            {p.notes}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id, p.amount, p.customerName);
                        }}
                        className={`p-1.5 rounded hover:bg-rose-500/10 hover:text-rose-400 ${selectedReceiptId === p.id ? "text-slate-400" : "text-slate-400 hover:text-rose-600"}`}
                        title="حذف السند"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Payment Receipt Voucher Display (Right Side) */}
        <div className="lg:col-span-5">
          {!selectedReceiptId ? (
            <div className="bg-white rounded-xl border border-slate-100 p-12 text-center text-slate-400 text-xs shadow-sm h-[300px] flex flex-col items-center justify-center gap-3 no-print">
              <FileCheck className="w-10 h-10 text-slate-200" />
              <span>اختر دفعة أو سند قبض مالي من القائمة لإظهار نموذج السند الرسمي وإمكانية طباعته الفورية.</span>
            </div>
          ) : (
            selectedReceipt && (
              <div className="space-y-4">
                {/* Printing and Export actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 no-print bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-1.5 text-slate-700 text-xs font-bold">
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    <span>وصل سند قبض مالي</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPrinting(true);
                        printElement("receipt-voucher", {
                          title: `سند_قبض_${selectedReceipt.customerName}_${selectedReceipt.id.slice(-6)}`,
                          onComplete: () => setIsPrinting(false),
                        });
                        setTimeout(() => setIsPrinting(false), 2000);
                      }}
                      disabled={isPrinting}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      title="طباعة الوصل مباشرة دون صفحات فارغة"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {isPrinting ? "جاري التجهيز..." : "طباعة الوصل"}
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        setIsExportingPDF(true);
                        try {
                          await exportElementToPDF("receipt-voucher", {
                            filename: `سند_قبض_${selectedReceipt.customerName}_${selectedReceipt.id.slice(-6)}`,
                          });
                        } catch (err) {
                          console.error("PDF export error", err);
                          alert("حدث خطأ أثناء إنشاء ملف PDF، يمكنك استخدام زر الطباعة المباشرة.");
                        } finally {
                          setIsExportingPDF(false);
                        }
                      }}
                      disabled={isExportingPDF}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      title="حفظ الوصل كملف PDF على جهازك"
                    >
                      {isExportingPDF ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      {isExportingPDF ? "جاري الإنشاء..." : "حفظ كـ PDF"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedReceiptId(null)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>

                {/* Receipt Voucher Card */}
                <div
                  id="receipt-voucher"
                  className="print-container bg-white border-2 border-slate-300 rounded-xl shadow-lg p-6 text-slate-800 space-y-5 relative"
                  style={{
                    backgroundImage: "linear-gradient(rgba(16, 185, 129, 0.03) 1px, transparent 1px)",
                    backgroundSize: "100% 24px",
                  }}
                >
                  {/* Decorative design border */}
                  <div className="absolute top-0 right-0 bottom-0 w-2.5 bg-blue-600" />

                  {/* Voucher Header */}
                  <div className="flex justify-between items-start pb-4 border-b border-dashed border-slate-200 mr-2.5">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Building className="w-4 h-4 text-blue-600" />
                        <h2 className="text-sm font-extrabold text-slate-900">
                          {settings.companyName}
                        </h2>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono">
                        تلفون: {settings.companyPhone || "غير مسجل"}
                      </p>
                    </div>

                    <div className="text-left font-mono text-[10px] space-y-0.5">
                      <p className="font-bold text-slate-900 bg-blue-50 text-blue-800 px-2 py-0.5 rounded">
                        سند قبض مالي رقم: {selectedReceipt.id.slice(-8).toUpperCase()}
                      </p>
                      <p className="text-slate-500">
                        التاريخ: {selectedReceipt.date}
                      </p>
                    </div>
                  </div>

                  {/* Receipt Body */}
                  <div className="mr-2.5 space-y-4 text-xs font-sans">
                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
                      <span className="font-sans font-semibold text-slate-500">المبلغ المستلم:</span>
                      <span className="text-lg font-black text-blue-600">
                        {selectedReceipt.amount.toLocaleString()} {settings.currency}
                      </span>
                    </div>

                    <div className="space-y-2.5 leading-relaxed">
                      <p className="flex items-baseline gap-2 border-b border-dotted border-slate-300 pb-1">
                        <span className="text-slate-400 font-semibold shrink-0">استلمنا من السيد/ة:</span>
                        <span className="font-extrabold text-slate-800">{selectedReceipt.customerName}</span>
                      </p>

                      <p className="flex items-baseline gap-2 border-b border-dotted border-slate-300 pb-1">
                        <span className="text-slate-400 font-semibold shrink-0">مبلغ وقدره:</span>
                        <span className="font-bold text-slate-700">
                          {selectedReceipt.amount.toLocaleString()} {settings.currency} فقط لا غير.
                        </span>
                      </p>

                      <p className="flex items-baseline gap-2 border-b border-dotted border-slate-300 pb-1">
                        <span className="text-slate-400 font-semibold shrink-0">وذلك عن لقاء:</span>
                        <span className="font-medium text-slate-600">
                          {selectedReceipt.notes || "تسديد مبالغ ودفعات من الحساب الدفتري لأجل"}
                        </span>
                      </p>

                      <p className="flex items-baseline gap-2">
                        <span className="text-slate-400 font-semibold shrink-0">طريقة القبض:</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-bold font-mono">
                          {selectedReceipt.method}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Receipt Signatures */}
                  <div className="mr-2.5 pt-6 border-t border-dashed border-slate-200 grid grid-cols-2 gap-4 text-[11px] text-slate-600 text-center">
                    <div>
                      <p className="font-semibold flex items-center justify-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                        المستلم المسؤول
                      </p>
                      <p className="mt-8 border-t border-dotted border-slate-300 pt-1 font-bold text-slate-800">
                        {settings.signaturePlaceholder || "أمين الخزينة"}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">المسدد (العميل)</p>
                      <p className="mt-8 border-t border-dotted border-slate-300 pt-1 font-bold text-slate-800">
                        {selectedReceipt.customerName.split(" ")[0]}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

      </div>

      {/* MODAL: ADD PAYMENT */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-blue-600" />
                تسجيل سند قبض وتسديد جديد
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">اختر العميل *</label>
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                >
                  <option value="">-- يرجى الاختيار من قائمة العملاء --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">مبلغ التسديد ({settings.currency}) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="أدخل القيمة"
                    value={amount || ""}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">طريقة السداد *</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                  >
                    <option value="نقدي">💵 نقدي (كاش)</option>
                    <option value="تحويل بنكي">🏦 تحويل بنكي</option>
                    <option value="شيك">✍️ شيك</option>
                    <option value="مدى">💳 بطاقة مدى / الكتروني</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">تاريخ العملية *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-center focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">ملاحظات / تبيين السند (اختياري)</label>
                <input
                  type="text"
                  placeholder="مثال: دفعة تحت الحساب لتسديد فاتورة رقم 1"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  تثبيت سند القبض
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
