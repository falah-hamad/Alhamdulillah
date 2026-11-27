import React, { useMemo, useState } from "react";
import { Activity, Plus, Trash2, Search, RotateCcw } from "lucide-react";
import type { Customer, CustomerFolder, Invoice, Payment, Product, Supplier } from "../types";
import { formatThousands } from "../utils/numberFormatting";

type EventKind = "sale" | "payment" | "supplierPurchase" | "supplierPayment" | "customerAdded" | "stockAdded";
type LogEvent = { id: string; kind: EventKind; timestamp: string; person: string; customerId?: string; product: string; category: string; quantity: number | null; amount: number | null; detail: string; source: string; address?: string; folderId?: string; salaryType?: string; profession?: string };
type GroupField = "date" | "kind" | "customer" | "category" | "address" | "folder" | "salaryType" | "profession";
type Filter = { id: number; kind: string; timeMode: string; date: string; from: string; to: string; time: string; customerId: string; category: string; address: string; folderId: string; salaryType: string; profession: string; show: boolean; groupBy: GroupField[] };
type Props = { customers: Customer[]; folders: CustomerFolder[]; products: Product[]; invoices: Invoice[]; payments: Payment[]; suppliers: Supplier[]; currency: string };
const kindLabels: Record<EventKind, string> = { sale: "بيع", payment: "تسديد", supplierPurchase: "شراء من مورد", supplierPayment: "تسديد مورد", customerAdded: "إضافة عميل جديد", stockAdded: "إدخال مخزون" };
const emptyFilter = (id: number): Filter => ({ id, kind: "all", timeMode: "all", date: "", from: "", to: "", time: "", customerId: "", category: "", address: "", folderId: "", salaryType: "", profession: "", show: true, groupBy: ["date"] });
const groupFieldOptions: Array<[GroupField, string]> = [["date", "التاريخ"], ["kind", "نوع الحركة"], ["customer", "العميل"], ["category", "نوع البضاعة"], ["address", "العنوان"], ["folder", "المجلد"], ["salaryType", "نوع الراتب"], ["profession", "الوظيفة / المهنة"]];
const txt = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const dayKey = (value: string) => { if (!value) return ""; const d = new Date(value); if (!Number.isNaN(d.getTime())) return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-"); const m=value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/); return m ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : value.slice(0,10); };
const timeKey = (value: string) => { const d=new Date(value); return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const saleRow = (item: Invoice["items"][number]) => !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow;
const jobFor = (customer?: Customer) => { const entry=Object.entries(customer?.profile || {}).find(([key,value]) => /مهن|وظيف|عمل|occupation|profession|job/i.test(key) && txt(value)); return entry ? txt(entry[1]) : ""; };

export default function ActivityLogView({ customers, folders, products, invoices, payments, suppliers, currency }: Props) {
  const [filters,setFilters]=useState<Filter[]>([emptyFilter(1)]); const [applied,setApplied]=useState<Filter[]>([emptyFilter(1)]); const [nextId,setNextId]=useState(2);
  const productById=useMemo(()=>new Map(products.map(p=>[p.id,p])),[products]); const customerById=useMemo(()=>new Map(customers.map(c=>[c.id,c])),[customers]); const folderById=useMemo(()=>new Map(folders.map(folder=>[folder.id,folder])),[folders]); const invoiceById=useMemo(()=>new Map(invoices.map(invoice=>[invoice.id,invoice])),[invoices]);
  const events=useMemo<LogEvent[]>(()=>{
    const out:LogEvent[]=[];
    invoices.filter(i=>!i.isDeleted).forEach(i=>{ const c=customerById.get(i.customerId); (i.items||[]).filter(saleRow).forEach(item=>{const p=item.productId?productById.get(item.productId):undefined; out.push({id:`sale-${i.id}-${item.id}`,kind:"sale",timestamp:i.createdAt||i.date,person:i.customerName||c?.name||"عميل",customerId:i.customerId,product:item.details||p?.name||"بضاعة",category:p?.category||"",quantity:num(item.quantity),amount:num(item.total||item.unitPrice),detail:"",source:i.displayName||`كشف ${i.invoiceNumber||""}`.trim()||"كشف حساب",address:i.customerAddress||c?.address||"",folderId:c?.folderId,salaryType:c?.salaryType||"",profession:jobFor(c)});});});
    payments.filter(p=>!p.isDeleted).forEach(p=>{const c=customerById.get(p.customerId);out.push({id:`payment-${p.id}`,kind:"payment",timestamp:p.createdAt||p.date,person:p.customerName||c?.name||"عميل",customerId:p.customerId,product:"—",category:"",quantity:null,amount:num(p.amount),detail:[p.method,p.notes].filter(Boolean).join(" — ")||"تسديد مسجل",source:p.invoiceId?(invoiceById.get(p.invoiceId)?.displayName||`كشف ${invoiceById.get(p.invoiceId)?.invoiceNumber||""}`):"سجل الديون",address:c?.address||"",folderId:c?.folderId,salaryType:c?.salaryType||"",profession:jobFor(c)});});
    suppliers.filter(s=>!s.isDeleted).forEach(s=>{(s.transactions||[]).forEach(t=>{if(t.type==="purchase"){const its=t.items?.length?t.items:[{id:t.id,productId:undefined,details:"شراء من مورد",quantity:0,unit:"",unitPrice:t.amount,total:t.amount}];its.forEach(i=>{const p=i.productId?productById.get(i.productId):undefined;out.push({id:`purchase-${t.id}-${i.id}`,kind:"supplierPurchase",timestamp:t.date,person:s.name,product:i.details||p?.name||"شراء من مورد",category:p?.category||"",quantity:num(i.quantity)||null,amount:num(i.total||i.unitPrice),detail:t.notes||"شراء مسجل من المورد",source:"معاملة مورد"});});}else out.push({id:`supplier-payment-${t.id}`,kind:"supplierPayment",timestamp:t.date,person:s.name,product:"—",category:"",quantity:null,amount:num(t.amount),detail:[t.method,t.notes].filter(Boolean).join(" — ")||"تسديد للمورد",source:"سجل المورد"});});});
    customers.filter(c=>!c.isDeleted).forEach(c=>out.push({id:`new-customer-${c.id}`,kind:"customerAdded",timestamp:c.createdAt,person:c.name,customerId:c.id,product:"—",category:"",quantity:null,amount:null,detail:"تمت إضافة العميل",source:"بيانات العميل",address:c.address||"",folderId:c.folderId,salaryType:c.salaryType||"",profession:jobFor(c)}));
    products.filter(p=>!p.isDeleted).forEach(p=>(p.stockMovements||[]).filter(m=>m.type==="restock"||m.type==="opening").forEach(m=>out.push({id:`stock-${p.id}-${m.id}`,kind:"stockAdded",timestamp:m.createdAt,person:m.customerName||p.supplierName||"المخزون",product:p.name,category:p.category||"",quantity:num(m.quantity),amount:num(m.unitCost)*num(m.quantity),detail:m.note||"إضافة كمية للمخزون",source:"حركة مخزون"})));
    return out.filter(e=>!!e.timestamp).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
  },[customers,customerById,invoiceById,invoices,payments,productById,products,suppliers]);
  const categories=useMemo(()=>Array.from(new Set(products.map(p=>txt(p.category)).filter(Boolean))).sort(),[products]);
  const addresses=useMemo(()=>Array.from(new Set(customers.map(c=>txt(c.address)).filter(Boolean))).sort(),[customers]);
  const salaries=useMemo(()=>Array.from(new Set(customers.map(c=>txt(c.salaryType)).filter(Boolean))).sort(),[customers]);
  const professions=useMemo(()=>Array.from(new Set(customers.map(jobFor).filter(Boolean))).sort(),[customers]);
  const matches=(e:LogEvent,f:Filter)=>{if(f.kind!=="all"&&e.kind!==f.kind)return false;const d=dayKey(e.timestamp);if(f.timeMode==="date"&&d!==f.date)return false;if(f.timeMode==="range"&&((f.from&&d<f.from)||(f.to&&d>f.to)))return false;if(f.timeMode==="time"&&(d!==f.date||(f.time&&timeKey(e.timestamp)!==f.time)))return false;if(f.customerId&&e.customerId!==f.customerId)return false;if(f.category&&e.category!==f.category)return false;if(f.address&&e.address!==f.address)return false;if(f.folderId&&e.folderId!==f.folderId)return false;if(f.salaryType&&e.salaryType!==f.salaryType)return false;if(f.profession&&e.profession!==f.profession)return false;return true;};
  const rows=events.filter(event=>applied.some(filter=>matches(event,filter)));
  type ResultGroup = { id: string; filter: Filter; events: LogEvent[]; sample?: LogEvent; grouped: boolean };
  const resultGroups: ResultGroup[] = [];
  const seenEventIds = new Set<string>();
  const valueFor = (event: LogEvent, field: GroupField) => {
    if (field === "date") return dayKey(event.timestamp);
    if (field === "kind") return event.kind;
    if (field === "customer") return event.customerId || event.person;
    if (field === "category") return event.category || "غير مصنف";
    if (field === "address") return event.address || "بدون عنوان";
    if (field === "folder") return event.folderId || "بدون مجلد";
    if (field === "salaryType") return event.salaryType || "بدون راتب";
    return event.profession || "بدون مهنة";
  };
  applied.forEach(filter => {
    const matched = events.filter(event => matches(event, filter) && !seenEventIds.has(event.id));
    matched.forEach(event => seenEventIds.add(event.id));
    if (!filter.show) {
      if (matched.length) resultGroups.push({ id: `flat-${filter.id}`, filter, events: matched, grouped: false });
      return;
    }
    const buckets = new Map<string, LogEvent[]>();
    matched.forEach(event => {
      const key = filter.groupBy.length ? JSON.stringify(filter.groupBy.map(field => valueFor(event, field))) : "all";
      const bucket = buckets.get(key) || [];
      bucket.push(event);
      buckets.set(key, bucket);
    });
    if (buckets.size === 0) buckets.set("empty", []);
    buckets.forEach((groupEvents, key) => resultGroups.push({
      id: `group-${filter.id}-${key}`, filter, events: groupEvents, sample: groupEvents[0], grouped: true,
    }));
  });
  const filterSummary = (filter: Filter, sample?: LogEvent) => {
    const groupedBy = new Set(filter.groupBy);
    const time = groupedBy.has("date") && sample
      ? (() => { const key = dayKey(sample.timestamp); const [year, month, day] = key.split("-"); return key ? `${day}/${month}/${year}` : "غير محدد"; })()
      : filter.timeMode === "range" ? `من ${filter.from || "البداية"} إلى ${filter.to || "النهاية"}`
      : filter.timeMode === "date" ? filter.date
      : filter.timeMode === "time" ? `${filter.date}${filter.time ? " — " + filter.time : ""}`
      : groupedBy.has("date") && !sample ? "لا توجد حركات" : "الكل";
    const kind = filter.kind !== "all" ? kindLabels[filter.kind as EventKind] || filter.kind
      : groupedBy.has("kind") && sample ? kindLabels[sample.kind] : "الكل";
    const extra = [
      filter.customerId ? `العميل: ${customerById.get(filter.customerId)?.name || ""}` : groupedBy.has("customer") && sample ? `العميل: ${sample.person}` : "",
      filter.category ? `نوع البضاعة: ${filter.category}` : groupedBy.has("category") && sample ? `نوع البضاعة: ${sample.category || "غير مصنف"}` : "",
      filter.address ? `العنوان: ${filter.address}` : groupedBy.has("address") && sample ? `العنوان: ${sample.address || "بدون عنوان"}` : "",
      filter.folderId ? `المجلد: ${folderById.get(filter.folderId)?.name || ""}` : groupedBy.has("folder") && sample ? `المجلد: ${folderById.get(sample.folderId || "")?.name || "بدون مجلد"}` : "",
      filter.salaryType ? `نوع الراتب: ${filter.salaryType}` : groupedBy.has("salaryType") && sample ? `نوع الراتب: ${sample.salaryType || "بدون راتب"}` : "",
      filter.profession ? `الوظيفة / المهنة: ${filter.profession}` : groupedBy.has("profession") && sample ? `الوظيفة / المهنة: ${sample.profession || "بدون مهنة"}` : "",
    ].filter(Boolean).join(" — ") || "الكل";
    return { time, kind, extra };
  };
  const columnsFor = (filter: Filter, grouped: boolean) => {
    const groupedBy = new Set(filter.groupBy);
    if (!grouped) return [
      { key: "kind", label: "نوع الحركة" }, { key: "timestamp", label: "التاريخ والوقت" },
      { key: "person", label: "العميل / المورد" }, { key: "product", label: "البضاعة والتفاصيل" },
      { key: "source", label: "الكشف / القائمة" }, { key: "quantity", label: "الكمية" }, { key: "amount", label: "المبلغ" },
    ];
    return [
      ...(filter.kind === "all" && !groupedBy.has("kind") ? [{ key: "kind", label: "نوع الحركة" }] : []),
      ...(filter.timeMode === "all" && !groupedBy.has("date") ? [{ key: "timestamp", label: "التاريخ والوقت" }] : []),
      ...(!filter.customerId && !groupedBy.has("customer") ? [{ key: "person", label: "العميل / المورد" }] : []),
      { key: "product", label: "البضاعة والتفاصيل" }, { key: "source", label: "الكشف / القائمة" },
      { key: "quantity", label: "الكمية" }, { key: "amount", label: "المبلغ" },
    ];
  };
  const renderEventCell = (event: LogEvent, key: string) => {
    if (key === "kind") return kindLabels[event.kind];
    if (key === "timestamp") return new Date(event.timestamp).toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" });
    if (key === "person") return event.person;
    if (key === "product") return <>{event.product}{event.detail && event.detail !== "—" && <span className="mt-1 block text-xs text-slate-500">{event.detail}</span>}</>;
    if (key === "source") return event.source || "—";
    if (key === "quantity") return event.quantity === null ? "—" : event.quantity.toLocaleString("en-US");
    if (key === "amount") return event.amount === null ? "—" : `${formatThousands(event.amount)} ${currency}`;
    return "—";
  };
  const patch=(id:number,p:Partial<Filter>)=>setFilters(fs=>fs.map(f=>f.id===id?{...f,...p}:f));
  const selectClass="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  const field=(label:string,value:string,onChange:(v:string)=>void,options:Array<[string,string]>)=><label className="block min-w-0"><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span><select className={selectClass} value={value} onChange={e=>onChange(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
  const dateInput=(label:string,value:string,onChange:(v:string)=>void)=><label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span><input className={selectClass} type="date" value={value} onChange={e=>onChange(e.target.value)}/></label>;
  return <section dir="rtl" className="space-y-4 p-3 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-gradient-to-l from-blue-50 to-white p-4"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Activity className="h-5 w-5"/></span><div><h2 className="font-extrabold text-slate-900">سجل الحركات</h2><p className="mt-1 text-xs text-slate-500">فرز المبيعات والتسديدات والمشتريات حسب التاريخ والبيانات المرتبطة.</p></div></div><div className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm">الحركات المطابقة: {rows.length}</div></div>
    <div className="space-y-3">{filters.map((f,index)=><div key={f.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">شرط الفرز {index+1}</span>{index>0&&<span className="text-xs font-bold text-indigo-600">أو</span>}</div><label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={f.show} onChange={e=>patch(f.id,{show:e.target.checked})}/>عرض النتائج ببطاقات قابلة للفتح والطي</label>{filters.length>1&&<button type="button" onClick={()=>setFilters(fs=>fs.filter(x=>x.id!==f.id))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="حذف الشرط"><Trash2 className="h-4 w-4"/></button>}</div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {field("نوع الحركة",f.kind,v=>patch(f.id,{kind:v}),[["all","الكل"],...Object.entries(kindLabels)])}
      {field("الطابع الزمني",f.timeMode,v=>patch(f.id,{timeMode:v}),[["all","كل الأوقات"],["time","وقت محدد"],["date","يوم محدد"],["range","فترة زمنية"]])}
      {f.timeMode==="time"&&dateInput("اليوم",f.date,v=>patch(f.id,{date:v}))}
      {f.timeMode==="time"&&<label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">الساعة (اختياري)</span><input className={selectClass} type="time" value={f.time} onChange={e=>patch(f.id,{time:e.target.value})}/></label>}
      {f.timeMode==="date"&&dateInput("التاريخ",f.date,v=>patch(f.id,{date:v}))}
      {f.timeMode==="range"&&dateInput("من تاريخ",f.from,v=>patch(f.id,{from:v}))}
      {f.timeMode==="range"&&dateInput("إلى تاريخ",f.to,v=>patch(f.id,{to:v}))}
      {field("العميل",f.customerId,v=>patch(f.id,{customerId:v}),[["","كل العملاء"],...customers.map(c=>[c.id,c.name] as [string,string])])}
      {field("نوع البضاعة / التصنيف",f.category,v=>patch(f.id,{category:v}),[["","كل الأنواع"],...categories.map(x=>[x,x] as [string,string])])}
      {field("العنوان",f.address,v=>patch(f.id,{address:v}),[["","كل العناوين"],...addresses.map(x=>[x,x] as [string,string])])}
      {field("المجلد",f.folderId,v=>patch(f.id,{folderId:v}),[["","كل المجلدات"],...folders.map(x=>[x.id,x.name] as [string,string])])}
      {field("نوع الراتب",f.salaryType,v=>patch(f.id,{salaryType:v}),[["","كل الأنواع"],...salaries.map(x=>[x,x] as [string,string])])}
      {field("الوظيفة / المهنة",f.profession,v=>patch(f.id,{profession:v}),[["","كل الوظائف"],...professions.map(x=>[x,x] as [string,string])])}
    </div>{f.show&&<div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="mb-2 text-xs font-bold text-slate-700">أنشئ بطاقة جديدة عند تغيّر:</p><div className="flex flex-wrap gap-x-4 gap-y-2">{groupFieldOptions.map(([key,label])=><label key={key} className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={f.groupBy.includes(key)} onChange={e=>patch(f.id,{groupBy:e.target.checked?[...f.groupBy,key]:f.groupBy.filter(value=>value!==key)})}/>{label}{key==="date"&&f.timeMode==="range"?" (يومي)":""}</label>)}</div></div>}</div>)}</div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setFilters(fs=>[...fs,emptyFilter(nextId)]);setNextId(i=>i+1);}} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50"><Plus className="h-4 w-4"/>إضافة شرط «أو»</button><button type="button" onClick={()=>setApplied(filters)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700"><Search className="h-4 w-4"/>تطبيق الفرز</button><button type="button" onClick={()=>{const f=[emptyFilter(1)];setFilters(f);setApplied(f);setNextId(2);}} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"><RotateCcw className="h-4 w-4"/>إعادة ضبط</button></div>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1"><h3 className="font-bold text-slate-800">نتائج الحركات</h3><span className="text-xs text-slate-500">عدد الحركات المطابقة: {rows.length}</span></div>
      {resultGroups.map((group, groupIndex) => {
        const summary = filterSummary(group.filter, group.sample);
        const previousGroup = groupIndex > 0 ? resultGroups[groupIndex - 1] : undefined;
        const previousSummary = previousGroup && previousGroup.filter.id === group.filter.id
          ? filterSummary(previousGroup.filter, previousGroup.sample)
          : undefined;
        const showTime = !previousSummary || summary.time !== previousSummary.time;
        const showKind = !previousSummary || summary.kind !== previousSummary.kind;
        const columns = columnsFor(group.filter, group.grouped);
        const table = <><div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">جدول نتائج الفرز <span className="font-normal text-slate-500">({group.events.length})</span></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full border-collapse text-right text-sm"><thead className="bg-blue-100 text-slate-800"><tr>{columns.map(column => <th key={column.key} className="border border-blue-200 px-3 py-3 font-bold">{column.label}</th>)}</tr></thead><tbody>{group.events.map(event => <tr key={event.id} className="hover:bg-blue-50/50">{columns.map(column => <td key={column.key} className="border border-slate-200 px-3 py-3 align-top">{renderEventCell(event, column.key)}</td>)}</tr>)}{group.events.length===0&&<tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">ماكو حركات مطابقة لهذا الفرز.</td></tr>}</tbody></table></div></>;
        if (!group.grouped) return <article key={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{table}</article>;
        return <details key={group.id} open className="group overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none bg-blue-200 text-slate-900 [&::-webkit-details-marker]:hidden">
            <div className="grid grid-cols-2 divide-x divide-x-reverse divide-blue-300 text-center text-xs font-bold sm:grid-cols-3">
              <div className="px-2 py-3">{showTime && <>الطابع الزمني: {summary.time}</>}</div>
              <div className="px-2 py-3">{showKind && <>نوع الحركة: {summary.kind}</>}</div>
              <div className="px-2 py-3">{summary.extra}</div>
            </div>
            <div className="border-t border-blue-300/70 px-3 py-1 text-left text-[10px] font-semibold text-slate-600"><span className="group-open:hidden">اضغط للفتح ▾</span><span className="hidden group-open:inline">اضغط للطي ▴</span></div>
          </summary>
          {table}
        </details>;
      })}
      {resultGroups.length===0&&<div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-500">ماكو حركات مطابقة للفرز المحدد.</div>}
    </div>
  </section>;
}
