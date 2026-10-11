/**
 * Deterministic Financial Accounting Engine for Firebase Cloud Functions
 * Guarantees exact calculations from the authoritative user dataset.
 */

export interface CustomerDebtSummary {
  id: string;
  name: string;
  phone: string;
  address: string;
  folderId: string | null;
  folderName: string;
  sequence?: number;
  totalInvoiced: number;
  totalPaid: number;
  remainingDebt: number;
  invoiceCount: number;
  paymentCount: number;
  isOverdue: boolean;
  overdueAmount: number;
  lastPaymentDate?: string;
  lastInvoiceDate?: string;
}

export interface FolderDebtSummary {
  id: string;
  name: string;
  color?: string;
  customerCount: number;
  debtorCount: number;
  totalDebt: number;
  totalPaid: number;
  totalRemaining: number;
  collectionRate: number;
}

export interface PortfolioSummary {
  currency: string;
  totalDebt: number;
  totalPaid: number;
  totalRemaining: number;
  customerCount: number;
  debtorCount: number;
  fullyPaidCount: number;
  zeroPaymentDebtorCount: number;
  overdueCount: number;
  overdueAmount: number;
  folderCount: number;
  collectionRate: number;
}

export interface ProcessedFinancialDataset {
  currency: string;
  customers: CustomerDebtSummary[];
  debtors: CustomerDebtSummary[];
  folders: FolderDebtSummary[];
  portfolio: PortfolioSummary;
  customerMap: Map<string, CustomerDebtSummary>;
  folderMap: Map<string, FolderDebtSummary>;
  rawInvoices: any[];
  rawPayments: any[];
}

export interface ResolvedFinancialQuery {
  intent:
    | "top_debtors"
    | "lowest_debtors"
    | "range"
    | "greater_than"
    | "less_than"
    | "exact_amount"
    | "all_debtors_sorted"
    | "top_payers"
    | "zero_payers"
    | "folder_summary"
    | "all_folders"
    | "single_customer"
    | "payments_by_period"
    | "customers_without_period_payment"
    | "portfolio_stats"
    | "ambiguity"
    | "follow_up"
    | "overview";
  limit?: number;
  minValue?: number;
  maxValue?: number;
  customerName?: string;
  folderName?: string;
  sortDirection?: "desc" | "asc";
  resultAnswer: string;
  matchedCustomer?: CustomerDebtSummary;
  listedCustomerIds?: string[];
}

interface QueryContext {
  conversationHistory?: Array<{ sender: "user" | "ai"; text: string }>;
  now?: Date;
  allowFollowUp?: boolean;
}

interface PaymentLedgerEntry {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: string;
  dateKey: string;
  dateRaw: string;
  timestampMs: number;
}

interface DateRange {
  startKey: string;
  endKey: string;
  label: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export function normalizeArabic(text: string): string {
  if (!text) return "";
  return toAsciiDigits(text)
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[يى]/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[\s\-_]+/g, " ");
}

function baghdadDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function keyAsNumber(key: string): number {
  return Number(key.replace(/-/g, ""));
}

function parseDateValueToKey(value: any): string | null {
  if (!value && value !== 0) return null;

  if (typeof value === "string") {
    const raw = toAsciiDigits(value.trim());
    if (!raw) return null;

    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    }

    const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }

    const asDate = new Date(raw);
    if (!Number.isNaN(asDate.getTime())) {
      return baghdadDateKey(asDate);
    }

    return null;
  }

  if (typeof value === "number") {
    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? null : baghdadDateKey(asDate);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : baghdadDateKey(value);
  }

  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? baghdadDateKey(d) : null;
  }

  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : baghdadDateKey(d);
  }

  return null;
}

function buildDateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysKey(key: string, days: number): string {
  const date = buildDateFromKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function monthBounds(year: number, month1to12: number): { startKey: string; endKey: string } {
  const startKey = `${year}-${pad2(month1to12)}-01`;
  const endDate = new Date(Date.UTC(year, month1to12, 0));
  const endKey = `${endDate.getUTCFullYear()}-${pad2(endDate.getUTCMonth() + 1)}-${pad2(endDate.getUTCDate())}`;
  return { startKey, endKey };
}

const AR_NUM_WORDS: Record<string, number> = {
  صفر: 0,
  واحد: 1,
  واحده: 1,
  وحده: 1,
  اثنين: 2,
  اثنان: 2,
  ثنين: 2,
  ثلاثه: 3,
  ثلاث: 3,
  اربعه: 4,
  اربع: 4,
  خمسه: 5,
  خمس: 5,
  سته: 6,
  ست: 6,
  سبعه: 7,
  سبع: 7,
  ثمانيه: 8,
  ثمان: 8,
  تسعه: 9,
  تسع: 9,
  عشره: 10,
  عشر: 10,
  احدعش: 11,
  اثنعش: 12,
  عشرين: 20,
  ثلاثين: 30,
  اربعين: 40,
  خمسين: 50,
  ستين: 60,
  سبعين: 70,
  ثمانين: 80,
  تسعين: 90,
  ميه: 100,
  مائه: 100,
  مئه: 100,
  ميتين: 200,
  مئتين: 200,
};

function parseArabicWordsNumber(text: string): number | null {
  const normalized = normalizeArabic(text).replace(/\bو\b/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  let total = 0;
  let current = 0;
  let sawAny = false;

  const pushMultiplier = (multiplier: number) => {
    const block = current === 0 ? 1 : current;
    total += block * multiplier;
    current = 0;
  };

  for (const token of normalized.split(" ")) {
    if (!token) continue;
    const cleanToken = token.startsWith("و") && token.length > 1 ? token.slice(1) : token;
    if (!cleanToken) continue;

    if (/^\d+(?:\.\d+)?$/.test(cleanToken)) {
      current += Number(cleanToken);
      sawAny = true;
      continue;
    }

    if (cleanToken === "الف" || cleanToken === "الاف" || cleanToken === "الفا") {
      pushMultiplier(1000);
      sawAny = true;
      continue;
    }

    if (cleanToken === "مليون" || cleanToken === "ملايين") {
      pushMultiplier(1000000);
      sawAny = true;
      continue;
    }

    const value = AR_NUM_WORDS[cleanToken];
    if (value !== undefined) {
      current += value;
      sawAny = true;
    }
  }

  total += current;
  return sawAny ? total : null;
}

export function parseArabicNumber(text: string): number | null {
  if (!text) return null;
  const clean = toAsciiDigits(text.replace(/,/g, "").trim());

  const kMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(?:الف|ألف|k)$/i);
  if (kMatch) return parseFloat(kMatch[1]) * 1000;

  const mMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(?:مليون|m)$/i);
  if (mMatch) return parseFloat(mMatch[1]) * 1000000;

  const num = parseFloat(clean);
  if (!Number.isNaN(num)) return num;

  return parseArabicWordsNumber(clean);
}

