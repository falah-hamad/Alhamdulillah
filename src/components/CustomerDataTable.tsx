import React, { useMemo, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { Customer, Invoice, Payment } from "../types";

type Key = "none" | "name" | "address" | "salary" | "phone" | "capital" | "sales" | "profit" | "paid" | "remaining" | "quantity";
type Rule = { key: Key; direction: "asc" | "desc"; show: boolean };
type Entry = { id: string; name: string; address: string; salary: string; phone: string; capital: number; sales: number; profit: number; paid: number; remaining: number; quantity: number };
const fields: { key: Key; label: string }[] = [
  {key:"none",label:"بدون فرز"},{key:"name",label:"الاسم"},{key:"address",label:"العنوان"},
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

export default function CustomerDataTable({customers,invoices,payments,onBack}: {
  customers: Customer[]; invoices: Invoice[]; payments: Payment[]; onBack: () => void;
}) {
  const [rules,setRules] = useState<Rule[]>(defaults);
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
    return {id:c.id,name:c.name,address:c.address?.trim()||"غير مسجل",
      salary:c.salaryType?.trim() || (c.hasSalary === false ? "بدون راتب" : "غير مسجل"),
      phone:c.phone,capital,sales,profit:sales-capital,paid,remaining:sales-paid,quantity};
  }),[customers,invoices,payments]);
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
            <span className="text-xs font-bold">الفرز {["الأول","الثاني","الثالث","الرابع"][i]}</span>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={r.show} onChange={e=>update(i,{show:e.target.checked})} className="h-4 w-4"/> إظهار بالفاصل</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label={`خاصية الفرز ${i+1}`} value={r.key} onChange={e=>update(i,{key:e.target.value as Key})} className="w-full min-w-0 rounded-lg border border-slate-300 p-2 text-xs">
              {fields.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select aria-label={`اتجاه الفرز ${i+1}`} value={r.direction} onChange={e=>update(i,{direction:e.target.value as Rule["direction"]})} className="w-full min-w-0 rounded-lg border border-slate-300 p-2 text-xs">
              <option value="asc">تصاعدي ↑</option><option value="desc">تنازلي ↓</option>
            </select>
          </div>
        </div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={()=>setRules(old=>old.map(r=>({...r,show:true})))} className="rounded-lg border px-3 py-2 text-xs">إظهار الكل بالفاصل</button>
        <button type="button" onClick={()=>setRules(old=>old.map(r=>({...r,show:false})))} className="rounded-lg border px-3 py-2 text-xs">إخفاء الفواصل</button>
        <button type="button" onClick={()=>setRules(defaults())} className="rounded-lg border px-3 py-2 text-xs flex items-center gap-1"><RotateCcw size={14}/> إعادة ضبط</button>
      </div>
    </div>
    <p className="text-sm font-semibold text-slate-600">عدد العملاء: {format(sorted.length)} من {format(rows.length)}</p>
    <div className="w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-max w-full border-collapse text-xs text-right">
        <thead className="bg-slate-100">
          <tr>{["ت","الاسم","العنوان","نوع الراتب","رقم الهاتف","مبلغ رأس المال","مبلغ البيع","مبلغ الربح","المبلغ المسدد","المبلغ المتبقي","عدد البضائع"].map(h=><th key={h} className="border-b border-slate-200 px-3 py-3 whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {sorted.map((r,i)=><React.Fragment key={r.id}>
            {visible.length>0 && (i===0 || group(r)!==group(sorted[i-1])) && <tr><td colSpan={11} className="bg-blue-50 px-3 py-2 font-bold text-blue-900 whitespace-nowrap">{visible.map(x=>`${label(x.key)}: ${textValue(value(r,x.key))}`).join(" — ")}</td></tr>}
            <tr className="border-b border-slate-100 hover:bg-slate-50">
              {[i+1,r.name,r.address,r.salary,r.phone,r.capital,r.sales,r.profit,r.paid,r.remaining,r.quantity].map((v,j)=><td key={j} className="px-3 py-2 whitespace-nowrap">{typeof v==="number"?format(v):v}</td>)}
            </tr>
          </React.Fragment>)}
        </tbody>
      </table>
    </div>
    <p className="text-xs text-slate-500">المبالغ بالدينار العراقي. رأس المال والربح يُحسبان من تكاليف البضاعة المسجلة؛ عند غياب تكلفة الشراء قد تكون النتائج غير مكتملة. يُعرض مجموع السجل العمودي والقائمة الحسابية.</p>
  </section>;
}
