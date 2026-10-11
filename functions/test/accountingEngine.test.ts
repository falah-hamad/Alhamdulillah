import test from "node:test";
import assert from "node:assert/strict";
import {
  executeDeterministicFinancialQuery,
  processFullAccountingDataset,
} from "../src/accountingEngine";

function buildDataset() {
  const folders = [
    { id: "f1", name: "الكرخ" },
    { id: "f2", name: "الرصافة" },
  ];

  const customers = [
    { id: "c1", name: "احمد علي", folderId: "f1" },
    { id: "c2", name: "حسين كريم", folderId: "f1" },
    { id: "c3", name: "سارة خالد", folderId: "f2" },
    { id: "c4", name: "نور عادل", folderId: "f2" },
    { id: "c5", name: "علي احمد", folderId: "f1" },
    { id: "c6", name: "علي احمد", folderId: "f2" },
  ];

  const invoices = [
    { id: "i1", customerId: "c1", customerName: "احمد علي", grandTotal: 200000, paidAmount: 70000, remainingAmount: 130000, date: "2026-10-01" },
    { id: "i2", customerId: "c2", customerName: "حسين كريم", grandTotal: 150000, paidAmount: 30000, remainingAmount: 120000, date: "2026-10-03" },
    { id: "i3", customerId: "c3", customerName: "سارة خالد", grandTotal: 100000, paidAmount: 100000, remainingAmount: 0, date: "2026-09-10" },
    { id: "i4", customerId: "c4", customerName: "نور عادل", grandTotal: 90000, paidAmount: 0, remainingAmount: 90000, date: "2026-10-02" },
    { id: "i5", customerId: "c5", customerName: "علي احمد", grandTotal: 60000, paidAmount: 0, remainingAmount: 60000, date: "2026-10-02" },
    { id: "i6", customerId: "c6", customerName: "علي احمد", grandTotal: 50000, paidAmount: 0, remainingAmount: 50000, date: "2026-10-02" },
  ];

  const payments = [
    { id: "p1", customerId: "c1", customerName: "احمد علي", amount: 50000, date: "2026-10-09", method: "نقدي" },
    { id: "p2", customerId: "c2", customerName: "حسين كريم", amount: 30000, date: "2026-10-15", method: "تحويل" },
    { id: "p3", customerId: "c1", customerName: "احمد علي", amount: 20000, date: "2026-10-16", method: "نقدي" },
    { id: "p4", customerId: "c3", customerName: "سارة خالد", amount: 100000, date: "2026-09-10", method: "نقدي" },
  ];

  return processFullAccountingDataset(customers, folders, invoices, payments, "د.ع");
}

const NOW = new Date("2026-10-20T09:00:00Z");

test("does not double-count payment ledger into balances", () => {
  const dataset = buildDataset();
  assert.equal(dataset.portfolio.totalDebt, 650000);
  assert.equal(dataset.portfolio.totalPaid, 200000);
  assert.equal(dataset.portfolio.totalRemaining, 450000);
});

test("answers payments on a specific day in current month", () => {
  const dataset = buildDataset();
  const result = executeDeterministicFinancialQuery("منو دفع يوم 15 من هذا الشهر؟", dataset, { now: NOW });

  assert.equal(result.intent, "payments_by_period");
  assert.match(result.resultAnswer, /حسين كريم/);
  assert.doesNotMatch(result.resultAnswer, /احمد علي/);
});

test("filters debt range with arabic amount words", () => {
  const dataset = buildDataset();
  const result = executeDeterministicFinancialQuery("اعطني العملاء الذين ديونهم بين خمسين الف و مية وخمسين الف", dataset, { now: NOW });

  assert.equal(result.intent, "range");
  assert.match(result.resultAnswer, /احمد علي/);
  assert.match(result.resultAnswer, /حسين كريم/);
  assert.match(result.resultAnswer, /نور عادل/);
});

test("finds debtors who did not pay this month", () => {
  const dataset = buildDataset();
  const result = executeDeterministicFinancialQuery("منو ما سدد خلال هذا الشهر؟", dataset, { now: NOW });

  assert.equal(result.intent, "customers_without_period_payment");
  assert.match(result.resultAnswer, /نور عادل/);
  assert.doesNotMatch(result.resultAnswer, /احمد علي/);
  assert.doesNotMatch(result.resultAnswer, /حسين كريم/);
});

test("returns ambiguity list when multiple customers share same name", () => {
  const dataset = buildDataset();
  const result = executeDeterministicFinancialQuery("علي احمد شكد عليه؟", dataset, { now: NOW });

  assert.equal(result.intent, "ambiguity");
  assert.match(result.resultAnswer, /الاسم غير واضح/);
  assert.ok((result.listedCustomerIds || []).length >= 2);
});

test("supports follow-up details by index using previous user query", () => {
  const dataset = buildDataset();
  const result = executeDeterministicFinancialQuery("اعرض تفاصيل الثاني", dataset, {
    now: NOW,
    conversationHistory: [{ sender: "user", text: "اعلى 3 مدينين" }],
  });

  assert.equal(result.intent, "follow_up");
  assert.match(result.resultAnswer, /كشف حساب العميل/);
});

test("supports per-folder top debtors not paid this month", () => {
  const dataset = buildDataset();
  const result = executeDeterministicFinancialQuery("اعطني اعلى خمسة مدينين في كل مجلد ممن لم يسددوا هذا الشهر", dataset, { now: NOW });

  assert.equal(result.intent, "folder_summary");
  assert.match(result.resultAnswer, /الكرخ/);
  assert.match(result.resultAnswer, /الرصافة/);
  assert.match(result.resultAnswer, /نور عادل/);
});