function parseArabicCount(question: string, fallback: number): number {
  const normalized = normalizeArabic(question);
  const numeric = normalized.match(/(?:اعلى|اكثر|اكبر|اقل|ادنى|توب|اول)\s*(\d+)/);
  if (numeric) return Math.max(1, Math.min(100, Number(numeric[1]) || fallback));

  const wordMatch = normalized.match(
    /(?:اعلى|اكثر|اكبر|اقل|ادنى|توب|اول)\s*(واحده?|اثنين|اثنان|ثنين|ثلاثه|ثلاث|اربعه|اربع|خمسه|خمس|سته|ست|سبعه|سبع|ثمانيه|ثمان|تسعه|تسع|عشره|عشر)/
  );
  if (!wordMatch) return fallback;

  const parsed = parseArabicWordsNumber(wordMatch[1]);
  return parsed && parsed > 0 ? Math.min(100, parsed) : fallback;
}

function extractAmountExpressions(question: string): number[] {
  const normalized = normalizeArabic(question);
  const expressions = normalized.match(/\d[\d,.]*(?:\s*(?:الف|مليون|k|m))?|(?:واحد|واحده|اثنين|اثنان|ثنين|ثلاثه|ثلاث|اربعه|اربع|خمسه|خمس|سته|ست|سبعه|سبع|ثمانيه|ثمان|تسعه|تسع|عشره|عشر|عشرين|ثلاثين|اربعين|خمسين|ستين|سبعين|ثمانين|تسعين|ميه|مئه|مائه|ميتين|مئتين)(?:\s+(?:الف|مليون))?/g);
  if (!expressions) return [];

  const values: number[] = [];
  for (const expr of expressions) {
    const parsed = parseArabicNumber(expr);
    if (parsed !== null && parsed >= 0) values.push(parsed);
  }
  return values;
}

function parseDateRange(question: string, now: Date = new Date()): DateRange | null {
  const normalized = normalizeArabic(question);
  const todayKey = baghdadDateKey(now);
  const [yStr, mStr] = todayKey.split("-");
  const year = Number(yStr);
  const month = Number(mStr);

  if (normalized.includes("اليوم") || normalized.includes("هاليوم")) {
    return { startKey: todayKey, endKey: todayKey, label: "اليوم" };
  }

  if (normalized.includes("امس") || normalized.includes("البارحه") || normalized.includes("البارحة")) {
    const yesterday = addDaysKey(todayKey, -1);
    return { startKey: yesterday, endKey: yesterday, label: "أمس" };
  }

  const betweenDays = normalized.match(/بين\s*يوم\s*(\d{1,2})\s*(?:و|الى|إلى|-)\s*يوم\s*(\d{1,2})/);
  if (betweenDays) {
    const d1 = Math.min(31, Math.max(1, Number(betweenDays[1])));
    const d2 = Math.min(31, Math.max(1, Number(betweenDays[2])));
    const minD = Math.min(d1, d2);
    const maxD = Math.max(d1, d2);
    return {
      startKey: `${year}-${pad2(month)}-${pad2(minD)}`,
      endKey: `${year}-${pad2(month)}-${pad2(maxD)}`,
      label: `بين يوم ${minD} ويوم ${maxD} من الشهر الحالي`,
    };
  }

  const dayInCurrentMonth = normalized.match(/(?:^|\s)يوم\s*(\d{1,2})(?:\s|$)/);
  if (dayInCurrentMonth) {
    const d = Math.min(31, Math.max(1, Number(dayInCurrentMonth[1])));
    const key = `${year}-${pad2(month)}-${pad2(d)}`;
    return { startKey: key, endKey: key, label: `يوم ${d} من هذا الشهر` };
  }

  if (normalized.includes("هذا الشهر") || normalized.includes("هالشهر") || normalized.includes("الشهر الحالي")) {
    const { startKey, endKey } = monthBounds(year, month);
    return { startKey, endKey, label: "هذا الشهر" };
  }

  if (normalized.includes("الشهر الماضي") || normalized.includes("الشهر السابق")) {
    const prevMonthDate = addDaysKey(`${year}-${pad2(month)}-01`, -1);
    const [py, pm] = prevMonthDate.split("-").map((v) => Number(v));
    const { startKey, endKey } = monthBounds(py, pm);
    return { startKey, endKey, label: "الشهر الماضي" };
  }

  if (normalized.includes("هذا الاسبوع") || normalized.includes("هالاسبوع") || normalized.includes("خلال الاسبوع")) {
    return {
      startKey: addDaysKey(todayKey, -6),
      endKey: todayKey,
      label: "آخر 7 أيام (الأسبوع الحالي)",
    };
  }

  const lastDays = normalized.match(/(?:اخر|آخر)\s*(\d+)\s*يوم/);
  if (lastDays) {
    const days = Math.max(1, Number(lastDays[1]) || 1);
    return {
      startKey: addDaysKey(todayKey, -(days - 1)),
      endKey: todayKey,
      label: `آخر ${days} يوم`,
    };
  }

  const explicitBetweenDates = normalized.match(
    /بين\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}|\d{4}-\d{1,2}-\d{1,2})\s*(?:و|الى|إلى|-)\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/
  );
  if (explicitBetweenDates) {
    const k1 = parseDateValueToKey(explicitBetweenDates[1]);
    const k2 = parseDateValueToKey(explicitBetweenDates[2]);
    if (k1 && k2) {
      const [startKey, endKey] = keyAsNumber(k1) <= keyAsNumber(k2) ? [k1, k2] : [k2, k1];
      return { startKey, endKey, label: `من ${startKey} إلى ${endKey}` };
    }
  }

  const sinceDate = normalized.match(/(?:منذ|من تاريخ)\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/);
  if (sinceDate) {
    const startKey = parseDateValueToKey(sinceDate[1]);
    if (startKey) {
      return { startKey, endKey: todayKey, label: `منذ ${startKey}` };
    }
  }

  return null;
}

