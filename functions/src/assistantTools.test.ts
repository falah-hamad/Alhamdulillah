import { test } from "node:test";
import { strict as assert } from "node:assert";
import { processFullAccountingDataset } from "./accountingEngine";
import { executeFinancialAssistantTool } from "./assistantTools";

function fixture() {
  return processFullAccountingDataset(
    [
      { id: "c1", name: "أحمد علي", folderId: "f1" },
      { id: "c2", name: "محمد حسن", folderId: "f1" },
      { id: "c3", name: "سارة كريم", folderId: "f2" },
    ],
    [
      { id: "f1", name: "المحل" },
      { id: "f2", name: "البيت" },
    ],
    [
      { id: "i1", customerId: "c1", grandTotal: 12000, paidAmount: 2000, remainingAmount: 10000, date: "2026-01-01" },
      { id: "i2", customerId: "c2", grandTotal: 18000, paidAmount: 3000, remainingAmount: 15000, date: "2026-01-02" },
      { id: "i3", customerId: "c3", grandTotal: 7000, paidAmount: 1000, remainingAmount: 6000, date: "2026-01-03" },
    ],
    [
      { id: "p1", customerId: "c1", amount: 2000, date: "2026-01-10", method: "نقدي" },
      { id: "p2", customerId: "c2", amount: 3000, date: "2026-02-10", method: "نقدي" },
    ],
    "د.ع"
  );
}

test("search_customers applies an inclusive debt range", () => {
  const result = executeFinancialAssistantTool("search_customers", {
    minRemainingDebt: 5000,
    maxRemainingDebt: 15000,
    sortBy: "remainingDebt",
    sortDirection: "desc",
    limit: 20,
  }, fixture()) as any;

  assert.equal(result.totalMatches, 3);
  assert.deepEqual(result.customers.map((c: any) => c.remainingDebt), [15000, 10000, 6000]);
});

test("search_customers combines folder, range, sorting, and limit", () => {
  const result = executeFinancialAssistantTool("search_customers", {
    minRemainingDebt: 9000,
    maxRemainingDebt: 16000,
    folderName: "المحل",
    sortDirection: "desc",
    limit: 1,
  }, fixture()) as any;

  assert.equal(result.totalMatches, 2);
  assert.equal(result.returned, 1);
  assert.equal(result.customers[0].name, "محمد حسن");
});

test("search_invoices filters by customer, date, and total amount", () => {
  const result = executeFinancialAssistantTool("search_invoices", {
    customerName: "محمد حسن",
    fromDate: "2026-01-02",
    minAmount: 10000,
    limit: 10,
  }, fixture()) as any;

  assert.equal(result.totalMatches, 1);
  assert.equal(result.totalAmount, 18000);
  assert.equal(result.totalRemaining, 15000);
  assert.equal(result.invoices[0].customerName, "محمد حسن");
});

test("search_invoices excludes soft-deleted invoices", () => {
  const dataset = fixture();
  dataset.rawInvoices.push({
    id: "deleted-invoice",
    customerId: "c1",
    grandTotal: 99999,
    paidAmount: 0,
    remainingAmount: 99999,
    date: "2026-01-05",
    isDeleted: true,
  });

  const result = executeFinancialAssistantTool("search_invoices", {
    customerName: "أحمد علي",
    minAmount: 50000,
  }, dataset) as any;

  assert.equal(result.totalMatches, 0);
  assert.equal(result.totalAmount, 0);
  assert.equal(result.invoices.length, 0);
});

test("get_customer_ledger excludes soft-deleted invoices", () => {
  const dataset = fixture();
  dataset.rawInvoices.push({
    id: "deleted-i1",
    customerId: "c1",
    grandTotal: 99999,
    paidAmount: 0,
    remainingAmount: 99999,
    date: "2026-01-05",
    isDeleted: true,
  });
  dataset.rawPayments.push({
    id: "deleted-p1",
    customerId: "c1",
    amount: 88888,
    date: "2026-01-06",
    isDeleted: true,
  });

  const result = executeFinancialAssistantTool("get_customer_ledger", {
    customerName: "أحمد علي",
  }, dataset) as any;

  assert.equal(result.found, true);
  assert.equal(result.customer.remainingDebt, 10000);
  assert.equal(result.invoices.length, 1);
  assert.equal(result.invoices.some((invoice: any) => invoice.id === "deleted-i1"), false);
  assert.equal(result.recentPayments.length, 1);
  assert.equal(result.recentPayments[0].amount, 2000);
  assert.equal(result.recentPayments.some((payment: any) => payment.id === "deleted-p1"), false);
});

test("search_payments filters by date and amount", () => {
  const result = executeFinancialAssistantTool("search_payments", {
    fromDate: "2026-02-01",
    minAmount: 2500,
  }, fixture()) as any;

  assert.equal(result.totalMatches, 1);
  assert.equal(result.totalAmount, 3000);
  assert.equal(result.payments[0].customerName, "محمد حسن");
});

