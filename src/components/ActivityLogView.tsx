import React, { useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronLeft, ChevronRight, GripVertical, SlidersHorizontal, X } from "lucide-react";
import type { Customer, CustomerFolder, Invoice, Payment, Product, Supplier } from "../types";
import { formatThousands } from "../utils/numberFormatting";
import { useAuth } from "../contexts/AuthContext";

type EventKind = "sale" | "payment";
type SortKey = "none" | "timestamp" | "kind" | "person" | "address" | "product" | "quantity" | "amount" | "remainingAmount" | "source" | "sequence";
type SortRule = { key: SortKey; direction: "asc" | "desc"; show: boolean };
type ActivityFilters = { kind: "all" | EventKind; from: string; to: string; person: string; address: string; product: string; amountMin: string; amountMax: string };
type ActivityColumnId = "timestamp" | "kind" | "person" | "address" | "product" | "quantity" | "amount" | "remaining" | "source" | "sequence";
const sortFields: { key: SortKey; label: string }[] = [
  { key: "none", label: "بدون فرز" }, { key: "timestamp", label: "الطابع الزمني" }, { key: "kind", label: "نوع الحركة" },
  { key: "person", label: "اسم العميل" }, { key: "address", label: "العنوان" }, { key: "product", label: "اسم البضاعة" },
  { key: "quantity", label: "الكمية" }, { key: "amount", label: "المبلغ" }, { key: "remainingAmount", label: "المتبقي" },
  { key: "source", label: "الكشف / القائمة" }, { key: "sequence", label: "تسلسل الصنف" },
];
const activityColumns: { id: ActivityColumnId; label: string }[] = [
  { id: "timestamp", label: "الطابع الزمني" }, { id: "kind", label: "نوع الحركة" }, { id: "person", label: "اسم العميل" },
  { id: "address", label: "العنوان" }, { id: "product", label: "اسم البضاعة" }, { id: "quantity", label: "الكمية" },
  { id: "amount", label: "المبلغ" }, { id: "remaining", label: "المتبقي" }, { id: "source", label: "الكشف / القائمة" },
  { id: "sequence", label: "تسلسل الصنف" },
];
type ActivitySettings = {
  filters: ActivityFilters;
  filterPanelOpen: boolean;
  sortRules: SortRule[];
  sortPanelOpen: boolean;
  columnsPanelOpen: boolean;
  columnOrder: ActivityColumnId[];
  visibleColumns: ActivityColumnId[];
};
const defaultActivityFilters = (): ActivityFilters => ({
  kind: "all", from: "", to: "", person: "", address: "", product: "", amountMin: "", amountMax: "",
});
const defaultActivitySortRules = (): SortRule[] => [{ key: "none", direction: "desc", show: false }];
const defaultActivityColumns = (): ActivityColumnId[] => activityColumns.map(column => column.id);
const activitySettingsKey = (userId?: string | null) =>
  userId ? "acc_u_" + userId + "_activity_log_settings" : "acc_guest_activity_log_settings";
