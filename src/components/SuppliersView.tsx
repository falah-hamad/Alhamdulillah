import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CreditCard, FileText, MapPin, PackagePlus, Phone, Plus, Search, Trash2, Truck, UserRound, X } from "lucide-react";
import type { Product, Supplier, SupplierTransaction, SupplierTransactionItem, SystemSettings } from "../types";
import { printElement } from "../utils/printUtils";

type SupplierForm = { name: string; phone: string; address: string; notes: string };
type PurchaseLineDraft = { id: string; productId: string; details: string; quantity: string; unit: string; unitPrice: string };
type Props = {
  suppliers: Supplier[];
  products: Product[];
  settings: SystemSettings;
  addSupplier: (supplier: Omit<Supplier, "id" | "createdAt" | "transactions">) => Supplier;
  updateSupplier: (supplier: Supplier) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
};

const money = (value: number) => (Number(value) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowLocalInput = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};
const dateLabel = (value: string) => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value || "—";
  const weekday = new Intl.DateTimeFormat("ar-IQ", { weekday: "long", timeZone: "Asia/Baghdad" }).format(d);
  const dateParts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Baghdad" }).formatToParts(d);
  const get = (key: string) => dateParts.find((part) => part.type === key)?.value || "";
  const time = new Intl.DateTimeFormat("ar-IQ", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Baghdad" }).format(d);
  return `${weekday} — ${time} — ${get("year")}/${get("month")}/${get("day")}`;
};

