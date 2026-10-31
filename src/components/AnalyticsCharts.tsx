import React, { useState } from "react";

export interface AnalyticsMoneyRecord {
  date: string;
  amount: number;
}

export interface AnalyticsRankItem {
  name: string;
  value: number;
  unit?: string;
}

const formatNumber = (value: number) => Math.round(value).toLocaleString("ar-IQ");

function monthParts(value: string): { year: number; month: number } | null {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Baghdad",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return year && month ? { year, month } : null;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function MonthlyFinanceChart({
  sales,
  collections,
  months = 6,
  title = "حركة المبالغ والتسديدات",
  description,
  currency,
}: {
  sales: AnalyticsMoneyRecord[];
  collections: AnalyticsMoneyRecord[];
  months?: 6 | 12;
  title?: string;
  description?: string;
  currency: string;
}) {
  const current = monthParts(new Date().toISOString());
  const buckets = Array.from({ length: months }, (_, index) => {
    const offset = months - index - 1;
    const date = new Date(Date.UTC(current?.year || 2026, (current?.month || 1) - 1 - offset, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const key = monthKey(year, month);
    return {
      key,
      label: new Intl.DateTimeFormat("ar-IQ", { month: "short", timeZone: "UTC" }).format(date),
      sales: 0,
      collections: 0,
    };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  sales.forEach((record) => {
    const parts = monthParts(record.date);
    const bucket = parts && byKey.get(monthKey(parts.year, parts.month));
    if (bucket && Number.isFinite(record.amount)) bucket.sales += record.amount;
  });
  collections.forEach((record) => {
    const parts = monthParts(record.date);
    const bucket = parts && byKey.get(monthKey(parts.year, parts.month));
    if (bucket && Number.isFinite(record.amount)) bucket.collections += record.amount;
  });
  const peak = Math.max(0, ...buckets.flatMap((bucket) => [bucket.sales, bucket.collections]));
  const hasRecords = buckets.some((bucket) => bucket.sales > 0 || bucket.collections > 0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const selected = buckets.find((bucket) => bucket.key === selectedMonth);

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description || `حسب تاريخ التسجيل خلال آخر ${months} أشهر`}</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600" aria-label="مفتاح المخطط">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />المبالغ</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />التسديدات</span>
        </div>
      </div>
      {!hasRecords ? (
        <div className="flex min-h-36 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-xs text-slate-500">
          لا توجد عمليات مؤرخة ضمن هذه الفترة لعرضها.
        </div>
      ) : (
        <div className="grid h-48 gap-1.5 sm:gap-3" style={{ gridTemplateColumns: `repeat(${months}, minmax(0, 1fr))` }} role="group" aria-label={`${title}، مقارنة شهرية بين المبالغ والتسديدات`}>
          {buckets.map((bucket) => (
            <button key={bucket.key} type="button" onClick={() => setSelectedMonth(selectedMonth === bucket.key ? null : bucket.key)} aria-pressed={selectedMonth === bucket.key} aria-label={`${bucket.label}: المبالغ ${formatNumber(bucket.sales)} ${currency}، التسديدات ${formatNumber(bucket.collections)} ${currency}`} className={`flex min-w-0 flex-col items-center justify-end gap-2 rounded-lg p-1 ${selectedMonth === bucket.key ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <div className="flex h-36 w-full items-end justify-center gap-1 rounded-t-lg border-b border-slate-200 bg-slate-50/70 px-1">
                <div
                  title={`المبالغ: ${formatNumber(bucket.sales)} ${currency}`}
                  className="min-h-0.5 w-2.5 max-w-[35%] rounded-t-md bg-indigo-500 transition-[height] sm:w-4"
                  style={{ height: bucket.sales > 0 ? `${Math.max(3, (bucket.sales / peak) * 100)}%` : "2px" }}
                />
                <div
                  title={`التسديدات: ${formatNumber(bucket.collections)} ${currency}`}
                  className="min-h-0.5 w-2.5 max-w-[35%] rounded-t-md bg-emerald-500 transition-[height] sm:w-4"
                  style={{ height: bucket.collections > 0 ? `${Math.max(3, (bucket.collections / peak) * 100)}%` : "2px" }}
                />
              </div>
              <span className="w-full truncate text-center text-[10px] font-semibold text-slate-500">{bucket.label}</span>
            </button>
          ))}
        </div>
      )}
      {selected && <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
        <span className="col-span-2 font-bold text-slate-700">{selected.label}</span>
        <span className="text-indigo-700">المبالغ: {formatNumber(selected.sales)} {currency}</span>
        <span className="text-emerald-700">التسديدات: {formatNumber(selected.collections)} {currency}</span>
      </div>}
      <p className="mt-2 text-[10px] text-slate-400">اضغط على أي شهر لعرض أرقامه. الشهر الحالي قد لا يكون مكتملاً.</p>
    </section>
  );
}

export function BalanceDonut({ paid, remaining, currency }: { paid: number; remaining: number; currency: string }) {
  const safePaid = Math.max(0, paid);
  const safeRemaining = Math.max(0, remaining);
  const total = safePaid + safeRemaining;
  const circumference = 2 * Math.PI * 38;
  const paidLength = total > 0 ? (safePaid / total) * circumference : 0;
  const percent = total > 0 ? Math.round((safePaid / total) * 100) : 0;
  return (
    <section className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="مقارنة التسديدات والمتبقي">
      <div className="relative h-24 w-24 shrink-0" role="img" aria-label={`تم تسديد ${percent} بالمئة من المبلغ المسجل`}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="38" fill="none" stroke="#e2e8f0" strokeWidth="12" />
          {total > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${paidLength} ${circumference - paidLength}`} />}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-slate-800">{percent}٪</span>
      </div>
      <div className="min-w-0 space-y-2">
        <h3 className="text-sm font-extrabold text-slate-800">التسديد والمتبقي</h3>
        <p className="text-xs text-slate-500">مقارنة إجمالي المسدد بالرصيد المتبقي من الكشوف.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-slate-500">المسدد</span><strong className="text-emerald-700">{formatNumber(safePaid)} {currency}</strong>
          <span className="text-slate-500">المتبقي</span><strong className="text-rose-700">{formatNumber(safeRemaining)} {currency}</strong>
        </div>
      </div>
    </section>
  );
}

export function RankingChart({ title, description, items, currency, color = "indigo" }: {
  title: string;
  description: string;
  items: AnalyticsRankItem[];
  currency?: string;
  color?: "indigo" | "rose" | "emerald";
}) {
  const maximum = Math.max(0, ...items.map((item) => item.value));
  const colors = {
    indigo: "bg-indigo-500",
    rose: "bg-rose-500",
    emerald: "bg-emerald-500",
  };
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4"><h3 className="text-sm font-extrabold text-slate-800">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div>
      {items.length === 0 ? <p className="rounded-xl bg-slate-50 py-10 text-center text-xs text-slate-500">لا توجد بيانات كافية للعرض.</p> : (
        <ol className="space-y-3">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="space-y-1.5">
              <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-700"><b className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500">{index + 1}</b><span className="truncate">{item.name}</span></span>
                <strong className="shrink-0 font-mono text-slate-800">{formatNumber(item.value)} {item.unit || currency || ""}</strong>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${colors[color]}`} style={{ width: `${maximum > 0 ? Math.max(2, item.value / maximum * 100) : 0}%` }} /></div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
