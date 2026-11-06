import { useMemo, useState } from "react";
import { Plus, Percent, Trash2 } from "lucide-react";
import { Customer, Invoice, Payment, Product } from "../types";

type Metric = "payments" | "sales" | "remaining" | "profit";
type Category = "all" | string;
type Granularity = "day" | "month" | "year";
type DateSelection = { granularity: Granularity; year: number; month: number; day: number };
type Comparison = {
  id: string;
  metric: Metric;
  numeratorCategory: Category;
  numeratorPeriod: DateSelection;
  denominatorCategory: Category;
  denominatorPeriod: DateSelection;
};

const metricLabels: Record<Metric, string> = {
  payments: "التسديدات",
  sales: "المبيعات",
  remaining: "المتبقي",
  profit: "الربح",
};
const monthLabels = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];

const formatAmount = (value: number, currency: string) => `${Math.round(value).toLocaleString("ar-IQ")} ${currency}`;
const normalizeArabic = (value: string) => value
  .toLowerCase()
  .replace(/[أإآ]/g, "ا")
  .replace(/ة/g, "ه")
  .replace(/ى/g, "ي")
  .replace(/[ًٌٍَُِّْـ]/g, "")
  .trim();

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

function categoryFor(customer?: Customer): Category {
  const salary = customer?.salaryType?.trim();
  if (salary) return salary;
  return customer?.hasSalary === false ? "بدون راتب" : "غير محدد";
}

function defaultComparison(id: string, category: Category, date: DateSelection): Comparison {
  return {
    id,
    metric: "sales",
    numeratorCategory: category,
    numeratorPeriod: { ...date },
    denominatorCategory: "all",
    denominatorPeriod: { ...date },
  };
}

function dateSelectionRange(selection: DateSelection) {
  const year = selection.year;
  const month = selection.month;
  const day = selection.day;
  if (selection.granularity === "year") return { start: `${year}-01-01`, end: `${year}-12-31`, label: String(year) };
  if (selection.granularity === "month") {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start, end, label: `${month}/${year}` };
  }
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { start: date, end: date, label: `يوم ${day}/${month}/${year}` };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function financialProfit(invoice: Invoice, productById: Map<string, Product>) {
  let total = 0;
  let missingCostItems = 0;
  for (const item of invoice.items || []) {
    if (item.isSeparator || item.isPaymentRow || item.isRemainingRow) continue;
    const quantity = Number(item.quantity) || 0;
    const lineTotal = Number(item.total) || quantity * (Number(item.unitPrice) || 0);
    const linkedProduct = item.productId ? productById.get(item.productId) : undefined;
    const cost = item.unitCost != null && Number.isFinite(Number(item.unitCost))
      ? Number(item.unitCost)
      : linkedProduct?.purchasePrice;
    if (cost == null || !Number.isFinite(Number(cost))) {
      missingCostItems += 1;
      continue;
    }
    total += lineTotal - Number(cost) * quantity;
  }
  return { total, missingCostItems };
}

interface PercentageCalculatorProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  products: Product[];
  currency: string;
}