function readActivitySettings(key: string): ActivitySettings {
  const fallback: ActivitySettings = {
    filters: defaultActivityFilters(), filterPanelOpen: false, sortRules: defaultActivitySortRules(),
    sortPanelOpen: false, columnsPanelOpen: false, columnOrder: defaultActivityColumns(), visibleColumns: defaultActivityColumns(),
  };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<ActivitySettings>;
    const savedFilters = saved.filters;
    const filters: ActivityFilters = {
      kind: savedFilters?.kind === "sale" || savedFilters?.kind === "payment" ? savedFilters.kind : "all",
      from: typeof savedFilters?.from === "string" ? savedFilters.from : "",
      to: typeof savedFilters?.to === "string" ? savedFilters.to : "",
      person: typeof savedFilters?.person === "string" ? savedFilters.person : "",
      address: typeof savedFilters?.address === "string" ? savedFilters.address : "",
      product: typeof savedFilters?.product === "string" ? savedFilters.product : "",
      amountMin: typeof savedFilters?.amountMin === "string" ? savedFilters.amountMin : "",
      amountMax: typeof savedFilters?.amountMax === "string" ? savedFilters.amountMax : "",
    };
    const allowedSort = (value: unknown): value is SortKey =>
      typeof value === "string" && sortFields.some(field => field.key === value);
    const sortRules = Array.isArray(saved.sortRules)
      ? saved.sortRules.filter((rule): rule is SortRule =>
          !!rule && allowedSort((rule as SortRule).key)
          && ((rule as SortRule).direction === "asc" || (rule as SortRule).direction === "desc")
          && typeof (rule as SortRule).show === "boolean")
      : fallback.sortRules;
    const allowedColumn = (value: unknown): value is ActivityColumnId =>
      typeof value === "string" && activityColumns.some(column => column.id === value);
    const savedOrder = Array.isArray(saved.columnOrder) ? saved.columnOrder.filter(allowedColumn) : [];
    const columnOrder = [...new Set<ActivityColumnId>(savedOrder), ...defaultActivityColumns().filter(id => !savedOrder.includes(id))];
    const savedVisible = Array.isArray(saved.visibleColumns) ? saved.visibleColumns.filter(allowedColumn) : defaultActivityColumns();
    return {
      filters,
      filterPanelOpen: typeof saved.filterPanelOpen === "boolean" ? saved.filterPanelOpen : false,
      sortRules,
      sortPanelOpen: typeof saved.sortPanelOpen === "boolean" ? saved.sortPanelOpen : false,
      columnsPanelOpen: typeof saved.columnsPanelOpen === "boolean" ? saved.columnsPanelOpen : false,
      columnOrder,
      visibleColumns: savedVisible.length ? [...new Set(savedVisible)] : defaultActivityColumns(),
    };
  } catch {
    return fallback;
  }
}

