import React, { useMemo, useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import type { Customer, CustomerFolder, Invoice, Payment, Product, Supplier } from "../types";
import { formatThousands } from "../utils/numberFormatting";

type EventKind = "sale" | "payment";
type LogEvent = {
  id: string;
  kind: EventKind;
  timestamp: string;
  person: string;
  address: string;
  product: string;
  quantity: number | null;
  amount: number;
  remainingAmount: number | null;
  source: string;
  sequence: number;
};
type Props = {
  customers: Customer[];
  folders: CustomerFolder[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  suppliers: Supplier[];
  currency: string;
};

const kindLabels: Record<EventKind, string> = { sale: "بيع", payment: "تسديد" };
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const dayKey = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }
  const match = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  return match ? match[3] + "-" + match[2].padStart(2, "0") + "-" + match[1].padStart(2, "0") : value.slice(0, 10);
};
const saleRow = (item: Invoice["items"][number]) => !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow;

export default function ActivityLogView({ customers, products, invoices, payments, currency }: Props) {
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(() => new Set());
  const customerById = useMemo(() => new Map(customers.map(customer => [customer.id, customer])), [customers]);
  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const invoiceById = useMemo(() => new Map(invoices.map(invoice => [invoice.id, invoice])), [invoices]);

  const events = useMemo<LogEvent[]>(() => {
    const saleEvents: LogEvent[] = [];
    invoices.filter(invoice => !invoice.isDeleted).forEach(invoice => {
      const customer = customerById.get(invoice.customerId);
      (invoice.items || []).filter(saleRow).forEach((item, index) => {
        const product = item.productId ? productById.get(item.productId) : undefined;
        saleEvents.push({
          id: "sale-" + invoice.id + "-" + item.id,
          kind: "sale",
          timestamp: invoice.createdAt || invoice.date,
          person: invoice.customerName || customer?.name || "عميل",
          address: invoice.customerAddress || customer?.address || "—",
          product: item.details || product?.name || "بضاعة",
          quantity: num(item.quantity),
          amount: num(item.total || item.unitPrice),
          remainingAmount: null,
          source: invoice.displayName || (invoice.invoiceNumber ? "كشف " + invoice.invoiceNumber : "كشف حساب"),
          sequence: index + 1,
        });
      });
    });

    const linkedPayments = new Map<string, Payment[]>();
    payments.filter(payment => !payment.isDeleted && payment.invoiceId).forEach(payment => {
      const list = linkedPayments.get(payment.invoiceId!) || [];
      list.push(payment);
      linkedPayments.set(payment.invoiceId!, list);
    });
    const remainingAfterPayment = new Map<string, number>();
    linkedPayments.forEach((invoicePayments, invoiceId) => {
      const invoice = invoiceById.get(invoiceId);
      if (!invoice) return;
      const recordedPayments = invoicePayments.reduce((sum, payment) => sum + num(payment.amount), 0);
      const initialPaidAmount = Math.max(0, num(invoice.paidAmount) - recordedPayments);
      let remaining = Math.max(0, num(invoice.grandTotal) - initialPaidAmount);
      [...invoicePayments].sort((a, b) => Date.parse(a.createdAt || a.date) - Date.parse(b.createdAt || b.date)).forEach(payment => {
        remaining = Math.max(0, remaining - num(payment.amount));
        remainingAfterPayment.set(payment.id, remaining);
      });
    });

    const paymentEvents: LogEvent[] = payments.filter(payment => !payment.isDeleted).map(payment => {
      const customer = customerById.get(payment.customerId);
      const invoice = payment.invoiceId ? invoiceById.get(payment.invoiceId) : undefined;
      return {
        id: "payment-" + payment.id,
        kind: "payment",
        timestamp: payment.createdAt || payment.date,
        person: payment.customerName || customer?.name || "عميل",
        address: customer?.address || "—",
        product: "—",
        quantity: null,
        amount: num(payment.amount),
        remainingAmount: remainingAfterPayment.get(payment.id) ?? null,
        source: invoice?.displayName || (invoice?.invoiceNumber ? "كشف " + invoice.invoiceNumber : "سجل الديون"),
        sequence: 0,
      };
    });

    const ordered = [...saleEvents, ...paymentEvents]
      .filter(event => !!event.timestamp)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const sequenceByDate = new Map<string, number>();
    return ordered.map(event => {
      const date = dayKey(event.timestamp);
      const sequence = (sequenceByDate.get(date) || 0) + 1;
      sequenceByDate.set(date, sequence);
      return { ...event, sequence };
    }).reverse();
  }, [customerById, invoiceById, invoices, payments, productById]);

  const dailyGroups = useMemo(() => {
    const groups = new Map<string, { sales: LogEvent[]; payments: LogEvent[] }>();
    events.forEach(event => {
      const date = dayKey(event.timestamp);
      if (!groups.has(date)) groups.set(date, { sales: [], payments: [] });
      const group = groups.get(date)!;
      if (event.kind === "sale") group.sales.push(event);
      else group.payments.push(event);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, group]) => ({ date, ...group }));
  }, [events]);

  const formatDate = (key: string) => {
    const parts = key.split("-");
    return parts.length === 3 ? parts[0] + "/" + parts[1] + "/" + parts[2] : key || "تاريخ غير محدد";
  };
  const formatTimestamp = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "—";
    return date.toLocaleDateString("ar-IQ", { weekday: "long" }) + " — " +
      date.toLocaleTimeString("ar-IQ", { hour: "numeric", minute: "2-digit" }) + " — " +
      formatDate(dayKey(value));
  };
  const money = (value: number | null) => value === null ? "—" : formatThousands(value) + " " + currency;
  const tableClass = "w-max min-w-full border-collapse text-right text-xs sm:text-sm whitespace-nowrap";
  const headClass = "border border-amber-300 bg-amber-100 px-2 py-2.5 font-extrabold text-slate-800";
  const cellClass = "border border-slate-300 px-2 py-2 text-slate-800 align-top";
  const renderTable = (kind: EventKind, rows: LogEvent[]) => {
    const isSale = kind === "sale";
    return (
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={headClass}>الطابع الزمني</th>
              <th className={headClass}>نوع الحركة</th>
              <th className={headClass}>اسم العميل</th>
              <th className={headClass}>العنوان</th>
              {isSale ? (
                <>
                  <th className={headClass}>اسم البضاعة</th>
                  <th className={headClass}>الكمية</th>
                  <th className={headClass}>المبلغ</th>
                </>
              ) : (
                <>
                  <th className={headClass}>المبلغ المسدد</th>
                  <th className={headClass}>المتبقي</th>
                </>
              )}
              <th className={headClass}>الكشف / القائمة</th>
              <th className={headClass}>تسلسل الصنف</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(event => (
              <tr key={event.id} className="bg-white hover:bg-blue-50/60">
                <td className={cellClass}>{formatTimestamp(event.timestamp)}</td>
                <td className={cellClass}>{kindLabels[event.kind]}</td>
                <td className={cellClass}>{event.person}</td>
                <td className={cellClass}>{event.address}</td>
                {isSale ? (
                  <>
                    <td className={cellClass}>{event.product}</td>
                    <td className={cellClass}>{event.quantity === null ? "—" : event.quantity.toLocaleString("en-US")}</td>
                    <td className={cellClass}>{money(event.amount)}</td>
                  </>
                ) : (
                  <>
                    <td className={cellClass}>{money(event.amount)}</td>
                    <td className={cellClass}>{money(event.remainingAmount)}</td>
                  </>
                )}
                <td className={cellClass}>{event.source}</td>
                <td className={cellClass}>{event.sequence.toLocaleString("en-US")}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={isSale ? 9 : 8} className="border border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
                  لا توجد حركات {isSale ? "بيع" : "تسديد"} في هذا التاريخ.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const saleTotal = events.filter(event => event.kind === "sale").reduce((sum, event) => sum + event.amount, 0);
  const paymentTotal = events.filter(event => event.kind === "payment").reduce((sum, event) => sum + event.amount, 0);

  return (
    <section dir="rtl" className="space-y-4 p-3 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-gradient-to-l from-blue-50 to-white p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Activity className="h-5 w-5" /></span>
          <div>
            <h2 className="font-extrabold text-slate-900">سجل الحركات</h2>
            <p className="mt-1 text-xs text-slate-500">عرض حركات البيع والتسديد مرتبة حسب التاريخ.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-xl bg-white px-3 py-2 text-slate-700 shadow-sm">عدد الحركات: {events.length}</span>
          <span className="rounded-xl bg-blue-100 px-3 py-2 text-blue-900">إجمالي البيع: {money(saleTotal)}</span>
          <span className="rounded-xl bg-emerald-100 px-3 py-2 text-emerald-900">إجمالي التسديد: {money(paymentTotal)}</span>
        </div>
      </header>

      <div className="space-y-5">
        {dailyGroups.map(group => (
          <section key={group.date} className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
            <button
              type="button"
              aria-expanded={!collapsedDays.has(group.date)}
              aria-controls={`activity-day-${group.date}`}
              onClick={() => setCollapsedDays(previous => {
                const next = new Set(previous);
                if (next.has(group.date)) next.delete(group.date);
                else next.add(group.date);
                return next;
              })}
              className="flex w-full flex-wrap items-center justify-between gap-2 bg-blue-200 px-3 py-3 text-right text-xs font-extrabold text-slate-900 transition-colors hover:bg-blue-300 sm:px-4 sm:text-sm"
            >
              <span className="flex items-center gap-2">
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${collapsedDays.has(group.date) ? "-rotate-90" : "rotate-0"}`} />
                <span>{formatDate(group.date)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-slate-700">الحركات: {(group.sales.length + group.payments.length).toLocaleString("en-US")}</span>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-900">بيع: {group.sales.length.toLocaleString("en-US")}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900">تسديد: {group.payments.length.toLocaleString("en-US")}</span>
              </span>
            </button>

            {!collapsedDays.has(group.date) && <div id={`activity-day-${group.date}`} className="space-y-4 p-2 sm:p-3">
              <section className="overflow-hidden border border-slate-300">
                <div className="bg-blue-700 px-3 py-2 text-center text-xs font-extrabold text-white">بيع</div>
                {renderTable("sale", group.sales)}
              </section>
              <section className="overflow-hidden border border-slate-300">
                <div className="bg-blue-700 px-3 py-2 text-center text-xs font-extrabold text-white">تسديد</div>
                {renderTable("payment", group.payments)}
              </section>
            </div>}
          </section>
        ))}
        {!dailyGroups.length && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
            لا توجد حركات بيع أو تسديد مسجلة.
          </div>
        )}
      </div>
    </section>
  );
}
