import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Download,
  FileCheck,
  Lightbulb,
  Loader2,
  Printer,
  ReceiptText,
  Search,
  UserRound,
  Wallet,
} from "lucide-react";
import { Customer, CustomerFolder, Invoice, Payment, SystemSettings } from "../types";
import { getCustomerLedgerTotals } from "../lib/debtLedgerSources";
import { exportElementToPDF, printElement } from "../utils/printUtils";
import { formatThousands } from "../utils/numberFormatting";
import { FilterButton, FilterPanel } from "./FilterPanel";
import FormattedNumberInput from "./FormattedNumberInput";

interface PaymentsViewProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  folders: CustomerFolder[];
  settings: SystemSettings;
  onOpenLedger: () => void;
}

type PaymentBalance = { before: number; remaining: number };
type BalanceEvent = {
  kind: "debt" | "payment";
  accountKey: string;
  amount: number;
  date: number;
  order: number;
  paymentId?: string;
};

function safeAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function dateValue(value?: string) {
  if (!value) return 0;
  const ymd = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T ])/);
  if (ymd) {
    const localDate = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    const time = value.match(/[T ](\d{1,2}):(\d{2})/);
    if (time) localDate.setHours(Number(time[1]), Number(time[2]), 0, 0);
    return localDate.getTime();
  }
  const dmy = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])).getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatArabicDate(value?: string) {
  if (!value) return "غير محدد";
  const timestamp = dateValue(value);
  if (!timestamp) return value;
  return new Intl.DateTimeFormat("ar-IQ", {
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(timestamp));
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatArabicTimestamp(value?: string) {
  if (!value) return "غير محدد";
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value.trim())) return formatArabicDate(value);
  const timestamp = dateValue(value);
  if (!timestamp) return value;
  return new Intl.DateTimeFormat("ar-IQ", {
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function paymentOrdinal(index: number) {
  const names = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
  return names[index] || `رقم ${index + 1}`;
}

/** Rebuild each account balance from the same debt ledger events used by the app. */
function buildPaymentBalances(customers: Customer[], invoices: Invoice[], payments: Payment[]) {
  const events: BalanceEvent[] = [];
  let order = 0;

  for (const invoice of invoices) {
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    for (const item of items) {
      if (item.isSeparator || item.isPaymentRow || item.isRemainingRow) continue;
      const amount = safeAmount(item.total || item.unitPrice);
      if (!amount) continue;
      events.push({
        kind: "debt",
        accountKey: `invoice:${invoice.id}`,
        amount,
        date: dateValue(item.createdAt || invoice.date || invoice.createdAt),
        order: order++,
      });
    }
  }

  for (const customer of customers) {
    const rows = Array.isArray(customer.accountingSheetRows) ? customer.accountingSheetRows : [];
    for (const row of rows) {
      if (row.isSeparator) continue;
      const amount = safeAmount(row.total || row.unitPrice);
      if (!amount) continue;
      events.push({
        kind: "debt",
        accountKey: `sheet:${customer.id}`,
        amount,
        date: dateValue(row.createdAt || customer.accountingSheetDate || customer.createdAt),
        order: order++,
      });
    }
  }

  for (const payment of payments) {
    events.push({
      kind: "payment",
      accountKey: payment.invoiceId ? `invoice:${payment.invoiceId}` : `sheet:${payment.customerId}`,
      amount: safeAmount(payment.amount),
      date: dateValue(payment.date || payment.createdAt),
      order: order++,
      paymentId: payment.id,
    });
  }

  events.sort((left, right) => left.date - right.date
    || (left.kind === right.kind ? left.order - right.order : left.kind === "debt" ? -1 : 1));

  const balances = new Map<string, number>();
  const snapshots = new Map<string, PaymentBalance>();
  for (const event of events) {
    const accountBalance = balances.get(event.accountKey) || 0;
    if (event.kind === "debt") {
      balances.set(event.accountKey, accountBalance + event.amount);
      continue;
    }
    const before = Array.from(balances.values()).reduce((sum, value) => sum + value, 0);
    balances.set(event.accountKey, Math.max(0, accountBalance - event.amount));
    const remaining = Array.from(balances.values()).reduce((sum, value) => sum + value, 0);
    if (event.paymentId) snapshots.set(event.paymentId, { before, remaining });
  }
  return snapshots;
}

function ReceiptBrand({ settings }: { settings: SystemSettings }) {
  return (
    <div className="flex items-center justify-center gap-4 border-b-2 border-[#b49a65] pb-4">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-[3px] border-slate-800 bg-white text-[#b49a65]">
        {settings.logoUrl ? (
          <img src={settings.logoUrl} alt="شعار المحل" className="h-full w-full object-contain" />
        ) : (
          <Lightbulb className="h-10 w-10" strokeWidth={1.8} />
        )}
      </div>
      <div className="text-center">
        <h2 className="text-xl font-black text-slate-900">{settings.companyName || "اسم المحل"}</h2>
        <p className="mt-1 text-sm font-bold text-[#a88c54]">{settings.companyDescription || "تجارة وتجهيز المواد الكهربائية ومستلزماتها"}</p>
        <p className="mt-1 text-xs text-slate-600">
          {[settings.companyAddress, settings.companyPhone].filter(Boolean).join(" — ") || ""}
        </p>
      </div>
    </div>
  );
}

function ReceiptActions({
  elementId,
  fileName,
}: {
  elementId: string;
  fileName: string;
}) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setIsPrinting(true);
          printElement(elementId, { title: fileName, onComplete: () => setIsPrinting(false) });
          window.setTimeout(() => setIsPrinting(false), 2000);
        }}
        disabled={isPrinting}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        <Printer className="h-4 w-4" />{isPrinting ? "جاري التجهيز" : "طباعة"}
      </button>
      <button
        type="button"
        onClick={async () => {
          setIsExporting(true);
          try {
            await exportElementToPDF(elementId, { filename: fileName });
          } catch (error) {
            console.error("Receipt PDF export failed", error);
            alert("تعذر إنشاء ملف PDF.");
          } finally {
            setIsExporting(false);
          }
        }}
        disabled={isExporting}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {isExporting ? "جاري الإنشاء" : "تنزيل PDF"}
      </button>
    </div>
  );
}

