import React, { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, RotateCcw } from "lucide-react";
import type { Customer, CustomerFolder, Invoice, Payment } from "../types";

type Key = "none" | "folder" | "name" | "address" | "salary" | "phone" | "capital" | "sales" | "profit" | "paid" | "remaining" | "quantity";
type Rule = { key: Key; direction: "asc" | "desc"; show: boolean };
type Entry = { id: string; folder: string; name: string; address: string; salary: string; phone: string; capital: number; sales: number; profit: number; paid: number; remaining: number; quantity: number };
const fields: { key: Key; label: string }[] = [
  {key:"none",label:"بدون فرز"},{key:"folder",label:"المجلد"},{key:"name",label:"الاسم"},{key:"address",label:"العنوان"},
  {key:"salary",label:"نوع الراتب"},{key:"phone",label:"رقم الهاتف"},{key:"capital",label:"مبلغ رأس المال"},
  {key:"sales",label:"مبلغ البيع"},{key:"profit",label:"مبلغ الربح"},{key:"paid",label:"المبلغ المسدد"},
  {key:"remaining",label:"المبلغ المتبقي"},{key:"quantity",label:"عدد البضائع"}
];
const defaults = (): Rule[] => [
  {key:"address",direction:"asc",show:true},{key:"salary",direction:"asc",show:true},
  {key:"remaining",direction:"desc",show:false},{key:"quantity",direction:"desc",show:false}
];
const num = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };
const format = (n: number) => n.toLocaleString("ar-IQ", {maximumFractionDigits:2});
const value = (row: Entry, key: Key): string | number => key === "none" ? "" : row[key];
const label = (key: Key) => fields.find(f => f.key === key)?.label || key;
const textValue = (v: string | number) => typeof v === "number" ? format(v) : (v || "غير مسجل");

