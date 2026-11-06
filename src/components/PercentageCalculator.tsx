import { useMemo, useState } from "react";
import { Plus, Percent, Trash2 } from "lucide-react";
import { Customer, Invoice, Payment, Product } from "../types";

type Metric = "payments" | "sales" | "remaining" | "profit";
type Category = "all" | "الرعاية الاجتماعية" | "المتقاعدون" | "الشرطة" | "الجيش" | "فئات أخرى / غير محدد";
type Comparison = {
  id: string;
  metric: Metric;
  numeratorCategory: Category;
  numeratorPeriod: string;
  denominatorCategory: Category;
  denominatorPeriod: string;
};
type Period = { id: string; label: string; start: string; end: string };

const metricLabels: Record<Metric, string> = {
  payments: "التسديدات",
  sales: "المبيعات",
  remaining: "المتبقي",
  profit: "الربح",
};
const categories: Category[] = ["الرعاية الاجتماعية", "المتقاعدون", "الشرطة", "الجيش", "فئات أخرى / غير محدد"];
const allCategories: Category[] = ["all", ...categories];
const periods: Period[] = [
  ...Array.from({ length: 30 }, (_, index) => {
    const day = index + 1;
    const date = `2025-01-${String(day).padStart(2, "0")}`;
    return { id: `day:${date}`, label: `يوم ${day}/1/2025`, start: date, end: date };
  }),
  ...Array.from({ length: 11 }, (_, index) => {
    const month = index + 2;
    const start = `2025-${String(month).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(2025, month, 0)).toISOString().slice(0, 10);
    return { id: `month:${month}:2025`, label: `${month}/2025`, start, end };
  }),
  ...Array.from({ length: 5 }, (_, index) => {
    const year = 2026 + index;
    return { id: `year:${year}`, label: String(year), start: `${year}-01-01`, end: `${year}-12-31` };
  }),
];

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
  const salary = normalizeArabic(customer?.salaryType || "");
  if (salary.includes("رعايه")) return "الرعاية الاجتماعية";
  if (salary.includes("متقاعد") || salary.includes("تقاعد")) return "المتقاعدون";
  if (salary.includes("شرطه") || salary.includes("شرطي")) return "الشرطة";
  if (salary.includes("جيش") || salary.includes("عسكري") || salary.includes("دفاع")) return "الجيش";
  return "فئات أخرى / غير محدد";
}

function defaultComparison(id: string): Comparison {
  return {
    id,
    metric: "sales",
    numeratorCategory: "الرعاية الاجتماعية",
    numeratorPeriod: "day:2025-01-01",
    denominatorCategory: "all",
    denominatorPeriod: "day:2025-01-01",
  };
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
  const [comparisons, setComparisons] = useState<Comparison[]>([defaultComparison("ratio-1")]);
  const customerById = useMemo(() => new Map(customers.filter(customer => !customer.isDeleted).map(customer => [customer.id, customer])), [customers]);
  const productById = useMemo(() => new Map(products.filter(product => !product.isDeleted).map(product => [product.id, product])), [products]);
  const activeInvoices = useMemo(() => invoices.filter(invoice => !invoice.isDeleted), [invoices]);
  const activePayments = useMemo(() => payments.filter(payment => !payment.isDeleted), [payments]);

  const calculate = (metric: Metric, category: Category, periodId: string) => {
    const period = periods.find(item => item.id === periodId);
    if (!period) return { total: 0, missingCostItems: 0 };
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

  const update = (id: string, field: keyof Comparison, value: string) => {
    setComparisons(current => current.map(item => item.id === id ? { ...item, [field]: value } as Comparison : item));
  };
  const addComparison = () => setComparisons(current => [...current, defaultComparison(`ratio-${Date.now()}-${current.length}`)]);

  const categoryOptions = allCategories.map(category => <option key={category} value={category}>{category === "all" ? "كل الفئات" : category}</option>);
  const periodOptions = periods.map(period => <option key={period.id} value={period.id}>{period.label}</option>);

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
        const numPeriodLabel = periods.find(period => period.id === comparison.numeratorPeriod)?.label || "";
        const denPeriodLabel = periods.find(period => period.id === comparison.denominatorPeriod)?.label || "";
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
                <label className="block text-xs font-semibold text-slate-600">الفترة
                  <select value={comparison.numeratorPeriod} onChange={event => update(comparison.id, "numeratorPeriod", event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">{periodOptions}</select>
                </label>
              </div>
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <h4 className="text-sm font-bold text-slate-800">مقارنةً بمبلغ</h4>
                <label className="block text-xs font-semibold text-slate-600">الفئة
                  <select value={comparison.denominatorCategory} onChange={event => update(comparison.id, "denominatorCategory", event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">{categoryOptions}</select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">الفترة
                  <select value={comparison.denominatorPeriod} onChange={event => update(comparison.id, "denominatorPeriod", event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">{periodOptions}</select>
                </label>
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
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">المبيعات والمتبقي محسوبان من الكشوف النشطة حسب تاريخ الكشف، والتسديدات من سندات القبض النشطة حسب تاريخها. المتبقي هنا هو مجموع الأرصدة الحالية للكشوف الصادرة خلال الفترة. تصنيف الفئات يعتمد على نوع الراتب المسجل في ملف العميل.</p>
    </section>
  );
}
