import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ContactRound, X } from "lucide-react";
import { Customer, CustomerProfile, Invoice, Payment } from "../types";

const groups: [string, [string, string, string?][]][] = [
  ["المعلومات الشخصية", [["name", "الاسم الرباعي"], ["photo", "رابط الصورة", "url"], ["birthDate", "تاريخ الميلاد", "date"], ["gender", "الجنس"], ["maritalStatus", "الحالة الاجتماعية"]]],
  ["معلومات الاتصال", [["phone", "الهاتف الأساسي", "tel"], ["alternatePhone", "الهاتف البديل", "tel"], ["whatsapp", "واتساب", "tel"]]],
  ["معلومات السكن", [["address", "العنوان"], ["governorate", "المحافظة"], ["district", "القضاء"], ["area", "المنطقة"], ["neighborhood", "الحي"], ["street", "الزقاق"], ["house", "رقم الدار"], ["landmark", "أقرب نقطة دالة"], ["location", "رابط الموقع الجغرافي", "url"]]],
  ["المعلومات الوظيفية", [["occupation", "المهنة"], ["employer", "جهة العمل / الدائرة"], ["salary", "الراتب الشهري (اختياري)", "number"], ["salaryType", "نوع بطاقة الراتب"]]],
  ["معلومات الضامن", [["guarantorName", "اسم الكفيل"], ["guarantorPhone", "هاتف الكفيل", "tel"], ["guarantorAddress", "عنوان الكفيل"], ["guarantorEmployer", "جهة عمل الكفيل"]]],
  ["المرفقات والملاحظات", [["documents", "روابط المستندات والعقود والصور"], ["notes", "الملاحظات الشخصية"]]],
];
const number = (value: number) => value.toLocaleString("ar-IQ", { maximumFractionDigits: 2 });
const validDate = (value: string) => Number.isFinite(Date.parse(value));