function parseDebtRangeFromQuestion(normalizedQuestion: string): { min: number; max: number } | null {
  // Parse numeric debt ranges independently of surrounding Arabic wording.
  // Examples: "ديونهم بين 5,000 الى 15,000 د.ع" and "من 5000 و 15000".
  const match = normalizedQuestion.match(
    /(?:^|\\s)(?:بين|من)\\s*([0-9][0-9,.]*(?:\\s*(?:الف|مليون|k|m))?)\\s*(?:و|الى|الي|-)\\s*([0-9][0-9,.]*(?:\\s*(?:الف|مليون|k|m))?)(?=\\s|$)/i
  );
  if (!match) return null;

  const left = parseArabicNumber(match[1]);
  const right = parseArabicNumber(match[2]);
  if (left === null || right === null || left < 0 || right < 0) return null;

  return {
    min: Math.min(left, right),
    max: Math.max(left, right),
  };
}

function inDateRange(key: string, range: DateRange): boolean {
  const n = keyAsNumber(key);
  return n >= keyAsNumber(range.startKey) && n <= keyAsNumber(range.endKey);
}

function customerByMention(question: string, customers: CustomerDebtSummary[]): CustomerDebtSummary[] {
  const normQ = normalizeArabic(question);
  const matches = customers.filter((c) => {
    const normName = normalizeArabic(c.name);
    return normName.length >= 2 && normQ.includes(normName);
  });

  const unique = new Map<string, CustomerDebtSummary>();
  for (const c of matches) unique.set(c.id, c);
  return Array.from(unique.values());
}

function formatAmbiguousCustomers(candidates: CustomerDebtSummary[]): string {
  const rows = candidates
    .map((c, idx) => `${idx + 1}. **${c.name}** | ${c.folderName} | ${c.phone || "بدون هاتف"}`)
    .join("\n");

  return (
    `الاسم غير واضح ويتطابق مع أكثر من عميل. حدّد المقصود بالرقم أو بالاسم الكامل:\n\n` +
    rows +
    `\n\nمثال: اكتب "تفاصيل 2" أو "تفاصيل ${candidates[0]?.name || "العميل"}".`
  );
}

function formatDebtorsTableInternal(
  debtors: CustomerDebtSummary[],
  currency: string,
  options?: { title?: string; totalAvailable?: number }
): string {
  if (debtors.length === 0) return "لا توجد نتائج مطابقة للشروط المحددة.";

  const titleHeader = options?.title ? `### ${options.title}\n\n` : "";
  const countNote =
    options?.totalAvailable !== undefined && options.totalAvailable > debtors.length
      ? `*تم عرض ${debtors.length} من أصل ${options.totalAvailable} نتائج:*\n\n`
      : `*العدد الإجمالي للنتائج: ${debtors.length}*\n\n`;

  const header =
    `| التسلسل | اسم العميل | المجلد | إجمالي الدين | المدفوع | المتبقي |\n` +
    `| :---: | :--- | :--- | :---: | :---: | :---: |\n`;

  const rows = debtors
    .map((c, idx) => {
      const overdue = c.isOverdue ? " ⚠️" : "";
      return `| ${idx + 1} | **${c.name}**${overdue} | ${c.folderName} | ${c.totalInvoiced.toLocaleString()} ${currency} | ${c.totalPaid.toLocaleString()} ${currency} | **${c.remainingDebt.toLocaleString()} ${currency}** |`;
    })
    .join("\n");

  const totalDebt = debtors.reduce((sum, c) => sum + c.totalInvoiced, 0);
  const totalPaid = debtors.reduce((sum, c) => sum + c.totalPaid, 0);
  const totalRem = debtors.reduce((sum, c) => sum + c.remainingDebt, 0);

  const footer = `\n| **المجموع** | **${debtors.length}** | — | **${totalDebt.toLocaleString()} ${currency}** | **${totalPaid.toLocaleString()} ${currency}** | **${totalRem.toLocaleString()} ${currency}** |`;

  return `${titleHeader}${countNote}${header}${rows}${footer}`;
}

export function formatDebtorsTable(
  debtors: CustomerDebtSummary[],
  currency: string,
  options?: { title?: string; totalAvailable?: number }
): string {
  return formatDebtorsTableInternal(debtors, currency, options);
}

export function formatFoldersTable(folders: FolderDebtSummary[], currency: string): string {
  if (folders.length === 0) return "لا توجد مجلدات مسجلة في النظام.";

  const header =
    `| التسلسل | اسم المجلد | عدد العملاء | عدد المدينين | إجمالي الدين | المدفوع | المتبقي | نسبة التحصيل |\n` +
    `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  const rows = folders
    .map(
      (f, idx) =>
        `| ${idx + 1} | **${f.name}** | ${f.customerCount} | ${f.debtorCount} | ${f.totalDebt.toLocaleString()} ${currency} | ${f.totalPaid.toLocaleString()} ${currency} | **${f.totalRemaining.toLocaleString()} ${currency}** | ${f.collectionRate}% |`
    )
    .join("\n");

  return header + rows;
}

export function formatSingleCustomerStatement(
  c: CustomerDebtSummary,
  currency: string,
  rawInvoices: any[] = [],
  rawPayments: any[] = []
): string {
  const invoices = rawInvoices.filter((i) => i.customerId === c.id);
  const payments = rawPayments.filter((p) => p.customerId === c.id);

  let text =
    `### 👤 كشف حساب العميل: **${c.name}**\n\n` +
    `- **المجلد:** ${c.folderName}\n` +
    `- **الهاتف:** ${c.phone || "غير مسجل"}\n` +
    `- **إجمالي الدين الأصلي:** **${c.totalInvoiced.toLocaleString()} ${currency}**\n` +
    `- **إجمالي المسدد:** **${c.totalPaid.toLocaleString()} ${currency}**\n` +
    `- **المتبقي:** **${c.remainingDebt.toLocaleString()} ${currency}**\n` +
    `- **عدد الفواتير:** ${c.invoiceCount}\n` +
    `- **عدد الدفعات:** ${c.paymentCount}\n`;

  if (c.lastPaymentDate) text += `- **آخر دفعة:** ${c.lastPaymentDate}\n`;
  if (c.lastInvoiceDate) text += `- **آخر فاتورة:** ${c.lastInvoiceDate}\n`;
  if (c.isOverdue) text += `- **المتأخر:** ${c.overdueAmount.toLocaleString()} ${currency}\n`;

  if (payments.length > 0) {
    const recent = [...payments].slice(-10).reverse();
    text += `\n#### آخر الدفعات\n\n`;
    text +=
      `| التاريخ | المبلغ | الطريقة |\n` +
      `| :---: | :---: | :---: |\n` +
      recent
        .map((p) => `| ${p.date || "—"} | ${(Number(p.amount) || 0).toLocaleString()} ${currency} | ${p.method || "نقدي"} |`)
        .join("\n");
  }

  if (invoices.length > 0) {
    const recentInv = [...invoices].slice(-10).reverse();
    text += `\n\n#### آخر الفواتير\n\n`;
    text +=
      `| رقم الفاتورة | التاريخ | الإجمالي | المدفوع | المتبقي |\n` +
      `| :--- | :---: | :---: | :---: | :---: |\n` +
      recentInv
        .map(
          (inv) =>
            `| ${inv.invoiceNumber || "—"} | ${inv.date || "—"} | ${(Number(inv.grandTotal) || 0).toLocaleString()} ${currency} | ${(Number(inv.paidAmount) || 0).toLocaleString()} ${currency} | ${(Number(inv.remainingAmount) || 0).toLocaleString()} ${currency} |`
        )
        .join("\n");
  }

  return text;
}

