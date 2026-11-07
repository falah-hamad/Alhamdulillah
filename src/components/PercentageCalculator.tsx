import { useMemo, useState } from "react";
import { Plus, Percent, Trash2 } from "lucide-react";
import { Customer, CustomerFolder, Invoice, Payment, Product } from "../types";

type Metric = "payments" | "sales" | "remaining" | "profit";
type FilterField = "all" | "folderId" | "address" | "occupation" | "salaryStatus" | "salaryType" | "relationship" | "purchaseDate" | "quantity" | "cost" | "sales" | "profit" | "paid" | "remaining" | "balanceStatus" | "overdueOnly" | "activityDate" | "sellerName" | "paymentRecipient";
type ValueFilter = { field: FilterField; value: string; mode: "exact" | "range"; exact: string; min: string; max: string; unit: "days" | "months" | "years" };
type PeriodFilter = { mode: "exact" | "range"; on: string; from: string; to: string };
type Comparison = { id: string; metric: Metric; numeratorFilter: ValueFilter; numeratorPeriod: PeriodFilter; denominatorFilter: ValueFilter; denominatorPeriod: PeriodFilter };
type CustomerTotals = { sales: number; payments: number; remaining: number; currentBalance: number; profit: number; quantity: number; cost: number | null; missingCostItems: number; sellers: string[]; recipients: string[]; overdue: boolean; hasPurchase: boolean; hasActivity: boolean };

const metricLabels: Record<Metric, string> = { payments: "التسديدات", sales: "المبيعات", remaining: "المتبقي", profit: "الربح" };
const filterFields: Array<{ value: FilterField; label: string }> = [
  { value: "all", label: "كل العملاء" },
  { value: "folderId", label: "حسب المجلد" },
  { value: "address", label: "حسب عنوان السكن" },
  { value: "occupation", label: "حسب المهنة أو الوظيفة" },
  { value: "salaryStatus", label: "هل لديه راتب؟" },
  { value: "salaryType", label: "حسب نوع الراتب" },
  { value: "relationship", label: "حسب مدة التعامل" },
  { value: "purchaseDate", label: "حسب تاريخ الشراء" },
  { value: "quantity", label: "حسب إجمالي عدد البضائع" },
  { value: "cost", label: "حسب تكلفة الشراء (رأس المال)" },
  { value: "sales", label: "حسب إجمالي المشتريات" },
  { value: "profit", label: "حسب إجمالي الربح" },
  { value: "paid", label: "حسب إجمالي التسديد" },
  { value: "remaining", label: "حسب المبلغ المتبقي" },
  { value: "balanceStatus", label: "حسب حالة الحساب" },
  { value: "overdueOnly", label: "عليه مستحقات متأخرة" },
  { value: "activityDate", label: "حسب تاريخ آخر تعامل" },
  { value: "sellerName", label: "حسب اسم البائع" },
  { value: "paymentRecipient", label: "حسب مستلم التسديد" },
];
const emptyValueFilter = (): ValueFilter => ({ field: "all", value: "all", mode: "exact", exact: "", min: "", max: "", unit: "days" });
const periodFromDate = (date: string): PeriodFilter => ({ mode: "exact", on: date, from: date, to: date });
const formatAmount = (value: number, currency: string) => `${Math.round(value).toLocaleString("ar-IQ")} ${currency}`;

