import type { Customer, CustomerFolder, Invoice } from "../types";

const digits = (value: string) => value.replace(/[٠-٩۰-۹]/g, c => String("٠١٢٣٤٥٦٧٨٩".indexOf(c) >= 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(c) : "۰۱۲۳۴۵۶۷۸۹".indexOf(c)));
const plainName = (value: string) => digits(value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " "))
  .replace(/\(\s*\d+(?:[.,]\d+)?\s+[^()]+\)\s*$/, "").trim().replace(/\s+/g, " ");
const quantity = (row: { quantity: number; details: string }) => {
  // Vertical cart descriptions and manually typed rows can carry their unit count in parentheses.
  const match = digits(row.details).match(/\(\s*(\d+(?:\.\d+)?)\s+[^()]+\)\s*$/);
  const value = match ? Number(match[1]) : Number(row.quantity);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};
export function customerFolderPath(folderId: string | undefined, folders: CustomerFolder[]): string {
  const names: string[] = [];
  const visited = new Set<string>();
  let id = folderId;
  while (id) {
    if (visited.has(id)) { names.unshift("مسار مجلدات دائري"); break; }
    visited.add(id);
    const folder = folders.find(f => f.id === id);
    if (!folder) { names.unshift("مجلد غير متاح"); break; }
    names.unshift(folder.name);
    id = folder.parentId || undefined;
  }
  return ["سجل الديون (المجلد الرئيسي)", ...names].join(" / ");
}
export function customerPurchaseStats(customer: Customer, invoices: Invoice[]) {
  const rows = [
    ...invoices.filter(inv => inv.customerId === customer.id && !inv.isDeleted).flatMap(inv => inv.items),
    ...(customer.accountingSheetRows || []),
  ].filter(row => !row.isSeparator && !("isPaymentRow" in row && row.isPaymentRow) && !("isRemainingRow" in row && row.isRemainingRow)
    && (plainName(row.details || "") || Number(row.total) !== 0));
  const dates = rows.map(row => row.createdAt).filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value))).sort((a,b) => Date.parse(a) - Date.parse(b));
  const counts = new Map<string, number>();
  rows.forEach(row => { const name = plainName(row.details || ""); if (name) counts.set(name, (counts.get(name) || 0) + 1); });
  const ranked = [...counts].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"));
  const mostFrequent = ranked.filter(([,count]) => count === ranked[0]?.[1]);
  return { rows, first: dates[0], last: dates.at(-1), missingDates: rows.length - dates.length,
    totalQuantity: rows.reduce((sum,row) => sum + quantity(row), 0), mostFrequent, rowCount: rows.length };
}
export function purchaseDate(value: string | undefined): string {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat("ar-IQ", { weekday: "long", timeZone: "Asia/Baghdad" }).format(date);
  const time = new Intl.DateTimeFormat("ar-IQ", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Baghdad" }).format(date);
  const day = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Baghdad" }).format(date).replace(/-/g, "/");
  return `${weekday} — ${time} — ${day}`;
}
export function purchaseDuration(first: string | undefined, last: string | undefined): string {
  if (!first || !last) return "غير مسجلة";
  const parts = (value: string) => {
    const fields = new Intl.DateTimeFormat("en-CA", {year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Asia/Baghdad"}).formatToParts(new Date(value));
    return ["year","month","day"].map(type => Number(fields.find(p => p.type === type)!.value));
  };
  const [sy,sm,sd] = parts(first), [ey,em,ed] = parts(last);
  const start = Date.UTC(sy, sm - 1, sd), end = Date.UTC(ey, em - 1, ed);
  let months = (ey - sy) * 12 + em - sm;
  const anniversary = (n: number) => { const y = sy + Math.floor((sm - 1 + n) / 12), m = (sm - 1 + n) % 12; return Date.UTC(y,m,Math.min(sd,new Date(Date.UTC(y,m+1,0)).getUTCDate())); };
  if (anniversary(months) > end) months--;
  const days = Math.round((end - anniversary(months)) / 86400000);
  const fmt = (n: number) => n.toLocaleString("ar-IQ");
  return `${fmt(Math.floor(months / 12))} سنة، ${fmt(months % 12)} شهر، ${fmt(days)} يوم (الإجمالي: ${fmt(Math.round((end-start)/86400000))} يوم)`;
}