export function formatPortfolioOverview(data: ProcessedFinancialDataset): string {
  const { portfolio, folders, currency } = data;
  return (
    `### 📈 الملخص المحاسبي\n\n` +
    `- **إجمالي الدين الأصلي:** ${portfolio.totalDebt.toLocaleString()} ${currency}\n` +
    `- **إجمالي المسدد:** ${portfolio.totalPaid.toLocaleString()} ${currency}\n` +
    `- **إجمالي المتبقي:** ${portfolio.totalRemaining.toLocaleString()} ${currency}\n` +
    `- **عدد العملاء:** ${portfolio.customerCount}\n` +
    `- **عدد المدينين:** ${portfolio.debtorCount}\n` +
    `- **نسبة التحصيل:** ${portfolio.collectionRate}%\n\n` +
    `#### مقارنة المجلدات\n\n` +
    formatFoldersTable(folders, currency)
  );
}

export function processFullAccountingDataset(
  customersRaw: any[],
  foldersRaw: any[],
  invoicesRaw: any[],
  paymentsRaw: any[],
  currency: string = "د.ع"
): ProcessedFinancialDataset {
  const activeFolders = (foldersRaw || []).filter((f) => f?.isDeleted !== true);
  const activeCustomers = (customersRaw || []).filter((c) => c?.isDeleted !== true);
  const activeInvoices = (invoicesRaw || []).filter((inv) => inv?.isDeleted !== true);
  const activePayments = (paymentsRaw || []).filter((pay) => pay?.isDeleted !== true);

  const todayKey = baghdadDateKey(new Date());

  const folderNames = new Map<string, string>();
  activeFolders.forEach((f) => {
    folderNames.set(String(f.id), f.name || "مجلد بدون اسم");
  });

  const customerMap = new Map<string, CustomerDebtSummary>();

  activeCustomers.forEach((c) => {
    const folderId = c.folderId || null;
    customerMap.set(String(c.id), {
      id: String(c.id),
      name: (c.name || "بدون اسم").trim(),
      phone: c.phone || "",
      address: c.address || "",
      folderId,
      folderName: folderId ? folderNames.get(String(folderId)) || "مجلد غير معروف" : "عام / بدون مجلد",
      sequence: c.sequence,
      totalInvoiced: 0,
      totalPaid: 0,
      remainingDebt: 0,
      invoiceCount: 0,
      paymentCount: 0,
      isOverdue: false,
      overdueAmount: 0,
    });
  });

  // Source of truth for balances is invoice grandTotal/paidAmount/remainingAmount.
  activeInvoices.forEach((inv) => {
    const customerId = String(inv.customerId || "");
    let summary = customerMap.get(customerId);

    if (!summary) {
      summary = {
        id: customerId || `unknown-${Math.random().toString(36).slice(2)}`,
        name: (inv.customerName || "عميل غير مسجل").trim(),
        phone: inv.customerPhone || "",
        address: inv.customerAddress || "",
        folderId: null,
        folderName: "عام / بدون مجلد",
        totalInvoiced: 0,
        totalPaid: 0,
        remainingDebt: 0,
        invoiceCount: 0,
        paymentCount: 0,
        isOverdue: false,
        overdueAmount: 0,
      };
      customerMap.set(summary.id, summary);
    }

    const total = Number(inv.grandTotal) || 0;
    const paid = Number(inv.paidAmount) || 0;
    const rem = Number(inv.remainingAmount !== undefined ? inv.remainingAmount : total - paid) || 0;

    summary.totalInvoiced += total;
    summary.totalPaid += paid;
    summary.remainingDebt += rem;
    summary.invoiceCount += 1;

    if (inv.date) {
      const key = parseDateValueToKey(inv.date);
      if (key && (!summary.lastInvoiceDate || key > summary.lastInvoiceDate)) summary.lastInvoiceDate = key;
    }

    const dueKey = parseDateValueToKey(inv.dueDate);
    if (rem > 0 && dueKey && dueKey < todayKey) {
      summary.isOverdue = true;
      summary.overdueAmount += rem;
    }
  });

  activePayments.forEach((pay) => {
    const customerId = String(pay.customerId || "");
    const summary = customerMap.get(customerId);
    if (!summary) return;

    summary.paymentCount += 1;
    const paymentDateKey = parseDateValueToKey(pay.date);
    if (paymentDateKey && (!summary.lastPaymentDate || paymentDateKey > summary.lastPaymentDate)) {
      summary.lastPaymentDate = paymentDateKey;
    }
  });

  const customers = Array.from(customerMap.values());
  const debtors = customers.filter((c) => c.remainingDebt > 0);

  const folderMap = new Map<string, FolderDebtSummary>();
  activeFolders.forEach((f) => {
    folderMap.set(String(f.id), {
      id: String(f.id),
      name: f.name || "مجلد",
      color: f.color,
      customerCount: 0,
      debtorCount: 0,
      totalDebt: 0,
      totalPaid: 0,
      totalRemaining: 0,
      collectionRate: 0,
    });
  });

  const unassigned = "__unassigned__";
  folderMap.set(unassigned, {
    id: unassigned,
    name: "عام / بدون مجلد",
    customerCount: 0,
    debtorCount: 0,
    totalDebt: 0,
    totalPaid: 0,
    totalRemaining: 0,
    collectionRate: 0,
  });

  customers.forEach((c) => {
    const bucket = c.folderId && folderMap.has(c.folderId) ? c.folderId : unassigned;
    const agg = folderMap.get(bucket)!;
    agg.customerCount += 1;
    if (c.remainingDebt > 0) agg.debtorCount += 1;
    agg.totalDebt += c.totalInvoiced;
    agg.totalPaid += c.totalPaid;
    agg.totalRemaining += c.remainingDebt;
  });

  const folders = Array.from(folderMap.values())
    .filter((f) => !(f.id === unassigned && f.customerCount === 0))
    .map((f) => ({
      ...f,
      collectionRate: f.totalDebt > 0 ? parseFloat(((f.totalPaid / f.totalDebt) * 100).toFixed(1)) : 100,
    }))
    .sort((a, b) => b.totalRemaining - a.totalRemaining);

  const totalDebt = customers.reduce((sum, c) => sum + c.totalInvoiced, 0);
  const totalPaid = customers.reduce((sum, c) => sum + c.totalPaid, 0);
  const totalRemaining = customers.reduce((sum, c) => sum + c.remainingDebt, 0);
  const overdue = customers.filter((c) => c.isOverdue && c.remainingDebt > 0);

  const portfolio: PortfolioSummary = {
    currency,
    totalDebt,
    totalPaid,
    totalRemaining,
    customerCount: customers.length,
    debtorCount: debtors.length,
    fullyPaidCount: customers.filter((c) => c.totalInvoiced > 0 && c.remainingDebt === 0).length,
    zeroPaymentDebtorCount: customers.filter((c) => c.remainingDebt > 0 && c.totalPaid === 0).length,
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, c) => sum + c.overdueAmount, 0),
    folderCount: activeFolders.length,
    collectionRate: totalDebt > 0 ? parseFloat(((totalPaid / totalDebt) * 100).toFixed(1)) : 0,
  };

  return {
    currency,
    customers,
    debtors,
    folders,
    portfolio,
    customerMap,
    folderMap,
    rawInvoices: activeInvoices,
    rawPayments: activePayments,
  };
}