export default function CustomerDataTable({customers,invoices,payments,folders = [],onBack}: {
  customers: Customer[]; invoices: Invoice[]; payments: Payment[]; folders?: CustomerFolder[]; onBack: () => void;
}) {
  const [rules,setRules] = useState<Rule[]>(defaults);
  const [openMenu,setOpenMenu] = useState<string | null>(null);
  const folderName = (id?: string) => {
    if (!id) return "المجلد الرئيسي";
    const folder = folders.find(f => f.id === id);
    return folder?.name || "مجلد غير متاح";
  };
  const rows = useMemo<Entry[]>(() => customers.filter(c => !c.isDeleted).map(c => {
    const inv = invoices.filter(x => x.customerId === c.id && !x.isDeleted);
    const externalPayments = payments.filter(x => x.customerId === c.id && !x.isDeleted);
    const sheet = (c.accountingSheetRows || []).filter(x => !x.isSeparator && !("isPaymentRow" in x && x.isPaymentRow) && !("isRemainingRow" in x && x.isRemainingRow));
    const sheetPayments = (c.accountingSheetPayments || []).filter(x => !(x as typeof x & {isDeleted?:boolean}).isDeleted);
    const items = inv.flatMap(x => x.items).filter(x => !x.isSeparator && !x.isPaymentRow && !x.isRemainingRow);
    const sales = items.reduce((s,x) => s+num(x.total),0) + sheet.reduce((s,x) => s+num(x.total),0);
    const capital = [...items,...sheet].reduce((s,x) => s+num(x.unitCost)*num(x.quantity),0);
    const paid = externalPayments.reduce((s,x)=>s+num(x.amount),0)
      + sheetPayments.reduce((s,x)=>s+num(x.amount),0)
      + inv.reduce((s,x)=>s+num(x.paidAmount),0);
    const quantity = [...items,...sheet].reduce((s,x)=>s+num(x.quantity),0);
    return {id:c.id,folder:folderName(c.folderId),name:c.name,address:c.address?.trim()||"غير مسجل",
      salary:c.salaryType?.trim() || (c.hasSalary === false ? "بدون راتب" : "غير مسجل"),
      phone:c.phone,capital,sales,profit:sales-capital,paid,remaining:sales-paid,quantity};
  }),[customers,invoices,payments,folders]);
  const active = rules.filter(r => r.key !== "none");
  const visible = active.filter(r => r.show);
  const sorted = [...rows].sort((a,b) => {
    for(const r of active) {
      const av=value(a,r.key),bv=value(b,r.key);
      const delta=typeof av==="number" && typeof bv==="number" ? av-bv : String(av).localeCompare(String(bv),"ar",{numeric:true});
      if(delta) return r.direction==="asc" ? delta : -delta;
    }
    return rows.findIndex(x=>x.id===a.id)-rows.findIndex(x=>x.id===b.id);
  });
  const group = (r:Entry) => JSON.stringify(visible.map(x=>value(r,x.key)));
  const update = (i:number,patch:Partial<Rule>) => setRules(old=>old.map((r,j)=>i===j?{...r,...patch}:r));
  return <section dir="rtl" className="w-full min-w-0 space-y-4 p-3 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-800">بيانات العملاء</h2>
      <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><ArrowRight size={16}/> العودة للعملاء</button>
    </header>
    <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
      <p className="text-sm font-bold text-slate-700">الفرز المتعدد والفواصل الموحّدة</p>
      <p className="text-xs text-slate-500">الفرز يغيّر ترتيب الصفوف فقط ولا يخفي أي عميل. كل مستوى يُطبّق عند تساوي المستويات السابقة.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rules.map((r,i)=><div key={i} className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold">الفرز {(["الأول","الثاني","الثالث","الرابع"][i] || `رقم ${i+1}`)}</span>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={r.show} onChange={e=>update(i,{show:e.target.checked})} className="h-4 w-4"/> إظهار بالفاصل</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative min-w-0">
              <button type="button" aria-label={`خاصية الفرز ${i+1}`} aria-expanded={openMenu===`key-${i}`} onClick={()=>setOpenMenu(openMenu===`key-${i}`?null:`key-${i}`)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-xs flex items-center justify-between gap-1 text-right">
                <span className="truncate">{label(r.key)}</span><ChevronDown size={14} className="shrink-0"/>
              </button>
              {openMenu===`key-${i}` && <div className="absolute top-full right-0 z-30 mt-1 max-h-60 w-max min-w-full max-w-[85vw] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {fields.map(f=><button key={f.key} type="button" onClick={()=>{update(i,{key:f.key});setOpenMenu(null);}} className={`block w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-blue-50 ${r.key===f.key?"bg-blue-50 font-bold text-blue-700":""}`}>{f.label}</button>)}
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
        <button type="button" onClick={()=>setRules(old=>[...old,{key:"none",direction:"asc",show:true}])} className="rounded-lg bg-blue-600 text-white px-3 py-2 text-xs font-bold hover:bg-blue-700">+ إضافة فرز</button>
        {rules.length>4 && <button type="button" onClick={()=>setRules(old=>old.slice(0,-1))} className="rounded-lg border border-red-200 text-red-700 px-3 py-2 text-xs">حذف آخر فرز</button>}
        <button type="button" onClick={()=>setRules(old=>old.map(r=>({...r,show:true})))} className="rounded-lg border px-3 py-2 text-xs">إظهار الكل بالفاصل</button>
        <button type="button" onClick={()=>setRules(old=>old.map(r=>({...r,show:false})))} className="rounded-lg border px-3 py-2 text-xs">إخفاء الفواصل</button>
        <button type="button" onClick={()=>setRules(defaults())} className="rounded-lg border px-3 py-2 text-xs flex items-center gap-1"><RotateCcw size={14}/> إعادة ضبط</button>
      </div>
    </div>
    <p className="text-sm font-semibold text-slate-600">عدد العملاء: {format(sorted.length)} من {format(rows.length)}</p>
    <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-400 bg-white shadow-sm">
      <table className="min-w-max w-full border-collapse text-xs text-center text-slate-800">
        <thead className="bg-[#94acd1] text-slate-950">
          <tr>{["ت","الاسم","العنوان","نوع الراتب","رقم الهاتف","مبلغ رأس المال","مبلغ البيع","مبلغ الربح","المبلغ المسدد","المبلغ المتبقي","عدد البضائع"].map(h=><th key={h} className="border border-slate-400/70 px-3 py-2.5 whitespace-nowrap font-bold text-center">{h}</th>)}</tr>
        </thead>
        <tbody>
          {sorted.map((r,i)=><React.Fragment key={r.id}>
            {visible.length>0 && (i===0 || group(r)!==group(sorted[i-1])) && <tr><td colSpan={11} className="border border-slate-300 bg-[#e7eef9] px-3 py-2 font-bold text-slate-800 text-center whitespace-nowrap">{visible.map(x=>`${label(x.key)}: ${textValue(value(r,x.key))}`).join(" — ")}</td></tr>}
            <tr className="hover:bg-blue-50/40">
              {[i+1,r.name,r.address,r.salary,r.phone,r.capital,r.sales,r.profit,r.paid,r.remaining,r.quantity].map((v,j)=><td key={j} className="border border-slate-300 px-3 py-2.5 whitespace-nowrap text-center">{typeof v==="number"?format(v):v}</td>)}
            </tr>
          </React.Fragment>)}
        </tbody>
      </table>
    </div>
    <p className="text-xs text-slate-500">المبالغ بالدينار العراقي. رأس المال والربح يُحسبان من تكاليف البضاعة المسجلة؛ عند غياب تكلفة الشراء قد تكون النتائج غير مكتملة. يُعرض مجموع السجل العمودي والقائمة الحسابية.</p>
  </section>;
}
