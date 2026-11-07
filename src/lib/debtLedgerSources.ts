import type { AccountingSheetPayment, AccountingSheetRow, Customer, Invoice, InvoiceItem, Payment } from "../types";

export interface LedgerTotals {
  sales: number;
  paid: number;
  remaining: number;
  capital: number;
  quantity: number;
}

const amount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function getInvoiceLedgerTotals(invoice: Invoice): LedgerTotals {
  const items: InvoiceItem[] = Array.isArray(invoice.items) ? invoice.items : [];
  const saleItems = items.filter(item => !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow);
  const sales = saleItems.reduce((sum, item) => sum + amount(item.total || item.unitPrice), 0);
  const paid = items.filter(item => item.isSeparator || item.isPaymentRow).reduce((sum, item) =>
    sum + amount(item.isSeparator ? item.paidAmount : item.total || item.unitPrice), 0);
  return {
    sales,
    paid,
    remaining: Math.max(0, sales - paid),
    capital: saleItems.reduce((sum, item) => sum + amount(item.unitCost) * amount(item.quantity), 0),
    quantity: saleItems.reduce((sum, item) => sum + amount(item.quantity), 0),
  };
}

export function getCustomerLedgerTotals(customer: Customer, invoices: Invoice[]): LedgerTotals {
  const customerInvoices = invoices.filter(invoice => !invoice.isDeleted && invoice.customerId === customer.id);
  const invoiceTotals = customerInvoices.map(getInvoiceLedgerTotals);
  const rows: AccountingSheetRow[] = Array.isArray(customer.accountingSheetRows) ? customer.accountingSheetRows : [];
  const sheetSalesRows = rows.filter(row => !row.isSeparator);
  const sheetSales = sheetSalesRows.reduce((sum, row) => sum + amount(row.total || row.unitPrice), 0);
  const sheetPaid: AccountingSheetPayment[] = Array.isArray(customer.accountingSheetPayments) ? customer.accountingSheetPayments : [];
  const sheetPaidAmount = sheetPaid.reduce((sum, payment) => sum + amount(payment.amount), 0);
  return {
    sales: invoiceTotals.reduce((sum, total) => sum + total.sales, 0) + sheetSales,
    paid: invoiceTotals.reduce((sum, total) => sum + total.paid, 0) + sheetPaidAmount,
    remaining: invoiceTotals.reduce((sum, total) => sum + total.remaining, 0) + Math.max(0, sheetSales - sheetPaidAmount),
    capital: invoiceTotals.reduce((sum, total) => sum + total.capital, 0) + sheetSalesRows.reduce((sum, row) => sum + amount(row.unitCost) * amount(row.quantity), 0),
    quantity: invoiceTotals.reduce((sum, total) => sum + total.quantity, 0) + sheetSalesRows.reduce((sum, row) => sum + amount(row.quantity), 0),
  };
}

/** Build the app's payment view-model solely from the customer's two debt ledgers. */
export function deriveLedgerPayments(customers: Customer[], invoices: Invoice[]): Payment[] {
  const customerById = new Map(customers.filter(customer => !customer.isDeleted).map(customer => [customer.id, customer]));
  const result: Payment[] = [];

  for (const invoice of invoices) {
    if (invoice.isDeleted || !customerById.has(invoice.customerId)) continue;
    const customer = customerById.get(invoice.customerId)!;
    const items: InvoiceItem[] = Array.isArray(invoice.items) ? invoice.items : [];
    for (const row of items) {
      const value = amount(row.paidAmount);
      const rowAmount = row.isSeparator ? value : amount(row.total || row.unitPrice);
      if (!(row.isSeparator || row.isPaymentRow) || rowAmount <= 0) continue;
      const date = row.paidDate || row.createdAt || invoice.date || invoice.createdAt;
      result.push({
        id: `ledger-vertical-${invoice.id}-${row.id}`,
        userId: invoice.userId || customer.userId,
        customerId: customer.id,
        customerName: customer.name,
        amount: rowAmount,
        date,
        method: row.paymentMethod || row.method || row.paidNote || "سجل الديون",
        notes: row.paidNote || row.details || `تسديد على الفاتورة ${invoice.invoiceNumber}`,
        invoiceId: invoice.id,
        createdAt: date || invoice.createdAt,
      });
    }
  }

  for (const customer of customers) {
    if (customer.isDeleted) continue;
    const sheetPayments: AccountingSheetPayment[] = Array.isArray(customer.accountingSheetPayments) ? customer.accountingSheetPayments : [];
    for (const payment of sheetPayments) {
      const value = amount(payment.amount);
      if (value <= 0) continue;
      result.push({
        id: `ledger-accounting-${customer.id}-${payment.id}`,
        userId: customer.userId,
        customerId: customer.id,
        customerName: customer.name,
        amount: value,
        date: payment.date || customer.accountingSheetDate || customer.createdAt,
        method: payment.method || "القائمة الحسابية",
        notes: payment.notes || "تسديد مسجل في سجل الديون",
        createdAt: payment.date || customer.accountingSheetDate || customer.createdAt,
      });
    }
  }

  return result.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
}