function ReceiptShell({ children, settings, title }: { children: React.ReactNode; settings: SystemSettings; title: string }) {
  return (
    <div className="print-container rounded-2xl border-[5px] border-double border-slate-800 bg-white p-5 text-slate-900 shadow-sm sm:p-7" dir="rtl">
      <ReceiptBrand settings={settings} />
      <div className="py-4 text-center">
        <h3 className="text-2xl font-black text-slate-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function PaymentsView({ customers, invoices, payments, folders, settings, onOpenLedger }: PaymentsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minimumAmount, setMinimumAmount] = useState("");
  const [maximumAmount, setMaximumAmount] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [showCombinedStatement, setShowCombinedStatement] = useState(false);

  const paymentDateKey = (payment: Payment) => {
    const timestamp = dateValue(payment.date || payment.createdAt);
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const paymentMatchesFilters = (payment: Payment) => {
    const date = paymentDateKey(payment);
    const min = Number(minimumAmount.replace(/,/g, "")) || 0;
    const max = Number(maximumAmount.replace(/,/g, "")) || 0;
    return (selectedMethod === "all" || payment.method === selectedMethod)
      && (!dateFrom || (date && date >= dateFrom))
      && (!dateTo || (date && date <= dateTo))
      && (!minimumAmount || safeAmount(payment.amount) >= min)
      && (!maximumAmount || safeAmount(payment.amount) <= max);
  };
  const activeFilterCount = [selectedMethod !== "all", Boolean(dateFrom), Boolean(dateTo), Boolean(minimumAmount), Boolean(maximumAmount)].filter(Boolean).length;

  const paymentsByCustomer = useMemo(() => {
    const grouped = new Map<string, Payment[]>();
    for (const payment of payments) {
      const current = grouped.get(payment.customerId) || [];
      current.push(payment);
      grouped.set(payment.customerId, current);
    }
    for (const customerPayments of grouped.values()) {
      customerPayments.sort((left, right) => dateValue(left.date || left.createdAt) - dateValue(right.date || right.createdAt)
        || left.id.localeCompare(right.id));
    }
    return grouped;
  }, [payments]);

  const balanceSnapshots = useMemo(
    () => buildPaymentBalances(customers, invoices, payments),
    [customers, invoices, payments]
  );

  const folderById = useMemo(() => new Map(folders.map(folder => [folder.id, folder.name])), [folders]);
  const customerRows = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return customers
      .map(customer => {
        const customerPayments = (paymentsByCustomer.get(customer.id) || []).filter(paymentMatchesFilters);
        const totals = getCustomerLedgerTotals(customer, invoices);
        return {
          customer,
          customerPayments,
          totals,
          paid: customerPayments.reduce((sum, payment) => sum + safeAmount(payment.amount), 0),
          lastPayment: customerPayments[customerPayments.length - 1],
        };
      })
      .filter(row => showAllCustomers || row.customerPayments.length > 0)
      .filter(row => selectedFolderId === "all" || row.customer.folderId === selectedFolderId)
      .filter(row => !query || [row.customer.name, row.customer.phone || "", row.customer.address || "", folderById.get(row.customer.folderId || "") || "", ...row.customerPayments.flatMap(payment => [payment.notes || "", payment.method || ""])]
        .some(value => value.toLocaleLowerCase().includes(query)))
      .sort((left, right) => dateValue(right.lastPayment?.date || right.lastPayment?.createdAt)
        - dateValue(left.lastPayment?.date || left.lastPayment?.createdAt)
        || left.customer.name.localeCompare(right.customer.name, "ar"));
  }, [customers, invoices, paymentsByCustomer, searchQuery, selectedFolderId, showAllCustomers, folderById, selectedMethod, dateFrom, dateTo, minimumAmount, maximumAmount]);

  const selectedCustomer = customers.find(customer => customer.id === selectedCustomerId) || null;
  const selectedCustomerPayments = selectedCustomer ? (paymentsByCustomer.get(selectedCustomer.id) || []) : [];
  const selectedPayments = selectedCustomerPayments.filter(paymentMatchesFilters);
  const selectedTotals = selectedCustomer ? getCustomerLedgerTotals(selectedCustomer, invoices) : null;
  const selectedPaidTotal = selectedPayments.reduce((sum, payment) => sum + safeAmount(payment.amount), 0);
  const selectedAllPaidTotal = selectedCustomerPayments.reduce((sum, payment) => sum + safeAmount(payment.amount), 0);
  const selectedPayment = selectedPayments.find(payment => payment.id === selectedPaymentId) || null;
  const selectedPaymentIndex = selectedPayment ? selectedCustomerPayments.findIndex(payment => payment.id === selectedPayment.id) : -1;
  const selectedSnapshot = selectedPayment ? balanceSnapshots.get(selectedPayment.id) : undefined;
  const selectedBalanceAfter = selectedSnapshot?.remaining ?? selectedTotals?.remaining ?? 0;
  const selectedBalanceBefore = selectedSnapshot?.before ?? (selectedBalanceAfter + safeAmount(selectedPayment?.amount));
  const activeFolders = folders.filter(folder => !folder.isDeleted);
  const customersWithPayments = customers.filter(customer => (paymentsByCustomer.get(customer.id) || []).length > 0).length;
  const totalReceived = payments.reduce((sum, payment) => sum + safeAmount(payment.amount), 0);

  const openCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setSelectedPaymentId(null);
    setShowCombinedStatement(false);
  };

  const renderIndividualReceipt = () => {
    if (!selectedCustomer || !selectedPayment) return null;
    const ordinal = selectedPaymentIndex + 1;
    const receiptCode = selectedPayment.id.slice(-8).toUpperCase();
    return (
      <div className="space-y-3">
        <div className="no-print flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
            <ReceiptText className="h-5 w-5 text-[#a88c54]" /> وصل التسديد {paymentOrdinal(selectedPaymentIndex)}
          </div>
          <ReceiptActions elementId="customer-payment-receipt" fileName={`وصل_تسديد_${selectedCustomer.name}_${receiptCode}`} />
        </div>
        <div id="customer-payment-receipt">
          <ReceiptShell settings={settings} title="وصل تسديد">
            <div className="mb-4 grid grid-cols-1 gap-2 border border-slate-300 sm:grid-cols-3">
              <div className="p-3"><span className="text-xs text-slate-500">اسم العميل</span><p className="mt-1 font-extrabold">{selectedCustomer.name}</p></div>
              <div className="border-t border-slate-300 p-3 sm:border-r sm:border-t-0"><span className="text-xs text-slate-500">عنوان السكن</span><p className="mt-1 font-bold">{selectedCustomer.address || "غير مسجل"}</p></div>
              <div className="border-t border-slate-300 p-3 sm:border-r sm:border-t-0"><span className="text-xs text-slate-500">رقم الهاتف</span><p className="mt-1 font-bold" dir="ltr">{selectedCustomer.phone || "غير مسجل"}</p></div>
            </div>
            <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm font-semibold">
              <span>رقم الوصل: <b dir="ltr">{receiptCode}</b></span>
              <span>الطابع الزمني: <b>{formatArabicTimestamp(selectedPayment.date || selectedPayment.createdAt)}</b></span>
            </div>
            <table className="w-full border-collapse border border-slate-400 text-sm">
              <thead><tr className="bg-slate-800 text-[#d8c18e]"><th className="border border-slate-400 p-3 text-right">التفاصيل</th><th className="w-2/5 border border-slate-400 p-3 text-center">المبلغ</th></tr></thead>
              <tbody>
                <tr><td className="border border-slate-300 p-3">المجموع قبل التسديد</td><td className="border border-slate-300 p-3 text-center font-bold">{formatThousands(selectedBalanceBefore)} {settings.currency}</td></tr>
                <tr className="bg-slate-100"><td className="border border-slate-300 p-3">التسديد</td><td className="border border-slate-300 p-3 text-center font-bold">{formatThousands(selectedPayment.amount)} {settings.currency}</td></tr>
                <tr><td className="border border-slate-300 p-3 font-black">المتبقي</td><td className="border border-slate-300 p-3 text-center font-black">{formatThousands(selectedBalanceAfter)} {settings.currency}</td></tr>
              </tbody>
            </table>
            <div className="mt-4 grid grid-cols-1 gap-2 bg-[#e5e1d7] p-3 text-sm sm:grid-cols-3 sm:text-center">
              <p><b>اسم المستلم:</b> {settings.signaturePlaceholder || "المستلم"}</p>
              <p><b>نوع الدفع:</b> {selectedPayment.method || "غير محدد"}</p>
              <p><b>تسلسل التسديد:</b> {paymentOrdinal(selectedPaymentIndex)}</p>
            </div>
            {selectedPayment.notes && <p className="mt-3 text-xs text-slate-600"><b>ملاحظات:</b> {selectedPayment.notes}</p>}
            <div className="mt-8 grid grid-cols-2 gap-8 text-center text-sm">
              <div><p className="mb-8">توقيع المستلم</p><div className="border-t border-slate-500 pt-1">{settings.signaturePlaceholder || ""}</div></div>
              <div><p className="mb-8">توقيع العميل</p><div className="border-t border-slate-500 pt-1">{selectedCustomer.name}</div></div>
            </div>
          </ReceiptShell>
        </div>
      </div>
    );
  };

  const renderCombinedStatement = () => {
    if (!selectedCustomer || !selectedTotals) return null;
    return (
      <div className="space-y-3">
        <div className="no-print flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><FileCheck className="h-5 w-5 text-[#a88c54]" /> كشف جميع التسديدات</div>
          <ReceiptActions elementId="customer-all-payments-statement" fileName={`كشف_تسديدات_${selectedCustomer.name}`} />
        </div>
        <div id="customer-all-payments-statement">
          <ReceiptShell settings={settings} title="كشف جميع التسديدات">
            <div className="mb-4 flex flex-wrap justify-between gap-2 border border-slate-300 p-3 text-sm">
              <span><b>اسم العميل:</b> {selectedCustomer.name}</span>
              <span><b>عدد الوصولات:</b> {selectedCustomerPayments.length}</span>
              <span><b>تاريخ الكشف:</b> {formatArabicDate(localDateKey())}</span>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-2 bg-[#e5e1d7] p-3 text-sm sm:grid-cols-3 sm:text-center">
              <p><b>مجموع التسديدات:</b><br />{formatThousands(selectedAllPaidTotal)} {settings.currency}</p>
              <p><b>إجمالي الحساب:</b><br />{formatThousands(selectedTotals.sales)} {settings.currency}</p>
              <p><b>المتبقي الحالي:</b><br />{formatThousands(selectedTotals.remaining)} {settings.currency}</p>
            </div>
            <table className="w-full border-collapse border border-slate-400 text-xs sm:text-sm">
              <thead><tr className="bg-slate-800 text-[#d8c18e]"><th className="border border-slate-400 p-2">ت</th><th className="border border-slate-400 p-2">رقم الوصل</th><th className="border border-slate-400 p-2">الطابع الزمني</th><th className="border border-slate-400 p-2">التسديد</th><th className="border border-slate-400 p-2">المتبقي بعده</th></tr></thead>
              <tbody>
                {selectedCustomerPayments.map((payment, index) => {
                  const snapshot = balanceSnapshots.get(payment.id);
                  const remaining = snapshot?.remaining ?? selectedTotals.remaining;
                  return <tr key={payment.id} className={index % 2 ? "bg-slate-100" : "bg-white"}>
                    <td className="border border-slate-300 p-2 text-center">{index + 1}</td>
                    <td className="border border-slate-300 p-2 text-center" dir="ltr">{payment.id.slice(-8).toUpperCase()}</td>
                    <td className="border border-slate-300 p-2 text-center">{formatArabicTimestamp(payment.date || payment.createdAt)}</td>
                    <td className="border border-slate-300 p-2 text-center font-bold">{formatThousands(payment.amount)} {settings.currency}</td>
                    <td className="border border-slate-300 p-2 text-center font-bold">{formatThousands(remaining)} {settings.currency}</td>
                  </tr>;
                })}
                <tr className="bg-[#e5e1d7] font-black"><td className="border border-slate-300 p-2 text-center" colSpan={3}>مجموع التسديدات والمتبقي الحالي</td><td className="border border-slate-300 p-2 text-center">{formatThousands(selectedAllPaidTotal)} {settings.currency}</td><td className="border border-slate-300 p-2 text-center">{formatThousands(selectedTotals.remaining)} {settings.currency}</td></tr>
              </tbody>
            </table>
            <div className="mt-8 grid grid-cols-2 gap-8 text-center text-sm"><div><p className="mb-8">توقيع المستلم</p><div className="border-t border-slate-500 pt-1">{settings.signaturePlaceholder || ""}</div></div><div><p className="mb-8">توقيع العميل</p><div className="border-t border-slate-500 pt-1">{selectedCustomer.name}</div></div></div>
          </ReceiptShell>
        </div>
      </div>
    );
  };

  return (
    <div className="payments-view min-w-0 space-y-5" dir="rtl">
      {!selectedCustomer ? (
        <>
          <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-black text-slate-900"><Wallet className="h-5 w-5 text-emerald-700" /> التسديدات ووصولات القبض</h1>
              <p className="mt-1 text-xs text-slate-500">اختر اسم العميل لعرض وصولات تسديده أو طباعة كشف شامل. البيانات مستمدة من سجل الديون.</p>
            </div>
            <button type="button" onClick={onOpenLedger} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><FileCheck className="h-4 w-4" /> فتح سجل الديون</button>
          </header>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">إجمالي التسديدات المسجلة</p><p className="mt-1 text-lg font-black text-emerald-800">{formatThousands(totalReceived)} {settings.currency}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">عدد العملاء الذين لديهم تسديدات</p><p className="mt-1 text-lg font-black text-slate-800">{customersWithPayments}</p></div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-sm font-black text-slate-800">قائمة العملاء والتسديدات</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[210px] flex-1">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="ابحث باسم العميل أو الهاتف" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-9 text-xs outline-none focus:border-emerald-600" />
                </div>
                <label className="relative flex items-center">
                  <select value={selectedFolderId} onChange={event => setSelectedFolderId(event.target.value)} className="min-w-[150px] appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs">
                    <option value="all">كل المجلدات</option>
                    {activeFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select><ChevronDown className="pointer-events-none absolute left-2 h-4 w-4 text-slate-500" />
                </label>
                <div className="inline-flex rounded-lg border border-slate-200 p-1 text-xs">
                  <button type="button" onClick={() => setShowAllCustomers(false)} className={`rounded-md px-3 py-1.5 ${!showAllCustomers ? "bg-emerald-700 text-white" : "text-slate-600"}`}>لديهم تسديدات</button>
                  <button type="button" onClick={() => setShowAllCustomers(true)} className={`rounded-md px-3 py-1.5 ${showAllCustomers ? "bg-emerald-700 text-white" : "text-slate-600"}`}>كل العملاء</button>
                </div>
                <FilterButton activeCount={activeFilterCount} onClick={() => setFiltersOpen(true)} />
              </div>
              <FilterPanel open={filtersOpen} title="تصفية التسديدات" activeCount={activeFilterCount} onClose={() => setFiltersOpen(false)} onApply={() => setFiltersOpen(false)} onClear={() => { setSelectedMethod("all"); setDateFrom(""); setDateTo(""); setMinimumAmount(""); setMaximumAmount(""); }}>
                <label className="text-xs font-semibold text-slate-700">طريقة التسديد
                  <select value={selectedMethod} onChange={event => setSelectedMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2">
                    <option value="all">جميع الطرق</option><option value="نقدي">نقدي</option><option value="تحويل بنكي">تحويل بنكي</option><option value="شيك">شيك</option><option value="مدى">بطاقة أو إلكتروني</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-700">من تاريخ<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label><label className="text-xs font-semibold text-slate-700">إلى تاريخ<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label></div>
                <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-700">أقل مبلغ<FormattedNumberInput type="number" min="0" value={minimumAmount} onChange={event => setMinimumAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label><label className="text-xs font-semibold text-slate-700">أعلى مبلغ<FormattedNumberInput type="number" min="0" value={maximumAmount} onChange={event => setMaximumAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label></div>
              </FilterPanel>
            </div>
            {customerRows.length === 0 ? (
              <div className="rounded-xl bg-slate-50 py-12 text-center text-sm text-slate-500">ماكو عملاء مطابقين للبحث أو ما مسجلين تسديدات بعد.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[850px] border-collapse text-right text-xs">
                  <thead className="bg-slate-800 text-white"><tr><th className="p-3">ت</th><th className="p-3">اسم العميل</th><th className="p-3">المجلد</th><th className="p-3 text-center">عدد الوصولات</th><th className="p-3 text-center">مجموع التسديدات</th><th className="p-3 text-center">المتبقي</th><th className="p-3">آخر تسديد</th></tr></thead>
                  <tbody>{customerRows.map((row, index) => (
                    <tr key={row.customer.id} className="border-t border-slate-200 odd:bg-white even:bg-slate-50 hover:bg-emerald-50/70">
                      <td className="p-3 text-slate-500">{index + 1}</td>
                      <td className="p-3"><button type="button" onClick={() => openCustomer(row.customer.id)} className="font-extrabold text-emerald-800 underline-offset-2 hover:underline">{row.customer.name}</button><p className="mt-1 text-[10px] text-slate-500" dir="ltr">{row.customer.phone || ""}</p></td>
                      <td className="p-3">{folderById.get(row.customer.folderId || "") || "الرئيسي"}</td>
                      <td className="p-3 text-center">{row.customerPayments.length}</td>
                      <td className="p-3 text-center font-bold">{formatThousands(row.paid)} {settings.currency}</td>
                      <td className="p-3 text-center font-bold text-amber-800">{formatThousands(row.totals.remaining)} {settings.currency}</td>
                      <td className="p-3">{row.lastPayment ? formatArabicDate(row.lastPayment.date || row.lastPayment.createdAt) : "لا يوجد"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { setSelectedCustomerId(null); setSelectedPaymentId(null); setShowCombinedStatement(false); }} className="rounded-lg bg-slate-100 p-2 text-slate-700 hover:bg-slate-200" aria-label="العودة إلى قائمة العملاء"><ArrowRight className="h-4 w-4" /></button>
              <div><h1 className="text-base font-black text-slate-900">{selectedCustomer.name}</h1><p className="mt-1 text-xs text-slate-500">{folderById.get(selectedCustomer.folderId || "") || "الرئيسي"}{selectedCustomer.phone ? ` — ${selectedCustomer.phone}` : ""}</p></div>
            </div>
            <button type="button" onClick={() => { setShowCombinedStatement(true); setSelectedPaymentId(null); }} disabled={!selectedCustomerPayments.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#a88c54] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><FileCheck className="h-4 w-4" /> كشف جميع التسديدات</button>
          </header>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">عدد الوصولات</p><p className="mt-1 font-black">{selectedPayments.length}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">مجموع التسديدات</p><p className="mt-1 font-black text-emerald-800">{formatThousands(selectedPaidTotal)} {settings.currency}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">المتبقي الحالي</p><p className="mt-1 font-black text-amber-800">{formatThousands(selectedTotals?.remaining || 0)} {settings.currency}</p></div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">
            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-6">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800"><ReceiptText className="h-4 w-4 text-[#a88c54]" /> وصولات التسديد بالترتيب</h2>
              {selectedPayments.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">ماكو وصولات تسديد لهذا العميل.</p> : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[650px] border-collapse text-right text-xs">
                    <thead className="bg-slate-800 text-white"><tr><th className="p-3">تسلسل الوصل</th><th className="p-3">التاريخ</th><th className="p-3 text-center">التسديد</th><th className="p-3 text-center">المتبقي بعده</th><th className="p-3">الإجراء</th></tr></thead>
                    <tbody>{selectedPayments.map((payment, index) => {
                      const snapshot = balanceSnapshots.get(payment.id);
                      const remaining = snapshot?.remaining ?? selectedTotals?.remaining ?? 0;
                      const isSelected = selectedPaymentId === payment.id && !showCombinedStatement;
                      return <tr key={payment.id} className={`border-t border-slate-200 ${isSelected ? "bg-emerald-50" : index % 2 ? "bg-slate-50" : "bg-white"}`}>
                        <td className="p-3 font-bold">وصل التسديد {paymentOrdinal(index)}</td>
                        <td className="p-3">{formatArabicDate(payment.date || payment.createdAt)}</td>
                        <td className="p-3 text-center font-bold">{formatThousands(payment.amount)} {settings.currency}</td>
                        <td className="p-3 text-center font-bold text-amber-800">{formatThousands(remaining)} {settings.currency}</td>
                        <td className="p-3"><button type="button" onClick={() => { setSelectedPaymentId(payment.id); setShowCombinedStatement(false); }} className="rounded-md bg-emerald-700 px-3 py-1.5 font-bold text-white">عرض الوصل</button></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="min-w-0 xl:col-span-6">
              {showCombinedStatement ? renderCombinedStatement() : selectedPayment ? renderIndividualReceipt() : (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  <UserRound className="h-9 w-9 text-slate-300" /><span>اختار وصل من الجدول حتى يظهر نموذج الوصل، أو اضغط كشف جميع التسديدات.</span>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
