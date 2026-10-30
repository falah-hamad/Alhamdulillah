import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ContactRound, X } from "lucide-react";
import { Customer, CustomerProfile, Invoice, Payment } from "../types";

const groups: [string, [string,string,string?][]][] = [
["1. البيانات الأساسية",[["name","اسم العميل الرباعي"],["photo","صورة العميل","image"],["phone","رقم الهاتف","tel"],["address","عنوان السكن"],["occupation","المهنة أو الوظيفة"]]],
["2. المعلومات المالية والوظيفية",[["hasSalary","هل لديه راتب؟","yesNo"],["salaryType","نوع الراتب"]]],
["3. معلومات الكفيل أو الضامن",[["guarantorName","اسم الكفيل"],["guarantorPhone","رقم هاتف الكفيل","tel"],["guarantorAddress","عنوان سكن الكفيل"]]],
["4. معلومات الأرشفة",[["folderId","المجلد التابع له العميل","readonly"],["sequence","التسلسل داخل المجلد","readonly"]]]
];
const number = (value: number) => value.toLocaleString("ar-IQ", { maximumFractionDigits: 2 });
const validDate = (value: string) => Number.isFinite(Date.parse(value));

export default function CustomerProfileModal({ customer, invoices, payments, currency, onSave, onClose }: {
  customer: Customer; invoices: Invoice[]; payments: Payment[]; currency: string;
  onSave?: (customer: Customer) => Promise<void> | void; onClose: () => void;
}) {
  const [tab, setTab] = useState<"personal" | "business" | "financial" | "due" | "analytics">("personal");
  const [source, setSource] = useState<"vertical" | "accounting">("vertical");
  const [draft, setDraft] = useState<CustomerProfile>(() => ({ ...customer.profile, name: customer.name, phone: customer.phone, address: customer.address || "", salaryType: customer.salaryType || "" }));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const requestClose = () => { if (!saving && (!editing || window.confirm("إغلاق ملف العميل وإلغاء التعديلات غير المحفوظة؟"))) onClose(); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previous?.focus();
  }, []);
  const customerInvoices = invoices.filter(inv => inv.customerId === customer.id && !inv.isDeleted);
  const customerPayments = payments.filter(pay => pay.customerId === customer.id && !pay.isDeleted);
  const saleItems = source === "vertical"
    ? customerInvoices.flatMap(inv => inv.items.filter(item => !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow && (item.details.trim() || item.total !== 0)))
    : (customer.accountingSheetRows || []).filter(row => !row.isSeparator && (row.details.trim() || row.total !== 0));
  const sales = source === "vertical" ? customerInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0) : saleItems.reduce((sum, row) => sum + row.total, 0);
  // Payment records already update invoice.paidAmount; adding both would count receipts twice.
  const paid = source === "vertical" ? customerInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0) : (customer.accountingSheetPayments || []).reduce((sum, pay) => sum + pay.amount, 0);
  const remaining = source === "vertical" ? customerInvoices.reduce((sum, inv) => sum + inv.remainingAmount, 0) : Math.max(0, sales - paid);
  const costsComplete = saleItems.length > 0 && saleItems.every(item => typeof item.unitCost === "number" && Number.isFinite(item.unitCost) && item.unitCost >= 0);
  const itemSales = saleItems.reduce((sum, item) => sum + item.total, 0);
  const cost = costsComplete ? saleItems.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0) : null;
  const profit = cost !== null && Math.abs(itemSales - sales) < 0.01 ? sales - cost : null;
  const dates = customerInvoices.map(inv => inv.date).filter(validDate).sort((a,b) => Date.parse(a)-Date.parse(b));
  const overdue = customerInvoices.filter(inv => inv.remainingAmount > 0 && inv.dueDate && validDate(inv.dueDate) && inv.dueDate < new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" }));
  const stats: [string, string][] = [
    ["إجمالي المبيعات المسجلة", `${number(sales)} ${currency}`], ["إجمالي التسديدات", `${number(paid)} ${currency}`],
    ["المبلغ المتبقي", `${number(remaining)} ${currency}`], ["الربح الإجمالي المسجل", profit === null ? "غير متاح" : `${number(profit)} ${currency}`],
    ["تكلفة البضاعة وقت البيع", cost === null ? "غير متاحة بالكامل" : `${number(cost)} ${currency}`], ["هامش الربح", profit !== null && sales > 0 ? `${number(profit / sales * 100)}٪` : "غير متاح"],
    ["القطع المسجلة", number(saleItems.reduce((sum,item) => sum + item.quantity, 0))],
  ];
  if (source === "vertical") stats.push(
    ["أول / آخر تاريخ سجل", dates.length ? `${dates[0]} / ${dates[dates.length - 1]}` : "لا توجد سجلات"],
    ["مدة التعامل المسجلة", dates.length ? `${number(Math.max(0, Math.floor((Date.now()-Date.parse(dates[0]))/86400000)))} يوم` : "غير متاحة"],
    ["كشوف مفتوحة / مغلقة", `${customerInvoices.filter(inv => inv.remainingAmount > 0).length} / ${customerInvoices.filter(inv => inv.grandTotal > 0 && inv.remainingAmount <= 0).length}`],
    ["المبالغ المتأخرة حسب استحقاق الكشف", `${number(overdue.reduce((sum, inv) => sum + inv.remainingAmount, 0))} ${currency}`],
    ["حالة الاستحقاق", overdue.length ? "توجد مبالغ متأخرة" : "لا توجد مبالغ متأخرة بتاريخ استحقاق مسجل"],
  );
  const itemQuantities = new Map<string, number>();
  saleItems.forEach(item => itemQuantities.set(item.details, (itemQuantities.get(item.details) || 0) + item.quantity));
  const topItem = [...itemQuantities.entries()].sort((a,b) => b[1]-a[1])[0];
  if (topItem) stats.push(["أكثر بند مسجل بالكمية", `${topItem[0]} · ${number(topItem[1])}`]);
  if (source === "vertical" && customerInvoices.length) {
    const values = customerInvoices.map(inv => inv.grandTotal);
    stats.push(["أكبر / أصغر كشف", `${number(Math.max(...values))} / ${number(Math.min(...values))} ${currency}`], ["متوسط قيمة الكشف", `${number(sales/customerInvoices.length)} ${currency}`]);
    const lastPayment = [...customerPayments].filter(pay => validDate(pay.date)).sort((a,b) => Date.parse(b.date)-Date.parse(a.date))[0];
    stats.push(["عدد سندات القبض المستقلة", number(customerPayments.length)]);
    if (lastPayment) stats.push(["آخر سند قبض مستقل", `${lastPayment.date} · ${number(lastPayment.amount)} ${currency}`]);
    const nextDue = customerInvoices.filter(inv => inv.remainingAmount > 0 && inv.dueDate && validDate(inv.dueDate)).map(inv => inv.dueDate!).sort()[0];
    stats.push(["أقرب استحقاق كشف مفتوح", nextDue || "غير محدد"]);
  }
  const salesType = (inv: Invoice) => (inv as Invoice & { saleType?: string }).saleType;
  const classified = customerInvoices.filter(inv => ["cash", "credit", "installment"].includes(salesType(inv) || ""));
  const saleTypeKnown = classified.length === customerInvoices.length && customerInvoices.length > 0;
  const countType = (type: string) => classified.filter(inv => salesType(inv) === type).length;
  const amountType = (type: string) => classified.filter(inv => salesType(inv) === type).reduce((sum, inv) => sum + inv.grandTotal, 0);
  const unknown = "غير متوفر — البيانات غير مسجلة";
  const sourceRows = source === "vertical" ? customerInvoices : [];
  const dueKnown = source === "vertical" && sourceRows.length > 0 && sourceRows.every(inv => inv.remainingAmount <= 0 || (inv.dueDate && validDate(inv.dueDate)));
  const currentDay = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
  const dueOpen = dueKnown ? sourceRows.filter(inv => inv.remainingAmount > 0 && inv.dueDate && inv.dueDate < currentDay) : [];
  const oldestDue = dueOpen.map(inv => inv.dueDate!).sort()[0];
  const nextDueDate = dueKnown ? sourceRows.filter(inv => inv.remainingAmount > 0 && inv.dueDate && inv.dueDate >= currentDay).map(inv => inv.dueDate!).sort()[0] : undefined;
  const daysBetween = (start: string, end: string) => Math.max(0, Math.floor((Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000));
  const topProfit = costsComplete ? [...saleItems.reduce((map, item) => {
    const name = item.details || item.productId || "صنف غير مسمى";
    map.set(name, (map.get(name) || 0) + item.total - item.quantity * (item.unitCost || 0));
    return map;
  }, new Map<string, number>()).entries()].sort((a,b) => b[1] - a[1])[0] : undefined;
  const lastAccountingPayment = [...(customer.accountingSheetPayments || [])].filter(p => validDate(p.date)).sort((a,b) => Date.parse(b.date)-Date.parse(a.date))[0];
  const lastVerticalPayment = [...customerPayments].filter(p => validDate(p.date)).sort((a,b) => Date.parse(b.date)-Date.parse(a.date))[0];
  const lastPaid = source === "vertical" ? lastVerticalPayment : lastAccountingPayment;
  const extraStats: Record<string, string> = {
    "نوع التعامل": draft.transactionType || "غير محدد",
    "عدد عمليات الشراء النقدية": source === "vertical" && saleTypeKnown ? number(countType("cash")) : unknown,
    "عدد عمليات الشراء بالأقساط": source === "vertical" && saleTypeKnown ? number(countType("installment")) : unknown,
    "عدد عمليات الشراء الآجلة": source === "vertical" && saleTypeKnown ? number(countType("credit")) : unknown,
    "إجمالي المبيعات النقدية": source === "vertical" && saleTypeKnown ? `${number(amountType("cash"))} ${currency}` : unknown,
    "إجمالي المبيعات بالأقساط": source === "vertical" && saleTypeKnown ? `${number(amountType("installment"))} ${currency}` : unknown,
    "إجمالي المبيعات الآجلة": source === "vertical" && saleTypeKnown ? `${number(amountType("credit"))} ${currency}` : unknown,
    "عدد الأصناف المختلفة": saleItems.length && saleItems.every(i => !!i.productId) ? number(new Set(saleItems.map(i => i.productId)).size) : unknown,
    "أكثر صنف ربحاً": topProfit ? `${topProfit[0]} · ${number(topProfit[1])} ${currency}` : unknown,
    "تاريخ آخر تسديد وقيمته": lastPaid ? `${lastPaid.date} · ${number(lastPaid.amount)} ${currency}` : unknown,
    "أعلى رصيد دين تاريخي": unknown,
    "متوسط مدة تسديد الدين": unknown,
    "إجمالي المبالغ المتأخرة": dueKnown ? `${number(dueOpen.reduce((sum, inv) => sum + inv.remainingAmount, 0))} ${currency}` : unknown,
    "عدد الكشوف المتأخرة": dueKnown ? number(dueOpen.length) : unknown,
    "أقدم استحقاق متأخر": dueKnown ? (oldestDue || "لا يوجد") : unknown,
    "أيام تأخير أقدم استحقاق": dueKnown ? (oldestDue ? `${number(daysBetween(oldestDue, currentDay))} يوم` : "0 يوم") : unknown,
    "أقرب استحقاق قادم": dueKnown ? (nextDueDate || "لا يوجد") : unknown,
    "إجمالي الأقساط المستحقة": unknown,
    "عدد الأقساط غير المسددة": unknown,
    "انتظام التسديد": unknown,
    "متوسط أيام التأخير": unknown,
    "نسبة سداد المستحقات": unknown,
    "معدل تكرار الشراء": unknown,
    "المقارنة مع الشهر السابق": unknown,
    "حالة نشاط العميل": unknown,
    "حالة الالتزام": dueKnown ? (dueOpen.length ? "متأخر حسب مواعيد الكشوف" : "لا توجد كشوف متأخرة") : unknown,
    "التنبيهات التلقائية": "تتطلب جدول أقساط وتنبيهات موثقة؛ غير مفعّلة من هذه النافذة",
  };
  const financialGroups: [string,[string,string[]][]][] = [["ب. تفاصيل التعامل التجاري",[["1. تاريخ التعامل",["تاريخ أول عملية شراء","تاريخ آخر عملية شراء","مدة التعامل بالأيام والأشهر والسنوات"]],["2. إحصائيات المشتريات",["أكثر الأصناف التي يشتريها","إجمالي عدد القطع والبضائع المشتراة"]]]],["ج. الملخص الحسابي",[["1. إجمالي المبيعات",["إجمالي المبيعات النقدية","إجمالي المبيعات الآجلة وبالأقساط","إجمالي المبيعات الكلي"]],["2. الديون والتسديدات",["إجمالي المبلغ المسدد","إجمالي المبلغ المتبقي","تاريخ آخر تسديد وقيمته","أكبر مبلغ دين وصل إليه العميل"]],["3. الأرباح",["إجمالي الربح من العميل","أكثر بضاعة حققت ربحاً من التعامل مع العميل","نسبة هامش الربح"]]]],["د. المستحقات والتأخير",[["1. المستحقات المالية",["إجمالي المبالغ المستحقة","إجمالي المبالغ المتأخرة","عدد الأقساط غير المسددة"]],["2. تفاصيل التأخير",["عدد أيام التأخير"]]]],["هـ. تحليل سلوك العميل",[["1. سلوك التسديد",["انتظام العميل بالتسديد","نسبة تسديد الديون المستحقة"]],["2. سلوك الشراء",["معدل تكرار الشراء","مقارنة مشترياته بالشهر السابق"]],["3. تقييم العميل",["تصنيف العميل: منتظم / متأخر / متوقف عن التعامل","تنبيهات تلقائية عند التأخر عن التسديد"]]]]];
  const metricAliases: Record<string,string> = {"تاريخ أول عملية شراء":"أول / آخر تاريخ سجل","تاريخ آخر عملية شراء":"أول / آخر تاريخ سجل","مدة التعامل بالأيام والأشهر والسنوات":"مدة التعامل المسجلة","أكثر الأصناف التي يشتريها":"أكثر بند مسجل بالكمية","إجمالي عدد القطع والبضائع المشتراة":"القطع المسجلة","إجمالي المبيعات النقدية":"إجمالي المبيعات النقدية","إجمالي المبيعات الكلي":"إجمالي المبيعات المسجلة","إجمالي المبلغ المسدد":"إجمالي التسديدات","إجمالي المبلغ المتبقي":"المبلغ المتبقي","تاريخ آخر تسديد وقيمته":"تاريخ آخر تسديد وقيمته","أكبر مبلغ دين وصل إليه العميل":"أعلى رصيد دين تاريخي","إجمالي الربح من العميل":"الربح الإجمالي المسجل","أكثر بضاعة حققت ربحاً من التعامل مع العميل":"أكثر صنف ربحاً","نسبة هامش الربح":"هامش الربح","إجمالي المبالغ المستحقة":"إجمالي الأقساط المستحقة","إجمالي المبالغ المتأخرة":"إجمالي المبالغ المتأخرة","عدد الأقساط غير المسددة":"عدد الأقساط غير المسددة","عدد أيام التأخير":"أيام تأخير أقدم استحقاق","انتظام العميل بالتسديد":"انتظام التسديد","نسبة تسديد الديون المستحقة":"نسبة سداد المستحقات","معدل تكرار الشراء":"معدل تكرار الشراء","مقارنة مشترياته بالشهر السابق":"المقارنة مع الشهر السابق","تصنيف العميل: منتظم / متأخر / متوقف عن التعامل":"حالة الالتزام","تنبيهات تلقائية عند التأخر عن التسديد":"التنبيهات التلقائية"};
  const metricValues: Record<string,string> = Object.fromEntries(Object.entries(metricAliases).map(([label,key])=>[label,stats.find(([name])=>name===key)?.[1] ?? extraStats[key] ?? "غير متوفر"]));
  metricValues["إجمالي المبيعات الآجلة وبالأقساط"] = source==="vertical"&&saleTypeKnown ? number(amountType("credit")+amountType("installment"))+" "+currency : "غير متوفر";
  const save = async () => {
    if (!onSave || saving) return;
    if (!draft.name?.trim()) { setError("اسم العميل مطلوب."); return; }
    if (draft.salary && (!Number.isFinite(Number(draft.salary)) || Number(draft.salary) < 0)) { setError("الراتب يجب أن يكون رقماً موجباً أو صفراً."); return; }
    setSaving(true); setError("");
    try { await onSave({ ...customer, name: draft.name.trim(), phone: draft.phone || "", address: draft.address || "", salaryType: draft.salaryType || "", profile: draft }); setEditing(false); }
    catch { setError("تعذر حفظ البيانات. حاول مرة أخرى."); }
    finally { setSaving(false); }
  };
  return createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4" onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="customer-profile-title" dir="rtl" className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); requestClose(); }
      if (event.key === "Tab") { const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select, a[href]'); if (!nodes?.length) return; const first = nodes[0], last = nodes[nodes.length-1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    }}>
      <header className="flex items-center justify-between gap-2 border-b bg-violet-50 p-4"><div className="min-w-0"><h2 id="customer-profile-title" className="flex items-center gap-2 font-bold text-slate-900"><ContactRound className="h-5 w-5 shrink-0" />ملف العميل</h2><p className="break-words text-sm text-slate-600">{customer.name}</p></div><button ref={closeButton} type="button" disabled={saving} aria-label="إغلاق ملف العميل" onClick={requestClose} className="rounded-lg p-2 hover:bg-white"><X className="h-5 w-5" /></button></header>
      <div className="flex gap-2 overflow-x-auto border-b p-2" role="tablist" aria-label="أقسام ملف العميل">{([['personal','أ. المعلومات الشخصية'],['business','ب. التعامل التجاري'],['financial','ج. الملخص الحسابي'],['due','د. المستحقات والتأخير'],['analytics','هـ. تحليل السلوك']] as const).map(([value,label]) => <button type="button" key={value} role="tab" aria-selected={tab === value} aria-controls="customer-profile-panel" onClick={() => setTab(value)} className={`shrink-0 rounded-lg p-2 text-xs sm:text-sm font-bold ${tab === value ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>)}</div>
      <div id="customer-profile-panel" role="tabpanel" className="min-h-0 overflow-y-auto p-3 sm:p-5 space-y-4">
        {tab === "personal" ? <>
          {groups.map(([title,fields]) => <section key={title}><h3 className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-right text-sm font-bold text-violet-900">{title}</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(([field,label,type]) => <label key={field} className="block min-w-0 text-xs text-slate-600"><span>{label}</span>{editing ? (type === 'image' ? <div className="mt-2 space-y-2">{draft.photo && <img src={draft.photo} alt="صورة العميل" className="h-24 w-24 rounded-xl object-cover" />}<input type="file" accept="image/*" disabled={saving} onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>250000){setError('الصورة يجب أن تكون أقل من 250 كيلوبايت');return;}const reader=new FileReader();reader.onload=()=>{if(typeof reader.result==='string')setDraft(old=>({...old,photo:reader.result as string}));};reader.readAsDataURL(f);}} className="w-full text-xs" /></div> : type === 'readonly' ? <span className="mt-1 block">{field==='folderId' ? customer.folderId||'غير محدد' : String(customer.sequence??'غير محدد')}</span> : type === 'saleType' || type === 'yesNo' ? <select value={draft[field]||''} onChange={e=>setDraft(old=>({...old,[field]:e.target.value}))} className="mt-1 w-full rounded-lg border p-2">{(type==='saleType'?['','نقدي','آجل','أقساط']:['','نعم','لا']).map(v=><option key={v} value={v}>{v||'غير محدد'}</option>)}</select> : field === 'notes' || field === 'documents' ? <textarea value={draft[field] || ''} onChange={e => setDraft({...draft,[field]:e.target.value})} disabled={saving} className="mt-1 w-full rounded-lg border p-2 text-sm" /> : <input type={type === 'image' || type === 'saleType' || type === 'yesNo' || type === 'readonly' ? 'text' : (type || 'text')} min={type === 'number' ? 0 : undefined} value={draft[field] || ''} onChange={e => setDraft({...draft,[field]:e.target.value})} disabled={saving} className="mt-1 w-full rounded-lg border p-2 text-sm" />) : type === 'image' ? (draft.photo ? <img src={draft.photo} alt="صورة العميل" className="mt-2 h-24 w-24 rounded-xl object-cover" /> : <span>غير مضاف</span>) : <span className="mt-1 block whitespace-pre-wrap break-words text-sm font-medium text-slate-900">{(field === 'folderId' ? customer.folderId : field === 'sequence' ? String(customer.sequence ?? '') : draft[field]) || 'غير مضاف'}</span>}</label>)}</div></section>)}
        </> : <>
          <label className="block text-sm font-bold">مصدر الحسابات<select value={source} onChange={e => { setSource(e.target.value as typeof source); setExpanded(false); }} className="mt-2 w-full rounded-lg border p-2"><option value="vertical">سجل الحساب العمودي / كشوف الديون</option><option value="accounting">القائمة الحسابية المستقلة</option></select></label>
          <p className="text-xs text-slate-500">كل سجل يُحسب بصورة مستقلة لمنع تكرار المبالغ. الأرقام من البيانات المحفوظة فقط.</p>
          {financialGroups.filter(([title])=>(tab==="business"&&title.startsWith("ب."))||(tab==="financial"&&title.startsWith("ج."))||(tab==="due"&&title.startsWith("د."))||(tab==="analytics"&&title.startsWith("هـ."))).map(([title,subgroups])=><section key={title} className="space-y-3 rounded-xl border p-3"><h3 className="rounded-lg bg-violet-100 px-3 py-2 text-sm font-bold text-violet-900">{title}</h3>{subgroups.map(([subtitle,labels])=><div key={subtitle}><h4 className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold">{subtitle}</h4><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{labels.map(label=><div key={label} className="rounded-lg border border-violet-100 p-3"><span className="block text-xs text-slate-600">{label}</span><strong className="mt-2 block text-sm text-violet-900">{metricValues[label]||"غير متوفر — بيانات غير مسجلة"}</strong></div>)}</div></div>)}</section>)}
          <button type="button" onClick={() => setExpanded(!expanded)} className="rounded-lg border px-3 py-2 text-sm font-bold">{expanded ? 'إخفاء' : 'عرض'} العمليات المكوّنة للأرقام</button>
          {expanded && <div className="space-y-2 text-sm">{source === 'vertical' ? <>{customerInvoices.map(inv => <div key={inv.id} className="rounded-lg border p-3"><b>{inv.invoiceNumber}</b> · {inv.date}<p>المبيعات: {number(inv.grandTotal)} · المسدد: {number(inv.paidAmount)} · المتبقي: {number(inv.remainingAmount)} {currency}</p></div>)}<p className="text-xs text-slate-500">سندات القبض التالية للتدقيق؛ مبالغها مدرجة في مسدد الكشوف ولا تضاف إليه مرة ثانية.</p>{customerPayments.map(pay => <p key={pay.id}>{pay.date} · {number(pay.amount)} {currency} · {pay.method}</p>)}</> : <>{saleItems.map(row => <p key={row.id} className="rounded-lg border p-2">{row.details} · {number(row.quantity)} × {number(row.unitPrice)} = {number(row.total)} {currency}</p>)}{(customer.accountingSheetPayments || []).map(pay => <p key={pay.id}>{pay.date} · تسديد {number(pay.amount)} {currency}</p>)}</>}{saleItems.length === 0 && <p>لا توجد بنود بيع محفوظة.</p>}</div>}
        </>}
      </div>
      <footer className="border-t p-3">{error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}{editing ? <div className="flex gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'جاري الحفظ...' : 'حفظ'}</button><button type="button" disabled={saving} onClick={() => { setDraft({...customer.profile,name:customer.name,phone:customer.phone,address:customer.address || '',salaryType:customer.salaryType || ''}); setEditing(false); setError(''); }} className="rounded-lg border px-4 py-2 text-sm">إلغاء</button></div> : <button type="button" disabled={!onSave} onClick={() => {setEditing(true);setTab('personal');}} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تعديل المعلومات الشخصية</button>}</footer>
    </div>
  </div>, document.body);
}