test("get_payment_summary totals payments by method within a date range and excludes deleted payments", () => {
  const dataset = fixture();
  dataset.rawPayments.push(
    { id: "p3", customerId: "c1", amount: 9000, date: "2026-02-12", method: "تحويل", isDeleted: true },
    { id: "p4", customerId: "c1", amount: 4000, date: "2026-02-12", method: "تحويل" }
  );

  const result = executeFinancialAssistantTool("get_payment_summary", {
    fromDate: "2026-02-01",
    toDate: "2026-02-28",
  }, dataset) as any;

  assert.equal(result.totalPayments, 2);
  assert.equal(result.totalAmount, 7000);
  assert.deepEqual(result.methods, [
    { method: "نقدي", count: 1, totalAmount: 3000 },
    { method: "تحويل", count: 1, totalAmount: 4000 },
  ].sort((a, b) => b.totalAmount - a.totalAmount));
});

test("get_payment_summary rejects reversed date ranges", () => {
  const result = executeFinancialAssistantTool("get_payment_summary", {
    fromDate: "2026-03-01",
    toDate: "2026-02-01",
  }, fixture()) as any;

  assert.match(result.error, /تاريخ البداية/);
});

test("search_unpaid_invoices returns only positive remaining balances and excludes deleted invoices", () => {
  const dataset = fixture();
  dataset.rawInvoices.push(
    { id: "i4", customerId: "c1", grandTotal: 50000, paidAmount: 0, remainingAmount: 50000, date: "2026-02-01", isDeleted: true },
    { id: "i5", customerId: "c3", grandTotal: 7000, paidAmount: 7000, remainingAmount: 0, date: "2026-02-02" }
  );

  const result = executeFinancialAssistantTool("search_unpaid_invoices", {
    minRemaining: 9000,
    limit: 10,
  }, dataset) as any;

  assert.equal(result.totalMatches, 2);
  assert.equal(result.totalRemaining, 25000);
  assert.deepEqual(result.invoices.map((invoice: any) => invoice.customerName), ["محمد حسن", "أحمد علي"]);
});

test("get_overdue_invoices filters due dates, customer, and deleted records", () => {
  const dataset = fixture();
  dataset.rawInvoices.push(
    { id: "old1", invoiceNumber: "INV-OLD", customerId: "c1", grandTotal: 15000, paidAmount: 5000, remainingAmount: 10000, date: "2026-01-01", dueDate: "2026-02-01" },
    { id: "old2", customerId: "c2", grandTotal: 30000, paidAmount: 0, remainingAmount: 30000, date: "2026-01-01", dueDate: "2026-01-15", isDeleted: true },
    { id: "future", customerId: "c1", grandTotal: 10000, paidAmount: 0, remainingAmount: 10000, date: "2026-01-01", dueDate: "2026-12-01" }
  );
  const result = executeFinancialAssistantTool("get_overdue_invoices", {
    asOfDate: "2026-03-01",
    customerName: "أحمد علي",
  }, dataset) as any;

  assert.equal(result.totalMatches, 1);
  assert.equal(result.totalRemaining, 10000);
  assert.equal(result.invoices[0].invoiceNumber, "INV-OLD");
});

test("get_invoice_status_summary groups invoice balances and excludes deleted invoices", () => {
  const dataset = fixture();
  dataset.rawInvoices.push(
    { id: "paid", customerId: "c1", grandTotal: 5000, paidAmount: 5000, remainingAmount: 0, date: "2026-02-01" },
    { id: "deleted", customerId: "c2", grandTotal: 90000, paidAmount: 0, remainingAmount: 90000, date: "2026-02-02", isDeleted: true }
  );
  const result = executeFinancialAssistantTool("get_invoice_status_summary", {
    fromDate: "2026-02-01",
    toDate: "2026-02-28",
  }, dataset) as any;

  assert.equal(result.invoiceCount, 1);
  assert.equal(result.totalAmount, 5000);
  assert.equal(result.statuses.paid.count, 1);
  assert.equal(result.totalRemaining, 0);
});

test("get_collection_priorities ranks overdue debtors and supports folder filters", () => {
  const dataset = fixture();
  dataset.rawInvoices.push(
    { id: "late1", customerId: "c1", grandTotal: 50000, paidAmount: 10000, remainingAmount: 40000, date: "2026-01-01", dueDate: "2026-01-15" },
    { id: "late2", customerId: "c2", grandTotal: 20000, paidAmount: 0, remainingAmount: 20000, date: "2026-01-01", dueDate: "2026-01-15" }
  );
  const result = executeFinancialAssistantTool("get_collection_priorities", {
    folderName: "المحل",
    minOverdueAmount: 1,
    limit: 10,
  }, dataset) as any;

  assert.equal(result.returned, 2);
  assert.equal(result.customers[0].name, "أحمد علي");
  assert.equal(result.customers[0].overdueAmount, 40000);
  assert.equal(result.customers[0].collectionPriority, "متوسطة");
});

test("unknown tool returns an explicit error rather than fabricated data", () => {
  const result = executeFinancialAssistantTool("unknown_tool", {}, fixture()) as any;
  assert.match(result.error, /غير معروفة/);
});