export default function SuppliersView({ suppliers, products, settings, addSupplier, updateSupplier, deleteSupplier, updateProduct }: Props) {
  const [query, setQuery] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [contextSupplierId, setContextSupplierId] = useState<string | null>(null);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>({ name: "", phone: "", address: "", notes: "" });
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState(nowLocalInput());
  const [purchaseNote, setPurchaseNote] = useState("");
  const [purchaseReference, setPurchaseReference] = useState("");
  const [purchasePaidNow, setPurchasePaidNow] = useState("");
  const [lines, setLines] = useState<PurchaseLineDraft[]>([{ id: newId("line"), productId: "", details: "", quantity: "1", unit: "قطعة", unitPrice: "" }]);
  const [paymentDate, setPaymentDate] = useState(nowLocalInput());
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("نقداً");
  const [paymentNote, setPaymentNote] = useState("");
  const [saving, setSaving] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);

  const visibleSuppliers = useMemo(() => suppliers.filter((supplier) => !supplier.isDeleted)
    .filter((supplier) => `${supplier.name} ${supplier.phone || ""} ${supplier.address || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "ar")), [suppliers, query]);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId && !supplier.isDeleted) || null;
  const contextSupplier = suppliers.find((supplier) => supplier.id === contextSupplierId && !supplier.isDeleted) || null;
  const currency = settings.currency || "د.ع";

  const totalsFor = (supplier: Supplier) => {
    const transactions = Array.isArray(supplier.transactions) ? supplier.transactions : [];
    const purchases = transactions.filter((entry) => entry.type === "purchase").reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const paid = transactions.filter((entry) => entry.type === "payment").reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    return { purchases, paid, balance: purchases - paid };
  };

  const clearHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdStart.current = null;
  };
  const onRowPointerDown = (event: React.PointerEvent<HTMLTableRowElement>, supplierId: string) => {
    clearHold();
    holdStart.current = { x: event.clientX, y: event.clientY };
    holdTimer.current = window.setTimeout(() => {
      setContextSupplierId(supplierId);
      holdTimer.current = null;
    }, 550);
  };
  const onRowPointerMove = (event: React.PointerEvent<HTMLTableRowElement>) => {
    if (!holdStart.current) return;
    if (Math.abs(event.clientX - holdStart.current.x) > 10 || Math.abs(event.clientY - holdStart.current.y) > 10) clearHold();
  };
  useEffect(() => () => clearHold(), []);

  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm({ name: "", phone: "", address: "", notes: "" });
    setSupplierFormOpen(true);
  };
  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({ name: supplier.name, phone: supplier.phone || "", address: supplier.address || "", notes: supplier.notes || "" });
    setContextSupplierId(null);
    setSupplierFormOpen(true);
  };
  const saveSupplier = (event: React.FormEvent) => {
    event.preventDefault();
    const name = supplierForm.name.trim();
    if (!name) return;
    if (editingSupplier) {
      void updateSupplier({ ...editingSupplier, ...supplierForm, name });
    } else {
      addSupplier({ ...supplierForm, name });
    }
    setSupplierFormOpen(false);
  };

  const addLine = () => setLines((current) => [...current, { id: newId("line"), productId: "", details: "", quantity: "1", unit: "قطعة", unitPrice: "" }]);
  const updateLine = (id: string, patch: Partial<PurchaseLineDraft>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const selectProductForLine = (lineId: string, productId: string) => {
    const product = products.find((item) => item.id === productId);
    updateLine(lineId, product ? { productId, details: product.name, unit: product.unitName || "قطعة", unitPrice: String(product.purchasePrice || "") } : { productId: "", details: "", unit: "قطعة", unitPrice: "" });
  };
  const purchaseTotal = lines.filter((line) => line.details.trim()).reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);

  const savePurchase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSupplier || saving) return;
    const validLines = lines.filter((line) => line.details.trim() && Number(line.quantity) > 0 && Number(line.unitPrice) >= 0);
    const validTotal = validLines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0);
    const paidNow = Number(purchasePaidNow) || 0;
    if (!validLines.length || validTotal <= 0 || paidNow < 0 || paidNow > validTotal) return;
    setSaving(true);
    try {
      const transactionId = newId("supplier-purchase");
      const items: SupplierTransactionItem[] = validLines.map((line) => ({
        id: newId("supplier-item"), productId: line.productId || undefined, details: line.details.trim(), quantity: Number(line.quantity), unit: line.unit.trim() || "قطعة", unitPrice: Number(line.unitPrice), total: Number(line.quantity) * Number(line.unitPrice),
      }));
      const transaction: SupplierTransaction = { id: transactionId, type: "purchase", date: new Date(purchaseDate).toISOString(), amount: items.reduce((sum, item) => sum + item.total, 0), items, reference: purchaseReference.trim() || undefined, notes: purchaseNote.trim() || undefined };
      const nextTransactions = [...(selectedSupplier.transactions || []), transaction];
      if (paidNow > 0) nextTransactions.push({ id: newId("supplier-payment"), type: "payment", date: transaction.date, amount: paidNow, allocations: [{ purchaseId: transactionId, amount: paidNow }], method: "نقداً", notes: "دفعة عند الشراء" });
      await updateSupplier({ ...selectedSupplier, transactions: nextTransactions });

      const linkedItems = new Map<string, SupplierTransactionItem[]>();
      items.filter((item) => item.productId).forEach((item) => linkedItems.set(item.productId!, [...(linkedItems.get(item.productId!) || []), item]));
      for (const [productId, productItems] of linkedItems) {
        const product = products.find((item) => item.id === productId);
        if (!product) continue;
        const addedQuantity = productItems.reduce((sum, item) => sum + item.quantity, 0);
        const latestCost = productItems[productItems.length - 1].unitPrice;
        const stockMovements = [...(product.stockMovements || []), ...productItems.map((item) => ({ id: newId("stock"), type: "restock" as const, quantity: item.quantity, createdAt: transaction.date, note: `شراء من ${selectedSupplier.name}${purchaseReference.trim() ? ` — فاتورة ${purchaseReference.trim()}` : ""}`, referenceId: transactionId, unitCost: item.unitPrice }))];
        await updateProduct({ ...product, quantity: (Number(product.quantity) || 0) + addedQuantity, purchasePrice: latestCost, supplierName: selectedSupplier.name, supplierPhone: selectedSupplier.phone, stockMovements });
      }
      setPurchaseOpen(false);
      setLines([{ id: newId("line"), productId: "", details: "", quantity: "1", unit: "قطعة", unitPrice: "" }]);
      setPurchaseNote(""); setPurchaseReference(""); setPurchasePaidNow(""); setPurchaseDate(nowLocalInput());
    } finally { setSaving(false); }
  };

  const savePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSupplier || saving) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSaving(true);
    try {
      const currentTransactions = [...(selectedSupplier.transactions || [])].sort((a, b) => a.date.localeCompare(b.date));
      const outstandingByPurchase = new Map<string, number>();
      currentTransactions.filter((entry) => entry.type === "purchase").forEach((purchase) => outstandingByPurchase.set(purchase.id, purchase.amount));
      currentTransactions.filter((entry) => entry.type === "payment").forEach((payment) => (payment.allocations || []).forEach((allocation) => {
        outstandingByPurchase.set(allocation.purchaseId, Math.max(0, (outstandingByPurchase.get(allocation.purchaseId) || 0) - allocation.amount));
      }));
      let unallocated = amount;
      const allocations: NonNullable<SupplierTransaction["allocations"]> = [];
      for (const purchase of currentTransactions.filter((entry) => entry.type === "purchase")) {
        if (unallocated <= 0) break;
        const due = outstandingByPurchase.get(purchase.id) || 0;
        if (due <= 0) continue;
        const allocated = Math.min(due, unallocated);
        allocations.push({ purchaseId: purchase.id, amount: allocated });
        unallocated -= allocated;
      }
      const transaction: SupplierTransaction = { id: newId("supplier-payment"), type: "payment", date: new Date(paymentDate).toISOString(), amount, allocations, method: paymentMethod, notes: paymentNote.trim() || undefined };
      await updateSupplier({ ...selectedSupplier, transactions: [...(selectedSupplier.transactions || []), transaction] });
      setPaymentOpen(false); setPaymentAmount(""); setPaymentNote(""); setPaymentDate(nowLocalInput());
    } finally { setSaving(false); }
  };

  const openPurchase = () => { setPurchaseDate(nowLocalInput()); setPurchasePaidNow(""); setPurchaseOpen(true); };
  const openPayment = () => { setPaymentDate(nowLocalInput()); setPaymentOpen(true); };

  if (selectedSupplier) {
    const transactions = [...(selectedSupplier.transactions || [])].sort((a, b) => a.date.localeCompare(b.date));
    let runningBalance = 0;
    const ledgerRows = transactions.flatMap((transaction) => {
      if (transaction.type === "purchase") {
        const items = transaction.items?.length ? transaction.items : [{ id: transaction.id, details: "مشتريات", quantity: 1, unit: "", unitPrice: transaction.amount, total: transaction.amount }];
        return items.map((item, index) => {
          runningBalance += Number(item.total) || 0;
          return { id: item.id, transaction, item, displayAmount: Number(item.total) || 0, balance: runningBalance, details: `${item.details}${index === 0 && transaction.reference ? ` — فاتورة ${transaction.reference}` : ""}` };
        });
      }
      runningBalance -= Number(transaction.amount) || 0;
      const allocationLabels = (transaction.allocations || []).map((allocation) => {
        const invoice = transactions.find((entry) => entry.id === allocation.purchaseId);
        return `${invoice?.reference ? `فاتورة ${invoice.reference}` : "فاتورة شراء"}: ${money(allocation.amount)}`;
      });
      return [{ id: transaction.id, transaction, item: null, displayAmount: -Number(transaction.amount || 0), balance: runningBalance, details: `تسديد للمجهّز${transaction.method ? ` — ${transaction.method}` : ""}${allocationLabels.length ? ` (${allocationLabels.join("، ")})` : ""}` }];
    });
    const totals = totalsFor(selectedSupplier);
    const remainingByPurchase = new Map<string, number>();
    transactions.filter((entry) => entry.type === "purchase").forEach((purchase) => remainingByPurchase.set(purchase.id, purchase.amount));
    transactions.filter((entry) => entry.type === "payment").forEach((payment) => (payment.allocations || []).forEach((allocation) => remainingByPurchase.set(allocation.purchaseId, Math.max(0, (remainingByPurchase.get(allocation.purchaseId) || 0) - allocation.amount))));

    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setSelectedSupplierId(null)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><ArrowRight className="h-4 w-4" /> رجوع إلى المجهّزين</button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openPurchase} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"><PackagePlus className="h-4 w-4" /> تسجيل شراء</button>
            <button type="button" onClick={openPayment} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"><CreditCard className="h-4 w-4" /> تسجيل تسديد</button>
            <button type="button" onClick={() => void printElement("supplier-ledger-print", { title: `حساب ${selectedSupplier.name}` })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><FileText className="h-4 w-4" /> طباعة</button>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><Truck className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold text-slate-900">{selectedSupplier.name}</h2>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                {selectedSupplier.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" />{selectedSupplier.phone}</span>}
                {selectedSupplier.address && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{selectedSupplier.address}</span>}
                {selectedSupplier.notes && <span className="w-full text-slate-500">ملاحظات: {selectedSupplier.notes}</span>}
              </div>
            </div>
            <button type="button" onClick={() => openEditSupplier(selectedSupplier)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">تعديل التفاصيل</button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Summary label="إجمالي المشتريات" value={totals.purchases} currency={currency} tone="blue" />
          <Summary label="إجمالي التسديدات" value={totals.paid} currency={currency} tone="green" />
          <Summary label={totals.balance >= 0 ? "المتبقي بذمتك للمجهّز" : "رصيد لك عند المجهّز"} value={Math.abs(totals.balance)} currency={currency} tone={totals.balance > 0 ? "amber" : "slate"} />
        </section>

        <section id="supplier-ledger-print" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3"><h3 className="font-extrabold text-slate-800">القائمة الحسابية — {selectedSupplier.name}</h3><p className="mt-1 text-xs text-slate-500">المشتريات تزيد الرصيد، والتسديدات تنقصه. الرصيد يوضح المطلوب بعد كل حركة.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-sm">
              <thead className="bg-slate-50 text-slate-700"><tr>
                {["ت", "التاريخ والوقت", "التفاصيل", "الكمية", "السعر", "المبلغ الكلي", "الرصيد بعد الحركة"].map((header) => <th key={header} className="border border-slate-200 px-2 py-2 text-center font-extrabold">{header}</th>)}
              </tr></thead>
              <tbody>
                {ledgerRows.map((row, index) => <tr key={row.id} className={row.transaction.type === "payment" ? "bg-emerald-50/60" : "hover:bg-slate-50"}>
                  <td className="border border-slate-200 px-2 py-2 text-center">{index + 1}</td>
                  <td className="border border-slate-200 px-2 py-2 text-center text-xs leading-5">{dateLabel(row.transaction.date)}</td>
                  <td className="border border-slate-200 px-2 py-2 font-semibold">{row.details}{row.transaction.notes && <div className="mt-1 text-xs font-normal text-slate-500">{row.transaction.notes}</div>}</td>
                  <td className="border border-slate-200 px-2 py-2 text-center">{row.item ? `${money(row.item.quantity)} ${row.item.unit}` : "—"}</td>
                  <td className="border border-slate-200 px-2 py-2 text-center">{row.item ? money(row.item.unitPrice) : "—"}</td>
                  <td className={`border border-slate-200 px-2 py-2 text-center font-bold ${row.displayAmount < 0 ? "text-emerald-700" : "text-slate-800"}`}>{row.displayAmount < 0 ? `−${money(Math.abs(row.displayAmount))}` : money(row.displayAmount)} {currency}</td>
                  <td className="border border-slate-200 px-2 py-2 text-center font-extrabold">{row.balance < 0 ? `رصيد لك ${money(Math.abs(row.balance))}` : `${money(row.balance)} ${currency}`}</td>
                </tr>)}
                {!ledgerRows.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">ماكو مشتريات أو تسديدات مسجلة لهذا المجهّز بعد.</td></tr>}
              </tbody>
              {ledgerRows.length > 0 && <tfoot className="bg-slate-50 font-extrabold"><tr><td colSpan={5} className="border border-slate-200 px-3 py-3 text-left">الرصيد الحالي</td><td colSpan={2} className="border border-slate-200 px-3 py-3 text-center">{totals.balance < 0 ? `رصيد لك ${money(Math.abs(totals.balance))}` : `${money(totals.balance)} ${currency}`}</td></tr></tfoot>}
            </table>
          </div>
          {transactions.some((entry) => entry.type === "purchase") && <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">باقي الفواتير غير المسددة: {transactions.filter((entry) => entry.type === "purchase").map((purchase) => ({ purchase, due: remainingByPurchase.get(purchase.id) || 0 })).filter(({ due }) => due > 0).map(({ purchase, due }) => `${purchase.reference ? `فاتورة ${purchase.reference}` : dateLabel(purchase.date)}: ${money(due)} ${currency}`).join(" — ") || "لا توجد"}</div>}
        </section>

        {purchaseOpen && <Modal title="تسجيل شراء من المجهّز" onClose={() => setPurchaseOpen(false)}>
          <form onSubmit={savePurchase} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="تاريخ ووقت الشراء"><input required type="datetime-local" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputClass} /></Field>
              <Field label="رقم الفاتورة (اختياري)"><input value={purchaseReference} onChange={(e) => setPurchaseReference(e.target.value)} className={inputClass} placeholder="مثال: 102" /></Field>
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => <div key={line.id} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between"><strong className="text-sm">الصنف {index + 1}</strong>{lines.length > 1 && <button type="button" onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))} className="rounded-lg p-1 text-rose-600 hover:bg-rose-50" aria-label="حذف الصنف"><X className="h-4 w-4" /></button>}</div>
                <Field label="اختيار بضاعة من المخزون (اختياري)"><select value={line.productId} onChange={(e) => selectProductForLine(line.id, e.target.value)} className={inputClass}><option value="">صنف غير مربوط بالمخزون</option>{products.filter((product) => !product.isDeleted).map((product) => <option key={product.id} value={product.id}>{product.name} — {product.quantity} {product.unitName || "قطعة"}</option>)}</select></Field>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label="التفاصيل"><input required value={line.details} onChange={(e) => updateLine(line.id, { details: e.target.value })} className={inputClass} placeholder="اسم البضاعة" /></Field>
                  <Field label="الكمية"><input required type="number" min="0.01" step="any" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: e.target.value })} className={inputClass} /></Field>
                  <Field label="الوحدة"><input value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} className={inputClass} placeholder="قطعة" /></Field>
                  <Field label="سعر الوحدة"><input required type="number" min="0" step="any" value={line.unitPrice} onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })} className={inputClass} placeholder="السعر" /></Field>
                </div>
                <div className="mt-2 text-left text-xs font-bold text-slate-600">مجموع الصنف: {money((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))} {currency}</div>
              </div>)}
              <button type="button" onClick={addLine} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50"><Plus className="h-4 w-4" /> إضافة صنف آخر</button>
            </div>
            <Field label="ملاحظات الفاتورة"><textarea value={purchaseNote} onChange={(e) => setPurchaseNote(e.target.value)} className={inputClass} rows={2} placeholder="أي ملاحظة تريد حفظها" /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-blue-50 p-3 text-sm font-extrabold text-blue-900">مجموع الفاتورة: {money(purchaseTotal)} {currency}<p className="mt-1 text-xs font-medium text-blue-800">الأصناف المرتبطة بالمخزون تزيد كميتها تلقائياً.</p></div><Field label="دفعت للمجهّز الآن (اختياري)"><input type="number" min="0" max={purchaseTotal} step="any" value={purchasePaidNow} onChange={(e) => setPurchasePaidNow(e.target.value)} className={inputClass} placeholder="إذا ما دفعت اتركه فارغاً" /></Field></div>
            {Number(purchasePaidNow) > 0 && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">المتبقي من هذه الفاتورة: {money(Math.max(0, purchaseTotal - Number(purchasePaidNow)))} {currency}</div>}
            {Number(purchasePaidNow) > purchaseTotal && <p className="text-xs font-bold text-rose-600">المبلغ المدفوع الآن لا يمكن أن يتجاوز مجموع الفاتورة. لتسديد دين قديم سجّل تسديداً منفصلاً.</p>}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setPurchaseOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">إلغاء</button><button disabled={saving || purchaseTotal <= 0 || Number(purchasePaidNow) > purchaseTotal} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ الشراء"}</button></div>
          </form>
        </Modal>}

        {paymentOpen && <Modal title="تسجيل تسديد للمجهّز" onClose={() => setPaymentOpen(false)}>
          <form onSubmit={savePayment} className="space-y-4">
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">المتبقي حالياً: <strong>{money(Math.max(totals.balance, 0))} {currency}</strong><p className="mt-1 text-xs">إذا سددت مبلغاً، يوزعه الحساب تلقائياً على أقدم الفواتير غير المسددة أولاً.</p></div>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="مبلغ التسديد"><input required autoFocus type="number" min="0.01" step="any" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputClass} placeholder="المبلغ" /></Field><Field label="تاريخ ووقت التسديد"><input required type="datetime-local" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} /></Field></div>
            <Field label="طريقة الدفع"><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}><option>نقداً</option><option>تحويل</option><option>صك</option><option>أخرى</option></select></Field>
            <Field label="ملاحظات التسديد"><textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className={inputClass} rows={2} placeholder="رقم وصل أو ملاحظة" /></Field>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setPaymentOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">إلغاء</button><button disabled={saving || Number(paymentAmount) <= 0} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ التسديد"}</button></div>
          </form>
        </Modal>}

        {supplierFormOpen && <SupplierFormModal title={editingSupplier ? "تعديل تفاصيل المجهّز" : "إضافة مجهّز"} form={supplierForm} setForm={setSupplierForm} onSubmit={saveSupplier} onClose={() => setSupplierFormOpen(false)} />}
      </div>
    );
  }

  const dueTotal = visibleSuppliers.reduce((sum, supplier) => sum + Math.max(0, totalsFor(supplier).balance), 0);
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-extrabold text-slate-900">المجهّزون</h2><p className="mt-1 text-sm text-slate-500">اضغط مطولاً على المجهّز لفتح حسابه أو تعديل بياناته.</p></div>
        <button type="button" onClick={openNewSupplier} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> إضافة مجهّز</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><Summary label="عدد المجهّزين" value={visibleSuppliers.length} currency="" tone="blue" /><Summary label="إجمالي المبالغ المتبقية للمجهّزين" value={dueTotal} currency={currency} tone="amber" /></div>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="ابحث باسم المجهّز أو الهاتف أو العنوان" /></div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-700"><tr>{["ت", "اسم المجهّز", "رقم الهاتف", "إجمالي المشتريات", "إجمالي التسديدات", "المتبقي بذمتك"].map((header) => <th key={header} className="border border-slate-200 px-2 py-3 text-center font-extrabold">{header}</th>)}</tr></thead>
          <tbody>{visibleSuppliers.map((supplier, index) => { const totals = totalsFor(supplier); return <tr key={supplier.id} onContextMenu={(e) => { e.preventDefault(); setContextSupplierId(supplier.id); }} onPointerDown={(e) => onRowPointerDown(e, supplier.id)} onPointerMove={onRowPointerMove} onPointerUp={clearHold} onPointerCancel={clearHold} className="select-none cursor-pointer transition-colors hover:bg-blue-50/50 active:bg-blue-50">
            <td className="border border-slate-200 px-2 py-3 text-center">{index + 1}</td><td className="border border-slate-200 px-3 py-3 font-bold text-slate-900">{supplier.name}</td><td className="border border-slate-200 px-2 py-3 text-center">{supplier.phone || "—"}</td><td className="border border-slate-200 px-2 py-3 text-center">{money(totals.purchases)} {currency}</td><td className="border border-slate-200 px-2 py-3 text-center text-emerald-700">{money(totals.paid)} {currency}</td><td className="border border-slate-200 px-2 py-3 text-center font-extrabold text-amber-800">{totals.balance < 0 ? `رصيد لك ${money(Math.abs(totals.balance))}` : `${money(totals.balance)} ${currency}`}</td>
          </tr>; })}{!visibleSuppliers.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">ماكو مجهّزين مسجلين. اضغط «إضافة مجهّز» حتى تبدأ.</td></tr>}</tbody>
        </table></div>
        <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">عدد المجهّزين: {visibleSuppliers.length} — اضغط مطولاً على السطر لعرض الإجراءات.</div>
      </div>
      {contextSupplier && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/30 p-3 sm:items-center" onClick={() => setContextSupplierId(null)}><div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="mb-2 flex items-center justify-between border-b border-slate-100 px-2 pb-3"><div><p className="text-xs text-slate-500">إجراءات المجهّز</p><strong>{contextSupplier.name}</strong></div><button onClick={() => setContextSupplierId(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><button onClick={() => { setSelectedSupplierId(contextSupplier.id); setContextSupplierId(null); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right font-bold text-blue-700 hover:bg-blue-50"><BookOpenIcon /> فتح الحساب</button><button onClick={() => openEditSupplier(contextSupplier)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right font-semibold text-slate-700 hover:bg-slate-50"><UserRound className="h-4 w-4" /> تعديل التفاصيل</button><button onClick={() => { if (window.confirm(`إخفاء المجهّز «${contextSupplier.name}» من القائمة؟ سيبقى حسابه محفوظاً.`)) void deleteSupplier(contextSupplier.id); setContextSupplierId(null); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> إخفاء المجهّز</button></div></div>}
      {supplierFormOpen && <SupplierFormModal title={editingSupplier ? "تعديل تفاصيل المجهّز" : "إضافة مجهّز"} form={supplierForm} setForm={setSupplierForm} onSubmit={saveSupplier} onClose={() => setSupplierFormOpen(false)} />}
    </div>
  );
}

const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-bold text-slate-600">{label}{children}</label>; }
function Summary({ label, value, currency, tone }: { label: string; value: number; currency: string; tone: "blue" | "green" | "amber" | "slate" }) {
  const tones = { blue: "bg-blue-50 text-blue-900 border-blue-100", green: "bg-emerald-50 text-emerald-900 border-emerald-100", amber: "bg-amber-50 text-amber-900 border-amber-100", slate: "bg-slate-50 text-slate-900 border-slate-200" };
  return <div className={`rounded-2xl border p-4 ${tones[tone]}`}><div className="text-xs font-bold opacity-75">{label}</div><div className="mt-2 text-lg font-extrabold">{money(value)} {currency}</div></div>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3"><h3 className="font-extrabold text-slate-900">{title}</h3><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="p-4">{children}</div></div></div>;
}
function SupplierFormModal({ title, form, setForm, onSubmit, onClose }: { title: string; form: SupplierForm; setForm: React.Dispatch<React.SetStateAction<SupplierForm>>; onSubmit: (event: React.FormEvent) => void; onClose: () => void }) {
  const set = (key: keyof SupplierForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <Modal title={title} onClose={onClose}><form onSubmit={onSubmit} className="space-y-3"><Field label="اسم المجهّز"><input required autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} placeholder="اسم الشخص أو الشركة" /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="رقم الهاتف"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} inputMode="tel" /></Field><Field label="العنوان"><input value={form.address} onChange={(e) => set("address", e.target.value)} className={inputClass} /></Field></div><Field label="ملاحظات"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} rows={3} /></Field><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">إلغاء</button><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">حفظ</button></div></form></Modal>;
}
function BookOpenIcon() { return <FileText className="h-4 w-4" />; }