const activitySortValue = (event: LogEvent, key: SortKey): string | number | null => {
  switch (key) {
    case "timestamp": { const value = Date.parse(event.timestamp); return Number.isFinite(value) ? value : null; }
    case "kind": return kindLabels[event.kind];
    case "person": return event.person;
    case "address": return event.address;
    case "product": return event.product;
    case "quantity": return event.quantity;
    case "amount": return event.amount;
    case "remainingAmount": return event.remainingAmount;
    case "source": return event.source;
    case "sequence": return event.sequence;
    default: return "";
  }
};
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
  const { currentUser } = useAuth();
  const settingsKey = activitySettingsKey(currentUser?.uid);
  const [loadedSettingsKey, setLoadedSettingsKey] = useState("");
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(() => new Set());
  const [filters, setFilters] = useState<ActivityFilters>(defaultActivityFilters);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [sortRules, setSortRules] = useState<SortRule[]>(defaultActivitySortRules);
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);
  const [draggedColumnId, setDraggedColumnId] = useState<ActivityColumnId | null>(null);
  const [columnOrder, setColumnOrder] = useState<ActivityColumnId[]>(defaultActivityColumns);
  const [visibleColumns, setVisibleColumns] = useState<ActivityColumnId[]>(defaultActivityColumns);

  useEffect(() => {
    const saved = readActivitySettings(settingsKey);
    setFilters(saved.filters);
    setFilterPanelOpen(saved.filterPanelOpen);
    setSortRules(saved.sortRules);
    setSortPanelOpen(saved.sortPanelOpen);
    setColumnsPanelOpen(saved.columnsPanelOpen);
    setColumnOrder(saved.columnOrder);
    setVisibleColumns(saved.visibleColumns);
    setLoadedSettingsKey(settingsKey);
  }, [settingsKey]);

  useEffect(() => {
    if (loadedSettingsKey !== settingsKey) return;
    try {
      localStorage.setItem(settingsKey, JSON.stringify({
        filters, filterPanelOpen, sortRules, sortPanelOpen, columnsPanelOpen, columnOrder, visibleColumns,
      }));
    } catch {}
  }, [filters, filterPanelOpen, sortRules, sortPanelOpen, columnsPanelOpen, columnOrder, visibleColumns, settingsKey, loadedSettingsKey]);
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

  const filteredEvents = useMemo(() => {
    const personNeedle = filters.person.trim().toLocaleLowerCase();
    const addressNeedle = filters.address.trim().toLocaleLowerCase();
    const productNeedle = filters.product.trim().toLocaleLowerCase();
    const minimum = filters.amountMin === "" ? null : Number(filters.amountMin);
    const maximum = filters.amountMax === "" ? null : Number(filters.amountMax);
    return events.filter(event => {
      const date = dayKey(event.timestamp);
      if (filters.kind !== "all" && event.kind !== filters.kind) return false;
      if (filters.from && date < filters.from) return false;
      if (filters.to && date > filters.to) return false;
      if (personNeedle && !event.person.toLocaleLowerCase().includes(personNeedle)) return false;
      if (addressNeedle && !event.address.toLocaleLowerCase().includes(addressNeedle)) return false;
      if (productNeedle && !event.product.toLocaleLowerCase().includes(productNeedle)) return false;
      if (minimum !== null && Number.isFinite(minimum) && event.amount < minimum) return false;
      if (maximum !== null && Number.isFinite(maximum) && event.amount > maximum) return false;
      return true;
    });
  }, [events, filters]);

  const activeSortRules = sortRules.filter(rule => rule.key !== "none");
  const separatorRules = activeSortRules.filter(rule => rule.show);
  const sortedEvents = useMemo(() => {
    const indexed = filteredEvents.map((event, index) => ({ event, index }));
    indexed.sort((a, b) => {
      for (const rule of activeSortRules) {
        const av = activitySortValue(a.event, rule.key);
        const bv = activitySortValue(b.event, rule.key);
        if (av === null && bv === null) continue;
        if (av === null) return 1;
        if (bv === null) return -1;
        const delta = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "ar", { numeric: true, sensitivity: "base" });
        if (delta) return rule.direction === "asc" ? delta : -delta;
      }
      return a.index - b.index;
    });
    return indexed.map(item => item.event);
  }, [filteredEvents, activeSortRules]);

  const dailyGroups = useMemo(() => {
    const groups = new Map<string, { sales: LogEvent[]; payments: LogEvent[] }>();
    sortedEvents.forEach(event => {
      const date = dayKey(event.timestamp);
      if (!groups.has(date)) groups.set(date, { sales: [], payments: [] });
      const group = groups.get(date)!;
      if (event.kind === "sale") group.sales.push(event);
      else group.payments.push(event);
    });
    return Array.from(groups.entries()).map(([date, group]) => ({ date, ...group }));
  }, [sortedEvents]);

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
  const wrapAfterSevenWords = (value: string) => {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 7) return value;
    return words.map((word, index) => (
      <React.Fragment key={index}>
        {index > 0 && (index % 7 === 0 ? <br /> : " ")}
        {word}
      </React.Fragment>
    ));
  };
  const tableClass = "w-max min-w-full border-separate border-spacing-x-1 border-spacing-y-2 text-right text-xs sm:text-sm";
  const headClass = "border border-[#c4d0dc] bg-[#dbe5ef] px-2 py-2.5 font-extrabold text-[#34495e] first:rounded-r-lg last:rounded-l-lg";
  const cellClass = "border-y border-slate-200 bg-white px-2 py-2 text-slate-700 align-top first:border-r first:rounded-r-lg last:border-l last:rounded-l-lg";
  const visibleColumnOrder = columnOrder.filter(id => visibleColumns.includes(id));
  const moveColumn = (id: ActivityColumnId, direction: -1 | 1) => setColumnOrder(old => {
    const index = old.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= old.length) return old;
    const next = [...old];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });
  const updateSortRule = (index: number, patch: Partial<SortRule>) =>
    setSortRules(old => old.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  const sortValueLabel = (event: LogEvent, key: SortKey) => {
    const value = activitySortValue(event, key);
    if (key === "timestamp") return formatTimestamp(event.timestamp);
    if (key === "amount" || key === "remainingAmount") return money(value as number | null);
    if (key === "quantity" || key === "sequence") return value === null ? "—" : Number(value).toLocaleString("en-US");
    return value === null || value === "" ? "—" : String(value);
  };
  const renderCell = (event: LogEvent, column: ActivityColumnId) => {
    switch (column) {
      case "timestamp": return formatTimestamp(event.timestamp);
      case "kind": return kindLabels[event.kind];
      case "person": return wrapAfterSevenWords(event.person);
      case "address": return wrapAfterSevenWords(event.address);
      case "product": return wrapAfterSevenWords(event.product);
      case "quantity": return event.quantity === null ? "—" : event.quantity.toLocaleString("en-US");
      case "amount": return money(event.amount);
      case "remaining": return money(event.remainingAmount);
      case "source": return wrapAfterSevenWords(event.source);
      case "sequence": return event.sequence.toLocaleString("en-US");
    }
  };
  const renderTable = (kind: EventKind, rows: LogEvent[]) => {
    const isSale = kind === "sale";
    const columns = visibleColumnOrder.filter(column =>
      isSale ? column !== "remaining" : column !== "product" && column !== "quantity"
    );
    const signature = (event: LogEvent) => JSON.stringify(separatorRules.map(rule => activitySortValue(event, rule.key)));
    return (
      <div className="overflow-x-auto overscroll-x-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}>
        <table className={tableClass}>
          <thead>
            {separatorRules.length === 0 && <tr>{columns.map(column => (
              <th key={column} className={headClass}>
                {column === "amount" && !isSale ? "المبلغ المسدد" : activityColumns.find(item => item.id === column)?.label}
              </th>
            ))}</tr>}
          </thead>
          <tbody>
            {rows.length ? rows.map((event, index) => {
              const showSeparator = separatorRules.length > 0 && (index === 0 || signature(event) !== signature(rows[index - 1]));
              return <React.Fragment key={event.id}>
                {showSeparator && <tr>
                  <td colSpan={columns.length} className="border border-[#e6c3c8] bg-[#f3dadd] px-3 py-3 text-center text-[13px] sm:text-[15px] font-black text-[#75414a] whitespace-normal leading-snug rounded-xl shadow-sm">
                    {separatorRules.map(rule => sortValueLabel(event, rule.key)).filter(value => value && value !== "—").join(" — ")}
                  </td>
                </tr>}
                {showSeparator && <tr className="bg-blue-200">
                  {columns.map(column => (
                    <th key={column} className={headClass}>
                      {column === "amount" && !isSale ? "المبلغ المسدد" : activityColumns.find(item => item.id === column)?.label}
                    </th>
                  ))}
                </tr>}
                <tr className="bg-white">
                  {columns.map(column => <td key={column} className={cellClass}>{renderCell(event, column)}</td>)}
                </tr>
              </React.Fragment>;
            }) : (
              <tr><td colSpan={Math.max(1, columns.length)} className="border border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
                لا توجد حركات {isSale ? "بيع" : "تسديد"} مطابقة لشروط التصفية في هذا التاريخ.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const saleTotal = filteredEvents.filter(event => event.kind === "sale").reduce((sum, event) => sum + event.amount, 0);
  const paymentTotal = filteredEvents.filter(event => event.kind === "payment").reduce((sum, event) => sum + event.amount, 0);
  const activeFilterCount = Object.values(filters).filter(value => value !== "" && value !== "all").length;
  const setTextFilter = (key: "person" | "address" | "product" | "from" | "to" | "amountMin" | "amountMax", value: string) =>
    setFilters(old => ({ ...old, [key]: value }));

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
          <span className="rounded-xl bg-white px-3 py-2 text-slate-700 shadow-sm">عدد الحركات: {filteredEvents.length}{activeFilterCount > 0 && " من " + events.length}</span>
          <span className="rounded-xl bg-blue-100 px-3 py-2 text-blue-900">إجمالي البيع: {money(saleTotal)}</span>
          <span className="rounded-xl bg-emerald-100 px-3 py-2 text-emerald-900">إجمالي التسديد: {money(paymentTotal)}</span>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-700">تصفية الحركات</p>
            <p className="mt-1 text-xs text-slate-500">{activeFilterCount ? activeFilterCount + " شروط تصفية مفعّلة" : "صفِّ الحركات حسب النوع والتاريخ والعميل والبضاعة والمبلغ."}</p>
          </div>
          <button type="button" onClick={() => setFilterPanelOpen(open => !open)} aria-expanded={filterPanelOpen} aria-controls="activity-filter-options" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <SlidersHorizontal size={17}/><span>تخصيص التصفية</span><ChevronDown size={16} className="transition-transform"/>
          </button>
        </div>
        {filterPanelOpen && <div id="activity-filter-options" className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-xs font-semibold text-slate-600">نوع الحركة
              <select value={filters.kind} onChange={event => setFilters(old => ({ ...old, kind: event.target.value as ActivityFilters["kind"] }))} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800">
                <option value="all">كل الحركات</option><option value="sale">بيع</option><option value="payment">تسديد</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">اسم العميل
              <input value={filters.person} onChange={event => setTextFilter("person", event.target.value)} placeholder="ابحث باسم العميل" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800"/>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">العنوان
              <input value={filters.address} onChange={event => setTextFilter("address", event.target.value)} placeholder="ابحث بالعنوان" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800"/>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">اسم البضاعة
              <input value={filters.product} onChange={event => setTextFilter("product", event.target.value)} placeholder="ابحث باسم البضاعة" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800"/>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">من تاريخ
              <input type="date" value={filters.from} onChange={event => setTextFilter("from", event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800"/>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">إلى تاريخ
              <input type="date" value={filters.to} onChange={event => setTextFilter("to", event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800"/>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">المبلغ من
              <input type="number" inputMode="numeric" value={filters.amountMin} onChange={event => setTextFilter("amountMin", event.target.value)} placeholder="أقل مبلغ" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800"/>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">المبلغ إلى
              <input type="number" inputMode="numeric" value={filters.amountMax} onChange={event => setTextFilter("amountMax", event.target.value)} placeholder="أعلى مبلغ" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800"/>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilters({ kind: "all", from: "", to: "", person: "", address: "", product: "", amountMin: "", amountMax: "" })} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">إعادة ضبط التصفية</button>
          </div>
        </div>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-bold text-slate-700">الفرز المتعدد والفواصل الموحّدة</p><p className="mt-1 text-xs text-slate-500">{activeSortRules.length} مستويات فرز فعّالة</p></div>
          <button type="button" onClick={() => setSortPanelOpen(open => !open)} aria-expanded={sortPanelOpen} aria-controls="activity-sort-options" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <SlidersHorizontal size={17}/><span>تخصيص الفرز</span><ChevronDown size={16} className="transition-transform"/>
          </button>
        </div>
        {sortPanelOpen && <div id="activity-sort-options" className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">اختر حقل الفرز واتجاهه. يمكن إضافة أكثر من مستوى، وتظهر الفواصل عند تفعيل المربع.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sortRules.map((rule, index) => <div key={index} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs">الفرز {(["الأول", "الثاني", "الثالث", "الرابع"][index] || "رقم " + (index + 1))}</strong>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={rule.show} onChange={event => updateSortRule(index, { show: event.target.checked })} className="h-4 w-4"/> إظهار الفاصل</label>
                  <button type="button" aria-label={"حذف الفرز " + (index + 1)} onClick={() => setSortRules(old => old.filter((_, i) => i !== index))} className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:text-red-600"><X size={15}/></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs font-semibold text-slate-600">اختيار الفرز
                  <select value={rule.key} onChange={event => updateSortRule(index, { key: event.target.value as SortKey })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-800">
                    {sortFields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-600">الاتجاه
                  <select value={rule.direction} onChange={event => updateSortRule(index, { direction: event.target.value as SortRule["direction"] })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-800">
                    <option value="asc">تصاعدي ↑</option><option value="desc">تنازلي ↓</option>
                  </select>
                </label>
              </div>
            </div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSortRules(old => [...old, { key: "none", direction: "asc", show: false }])} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">+ إضافة فرز</button>
            <button type="button" onClick={() => setSortRules(old => old.map(rule => ({ ...rule, show: true })))} className="rounded-lg border px-3 py-2 text-xs">إظهار الكل بالفاصل</button>
            <button type="button" onClick={() => setSortRules(old => old.map(rule => ({ ...rule, show: false })))} className="rounded-lg border px-3 py-2 text-xs">إخفاء الفواصل</button>
            <button type="button" onClick={() => setSortRules([{ key: "none", direction: "desc", show: false }])} className="rounded-lg border px-3 py-2 text-xs">إعادة ضبط الفرز</button>
          </div>
        </div>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-bold text-slate-700">تخصيص أعمدة الجدول</p><p className="mt-1 text-xs text-slate-500">{visibleColumns.length} من {columnOrder.length} أعمدة ظاهرة</p></div>
          <button type="button" onClick={() => setColumnsPanelOpen(open => !open)} aria-expanded={columnsPanelOpen} aria-controls="activity-column-options" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <SlidersHorizontal size={17}/><span>تخصيص الأعمدة</span><ChevronDown size={16} className="transition-transform"/>
          </button>
        </div>
        {columnsPanelOpen && <div id="activity-column-options" className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs text-slate-500">فعّل أو أزل علامة الصح لإظهار العمود أو إخفائه، واستخدم الأسهم لترتيب الأعمدة.</p>
          <div className="flex flex-nowrap gap-2 overflow-x-auto pb-2">
            {columnOrder.map((id, index) => <div key={id} onDragOver={event => {
              event.preventDefault();
              if (!draggedColumnId || draggedColumnId === id) return;
              setColumnOrder(old => {
                const from = old.indexOf(draggedColumnId), to = old.indexOf(id);
                if (from < 0 || to < 0 || from === to) return old;
                const next = [...old];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                return next;
              });
            }} onDrop={() => setDraggedColumnId(null)} className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-[#eef3fa] px-2 py-2">
              <button type="button" draggable aria-label={"اسحب لترتيب " + id} onDragStart={() => setDraggedColumnId(id)} onDragEnd={() => setDraggedColumnId(null)} className="cursor-grab text-slate-500 active:cursor-grabbing"><GripVertical size={17}/></button>
              <label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-700">
                <span>{activityColumns.find(column => column.id === id)?.label}</span>
                <input type="checkbox" checked={visibleColumns.includes(id)} disabled={visibleColumns.includes(id) && (visibleColumns.length === 1 || (["timestamp", "kind", "person", "address", "amount", "source", "sequence"] as ActivityColumnId[]).filter(column => column !== id && visibleColumns.includes(column)).length === 0)} onChange={event => setVisibleColumns(old => event.target.checked ? [...old, id] : old.filter(column => column !== id))} className="h-4 w-4"/>
              </label>
              <button type="button" aria-label={"تحريك " + id + " للأعلى"} disabled={index === 0} onClick={() => moveColumn(id, -1)} className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronRight size={15}/></button>
              <button type="button" aria-label={"تحريك " + id + " للأسفل"} disabled={index === columnOrder.length - 1} onClick={() => moveColumn(id, 1)} className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronLeft size={15}/></button>
            </div>)}
          </div>
        </div>}
      </section>

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
              className="flex w-full flex-wrap items-center justify-between gap-2 bg-[#eaf1f8] px-3 py-3 text-right text-xs font-extrabold text-slate-800 transition-colors hover:bg-[#dce8f4] sm:px-4 sm:text-sm"
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
                <div className="bg-[#e8eef5] px-3 py-2 text-center text-xs font-extrabold text-[#45576c]">بيع</div>
                {renderTable("sale", group.sales)}
              </section>
              <section className="overflow-hidden border border-slate-300">
                <div className="bg-[#e6efe8] px-3 py-2 text-center text-xs font-extrabold text-[#45604d]">تسديد</div>
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
