import React from "react";
import {
  TrendingUp,
  DollarSign,
  TrendingDown,
  Users,
  PlusCircle,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  PackageCheck,
  Clock,
  BellRing,
  Scale,
  BookOpen
} from "lucide-react";
import { Customer, Product, Invoice, Payment, SystemSettings } from "../types";
import OverdueInvoicesAlert from "./OverdueInvoicesAlert";
import { isInvoiceOverdue, getInvoiceOverdueDays } from "../utils/overdueUtils";

interface DashboardViewProps {
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
  setCurrentTab: (tab: string) => void;
  onOpenNewInvoiceModal: () => void;
  onOpenNewPaymentModal: () => void;
  onOpenNewCustomerModal: () => void;
  onOpenNewProductModal: () => void;
  onSelectInvoiceForLedger?: (customerId: string, invoiceId: string) => void;
  onUpdateInvoice?: (invoice: Invoice) => void;
}

export default function DashboardView({
  customers,
  products,
  invoices,
  payments,
  settings,
  setCurrentTab,
  onOpenNewInvoiceModal,
  onOpenNewPaymentModal,
  onOpenNewCustomerModal,
  onOpenNewProductModal,
  onSelectInvoiceForLedger,
  onUpdateInvoice,
}: DashboardViewProps) {
  // Calculations
  const totalSales = invoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
  const totalPaid = payments.reduce((acc, pay) => acc + pay.amount, 0);
  const totalRemaining = invoices.reduce((acc, inv) => acc + inv.remainingAmount, 0);
  const activeCustomers = customers.length;
  const collectionRate = totalSales > 0 ? Math.min(100, Math.max(0, Math.round((totalPaid / totalSales) * 100))) : 0;
  const remainingRate = totalSales > 0 ? Math.min(100, Math.max(0, Math.round((totalRemaining / totalSales) * 100))) : 0;

  // Overdue calculations
  const overdueInvoices = invoices.filter((inv) => isInvoiceOverdue(inv));
  const totalOverdueAmount = overdueInvoices.reduce((acc, inv) => acc + inv.remainingAmount, 0);

  // Alerts: Products with quantity <= 10
  const lowStockProducts = products.filter((p) => p.quantity <= 10);

  // Recent Invoices (last 5)
  const recentInvoices = [...invoices]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  // Recent Payments (last 5)
  const recentPayments = [...payments]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-l from-blue-950 to-slate-900 text-white rounded-xl p-6 shadow-sm border border-blue-900/50">
        <div className="max-w-3xl">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
            مرحباً بك في نظام {settings.companyName || "دفتر الديون المحاسبي"}
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            لوحة تحكم ذكية وشاملة تمنحك رقابة تامة على ديون العملاء، حركة المبيعات، ومخزون البضائع في مكان واحد، مع إمكانيات طباعة وتصدير فورية.
          </p>
        </div>
      </div>

      {/* Visual Overdue Invoices Alert Notification */}
      <OverdueInvoicesAlert
        invoices={invoices}
        customers={customers}
        settings={settings}
        setCurrentTab={setCurrentTab}
        onSelectInvoiceForLedger={onSelectInvoiceForLedger}
        onUpdateInvoice={onUpdateInvoice}
      />

      {/* بطاقة الموقف المالي البصري للديون والتحصيل (Visual Outstanding Debts & Collections Card) */}
      <div id="visual-debt-overview-card" className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-800">
                الموقف المالي العام للديون والتحصيل
              </h2>
              <p className="text-xs text-slate-400">
                مؤشرات بصرية لمتابعة إجمالي الديون المستحقة، مجموع المبالغ المحصلة، وصافي الرصيد الحالي
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCurrentTab("ledger")}
            className="self-start sm:self-auto px-3.5 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>فتح سجل الديون</span>
          </button>
        </div>

        {/* The 3 Core Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. إجمالي الديون المستحقة */}
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">إجمالي الديون المستحقة</span>
              <span className="w-7 h-7 rounded-lg bg-slate-200/60 text-slate-700 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-2xl sm:text-3xl font-black text-slate-900">
                  {totalSales.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-slate-500">{settings.currency}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-medium">
                إجمالي قيمة الفواتير والقوائم الآجلة
              </p>
            </div>
          </div>

          {/* 2. مجموع المبالغ المحصلة */}
          <div className="bg-blue-50/50 border border-blue-200/70 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900">مجموع المبالغ المحصلة</span>
              <span className="text-[11px] font-mono font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                {collectionRate}% محصل
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-2xl sm:text-3xl font-black text-blue-700">
                  {totalPaid.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-blue-600">{settings.currency}</span>
              </div>
              <p className="text-[11px] text-blue-600/80 mt-1 font-medium">
                المبالغ التي تم تسديدها واستلامها
              </p>
            </div>
          </div>

          {/* 3. صافي الرصيد الحالي للديون */}
          <div className="bg-rose-50/50 border border-rose-200/70 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-900">صافي الرصيد الحالي للديون</span>
              <span className="text-[11px] font-mono font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                {remainingRate}% متبقي
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-2xl sm:text-3xl font-black text-rose-700">
                  {totalRemaining.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-rose-600">{settings.currency}</span>
              </div>
              <p className="text-[11px] text-rose-600/80 mt-1 font-medium">
                المبالغ المتبقية بذمة العملاء والمدينين
              </p>
            </div>
          </div>
        </div>

        {/* Visual Progress Bar (مقياس بياني مرئي للتحصيل والمتبقي) */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-1.5 text-blue-800">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
              <span>المبالغ المحصلة ({collectionRate}%)</span>
            </span>
            <span className="flex items-center gap-1.5 text-rose-800">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />
              <span>صافي رصيد الديون المتبقي ({remainingRate}%)</span>
            </span>
          </div>

          <div className="w-full h-3.5 bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
            <div
              style={{ width: `${collectionRate}%` }}
              className="h-full bg-blue-600 transition-all duration-500"
              title={`المحصل: ${totalPaid.toLocaleString()} ${settings.currency} (${collectionRate}%)`}
            />
            <div
              style={{ width: `${remainingRate}%` }}
              className="h-full bg-rose-500 transition-all duration-500"
              title={`المتبقي: ${totalRemaining.toLocaleString()} ${settings.currency} (${remainingRate}%)`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
            <span>0 {settings.currency}</span>
            <span className="font-sans font-medium text-slate-500">
              إجمالي حجم الالتزامات: <strong className="font-mono text-slate-800 font-bold">{totalSales.toLocaleString()} {settings.currency}</strong>
            </span>
            <span>{totalSales.toLocaleString()} {settings.currency}</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales (Debit Volume) */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium">إجمالي حجم المبيعات / الديون</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-800 font-mono">
                {totalSales.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 font-medium">{settings.currency}</span>
            </div>
          </div>
          <div className="p-3 bg-blue-50/50 text-blue-600 rounded">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>

        {/* Total Collected (Paid) */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium">إجمالي المبالغ المحصلة</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-blue-600 font-mono">
                {totalPaid.toLocaleString()}
              </span>
              <span className="text-xs text-blue-500 font-medium">{settings.currency}</span>
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Total Remaining Debt */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-slate-500 font-medium">الديون المتبقية بذمة العملاء</span>
              {overdueInvoices.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded border border-rose-200 animate-pulse">
                  {overdueInvoices.length} متأخرة
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-rose-600 font-mono">
                {totalRemaining.toLocaleString()}
              </span>
              <span className="text-xs text-rose-500 font-medium">{settings.currency}</span>
            </div>
            {totalOverdueAmount > 0 && (
              <p className="text-[10px] text-rose-600 font-semibold mt-0.5">
                منها {totalOverdueAmount.toLocaleString()} {settings.currency} تجاوزت الاستحقاق
              </p>
            )}
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Total Customers */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium">عدد العملاء المسجلين</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-800 font-mono">
                {activeCustomers}
              </span>
              <span className="text-xs text-slate-400 font-medium">عميل</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 text-slate-600 rounded">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Quick Action Hub */}
      <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">إجراءات سريعة واختصارات</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            id="dashboard-quick-add-invoice"
            onClick={onOpenNewInvoiceModal}
            className="flex flex-col items-center justify-center p-4 bg-blue-50/60 hover:bg-blue-50 text-blue-800 border border-blue-100 rounded-xl transition-all group"
          >
            <PlusCircle className="w-5 h-5 mb-2 text-blue-600 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold">فتح قائمة حساب (فاتورة دين)</span>
          </button>

          <button
            id="dashboard-quick-add-payment"
            onClick={onOpenNewPaymentModal}
            className="flex flex-col items-center justify-center p-4 bg-blue-50 hover:bg-blue-100/80 text-blue-800 border border-blue-100 rounded-xl transition-all group"
          >
            <DollarSign className="w-5 h-5 mb-2 text-blue-600 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold">تسجيل تسديد جديد (دفعة)</span>
          </button>

          <button
            id="dashboard-quick-add-customer"
            onClick={onOpenNewCustomerModal}
            className="flex flex-col items-center justify-center p-4 bg-blue-50 hover:bg-blue-100/80 text-blue-800 border border-blue-100 rounded-xl transition-all group"
          >
            <Users className="w-5 h-5 mb-2 text-blue-600 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold">إضافة ملف عميل جديد</span>
          </button>

          <button
            id="dashboard-quick-add-product"
            onClick={onOpenNewProductModal}
            className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl transition-all group"
          >
            <PackageCheck className="w-5 h-5 mb-2 text-slate-600 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold">إضافة بضاعة للمستودع</span>
          </button>
        </div>
      </div>

      {/* Split Rows */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Alerts & Statuses */}
        <div className="space-y-6">
          {/* Low Stock Alerts */}
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                تنبيهات المخزون المنخفض
              </h2>
              <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-semibold">
                {lowStockProducts.length} مواد
              </span>
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                مستويات المخزون ممتازة لجميع البضائع!
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto">
                {lowStockProducts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-700 line-clamp-1">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        التصنيف: {p.category}
                      </p>
                    </div>
                    <div className="text-left">
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 font-semibold rounded font-mono">
                        {p.quantity} قطع متبقية
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Ledger Balance widget */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-5 rounded-xl shadow-sm flex flex-col justify-between h-[180px]">
            <div>
              <p className="text-blue-100 text-xs font-semibold">معدل التحصيل المالي</p>
              <h3 className="text-3xl font-bold font-mono mt-1">
                {totalSales > 0 ? Math.round((totalPaid / totalSales) * 100) : 0}%
              </h3>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-blue-100">
                <span>إجمالي المحصل:</span>
                <span className="font-mono font-bold">{totalPaid.toLocaleString()} {settings.currency}</span>
              </div>
              <div className="w-full bg-blue-800/50 rounded-full h-1.5 mt-1 overflow-hidden">
                <div
                  className="bg-white h-1.5 rounded-full"
                  style={{ width: `${totalSales > 0 ? Math.min(100, (totalPaid / totalSales) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Middle and Right Column: Invoices & Payments lists */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Invoices */}
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">أحدث قوائم حساب ديون العملاء</h2>
              <button
                onClick={() => setCurrentTab("invoices")}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                عرض الكل <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentInvoices.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                لا توجد قوائم حساب مسجلة حتى الآن.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-medium">
                      <th className="pb-2 text-right">رقم القائمة</th>
                      <th className="pb-2 text-right">العميل</th>
                      <th className="pb-2 text-left">المجموع الكلي</th>
                      <th className="pb-2 text-left">المتبقي لأجل</th>
                      <th className="pb-2 text-center">التاريخ / الاستحقاق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {recentInvoices.map((inv) => {
                      const overdue = isInvoiceOverdue(inv);
                      const overdueDays = overdue ? getInvoiceOverdueDays(inv) : 0;
                      return (
                        <tr
                          key={inv.id}
                          onClick={() => onSelectInvoiceForLedger && onSelectInvoiceForLedger(inv.customerId, inv.id)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                          title="انقر لفتح سجل الفاتورة في دفتر الحساب"
                        >
                          <td className="py-3 font-semibold font-mono text-slate-700 group-hover:text-blue-600">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3 font-semibold text-slate-800">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{inv.customerName}</span>
                              {overdue && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  متأخرة ({overdueDays} يوم)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 font-bold font-mono text-slate-900 text-left">
                            {inv.grandTotal.toLocaleString()} {settings.currency}
                          </td>
                          <td className="py-3 text-left">
                            <span
                              className={`px-2 py-0.5 rounded font-mono font-semibold ${
                                inv.remainingAmount === 0
                                  ? "bg-blue-50 text-blue-700"
                                  : overdue
                                  ? "bg-rose-100 text-rose-800 font-bold"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {inv.remainingAmount.toLocaleString()} {settings.currency}
                            </span>
                          </td>
                          <td className="py-3 text-slate-500 font-mono text-center">
                            <div>{inv.date}</div>
                            {inv.dueDate && (
                              <div className="text-[10px] text-slate-400">استحقاق: {inv.dueDate}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Payments */}
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">أحدث الدفعات والتسديدات</h2>
              <button
                onClick={() => setCurrentTab("payments")}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                عرض الكل <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentPayments.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                لم يتم تسجيل أي دفعات تسديد حتى الآن.
              </div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((pay) => (
                  <div
                    key={pay.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50/80 hover:bg-slate-50 border border-slate-100 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 text-blue-700 rounded">
                        <ArrowDownLeft className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{pay.customerName}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          طريقة الدفع: {pay.method} • {pay.date}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-blue-600 font-mono text-sm">
                        +{pay.amount.toLocaleString()} {settings.currency}
                      </p>
                      {pay.notes && (
                        <p className="text-[10px] text-slate-400 mt-0.5 max-w-[200px] truncate">
                          {pay.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
