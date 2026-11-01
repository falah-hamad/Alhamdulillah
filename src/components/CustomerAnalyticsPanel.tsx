import React, { useMemo, useState } from "react";
import { BarChart3, BriefcaseBusiness, CalendarClock, ChartNoAxesCombined, CircleDollarSign } from "lucide-react";
import { Customer, Invoice, Payment } from "../types";
import { MonthlyFinanceChart, RankingChart } from "./AnalyticsCharts";

type AnalyticsTab = "business" | "financial" | "due" | "analytics";
type Source = "vertical" | "accounting";

const format = (value: number) => value.toLocaleString("ar-IQ", { maximumFractionDigits: 2 });
const isValidDate = (value?: string) => !!value && Number.isFinite(Date.parse(value));

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return <article className="min-w-0 rounded-xl border border-violet-100 bg-white p-3 shadow-sm sm:p-4">
    <span className="block text-xs text-slate-500">{label}</span>
    <strong className="mt-1 block break-words text-sm font-extrabold text-violet-900 sm:text-base">{value}</strong>
    {note && <span className="mt-1 block text-[10px] leading-4 text-slate-400">{note}</span>}
  </article>;
}

function duration(first?: string, last?: string) {
  if (!first || !last) return "غير متاحة";
  const days = Math.max(0, Math.floor((Date.parse(last) - Date.parse(first)) / 86400000));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = days % 30;
  return `${years} سنة، ${months} شهر، ${remainingDays} يوم`;
}

