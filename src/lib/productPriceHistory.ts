import type { Product, ProductPriceHistoryEntry } from "../types";

/** Record price changes at the product save boundary, regardless of the editing screen. */
export function recordProductPriceChange(previous: Product | undefined, updated: Product, changedAt: string, entryId: string): Product {
  if (!previous) return updated;
  const previousPurchasePrice = Number(previous.purchasePrice) || 0;
  const previousSalePrice = Number(previous.salePrice) || 0;
  const purchasePrice = Number(updated.purchasePrice) || 0;
  const salePrice = Number(updated.salePrice) || 0;
  if (previousPurchasePrice === purchasePrice && previousSalePrice === salePrice) return updated;
  const history = Array.isArray(previous.priceHistory) ? previous.priceHistory : [];
  const incoming = Array.isArray(updated.priceHistory) ? updated.priceHistory : [];
  const merged = [...history, ...incoming.filter(entry => !history.some(existing => existing.id === entry.id))];
  const entry: ProductPriceHistoryEntry = {
    id: entryId, changedAt, previousPurchasePrice, previousSalePrice, purchasePrice, salePrice,
    supplierName: updated.supplierName,
    note: previousPurchasePrice !== purchasePrice && previousSalePrice !== salePrice ? "تعديل رأس المال وسعر البيع" : previousPurchasePrice !== purchasePrice ? "تعديل رأس المال" : "تعديل سعر البيع",
  };
  return { ...updated, priceHistory: [entry, ...merged] };
}
