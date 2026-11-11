/** Format numeric values with Western digits and a comma every three digits. */
export function formatThousands(
  value: number | bigint | string | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (value === null || value === undefined || value === "") return "";
  const normalized = typeof value === "string" ? Number(value.replace(/,/g, "")) : value;
  if (typeof normalized === "number" && !Number.isFinite(normalized)) return String(value);
  return new Intl.NumberFormat("en-US", { useGrouping: true, ...options }).format(normalized);
}

export function formatNumericInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).replace(/,/g, "");
  if (!raw || raw === "-" || raw === "." || raw === "-.") return raw;
  const match = raw.match(/^(-?)(\d*)(\.?)(\d*)$/);
  if (!match) return raw;
  const [, sign, integer, decimalPoint, fraction] = match;
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${decimalPoint}${fraction}`;
}

