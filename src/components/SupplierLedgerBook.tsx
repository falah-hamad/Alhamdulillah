import React, { useMemo, useRef, useState } from "react";
import type { Customer, Invoice, InvoiceItem, Payment, Product, Supplier, SupplierTransaction, SystemSettings } from "../types";
import LedgerView from "./LedgerView";

type Props = {
  supplier: Supplier;
  products: Product[];
  settings: SystemSettings;
  updateSupplier: (supplier: Supplier) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  onBack: () => void;
};

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function invoiceFromTransaction(supplier: Supplier, transaction: SupplierTransaction, index: number): Invoice {
  const items: InvoiceItem[] = (transaction.items || []).map((item) => ({
    id: item.id,
    details: item.details,
    productId: item.productId,
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    total: Number(item.total) || (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    unitCost: item.unitPrice,
    unit: item.unit,
  }));
  if (!items.length && Number(transaction.amount) > 0) items.push({ id: `${transaction.id}-item`, details: "مشتريات من المجهّز", quantity: 1, unitPrice: transaction.amount, total: transaction.amount });
  return {
    id: transaction.id,
    invoiceNumber: transaction.reference || `SUP-${index + 1}`,
    date: transaction.date.slice(0, 10),
    customerId: supplier.id,
    customerName: supplier.name,
    customerPhone: supplier.phone || "",
    customerAddress: supplier.address || "",
    items,
    grandTotal: Number(transaction.amount) || 0,
    paidAmount: 0,
    remainingAmount: Number(transaction.amount) || 0,
    notes: transaction.notes || "",
    employeeName: "",
    signature: "",
    createdAt: transaction.date,
  };
}

function paymentFromTransaction(supplier: Supplier, transaction: SupplierTransaction): Payment {
  return {
    id: transaction.id,
    customerId: supplier.id,
    customerName: supplier.name,
    amount: Number(transaction.amount) || 0,
    date: transaction.date,
    method: transaction.method || "نقداً",
    notes: transaction.notes || "",
    invoiceId: transaction.allocations?.[0]?.purchaseId,
    createdAt: transaction.date,
  };
}

export default function SupplierLedgerBook({ supplier, products, settings, updateSupplier, updateProduct, onBack }: Props) {
  const supplierRef = useRef(supplier);
  supplierRef.current = supplier;
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [savedError, setSavedError] = useState("");

  const customer: Customer = useMemo(() => ({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone || "",
    address: supplier.address || "",
    createdAt: supplier.createdAt,
    accountingSheetDate: supplier.accountingSheetDate,
    accountingSheetRows: supplier.accountingSheetRows || [],
    accountingSheetPayments: supplier.accountingSheetPayments || [],
  }), [supplier]);

  const invoices = useMemo(() => {
    if (supplier.ledgerInvoices?.length) return supplier.ledgerInvoices;
    const purchases = supplier.ledgerInvoices === undefined ? (supplier.transactions || []).filter((transaction) => transaction.type === "purchase") : [];
    const mapped = purchases.map((transaction, index) => invoiceFromTransaction(supplier, transaction, index));
    if (mapped.length) return mapped;
    const date = new Date().toISOString();
    return [{
      id: `supplier-ledger-empty-${supplier.id}`,
      invoiceNumber: "",
      date: date.slice(0, 10),
      customerId: supplier.id,
      customerName: supplier.name,
      customerPhone: supplier.phone || "",
      customerAddress: supplier.address || "",
      items: [],
      grandTotal: 0,
      paidAmount: 0,
      remainingAmount: 0,
      createdAt: date,
    } as Invoice];
  }, [supplier]);

  const payments = useMemo(() => {
    if (supplier.ledgerPayments !== undefined) return supplier.ledgerPayments;
    return (supplier.transactions || []).filter((transaction) => transaction.type === "payment").map((transaction) => paymentFromTransaction(supplier, transaction));
  }, [supplier]);

  const saveSupplier = (next: Supplier) => {
    supplierRef.current = next;
    setSavedError("");
    void updateSupplier(next).catch((error) => {
      console.error("Failed to save supplier ledger:", error);
      setSavedError("تعذر حفظ حساب المجهّز. تحقق من الاتصال وحاول مجدداً.");
    });
  };

  const toPurchaseTransactions = (source: Invoice[]): SupplierTransaction[] => source
    .filter((invoice) => !invoice.id.startsWith("supplier-ledger-empty-") || invoice.items.length > 0)
    .map((invoice) => {
      const items = invoice.items.filter((item) => !item.isPaymentRow && !item.isRemainingRow && !item.isSeparator).map((item) => ({
        id: item.id,
        details: item.details,
        productId: item.productId,
        quantity: Number(item.quantity) || 0,
        unit: String(item.unit || "قطعة"),
        unitPrice: Number(item.unitPrice) || 0,
        total: Number(item.total) || (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
      }));
      return {
        id: invoice.id,
        type: "purchase" as const,
        date: new Date(invoice.date).toISOString(),
        amount: Number(invoice.grandTotal) || items.reduce((sum, item) => sum + item.total, 0),
        reference: invoice.invoiceNumber || undefined,
        notes: invoice.notes || undefined,
        items,
      };
    });

  const saveLedgerData = (patch: Partial<Supplier>) => {
    const current = supplierRef.current;
    saveSupplier({ ...current, ...patch });
  };

  const applyStockDelta = (before: Invoice[], after: Invoice[], referenceId: string) => {
    const quantities = (source: Invoice[]) => {
      const result = new Map<string, number>();
      for (const entry of source) for (const item of entry.items || []) {
        if (item.productId && !item.isPaymentRow && !item.isRemainingRow && !item.isSeparator) result.set(item.productId, (result.get(item.productId) || 0) + (Number(item.quantity) || 0));
      }
      return result;
    };
    const beforeQty = quantities(before);
    const afterQty = quantities(after);
    for (const productId of new Set([...beforeQty.keys(), ...afterQty.keys()])) {
      const delta = (afterQty.get(productId) || 0) - (beforeQty.get(productId) || 0);
      const product = products.find((entry) => entry.id === productId);
      if (!product || !delta) continue;
      const latestItem = after.flatMap((entry) => entry.items || []).filter((item) => item.productId === productId && !item.isPaymentRow && !item.isRemainingRow && !item.isSeparator).at(-1);
      void updateProduct({
        ...product,
        quantity: Math.max(0, (Number(product.quantity) || 0) + delta),
        ...(latestItem && delta > 0 ? { purchasePrice: Number(latestItem.unitCost ?? latestItem.unitPrice) || product.purchasePrice, supplierName: supplier.name, supplierPhone: supplier.phone } : {}),
        stockMovements: [...(product.stockMovements || []), { id: makeId("stock"), type: "adjustment", quantity: delta, createdAt: new Date().toISOString(), note: `حساب المجهّز ${supplier.name}`, referenceId }],
      }).catch((error) => console.error("Failed to update supplier stock:", error));
    }
  };

  const addInvoice = (draft: Omit<Invoice, "id" | "createdAt">): Invoice => {
    const invoice: Invoice = { ...draft, id: makeId("supplier-invoice"), createdAt: new Date().toISOString() };
    const current = supplierRef.current;
    const previousInvoices = current.ledgerInvoices || invoices.filter((entry) => !entry.id.startsWith("supplier-ledger-empty-"));
    const nextInvoices = [...previousInvoices, invoice];
    const purchaseRows = toPurchaseTransactions(nextInvoices);
    const paymentsRows = current.transactions.filter((entry) => entry.type === "payment");
    saveSupplier({ ...current, ledgerInvoices: nextInvoices, transactions: [...purchaseRows, ...paymentsRows] });
    applyStockDelta(previousInvoices, nextInvoices, invoice.id);
    return invoice;
  };

  const updateInvoice = (invoice: Invoice) => {
    const current = supplierRef.current;
    const stored = current.ledgerInvoices || invoices.filter((entry) => !entry.id.startsWith("supplier-ledger-empty-"));
    const nextInvoices = stored.some((entry) => entry.id === invoice.id)
      ? stored.map((entry) => entry.id === invoice.id ? invoice : entry)
      : [...stored, invoice];
    saveSupplier({ ...current, ledgerInvoices: nextInvoices, transactions: [...toPurchaseTransactions(nextInvoices), ...current.transactions.filter((entry) => entry.type === "payment")] });
    applyStockDelta(stored, nextInvoices, invoice.id);
  };

  const addPayment = (draft: Omit<Payment, "id" | "createdAt">): Payment => {
    const payment: Payment = { ...draft, id: makeId("supplier-payment"), createdAt: new Date().toISOString() };
    const current = supplierRef.current;
    const nextPayments = [...(current.ledgerPayments || payments), payment];
    const paymentRows: SupplierTransaction[] = nextPayments.map((entry) => ({ id: entry.id, type: "payment", date: entry.date, amount: entry.amount, method: entry.method, notes: entry.notes, allocations: entry.invoiceId ? [{ purchaseId: entry.invoiceId, amount: entry.amount }] : [] }));
    saveSupplier({ ...current, ledgerPayments: nextPayments, transactions: [...(current.ledgerInvoices ? toPurchaseTransactions(current.ledgerInvoices) : current.transactions.filter((entry) => entry.type === "purchase")), ...paymentRows] });
    return payment;
  };

  const customerRecord = (next: Customer) => saveLedgerData({
    name: next.name,
    phone: next.phone,
    address: next.address,
    accountingSheetDate: next.accountingSheetDate,
    accountingSheetRows: next.accountingSheetRows || [],
    accountingSheetPayments: next.accountingSheetPayments || [],
  });

  return <div className="space-y-3" dir="rtl">
    {savedError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{savedError}</div>}
    <LedgerView
      customers={[customer]}
      products={products}
      invoices={invoices}
      payments={payments}
      settings={settings}
      addInvoice={addInvoice}
      updateInvoice={updateInvoice}
      addPayment={addPayment}
      deleteInvoice={(id) => {
        const current = supplierRef.current;
        const previousInvoices = current.ledgerInvoices || invoices.filter((entry) => !entry.id.startsWith("supplier-ledger-empty-"));
        const nextInvoices = previousInvoices.filter((entry) => entry.id !== id);
        saveSupplier({ ...current, ledgerInvoices: nextInvoices, transactions: [...toPurchaseTransactions(nextInvoices), ...current.transactions.filter((entry) => entry.type === "payment")] });
        applyStockDelta(previousInvoices, nextInvoices, id);
      }}
      onOpenNewCustomerModal={() => {}}
      updateCustomer={customerRecord}
      selectedCustomerId={supplier.id}
      setSelectedCustomerId={() => onBack()}
      selectedInvoiceId={selectedInvoiceId || invoices[0]?.id || null}
      setSelectedInvoiceId={setSelectedInvoiceId}
      onReturnToCustomerDataTable={onBack}
      returnToListLabel="العودة إلى قائمة المجهّزين"
      accountEntityLabel="المجهّز"
    />
  </div>;
}