function dateKey(value?: string): string {
  if (!value) return "";
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${String(Number(dmy[2])).padStart(2, "0")}-${String(Number(dmy[1])).padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function defaultComparison(id: string, date: string): Comparison {
  return { id, metric: "sales", numeratorFilter: emptyValueFilter(), numeratorPeriod: periodFromDate(date), denominatorFilter: emptyValueFilter(), denominatorPeriod: periodFromDate(date) };
}

function periodBounds(period: PeriodFilter) {
  const from = period.mode === "exact" ? period.on : period.from;
  const to = period.mode === "exact" ? period.on : period.to;
  return { from, to, label: period.mode === "exact" ? `في ${period.on || "تاريخ غير محدد"}` : `من ${period.from || "…"} إلى ${period.to || "…"}` };
}

function isFinancialItem(item: Invoice["items"][number]) {
  return !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow;
}

interface PercentageCalculatorProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  products: Product[];
  folders: CustomerFolder[];
  currency: string;
}

export default function PercentageCalculator({ customers, invoices, payments, products, folders, currency }: PercentageCalculatorProps) {
  const productById = useMemo(() => new Map(products.filter(product => !product.isDeleted).map(product => [product.id, product])), [products]);
  const activeInvoices = useMemo(() => invoices.filter(invoice => !invoice.isDeleted), [invoices]);
  const activePayments = useMemo(() => payments.filter(payment => !payment.isDeleted), [payments]);
  const latestDate = useMemo(() => {
    const dates = [...activeInvoices.map(item => dateKey(item.date)), ...activePayments.map(item => dateKey(item.date))].filter(Boolean).sort();
    return dates.at(-1) || new Date().toISOString().slice(0, 10);
  }, [activeInvoices, activePayments]);
  const [comparisons, setComparisons] = useState<Comparison[]>(() => [defaultComparison("ratio-1", latestDate)]);
  const today = new Date().toISOString().slice(0, 10);

  const availableValues = useMemo(() => {
    const distinct = (values: Array<string | undefined>) => [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ar"));
    return {
      folderId: [{ value: "root", label: "المجلد الرئيسي" }, ...folders.filter(folder => !folder.isDeleted).map(folder => ({ value: folder.id, label: folder.name }))],
      address: distinct(customers.map(customer => customer.address)).map(value => ({ value, label: value })),
      occupation: distinct(customers.map(customer => customer.profile?.occupation || customer.profile?.profession)).map(value => ({ value, label: value })),
      salaryStatus: [
        ...(customers.some(customer => customer.hasSalary === true) ? [{ value: "yes", label: "لديه راتب" }] : []),
        ...(customers.some(customer => customer.hasSalary === false) ? [{ value: "no", label: "بدون راتب" }] : []),
        ...(customers.some(customer => customer.hasSalary == null) ? [{ value: "unknown", label: "غير محدد" }] : []),
      ],
      salaryType: distinct(customers.filter(customer => !customer.isDeleted).map(customer => customer.salaryType)).map(value => ({ value, label: value })),
      purchaseDate: [{ value: "yes", label: "لديه مشتريات ضمن الفترة" }, { value: "no", label: "لا توجد مشتريات ضمن الفترة" }],
      activityDate: [{ value: "yes", label: "لديه تعامل ضمن الفترة" }, { value: "no", label: "لا يوجد تعامل ضمن الفترة" }],
      balanceStatus: [
        ...(customers.some(customer => activeInvoices.some(invoice => invoice.customerId === customer.id && Number(invoice.remainingAmount) > 0)) ? [{ value: "owing", label: "عليه مبلغ" }] : []),
        ...(customers.some(customer => !activeInvoices.some(invoice => invoice.customerId === customer.id && Number(invoice.remainingAmount) > 0)) ? [{ value: "settled", label: "مسدد بالكامل" }] : []),
      ],
      overdueOnly: [
        ...(activeInvoices.some(invoice => Number(invoice.remainingAmount) > 0 && invoice.dueDate && invoice.dueDate < today) ? [{ value: "yes", label: "عليه مستحقات متأخرة" }] : []),
        ...(activeInvoices.some(invoice => !(Number(invoice.remainingAmount) > 0 && invoice.dueDate && invoice.dueDate < today)) ? [{ value: "no", label: "لا توجد مستحقات متأخرة" }] : []),
      ],
      sellerName: distinct(activeInvoices.flatMap(invoice => [invoice.employeeName, ...invoice.items.map(item => (item as typeof item & { sellerName?: string }).sellerName)])).map(value => ({ value, label: value })),
      paymentRecipient: distinct([
        ...activePayments.flatMap(payment => {
          const extra = payment as Payment & { recipient?: string; recipientName?: string; receivedBy?: string; sellerName?: string };
          return [extra.recipient, extra.recipientName, extra.receivedBy, extra.sellerName];
        }),
        ...activeInvoices.flatMap(invoice => invoice.items.filter(item => item.isSeparator && Number(item.paidAmount) > 0).flatMap(item => {
          const extra = item as typeof item & { recipient?: string; recipientName?: string; receivedBy?: string; sellerName?: string };
          return [extra.recipient, extra.recipientName, extra.receivedBy, extra.sellerName];
        })),
      ]).map(value => ({ value, label: value })),
    };
  }, [customers, folders, activeInvoices, activePayments, today]);

  const customerTotals = (customerId: string, from: string, to: string): CustomerTotals => {
    const inRange = (value?: string) => {
      const date = dateKey(value);
      return !!date && !!from && !!to && date >= from && date <= to;
    };
    const customerInvoices = activeInvoices.filter(invoice => invoice.customerId === customerId && inRange(invoice.date));
    const currentBalance = activeInvoices.filter(invoice => invoice.customerId === customerId).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.remainingAmount ?? ((Number(invoice.grandTotal) || 0) - (Number(invoice.paidAmount) || 0))) || 0), 0);
    const customerPayments = activePayments.filter(payment => payment.customerId === customerId && inRange(payment.date));
    const sales = customerInvoices.reduce((sum, invoice) => sum + (Number(invoice.grandTotal) || 0), 0);
    const paymentsTotal = customerPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const remaining = customerInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.remainingAmount ?? ((Number(invoice.grandTotal) || 0) - (Number(invoice.paidAmount) || 0))) || 0), 0);
    const items = customerInvoices.flatMap(invoice => invoice.items.filter(isFinancialItem).map(item => ({ item, invoice })));
    let profit = 0;
    let cost = 0;
    let quantity = 0;
    let missingCostItems = 0;
    items.forEach(({ item }) => {
      const qty = Number(item.quantity) || 0;
      const lineTotal = Number(item.total) || qty * (Number(item.unitPrice) || 0);
      const product = item.productId ? productById.get(item.productId) : undefined;
      const unitCost = item.unitCost != null && Number.isFinite(Number(item.unitCost)) ? Number(item.unitCost) : product?.purchasePrice;
      quantity += qty;
      if (unitCost == null || !Number.isFinite(Number(unitCost))) { missingCostItems += 1; return; }
      cost += Number(unitCost) * qty;
      profit += lineTotal - Number(unitCost) * qty;
    });
    const sellers = [...new Set(customerInvoices.flatMap(invoice => [invoice.employeeName, ...invoice.items.map(item => (item as typeof item & { sellerName?: string }).sellerName)]).filter((value): value is string => Boolean(value?.trim())))];
    const recipients = [...new Set([
      ...customerPayments.flatMap(payment => {
        const extra = payment as Payment & { recipient?: string; recipientName?: string; receivedBy?: string; sellerName?: string };
        return [extra.recipient, extra.recipientName, extra.receivedBy, extra.sellerName];
      }),
      ...customerInvoices.flatMap(invoice => invoice.items.filter(item => item.isSeparator && Number(item.paidAmount) > 0).flatMap(item => {
        const extra = item as typeof item & { recipient?: string; recipientName?: string; receivedBy?: string; sellerName?: string };
        return [extra.recipient, extra.recipientName, extra.receivedBy, extra.sellerName];
      })),
    ] .filter((value): value is string => Boolean(value?.trim())))];
    const overdue = activeInvoices.some(invoice => invoice.customerId === customerId && Number(invoice.remainingAmount) > 0 && invoice.dueDate && invoice.dueDate < today);
    return { sales, payments: paymentsTotal, remaining, currentBalance, profit, quantity, cost: missingCostItems ? null : cost, missingCostItems, sellers, recipients, overdue, hasPurchase: customerInvoices.length > 0, hasActivity: customerInvoices.length > 0 || customerPayments.length > 0 };
  };

  const matchesNumber = (amount: number | null, filter: ValueFilter) => {
    if (amount == null) return false;
    if (filter.mode === "exact") return filter.exact !== "" && Math.abs(amount - Number(filter.exact)) < 0.01;
    const minOk = filter.min === "" || amount >= Number(filter.min);
    const maxOk = filter.max === "" || amount <= Number(filter.max);
    return (filter.min !== "" || filter.max !== "") && minOk && maxOk;
  };

  const matchesFilter = (customer: Customer, filter: ValueFilter, totals: CustomerTotals) => {
    if (filter.field === "all") return true;
    if (filter.value === "all" && filter.field !== "quantity" && filter.field !== "cost" && filter.field !== "sales" && filter.field !== "profit" && filter.field !== "paid" && filter.field !== "remaining" && filter.field !== "relationship") return true;
    const customerAddress = customer.address?.trim() || "";
    const occupation = (customer.profile?.occupation || customer.profile?.profession || "").trim();
    switch (filter.field) {
      case "folderId": return (customer.folderId || "root") === filter.value;
      case "address": return customerAddress === filter.value;
      case "occupation": return occupation === filter.value;
      case "salaryStatus": return filter.value === "yes" ? customer.hasSalary === true : filter.value === "no" ? customer.hasSalary === false : customer.hasSalary == null;
      case "salaryType": return (customer.salaryType || "").trim() === filter.value;
      case "purchaseDate": return filter.value === "yes" ? totals.hasPurchase : !totals.hasPurchase;
      case "activityDate": return filter.value === "yes" ? totals.hasActivity : !totals.hasActivity;
      case "quantity": return matchesNumber(totals.quantity, filter);
      case "cost": return matchesNumber(totals.cost, filter);
      case "sales": return matchesNumber(totals.sales, filter);
      case "profit": return matchesNumber(totals.missingCostItems ? null : totals.profit, filter);
      case "paid": return matchesNumber(totals.payments, filter);
      case "remaining": return matchesNumber(totals.remaining, filter);
      case "balanceStatus": return filter.value === "owing" ? totals.currentBalance > 0 : totals.currentBalance <= 0;
      case "overdueOnly": return filter.value === "yes" ? totals.overdue : !totals.overdue;
      case "sellerName": return totals.sellers.includes(filter.value);
      case "paymentRecipient": return totals.recipients.includes(filter.value);
      case "relationship": {
        const dates = activeInvoices.filter(invoice => invoice.customerId === customer.id).map(invoice => dateKey(invoice.date)).filter(Boolean).sort();
        if (!dates.length) return false;
        const elapsedDays = Math.floor((Date.now() - new Date(`${dates[0]}T00:00:00`).getTime()) / 86400000);
        const duration = filter.unit === "years" ? elapsedDays / 365.25 : filter.unit === "months" ? elapsedDays / 30.44 : elapsedDays;
        return matchesNumber(duration, filter);
      }
      default: return false;
    }
  };

  const calculate = (metric: Metric, filter: ValueFilter, period: PeriodFilter) => {
    const bounds = periodBounds(period);
    if (!bounds.from || !bounds.to || bounds.from > bounds.to) return { total: 0, missingCostItems: 0 };
    const customersForPeriod = customers.filter(customer => !customer.isDeleted).map(customer => ({ customer, totals: customerTotals(customer.id, bounds.from, bounds.to) }));
    const included = customersForPeriod.filter(row => matchesFilter(row.customer, filter, row.totals));
    const total = included.reduce((sum, row) => sum + row.totals[metric], 0);
    const missingCostItems = metric === "profit" ? included.reduce((sum, row) => sum + row.totals.missingCostItems, 0) : 0;
    return { total, missingCostItems };
  };

  const updateComparison = (id: string, patch: Partial<Comparison>) => setComparisons(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const updateFilter = (id: string, side: "numerator" | "denominator", patch: Partial<ValueFilter>) => setComparisons(current => current.map(item => {
    if (item.id !== id) return item;
    const key = side === "numerator" ? "numeratorFilter" : "denominatorFilter";
    return { ...item, [key]: { ...item[key], ...patch } };
  }));
  const updatePeriod = (id: string, side: "numerator" | "denominator", patch: Partial<PeriodFilter>) => setComparisons(current => current.map(item => {
    if (item.id !== id) return item;
    const key = side === "numerator" ? "numeratorPeriod" : "denominatorPeriod";
    return { ...item, [key]: { ...item[key], ...patch } };
  }));
  const addComparison = () => setComparisons(current => [...current, defaultComparison(`ratio-${Date.now()}-${current.length}`, latestDate)]);

  const renderFilterEditor = (comparison: Comparison, side: "numerator" | "denominator", filter: ValueFilter) => {
    const numeric = ["quantity", "cost", "sales", "profit", "paid", "remaining", "relationship"].includes(filter.field);
    if (!numeric) {
      const options = availableValues[filter.field as keyof typeof availableValues] || [];
      return <label className="block text-xs font-semibold text-slate-600">القيمة
        <select value={filter.value} onChange={event => updateFilter(comparison.id, side, { value: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
          <option value="all">الكل</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>;
    }
    const label = filterFields.find(item => item.value === filter.field)?.label || "القيمة";
    return <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">طريقة التصفية
          <select value={filter.mode} onChange={event => updateFilter(comparison.id, side, { mode: event.target.value as "exact" | "range", exact: "", min: "", max: "" })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
            <option value="exact">يساوي</option><option value="range">من — إلى</option>
          </select>
        </label>
        {filter.field === "relationship" && <label className="block text-xs font-semibold text-slate-600">الوحدة
          <select value={filter.unit} onChange={event => updateFilter(comparison.id, side, { unit: event.target.value as ValueFilter["unit"] })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
            <option value="days">أيام</option><option value="months">أشهر</option><option value="years">سنوات</option>
          </select>
        </label>}
      </div>
      {filter.mode === "range" ? <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-semibold text-slate-600">من<input type="number" min="0" value={filter.min} onChange={event => updateFilter(comparison.id, side, { min: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800" /></label>
        <label className="block text-xs font-semibold text-slate-600">إلى<input type="number" min="0" value={filter.max} onChange={event => updateFilter(comparison.id, side, { max: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800" /></label>
      </div> : <label className="block text-xs font-semibold text-slate-600">{label} يساوي<input type="number" min="0" value={filter.exact} onChange={event => updateFilter(comparison.id, side, { exact: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800" /></label>}
    </div>;
  };

  const renderPeriodEditor = (comparison: Comparison, side: "numerator" | "denominator", period: PeriodFilter) => (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <label className="block text-xs font-semibold text-slate-700">الفترة الزمنية المحددة
        <select value={period.mode} onChange={event => updatePeriod(comparison.id, side, { mode: event.target.value as "exact" | "range" })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
          <option value="exact">في تاريخ محدد</option><option value="range">خلال فترة زمنية</option>
        </select>
      </label>
      {period.mode === "exact" ? <label className="block text-xs font-semibold text-slate-600">التاريخ
        <input type="date" value={period.on} onChange={event => updatePeriod(comparison.id, side, { on: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800" />
      </label> : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">من تاريخ<input type="date" value={period.from} onChange={event => updatePeriod(comparison.id, side, { from: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800" /></label>
        <label className="block text-xs font-semibold text-slate-600">إلى تاريخ<input type="date" value={period.to} onChange={event => updatePeriod(comparison.id, side, { to: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800" /></label>
      </div>}
    </div>
  );

  const describeFilter = (filter: ValueFilter) => {
    if (filter.field === "all") return "كل العملاء";
    const label = filterFields.find(item => item.value === filter.field)?.label || "التصفية";
    if (["quantity", "cost", "sales", "profit", "paid", "remaining", "relationship"].includes(filter.field)) {
      const unit = filter.field === "relationship" ? ` ${filter.unit === "days" ? "يوم" : filter.unit === "months" ? "شهر" : "سنة"}` : "";
      return filter.mode === "range" ? `${label} من ${filter.min || "…"} إلى ${filter.max || "…"}${unit}` : `${label} يساوي ${filter.exact || "…"}${unit}`;
    }
    const options = availableValues[filter.field as keyof typeof availableValues] || [];
    const valueLabel = filter.value === "all" ? "الكل" : options.find(option => option.value === filter.value)?.label || filter.value;
    return `${label}: ${valueLabel}`;
  };

  return (
    <section className="space-y-4" dir="rtl">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-l from-indigo-50 via-white to-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700"><Percent className="h-5 w-5" /></span>
            <div><h2 className="text-base font-extrabold text-slate-900 sm:text-lg">حساب النسب</h2><p className="mt-1 text-xs leading-5 text-slate-600">احسب نسبة مبلغ من مجموعة عملاء وفترة محددتين، مقارنةً بمجموعة وفترة أخرى.</p></div>
          </div>
          <button type="button" onClick={addComparison} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />إضافة حساب نسبة</button>
        </div>
      </header>

      {comparisons.map((comparison, index) => {
        const numeratorBounds = periodBounds(comparison.numeratorPeriod);
        const denominatorBounds = periodBounds(comparison.denominatorPeriod);
        const numerator = calculate(comparison.metric, comparison.numeratorFilter, comparison.numeratorPeriod);
        const denominator = calculate(comparison.metric, comparison.denominatorFilter, comparison.denominatorPeriod);
        const result = denominator.total !== 0 ? numerator.total / denominator.total * 100 : null;
        return (
          <article key={comparison.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-extrabold text-slate-800">حساب النسبة {index + 1}</h3>
              {comparisons.length > 1 && <button type="button" onClick={() => setComparisons(current => current.filter(item => item.id !== comparison.id))} aria-label={`حذف حساب النسبة ${index + 1}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />حذف</button>}
            </div>
            <label className="block max-w-sm text-sm font-bold text-slate-700">نوع الحساب
              <select value={comparison.metric} onChange={event => updateComparison(comparison.id, { metric: event.target.value as Metric })} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800">
                {(Object.entries(metricLabels) as [Metric, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {(["numerator", "denominator"] as const).map(side => {
                const filter = side === "numerator" ? comparison.numeratorFilter : comparison.denominatorFilter;
                const period = side === "numerator" ? comparison.numeratorPeriod : comparison.denominatorPeriod;
                return <div key={side} className="space-y-3 rounded-xl bg-slate-50 p-3">
                  <h4 className="text-sm font-bold text-slate-800">{side === "numerator" ? "المبلغ الذي أريد معرفة نسبته" : "مقارنةً بمبلغ"}</h4>
                  <label className="block text-xs font-semibold text-slate-700">نوع التصفية
                    <select value={filter.field} onChange={event => updateFilter(comparison.id, side, { ...emptyValueFilter(), field: event.target.value as FilterField })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
                      {filterFields.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
                    </select>
                  </label>
                  {renderFilterEditor(comparison, side, filter)}
                  {renderPeriodEditor(comparison, side, period)}
                </div>;
              })}
            </div>
            <div className="rounded-xl bg-indigo-50 p-3" aria-live="polite">
              <div className="text-2xl font-extrabold tabular-nums text-indigo-800">{result == null ? "—" : `${result.toLocaleString("ar-IQ", { maximumFractionDigits: 2 })}٪`}</div>
              <p className="mt-1 break-words text-sm leading-6 text-slate-700">{metricLabels[comparison.metric]} — {describeFilter(comparison.numeratorFilter)}، {numeratorBounds.label}: <strong>{formatAmount(numerator.total, currency)}</strong> من {metricLabels[comparison.metric]} — {describeFilter(comparison.denominatorFilter)}، {denominatorBounds.label}: <strong>{formatAmount(denominator.total, currency)}</strong>.</p>
              {result == null && <p className="mt-1 text-xs text-amber-800">ماكو مبلغ للمقارنة بالفترة المحددة؛ اختَر فترة أو نوع تصفية يحتوي بيانات.</p>}
              {comparison.metric === "profit" && (numerator.missingCostItems > 0 || denominator.missingCostItems > 0) && <p className="mt-1 text-xs text-amber-800">بعض البنود ما بيها تكلفة شراء محفوظة؛ ما دخلت بحساب الربح.</p>}
            </div>
          </article>
        );
      })}
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">خيارات نوع التصفية والقيم تُبنى من بيانات الحساب الحالية. الفواتير والتسديدات النشطة تُجمع ضمن الفترة المختارة، والربح يعتمد على تكلفة الشراء المحفوظة أو سعر شراء الصنف.</p>
    </section>
  );
}

