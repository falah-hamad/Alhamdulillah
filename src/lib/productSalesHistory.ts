import type { Customer, Invoice, Product } from "../types";

export interface ProductSaleRow {
  id: string;
  customerName: string;
  quantity: number;
  unit: string;
  capital: number | null;
  sales: number;
  profit: number | null;
  timestamp: string;
}

const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Derive current sales from saved ledger rows; stock audit events are never added again. */
export function getProductSalesHistory(product: Product, invoices: Invoice[], customers: Customer[]): ProductSaleRow[] {
  const result: ProductSaleRow[] = [];
  const customerById = new Map(customers.map(customer => [customer.id, customer]));
  const append = (row: { id: string; productId?: string; quantity: number; unitCost?: number; unitPrice: number; total: number; isSeparator?: boolean; isPaymentRow?: boolean; isRemainingRow?: boolean; isDeleted?: boolean; createdAt?: string; unit?: string; unitName?: string }, sourceId: string, customerName: string, date: string, unitCostFallback: number | null = null) => {
    if (row.productId !== product.id || row.isSeparator || row.isPaymentRow || row.isRemainingRow || row.isDeleted) return;
    const quantity = numeric(row.quantity) ?? 0;
    const sales = numeric(row.total) ?? quantity * (numeric(row.unitPrice) ?? 0);
    if (quantity === 0 && sales === 0) return;
    const unitCost = numeric(row.unitCost) ?? unitCostFallback;
    const capital = unitCost === null ? null : unitCost * quantity;
    result.push({ id: `${sourceId}:${row.id}`, customerName: customerName || "غير مسجل", quantity, unit: row.unit || row.unitName || product.unitName || "قطعة", capital, sales, profit: capital === null ? null : sales - capital, timestamp: row.createdAt || date });
  };
  for (const invoice of invoices) {
    const customer = customerById.get(invoice.customerId);
    if (invoice.isDeleted || customer?.isDeleted) continue;
    // A legacy stock event can supply recorded cost, but never current purchase prices.
    const recordedCosts = new Set((product.stockMovements || []).filter(movement => movement.type === "sale" && movement.referenceId === invoice.id).map(movement => numeric(movement.unitCost)).filter((cost): cost is number => cost !== null));
    const recordedCost = recordedCosts.size === 1 ? [...recordedCosts][0] : null;
    for (const row of Array.isArray(invoice.items) ? invoice.items : []) append(row, `invoice:${invoice.id}`, customer?.name || invoice.customerName, invoice.date || invoice.createdAt, recordedCost);
  }
  for (const customer of customers) {
    if (customer.isDeleted) continue;
    for (const row of Array.isArray(customer.accountingSheetRows) ? customer.accountingSheetRows : []) append(row, `accounting:${customer.id}`, customer.name, customer.accountingSheetDate || "");
  }
  return result.sort((left, right) => (Date.parse(right.timestamp) || 0) - (Date.parse(left.timestamp) || 0));
}

export function formatStockSaleTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (!timestamp || !Number.isFinite(date.getTime())) return "—";
  const options = { timeZone: "Asia/Baghdad" };
  const day = new Intl.DateTimeFormat("ar-IQ", { ...options, weekday: "long" }).format(date);
  const parts = new Intl.DateTimeFormat("en-GB", { ...options, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value || "";
  const time = new Intl.DateTimeFormat("en-US", { ...options, hour: "numeric", minute: "2-digit", hour12: true }).format(date).replace("AM", "ص").replace("PM", "م");
  return `${day} — ${part("year")}/${part("month")}/${part("day")} — ${time}`;
}
