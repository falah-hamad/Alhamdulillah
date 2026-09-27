import { getArabicDayName } from "./separatorUtils";

/**
 * Formats a Date or timestamp string into the exact format requested:
 * "DD/MM/YYYY — HH:mm" (e.g. "15/09/2026 — 10:30")
 * Optionally includes the Arabic day name if includeDay is true.
 */
export function formatChangeLogDateTime(dateInput?: Date | string, includeDay: boolean = false): string {
  const d = dateInput ? (typeof dateInput === "string" ? new Date(dateInput) : dateInput) : new Date();
  
  if (isNaN(d.getTime())) {
    return "";
  }

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  const formattedDate = `${day}/${month}/${year}`;
  const formattedTime = `${hours}:${minutes}`;

  if (includeDay) {
    const isoDate = `${year}-${month}-${day}`;
    const dayName = getArabicDayName(isoDate);
    return `${dayName} ${formattedDate} — ${formattedTime}`;
  }

  return `${formattedDate} — ${formattedTime}`;
}

/**
 * Formats debt movement details:
 * e.g. "نايلون — 25,000 د.ع" or "25,000 د.ع"
 */
export function formatDebtChangeLogDetails(
  itemName?: string,
  amount?: number,
  currency: string = "د.ع"
): string {
  const cleanAmt = Number(amount) || 0;
  const amtStr = `${cleanAmt.toLocaleString()} ${currency}`;
  const cleanName = itemName?.trim();

  if (cleanName) {
    return `${cleanName} — ${amtStr}`;
  }
  return amtStr;
}

/**
 * Formats paid movement details:
 * e.g. "55,000 د.ع"
 */
export function formatPaymentChangeLogDetails(
  amount?: number,
  currency: string = "د.ع"
): string {
  const cleanAmt = Number(amount) || 0;
  return `${cleanAmt.toLocaleString()} ${currency}`;
}
