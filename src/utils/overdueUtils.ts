import { Invoice, SystemSettings } from "../types";

/**
 * Calculates the effective due date of an invoice.
 * If invoice.dueDate is set, uses it.
 * Otherwise, calculates date + defaultDays (default 30 days).
 */
export function getInvoiceEffectiveDueDate(invoice: Invoice, defaultDays: number = 30): Date {
  if (invoice.dueDate) {
    const parsed = new Date(invoice.dueDate);
    if (!isNaN(parsed.getTime())) {
      // Normalize to end of that day
      parsed.setHours(23, 59, 59, 999);
      return parsed;
    }
  }

  // Fallback: invoice.date + defaultDays
  const base = new Date(invoice.date);
  if (isNaN(base.getTime())) {
    return new Date();
  }
  base.setDate(base.getDate() + defaultDays);
  base.setHours(23, 59, 59, 999);
  return base;
}

/**
 * Formats due date as YYYY-MM-DD
 */
export function getInvoiceDueDateString(invoice: Invoice, defaultDays: number = 30): string {
  if (invoice.dueDate) {
    return invoice.dueDate;
  }
  const effective = getInvoiceEffectiveDueDate(invoice, defaultDays);
  return effective.toISOString().split("T")[0];
}

/**
 * Checks if an invoice is overdue (has remaining amount > 0 AND due date is in the past)
 */
export function isInvoiceOverdue(invoice: Invoice, defaultDays: number = 30): boolean {
  if (!invoice.remainingAmount || invoice.remainingAmount <= 0) {
    return false;
  }
  const dueDate = getInvoiceEffectiveDueDate(invoice, defaultDays);
  const now = new Date();
  return now.getTime() > dueDate.getTime();
}

/**
 * Returns how many full days an invoice is overdue.
 * Returns 0 if not overdue.
 */
export function getInvoiceOverdueDays(invoice: Invoice, defaultDays: number = 30): number {
  if (!isInvoiceOverdue(invoice, defaultDays)) {
    return 0;
  }
  const dueDate = getInvoiceEffectiveDueDate(invoice, defaultDays);
  const now = new Date();
  const diffMs = now.getTime() - dueDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

export type OverdueSeverity = "critical" | "high" | "moderate" | "recent";

export interface OverdueSeverityInfo {
  level: OverdueSeverity;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  iconColor: string;
  accentBg: string;
}

/**
 * Returns severity styling based on overdue days.
 */
export function getOverdueSeverity(days: number): OverdueSeverityInfo {
  if (days >= 45) {
    return {
      level: "critical",
      label: `متأخرة جداً (+${days} يوم)`,
      badgeBg: "bg-rose-100",
      badgeText: "text-rose-800",
      badgeBorder: "border-rose-300",
      iconColor: "text-rose-600",
      accentBg: "bg-rose-50/70",
    };
  }
  if (days >= 30) {
    return {
      level: "high",
      label: `متأخرة لأكثر من شهر (${days} يوم)`,
      badgeBg: "bg-red-100",
      badgeText: "text-red-800",
      badgeBorder: "border-red-300",
      iconColor: "text-red-500",
      accentBg: "bg-red-50/60",
    };
  }
  if (days >= 15) {
    return {
      level: "moderate",
      label: `متأخرة لأكثر من أسبوعين (${days} يوم)`,
      badgeBg: "bg-amber-100",
      badgeText: "text-amber-800",
      badgeBorder: "border-amber-300",
      iconColor: "text-amber-500",
      accentBg: "bg-amber-50/60",
    };
  }
  return {
    level: "recent",
    label: `تجاوزت الاستحقاق حديثاً (${days} يوم)`,
    badgeBg: "bg-yellow-100",
    badgeText: "text-yellow-800",
    badgeBorder: "border-yellow-300",
    iconColor: "text-yellow-600",
    accentBg: "bg-yellow-50/50",
  };
}

/**
 * Generates an elegant and professional WhatsApp debt collection reminder message in Arabic
 */
export function generateOverdueWhatsAppMessage(
  invoice: Invoice,
  settings: SystemSettings,
  overdueDays: number
): string {
  const company = settings.companyName || "محلات العاشق للكهربائيات";
  const dueDateStr = invoice.dueDate || getInvoiceDueDateString(invoice);
  
  return `السلام عليكم ورحمة الله وبركاته،
الأخ الفاضل / ${invoice.customerName} المحترم 🌹

نود تذكيركم بلطف بخصوص الفاتورة رقم: ${invoice.invoiceNumber}
الصادرة بتاريخ: ${invoice.date}
تاريخ الاستحقاق المحدد: ${dueDateStr} (تجاوزت الاستحقاق منذ ${overdueDays} يوماً)

تفاصيل الحساب:
• إجمالي الفاتورة: ${invoice.grandTotal.toLocaleString()} ${settings.currency}
• المسدد منها: ${invoice.paidAmount.toLocaleString()} ${settings.currency}
• المبلغ المتبقي المستحق للسداد: ${invoice.remainingAmount.toLocaleString()} ${settings.currency}

نرجو التكرم بالتواصل معنا لترتيب سداد المبلغ المتبقي شاكرين لكم حسن تعاونكم الدائم معنا.

مع خالص التحية والتقدير،
${company}
هاتف: ${settings.companyPhone || ""}`;
}