function buildPaymentLedger(dataset: ProcessedFinancialDataset): PaymentLedgerEntry[] {
  const byCustomerName = new Map<string, string[]>();
  dataset.customers.forEach((c) => {
    const key = normalizeArabic(c.name);
    const arr = byCustomerName.get(key) || [];
    arr.push(c.id);
    byCustomerName.set(key, arr);
  });

  const entries: PaymentLedgerEntry[] = [];
  for (const payment of dataset.rawPayments) {
    if (payment?.isDeleted === true) continue;

    let customerId = payment.customerId ? String(payment.customerId) : "";
    if (!customerId && payment.customerName) {
      const options = byCustomerName.get(normalizeArabic(String(payment.customerName))) || [];
      if (options.length === 1) customerId = options[0];
    }
    if (!customerId) continue;

    const customer = dataset.customerMap.get(customerId);
    if (!customer) continue;

    const amount = Number(payment.amount) || 0;
    if (amount <= 0) continue;

    const dateKey = parseDateValueToKey(payment.date);
    if (!dateKey) continue;

    const timestampMs = new Date(`${dateKey}T00:00:00Z`).getTime();

    entries.push({
      id: String(payment.id || payment.receiptNumber || `${customerId}-${dateKey}-${amount}`),
      customerId,
      customerName: customer.name,
      amount,
      method: payment.method || "غير محدد",
      dateKey,
      dateRaw: String(payment.date || dateKey),
      timestampMs,
    });
  }

  return entries.sort((a, b) => (a.timestampMs === b.timestampMs ? 0 : b.timestampMs - a.timestampMs));
}

function summarizePaymentsByCustomer(entries: PaymentLedgerEntry[]): Map<string, { total: number; count: number; lastDateKey: string }> {
  const map = new Map<string, { total: number; count: number; lastDateKey: string }>();
  for (const e of entries) {
    const prev = map.get(e.customerId);
    if (!prev) {
      map.set(e.customerId, { total: e.amount, count: 1, lastDateKey: e.dateKey });
      continue;
    }
    prev.total += e.amount;
    prev.count += 1;
    if (e.dateKey > prev.lastDateKey) prev.lastDateKey = e.dateKey;
  }
  return map;
}

