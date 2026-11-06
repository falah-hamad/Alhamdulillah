import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  FileText,
  Users,
  Wallet,
  Banknote,
  ContactRound,
  FolderOpen,
} from "lucide-react";
import { Customer, CustomerFolder, Product, Invoice, Payment, SystemSettings } from "../types";
import { BalanceDonut, MonthlyFinanceChart, RankingChart } from "./AnalyticsCharts";
import CustomerStatisticsProfile from "./CustomerStatisticsProfile";
import PercentageCalculator from "./PercentageCalculator";

interface StatsViewProps {
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
  folders: CustomerFolder[];
  onSaveCustomer?: (customer: Customer) => Promise<void> | void;
}

const formatAmount = (amount: number) => Math.round(amount).toLocaleString("ar-IQ");
const isFinancialItem = (item: Invoice["items"][number]) =>
  !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow;

export default function StatsView({ customers, products, invoices, payments, settings, folders, onSaveCustomer }: StatsViewProps) {
  const [chartMonths, setChartMonths] = useState<6 | 12>(6);
  const [section, setSection] = useState<"general" | "customers" | "percentages">("customers");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const selectedCustomer = customers.find(customer => customer.id === selectedCustomerId);
  const activeFolders = folders.filter(folder => !folder.isDeleted);
  const folderIds = new Set(activeFolders.map(folder => folder.id));
  const folderKey = (customer: Customer) => customer.folderId && folderIds.has(customer.folderId) ? customer.folderId : "root";
  const folderTabs = [{ id: "root", name: "الحافظة الرئيسية" }, ...activeFolders].map(folder => ({
    ...folder,
    count: customers.filter(customer => folderKey(customer) === folder.id).length,
  }));
  const activeFolderId = selectedFolderId && folderTabs.some(folder => folder.id === selectedFolderId)
    ? selectedFolderId : folderTabs.find(folder => folder.count > 0)?.id || "root";
  const folderCustomers = customers.filter(customer => folderKey(customer) === activeFolderId)
    .sort((a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, "ar"));
  const activeInvoices = useMemo(() => invoices.filter((invoice) => !invoice.isDeleted), [invoices]);
  const activePayments = useMemo(() => payments.filter((payment) => !payment.isDeleted), [payments]);
  const totalSales = activeInvoices.reduce((sum, invoice) => sum + (Number(invoice.grandTotal) || 0), 0);
  const totalPaid = activePayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const invoicePaid = activeInvoices.reduce((sum, invoice) => sum + (Number(invoice.paidAmount) || 0), 0);
  const totalRemaining = activeInvoices.reduce((sum, invoice) => sum + (Number(invoice.remainingAmount) || 0), 0);
  const collectionRate = totalSales > 0 ? Math.round((invoicePaid / totalSales) * 100) : 0;

  const monthlySales = activeInvoices.map((invoice) => ({ date: invoice.date, amount: Number(invoice.grandTotal) || 0 }));
  const monthlyCollections = activePayments.map((payment) => ({ date: payment.date, amount: Number(payment.amount) || 0 }));

  const topDebtors = useMemo(() => customers.map((customer) => ({
    name: customer.name,
    value: activeInvoices.filter((invoice) => invoice.customerId === customer.id)
      .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.remainingAmount) || 0), 0),
  })).filter((customer) => customer.value > 0).sort((a, b) => b.value - a.value).slice(0, 5), [customers, activeInvoices]);

  const topProducts = useMemo(() => {
    const productById = new Map(products.filter((product) => !product.isDeleted).map((product) => [product.id, product]));
    const ranked = new Map<string, number>();
    activeInvoices.forEach((invoice) => invoice.items.filter(isFinancialItem).forEach((item) => {
      const value = Number(item.total) || 0;
      if (value <= 0) return;
      const linkedProduct = item.productId ? productById.get(item.productId) : undefined;
      const name = linkedProduct?.name || item.details?.trim() || "صنف غير مسمى";
      ranked.set(name, (ranked.get(name) || 0) + value);
    }));
    return [...ranked.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [activeInvoices, products]);

  const kpis = [
    { label: "العملاء النشطون", value: customers.length, icon: Users, color: "text-blue-600", tone: "bg-blue-50" },
    { label: "كشوف الديون", value: activeInvoices.length, icon: FileText, color: "text-violet-600", tone: "bg-violet-50" },
    { label: "إجمالي المبالغ المسجلة", value: `${formatAmount(totalSales)} ${settings.currency}`, icon: Wallet, color: "text-indigo-600", tone: "bg-indigo-50" },
    { label: "إجمالي التسديدات المسجلة", value: `${formatAmount(totalPaid)} ${settings.currency}`, icon: Banknote, color: "text-emerald-600", tone: "bg-emerald-50" },
    { label: "المتبقي في الكشوف", value: `${formatAmount(totalRemaining)} ${settings.currency}`, icon: AlertCircle, color: "text-rose-600", tone: "bg-rose-50" },
  ];

  if (section === "customers" && selectedCustomer) {
    return <CustomerStatisticsProfile customer={selectedCustomer} invoices={invoices} payments={payments} currency={settings.currency} folders={folders} onSave={onSaveCustomer} onClose={() => setSelectedCustomerId("")} />;
  }

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-4 pb-6 sm:space-y-6" dir="rtl">
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" role="tablist" aria-label="نطاق الإحصائيات">
        {([ ["general", "إحصائيات عامة"], ["customers", "إحصائيات العملاء"], ["percentages", "حساب النسب"] ] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold ${section === id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>)}
      </div>
      {section === "customers" ? <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800"><FolderOpen className="h-4 w-4 text-violet-600" />العملاء حسب الحافظة</h2>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="حافظات العملاء">
            {folderTabs.map(folder => <button key={folder.id} type="button" role="tab" aria-selected={activeFolderId === folder.id} onClick={() => setSelectedFolderId(folder.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold sm:text-sm ${activeFolderId === folder.id ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-violet-50"}`}><FolderOpen className="h-4 w-4" />{folder.name}<span className={`rounded-md px-1.5 py-0.5 text-[10px] ${activeFolderId === folder.id ? "bg-white/20" : "bg-white"}`}>{folder.count}</span></button>)}
          </div>
        </div>
        {folderCustomers.length > 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {folderCustomers.map(customer => <button key={customer.id} type="button" onClick={() => setSelectedCustomerId(customer.id)} aria-label={`فتح ملف وإحصائيات ${customer.name}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-violet-500">
            {customer.profile?.photo ? <img src={customer.profile.photo} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" /> : <span className="rounded-xl bg-violet-50 p-3 text-violet-600"><ContactRound className="h-5 w-5" /></span>}
            <span className="min-w-0 flex-1"><strong className="block break-words text-sm text-slate-900">{customer.name}</strong><span className="mt-1 block text-xs text-slate-500">{customer.phone || "ملف العميل والإحصائيات"}</span></span>
            {customer.sequence != null && <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">{customer.sequence}</span>}
          </button>)}
        </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">لا يوجد عملاء في هذه الحافظة.</div>}
      </section> : section === "percentages" ? <PercentageCalculator customers={customers} invoices={invoices} payments={payments} products={products} folders={folders} currency={settings.currency} /> : <>
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-l from-indigo-50 via-white to-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700"><BarChart3 className="h-5 w-5" /></span>
          <div className="min-w-0"><h2 className="text-base font-extrabold text-slate-900 sm:text-lg">الإحصائيات العامة للمحل</h2><p className="mt-1 text-xs leading-5 text-slate-600">ملخص من سجلات العملاء والكشوف والتسديدات المحفوظة. الأرقام الإجمالية تشمل كامل السجلات النشطة.</p></div>
        </div>
        <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
          {kpis.map(({ label, value, icon: Icon, color, tone }) => <article key={label} className="min-w-0 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:p-4">
            <div className={`mb-2 inline-flex rounded-lg p-2 ${tone} ${color}`}><Icon className="h-4 w-4" /></div>
            <p className="text-[10px] leading-4 text-slate-500 sm:text-xs">{label}</p>
            <strong className="mt-1 block break-words text-sm font-extrabold text-slate-900 sm:text-base">{value}</strong>
          </article>)}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-sm font-extrabold text-slate-800">حركة الحساب</h3><p className="mt-1 text-[11px] text-slate-500">قارن المبالغ المسجلة مع سندات التسديد حسب تاريخ كل عملية.</p></div>
          <div className="inline-flex rounded-xl border bg-white p-1" aria-label="الفترة الزمنية للمخطط">
            {([6, 12] as const).map((count) => <button key={count} type="button" onClick={() => setChartMonths(count)} aria-pressed={chartMonths === count} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${chartMonths === count ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>آخر {count} أشهر</button>)}
          </div>
        </div>
        <MonthlyFinanceChart sales={monthlySales} collections={monthlyCollections} months={chartMonths} title="المبالغ والتسديدات شهرياً" currency={settings.currency} description="الأعمدة البنفسجية للمبالغ المسجلة، والخضراء للتسديدات المسجلة." />
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <BalanceDonut paid={totalPaid} remaining={totalRemaining} currency={settings.currency} />
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-sm font-extrabold text-slate-800">معدل التحصيل المسجل</h3>
          <p className="mt-1 text-xs text-slate-500">نسبة المسدد داخل الكشوف إلى إجمالي مبالغها، لتجنّب جمع سندات القبض مرتين.</p>
          <div className="mt-5 flex items-center gap-4">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${collectionRate}%` }} /></div>
            <strong className="min-w-12 text-left font-mono text-xl text-indigo-700">{collectionRate}٪</strong>
          </div>
        </section>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <RankingChart title="العملاء الأعلى رصيداً" description="ترتيب حسب المتبقي في كشوف الديون النشطة." items={topDebtors} currency={settings.currency} color="rose" />
        <RankingChart title="الأصناف الأعلى قيمةً في السجلات" description="ترتيب حسب مجموع قيمة البنود، دون خلط الوحدات المختلفة." items={topProducts} currency={settings.currency} color="indigo" />
      </div>
      </>}
    </div>
  );
}