export default function PercentageCalculator({ customers, invoices, payments, products, currency }: PercentageCalculatorProps) {
  const customerById = useMemo(() => new Map(customers.filter(customer => !customer.isDeleted).map(customer => [customer.id, customer])), [customers]);
  const productById = useMemo(() => new Map(products.filter(product => !product.isDeleted).map(product => [product.id, product])), [products]);
  const activeInvoices = useMemo(() => invoices.filter(invoice => !invoice.isDeleted), [invoices]);
  const activePayments = useMemo(() => payments.filter(payment => !payment.isDeleted), [payments]);
  const availableCategories = useMemo(() => {
    const distinct = new Map<string, string>();
    customers.filter(customer => !customer.isDeleted).forEach(customer => {
      const label = categoryFor(customer);
      const key = normalizeArabic(label);
      if (!distinct.has(key)) distinct.set(key, label);
    });
    return [...distinct.values()].sort((a, b) => a.localeCompare(b, "ar"));
  }, [customers]);
  const years = useMemo(() => {
    const dataYears = [...activeInvoices.map(item => dateKey(item.date)), ...activePayments.map(item => dateKey(item.date))]
      .filter(Boolean).map(value => Number(value.slice(0, 4))).filter(Number.isFinite);
    const currentYear = new Date().getFullYear();
    const firstYear = Math.min(currentYear, ...dataYears);
    const lastYear = Math.max(currentYear, ...dataYears);
    return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  }, [activeInvoices, activePayments]);
  const defaultDate = useMemo<DateSelection>(() => {
    const dates = [...activeInvoices.map(item => dateKey(item.date)), ...activePayments.map(item => dateKey(item.date))].filter(Boolean).sort();
    const latest = dates.at(-1) || new Date().toISOString().slice(0, 10);
    const [year, month, day] = latest.split("-").map(Number);
    return { granularity: "month", year, month, day };
  }, [activeInvoices, activePayments]);
  const [comparisons, setComparisons] = useState<Comparison[]>(() => [defaultComparison("ratio-1", availableCategories[0] || "all", defaultDate)]);

  const calculate = (metric: Metric, category: Category, selection: DateSelection) => {
    const period = dateSelectionRange(selection);
    const matches = (customerId: string) => category === "all" || categoryFor(customerById.get(customerId)) === category;
    const inPeriod = (date?: string) => {
      const key = dateKey(date);
      return !!key && key >= period.start && key <= period.end;
    };
    if (metric === "payments") {
      const total = activePayments.reduce((sum, payment) => sum + (matches(payment.customerId) && inPeriod(payment.date) ? Number(payment.amount) || 0 : 0), 0);
      return { total, missingCostItems: 0 };
    }
    let total = 0;
    let missingCostItems = 0;
    for (const invoice of activeInvoices) {
      if (!matches(invoice.customerId) || !inPeriod(invoice.date)) continue;
      if (metric === "sales") total += Number(invoice.grandTotal) || 0;
      if (metric === "remaining") total += Math.max(0, Number(invoice.remainingAmount ?? ((Number(invoice.grandTotal) || 0) - (Number(invoice.paidAmount) || 0))) || 0);
      if (metric === "profit") {
        const profit = financialProfit(invoice, productById);
        total += profit.total;
        missingCostItems += profit.missingCostItems;
      }
    }
    return { total, missingCostItems };
  };

  const update = (id: string, field: "metric" | "numeratorCategory" | "denominatorCategory", value: string) => {
    setComparisons(current => current.map(item => item.id === id ? { ...item, [field]: value } as Comparison : item));
  };
  const updateDate = (id: string, side: "numerator" | "denominator", field: keyof DateSelection, value: string) => {
    setComparisons(current => current.map(item => {
      if (item.id !== id) return item;
      const key = side === "numerator" ? "numeratorPeriod" : "denominatorPeriod";
      const oldDate = item[key];
      const nextDate = { ...oldDate, [field]: field === "granularity" ? value : Number(value) } as DateSelection;
      nextDate.day = Math.min(nextDate.day, daysInMonth(nextDate.year, nextDate.month));
      return { ...item, [key]: nextDate };
    }));
  };
  const addComparison = () => setComparisons(current => [...current, defaultComparison(`ratio-${Date.now()}-${current.length}`, availableCategories[0] || "all", defaultDate)]);

  const categoryOptions = ["all", ...availableCategories].map(category => <option key={category} value={category}>{category === "all" ? "كل الفئات" : category}</option>);
  const renderDateControls = (comparison: Comparison, side: "numerator" | "denominator", selection: DateSelection) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="block text-xs font-semibold text-slate-600">نوع الفترة
        <select value={selection.granularity} onChange={event => updateDate(comparison.id, side, "granularity", event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
          <option value="day">يوم</option><option value="month">شهر</option><option value="year">سنة</option>
        </select>
      </label>
      {selection.granularity === "day" && <label className="block text-xs font-semibold text-slate-600">اليوم
        <select value={selection.day} onChange={event => updateDate(comparison.id, side, "day", event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
          {Array.from({ length: daysInMonth(selection.year, selection.month) }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select>
      </label>}
      {selection.granularity !== "year" && <label className="block text-xs font-semibold text-slate-600">الشهر
        <select value={selection.month} onChange={event => updateDate(comparison.id, side, "month", event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
          {monthLabels.map((label, index) => <option key={index + 1} value={index + 1}>{label}</option>)}
        </select>
      </label>}
      <label className="block text-xs font-semibold text-slate-600">السنة
        <select value={selection.year} onChange={event => updateDate(comparison.id, side, "year", event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
          {years.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
    </div>
  );

  return (
    <section className="space-y-4" dir="rtl">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-l from-indigo-50 via-white to-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700"><Percent className="h-5 w-5" /></span>
            <div><h2 className="text-base font-extrabold text-slate-900 sm:text-lg">حساب النسب</h2><p className="mt-1 text-xs leading-5 text-slate-600">احسب نسبة مبلغ فئة وفترة محددتين من مبلغ فئة وفترة أخرى، باستخدام الفواتير والتسديدات المحفوظة.</p></div>
          </div>
          <button type="button" onClick={addComparison} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />إضافة حساب نسبة</button>
        </div>
      </header>

      {comparisons.map((comparison, index) => {
        const numerator = calculate(comparison.metric, comparison.numeratorCategory, comparison.numeratorPeriod);
        const denominator = calculate(comparison.metric, comparison.denominatorCategory, comparison.denominatorPeriod);
        const result = denominator.total !== 0 ? numerator.total / denominator.total * 100 : null;
        const numPeriodLabel = dateSelectionRange(comparison.numeratorPeriod).label;
        const denPeriodLabel = dateSelectionRange(comparison.denominatorPeriod).label;
        return (
          <article key={comparison.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-extrabold text-slate-800">حساب النسبة {index + 1}</h3>
              {comparisons.length > 1 && <button type="button" onClick={() => setComparisons(current => current.filter(item => item.id !== comparison.id))} aria-label={`حذف حساب النسبة ${index + 1}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />حذف</button>}
            </div>
            <label className="block max-w-sm text-sm font-bold text-slate-700">نوع الحساب
              <select value={comparison.metric} onChange={event => update(comparison.id, "metric", event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800">
                {(Object.entries(metricLabels) as [Metric, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <h4 className="text-sm font-bold text-slate-800">المبلغ الذي أريد معرفة نسبته</h4>
                <label className="block text-xs font-semibold text-slate-600">الفئة
                  <select value={comparison.numeratorCategory} onChange={event => update(comparison.id, "numeratorCategory", event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">{categoryOptions}</select>
                </label>
                {renderDateControls(comparison, "numerator", comparison.numeratorPeriod)}
              </div>
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <h4 className="text-sm font-bold text-slate-800">مقارنةً بمبلغ</h4>
                <label className="block text-xs font-semibold text-slate-600">الفئة
                  <select value={comparison.denominatorCategory} onChange={event => update(comparison.id, "denominatorCategory", event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">{categoryOptions}</select>
                </label>
                {renderDateControls(comparison, "denominator", comparison.denominatorPeriod)}
              </div>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3" aria-live="polite">
              <div className="text-2xl font-extrabold tabular-nums text-indigo-800">{result == null ? "—" : `${result.toLocaleString("ar-IQ", { maximumFractionDigits: 2 })}٪`}</div>
              <p className="mt-1 break-words text-sm leading-6 text-slate-700">{metricLabels[comparison.metric]} {comparison.numeratorCategory === "all" ? "كل الفئات" : comparison.numeratorCategory} في {numPeriodLabel}: <strong>{formatAmount(numerator.total, currency)}</strong> من {metricLabels[comparison.metric]} {comparison.denominatorCategory === "all" ? "كل الفئات" : comparison.denominatorCategory} في {denPeriodLabel}: <strong>{formatAmount(denominator.total, currency)}</strong>.</p>
              {result == null && <p className="mt-1 text-xs text-amber-800">لا توجد قيمة للمقارنة في الفترة والفئة المختارتين.</p>}
              {comparison.metric === "profit" && (numerator.missingCostItems > 0 || denominator.missingCostItems > 0) && <p className="mt-1 text-xs text-amber-800">بعض البنود لا تحتوي على تكلفة شراء محفوظة؛ لم تدخل في حساب الربح.</p>}
            </div>
          </article>
        );
      })}
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">الفئات تُستخرج تلقائيًا من أنواع الرواتب الموجودة ببيانات هذا الحساب؛ ما تظهر فئة ما عندك. المبيعات والمتبقي من الكشوف النشطة حسب تاريخ الكشف، والتسديدات من سندات القبض النشطة حسب تاريخها. المتبقي هو مجموع الأرصدة الحالية للكشوف الصادرة خلال الفترة.</p>
    </section>
  );
}