function resolveFollowUp(
  question: string,
  dataset: ProcessedFinancialDataset,
  context: QueryContext
): ResolvedFinancialQuery | null {
  if (context.allowFollowUp === false) return null;

  const normalized = normalizeArabic(question);
  const wantsIndexedDetails = /(تفاصيل|اعرض تفاصيل|كشف|الثاني|الثالث|الاول|الاولى|الاولى)/.test(normalized);
  const wantsAggregateSelected = normalized.includes("اجمع") && (normalized.includes("هؤلاء") || normalized.includes("هذوله") || normalized.includes("هولاء"));
  if (!wantsIndexedDetails && !wantsAggregateSelected) return null;

  const history = context.conversationHistory || [];
  const prevUser = [...history].reverse().find((item) => item.sender === "user" && item.text && normalizeArabic(item.text) !== normalized);
  if (!prevUser) return null;

  const previous = executeDeterministicFinancialQuery(prevUser.text, dataset, {
    ...context,
    allowFollowUp: false,
  });

  const list = previous.listedCustomerIds || [];
  if (list.length === 0) return null;

  if (wantsAggregateSelected) {
    const selected = list.map((id) => dataset.customerMap.get(id)).filter(Boolean) as CustomerDebtSummary[];
    const totalDebt = selected.reduce((sum, c) => sum + c.totalInvoiced, 0);
    const totalPaid = selected.reduce((sum, c) => sum + c.totalPaid, 0);
    const totalRemaining = selected.reduce((sum, c) => sum + c.remainingDebt, 0);
    return {
      intent: "follow_up",
      listedCustomerIds: list,
      resultAnswer:
        `تم جمع مبالغ النتائج السابقة (${selected.length} عميل):\n\n` +
        `- إجمالي الدين الأصلي: **${totalDebt.toLocaleString()} ${dataset.currency}**\n` +
        `- إجمالي المسدد: **${totalPaid.toLocaleString()} ${dataset.currency}**\n` +
        `- إجمالي المتبقي: **${totalRemaining.toLocaleString()} ${dataset.currency}**`,
    };
  }

  const ordinals: Array<{ regex: RegExp; index: number }> = [
    { regex: /(الاول|الاولى|first|1)/, index: 1 },
    { regex: /(الثاني|الثانيه|second|2)/, index: 2 },
    { regex: /(الثالث|الثالثه|3)/, index: 3 },
    { regex: /(الرابع|4)/, index: 4 },
    { regex: /(الخامس|5)/, index: 5 },
  ];

  const requested = ordinals.find((o) => o.regex.test(normalized))?.index || 1;
  const id = list[requested - 1];
  if (!id) {
    return {
      intent: "follow_up",
      listedCustomerIds: list,
      resultAnswer: `لا يوجد عنصر رقم ${requested} ضمن آخر نتيجة.`,
    };
  }

  const customer = dataset.customerMap.get(id);
  if (!customer) {
    return {
      intent: "follow_up",
      listedCustomerIds: list,
      resultAnswer: "تعذر تحديد العميل من النتيجة السابقة.",
    };
  }

  return {
    intent: "follow_up",
    matchedCustomer: customer,
    listedCustomerIds: list,
    resultAnswer: formatSingleCustomerStatement(customer, dataset.currency, dataset.rawInvoices, dataset.rawPayments),
  };
}

