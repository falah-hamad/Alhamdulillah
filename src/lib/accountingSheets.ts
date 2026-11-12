import type { AccountingSheet, AccountingSheetCategory, AccountingSheetRow, Customer } from "../types";

/** Returns saved customer sheets, exposing the legacy single sheet as a virtual first sheet. */
export function getCustomerAccountingSheets(customer: Customer): AccountingSheet[] {
  if (Array.isArray(customer.accountingSheets)) return customer.accountingSheets;
  return [{
    id: `legacy-accounting-${customer.id}`,
    name: "القائمة الحسابية 1",
    rows: Array.isArray(customer.accountingSheetRows) ? customer.accountingSheetRows : [],
    createdAt: customer.accountingSheetDate || customer.createdAt,
  }];
}

export function getCustomerAccountingCategories(customer: Customer): AccountingSheetCategory[] {
  return Array.isArray(customer.accountingSheetCategories) ? customer.accountingSheetCategories : [];
}

export function flattenAccountingSheets(sheets: AccountingSheet[]): AccountingSheetRow[] {
  return sheets.flatMap(sheet => Array.isArray(sheet.rows) ? sheet.rows : []);
}
