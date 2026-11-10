import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BarChart3, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Download, GripVertical, Printer, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { Customer, CustomerFolder, Invoice } from "../types";
import { printElement, exportElementToPDF } from "../utils/printUtils";
import { useAuth } from "../contexts/AuthContext";

type Key = "none" | "folder" | "name" | "address" | "salary" | "purchaseDate" | "capital" | "sales" | "profit" | "paid" | "remaining" | "quantity";
type Rule = { key: Key; direction: "asc" | "desc"; show: boolean; dateMode?: "first" | "last" };
type ColumnId = "sequence" | "name" | "address" | "salary" | "phone" | "capital" | "sales" | "profit" | "paid" | "remaining" | "quantity" | "folder" | "firstPurchase" | "lastPurchase";
type Entry = { id: string; folder: string; name: string; address: string; salary: string; phone: string; firstPurchase: number | null; lastPurchase: number | null; capital: number; sales: number; profit: number; paid: number; remaining: number; quantity: number };
type ColumnDefinition = { id: ColumnId; label: string };
const columnDefinitions: ColumnDefinition[] = [
  {id:"sequence",label:"ت"},{id:"name",label:"الاسم"},{id:"address",label:"العنوان"},{id:"salary",label:"نوع الراتب"},
  {id:"phone",label:"رقم الهاتف"},{id:"capital",label:"مبلغ رأس المال"},{id:"sales",label:"مبلغ البيع"},{id:"profit",label:"مبلغ الربح"},
  {id:"paid",label:"المبلغ المسدد"},{id:"remaining",label:"المبلغ المتبقي"},{id:"quantity",label:"عدد البضائع"},
  {id:"folder",label:"المجلد"},{id:"firstPurchase",label:"أول عملية شراء"},{id:"lastPurchase",label:"آخر عملية شراء"}
];
const allColumnIds = columnDefinitions.map(column=>column.id);
const defaultColumnOrder = (): ColumnId[] => [...allColumnIds];
const columnLabel = (id: ColumnId) => columnDefinitions.find(column=>column.id===id)?.label || id;
const fields: { key: Key; label: string }[] = [
  {key:"none",label:"بدون فرز"},{key:"folder",label:"المجلد"},{key:"name",label:"الاسم"},{key:"address",label:"العنوان"},
  {key:"salary",label:"نوع الراتب"},{key:"purchaseDate",label:"التاريخ والوقت"},{key:"capital",label:"مبلغ رأس المال"},
  {key:"sales",label:"مبلغ البيع"},{key:"profit",label:"مبلغ الربح"},{key:"paid",label:"المبلغ المسدد"},
  {key:"remaining",label:"المبلغ المتبقي"},{key:"quantity",label:"عدد البضائع"}
];
const defaults = (): Rule[] => [{key:"folder",direction:"asc",show:false}];
const sortSettingsKey = (userId?: string | null) => userId ? `acc_u_${userId}_customer_data_sort` : "acc_guest_customer_data_sort";
function readSortSettings(key: string): { rules: Rule[]; panelOpen: boolean; columnOrder: ColumnId[]; visibleColumns: ColumnId[]; columnsPanelOpen: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {rules:defaults(),panelOpen:true,columnOrder:defaultColumnOrder(),visibleColumns:defaultColumnOrder(),columnsPanelOpen:false};
    const saved = JSON.parse(raw);
    const allowedKeys = new Set(fields.map(field=>field.key));
    const rules = Array.isArray(saved.rules)
      ? saved.rules.filter((rule: unknown): rule is Rule => {
          if (!rule || typeof rule !== "object") return false;
          const candidate = rule as Partial<Rule>;
          return typeof candidate.key === "string" && allowedKeys.has(candidate.key as Key)
            && (candidate.direction === "asc" || candidate.direction === "desc")
            && typeof candidate.show === "boolean";
        })
      : defaults();
    const validColumn = (id: unknown): id is ColumnId => typeof id === "string" && allColumnIds.includes(id as ColumnId);
    const storedOrder = Array.isArray(saved.columnOrder) ? saved.columnOrder.filter(validColumn) : [];
    const columnOrder: ColumnId[] = [...new Set<ColumnId>(storedOrder),...allColumnIds.filter(id=>!storedOrder.includes(id))];
    const visibleColumns = Array.isArray(saved.visibleColumns)
      ? [...new Set<ColumnId>(saved.visibleColumns.filter(validColumn))]
      : defaultColumnOrder();
    return {
      rules,
      panelOpen:typeof saved.panelOpen === "boolean" ? saved.panelOpen : true,
      columnOrder,
      visibleColumns:visibleColumns.length ? visibleColumns : defaultColumnOrder(),
      columnsPanelOpen:typeof saved.columnsPanelOpen === "boolean" ? saved.columnsPanelOpen : false
    };
  } catch {
    return {rules:defaults(),panelOpen:true,columnOrder:defaultColumnOrder(),visibleColumns:defaultColumnOrder(),columnsPanelOpen:false};
  }
}
const num = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };
const toEnglishDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g,digit=>{
  const arabic="٠١٢٣٤٥٦٧٨٩",persian="۰۱۲۳۴۵۶۷۸۹";
  const arabicIndex=arabic.indexOf(digit);
  return String(arabicIndex>=0?arabicIndex:persian.indexOf(digit));
});
const format = (n: number) => n.toLocaleString("en-US", {maximumFractionDigits:2});
const label = (key: Key) => fields.find(f => f.key === key)?.label || key;
const textValue = (v: string | number | null) => v === null ? "غير مسجل" : typeof v === "number" ? format(v) : (v || "غير مسجل");
const value = (row: Entry, key: Key, dateMode: Rule["dateMode"] = "first"): string | number | null =>
  key === "none" ? "" : key === "purchaseDate" ? row[dateMode === "last" ? "lastPurchase" : "firstPurchase"] : row[key];
