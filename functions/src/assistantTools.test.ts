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

test("unknown tool returns an explicit error rather than fabricated data", () => {
  const result = executeFinancialAssistantTool("unknown_tool", {}, fixture()) as any;
  assert.match(result.error, /غير معروفة/);
});
