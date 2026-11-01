import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ContactRound, X } from "lucide-react";
import { Customer, CustomerFolder, CustomerProfile, Invoice, Payment } from "../types";
import { customerFolderPath } from "../utils/customerPurchaseStats";

const groups: [string, [string, string, string?][]][] = [
  ["البيانات الأساسية", [["name", "اسم العميل الرباعي"], ["photo", "صورة العميل", "image"], ["phone", "رقم الهاتف", "tel"], ["address", "عنوان السكن"], ["occupation", "المهنة أو الوظيفة"]]],
  ["المعلومات المالية والوظيفية", [["hasSalary", "هل لديه راتب؟", "yesNo"], ["salaryType", "نوع الراتب"]]],
  ["معلومات الكفيل أو الضامن", [["guarantorName", "اسم الكفيل"], ["guarantorPhone", "رقم هاتف الكفيل", "tel"], ["guarantorAddress", "عنوان سكن الكفيل"]]],
  ["معلومات الأرشفة", [["folderId", "المجلد التابع له العميل", "readonly"], ["sequence", "التسلسل داخل المجلد", "readonly"]]],
];

export default function CustomerProfileModal({ customer, folders = [], onSave, onClose }: {
  customer: Customer;
  folders?: CustomerFolder[];
  invoices?: Invoice[];
  payments?: Payment[];
  currency?: string;
  onSave?: (customer: Customer) => Promise<void> | void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CustomerProfile>(() => ({ ...customer.profile, name: customer.name, phone: customer.phone, address: customer.address || "", salaryType: customer.salaryType || "" }));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const folderPath = customerFolderPath(customer.folderId, folders);

  const requestClose = () => {
    if (!saving && (!editing || window.confirm("إغلاق ملف العميل وإلغاء التعديلات غير المحفوظة؟"))) onClose();
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previous?.focus();
  }, []);

  const save = async () => {
    if (!onSave || saving) return;
    if (!draft.name?.trim()) { setError("اسم العميل مطلوب."); return; }
    if (draft.salary && (!Number.isFinite(Number(draft.salary)) || Number(draft.salary) < 0)) { setError("الراتب يجب أن يكون رقماً موجباً أو صفراً."); return; }
    setSaving(true); setError("");
    try {
      await onSave({ ...customer, name: draft.name.trim(), phone: draft.phone || "", address: draft.address || "", salaryType: draft.salaryType || "", profile: draft });
      setEditing(false);
    } catch {
      setError("تعذر حفظ البيانات. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4" onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="customer-profile-title" dir="rtl" className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); requestClose(); }
      if (event.key === "Tab") {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select, a[href]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <header className="flex items-center justify-between gap-2 border-b bg-violet-50 p-4">
        <div className="min-w-0"><h2 id="customer-profile-title" className="flex items-center gap-2 font-bold text-slate-900"><ContactRound className="h-5 w-5 shrink-0" />المعلومات الشخصية</h2><p className="break-words text-sm text-slate-600">{customer.name}</p></div>
        <button ref={closeButton} type="button" disabled={saving} aria-label="إغلاق المعلومات الشخصية" onClick={requestClose} className="rounded-lg p-2 hover:bg-white"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 space-y-4 overflow-y-auto p-3 sm:p-5">
        {groups.map(([title, fields]) => <section key={title}>
          <h3 className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-right text-sm font-bold text-violet-900">{title}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map(([field, label, type]) => <label key={field} className="block min-w-0 text-xs text-slate-600">
              <span>{label}</span>
              {editing ? (type === "image" ? <div className="mt-2 space-y-2">
                {draft.photo && <img src={draft.photo} alt="صورة العميل" className="h-24 w-24 rounded-xl object-cover" />}
                <input type="file" accept="image/*" disabled={saving} onChange={event => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (!file.type.startsWith("image/") || file.size > 250000) { setError("الصورة يجب أن تكون أقل من 250 كيلوبايت"); return; }
                  const reader = new FileReader();
                  reader.onload = () => { if (typeof reader.result === "string") setDraft(old => ({ ...old, photo: reader.result as string })); };
                  reader.readAsDataURL(file);
                }} className="w-full text-xs" />
              </div> : type === "readonly" ? <span className="mt-1 block">{field === "folderId" ? folderPath : String(customer.sequence ?? "غير محدد")}</span>
                : type === "yesNo" ? <select value={draft[field] || ""} onChange={event => setDraft(old => ({ ...old, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border p-2">{["", "نعم", "لا"].map(value => <option key={value} value={value}>{value || "غير محدد"}</option>)}</select>
                  : <input type={type || "text"} value={draft[field] || ""} onChange={event => setDraft(old => ({ ...old, [field]: event.target.value }))} disabled={saving} className="mt-1 w-full rounded-lg border p-2 text-sm" />)
                : type === "image" ? (draft.photo ? <img src={draft.photo} alt="صورة العميل" className="mt-2 h-24 w-24 rounded-xl object-cover" /> : <span className="mt-1 block">غير مضاف</span>)
                  : <span className="mt-1 block whitespace-pre-wrap break-words text-sm font-medium text-slate-900">{(field === "folderId" ? folderPath : field === "sequence" ? String(customer.sequence ?? "") : draft[field]) || "غير مضاف"}</span>}
            </label>)}
          </div>
        </section>)}
      </div>
      <footer className="border-t p-3">
        {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
        {editing ? <div className="flex gap-2">
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "جاري الحفظ..." : "حفظ المعلومات"}</button>
          <button type="button" disabled={saving} onClick={() => { setDraft({ ...customer.profile, name: customer.name, phone: customer.phone, address: customer.address || "", salaryType: customer.salaryType || "" }); setEditing(false); setError(""); }} className="rounded-lg border px-4 py-2 text-sm">إلغاء</button>
        </div> : <button type="button" disabled={!onSave} onClick={() => setEditing(true)} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تعديل المعلومات الشخصية</button>}
      </footer>
    </div>
  </div>, document.body);
}