const formatPurchaseTimestamp = (timestamp: number | null) => {
  if (timestamp === null) return "غير مسجل";
  const date = new Date(timestamp);
  const weekday = new Intl.DateTimeFormat("ar-IQ", {weekday:"long",timeZone:"Asia/Baghdad"}).format(date);
  const time = toEnglishDigits(new Intl.DateTimeFormat("ar-IQ", {hour:"numeric",minute:"2-digit",hour12:true,timeZone:"Asia/Baghdad"}).format(date));
  const parts = new Intl.DateTimeFormat("en-CA", {year:"numeric",month:"numeric",day:"numeric",timeZone:"Asia/Baghdad"}).formatToParts(date);
  const part = (type: string) => parts.find(item=>item.type===type)?.value || "";
  return `${weekday} — ${time} — ${part("year")}/${part("month")}/${part("day")}`;
};
const ruleLabel = (rule: Rule) => rule.key === "purchaseDate"
  ? `التاريخ والوقت — ${rule.dateMode === "last" ? "تاريخ آخر شراء" : "تاريخ أول شراء"}`
  : label(rule.key);
const ruleValueLabel = (row: Entry, rule: Rule) => {
  const result = value(row,rule.key,rule.dateMode);
  return rule.key === "purchaseDate" ? formatPurchaseTimestamp(typeof result === "number" ? result : null) : textValue(result);
};
const wordLines = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (let i=0; i<words.length; i+=4) lines.push(words.slice(i,i+4).join(" "));
  return lines;
};

const CUSTOMER_TABLE_RETURN_POSITION_KEY = "customer-data-table-return-position";

function rememberCustomerTablePosition(customerId: string) {
  const row = Array.from(document.querySelectorAll<HTMLTableRowElement>(".customer-data-table-row"))
    .find(candidate => candidate.dataset.customerRowId === customerId);
  if (!row) return;
  const horizontalScroller = row.closest<HTMLElement>(".customer-data-table-scroll");
  sessionStorage.setItem(CUSTOMER_TABLE_RETURN_POSITION_KEY, JSON.stringify({
    customerId,
    rowTop: row.getBoundingClientRect().top,
    pageTop: window.scrollY,
    horizontalScroll: horizontalScroller?.scrollLeft ?? 0,
  }));
}

function restoreCustomerTablePosition() {
  const saved = sessionStorage.getItem(CUSTOMER_TABLE_RETURN_POSITION_KEY);
  if (!saved) return;
  try {
    const position = JSON.parse(saved) as { customerId: string; rowTop: number; horizontalScroll: number };
    const row = Array.from(document.querySelectorAll<HTMLTableRowElement>(".customer-data-table-row"))
      .find(candidate => candidate.dataset.customerRowId === position.customerId);
    if (!row) return;
    const horizontalScroller = row.closest<HTMLElement>(".customer-data-table-scroll");
    if (horizontalScroller) horizontalScroller.scrollLeft = position.horizontalScroll;
    const currentTop = row.getBoundingClientRect().top;
    window.scrollTo({ top: Math.max(0, window.scrollY + currentTop - position.rowTop), behavior: "instant" });
    sessionStorage.removeItem(CUSTOMER_TABLE_RETURN_POSITION_KEY);
  } catch {
    sessionStorage.removeItem(CUSTOMER_TABLE_RETURN_POSITION_KEY);
  }
}

