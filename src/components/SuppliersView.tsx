import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, CreditCard, Eraser, FileText, MapPin, PackagePlus, Palette, Phone, Plus, Printer, Search, ShoppingCart, Sparkles, Trash2, Truck, Type, UserRound, X } from "lucide-react";
import type { Product, Supplier, SupplierLedgerRowStyle, SupplierTransaction, SupplierTransactionItem, SystemSettings } from "../types";
import { exportElementToPDF, printElement } from "../utils/printUtils";
import SupplierLedgerBook from "./SupplierLedgerBook";
import FormattedNumberInput from "./FormattedNumberInput";
import { formatThousands } from "../utils/numberFormatting";


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

const money = (value: number) => formatThousands((Number(value) || 0), { maximumFractionDigits: 2 });
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowLocalInput = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};
const toLocalDateTimeInput = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return nowLocalInput();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
  const [supplierPdfBusy, setSupplierPdfBusy] = useState(false);
  const [supplierSheetMode, setSupplierSheetMode] = useState<"view" | "edit">("view");
  const [supplierLedgerTab, setSupplierLedgerTab] = useState<"all" | "purchases" | "payments">("all");
  const [supplierToolsTab, setSupplierToolsTab] = useState<"font" | "add" | "delete" | "move" | "page" | "favorites">("font");
  const [selectedLedgerRowId, setSelectedLedgerRowId] = useState<string | null>(null);
  const [supplierPageColor, setSupplierPageColor] = useState("#ffffff");
  const [supplierDraftTransactions, setSupplierDraftTransactions] = useState<SupplierTransaction[]>([]);
  const [supplierRowsDirty, setSupplierRowsDirty] = useState(false);
  const [supplierSelectionMode, setSupplierSelectionMode] = useState(false);
  const [selectedSupplierRowIds, setSelectedSupplierRowIds] = useState<string[]>([]);
  const [supplierFontSize, setSupplierFontSize] = useState(13);
  const [supplierFavorites, setSupplierFavorites] = useState<string[]>(["bold", "addBelow", "moveUp", "italic", "underline", "strike", "cart"]);
  const [supplierFavoritesDraft, setSupplierFavoritesDraft] = useState<string[]>([]);
  const [showSupplierFavoritesEditor, setShowSupplierFavoritesEditor] = useState(false);
  const [supplierCartOpen, setSupplierCartOpen] = useState(false);
  const [supplierCartProductId, setSupplierCartProductId] = useState("");
  const [supplierCartQuantity, setSupplierCartQuantity] = useState("1");
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  const supplierLongPressTriggered = useRef(false);

  const visibleSuppliers = useMemo(() => suppliers.filter((supplier) => !supplier.isDeleted)
    .filter((supplier) => `${supplier.name} ${supplier.phone || ""} ${supplier.address || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "ar")), [suppliers, query]);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId && !supplier.isDeleted) || null;
  const contextSupplier = suppliers.find((supplier) => supplier.id === contextSupplierId && !supplier.isDeleted) || null;
  const currency = settings.currency || "د.ع";

  useEffect(() => {
    const supplier = suppliers.find((entry) => entry.id === selectedSupplierId && !entry.isDeleted);
    const currentTransactions = supplier?.transactions || [];
    setSupplierDraftTransactions(currentTransactions.map((entry) => ({ ...entry, items: entry.items?.map((item) => ({ ...item })) })));
    setSupplierRowsDirty(false);
    setSupplierSheetMode("view");
    setSupplierLedgerTab("all");
    setSupplierToolsTab("font");
    setSelectedLedgerRowId(null);
    setSupplierSelectionMode(false);
    setSelectedSupplierRowIds([]);
    setSupplierPageColor(supplier?.ledgerBackgroundColor || "#ffffff");
    try { setSupplierFavorites(JSON.parse(localStorage.getItem(`supplier_accounting_favorites_${selectedSupplierId}`) || '["bold","addBelow","moveUp","italic","underline","strike","cart"]')); } catch { setSupplierFavorites(["bold", "addBelow", "moveUp", "italic", "underline", "strike", "cart"]); }
  }, [selectedSupplierId]);

  const updateSupplierTransaction = (transactionId: string, patch: Partial<SupplierTransaction>) => {
    setSupplierDraftTransactions((current) => current.map((entry) => entry.id === transactionId ? { ...entry, ...patch } : entry));
    setSupplierRowsDirty(true);
  };

  const updateSupplierItem = (transactionId: string, itemId: string, patch: Partial<SupplierTransactionItem>) => {
    setSupplierDraftTransactions((current) => current.map((entry) => {
      if (entry.id !== transactionId || entry.type !== "purchase") return entry;
      const items = (entry.items || []).map((item) => {
        if (item.id !== itemId) return item;
        const updated = { ...item, ...patch };
        if (patch.quantity !== undefined || patch.unitPrice !== undefined) updated.total = (Number(updated.quantity) || 0) * (Number(updated.unitPrice) || 0);
        return updated;
      });
      return { ...entry, items, amount: items.reduce((sum, item) => sum + (Number(item.total) || 0), 0) };
    }));
    setSupplierRowsDirty(true);
  };

  const applySelectedRowStyle = (patch: Partial<SupplierLedgerRowStyle>) => {
    const row = selectedSupplierId ? (supplierDraftTransactions.flatMap((transaction) => transaction.type === "purchase" ? (transaction.items || []).map((item) => ({ id: item.id, transaction, item })) : [{ id: transaction.id, transaction, item: null }]).find((entry) => entry.id === selectedLedgerRowId) || null) : null;
    const targets = supplierSelectionMode && selectedSupplierRowIds.length ? selectedSupplierRowIds : row ? [row.id] : [];
    if (!targets.length) { window.alert("حدد صفاً من عمود (ت) أولاً."); return; }
    setSupplierDraftTransactions((current) => current.map((transaction) => {
      if (transaction.type === "purchase") return { ...transaction, items: (transaction.items || []).map((item) => targets.includes(item.id) ? { ...item, rowStyle: { ...(item.rowStyle || transaction.rowStyle || {}), ...patch } } : item) };
      return targets.includes(transaction.id) ? { ...transaction, rowStyle: { ...(transaction.rowStyle || {}), ...patch } } : transaction;
    }));
    setSupplierRowsDirty(true);
  };

  const toggleSupplierRowSelection = (rowId: string) => setSelectedSupplierRowIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);

  const totalsFor = (supplier: Supplier) => {
    const transactions = Array.isArray(supplier.transactions) ? supplier.transactions : [];
    const purchases = supplier.ledgerInvoices !== undefined
      ? supplier.ledgerInvoices.reduce((sum, entry) => sum + (Number(entry.grandTotal) || 0), 0)
      : transactions.filter((entry) => entry.type === "purchase").reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const paid = supplier.ledgerPayments !== undefined
      ? supplier.ledgerPayments.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)
      : transactions.filter((entry) => entry.type === "payment").reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
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

  // Reuse the complete debt-register notebook for a supplier, while the adapter
  // stores its invoices, payments and accounting sheet inside that supplier only.
  if (selectedSupplier) {
    return <SupplierLedgerBook supplier={selectedSupplier} products={products} settings={settings} updateSupplier={updateSupplier} updateProduct={updateProduct} onBack={() => setSelectedSupplierId(null)} />;
  }

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

  const openPurchase = () => {
    const transactionId = newId("supplier-purchase");
    const itemId = newId("supplier-item");
    const transaction: SupplierTransaction = { id: transactionId, type: "purchase", date: new Date().toISOString(), amount: 0, items: [{ id: itemId, details: "", quantity: 1, unit: "قطعة", unitPrice: 0, total: 0 }] };
    setSupplierDraftTransactions((current) => [...current, transaction]);
    setSelectedLedgerRowId(itemId);
    setSupplierLedgerTab("purchases");
    setSupplierSheetMode("edit");
    setSupplierRowsDirty(true);
  };
  const openPayment = () => {
    const transactionId = newId("supplier-payment");
    const transaction: SupplierTransaction = { id: transactionId, type: "payment", date: new Date().toISOString(), amount: 0, method: "نقداً", allocations: [] };
    setSupplierDraftTransactions((current) => [...current, transaction]);
    setSelectedLedgerRowId(transactionId);
    setSupplierLedgerTab("payments");
    setSupplierSheetMode("edit");
    setSupplierRowsDirty(true);
  };

  if (selectedSupplier) {
    const transactions = [...(supplierSheetMode === "edit" ? supplierDraftTransactions : (selectedSupplier.transactions || []))].sort((a, b) => a.date.localeCompare(b.date));
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
    const totals = totalsFor({ ...selectedSupplier, transactions });
    const remainingByPurchase = new Map<string, number>();
    transactions.forEach((entry) => {
      if (entry.type === "purchase") remainingByPurchase.set(entry.id, Number(entry.amount) || 0);
      else {
        let available = Number(entry.amount) || 0;
        for (const [purchaseId, due] of remainingByPurchase) {
          if (available <= 0) break;
          const applied = Math.min(due, available);
          remainingByPurchase.set(purchaseId, due - applied);
          available -= applied;
        }
      }
    });
    const shownRows = ledgerRows.filter((row) => supplierLedgerTab === "all" || (supplierLedgerTab === "purchases" ? row.transaction.type === "purchase" : row.transaction.type === "payment"));
    const selectedLedgerRow = ledgerRows.find((row) => row.id === selectedLedgerRowId) || null;
    const selectedRowStyle = selectedLedgerRow?.item?.rowStyle || selectedLedgerRow?.transaction.rowStyle || {};
    const saveSupplierRows = async () => {
      if (!supplierRowsDirty) { setSupplierSheetMode("view"); return; }
      const savedItemIds = new Set((selectedSupplier.transactions || []).flatMap((entry) => entry.items?.map((item) => item.id) || []));
      const incompleteNewItem = supplierDraftTransactions.some((entry) => entry.type === "purchase" && (entry.items || []).some((item) => !savedItemIds.has(item.id) && (item.details.trim() || Number(item.quantity) || Number(item.unitPrice)) && (!item.details.trim() || Number(item.quantity) <= 0 || Number(item.unitPrice) <= 0)));
      if (incompleteNewItem) { window.alert("أكمل تفاصيل الصنف والكمية وسعر الوحدة في الصف الجديد، أو اترك الصف فارغاً قبل الحفظ."); return; }
      setSaving(true);
      try {
        const outstanding = new Map<string, number>();
        const normalized = [...supplierDraftTransactions].sort((a, b) => a.date.localeCompare(b.date)).flatMap((entry) => {
          if (entry.type === "purchase") {
            const items = entry.items?.filter((item) => item.details.trim() || (Number(item.total) || 0) > 0).map((item) => ({ ...item, quantity: Number(item.quantity) || 0, unitPrice: Number(item.unitPrice) || 0, total: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) }));
            if (entry.items?.length && !items?.length) return [];
            const amount = items?.length ? items.reduce((sum, item) => sum + item.total, 0) : Number(entry.amount) || 0;
            if (!items?.length && amount <= 0) return [];
            outstanding.set(entry.id, amount);
            return [{ ...entry, ...(items?.length ? { items } : {}), amount }];
          }
          let unallocated = Number(entry.amount) || 0;
          if (unallocated <= 0) return [];
          const allocations: NonNullable<SupplierTransaction["allocations"]> = [];
          for (const [purchaseId, due] of outstanding) {
            if (unallocated <= 0) break;
            const allocated = Math.min(due, unallocated);
            if (allocated > 0) { allocations.push({ purchaseId, amount: allocated }); outstanding.set(purchaseId, due - allocated); unallocated -= allocated; }
          }
          return [{ ...entry, amount: Number(entry.amount) || 0, allocations }];
        }).sort((a, b) => a.date.localeCompare(b.date));
        await updateSupplier({ ...selectedSupplier, transactions: normalized, ledgerBackgroundColor: supplierPageColor });
        const quantitiesByProduct = (entries: SupplierTransaction[]) => {
          const quantities = new Map<string, number>();
          for (const transaction of entries) for (const item of transaction.items || []) if (item.productId) quantities.set(item.productId, (quantities.get(item.productId) || 0) + (Number(item.quantity) || 0));
          return quantities;
        };
        const previousQuantities = quantitiesByProduct(selectedSupplier.transactions || []);
        const nextQuantities = quantitiesByProduct(normalized);
        const stockDeltas = new Map<string, { quantity: number; transactionId: string; latestItem?: SupplierTransactionItem }>();
        for (const productId of new Set([...previousQuantities.keys(), ...nextQuantities.keys()])) {
          const latestPurchase = normalized.flatMap((entry) => entry.type === "purchase" ? (entry.items || []).map((item) => ({ item, date: entry.date, transactionId: entry.id })) : []).filter(({ item }) => item.productId === productId).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
          stockDeltas.set(productId, { quantity: (nextQuantities.get(productId) || 0) - (previousQuantities.get(productId) || 0), transactionId: latestPurchase?.transactionId || "", latestItem: latestPurchase?.item });
        }
        for (const [productId, delta] of stockDeltas) {
          if (!delta.quantity) continue;
          const product = products.find((entry) => entry.id === productId);
          if (!product) continue;
          await updateProduct({ ...product, quantity: Math.max(0, (Number(product.quantity) || 0) + delta.quantity), ...(delta.latestItem && delta.quantity > 0 ? { purchasePrice: delta.latestItem.unitPrice, supplierName: selectedSupplier.name, supplierPhone: selectedSupplier.phone } : {}), stockMovements: [...(product.stockMovements || []), { id: newId("stock"), type: "adjustment", quantity: delta.quantity, createdAt: new Date().toISOString(), note: `تعديل حساب المجهّز ${selectedSupplier.name}`, referenceId: delta.transactionId }] });
        }
        setSupplierDraftTransactions(normalized);
        setSupplierRowsDirty(false);
        setSupplierSheetMode("view");
      } finally { setSaving(false); }
    };
    const cancelSupplierRows = () => {
      setSupplierDraftTransactions((selectedSupplier.transactions || []).map((entry) => ({ ...entry, items: entry.items?.map((item) => ({ ...item })) })));
      setSupplierPageColor(selectedSupplier.ledgerBackgroundColor || "#ffffff");
      setSupplierRowsDirty(false);
      setSupplierSheetMode("view");
    };
    const deleteSelectedSupplierRow = () => {
      const row = ledgerRows.find((entry) => entry.id === selectedLedgerRowId);
      if (!row) { window.alert("حدد صفاً من عمود (ت) أولاً."); return; }
      if (!window.confirm("تأكيد حذف هذا الصف من حساب المجهّز؟")) return;
      setSupplierDraftTransactions((current) => current.flatMap((entry) => {
        if (entry.id !== row.transaction.id) return [entry];
        if (entry.type === "purchase" && row.item) {
          const items = (entry.items || []).filter((item) => item.id !== row.item!.id);
          return items.length ? [{ ...entry, items, amount: items.reduce((sum, item) => sum + (Number(item.total) || 0), 0) }] : [];
        }
        return [];
      }));
      setSupplierRowsDirty(true);
      setSelectedLedgerRowId(null);
    };
    const insertSupplierRow = (type: "purchase" | "payment", position: "above" | "below") => {
      const selectedIndex = ledgerRows.findIndex((row) => row.id === selectedLedgerRowId);
      const currentTime = selectedIndex >= 0 ? new Date(ledgerRows[selectedIndex].transaction.date).getTime() : Date.now();
      const previousTime = selectedIndex > 0 ? new Date(ledgerRows[selectedIndex - 1].transaction.date).getTime() : undefined;
      const nextTime = selectedIndex >= 0 && selectedIndex < ledgerRows.length - 1 ? new Date(ledgerRows[selectedIndex + 1].transaction.date).getTime() : undefined;
      let time = currentTime;
      if (selectedIndex >= 0 && position === "above") time = previousTime !== undefined && currentTime - previousTime > 1 ? Math.floor((previousTime + currentTime) / 2) : currentTime - 1;
      if (selectedIndex >= 0 && position === "below") time = nextTime !== undefined && nextTime - currentTime > 1 ? Math.floor((nextTime + currentTime) / 2) : currentTime + 1;
      const transactionId = newId(type === "purchase" ? "supplier-purchase" : "supplier-payment");
      const transaction: SupplierTransaction = type === "purchase"
        ? { id: transactionId, type, date: new Date(time).toISOString(), amount: 0, items: [{ id: newId("supplier-item"), details: "", quantity: 0, unit: "", unitPrice: 0, total: 0 }] }
        : { id: transactionId, type, date: new Date(time).toISOString(), amount: 0, method: "نقداً", allocations: [] };
      setSupplierDraftTransactions((current) => [...current, transaction]);
      setSelectedLedgerRowId(type === "purchase" ? transaction.items![0].id : transaction.id);
      setSupplierLedgerTab(type === "purchase" ? "purchases" : "payments");
      setSupplierSheetMode("edit");
      setSupplierRowsDirty(true);
      setSupplierToolsTab("font");
      window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-supplier-cell="${type === "purchase" ? transaction.items![0].id : transaction.id}-${type === "purchase" ? "details" : "amount"}"]`)?.focus(), 0);
    };
    const moveSelectedSupplierRow = (direction: -1 | 1) => {
      const row = ledgerRows.find((entry) => entry.id === selectedLedgerRowId);
      const from = ledgerRows.findIndex((entry) => entry.id === selectedLedgerRowId);
      const neighbor = ledgerRows[from + direction];
      if (!row || !neighbor || from < 0) return;
      if (row.transaction.id === neighbor.transaction.id && row.item && neighbor.item) {
        setSupplierDraftTransactions((current) => current.map((entry) => {
          if (entry.id !== row.transaction.id || entry.type !== "purchase") return entry;
          const items = [...(entry.items || [])];
          const a = items.findIndex((item) => item.id === row.item!.id);
          const b = items.findIndex((item) => item.id === neighbor.item!.id);
          if (a >= 0 && b >= 0) [items[a], items[b]] = [items[b], items[a]];
          return { ...entry, items };
        }));
      } else {
        setSupplierDraftTransactions((current) => current.map((entry) => entry.id === row.transaction.id ? { ...entry, date: neighbor.transaction.date } : entry.id === neighbor.transaction.id ? { ...entry, date: row.transaction.date } : entry));
      }
      setSupplierRowsDirty(true);
    };
    const clearSupplierLedger = () => {
      if (!window.confirm(`تأكيد تفريغ كل الحركات من حساب المجهّز «${selectedSupplier.name}»؟`)) return;
      setSupplierDraftTransactions([]);
      setSelectedLedgerRowId(null);
      setSupplierRowsDirty(true);
    };
    const addSupplierCartItem = () => {
      const product = products.find((entry) => entry.id === supplierCartProductId && !entry.isDeleted);
      if (!product) { window.alert("اختر بضاعة من المخزون أولاً."); return; }
      const quantity = Number(supplierCartQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0) { window.alert("أدخل كمية صحيحة."); return; }
      const selected = ledgerRows.find((entry) => entry.id === selectedLedgerRowId);
      if (selected?.transaction.type === "purchase" && selected.item && !selected.item.details.trim() && !(Number(selected.item.total) || 0)) {
        updateSupplierItem(selected.transaction.id, selected.item.id, { productId: product.id, details: product.name, quantity, unit: product.unitName || "قطعة", unitPrice: Number(product.purchasePrice) || 0 });
      } else {
        const transactionId = newId("supplier-purchase");
        const itemId = newId("supplier-item");
        const transaction: SupplierTransaction = { id: transactionId, type: "purchase", date: new Date().toISOString(), amount: quantity * (Number(product.purchasePrice) || 0), items: [{ id: itemId, productId: product.id, details: product.name, quantity, unit: product.unitName || "قطعة", unitPrice: Number(product.purchasePrice) || 0, total: quantity * (Number(product.purchasePrice) || 0) }] };
        setSupplierDraftTransactions((current) => [...current, transaction]);
        setSelectedLedgerRowId(itemId);
        setSupplierRowsDirty(true);
        setSupplierLedgerTab("purchases");
      }
      setSupplierCartOpen(false);
      setSupplierCartProductId("");
      setSupplierCartQuantity("1");
      setSupplierSheetMode("edit");
    };
    const runSupplierFavorite = (key: string) => {
      if (key === "bold") applySelectedRowStyle({ bold: !selectedRowStyle.bold });
      else if (key === "italic") applySelectedRowStyle({ italic: !selectedRowStyle.italic });
      else if (key === "underline") applySelectedRowStyle({ underline: !selectedRowStyle.underline });
      else if (key === "strike") applySelectedRowStyle({ strike: !selectedRowStyle.strike });
      else if (key === "addAbove") insertSupplierRow("purchase", "above");
      else if (key === "addBelow") insertSupplierRow("purchase", "below");
      else if (key === "deleteRow") deleteSelectedSupplierRow();
      else if (key === "clear") clearSupplierLedger();
      else if (key === "moveUp") moveSelectedSupplierRow(-1);
      else if (key === "moveDown") moveSelectedSupplierRow(1);
      else if (key === "cart") setSupplierCartOpen(true);
      else if (key === "page") setSupplierToolsTab("page");
    };
    const focusSupplierCell = (rowId: string, field: string) => window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-supplier-cell="${rowId}-${field}"]`)?.focus(), 0);
    const advanceSupplierCell = (event: React.KeyboardEvent<HTMLInputElement>, row: typeof ledgerRows[number], field: string) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const fields = row.transaction.type === "purchase" ? ["details", "date", "quantity", "unit", "unitPrice"] : ["details", "date", "amount"];
      const current = fields.indexOf(field);
      if (current >= 0 && current < fields.length - 1) focusSupplierCell(row.id, fields[current + 1]);
      else {
        const index = shownRows.findIndex((entry) => entry.id === row.id);
        const next = shownRows[index + 1];
        if (next) focusSupplierCell(next.id, "details");
        else if (supplierSheetMode === "edit") insertSupplierRow(row.transaction.type, "below");
      }
    };
    const handleSupplierGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter") return;
      const token = (event.target as HTMLInputElement).dataset.supplierCell;
      if (!token) return;
      const splitAt = token.lastIndexOf("-");
      const rowId = token.slice(0, splitAt);
      const field = token.slice(splitAt + 1);
      const row = shownRows.find((entry) => entry.id === rowId);
      if (row) advanceSupplierCell(event as unknown as React.KeyboardEvent<HTMLInputElement>, row, field);
    };

    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => { if (supplierRowsDirty && !window.confirm("عندك تعديلات غير محفوظة. تريد الخروج وإلغاءها؟")) return; setSelectedSupplierId(null); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><ArrowRight className="h-4 w-4" /> رجوع إلى المجهّزين</button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void printElement("supplier-ledger-print", { title: `حساب ${selectedSupplier.name}` })} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"><Printer className="h-4 w-4" /> طباعة</button>
            <button type="button" disabled={supplierPdfBusy} onClick={() => { setSupplierPdfBusy(true); void exportElementToPDF("supplier-ledger-print", { filename: `كشف_حساب_${selectedSupplier.name}` }).finally(() => setSupplierPdfBusy(false)); }} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 disabled:opacity-50"><FileText className="h-4 w-4" /> {supplierPdfBusy ? "جارٍ تجهيز PDF" : "حفظ PDF"}</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" dir="rtl">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => { if (supplierRowsDirty && !window.confirm("عندك تعديلات غير محفوظة. تريد إلغاءها والرجوع للعرض؟")) return; if (supplierRowsDirty) cancelSupplierRows(); else setSupplierSheetMode("view"); setSupplierSelectionMode(false); setSelectedSupplierRowIds([]); }} aria-pressed={supplierSheetMode === "view"} className={`rounded-lg border px-3 py-2 text-xs font-bold ${supplierSheetMode === "view" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}><span aria-hidden>◉</span> عرض</button>
            <button type="button" onClick={() => setSupplierSheetMode("edit")} aria-pressed={supplierSheetMode === "edit"} className={`rounded-lg border px-3 py-2 text-xs font-bold ${supplierSheetMode === "edit" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}><span aria-hidden>✎</span> تعديل</button>
            {supplierSheetMode === "edit" && <button type="button" aria-pressed={supplierSelectionMode} onClick={() => { setSupplierSelectionMode((active) => !active); setSelectedSupplierRowIds([]); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${supplierSelectionMode ? "border-blue-300 bg-blue-100 text-blue-800" : "border-slate-200 bg-white text-slate-700"}`}>{supplierSelectionMode ? "إلغاء تحديد الصفوف" : "تحديد متعدد"}</button>}
          </div>
          {supplierSheetMode === "edit" && <div className="flex gap-2">
            <button type="button" onClick={() => void saveSupplierRows()} disabled={!supplierRowsDirty || saving} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}</button>
            <button type="button" onClick={cancelSupplierRows} disabled={saving} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">إلغاء التغييرات</button>
          </div>}
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2" role="tablist" aria-label="تبويبات حساب المجهّز">
          {([{ id: "all", label: "كل الحركات" }, { id: "purchases", label: "المشتريات" }, { id: "payments", label: "التسديدات" }] as const).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={supplierLedgerTab === tab.id} onClick={() => setSupplierLedgerTab(tab.id)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${supplierLedgerTab === tab.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-700"}`}>{tab.label}</button>)}
          {supplierSheetMode === "edit" && <span className="self-center text-[11px] text-slate-500">اضغط على خلية لتعديلها مباشرة، والضغط المطوّل على التسلسل يفعّل التحديد المتعدد.</span>}
        </div>
        {supplierSheetMode === "edit" && <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="أدوات حساب المجهّز">
            {([{ id: "font", label: "تنسيق الخط", icon: <Type className="me-1 inline h-3.5 w-3.5" /> }, { id: "add", label: "إضافة", icon: <Plus className="me-1 inline h-3.5 w-3.5" /> }, { id: "delete", label: "حذف", icon: <Trash2 className="me-1 inline h-3.5 w-3.5" /> }, { id: "move", label: "نقل", icon: <ArrowUp className="me-1 inline h-3.5 w-3.5" /> }, { id: "page", label: "لون الصفحة", icon: <Palette className="me-1 inline h-3.5 w-3.5" /> }, { id: "favorites", label: "المفضلة", icon: <Sparkles className="me-1 inline h-3.5 w-3.5" /> }] as const).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={supplierToolsTab === tab.id} onClick={() => setSupplierToolsTab(tab.id)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${supplierToolsTab === tab.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{tab.icon}{tab.label}</button>)}
          </div>
          {supplierToolsTab === "font" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
            <label className="flex items-center gap-1 text-[11px] font-bold">حجم الخط <input aria-label="حجم خط الصف" type="range" min="10" max="22" value={supplierFontSize} onChange={(event) => { const value = Number(event.target.value); setSupplierFontSize(value); applySelectedRowStyle({ fontSize: value }); }} className="w-24 accent-blue-600" /><span className="min-w-6 text-blue-700">{supplierFontSize}</span></label>
            <label className="flex items-center gap-1 text-[11px] font-bold">لون الخط <input aria-label="لون خط الصف" type="color" value={selectedRowStyle.fontColor || "#111827"} onChange={(event) => applySelectedRowStyle({ fontColor: event.target.value })} className="h-7 w-8 rounded border bg-white p-0.5" /></label>
            <button type="button" aria-pressed={!!selectedRowStyle.bold} onClick={() => applySelectedRowStyle({ bold: !selectedRowStyle.bold })} className={`rounded-lg border px-2.5 py-1.5 text-xs font-black ${selectedRowStyle.bold ? "border-blue-300 bg-blue-100" : "border-slate-200 bg-white"}`}>غامق B</button>
            <button type="button" aria-pressed={!!selectedRowStyle.italic} onClick={() => applySelectedRowStyle({ italic: !selectedRowStyle.italic })} className={`rounded-lg border px-2.5 py-1.5 text-xs italic ${selectedRowStyle.italic ? "border-blue-300 bg-blue-100" : "border-slate-200 bg-white"}`}>مائل I</button>
            <button type="button" aria-pressed={!!selectedRowStyle.underline} onClick={() => applySelectedRowStyle({ underline: !selectedRowStyle.underline })} className={`rounded-lg border px-2.5 py-1.5 text-xs underline ${selectedRowStyle.underline ? "border-blue-300 bg-blue-100" : "border-slate-200 bg-white"}`}>تسطير U</button>
            <button type="button" aria-pressed={!!selectedRowStyle.strike} onClick={() => applySelectedRowStyle({ strike: !selectedRowStyle.strike })} className={`rounded-lg border px-2.5 py-1.5 text-xs line-through ${selectedRowStyle.strike ? "border-blue-300 bg-blue-100" : "border-slate-200 bg-white"}`}>شطب</button>
            <label className="flex items-center gap-1 text-[11px] font-bold">تلوين الصف <input aria-label="لون خلفية الصف" type="color" value={selectedRowStyle.backgroundColor || "#ffffff"} onChange={(event) => applySelectedRowStyle({ backgroundColor: event.target.value })} className="h-7 w-8 rounded border bg-white p-0.5" /></label>
          </div>}
          {supplierToolsTab === "add" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><button type="button" onClick={openPurchase} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"><PackagePlus className="me-1 inline h-4 w-4" /> إضافة صف شراء</button><button type="button" onClick={openPayment} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CreditCard className="me-1 inline h-4 w-4" /> إضافة صف تسديد</button><button type="button" onClick={() => insertSupplierRow("purchase", "above")} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white"><ArrowUp className="me-1 inline h-4 w-4" /> شراء أعلاه</button><button type="button" onClick={() => insertSupplierRow("purchase", "below")} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white"><ArrowDown className="me-1 inline h-4 w-4" /> شراء أسفله</button><button type="button" onClick={() => insertSupplierRow("payment", "above")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><ArrowUp className="me-1 inline h-4 w-4" /> تسديد أعلاه</button><button type="button" onClick={() => insertSupplierRow("payment", "below")} className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white"><ArrowDown className="me-1 inline h-4 w-4" /> تسديد أسفله</button><button type="button" onClick={() => setSupplierCartOpen(true)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><ShoppingCart className="me-1 inline h-4 w-4" /> عربة البضاعة</button></div>}
          {supplierToolsTab === "delete" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><button type="button" onClick={deleteSelectedSupplierRow} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"><Eraser className="me-1 inline h-4 w-4" /> حذف الصف</button><button type="button" onClick={clearSupplierLedger} disabled={!ledgerRows.length} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-40">تفريغ السجل</button></div>}
          {supplierToolsTab === "move" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><button type="button" onClick={() => moveSelectedSupplierRow(-1)} disabled={!selectedLedgerRow || ledgerRows.findIndex((entry) => entry.id === selectedLedgerRowId) <= 0} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold disabled:opacity-40"><ArrowUp className="me-1 inline h-4 w-4" /> نقل للأعلى</button><button type="button" onClick={() => moveSelectedSupplierRow(1)} disabled={!selectedLedgerRow || ledgerRows.findIndex((entry) => entry.id === selectedLedgerRowId) >= ledgerRows.length - 1} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold disabled:opacity-40"><ArrowDown className="me-1 inline h-4 w-4" /> نقل للأسفل</button></div>}
          {supplierToolsTab === "page" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><label className="flex items-center gap-2 text-xs font-bold">لون الصفحة <input aria-label="لون ورقة حساب المجهز" type="color" value={supplierPageColor} onChange={(event) => { setSupplierPageColor(event.target.value); setSupplierRowsDirty(true); }} className="h-8 w-10 rounded border bg-white p-1" /></label><div className="flex flex-wrap gap-1.5">{[["ورقي", "#faf6ef"], ["أبيض", "#ffffff"], ["عاجي", "#fdfbf7"], ["رمادي", "#f8fafc"], ["أخضر", "#f2f8f2"], ["أصفر", "#fef9e7"], ["أزرق", "#f0f7ff"]].map(([label, color]) => <button key={color} type="button" title={label} aria-label={label} onClick={() => { setSupplierPageColor(color); setSupplierRowsDirty(true); }} className="h-7 w-7 rounded-lg border border-black/10" style={{ backgroundColor: color }} />)}</div><button type="button" onClick={() => { setSupplierPageColor("#ffffff"); setSupplierRowsDirty(true); }} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold">استعادة اللون الافتراضي</button></div>}
          {supplierToolsTab === "favorites" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">{supplierFavorites.map((key) => <button key={key} type="button" onClick={() => runSupplierFavorite(key)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700">{key === "bold" ? <><Type className="me-1 inline h-3.5 w-3.5" />غامق</> : key === "italic" ? "مائل" : key === "underline" ? "تسطير" : key === "strike" ? "شطب" : key === "addAbove" ? "إضافة أعلى" : key === "addBelow" ? "إضافة صف" : key === "moveUp" ? "نقل ↑" : key === "moveDown" ? "نقل ↓" : key === "deleteRow" ? "حذف الصف" : key === "clear" ? "تفريغ" : key === "cart" ? <><ShoppingCart className="me-1 inline h-3.5 w-3.5" />عربة البضاعة</> : key === "page" ? "لون الصفحة" : key}</button>)}<button type="button" onClick={() => { setSupplierFavoritesDraft([...supplierFavorites]); setShowSupplierFavoritesEditor(true); }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><Sparkles className="me-1 inline h-3.5 w-3.5" /> تخصيص المفضلة</button></div>}
        </section>}

        <section id="supplier-ledger-print" className="overflow-hidden border border-slate-400 p-3 text-slate-900 shadow-sm sm:p-5 print:shadow-none" style={{ backgroundColor: supplierPageColor }}>
          <style>{`.supplier-ledger-input{display:block;box-sizing:border-box;width:100%;min-width:0;height:1.25em;line-height:1.25;border:0;border-radius:0;background:transparent;box-shadow:none;outline:none;margin:0;padding:0 2px;color:inherit;font:inherit}.supplier-ledger-input:focus{background:rgba(239,246,255,.72);box-shadow:inset 0 -1px #2563eb}.supplier-ledger-input::placeholder{color:#94a3b8;font-weight:400}.supplier-ledger-quantity{display:flex;align-items:center;justify-content:center;gap:3px;white-space:nowrap}.supplier-ledger-quantity input{box-sizing:border-box;height:1.25em;line-height:1.25;border:0;border-radius:0;background:transparent;box-shadow:none;outline:none;margin:0;padding:0 1px;color:inherit;font:inherit;text-align:center}.supplier-ledger-quantity input:focus{background:rgba(239,246,255,.72);box-shadow:inset 0 -1px #2563eb}`}</style>
          <header className="overflow-hidden rounded-lg border-[1.5px] border-[#C84B31] bg-gradient-to-l from-white to-[#EBF4FA]">
            <div className="grid min-h-[118px] grid-cols-[54px_minmax(0,1fr)_54px] sm:grid-cols-[90px_minmax(0,1fr)_90px]" dir="rtl">
              <div className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0A367E] to-[#1C65A5] text-white"><div className="absolute -left-5 top-5 h-20 w-20 rounded-full border-2 border-white/50" />{settings.logoUrl ? <img src={settings.logoUrl} alt="شعار المحل" className="relative z-10 h-12 w-12 rounded-full bg-white object-contain p-1 sm:h-16 sm:w-16" /> : <Truck className="relative z-10 h-8 w-8 sm:h-10 sm:w-10" />}</div>
              <div className="flex min-w-0 flex-col justify-center px-2 py-3 text-center sm:px-4"><h2 className="text-lg font-black leading-tight text-[#0A367E] sm:text-2xl">{settings.companyName || "اسم المحل"}</h2><p className="mt-1 text-[10px] font-bold text-slate-700 sm:text-xs">{settings.companyDescription || "كشف حساب المجهّز والمشتريات والتسديدات"}</p><div className="mt-2 flex flex-wrap justify-between gap-x-2 border-t border-[#C84B31]/35 pt-2 text-[9px] font-bold text-[#9E2A2B] sm:text-xs"><span className="truncate">{settings.companyAddress || "عنوان المحل"}</span><span dir="ltr">{settings.companyPhone || "رقم الهاتف"}</span></div></div>
              <div className="relative overflow-hidden bg-gradient-to-br from-[#F9A826] to-[#F27438]"><div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0_25%,rgba(255,255,255,.35)_25%_38%,transparent_38%_50%,rgba(200,75,49,.25)_50%_68%,transparent_68%)]" /></div>
            </div>
          </header>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#C84B31]/60 px-2 py-2 text-xs sm:text-sm" dir="rtl">
            <div className="flex items-center gap-2 font-extrabold text-[#9E2A2B]">كشف حساب المجهّز: {selectedSupplier.name}</div>
            <div className="flex flex-wrap items-center gap-3"><span><b>التاريخ:</b> {dateLabel(nowLocalInput()).split(" — ").pop()}</span><span dir="ltr" className="font-bold tracking-wider">NO: {selectedSupplier.id.slice(-8).toUpperCase()}</span></div>
          </div>
          <div className="my-2 rounded border border-slate-300 px-3 py-2 text-sm">
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2"><div><b>اسم المجهّز:</b> {selectedSupplier.name}</div><div><b>رقم الهاتف:</b> {selectedSupplier.phone || "—"}</div><div><b>العنوان:</b> {selectedSupplier.address || "—"}</div><div><b>ملاحظات المجهّز:</b> {selectedSupplier.notes || "—"}</div></div>
            <button type="button" onClick={() => openEditSupplier(selectedSupplier)} className="mt-1 text-xs font-bold text-blue-700 underline print:hidden">تعديل تفاصيل المجهّز</button>
          </div>
          <div className="overflow-x-auto" onKeyDownCapture={handleSupplierGridKeyDown} style={{ fontSize: `${supplierFontSize}px` }}>
            <table className="w-full min-w-0 table-fixed border-collapse text-sm" style={{ fontFamily: "Tahoma, Arial, sans-serif" }}>
              <colgroup><col style={{ width: "6%" }} /><col style={{ width: "38%" }} /><col style={{ width: "18%" }} /><col style={{ width: "16%" }} /><col style={{ width: "22%" }} /></colgroup>
              <thead><tr>
                {[{ label: "ت", color: "#0018A8" }, { label: "التفاصيل", color: "#E91E63" }, { label: "الكمية", color: "#0018A8" }, { label: "السعر", color: "#0018A8" }, { label: "المبلغ الكلي", color: "#E91E63" }].map((header) => <th key={header.label} className="border border-white px-1 py-2 text-center font-extrabold text-white" style={{ backgroundColor: header.color }}>{header.label}</th>)}
              </tr></thead>
              <tbody>
                {shownRows.map((row, index) => { const rowStyle = row.item?.rowStyle || row.transaction.rowStyle || {}; return <tr key={row.id} style={{ backgroundColor: selectedSupplierRowIds.includes(row.id) ? "#dbeafe" : rowStyle.backgroundColor || (row.transaction.type === "payment" ? "#f8fafc" : "#ffffff"), color: rowStyle.fontColor, fontSize: rowStyle.fontSize ? `${rowStyle.fontSize}px` : undefined, fontWeight: rowStyle.bold ? 800 : undefined, fontStyle: rowStyle.italic ? "italic" : undefined, textDecoration: [rowStyle.underline ? "underline" : "", rowStyle.strike ? "line-through" : ""].filter(Boolean).join(" ") || undefined }} className={selectedLedgerRowId === row.id && supplierSheetMode === "edit" ? "ring-2 ring-inset ring-blue-500" : ""}>
                  <td className="border-x border-b border-[#0018A8] px-1 py-2 text-center">{supplierSheetMode === "edit" ? <button type="button" onPointerDown={(event) => { if (event.button !== 0) return; supplierLongPressTriggered.current = false; holdTimer.current = window.setTimeout(() => { supplierLongPressTriggered.current = true; setSupplierSelectionMode(true); setSelectedSupplierRowIds((current) => current.includes(row.id) ? current : [...current, row.id]); }, 550); }} onPointerUp={clearHold} onPointerLeave={clearHold} onPointerCancel={clearHold} onContextMenu={(event) => event.preventDefault()} onClick={() => { if (supplierLongPressTriggered.current) { supplierLongPressTriggered.current = false; return; } if (supplierSelectionMode) toggleSupplierRowSelection(row.id); else setSelectedLedgerRowId(row.id); }} aria-label={`تحديد الصف ${index + 1}`} className={`mx-auto flex items-center justify-center font-bold leading-5 ${supplierSelectionMode ? `h-6 w-6 border-2 ${selectedSupplierRowIds.includes(row.id) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-400 bg-white text-transparent"}` : `rounded px-1 ${selectedLedgerRowId === row.id ? "bg-blue-100 text-blue-800" : "text-slate-700"}`}`}>{supplierSelectionMode ? (selectedSupplierRowIds.includes(row.id) ? <Check className="h-4 w-4" /> : "✓") : index + 1}</button> : index + 1}</td>
                  <td className="border-x border-b border-[#E91E63]/70 px-2 py-1.5 text-right font-semibold">
                    {row.transaction.type === "payment" ? <><div className="font-black text-[#0018A8]">تسديد</div>{supplierSheetMode === "edit" ? <input data-supplier-cell={`${row.id}-details`} onFocus={() => setSelectedLedgerRowId(row.id)} aria-label="طريقة التسديد" value={row.transaction.method || ""} onChange={(event) => updateSupplierTransaction(row.transaction.id, { method: event.target.value })} className="supplier-ledger-input text-xs font-normal text-right" placeholder="طريقة التسديد" /> : <div className="text-xs font-normal">{row.transaction.method || "تسديد"}</div>}{supplierSheetMode === "edit" ? <input data-supplier-cell={`${row.id}-date`} onFocus={() => setSelectedLedgerRowId(row.id)} aria-label="تاريخ ووقت التسديد" type="datetime-local" value={toLocalDateTimeInput(row.transaction.date)} onChange={(event) => { const date = new Date(event.target.value); if (Number.isFinite(date.getTime())) updateSupplierTransaction(row.transaction.id, { date: date.toISOString() }); }} className="supplier-ledger-input mt-1 text-[10px] font-normal" /> : <div className="mt-1 text-[10px] font-normal text-slate-500">{dateLabel(row.transaction.date)}</div>}<div className="mt-1 text-[10px] font-normal text-slate-600">الرصيد بعد التسديد: {row.balance < 0 ? `رصيد لك ${money(Math.abs(row.balance))}` : `${money(row.balance)} ${currency}`}</div></> : row.item ? <>{supplierSheetMode === "edit" ? <input autoFocus={selectedLedgerRowId === row.id} list="supplier-product-options" data-supplier-cell={`${row.id}-details`} onFocus={() => setSelectedLedgerRowId(row.id)} aria-label="تفاصيل البضاعة" value={row.item.details} onChange={(event) => { const value = event.target.value; const product = products.find((entry) => !entry.isDeleted && entry.name.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase()); updateSupplierItem(row.transaction.id, row.item!.id, { details: value, productId: product?.id, ...(product ? { unit: product.unitName || row.item!.unit } : {}) }); }} className="supplier-ledger-input font-semibold text-right" placeholder="اسم البضاعة" /> : <div>{row.item.details || row.details}</div>}{supplierSheetMode === "edit" ? <input data-supplier-cell={`${row.id}-date`} onFocus={() => setSelectedLedgerRowId(row.id)} aria-label="تاريخ ووقت الشراء" type="datetime-local" value={toLocalDateTimeInput(row.transaction.date)} onChange={(event) => { const date = new Date(event.target.value); if (Number.isFinite(date.getTime())) updateSupplierTransaction(row.transaction.id, { date: date.toISOString() }); }} className="supplier-ledger-input mt-1 text-[10px] font-normal" /> : <div className="mt-1 text-[10px] font-normal text-slate-500">{dateLabel(row.transaction.date)}</div>}{supplierSheetMode !== "edit" && row.transaction.reference && <div className="mt-1 text-[10px] font-normal text-slate-500">رقم الفاتورة: {row.transaction.reference}</div>}{supplierSheetMode !== "edit" && row.transaction.notes && <div className="mt-1 text-[10px] font-normal text-slate-500">ملاحظة: {row.transaction.notes}</div>}</> : <span>{row.details}</span>}
                  </td>
                  <td className="border-x border-b border-[#0018A8] px-1 py-2 text-center">{row.item && supplierSheetMode === "edit" ? <div className="supplier-ledger-quantity"><FormattedNumberInput data-supplier-cell={`${row.id}-quantity`} onFocus={() => setSelectedLedgerRowId(row.id)} aria-label="كمية البضاعة" type="number" min="0" step="any" value={row.item.quantity || ""} onChange={(event) => updateSupplierItem(row.transaction.id, row.item!.id, { quantity: Number(event.target.value) })} style={{ width: "30%", textAlign: "left" }} /><input data-supplier-cell={`${row.id}-unit`} onFocus={() => setSelectedLedgerRowId(row.id)} aria-label="وحدة البضاعة" list="supplier-unit-options" value={row.item.unit} onChange={(event) => updateSupplierItem(row.transaction.id, row.item!.id, { unit: event.target.value })} style={{ width: "70%", textAlign: "right" }} /></div> : row.item ? `${money(row.item.quantity)} ${row.item.unit}` : "—"}</td>
                  <td className="border-x border-b border-[#0018A8] px-1 py-2 text-center">{row.item && supplierSheetMode === "edit" ? <FormattedNumberInput data-supplier-cell={`${row.id}-unitPrice`} onFocus={() => setSelectedLedgerRowId(row.id)} aria-label="سعر الوحدة" type="number" min="0" step="any" value={row.item.unitPrice || ""} onChange={(event) => updateSupplierItem(row.transaction.id, row.item!.id, { unitPrice: Number(event.target.value) })} className="supplier-ledger-input text-center" /> : row.item ? money(row.item.unitPrice) : "—"}</td>
                  <td className="border-x border-b border-[#E91E63]/70 px-1 py-2 text-center font-bold text-[#0018A8]">{row.transaction.type === "payment" && supplierSheetMode === "edit" ? <FormattedNumberInput autoFocus={selectedLedgerRowId === row.id} data-supplier-cell={`${row.id}-amount`} onFocus={() => setSelectedLedgerRowId(row.id)} aria-label="مبلغ التسديد" type="number" min="0" step="any" value={row.transaction.amount || ""} onChange={(event) => updateSupplierTransaction(row.transaction.id, { amount: Number(event.target.value) })} className="supplier-ledger-input text-center font-bold" /> : row.displayAmount < 0 ? `−${money(Math.abs(row.displayAmount))}` : money(row.displayAmount)} {currency}</td>
                </tr>; })}
                {!shownRows.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">ماكو حركات ضمن هذا التبويب.</td></tr>}
              </tbody>
            </table>
            <datalist id="supplier-product-options">{products.filter((product) => !product.isDeleted).map((product) => <option key={product.id} value={product.name} />)}</datalist>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_0.85fr]">
            <div className="min-h-28 rounded border border-slate-400 p-3"><div className="text-sm font-extrabold">ملاحظات:</div><div className="mt-2 text-xs leading-6">{transactions.filter((entry) => entry.notes).map((entry) => entry.notes).join(" | ") || "لا توجد ملاحظات"}</div><div className="mt-4 border-t border-dashed border-slate-300 pt-2 text-center text-xs">ملاحظات إضافية</div></div>
            <div className="overflow-hidden rounded border border-slate-400 text-sm">
              {[{ label: "إجمالي المشتريات", value: totals.purchases }, { label: "إجمالي التسديدات", value: totals.paid }, { label: totals.balance >= 0 ? "المتبقي للمجهّز" : "رصيد لك", value: Math.abs(totals.balance) }].map((entry) => <div key={entry.label} className="flex justify-between border-b border-slate-300 last:border-b-0"><span className="w-1/2 bg-slate-100 px-3 py-2 font-bold">{entry.label}</span><span className="flex-1 px-3 py-2 text-center font-extrabold">{money(entry.value)} {currency}</span></div>)}
            </div>
          </div>
          {transactions.some((entry) => entry.type === "purchase") && <div className="mt-2 text-xs text-slate-600"><strong>الفواتير المتبقية:</strong> {transactions.filter((entry) => entry.type === "purchase").map((purchase, index) => ({ purchase, index: index + 1, due: remainingByPurchase.get(purchase.id) || 0 })).filter(({ due }) => due > 0).map(({ purchase, index, due }) => `${purchase.reference ? `فاتورة ${purchase.reference}` : `فاتورة رقم ${index}`}: ${money(due)} ${currency}`).join(" — ") || "لا توجد فواتير متبقية"}</div>}
          <footer className="mt-6 flex justify-between gap-6 border-t border-slate-400 pt-4 text-xs font-bold"><span>توقيع صاحب المحل: __________________</span><span>توقيع المجهّز: __________________</span></footer>
        </section>

        {showSupplierFavoritesEditor && <Modal title="تخصيص أدوات حساب المجهّز" onClose={() => setShowSupplierFavoritesEditor(false)}>
          <p className="mb-3 text-xs text-slate-500">علّم الأدوات التي تريد ظهورها في تبويب المفضلة.</p>
          <div className="space-y-3">{[["تنسيق الخط", [["bold", "غامق"], ["italic", "مائل"], ["underline", "تسطير"], ["strike", "شطب"]]], ["الإضافة", [["addAbove", "إضافة صف أعلى"], ["addBelow", "إضافة صف أسفل"], ["cart", "عربة البضاعة"]]], ["الحذف والنقل", [["deleteRow", "حذف الصف"], ["clear", "تفريغ السجل"], ["moveUp", "نقل للأعلى"], ["moveDown", "نقل للأسفل"]]], ["الصفحة", [["page", "لون الصفحة"]]]].map(([category, options]) => <section key={category as string}><h4 className="mb-2 border-b pb-1 text-xs font-extrabold">{category as string}</h4><div className="grid gap-2 sm:grid-cols-2">{(options as string[][]).map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={supplierFavoritesDraft.includes(key)} onChange={() => setSupplierFavoritesDraft((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} />{label}</label>)}</div></section>)}</div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShowSupplierFavoritesEditor(false)} className="rounded-lg border px-3 py-2 text-xs font-bold">إلغاء</button><button type="button" onClick={() => { setSupplierFavorites(supplierFavoritesDraft); try { localStorage.setItem(`supplier_accounting_favorites_${selectedSupplier.id}`, JSON.stringify(supplierFavoritesDraft)); } catch {} setShowSupplierFavoritesEditor(false); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">حفظ الأدوات</button></div>
        </Modal>}
        {supplierCartOpen && <Modal title="عربة البضاعة — شراء من المجهّز" onClose={() => setSupplierCartOpen(false)}>
          <div className="space-y-3"><Field label="اختر الصنف من المخزون"><select value={supplierCartProductId} onChange={(event) => setSupplierCartProductId(event.target.value)} className={inputClass}><option value="">اختر بضاعة</option>{products.filter((product) => !product.isDeleted).map((product) => <option key={product.id} value={product.id}>{product.name} — كلفة الشراء {money(Number(product.purchasePrice) || 0)} {currency}</option>)}</select></Field><Field label="الكمية"><FormattedNumberInput type="number" min="0.01" step="any" value={supplierCartQuantity} onChange={(event) => setSupplierCartQuantity(event.target.value)} className={inputClass} /></Field>{supplierCartProductId && <div className="rounded-lg bg-blue-50 p-3 text-sm font-bold text-blue-900">سعر الشراء المعتمد: {money(Number(products.find((product) => product.id === supplierCartProductId)?.purchasePrice) || 0)} {currency}. يمكن تغييره مباشرة من خلية السعر بعد الإضافة.</div>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setSupplierCartOpen(false)} className="rounded-lg border px-3 py-2 text-xs font-bold">إلغاء</button><button type="button" onClick={addSupplierCartItem} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"><ShoppingCart className="me-1 inline h-4 w-4" /> إدراج في الحساب</button></div></div>
        </Modal>}

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
                  <Field label="الكمية"><FormattedNumberInput required type="number" min="0.01" step="any" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: e.target.value })} className={inputClass} /></Field>
                  <Field label="الوحدة"><input value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} className={inputClass} placeholder="قطعة" /></Field>
                  <Field label="سعر الوحدة"><FormattedNumberInput required type="number" min="0" step="any" value={line.unitPrice} onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })} className={inputClass} placeholder="السعر" /></Field>
                </div>
                <div className="mt-2 text-left text-xs font-bold text-slate-600">مجموع الصنف: {money((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))} {currency}</div>
              </div>)}
              <button type="button" onClick={addLine} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50"><Plus className="h-4 w-4" /> إضافة صنف آخر</button>
            </div>
            <Field label="ملاحظات الفاتورة"><textarea value={purchaseNote} onChange={(e) => setPurchaseNote(e.target.value)} className={inputClass} rows={2} placeholder="أي ملاحظة تريد حفظها" /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-blue-50 p-3 text-sm font-extrabold text-blue-900">مجموع الفاتورة: {money(purchaseTotal)} {currency}<p className="mt-1 text-xs font-medium text-blue-800">الأصناف المرتبطة بالمخزون تزيد كميتها تلقائياً.</p></div><Field label="دفعت للمجهّز الآن (اختياري)"><FormattedNumberInput type="number" min="0" max={purchaseTotal} step="any" value={purchasePaidNow} onChange={(e) => setPurchasePaidNow(e.target.value)} className={inputClass} placeholder="إذا ما دفعت اتركه فارغاً" /></Field></div>
            {Number(purchasePaidNow) > 0 && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">المتبقي من هذه الفاتورة: {money(Math.max(0, purchaseTotal - Number(purchasePaidNow)))} {currency}</div>}
            {Number(purchasePaidNow) > purchaseTotal && <p className="text-xs font-bold text-rose-600">المبلغ المدفوع الآن لا يمكن أن يتجاوز مجموع الفاتورة. لتسديد دين قديم سجّل تسديداً منفصلاً.</p>}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setPurchaseOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">إلغاء</button><button disabled={saving || purchaseTotal <= 0 || Number(purchasePaidNow) > purchaseTotal} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ الشراء"}</button></div>
          </form>
        </Modal>}

        {paymentOpen && <Modal title="تسجيل تسديد للمجهّز" onClose={() => setPaymentOpen(false)}>
          <form onSubmit={savePayment} className="space-y-4">
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">المتبقي حالياً: <strong>{money(Math.max(totals.balance, 0))} {currency}</strong><p className="mt-1 text-xs">إذا سددت مبلغاً، يوزعه الحساب تلقائياً على أقدم الفواتير غير المسددة أولاً.</p></div>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="مبلغ التسديد"><FormattedNumberInput required autoFocus type="number" min="0.01" step="any" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputClass} placeholder="المبلغ" /></Field><Field label="تاريخ ووقت التسديد"><input required type="datetime-local" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} /></Field></div>
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
      <section id="supplier-directory-report" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-extrabold text-slate-900">المجهّزون</h2><p className="mt-1 text-sm text-slate-500">اضغط مطولاً على المجهّز لفتح حسابه أو تعديل بياناته.</p></div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" onClick={() => void printElement("supplier-directory-report", { title: "قائمة المجهّزين" })} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-100"><Printer className="h-4 w-4" /> طباعة</button>
          <button type="button" disabled={supplierPdfBusy} onClick={() => { setSupplierPdfBusy(true); void exportElementToPDF("supplier-directory-report", { filename: "قائمة_المجهزين" }).finally(() => setSupplierPdfBusy(false)); }} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700 disabled:opacity-50"><FileText className="h-4 w-4" /> {supplierPdfBusy ? "جارٍ تجهيز PDF" : "تنزيل PDF"}</button>
          <button type="button" onClick={openNewSupplier} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> إضافة مجهّز</button>
        </div>
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
      </section>
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