export function executeDeterministicFinancialQuery(
  question: string,
  dataset: ProcessedFinancialDataset,
  context: QueryContext = {}
): ResolvedFinancialQuery {
  const normQ = normalizeArabic(question);
  const now = context.now || new Date();
  const range = parseDateRange(question, now);
  const paymentLedger = buildPaymentLedger(dataset);
  const periodPayments = range ? paymentLedger.filter((p) => inDateRange(p.dateKey, range)) : paymentLedger;

  const followUp = resolveFollowUp(question, dataset, context);
  if (followUp) return followUp;

  const folderByMention = dataset.folders.find((f) => normalizeArabic(normQ).includes(normalizeArabic(f.name)));
  const askPerFolder = normQ.includes("كل مجلد") || normQ.includes("في كل مجلد") || normQ.includes("لكل مجلد");

  const customerMentions = customerByMention(question, dataset.customers);
  if (customerMentions.length > 1) {
    return {
      intent: "ambiguity",
      resultAnswer: formatAmbiguousCustomers(customerMentions.slice(0, 10)),
      listedCustomerIds: customerMentions.map((c) => c.id),
    };
  }

  if (customerMentions.length === 1) {
    const c = customerMentions[0];
    const customerPayments = paymentLedger.filter((p) => p.customerId === c.id);
    const inPeriod = range ? customerPayments.filter((p) => inDateRange(p.dateKey, range)) : customerPayments;

    const asksFolder = normQ.includes("مجلد") && (normQ.includes("بأي") || normQ.includes("وين"));
    if (asksFolder) {
      return {
        intent: "single_customer",
        matchedCustomer: c,
        resultAnswer: `العميل **${c.name}** موجود في مجلد: **${c.folderName}**.`,
      };
    }

    const asksPaidThisPeriod =
      (normQ.includes("سدد") || normQ.includes("دفع") || normQ.includes("دفعه") || normQ.includes("دفعات")) &&
      !!range;

    if (asksPaidThisPeriod) {
      if (inPeriod.length === 0) {
        return {
          intent: "single_customer",
          matchedCustomer: c,
          resultAnswer: `العميل **${c.name}** لم يسجّل أي دفعة خلال ${range.label}.`,
        };
      }

      const total = inPeriod.reduce((sum, p) => sum + p.amount, 0);
      const rows = inPeriod
        .slice()
        .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
        .map((p) => `| ${p.dateKey} | ${p.amount.toLocaleString()} ${dataset.currency} | ${p.method} |`)
        .join("\n");

      return {
        intent: "single_customer",
        matchedCustomer: c,
        resultAnswer:
          `العميل **${c.name}** سجّل ${inPeriod.length} دفعات خلال ${range.label} بمجموع **${total.toLocaleString()} ${dataset.currency}**.\n\n` +
          `| التاريخ | المبلغ | الطريقة |\n| :---: | :---: | :---: |\n${rows}`,
      };
    }

    const asksLastPayment = normQ.includes("اخر") && (normQ.includes("دفع") || normQ.includes("سدد") || normQ.includes("دفعه"));
    if (asksLastPayment) {
      const latest = customerPayments[0];
      if (!latest) {
        return {
          intent: "single_customer",
          matchedCustomer: c,
          resultAnswer: `لا توجد دفعات مسجلة للعميل **${c.name}**.`,
        };
      }
      return {
        intent: "single_customer",
        matchedCustomer: c,
        resultAnswer:
          `آخر دفعة للعميل **${c.name}** كانت بتاريخ **${latest.dateKey}** بمبلغ **${latest.amount.toLocaleString()} ${dataset.currency}** (${latest.method}).`,
      };
    }

    return {
      intent: "single_customer",
      matchedCustomer: c,
      resultAnswer: formatSingleCustomerStatement(c, dataset.currency, dataset.rawInvoices, dataset.rawPayments),
    };
  }

  const asksPayments = ["سدد", "دفع", "تسديد", "دفعه", "دفعات", "مقبوض", "انقبض", "قبض"].some((k) => normQ.includes(k));
  const asksNotPaid = ["ما سدد", "لم يسدد", "ما دفع", "لم يدفع", "لم يسجل اي دفع"].some((k) => normQ.includes(k));
  const asksDebt = ["دين", "ديون", "مدين", "المتبقي", "رصيد"].some((k) => normQ.includes(k));

  if (asksPayments && normQ.includes("اخر") && normQ.includes("دفع")) {
    const latest = paymentLedger[0];
    if (!latest) {
      return {
        intent: "payments_by_period",
        resultAnswer: "لا توجد دفعات مسجلة.",
      };
    }
    return {
      intent: "payments_by_period",
      listedCustomerIds: [latest.customerId],
      resultAnswer:
        `آخر دفعة مسجلة هي للعميل **${latest.customerName}** بتاريخ **${latest.dateKey}** بمبلغ **${latest.amount.toLocaleString()} ${dataset.currency}** (${latest.method}).`,
    };
  }

  if (asksPayments && (range || normQ.includes("اليوم") || normQ.includes("هذا الشهر") || normQ.includes("الشهر"))) {
    const filtered = periodPayments;

    if (asksNotPaid) {
      const paidIds = new Set(filtered.map((p) => p.customerId));
      let base = dataset.debtors.filter((c) => !paidIds.has(c.id));
      if (folderByMention) base = base.filter((c) => c.folderId === folderByMention.id);
      base.sort((a, b) => b.remainingDebt - a.remainingDebt);

      if (askPerFolder) {
        const perFolderSections = dataset.folders.map((folder) => {
          const folderResults = base.filter((customer) => customer.folderId === folder.id);
          return (
            `### ${folder.name}\n\n` +
            formatDebtorsTableInternal(folderResults, dataset.currency, {
              totalAvailable: folderResults.length,
            })
          );
        });
        return {
          intent: "folder_summary",
          listedCustomerIds: base.map((c) => c.id),
          resultAnswer: perFolderSections.join("\n\n"),
        };
      }

      return {
        intent: "customers_without_period_payment",
        listedCustomerIds: base.map((c) => c.id),
        resultAnswer: formatDebtorsTableInternal(base, dataset.currency, {
          title: `المدينون الذين لم يسددوا خلال ${range ? range.label : "الفترة المطلوبة"}`,
          totalAvailable: base.length,
        }),
      };
    }

    const byCustomer = summarizePaymentsByCustomer(filtered);
    const rows = Array.from(byCustomer.entries())
      .map(([customerId, stat]) => ({ customerId, stat, customer: dataset.customerMap.get(customerId) }))
      .filter((x) => x.customer)
      .filter((x) => !folderByMention || x.customer!.folderId === folderByMention.id)
      .sort((a, b) => b.stat.total - a.stat.total);

    const total = rows.reduce((sum, x) => sum + x.stat.total, 0);
    const uniqueCustomers = rows.length;

    const wantsCountOnly = normQ.includes("كم") && normQ.includes("عميل");
    if (wantsCountOnly) {
      return {
        intent: "payments_by_period",
        listedCustomerIds: rows.map((x) => x.customerId),
        resultAnswer: `عدد العملاء الذين سجّلوا دفعات خلال ${range ? range.label : "الفترة المطلوبة"}: **${uniqueCustomers}** عميل.`,
      };
    }

    const table =
      rows.length === 0
        ? "لا توجد دفعات في الفترة المطلوبة."
        : `| التسلسل | العميل | عدد الدفعات | مجموع الدفعات | آخر دفعة |\n| :---: | :--- | :---: | :---: | :---: |\n${rows
            .map(
              (r, idx) =>
                `| ${idx + 1} | **${r.customer!.name}** | ${r.stat.count} | **${r.stat.total.toLocaleString()} ${dataset.currency}** | ${r.stat.lastDateKey} |`
            )
            .join("\n")}`;

    return {
      intent: "payments_by_period",
      listedCustomerIds: rows.map((x) => x.customerId),
      resultAnswer:
        `### الدفعات خلال ${range ? range.label : "الفترة المطلوبة"}\n\n` +
        table +
        `\n\nإجمالي المقبوضات: **${total.toLocaleString()} ${dataset.currency}**\nعدد العملاء الفريدين: **${uniqueCustomers}**`,
    };
  }

  let candidates = asksDebt ? [...dataset.debtors] : [...dataset.customers];

  if (folderByMention) {
    candidates = candidates.filter((c) => c.folderId === folderByMention.id);
  }

  const amounts = extractAmountExpressions(question);
  const explicitRange = parseDebtRangeFromQuestion(normQ);
  const exactDebt = normQ.includes("بالضبط") || normQ.includes("يساوي") || normQ.includes("تمام");
  const gt = ["اكثر من", "اكبر من", "تزيد عن", "فوق"].some((k) => normQ.includes(k));
  const lt = ["اقل من", "اصغر من", "دون", "تحت"].some((k) => normQ.includes(k));

  let minDebt: number | null = null;
  let maxDebt: number | null = null;

  if (explicitRange) {
    minDebt = explicitRange.min;
    maxDebt = explicitRange.max;
  } else if (exactDebt && amounts.length >= 1) {
    minDebt = amounts[0];
    maxDebt = amounts[0];
  } else if (gt && amounts.length >= 1) {
    minDebt = amounts[0];
  } else if (lt && amounts.length >= 1) {
    maxDebt = amounts[0];
  }

  if (minDebt !== null) candidates = candidates.filter((c) => c.remainingDebt >= minDebt!);
  if (maxDebt !== null) candidates = candidates.filter((c) => c.remainingDebt <= maxDebt!);

  if (normQ.includes("رصيد") && normQ.includes("صفر")) {
    candidates = dataset.customers.filter((c) => c.remainingDebt === 0);
    if (folderByMention) candidates = candidates.filter((c) => c.folderId === folderByMention.id);
  }

  if (asksNotPaid && range) {
    const paidIds = new Set(periodPayments.map((p) => p.customerId));
    candidates = candidates.filter((c) => !paidIds.has(c.id) && c.remainingDebt > 0);
  }

  if (asksPayments && range && (normQ.includes("دفعوا اكثر") || normQ.includes("دفع اكثر") || normQ.includes("دفعوا فوق")) && amounts.length >= 1) {
    const summary = summarizePaymentsByCustomer(periodPayments);
    const threshold = amounts[0];
    candidates = candidates.filter((c) => (summary.get(c.id)?.total || 0) > threshold);
  }

  if (normQ.includes("وما زال") || normQ.includes("ومازال") || normQ.includes("متبقي")) {
    candidates = candidates.filter((c) => c.remainingDebt > 0);
  }

  const sortAsc = normQ.includes("تصاعد") || normQ.includes("من الاقل");
  const sortByPaid = asksPayments && !asksDebt;

  candidates.sort((a, b) => {
    if (sortByPaid) {
      const sum = summarizePaymentsByCustomer(periodPayments);
      const av = sum.get(a.id)?.total || 0;
      const bv = sum.get(b.id)?.total || 0;
      return sortAsc ? av - bv : bv - av;
    }
    return sortAsc ? a.remainingDebt - b.remainingDebt : b.remainingDebt - a.remainingDebt;
  });

  if (askPerFolder) {
    const limit = parseArabicCount(question, 5);
    const sections: string[] = [];
    for (const f of dataset.folders) {
      const inFolder = candidates.filter((c) => c.folderId === f.id);
      if (!inFolder.length) {
        sections.push(`### ${f.name}\n\nلا توجد نتائج مطابقة في هذا المجلد.`);
        continue;
      }
      sections.push(
        `### ${f.name}\n\n` +
          formatDebtorsTableInternal(inFolder.slice(0, limit), dataset.currency, {
            totalAvailable: inFolder.length,
          })
      );
    }
    return {
      intent: "folder_summary",
      listedCustomerIds: candidates.map((c) => c.id),
      resultAnswer: sections.join("\n\n"),
    };
  }

  if (normQ.includes("عدد العملاء في كل مجلد") || (normQ.includes("كم") && normQ.includes("كل مجلد"))) {
    const table =
      `| المجلد | عدد العملاء | عدد المدينين | إجمالي المتبقي |\n| :--- | :---: | :---: | :---: |\n` +
      dataset.folders
        .map((f) => `| **${f.name}** | ${f.customerCount} | ${f.debtorCount} | ${f.totalRemaining.toLocaleString()} ${dataset.currency} |`)
        .join("\n");
    return {
      intent: "all_folders",
      resultAnswer: table,
    };
  }

  if (normQ.includes("اجمالي الديون") || normQ.includes("مجموع الديون") || normQ.includes("متوسط الدين") || normQ.includes("احصائ")) {
    const avgDebt = dataset.portfolio.customerCount > 0 ? dataset.portfolio.totalRemaining / dataset.portfolio.customerCount : 0;
    const maxSinglePayment = paymentLedger.length > 0 ? Math.max(...paymentLedger.map((p) => p.amount)) : 0;
    return {
      intent: "portfolio_stats",
      resultAnswer:
        `### الإحصائيات المالية\n\n` +
        `- إجمالي الدين الأصلي: **${dataset.portfolio.totalDebt.toLocaleString()} ${dataset.currency}**\n` +
        `- إجمالي المسدد: **${dataset.portfolio.totalPaid.toLocaleString()} ${dataset.currency}**\n` +
        `- إجمالي المتبقي: **${dataset.portfolio.totalRemaining.toLocaleString()} ${dataset.currency}**\n` +
        `- عدد العملاء الفريدين: **${dataset.portfolio.customerCount}**\n` +
        `- عدد العملاء المدينين: **${dataset.portfolio.debtorCount}**\n` +
        `- متوسط الدين لكل عميل: **${avgDebt.toLocaleString()} ${dataset.currency}**\n` +
        `- أعلى دفعة مفردة: **${maxSinglePayment.toLocaleString()} ${dataset.currency}**`,
    };
  }

  const limit = parseArabicCount(question, normQ.includes("خمسه") || normQ.includes("خمس") ? 5 : 10);
  if (normQ.includes("اعلى") || normQ.includes("اكثر") || normQ.includes("اكبر") || normQ.includes("توب")) {
    const top = candidates.slice(0, limit);
    return {
      intent: "top_debtors",
      limit,
      listedCustomerIds: top.map((c) => c.id),
      resultAnswer: formatDebtorsTableInternal(top, dataset.currency, {
        title: `أعلى ${limit} نتائج`,
        totalAvailable: candidates.length,
      }),
    };
  }

  if (normQ.includes("اقل") || normQ.includes("ادنى") || normQ.includes("اصغر")) {
    const sorted = [...candidates].sort((a, b) => a.remainingDebt - b.remainingDebt).slice(0, limit);
    return {
      intent: "lowest_debtors",
      limit,
      listedCustomerIds: sorted.map((c) => c.id),
      resultAnswer: formatDebtorsTableInternal(sorted, dataset.currency, {
        title: `أقل ${limit} نتائج`,
        totalAvailable: candidates.length,
      }),
    };
  }

  if (minDebt !== null && maxDebt !== null) {
    return {
      intent: "range",
      minValue: minDebt,
      maxValue: maxDebt,
      listedCustomerIds: candidates.map((c) => c.id),
      resultAnswer: formatDebtorsTableInternal(candidates, dataset.currency, {
        title: `العملاء ضمن نطاق الدين ${minDebt.toLocaleString()} - ${maxDebt.toLocaleString()} ${dataset.currency} (شامل الحدين)`,
        totalAvailable: candidates.length,
      }),
    };
  }

  if (minDebt !== null && maxDebt === null) {
    return {
      intent: "greater_than",
      minValue: minDebt,
      listedCustomerIds: candidates.map((c) => c.id),
      resultAnswer: formatDebtorsTableInternal(candidates, dataset.currency, {
        title: `العملاء الذين دينهم المتبقي أكبر أو يساوي ${minDebt.toLocaleString()} ${dataset.currency}`,
        totalAvailable: candidates.length,
      }),
    };
  }

  if (maxDebt !== null && minDebt === null) {
    return {
      intent: "less_than",
      maxValue: maxDebt,
      listedCustomerIds: candidates.map((c) => c.id),
      resultAnswer: formatDebtorsTableInternal(candidates, dataset.currency, {
        title: `العملاء الذين دينهم المتبقي أقل أو يساوي ${maxDebt.toLocaleString()} ${dataset.currency}`,
        totalAvailable: candidates.length,
      }),
    };
  }

  if (normQ.includes("رتب") || normQ.includes("جميع") || normQ.includes("كل المدينين")) {
    return {
      intent: "all_debtors_sorted",
      sortDirection: sortAsc ? "asc" : "desc",
      listedCustomerIds: candidates.map((c) => c.id),
      resultAnswer: formatDebtorsTableInternal(candidates, dataset.currency, {
        title: `ترتيب النتائج ${sortAsc ? "تصاعدياً" : "تنازلياً"}`,
        totalAvailable: candidates.length,
      }),
    };
  }

  return {
    intent: "overview",
    listedCustomerIds: candidates.map((c) => c.id),
    resultAnswer: formatPortfolioOverview(dataset),
  };
}