export default function CustomerDataTable({customers,invoices,folders = [],onBack,onOpenCustomerLedger,onOpenCustomerStatistics,filterControls,searchControl,onOpenFilters,activeFilterCount,totalCustomerCount}: {
  customers: Customer[]; invoices: Invoice[]; folders?: CustomerFolder[]; onBack: () => void;
  onOpenCustomerLedger: (customerId: string) => void;
  onOpenCustomerStatistics: (customerId: string) => void;
  filterControls: React.ReactNode; searchControl: React.ReactNode; onOpenFilters: () => void; activeFilterCount: number;
  totalCustomerCount: number;
}) {
  const { currentUser } = useAuth();
  useLayoutEffect(() => {
    restoreCustomerTablePosition();
  }, []);
  const customerRowLongPressTimer = useRef<number | null>(null);
  const pressedCustomerRowRef = useRef<HTMLTableRowElement | null>(null);
  const customerRowPointerStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const customerMenuRef = useRef<HTMLDivElement | null>(null);
  const [openCustomerMenuId, setOpenCustomerMenuId] = useState<string | null>(null);
  const [customerMenuPosition, setCustomerMenuPosition] = useState({ top: 0, left: 0 });
  const placeCustomerMenuAt = (x: number, y: number, height: number) => {
    const top = y + height + 8 <= window.innerHeight ? y + 4 : Math.max(8, y - height - 4);
    const left = Math.max(8, Math.min(x - 192, window.innerWidth - 200));
    setCustomerMenuPosition({ top, left });
  };
  const currentSortSettingsKey = sortSettingsKey(currentUser?.uid);
  const [initialSortSettings] = useState(()=>readSortSettings(currentSortSettingsKey));
  const [rules,setRules] = useState<Rule[]>(initialSortSettings.rules);
  const [sortPanelOpen,setSortPanelOpen] = useState(initialSortSettings.panelOpen);
  const [columnOrder,setColumnOrder] = useState<ColumnId[]>(initialSortSettings.columnOrder);
  const [visibleColumns,setVisibleColumns] = useState<ColumnId[]>(initialSortSettings.visibleColumns);
  const [columnsPanelOpen,setColumnsPanelOpen] = useState(initialSortSettings.columnsPanelOpen);
  const [loadedSortSettingsKey,setLoadedSortSettingsKey] = useState(currentSortSettingsKey);
  const [draggedColumnId,setDraggedColumnId] = useState<ColumnId | null>(null);
  const draggedColumnRef = useRef<ColumnId | null>(null);
  const cancelCustomerRowLongPress = () => {
    if (customerRowLongPressTimer.current !== null) {
      window.clearTimeout(customerRowLongPressTimer.current);
      customerRowLongPressTimer.current = null;
    }
    pressedCustomerRowRef.current?.classList.remove("customer-table-row-pressing");
    pressedCustomerRowRef.current = null;
    customerRowPointerStartRef.current = null;
  };
  const startCustomerRowLongPress = (customerId: string, row: HTMLTableRowElement, pointerId: number, x: number, y: number) => {
    cancelCustomerRowLongPress();
    pressedCustomerRowRef.current = row;
    customerRowPointerStartRef.current = { pointerId, x, y };
    row.classList.add("customer-table-row-pressing");
    customerRowLongPressTimer.current = window.setTimeout(() => {
      customerRowLongPressTimer.current = null;
      row.classList.remove("customer-table-row-pressing");
      pressedCustomerRowRef.current = null;
      customerRowPointerStartRef.current = null;
      placeCustomerMenuAt(x, y, 112);
      setOpenCustomerMenuId(customerId);
    }, 400);
  };
  useEffect(() => () => {
    if (customerRowLongPressTimer.current !== null) window.clearTimeout(customerRowLongPressTimer.current);
  }, []);
  useEffect(() => {
    if (!openCustomerMenuId) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !customerMenuRef.current?.contains(event.target)) setOpenCustomerMenuId(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenCustomerMenuId(null);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, [openCustomerMenuId]);
  useEffect(()=>{
    const saved = readSortSettings(currentSortSettingsKey);
    setRules(saved.rules);
    setSortPanelOpen(saved.panelOpen);
    setColumnOrder(saved.columnOrder);
    setVisibleColumns(saved.visibleColumns);
    setColumnsPanelOpen(saved.columnsPanelOpen);
    setLoadedSortSettingsKey(currentSortSettingsKey);
  },[currentSortSettingsKey]);
  useEffect(()=>{
    if (loadedSortSettingsKey !== currentSortSettingsKey) return;
    try {
      localStorage.setItem(currentSortSettingsKey,JSON.stringify({
        rules,panelOpen:sortPanelOpen,columnOrder,visibleColumns,columnsPanelOpen
      }));
    } catch {}
  },[rules,sortPanelOpen,columnOrder,visibleColumns,columnsPanelOpen,currentSortSettingsKey,loadedSortSettingsKey]);
  const [openMenu,setOpenMenu] = useState<string | null>(null);
  const [exporting,setExporting] = useState(false);
  const handleExport = async (download: boolean) => {
    if (exporting) return;
    setExporting(true);
    try {
      await new Promise<void>(resolve=>window.requestAnimationFrame(()=>resolve()));
      if (download) await exportElementToPDF("customer-data-export", {filename:"بيانات العملاء",title:"بيانات العملاء"});
      else await printElement("customer-data-export", {title:"بيانات العملاء"});
    } catch (error) {
      alert("تعذر " + (download?"تنزيل PDF":"الطباعة") + ": " + (error instanceof Error ? error.message : String(error)));
    } finally { setExporting(false); }
  };
  const folderName = (id?: string) => {
    if (!id) return "المجلد الرئيسي";
    const folder = folders.find(f => f.id === id);
    return folder?.name || "مجلد غير متاح";
  };
  const rows = useMemo<Entry[]>(() => customers.filter(c => !c.isDeleted).map(c => {
    const inv = (Array.isArray(invoices) ? invoices : []).filter(x => x.customerId === c.id && !x.isDeleted);
    const sheet = (Array.isArray(c.accountingSheetRows) ? c.accountingSheetRows : []).filter(x => !x.isSeparator && !("isPaymentRow" in x && x.isPaymentRow) && !("isRemainingRow" in x && x.isRemainingRow));
    const sheetPayments = (Array.isArray(c.accountingSheetPayments) ? c.accountingSheetPayments : []).filter(x => !(x as typeof x & {isDeleted?:boolean}).isDeleted);
    const items = inv.flatMap(invoice => Array.isArray(invoice.items) ? invoice.items : []).filter(x => !x.isSeparator && !x.isPaymentRow && !x.isRemainingRow);
    const purchaseTimestamps = [
      ...inv.flatMap(invoice => {
        const fallback = invoice.date || invoice.createdAt || "";
        const purchaseItems = (Array.isArray(invoice.items) ? invoice.items : []).filter(item => !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow
          && (String(item.details || "").trim() || num(item.total) !== 0));
        return purchaseItems.length ? purchaseItems.map(item => item.createdAt || fallback) : [fallback];
      }),
      ...sheet.filter(row => String(row.details || "").trim() || num(row.total) !== 0)
        .map(row => row.createdAt || c.accountingSheetDate || ""),
    ].map(date => Date.parse(date)).filter(timestamp => Number.isFinite(timestamp)).sort((a,b)=>a-b);
    // Use only ledger entries: vertical invoice rows and accounting-sheet rows.
    const verticalSales = items.reduce((sum, item) => sum + num(item.total || item.unitPrice), 0);
    const accountingSales = sheet.reduce((sum, item) => sum + num(item.total || item.unitPrice), 0);
    const sales = verticalSales + accountingSales;
    const capital = [...items,...sheet].reduce((sum, item) => sum + num(item.unitCost) * num(item.quantity), 0);
    const verticalLedgerPaid = inv.reduce((sum, invoice) =>
      sum + (Array.isArray(invoice.items) ? invoice.items : []).filter(item => item.isSeparator || item.isPaymentRow)
        .reduce((itemSum, item) => itemSum + num(item.isSeparator ? item.paidAmount : item.total || item.unitPrice), 0), 0);
    const accountingLedgerPaid = sheetPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
    const paid = verticalLedgerPaid + accountingLedgerPaid;
    const quantity = [...items,...sheet].reduce((sum, item) => sum + num(item.quantity), 0);
    const remaining = Math.max(0, verticalSales - verticalLedgerPaid) + Math.max(0, accountingSales - accountingLedgerPaid);
    return {id:c.id,folder:folderName(c.folderId),name:c.name,address:c.address?.trim()||"غير مسجل",
      salary:c.salaryType?.trim() || (c.hasSalary === false ? "بدون راتب" : "غير مسجل"),
      phone:c.phone,firstPurchase:purchaseTimestamps[0] ?? null,lastPurchase:purchaseTimestamps.at(-1) ?? null,
      capital,sales,profit:sales-capital,paid,remaining,quantity};
  }),[customers,invoices,folders]);
  const active = rules.filter(r => r.key !== "none");
  const visible = active.filter(r => r.show);
  const sorted = [...rows].sort((a,b) => {
    for(const r of active) {
      const av=value(a,r.key,r.dateMode),bv=value(b,r.key,r.dateMode);
      if (av === null && bv === null) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      const delta=typeof av==="number" && typeof bv==="number" ? av-bv : String(av).localeCompare(String(bv),"ar",{numeric:true});
      if(delta) return r.direction==="asc" ? delta : -delta;
    }
    return rows.findIndex(x=>x.id===a.id)-rows.findIndex(x=>x.id===b.id);
  });
  const group = (r:Entry) => JSON.stringify(visible.map(x=>value(r,x.key,x.dateMode)));
  const totals = sorted.reduce((sum,row)=>({
    capital:sum.capital+row.capital,
    sales:sum.sales+row.sales,
    profit:sum.profit+row.profit,
    paid:sum.paid+row.paid,
    remaining:sum.remaining+row.remaining,
    quantity:sum.quantity+row.quantity,
  }),{capital:0,sales:0,profit:0,paid:0,remaining:0,quantity:0});
  const paidPercent = totals.sales > 0 ? Math.min((totals.paid / totals.sales) * 100, 100) : 0;

  const update = (i:number,patch:Partial<Rule>) => setRules(old=>old.map((r,j)=>i===j?{...r,...patch}:r));
  const moveColumn = useCallback((source:ColumnId,target:ColumnId) => setColumnOrder(old=>{
    const from=old.indexOf(source),to=old.indexOf(target);
    if(from<0||to<0||from===to)return old;
    const next=[...old];const [moved]=next.splice(from,1);next.splice(to,0,moved);return next;
  }),[]);
  useEffect(()=>{
    const stopDragging=()=>{
      draggedColumnRef.current=null;
      setDraggedColumnId(null);
    };
    window.addEventListener("pointerup",stopDragging);
    window.addEventListener("pointercancel",stopDragging);
    return ()=>{
      window.removeEventListener("pointerup",stopDragging);
      window.removeEventListener("pointercancel",stopDragging);
    };
  },[]);
  const visibleColumnOrder = columnOrder.filter(id=>visibleColumns.includes(id));
  const cellValue = (row:Entry,index:number,id:ColumnId):string|number => {
    switch(id) {
      case "sequence": return index+1;
      case "firstPurchase": return formatPurchaseTimestamp(row.firstPurchase);
      case "lastPurchase": return formatPurchaseTimestamp(row.lastPurchase);
      default: return row[id];
    }
  };
  const textualColumns = new Set<ColumnId>(["name","address","salary","phone","folder"]);
  return <section dir="rtl" className="w-full min-w-0 space-y-4 p-3 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-800">بيانات العملاء</h2>
      <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
        {searchControl}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={exporting} onClick={()=>void handleExport(false)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"><Printer size={16}/> طباعة</button>
          <button type="button" disabled={exporting} onClick={()=>void handleExport(true)} className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50"><Download size={16}/> تنزيل PDF</button>
          <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><ArrowRight size={16}/> العودة للعملاء</button>
        </div>
      </div>
    </header>
    <div className={`rounded-xl border border-slate-200 bg-white p-3 ${filterControls ? "rounded-b-none" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-700">تخصيص التصفية</p>
          <p className="mt-1 text-xs text-slate-500">{activeFilterCount ? `${format(activeFilterCount)} شروط مفعّلة` : "اضغط لإظهار شروط التصفية حسب المعلومات الشخصية والتعامل والمشتريات"}</p>
        </div>
        <button type="button" onClick={onOpenFilters} aria-expanded={Boolean(filterControls)} aria-controls="customer-filter-options" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <SlidersHorizontal size={17}/><span>تخصيص التصفية</span>
          <ChevronDown size={16} className={`transition-transform duration-200 ${filterControls?"rotate-180":""}`}/>
        </button>
      </div>
    </div>
    {filterControls && <div id="customer-filter-options">{filterControls}</div>}
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-700">الفرز المتعدد والفواصل الموحّدة</p>
          <p className="mt-1 text-xs text-slate-500">{format(active.length)} مستويات فرز فعّالة</p>
        </div>
        <button type="button" onClick={()=>{setSortPanelOpen(open=>!open);setOpenMenu(null);}} aria-expanded={sortPanelOpen} aria-controls="customer-sort-options" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <SlidersHorizontal size={17}/><span>تخصيص الفرز</span>
          <ChevronDown size={16} className={`transition-transform duration-200 ${sortPanelOpen?"rotate-180":""}`}/>
        </button>
      </div>
      {sortPanelOpen && <div id="customer-sort-options" className="mt-3 space-y-3">
        <p className="text-xs text-slate-500">الفرز يغيّر ترتيب الصفوف فقط ولا يخفي أي عميل. كل مستوى يُطبّق عند تساوي المستويات السابقة.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rules.map((r,i)=><div key={i} className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold">الفرز {(["الأول","الثاني","الثالث","الرابع"][i] || `رقم ${i+1}`)}</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={r.show} onChange={e=>update(i,{show:e.target.checked})} className="h-4 w-4"/> إظهار بالفاصل</label>
              <button type="button" aria-label={`إلغاء الفرز ${i+1}`} title="إلغاء هذا الفرز" onClick={()=>{setRules(old=>old.filter((_,j)=>j!==i));setOpenMenu(null);}} className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"><X size={15}/></button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative min-w-0">
              <button type="button" aria-label={`خاصية الفرز ${i+1}`} aria-expanded={openMenu===`key-${i}`} onClick={()=>setOpenMenu(openMenu===`key-${i}`?null:`key-${i}`)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-xs flex items-center justify-between gap-1 text-right">
                <span className="truncate">{label(r.key)}</span><ChevronDown size={14} className="shrink-0"/>
              </button>
              {openMenu===`key-${i}` && <div className="absolute top-full right-0 z-30 mt-1 max-h-60 w-max min-w-full max-w-[85vw] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {fields.map(f=><button key={f.key} type="button" onClick={()=>{update(i,{key:f.key,dateMode:f.key==="purchaseDate"?(r.dateMode||"first"):undefined});setOpenMenu(null);}} className={`block w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-blue-50 ${r.key===f.key?"bg-blue-50 font-bold text-blue-700":""}`}>{f.label}</button>)}
              </div>}
              {r.key === "purchaseDate" && <div className="relative mt-2 min-w-0">
                <button type="button" aria-label={`نوع تاريخ الشراء للفرز ${i+1}`} aria-expanded={openMenu===`date-${i}`} onClick={()=>setOpenMenu(openMenu===`date-${i}`?null:`date-${i}`)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-xs flex items-center justify-between gap-1 text-right">
                  <span>{r.dateMode==="last"?"تاريخ آخر شراء":"تاريخ أول شراء"}</span><ChevronDown size={14} className="shrink-0"/>
                </button>
                {openMenu===`date-${i}` && <div className="absolute top-full right-0 z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                  {([{value:"first",label:"تاريخ أول شراء"},{value:"last",label:"تاريخ آخر شراء"}] as const).map(option=><button key={option.value} type="button" onClick={()=>{update(i,{dateMode:option.value});setOpenMenu(null);}} className={`block w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-blue-50 ${(r.dateMode||"first")===option.value?"bg-blue-50 font-bold text-blue-700":""}`}>{option.label}</button>)}
                </div>}
              </div>}
            </div>
            <div className="relative min-w-0">
              <button type="button" aria-label={`اتجاه الفرز ${i+1}`} aria-expanded={openMenu===`direction-${i}`} onClick={()=>setOpenMenu(openMenu===`direction-${i}`?null:`direction-${i}`)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-xs flex items-center justify-between gap-1 text-right">
                <span>{r.direction==="asc"?"تصاعدي ↑":"تنازلي ↓"}</span><ChevronDown size={14} className="shrink-0"/>
              </button>
              {openMenu===`direction-${i}` && <div className="absolute top-full right-0 z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {(["asc","desc"] as const).map(direction=><button key={direction} type="button" onClick={()=>{update(i,{direction});setOpenMenu(null);}} className={`block w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-blue-50 ${r.direction===direction?"bg-blue-50 font-bold text-blue-700":""}`}>{direction==="asc"?"تصاعدي ↑":"تنازلي ↓"}</button>)}
              </div>}
            </div>
          </div>
        </div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={()=>setRules(old=>[...old,{key:"none",direction:"asc",show:false}])} className="rounded-lg bg-blue-600 text-white px-3 py-2 text-xs font-bold hover:bg-blue-700">+ إضافة فرز</button>
        {rules.length>4 && <button type="button" onClick={()=>setRules(old=>old.slice(0,-1))} className="rounded-lg border border-red-200 text-red-700 px-3 py-2 text-xs">حذف آخر فرز</button>}
        <button type="button" onClick={()=>setRules(old=>old.map(r=>({...r,show:true})))} className="rounded-lg border px-3 py-2 text-xs">إظهار الكل بالفاصل</button>
        <button type="button" onClick={()=>setRules(old=>old.map(r=>({...r,show:false})))} className="rounded-lg border px-3 py-2 text-xs">إخفاء الفواصل</button>
        <button type="button" onClick={()=>setRules(defaults())} className="rounded-lg border px-3 py-2 text-xs flex items-center gap-1"><RotateCcw size={14}/> إعادة ضبط</button>
        </div>
      </div>}
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-700">تخصيص أعمدة الجدول</p>
          <p className="mt-1 text-xs text-slate-500">{visibleColumns.length} من {columnOrder.length} أعمدة ظاهرة</p>
        </div>
        <button type="button" onClick={()=>setColumnsPanelOpen(open=>!open)} aria-expanded={columnsPanelOpen} aria-controls="customer-column-options" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <SlidersHorizontal size={17}/><span>تخصيص الأعمدة</span>
          <ChevronDown size={16} className={`transition-transform duration-200 ${columnsPanelOpen?"rotate-180":""}`}/>
        </button>
      </div>
      {columnsPanelOpen && <div id="customer-column-options" className="mt-3">
        <p className="mb-2 text-xs text-slate-500">فعّل أو أزل علامة الصح لإظهار العمود أو إخفائه. اسحب مقبض ☷ لترتيب الأعمدة، ويجب إبقاء عمود واحد ظاهر على الأقل.</p>
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-2 [touch-action:pan-x]">
        {columnOrder.map((id,index)=><div key={id} data-column-id={id} onPointerEnter={()=>{const source=draggedColumnRef.current;if(source&&source!==id)moveColumn(source,id);}} onDragOver={event=>{event.preventDefault();const source=draggedColumnRef.current;if(source&&source!==id)moveColumn(source,id);}} onDrop={event=>{event.preventDefault();draggedColumnRef.current=null;setDraggedColumnId(null);}} className={`flex shrink-0 items-center gap-2 rounded-lg border px-2 py-2 transition-colors ${draggedColumnId===id?"border-blue-500 bg-blue-50 shadow-sm":"border-slate-300 bg-[#eef3fa]"}`}>
          <button type="button" draggable aria-label={`اسحب لترتيب عمود ${columnLabel(id)}`} onDragStart={event=>{draggedColumnRef.current=id;setDraggedColumnId(id);event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",id);}} onDragEnd={()=>{draggedColumnRef.current=null;setDraggedColumnId(null);}} onPointerDown={event=>{if(!event.isPrimary)return;if(event.pointerType==="touch"||event.pointerType==="pen"){event.preventDefault();draggedColumnRef.current=id;setDraggedColumnId(id);}}} className="touch-none cursor-grab rounded text-slate-500 active:cursor-grabbing" title="اسحب لترتيب العمود"><GripVertical size={17}/></button>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-700">
            <span>{columnLabel(id)}</span>
            <input type="checkbox" checked={visibleColumns.includes(id)} disabled={visibleColumns.length===1&&visibleColumns.includes(id)} onChange={event=>setVisibleColumns(old=>event.target.checked?[...old,id]:old.filter(column=>column!==id))} className="h-4 w-4 shrink-0"/>
          </label>
          <button type="button" aria-label={`تحريك ${columnLabel(id)} إلى اليمين`} title="تحريك إلى اليمين" disabled={index===0} onClick={()=>{const target=columnOrder[index-1];if(target)moveColumn(id,target);}} className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronRight size={15}/></button>
          <button type="button" aria-label={`تحريك ${columnLabel(id)} إلى اليسار`} title="تحريك إلى اليسار" disabled={index===columnOrder.length-1} onClick={()=>{const target=columnOrder[index+1];if(target)moveColumn(id,target);}} className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronLeft size={15}/></button>
        </div>)}
      </div>
      </div>}
    </div>
    <p className="text-sm font-semibold text-slate-600">عدد العملاء: {format(sorted.length)} من {format(totalCustomerCount)}</p>
    <div className="customer-data-table-scroll w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-slate-400 bg-white shadow-sm" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}>
      <table className="w-max min-w-full border-collapse text-[10px] sm:text-xs text-center text-slate-800 table-auto">
        <thead className="bg-[#94acd1] text-slate-950">
          <tr>{visibleColumnOrder.map(id=><th key={id} className="border border-slate-400/70 px-1.5 py-2 whitespace-nowrap font-bold text-center">{columnLabel(id)}</th>)}</tr>
        </thead>
        <tbody>
          {sorted.map((r,i)=><React.Fragment key={r.id}>
            {visible.length>0 && (i===0 || group(r)!==group(sorted[i-1])) && <tr><td colSpan={visibleColumnOrder.length} className="border border-slate-300 bg-[#e7eef9] px-1.5 py-1.5 font-bold text-slate-800 text-center whitespace-normal break-words">{visible.map(x=>`${ruleLabel(x)}: ${ruleValueLabel(r,x)}`).join(" — ")}</td></tr>}
            <tr
              data-customer-row-id={r.id}
              role="button"
              tabIndex={0}
              aria-label={`فتح إحصائيات ${r.name}`}
              title="اضغط مطولاً لعرض خيارات العميل"
              onPointerDown={event => {
                if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
                startCustomerRowLongPress(r.id, event.currentTarget, event.pointerId, event.clientX, event.clientY);
              }}
              onPointerMove={event => {
                const start = customerRowPointerStartRef.current;
                if (!start || start.pointerId !== event.pointerId) return;
                if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelCustomerRowLongPress();
              }}
              onPointerUp={cancelCustomerRowLongPress}
              onPointerCancel={cancelCustomerRowLongPress}
              onPointerLeave={event => { if (event.pointerType === "mouse") cancelCustomerRowLongPress(); }}
              onContextMenu={event => {
                event.preventDefault();
                placeCustomerMenuAt(event.clientX || event.currentTarget.getBoundingClientRect().right, event.clientY || event.currentTarget.getBoundingClientRect().top, 112);
                setOpenCustomerMenuId(r.id);
              }}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  placeCustomerMenuAt(bounds.right, bounds.top, 112);
                  setOpenCustomerMenuId(r.id);
                }
              }}
              className="customer-data-table-row select-none cursor-pointer focus:outline-none transition-colors duration-150 hover:bg-blue-50/40"
            >
              {visibleColumnOrder.map(id=>{const cell=cellValue(r,i,id);return <td key={id} className={`border border-slate-300 px-1 py-2 text-center align-middle ${textualColumns.has(id)?"whitespace-normal":"whitespace-nowrap"}`}>{textualColumns.has(id)?wordLines(String(cell)).map((line,k)=><span key={k} className="block leading-5 whitespace-nowrap">{line}</span>):typeof cell==="number"?format(cell):cell}{id===visibleColumnOrder[0]&&openCustomerMenuId===r.id&&<div ref={customerMenuRef} role="menu" aria-label={`خيارات العميل ${r.name}`} style={{position:"fixed",top:customerMenuPosition.top,left:customerMenuPosition.left,zIndex:99999}} className="w-48 rounded-xl border border-slate-200 bg-white p-1.5 text-right shadow-2xl" onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}><button type="button" role="menuitem" onClick={()=>{rememberCustomerTablePosition(r.id);setOpenCustomerMenuId(null);onOpenCustomerLedger(r.id);}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-slate-50"><BookOpen className="h-4 w-4"/>فتح الحساب</button><button type="button" role="menuitem" onClick={()=>{setOpenCustomerMenuId(null);onOpenCustomerStatistics(r.id);}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-slate-50"><BarChart3 className="h-4 w-4"/>فتح الإحصائيات</button></div>}</td>;})}
            </tr>
          </React.Fragment>)}
        </tbody>
      </table>
    </div>
    <section className="space-y-3 rounded-xl border border-violet-100 bg-white p-3 sm:p-4">
      <div>
        <h3 className="text-base font-bold text-violet-900">ملخص أرقام الورقة الحسابية</h3>
        <p className="mt-1 text-xs text-slate-500">إجماليات رأس المال والبيع والربح والمشتريات والتسديد للعملاء المعروضين في الجدول فقط.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ["إجمالي مبلغ رأس المال", totals.capital, "border-slate-200 bg-slate-50 text-slate-800"],
          ["إجمالي مبلغ البيع", totals.sales, "border-indigo-200 bg-indigo-50 text-indigo-900"],
          ["إجمالي مبلغ الربح", totals.profit, "border-violet-200 bg-violet-50 text-violet-900"],
        ].map(([label, amount, tone]) => <article key={String(label)} className={"rounded-xl border p-3 text-center " + tone}>
          <span className="block text-xs font-semibold">{label}</span><strong className="mt-2 block text-xl font-extrabold" dir="ltr">{format(Number(amount))}</strong>
        </article>)}
      </div>
      <div aria-hidden="true" className="border-t-2 border-dashed border-slate-200 pt-3" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ["إجمالي مبلغ المشتريات", totals.sales, "border-blue-200 bg-blue-50 text-blue-900"],
          ["إجمالي مبلغ التسديد", totals.paid, "border-emerald-200 bg-emerald-50 text-emerald-900"],
          ["إجمالي مبلغ المتبقي", totals.remaining, "border-amber-200 bg-amber-50 text-amber-950"],
        ].map(([label, amount, tone]) => <article key={String(label)} className={"rounded-xl border p-3 text-center " + tone}>
          <span className="block text-xs font-semibold">{label}</span><strong className="mt-2 block text-xl font-extrabold" dir="ltr">{format(Number(amount))}</strong>
        </article>)}
      </div>
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
        <div className="flex items-center justify-between gap-3"><strong className="text-sm text-yellow-950">مجموع العدد</strong><strong className="text-lg font-extrabold text-yellow-950" dir="ltr">{format(totals.quantity)}</strong></div>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600"><span>نسبة التسديد من إجمالي المشتريات</span><span dir="ltr">{format(paidPercent)}%</span></div>
        <div dir="rtl" className="h-3 overflow-hidden rounded-full bg-amber-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: paidPercent + "%" }} /></div>
      </div>
    </section>
    {/* Separate full-width print source: exports every column and row, not the scrolled viewport. */}
    {exporting && <div id="customer-data-export" dir="rtl" aria-hidden="true" style={{position:"fixed",left:"-20000px",top:0,width:"1100px",background:"#fff",padding:"12px",fontFamily:"Cairo, Arial, sans-serif",color:"#0f172a"}}>
      <h2 style={{textAlign:"center",fontSize:"18px",fontWeight:700,marginBottom:"8px"}}>بيانات العملاء</h2>
      <p style={{textAlign:"right",fontSize:"12px",marginBottom:"10px"}}>عدد العملاء: {format(sorted.length)} — المبالغ بالدينار العراقي</p>
      <table dir="rtl" style={{width:"100%",borderCollapse:"collapse",tableLayout:"auto",fontSize:"11px",textAlign:"center"}}>
        <thead><tr>{visibleColumnOrder.map(id=><th key={id} style={{border:"1px solid #94a3b8",background:"#94acd1",padding:"5px 3px",fontWeight:700}}>{columnLabel(id)}</th>)}</tr></thead>
        <tbody>{sorted.map((r,i)=><React.Fragment key={r.id}>
          {visible.length>0 && (i===0 || group(r)!==group(sorted[i-1])) && <tr><td colSpan={visibleColumnOrder.length} style={{border:"1px solid #cbd5e1",background:"#e7eef9",padding:"5px",fontWeight:700}}>{visible.map(x=>`${ruleLabel(x)}: ${ruleValueLabel(r,x)}`).join(" — ")}</td></tr>}
          <tr>{visibleColumnOrder.map(id=>{const cell=cellValue(r,i,id);return <td key={id} style={{border:"1px solid #cbd5e1",padding:"5px 3px",verticalAlign:"middle",overflowWrap:"anywhere"}}>{textualColumns.has(id)?wordLines(String(cell)).map((line,k)=><span key={k} style={{display:"block"}}>{line}</span>):typeof cell==="number"?format(cell):cell}</td>;})}</tr>
        </React.Fragment>)}</tbody>
      </table>
    </div>}
    <p className="text-xs text-slate-500">المبالغ بالدينار العراقي. الإجماليات تخص العملاء المعروضين فقط، وتُحسب حصراً من قيود سجل الديون العمودي والقائمة الحسابية، ولا تعتمد على قسم الدفعات المستقل. رأس المال والربح يعتمدان على تكلفة الشراء المسجلة.</p>
  </section>;
}
