import type { AccountingSheet, AccountingSheetCategory, AccountingSheetRow, Customer } from "../types";

/** Returns saved customer sheets, exposing the legacy single sheet as a virtual first sheet. */
export function getCustomerAccountingSheets(customer: Customer): AccountingSheet[] {
  if (Array.isArray(customer.accountingSheets) && customer.accountingSheets.length > 0) {
    // Generated sheet IDs have always included the owning customer ID. Keep
    // legacy IDs, but exclude a tagged or generated sheet from another customer.
    const ownerPrefix = `accounting-sheet-${customer.id}-`;
    const ownedSheets = customer.accountingSheets.filter(sheet => {
      if (sheet.ownerAccountId && sheet.ownerAccountId !== customer.id) return false;
      if (sheet.id.startsWith("accounting-sheet-") && !sheet.id.startsWith(ownerPrefix)) return false;
      if (sheet.id.startsWith("legacy-accounting-") && sheet.id !== `legacy-accounting-${customer.id}`) return false;
      return true;
    });
    if (ownedSheets.length > 0) return ownedSheets;
    // If every saved sheet belongs to another customer, don't re-expose those
    // same rows through the flattened legacy compatibility field.
    return [{
      id: `legacy-accounting-${customer.id}`,
      ownerAccountId: customer.id,
      name: "القائمة الحسابية 1",
      rows: [],
      createdAt: customer.accountingSheetDate || customer.createdAt,
    }];
  }
  return [{
    id: `legacy-accounting-${customer.id}`,
    ownerAccountId: customer.id,
    name: "القائمة الحسابية 1",
    rows: Array.isArray(customer.accountingSheetRows) ? customer.accountingSheetRows : [],
    createdAt: customer.accountingSheetDate || customer.createdAt,
  }];
}

export function getCustomerAccountingCategories(customer: Customer): AccountingSheetCategory[] {
  if (!Array.isArray(customer.accountingSheetCategories)) return [];
  const ownerPrefix = `accounting-category-${customer.id}-`;
  const sheetOwnerPrefix = `accounting-sheet-${customer.id}-`;
  const foreignCategoryIds = new Set((Array.isArray(customer.accountingSheets) ? customer.accountingSheets : [])
    .filter(sheet => (sheet.ownerAccountId && sheet.ownerAccountId !== customer.id) || (sheet.id.startsWith("accounting-sheet-") && !sheet.id.startsWith(sheetOwnerPrefix)))
    .map(sheet => sheet.categoryId)
    .filter((id): id is string => Boolean(id)));
  return customer.accountingSheetCategories.filter(category => {
    if (category.ownerAccountId && category.ownerAccountId !== customer.id) return false;
    if (foreignCategoryIds.has(category.id)) return false;
    const generatedIdTail = category.id.startsWith("accounting-category-")
      ? category.id.slice("accounting-category-".length)
      : "";
    // Old categories used only a numeric timestamp; newer generated IDs include
    // the customer ID, allowing accidental copies to another account to be hidden.
    if (generatedIdTail && !/^\d+$/.test(generatedIdTail) && !category.id.startsWith(ownerPrefix)) return false;
    return true;
  });
}

export function flattenAccountingSheets(sheets: AccountingSheet[]): AccountingSheetRow[] {
  return sheets.flatMap(sheet => Array.isArray(sheet.rows) ? sheet.rows : []);
}