export default function CustomerProfileModal({ customer, invoices, payments, currency, onSave, onClose }: {
  customer: Customer; invoices: Invoice[]; payments: Payment[]; currency: string;
  onSave?: (customer: Customer) => Promise<void> | void; onClose: () => void;
}) {
  const [tab, setTab] = useState<"personal" | "financial">("personal");
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
  const financialGroups = [
    { title: "أ. الملخص المالي للعميل", labels: ["إجمالي المبيعات المسجلة", "إجمالي التسديدات", "المبلغ المتبقي", "الربح الإجمالي المسجل"] },
    { title: "ب. تفاصيل التعامل التجاري", labels: ["أول / آخر تاريخ سجل", "مدة التعامل المسجلة", "القطع المسجلة", "أكثر بند مسجل بالكمية", "أكبر / أصغر كشف", "متوسط قيمة الكشف"] },
    { title: "ج. الأرباح من العميل", labels: ["تكلفة البضاعة وقت البيع", "الربح الإجمالي المسجل", "هامش الربح"], note: "الربح المسجل = سعر البيع ناقص التكلفة المحفوظة وقت البيع، ولا يعني تحصيل النقد. السجلات القديمة التي لا تحتوي على تكلفة لا تُقدّر بسعر المخزون الحالي. صافي الربح يحتاج بيانات الخصومات والمرتجعات والمصاريف." },
    { title: "د. الديون والتسديدات", labels: ["كشوف مفتوحة / مغلقة", "عدد سندات القبض المستقلة", "آخر سند قبض مستقل", "أقرب استحقاق كشف مفتوح", "المبالغ المتأخرة حسب استحقاق الكشف"] },
    { title: "هـ. تحليل سلوك العميل", labels: ["حالة الاستحقاق"], note: "تحليل انتظام التسديد ومتوسط التأخير وتكرار الشراء يحتاج بيانات عمليات وأقساط ومواعيد استحقاق كاملة؛ لا تُستنتج من عدد صفوف الكشف." },
  ];
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
      <div className="grid grid-cols-2 gap-2 border-b p-2" role="tablist" aria-label="أقسام ملف العميل">{([['personal','التفاصيل الديموغرافية'],['financial','التفاصيل المالية والتجارية']] as const).map(([value,label]) => <button type="button" key={value} role="tab" aria-selected={tab === value} aria-controls="customer-profile-panel" onClick={() => setTab(value)} className={`rounded-lg p-2 text-xs sm:text-sm font-bold ${tab === value ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>)}</div>
      <div id="customer-profile-panel" role="tabpanel" className="min-h-0 overflow-y-auto p-3 sm:p-5 space-y-4">
        {tab === "personal" ? <>
          {groups.map(([title,fields], groupIndex) => <section key={title}><h3 className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-sm font-bold text-violet-900">{['أ', 'ب', 'ج', 'د', 'هـ', 'و'][groupIndex]}. {title}</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(([field,label,type]) => <label key={field} className="block min-w-0 text-xs text-slate-600"><span>{label}</span>{editing ? (field === 'notes' || field === 'documents' ? <textarea value={draft[field] || ''} onChange={e => setDraft({...draft,[field]:e.target.value})} disabled={saving} className="mt-1 w-full rounded-lg border p-2 text-sm" /> : <input type={type || 'text'} min={type === 'number' ? 0 : undefined} value={draft[field] || ''} onChange={e => setDraft({...draft,[field]:e.target.value})} disabled={saving} className="mt-1 w-full rounded-lg border p-2 text-sm" />) : <span className="mt-1 block whitespace-pre-wrap break-words text-sm font-medium text-slate-900">{draft[field] || 'غير مضاف'}</span>}</label>)}</div></section>)}
        </> : <>
          <label className="block text-sm font-bold">مصدر الحسابات<select value={source} onChange={e => { setSource(e.target.value as typeof source); setExpanded(false); }} className="mt-2 w-full rounded-lg border p-2"><option value="vertical">سجل الحساب العمودي / كشوف الديون</option><option value="accounting">القائمة الحسابية المستقلة</option></select></label>
          <p className="text-xs text-slate-500">كل سجل يُحسب بصورة مستقلة لمنع تكرار المبالغ. الأرقام من البيانات المحفوظة فقط.</p>
          {financialGroups.map(group => {
            const entries = group.labels.flatMap(label => {
              const entry = stats.find(([statLabel]) => statLabel === label);
              return entry ? [entry] : [];
            });
            return <section key={group.title} aria-label={group.title} className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="rounded-lg bg-violet-100 px-3 py-2 text-sm font-bold text-violet-900">{group.title}</h3>
              {entries.length ? <div className="grid grid-cols-2 gap-2 sm:gap-3">{entries.map(([label,value]) => <button key={label} type="button" onClick={() => setExpanded(true)} className="min-w-0 rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-right"><span className="block text-xs text-slate-600">{label}</span><strong className="mt-2 block break-words text-sm sm:text-lg text-violet-900">{value}</strong></button>)}</div> : <p className="text-xs text-slate-500">لا تتوفر بيانات محفوظة لهذا التصنيف في السجل المختار.</p>}
              {group.note && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">{group.note}</p>}
            </section>;
          })}
          <button type="button" onClick={() => setExpanded(!expanded)} className="rounded-lg border px-3 py-2 text-sm font-bold">{expanded ? 'إخفاء' : 'عرض'} العمليات المكوّنة للأرقام</button>
          {expanded && <div className="space-y-2 text-sm">{source === 'vertical' ? <>{customerInvoices.map(inv => <div key={inv.id} className="rounded-lg border p-3"><b>{inv.invoiceNumber}</b> · {inv.date}<p>المبيعات: {number(inv.grandTotal)} · المسدد: {number(inv.paidAmount)} · المتبقي: {number(inv.remainingAmount)} {currency}</p></div>)}<p className="text-xs text-slate-500">سندات القبض التالية للتدقيق؛ مبالغها مدرجة في مسدد الكشوف ولا تضاف إليه مرة ثانية.</p>{customerPayments.map(pay => <p key={pay.id}>{pay.date} · {number(pay.amount)} {currency} · {pay.method}</p>)}</> : <>{saleItems.map(row => <p key={row.id} className="rounded-lg border p-2">{row.details} · {number(row.quantity)} × {number(row.unitPrice)} = {number(row.total)} {currency}</p>)}{(customer.accountingSheetPayments || []).map(pay => <p key={pay.id}>{pay.date} · تسديد {number(pay.amount)} {currency}</p>)}</>}{saleItems.length === 0 && <p>لا توجد بنود بيع محفوظة.</p>}</div>}
        </>}
      </div>
      <footer className="border-t p-3">{error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}{editing ? <div className="flex gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'جاري الحفظ...' : 'حفظ'}</button><button type="button" disabled={saving} onClick={() => { setDraft({...customer.profile,name:customer.name,phone:customer.phone,address:customer.address || '',salaryType:customer.salaryType || ''}); setEditing(false); setError(''); }} className="rounded-lg border px-4 py-2 text-sm">إلغاء</button></div> : <button type="button" disabled={!onSave} onClick={() => {setEditing(true);setTab('personal');}} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تعديل المعلومات الشخصية</button>}</footer>
    </div>
  </div>, document.body);
}