export default function CustomerAnalyticsPanel({ customer, invoices, payments, currency }: {
  customer: Customer;
  invoices: Invoice[];
  payments: Payment[];
  currency: string;
}) {
  const [tab, setTab] = useState<AnalyticsTab>("business");
  const [source, setSource] = useState<Source>("vertical");
  const customerInvoices = useMemo(() => invoices.filter(invoice => invoice.customerId === customer.id && !invoice.isDeleted), [customer.id, invoices]);
  const customerPayments = useMemo(() => payments.filter(payment => payment.customerId === customer.id && !payment.isDeleted), [customer.id, payments]);
  const rows = source === "vertical"
    ? customerInvoices.flatMap(invoice => invoice.items.filter(item => !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow && (item.details?.trim() || item.total !== 0)))
    : (customer.accountingSheetRows || []).filter(row => !row.isSeparator && (row.details?.trim() || row.total !== 0));
  const sales = source === "vertical"
    ? customerInvoices.reduce((sum, invoice) => sum + (Number(invoice.grandTotal) || 0), 0)
    : rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  const paid = source === "vertical"
    ? customerInvoices.reduce((sum, invoice) => sum + (Number(invoice.paidAmount) || 0), 0)
    : (customer.accountingSheetPayments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const remaining = source === "vertical"
    ? customerInvoices.reduce((sum, invoice) => sum + (Number(invoice.remainingAmount) || 0), 0)
    : Math.max(0, sales - paid);
  const itemSales = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  const costsComplete = rows.length > 0 && rows.every(row => typeof row.unitCost === "number" && Number.isFinite(row.unitCost) && row.unitCost >= 0);
  const totalCost = costsComplete ? rows.reduce((sum, row) => sum + row.quantity * (row.unitCost || 0), 0) : null;
  const profit = totalCost !== null && Math.abs(itemSales - sales) < 0.01 ? sales - totalCost : null;
  const datedSales = source === "vertical"
    ? customerInvoices.map(invoice => ({ date: invoice.date, amount: Number(invoice.grandTotal) || 0 }))
    : rows.map(row => ({ date: row.createdAt || "", amount: Number(row.total) || 0 }));
  const datedPayments = source === "vertical"
    ? customerPayments.map(payment => ({ date: payment.date, amount: Number(payment.amount) || 0 }))
    : (customer.accountingSheetPayments || []).map(payment => ({ date: payment.date, amount: Number(payment.amount) || 0 }));
  const topItems = [...rows.reduce((map, row) => {
    const name = row.details?.trim() || row.productId || "صنف غير مسمى";
    map.set(name, (map.get(name) || 0) + (Number(row.total) || 0));
    return map;
  }, new Map<string, number>()).entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);

  const validInvoices = customerInvoices.filter(invoice => isValidDate(invoice.date));
  const firstDate = (source === "vertical" ? validInvoices.map(invoice => invoice.date) : rows.map(row => row.createdAt).filter(isValidDate)).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const lastDate = (source === "vertical" ? validInvoices.map(invoice => invoice.date) : rows.map(row => row.createdAt).filter(isValidDate)).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const itemNames = new Set(rows.map(row => row.productId || row.details?.trim()).filter(Boolean));
  const dueKnown = source === "vertical" && customerInvoices.length > 0 && customerInvoices.every(invoice => invoice.remainingAmount <= 0 || isValidDate(invoice.dueDate));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
  const overdue = dueKnown ? customerInvoices.filter(invoice => invoice.remainingAmount > 0 && invoice.dueDate && invoice.dueDate < today) : [];
  const nextDue = dueKnown ? customerInvoices.filter(invoice => invoice.remainingAmount > 0 && invoice.dueDate && invoice.dueDate >= today).map(invoice => invoice.dueDate!).sort()[0] : undefined;
  const tabs: { id: AnalyticsTab; label: string; icon: typeof BriefcaseBusiness }[] = [
    { id: "business", label: "ب. التعامل التجاري", icon: BriefcaseBusiness },
    { id: "financial", label: "ج. الملخص الحسابي", icon: CircleDollarSign },
    { id: "due", label: "د. المستحقات والتأخير", icon: CalendarClock },
    { id: "analytics", label: "هـ. الإحصائيات والتحليل", icon: ChartNoAxesCombined },
  ];

  return <section className="min-w-0 space-y-4" dir="rtl" aria-label={`إحصائيات العميل ${customer.name}`}>
    <header className="rounded-2xl border border-violet-100 bg-gradient-to-l from-violet-50 via-white to-white p-4 sm:p-5">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><BarChart3 className="h-5 w-5" /></span><div className="min-w-0"><h2 className="font-extrabold text-slate-900">إحصائيات العميل</h2><p className="mt-1 truncate text-sm text-slate-600">{customer.name}</p></div></div>
      <label className="mt-4 block text-xs font-bold text-slate-600">مصدر الحسابات
        <select value={source} onChange={event => setSource(event.target.value as Source)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-medium text-slate-800 sm:max-w-md">
          <option value="vertical">سجل الحساب العمودي / كشوف الديون</option>
          <option value="accounting">القائمة الحسابية المستقلة</option>
        </select>
      </label>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">كل مصدر يُحسب بصورة مستقلة. الأرقام مأخوذة من السجلات المحفوظة، وسندات القبض لا تُضاف مرة ثانية إلى المبالغ المسددة.</p>
    </header>

    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="أقسام إحصائيات العميل">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold sm:text-sm ${tab === id ? "bg-violet-600 text-white" : "border bg-white text-slate-700 hover:bg-violet-50"}`}><Icon className="h-4 w-4" />{label}</button>)}
    </div>

    {tab === "business" && <div className="space-y-3">
      <h3 className="text-sm font-extrabold text-slate-800">تفاصيل التعامل التجاري</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricCard label={source === "vertical" ? "عدد الكشوف" : "عدد البنود"} value={format(source === "vertical" ? customerInvoices.length : rows.length)} />
        <MetricCard label="أصناف مسجلة مختلفة" value={format(itemNames.size)} />
        <MetricCard label="أول تاريخ مسجل" value={firstDate ? new Date(firstDate).toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" }) : "غير مسجل"} />
        <MetricCard label="آخر تاريخ مسجل" value={lastDate ? new Date(lastDate).toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" }) : "غير مسجل"} />
        <MetricCard label="مدة التعامل المسجلة" value={duration(firstDate, lastDate)} note="محسوبة من أول وآخر تاريخ محفوظ" />
        <MetricCard label="قيمة التعامل المسجلة" value={`${format(sales)} ${currency}`} />
      </div>
      <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">لم نجمع الكميات هنا، لأن جمع وحدات مختلفة مثل القطعة والمتر يعطي رقماً مضللاً.</p>
    </div>}

    {tab === "financial" && <div className="space-y-3">
      <h3 className="text-sm font-extrabold text-slate-800">الملخص الحسابي</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricCard label="إجمالي المبالغ المسجلة" value={`${format(sales)} ${currency}`} />
        <MetricCard label="المسدد داخل السجلات" value={`${format(paid)} ${currency}`} />
        <MetricCard label="المتبقي" value={`${format(remaining)} ${currency}`} />
        <MetricCard label="الربح من البنود" value={profit === null ? "غير متاح" : `${format(profit)} ${currency}`} note={profit === null ? "يتطلب توفر كلفة كل بند وتطابق مجموع البنود مع الإجمالي" : undefined} />
        <MetricCard label="هامش الربح" value={profit !== null && sales > 0 ? `${format(profit / sales * 100)}٪` : "غير متاح"} />
        <MetricCard label="سندات القبض المسجلة" value={format(source === "vertical" ? customerPayments.length : (customer.accountingSheetPayments || []).length)} note="للتدقيق؛ لا تُضاف ثانيةً إلى المسدد أعلاه" />
      </div>
      {source === "vertical" && <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">التسديد المعروض مأخوذ من مبالغ الكشوف نفسها؛ وسندات القبض تُعرض بعددها فقط حتى لا تتكرر القيمة.</p>}
    </div>}

    {tab === "due" && <div className="space-y-3">
      <h3 className="text-sm font-extrabold text-slate-800">المستحقات والتأخير</h3>
      {source !== "vertical" ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">القائمة الحسابية المستقلة لا تحتوي على جدول استحقاقات؛ لذلك لا يمكن تأكيد المتأخرات أو الأقساط منها.</p>
        : <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricCard label="المتبقي في الكشوف" value={`${format(remaining)} ${currency}`} />
            <MetricCard label="الكشوف المفتوحة" value={format(customerInvoices.filter(invoice => invoice.remainingAmount > 0).length)} />
            <MetricCard label="الكشوف المغلقة" value={format(customerInvoices.filter(invoice => invoice.grandTotal > 0 && invoice.remainingAmount <= 0).length)} />
            <MetricCard label="المبالغ المتأخرة" value={dueKnown ? `${format(overdue.reduce((sum, invoice) => sum + invoice.remainingAmount, 0))} ${currency}` : "غير متاح"} note={!dueKnown ? "سجّل تاريخ استحقاق لكل كشف مفتوح" : undefined} />
            <MetricCard label="عدد الكشوف المتأخرة" value={dueKnown ? format(overdue.length) : "غير متاح"} />
            <MetricCard label="أقرب استحقاق قادم" value={dueKnown ? nextDue || "لا يوجد" : "غير متاح"} />
          </div>
          {!dueKnown && <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">لا نصف المبالغ بأنها متأخرة ما لم يكن تاريخ استحقاق الكشف مسجلاً.</p>}
        </>}
    </div>}

    {tab === "analytics" && <div className="space-y-4">
      <MonthlyFinanceChart sales={datedSales} collections={datedPayments} title="حركة حساب العميل" currency={currency} description="المبالغ حسب تاريخ الكشف أو البند، والتسديدات حسب تاريخ سند القبض." />
      <RankingChart title="الأصناف الأعلى قيمةً لهذا العميل" description="حسب مجموع قيمة البنود المسجلة، دون خلط الكميات ووحداتها." items={topItems} currency={currency} color="indigo" />
      {source === "accounting" && rows.some(row => !isValidDate(row.createdAt)) && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">بعض البنود لا تحتوي على تاريخ محفوظ، لذلك لا تدخل في المخطط الشهري.</p>}
    </div>}
  </section>;
}
