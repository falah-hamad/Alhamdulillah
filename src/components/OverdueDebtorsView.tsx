import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  Search,
  BookOpen,
  DollarSign,
  Phone,
  MessageSquare,
  ArrowUpRight,
  TrendingDown,
  CheckCircle2,
  FolderTree,
  Filter,
  Users,
  Copy,
  Check
} from "lucide-react";
import { Customer, Invoice, Payment, SystemSettings, Folder } from "../types";
import { openExternalUrl } from "../lib/native";

interface OverdueDebtorsViewProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
  folders?: Folder[];
  onSelectCustomerForLedger: (customerId: string) => void;
  setCurrentTab: (tab: string) => void;
}

export default function OverdueDebtorsView({
  customers,
  invoices,
  payments,
  settings,
  folders = [],
  onSelectCustomerForLedger,
  setCurrentTab,
}: OverdueDebtorsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolderFilter, setSelectedFolderFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"remaining-desc" | "remaining-asc" | "name">("remaining-desc");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Single Source of Truth: Active only, calculate metrics per customer
  const debtors = useMemo(() => {
    return customers
      .filter((c) => !c.isDeleted)
      .map((customer) => {
        const custInvoices = invoices.filter((inv) => inv.customerId === customer.id && !inv.isDeleted);
        const custPayments = payments.filter((p) => p.customerId === customer.id && !p.isDeleted);

        const totalDebts = custInvoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0);
        const totalPaid =
          custPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) +
          custInvoices.reduce((sum, inv) => sum + (Number(inv.paidAmount) || 0), 0);

        const totalRemaining = Math.max(0, totalDebts - totalPaid);
        const folder = folders.find((f) => f.id === customer.folderId);

        // Sort invoices by date desc
        const sortedInvs = [...custInvoices].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const latestInvoiceDate = sortedInvs[0]?.date || customer.createdAt?.split("T")[0] || "";

        return {
          customer,
          folderName: folder ? folder.name : "غير مصنف",
          totalDebts,
          totalPaid,
          totalRemaining,
          invoicesCount: custInvoices.length,
          latestInvoiceDate,
        };
      })
      // CRITICAL RULE: ONLY customers with Remaining > 0
      .filter((d) => d.totalRemaining > 0);
  }, [customers, invoices, payments, folders]);

  // Filter and sort debtors
  const filteredDebtors = useMemo(() => {
    return debtors
      .filter((d) => {
        const matchesSearch =
          d.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.customer.phone.includes(searchQuery) ||
          (d.customer.address && d.customer.address.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        if (selectedFolderFilter === "all") return true;
        if (selectedFolderFilter === "uncategorized") return !d.customer.folderId;
        return d.customer.folderId === selectedFolderFilter;
      })
      .sort((a, b) => {
        if (sortBy === "remaining-desc") return b.totalRemaining - a.totalRemaining;
        if (sortBy === "remaining-asc") return a.totalRemaining - b.totalRemaining;
        if (sortBy === "name") return a.customer.name.localeCompare(b.customer.name, "ar");
        return 0;
      });
  }, [debtors, searchQuery, selectedFolderFilter, sortBy]);

  // Aggregate totals
  const totalDebtorsCount = debtors.length;
  const totalRemainingSum = useMemo(() => {
    return debtors.reduce((sum, d) => sum + d.totalRemaining, 0);
  }, [debtors]);

  const totalDebtsSum = useMemo(() => {
    return debtors.reduce((sum, d) => sum + d.totalDebts, 0);
  }, [debtors]);

  const totalPaidSum = useMemo(() => {
    return debtors.reduce((sum, d) => sum + d.totalPaid, 0);
  }, [debtors]);

  const handleCopyReminder = (debtor: typeof debtors[0]) => {
    const text = `السلام عليكم ورحمة الله وبركاته،
الأخ الفاضل / ${debtor.customer.name} المحترم 🌹

نود تذكيركم بلطف بتفاصيل الحساب المسجل لدينا:
• إجمالي المشتريات والديون: ${debtor.totalDebts.toLocaleString()} ${settings.currency}
• إجمالي المسدد (الواصل): ${debtor.totalPaid.toLocaleString()} ${settings.currency}
• المبلغ المتبقي المستحق للسداد: ${debtor.totalRemaining.toLocaleString()} ${settings.currency}

نرجو التكرم بالتواصل معنا لترتيب سداد المبلغ المتبقي.
شاكرين لكم حسن تعاونكم الدائم.
${settings.companyName || "محلات العاشق"} - ${settings.companyPhone || ""}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(debtor.customer.id);
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  const handleWhatsAppShare = async (debtor: typeof debtors[0]) => {
    const text = `السلام عليكم ورحمة الله وبركاته،
الأخ الفاضل / ${debtor.customer.name} المحترم 🌹

نود تذكيركم بلطف بتفاصيل الحساب المسجل لدينا:
• إجمالي المشتريات والديون: ${debtor.totalDebts.toLocaleString()} ${settings.currency}
• إجمالي المسدد (الواصل): ${debtor.totalPaid.toLocaleString()} ${settings.currency}
• المبلغ المتبقي المستحق للسداد: ${debtor.totalRemaining.toLocaleString()} ${settings.currency}

نرجو التكرم بالسداد في أقرب وقت شاكرين لكم طيب تعاونكم.
${settings.companyName || "محلات العاشق"}`;

    const cleanPhone = debtor.customer.phone.replace(/[^0-9]/g, "");
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    const opened = await openExternalUrl(url);
    if (!opened) {
      showToast("تعذر فتح واتساب على هذا الجهاز. انسخ الرسالة وأرسلها يدوياً.");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2.5">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <span>قسم الزبائن المتأخرين عن السداد</span>
            </h1>
            <p className="text-xs text-slate-500">
              قائمة فورية ومترابطة تعرض حصرياً الزبائن الذين لديهم رصيد متبقي (Remaining &gt; 0) استناداً إلى سجل الديون.
            </p>
          </div>

          <button
            onClick={() => setCurrentTab("ledger")}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>الانتقال لسجل الديون</span>
          </button>
        </div>

        {/* Aggregated KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5">
          <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-4">
            <p className="text-xs font-semibold text-rose-700">إجمالي المبالغ المتبقية المطلوبة</p>
            <p className="text-xl font-bold text-rose-900 mt-1 font-mono">
              {totalRemainingSum.toLocaleString()} <span className="text-xs font-sans font-normal">{settings.currency}</span>
            </p>
            <p className="text-[11px] text-rose-600 mt-1">
              مجموع متبقي الديون غير المسددة لـ {totalDebtorsCount} زبون
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-600">إجمالي ديون المتأخرين</p>
            <p className="text-xl font-bold text-slate-800 mt-1 font-mono">
              {totalDebtsSum.toLocaleString()} <span className="text-xs font-sans font-normal">{settings.currency}</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              إجمالي فواتير ومشتريات هؤلاء الزبائن
            </p>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4">
            <p className="text-xs font-semibold text-emerald-700">إجمالي المسدد (الواصل)</p>
            <p className="text-xl font-bold text-emerald-900 mt-1 font-mono">
              {totalPaidSum.toLocaleString()} <span className="text-xs font-sans font-normal">{settings.currency}</span>
            </p>
            <p className="text-[11px] text-emerald-600 mt-1">
              نسبة التحصيل: {totalDebtsSum > 0 ? Math.round((totalPaidSum / totalDebtsSum) * 100) : 0}%
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="البحث باسم الزبون، رقم الهاتف أو العنوان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {folders.length > 0 && (
            <select
              value={selectedFolderFilter}
              onChange={(e) => setSelectedFolderFilter(e.target.value)}
              aria-label="تصفية حسب الحافظة"
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            >
              <option value="all">كافة الحافظات</option>
              <option value="uncategorized">غير مصنف</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="ترتيب النتائج"
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
          >
            <option value="remaining-desc">المتبقي: من الأعلى للأقل</option>
            <option value="remaining-asc">المتبقي: من الأقل للأعلى</option>
            <option value="name">ترتيب أبجدي بالاسم</option>
          </select>
        </div>
      </div>

      {/* Debtors List Cards */}
      {filteredDebtors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            {searchQuery ? "لا توجد نتائج مطابقة لبحثك" : "لا يوجد أي زبائن متأخرين حالياً"}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery
              ? "جرّب تغيير كلمات البحث أو إلغاء تصفية الحافظات."
              : "جميع الحسابات مسددة بالكامل (المتبقي = 0) أو لا توجد ديون مستحقة مسجلة على الزبائن النشطين."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDebtors.map((d) => (
            <div
              key={d.customer.id}
              className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-sm transition-all p-5 flex flex-col justify-between space-y-4"
            >
              {/* Card Header */}
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 line-clamp-1">
                      {d.customer.name}
                    </h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5" dir="ltr">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{d.customer.phone}</span>
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    <FolderTree className="w-3 h-3 text-slate-500" />
                    <span>{d.folderName}</span>
                  </span>
                </div>

                {d.customer.address && (
                  <p className="text-[11px] text-slate-400 truncate">
                    📍 {d.customer.address}
                  </p>
                )}
              </div>

              {/* Financial Metric Row (المجموع، الواصل، المتبقي) */}
              <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">المجموع الكلي:</span>
                  <span className="font-semibold text-slate-700 font-mono">
                    {d.totalDebts.toLocaleString()} {settings.currency}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">الواصل (المسدد):</span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    {d.totalPaid.toLocaleString()} {settings.currency}
                  </span>
                </div>
                <div className="border-t border-slate-200/60 pt-1.5 flex items-center justify-between text-xs">
                  <span className="font-bold text-rose-700">المتبقي المستحق:</span>
                  <span className="font-bold text-rose-700 text-sm font-mono">
                    {d.totalRemaining.toLocaleString()} {settings.currency}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => onSelectCustomerForLedger(d.customer.id)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>فتح الحساب في سجل الديون</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleWhatsAppShare(d)}
                    className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border border-emerald-200"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>واتساب</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyReminder(d)}
                    className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    {copiedId === d.customer.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>نسخ مطالبة</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
