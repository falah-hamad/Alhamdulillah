import { InvoiceItem } from "../types";

/**
 * Returns Arabic day name for a given ISO date (YYYY-MM-DD) or Date object
 */
export const getArabicDayName = (dateStr?: string): string => {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(d);
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ar-IQ", { weekday: "long" }).format(d);
  } catch {
    return "";
  }
};

/**
 * Returns current date formatted as YYYY-MM-DD
 */
export const getCurrentDateFormatted = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Returns current time formatted in Arabic (e.g. "11:30 صباحاً")
 */
export const getCurrentTimeFormatted = (): string => {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "مساءً" : "صباحاً";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};

/**
 * Calculates cumulative totals, subtotals, and remaining balances for items containing accounting separators (فواصل حسابية).
 * 
 * Rules:
 * - Each item with `isSeparator: true` acts as an accounting checkpoint.
 * - Subtotal = previous remaining balance + sum of items since last separator.
 * - Paid = `item.paidAmount`.
 * - Remaining = Math.max(0, Subtotal - Paid).
 * - The remaining balance becomes the starting balance for subsequent items.
 */
export function calculateCumulativeSeparators<T extends Partial<InvoiceItem>>(
  items: T[],
  startingBalance = 0
): T[] {
  let runningBalance = Number(startingBalance) || 0;
  let currentItemsSum = 0;

  return items.map((item) => {
    if (item.isSeparator) {
      const subtotal = runningBalance + currentItemsSum;
      const paid = Number(item.paidAmount || 0);
      const remaining = Math.max(0, subtotal - paid);
      
      // Update running balance for next section
      runningBalance = remaining;
      currentItemsSum = 0;

      return {
        ...item,
        subtotal,
        remainingAmount: remaining,
      };
    } else if (!item.isPaymentRow && !item.isRemainingRow && item.details && item.details.trim() !== "") {
      const quantity = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || 0;
      const total = Number(item.total) || (quantity * unitPrice);
      currentItemsSum += total;
      return item;
    }
    return item;
  });
}

/**
 * Calculates the total paid amount across an item list.
 * If separators exist, it sums their paidAmounts.
 * Otherwise returns the fallback paid amount.
 */
export function getTotalPaidFromItems(items: Partial<InvoiceItem>[], fallbackPaid = 0): number {
  const separators = items.filter((it) => it && it.isSeparator);
  if (separators.length > 0) {
    return separators.reduce((acc, sep) => acc + (Number(sep.paidAmount) || 0), 0);
  }
  return Number(fallbackPaid) || 0;
}

/**
 * Calculates the grand total of actual goods/services, excluding separators and special payment rows.
 */
export function getItemsGrandTotal(items: Partial<InvoiceItem>[]): number {
  return items
    .filter(
      (it) =>
        it &&
        it.details &&
        it.details.trim() !== "" &&
        !it.isSeparator &&
        !it.isPaymentRow &&
        !it.isRemainingRow
    )
    .reduce((acc, it) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unitPrice) || 0;
      return acc + (Number(it.total) || q * p);
    }, 0);
}

/**
 * Formats invoice items and separators into the clean text format requested by the user:
 * نايلون — 25,000
 * سفيفة — 5,000
 * مصباح — 15,000
 * خزان — 110,000
 * ━━━━━━━━━
 * المجموع — 155,000
 * الواصل — 55,000
 * ━━━━━━━━━
 * المتبقي — 100,000
 */
export function formatInvoiceAccountingText(
  invoice: {
    items?: Partial<InvoiceItem>[];
    grandTotal?: number;
    paidAmount?: number;
    remainingAmount?: number;
    customerName?: string;
    invoiceNumber?: string;
    date?: string;
  },
  options: { includeHeader?: boolean; currency?: string } = {}
): string {
  const items = invoice.items || [];
  const calculatedItems = calculateCumulativeSeparators(items);
  const lines: string[] = [];

  if (options.includeHeader && invoice.customerName) {
    lines.push(`📄 قائمة حساب: ${invoice.customerName}${invoice.invoiceNumber ? ` (${invoice.invoiceNumber})` : ""}`);
    if (invoice.date) lines.push(`التاريخ: ${invoice.date}`);
    lines.push("━━━━━━━━━━━━━━━━━━");
  }

  const hasSeparator = calculatedItems.some((it) => it && it.isSeparator);

  if (hasSeparator) {
    let currentSectionItems: Partial<InvoiceItem>[] = [];

    calculatedItems.forEach((it) => {
      if (it.isSeparator) {
        // Output all items in this section before the separator
        currentSectionItems.forEach((ci) => {
          const itemTotal =
            Number(ci.total) || (Number(ci.quantity || 1) * Number(ci.unitPrice || 0));
          lines.push(`${ci.details} — ${itemTotal.toLocaleString()}`);
        });
        currentSectionItems = [];

        // Output accounting separator block
        lines.push("━━━━━━━━━");
        lines.push(`المجموع — ${(it.subtotal || 0).toLocaleString()}`);
        lines.push(`الواصل — ${(Number(it.paidAmount) || 0).toLocaleString()}`);
        lines.push("━━━━━━━━━");
        lines.push(`المتبقي — ${(it.remainingAmount || 0).toLocaleString()}`);
      } else if (
        !it.isPaymentRow &&
        !it.isRemainingRow &&
        it.details &&
        it.details.trim() !== ""
      ) {
        currentSectionItems.push(it);
      }
    });

    // If there are trailing items after the last separator
    if (currentSectionItems.length > 0) {
      lines.push("━━━━━━━━━");
      currentSectionItems.forEach((ci) => {
        const itemTotal =
          Number(ci.total) || (Number(ci.quantity || 1) * Number(ci.unitPrice || 0));
        lines.push(`${ci.details} — ${itemTotal.toLocaleString()}`);
      });
      const trailingSum = currentSectionItems.reduce(
        (sum, ci) => sum + (Number(ci.total) || (Number(ci.quantity || 1) * Number(ci.unitPrice || 0))),
        0
      );
      lines.push("━━━━━━━━━");
      lines.push(`مجموع البنود الإضافية — ${trailingSum.toLocaleString()}`);
    }
  } else {
    // Standard list without explicit separator
    const validItems = items.filter(
      (it) =>
        it &&
        it.details &&
        it.details.trim() !== "" &&
        !it.isPaymentRow &&
        !it.isRemainingRow
    );

    validItems.forEach((ci) => {
      const itemTotal =
        Number(ci.total) || (Number(ci.quantity || 1) * Number(ci.unitPrice || 0));
      lines.push(`${ci.details} — ${itemTotal.toLocaleString()}`);
    });

    const total =
      invoice.grandTotal ||
      validItems.reduce(
        (s, i) =>
          s + (Number(i.total) || (Number(i.quantity || 1) * Number(i.unitPrice || 0))),
        0
      );
    const paid = Number(invoice.paidAmount) || 0;
    const remaining =
      typeof invoice.remainingAmount === "number"
        ? invoice.remainingAmount
        : Math.max(0, total - paid);

    lines.push("━━━━━━━━━");
    lines.push(`المجموع — ${total.toLocaleString()}`);
    lines.push(`الواصل — ${paid.toLocaleString()}`);
    lines.push("━━━━━━━━━");
    lines.push(`المتبقي — ${remaining.toLocaleString()}`);
  }

  return lines.join("\n");
}
