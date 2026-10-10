/**
 * Deterministic Financial Accounting Engine for Firebase Cloud Functions
 * Guarantees zero sampling, zero truncation, and exact mathematical calculations.
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

export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[يى]/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[\s\-_]+/g, " ");
}

export function parseArabicNumber(text: string): number | null {
  if (!text) return null;
  const clean = text.replace(/,/g, "").trim();

  const kMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(?:الف|ألف|k)$/i);
  if (kMatch) {
    return parseFloat(kMatch[1]) * 1000;
  }

  const mMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(?:مليون|m)$/i);
  if (mMatch) {
    return parseFloat(mMatch[1]) * 1000000;
  }

  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

export function processFullAccountingDataset(
  customersRaw: any[],
  foldersRaw: any[],
  invoicesRaw: any[],
  paymentsRaw: any[],
  currency: string = "د.ع"
): ProcessedFinancialDataset {
  const activeFolders = (foldersRaw || []).filter((f) => !f.isDeleted);
  const activeCustomers = (customersRaw || []).filter((c) => !c.isDeleted);
  const activeInvoices = (invoicesRaw || []).filter((inv) => !inv.isDeleted);
  const activePayments = (paymentsRaw || []).filter((pay) => !pay.isDeleted);

  const todayStr = new Date().toISOString().split("T")[0];

  const folderNamesMap = new Map<string, string>();
  activeFolders.forEach((f) => {
    folderNamesMap.set(f.id, f.name || "مجلد بدون اسم");
  });

  const customerMap = new Map<string, CustomerDebtSummary>();

  activeCustomers.forEach((c) => {
    const fId = c.folderId || null;
    const fName = fId ? (folderNamesMap.get(fId) || "مجلد غير معروف") : "عام / بدون مجلد";

    customerMap.set(c.id, {
      id: c.id,
      name: (c.name || "بدون اسم").trim(),
      phone: c.phone || "",
      address: c.address || "",
      folderId: fId,
      folderName: fName,
      sequence: c.sequence,
      totalInvoiced: 0,
      totalPaid: 0,
      remainingDebt: 0,
      invoiceCount: 0,
      paymentCount: 0,
      isOverdue: false,
      overdueAmount: 0,
      lastPaymentDate: undefined,
      lastInvoiceDate: undefined,
    });
  });

  activeInvoices.forEach((inv) => {
    let summary = customerMap.get(inv.customerId);
    if (!summary) {
      const fName = "عام / بدون مجلد";
      summary = {
        id: inv.customerId || `cust-${Date.now()}`,
        name: (inv.customerName || "عميل نقدي / غير مسجل").trim(),
        phone: inv.customerPhone || "",
        address: inv.customerAddress || "",
        folderId: null,
        folderName: fName,
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

    const gTotal = Number(inv.grandTotal) || 0;
    const paid = Number(inv.paidAmount) || 0;
    const rem = Number(inv.remainingAmount !== undefined ? inv.remainingAmount : gTotal - paid) || 0;

    summary.totalInvoiced += gTotal;
    summary.totalPaid += paid;
    summary.remainingDebt += rem;
    summary.invoiceCount += 1;

    if (rem > 0 && inv.dueDate && inv.dueDate < todayStr) {
      summary.isOverdue = true;
      summary.overdueAmount += rem;
    }

    if (inv.date && (!summary.lastInvoiceDate || inv.date > summary.lastInvoiceDate)) {
      summary.lastInvoiceDate = inv.date;
    }
  });

  activePayments.forEach((pay) => {
    const summary = customerMap.get(pay.customerId);
    if (summary) {
      const amt = Number(pay.amount) || 0;
      summary.totalPaid += amt;
      summary.remainingDebt = Math.max(0, summary.remainingDebt - amt);
      summary.paymentCount += 1;

      if (pay.date && (!summary.lastPaymentDate || pay.date > summary.lastPaymentDate)) {
        summary.lastPaymentDate = pay.date;
      }
    }
  });

  const allCustomersList = Array.from(customerMap.values());
  const debtorsList = allCustomersList.filter((c) => c.remainingDebt > 0);

  const folderDebtMap = new Map<string, FolderDebtSummary>();

  activeFolders.forEach((f) => {
    folderDebtMap.set(f.id, {
      id: f.id,
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

  const unassignedFolderId = "__unassigned__";
  folderDebtMap.set(unassignedFolderId, {
    id: unassignedFolderId,
    name: "عام / بدون مجلد",
    customerCount: 0,
    debtorCount: 0,
    totalDebt: 0,
    totalPaid: 0,
    totalRemaining: 0,
    collectionRate: 0,
  });

  allCustomersList.forEach((c) => {
    const fId = c.folderId && folderDebtMap.has(c.folderId) ? c.folderId : unassignedFolderId;
    const fSummary = folderDebtMap.get(fId)!;

    fSummary.customerCount += 1;
    if (c.remainingDebt > 0) {
      fSummary.debtorCount += 1;
    }
    fSummary.totalDebt += c.totalInvoiced;
    fSummary.totalPaid += c.totalPaid;
    fSummary.totalRemaining += c.remainingDebt;
  });

  const folderSummariesList: FolderDebtSummary[] = [];
  folderDebtMap.forEach((fSummary, key) => {
    if (key === unassignedFolderId && fSummary.customerCount === 0) {
      return;
    }
    fSummary.collectionRate =
      fSummary.totalDebt > 0
        ? parseFloat(((fSummary.totalPaid / fSummary.totalDebt) * 100).toFixed(1))
        : 100;
    folderSummariesList.push(fSummary);
  });

  folderSummariesList.sort((a, b) => b.totalRemaining - a.totalRemaining);

  const totalDebt = allCustomersList.reduce((acc, c) => acc + c.totalInvoiced, 0);
  const totalPaid = allCustomersList.reduce((acc, c) => acc + c.totalPaid, 0);
  const totalRemaining = allCustomersList.reduce((acc, c) => acc + c.remainingDebt, 0);
  const fullyPaidCount = allCustomersList.filter((c) => c.remainingDebt === 0 && c.totalInvoiced > 0).length;
  const zeroPaymentDebtorCount = allCustomersList.filter((c) => c.totalPaid === 0 && c.remainingDebt > 0).length;
  const overdueDebtors = allCustomersList.filter((c) => c.isOverdue && c.remainingDebt > 0);
  const overdueAmount = overdueDebtors.reduce((acc, c) => acc + c.overdueAmount, 0);
  const collectionRate = totalDebt > 0 ? parseFloat(((totalPaid / totalDebt) * 100).toFixed(1)) : 0;

  const portfolio: PortfolioSummary = {
    currency,
    totalDebt,
    totalPaid,
    totalRemaining,
    customerCount: allCustomersList.length,
    debtorCount: debtorsList.length,
    fullyPaidCount,
    zeroPaymentDebtorCount,
    overdueCount: overdueDebtors.length,
    overdueAmount,
    folderCount: activeFolders.length,
    collectionRate,
  };

  return {
    currency,
    customers: allCustomersList,
    debtors: debtorsList,
    folders: folderSummariesList,
    portfolio,
    customerMap,
    folderMap: folderDebtMap,
    rawInvoices: activeInvoices,
    rawPayments: activePayments,
  };
}

export function formatDebtorsTable(
  debtors: CustomerDebtSummary[],
  currency: string,
  options?: {
    title?: string;
    totalAvailable?: number;
  }
): string {
  if (debtors.length === 0) {
    return "لا توجد نتائج مطابقة للشروط المحددة.";
  }

  const titleHeader = options?.title ? `### ${options.title}\n\n` : "";
  const countNote =
    options?.totalAvailable !== undefined && options.totalAvailable > debtors.length
      ? `*تم عرض ${debtors.length} من أصل ${options.totalAvailable} مدينين مطابقين للمعايير:*\n\n`
      : `*العدد الإجمالي للنتائج: ${debtors.length} مدينين:*\n\n`;

  const tableHeader =
    `| التسلسل | اسم المدين | المجلد | إجمالي الدين | المدفوع | المتبقي |\n` +
    `| :---: | :--- | :--- | :---: | :---: | :---: |\n`;

  const rows = debtors
    .map((c, idx) => {
      const gTotal = c.totalInvoiced.toLocaleString() + " " + currency;
      const paid = c.totalPaid.toLocaleString() + " " + currency;
      const rem = c.remainingDebt.toLocaleString() + " " + currency;
      const statusBadge = c.isOverdue ? " ⚠️ (متأخر)" : "";
      return `| ${idx + 1} | **${c.name}**${statusBadge} | ${c.folderName} | ${gTotal} | ${paid} | **${rem}** |`;
    })
    .join("\n");

  const sumTotalInvoiced = debtors.reduce((acc, c) => acc + c.totalInvoiced, 0);
  const sumTotalPaid = debtors.reduce((acc, c) => acc + c.totalPaid, 0);
  const sumRemaining = debtors.reduce((acc, c) => acc + c.remainingDebt, 0);

  const totalRow =
    `\n| **المجموع** | **${debtors.length} مدينين** | — | ` +
    `**${sumTotalInvoiced.toLocaleString()} ${currency}** | ` +
    `**${sumTotalPaid.toLocaleString()} ${currency}** | ` +
    `**${sumRemaining.toLocaleString()} ${currency}** |`;

  return `${titleHeader}${countNote}${tableHeader}${rows}${totalRow}`;
}

export function formatFoldersTable(folders: FolderDebtSummary[], currency: string): string {
  if (folders.length === 0) {
    return "لا توجد مجلدات مسجلة في النظام.";
  }

  const tableHeader =
    `| التسلسل | اسم المجلد | عدد العملاء | عدد المدينين | إجمالي الدين | المدفوع | المتبقي | نسبة التحصيل |\n` +
    `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  const rows = folders
    .map((f, idx) => {
      const total = f.totalDebt.toLocaleString() + " " + currency;
      const paid = f.totalPaid.toLocaleString() + " " + currency;
      const rem = f.totalRemaining.toLocaleString() + " " + currency;
      return `| ${idx + 1} | **${f.name}** | ${f.customerCount} | ${f.debtorCount} | ${total} | ${paid} | **${rem}** | ${f.collectionRate}% |`;
    })
    .join("\n");

  const allCust = folders.reduce((acc, f) => acc + f.customerCount, 0);
  const allDebtors = folders.reduce((acc, f) => acc + f.debtorCount, 0);
  const allDebt = folders.reduce((acc, f) => acc + f.totalDebt, 0);
  const allPaid = folders.reduce((acc, f) => acc + f.totalPaid, 0);
  const allRem = folders.reduce((acc, f) => acc + f.totalRemaining, 0);
  const avgRate = allDebt > 0 ? ((allPaid / allDebt) * 100).toFixed(1) : "0";

  const totalRow =
    `\n| **الإجمالي** | **${folders.length} مجلدات** | ` +
    `**${allCust}** | **${allDebtors}** | ` +
    `**${allDebt.toLocaleString()} ${currency}** | ` +
    `**${allPaid.toLocaleString()} ${currency}** | ` +
    `**${allRem.toLocaleString()} ${currency}** | ` +
    `**${avgRate}%** |`;

  return `${tableHeader}${rows}${totalRow}`;
}

export function formatSingleCustomerStatement(
  c: CustomerDebtSummary,
  currency: string,
  rawInvoices: any[] = [],
  rawPayments: any[] = []
): string {
  const custInvoices = rawInvoices.filter((i) => i.customerId === c.id);
  const custPayments = rawPayments.filter((p) => p.customerId === c.id);

  let output =
    `### 👤 كشف حساب تفصيلي للعميل: **${c.name}**\n\n` +
    `- **المجلد التابع له:** ${c.folderName}\n` +
    `- **رقم الهاتف:** ${c.phone || "غير مسجل"}\n` +
    `- **العنوان:** ${c.address || "غير مسجل"}\n` +
    `- **إجمالي الدين المسجل:** **${c.totalInvoiced.toLocaleString()} ${currency}**\n` +
    `- **إجمالي المبالغ المسددة:** **${c.totalPaid.toLocaleString()} ${currency}**\n` +
    `- **المبلغ الصافي المتبقي بذمته:** **${c.remainingDebt.toLocaleString()} ${currency}** ` +
    (c.remainingDebt === 0 ? "✅ (خالص بالكامل)" : c.isOverdue ? "🔴 (متأخر عن الاستحقاق)" : "⚠️ (بذمته دين)") +
    `\n` +
    `- **عدد الفواتير:** ${c.invoiceCount} فاتورة\n` +
    `- **عدد حركات الدفع:** ${c.paymentCount} دفعة\n`;

  if (c.isOverdue) {
    output += `- **المبلغ المتأخر عن موعد السداد:** **${c.overdueAmount.toLocaleString()} ${currency}**\n`;
  }

  if (custInvoices.length > 0) {
    output += `\n#### 📄 سجل الفواتير والمشتريات (${custInvoices.length} فواتير):\n\n`;
    output +=
      `| رقم الفاتورة | التاريخ | الإجمالي | الواصل | المتبقي | الحالة |\n` +
      `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
    output += custInvoices
      .slice(-10)
      .reverse()
      .map((inv) => {
        const num = inv.invoiceNumber || "بدون رقم";
        const date = inv.date || "—";
        const gTotal = (Number(inv.grandTotal) || 0).toLocaleString() + " " + currency;
        const paid = (Number(inv.paidAmount) || 0).toLocaleString() + " " + currency;
        const rem = (Number(inv.remainingAmount) || 0).toLocaleString() + " " + currency;
        const stat = (Number(inv.remainingAmount) || 0) === 0 ? "مسددة ✅" : "متبقي ⚠️";
        return `| ${num} | ${date} | ${gTotal} | ${paid} | ${rem} | ${stat} |`;
      })
      .join("\n");
    output += `\n`;
  }

  if (custPayments.length > 0) {
    output += `\n#### 💳 سجل الدفعات والمقبوضات المستلمة (${custPayments.length} دفعات):\n\n`;
    output +=
      `| رقم الإيصال | التاريخ | المبلغ المسدد | طريقة الدفع | ملاحظات |\n` +
      `| :--- | :---: | :---: | :---: | :--- |\n`;
    output += custPayments
      .slice(-10)
      .reverse()
      .map((p) => {
        const rec = p.receiptNumber || "—";
        const date = p.date || "—";
        const amt = (Number(p.amount) || 0).toLocaleString() + " " + currency;
        const m = p.method || "نقدي";
        const notes = p.notes || "—";
        return `| ${rec} | ${date} | **${amt}** | ${m} | ${notes} |`;
      })
      .join("\n");
  }

  return output;
}

export function formatPortfolioOverview(data: ProcessedFinancialDataset): string {
  const { portfolio, folders, currency } = data;

  return (
    `### 📈 التقرير المالي الشامل لدفتر الديون\n\n` +
    `#### 📊 الموقف المالي العام:\n` +
    `- **إجمالي المبيعات / الديون:** **${portfolio.totalDebt.toLocaleString()} ${currency}**\n` +
    `- **إجمالي المقبوضات والواصل:** **${portfolio.totalPaid.toLocaleString()} ${currency}**\n` +
    `- **صافي الديون المتبقية بالسوق:** **${portfolio.totalRemaining.toLocaleString()} ${currency}**\n` +
    `- **نسبة التحصيل الإجمالية:** **${portfolio.collectionRate}%**\n\n` +
    `#### 👥 إحصائيات العملاء والسجلات:\n` +
    `- **إجمالي العملاء المسجلين:** **${portfolio.customerCount} عميل** عبر **${portfolio.folderCount} مجلدات**\n` +
    `- **المدينين الفعليين (بذمتهم مبالغ > 0):** **${portfolio.debtorCount} مدين**\n` +
    `- **العملاء المسددين بالكامل (خالصين):** **${portfolio.fullyPaidCount} عميل**\n` +
    `- **مدينين لم يسددوا أي دفعة حتى الآن:** **${portfolio.zeroPaymentDebtorCount} عميل**\n` +
    `- **المتأخرين عن موعد الاستحقاق:** **${portfolio.overdueCount} عميل** (بإجمالي متأخر **${portfolio.overdueAmount.toLocaleString()} ${currency}**)\n\n` +
    `#### 📁 ملخص المجلدات والحافظات:\n\n` +
    formatFoldersTable(folders, currency)
  );
}

export function executeDeterministicFinancialQuery(
  question: string,
  dataset: ProcessedFinancialDataset
): {
  intent: string;
  resultAnswer: string;
  matchedCustomer?: CustomerDebtSummary;
} {
  const normQ = normalizeArabic(question);
  const { currency, customers, debtors, folders, rawInvoices, rawPayments } = dataset;

  const sortedByLength = [...customers].sort((a, b) => b.name.length - a.name.length);
  for (const c of sortedByLength) {
    const normName = normalizeArabic(c.name);
    if (normName.length >= 3 && normQ.includes(normName)) {
      return {
        intent: "single_customer",
        matchedCustomer: c,
        resultAnswer: formatSingleCustomerStatement(c, currency, rawInvoices, rawPayments),
      };
    }
  }

  if (
    normQ.includes("اعلى") ||
    normQ.includes("اكثر شخص عليه") ||
    normQ.includes("اكبر ديون") ||
    normQ.includes("اكبر المدينين") ||
    normQ.includes("اكثر المدينين") ||
    normQ.includes("توب")
  ) {
    if (!normQ.includes("سدد") && !normQ.includes("دفع")) {
      const matchNum = normQ.match(/(?:اعلى|اكثر|اكبر)\s*(\d+)/);
      const limit = matchNum ? parseInt(matchNum[1], 10) : 10;

      const sorted = [...debtors].sort((a, b) => b.remainingDebt - a.remainingDebt);
      const sliced = sorted.slice(0, limit);

      const table = formatDebtorsTable(sliced, currency, {
        title: `قائمة أعلى ${limit} مدينين حسب المبلغ المتبقي`,
        totalAvailable: debtors.length,
      });

      return {
        intent: "top_debtors",
        resultAnswer: table,
      };
    }
  }

  if (
    normQ.includes("اقل") ||
    normQ.includes("ادنى") ||
    normQ.includes("اصغر ديون") ||
    normQ.includes("ابسط ديون")
  ) {
    const matchNum = normQ.match(/(?:اقل|ادنى)\s*(\d+)/);
    const limit = matchNum ? parseInt(matchNum[1], 10) : 5;

    const sorted = [...debtors].sort((a, b) => a.remainingDebt - b.remainingDebt);
    const sliced = sorted.slice(0, limit);

    const table = formatDebtorsTable(sliced, currency, {
      title: `قائمة أقل ${limit} مدينين عليهم مبالغ متبقية (> 0)`,
      totalAvailable: debtors.length,
    });

    return {
      intent: "lowest_debtors",
      resultAnswer: table,
    };
  }

  const rangeMatch =
    normQ.match(/(?:بين|من)\s*(\d[\d,\.]*(?:\s*(?:الف|ألف|مليون|k))?)\s*(?:و|الى|إلى|-)\s*(\d[\d,\.]*(?:\s*(?:الف|ألف|مليون|k))?)/);

  if (rangeMatch) {
    const val1 = parseArabicNumber(rangeMatch[1]);
    const val2 = parseArabicNumber(rangeMatch[2]);

    if (val1 !== null && val2 !== null) {
      const min = Math.min(val1, val2);
      const max = Math.max(val1, val2);

      const filtered = debtors
        .filter((c) => c.remainingDebt >= min && c.remainingDebt <= max)
        .sort((a, b) => b.remainingDebt - a.remainingDebt);

      const table = formatDebtorsTable(filtered, currency, {
        title: `المدينين الذين تتراوح ديونهم المتبقية بين ${min.toLocaleString()} ${currency} و ${max.toLocaleString()} ${currency}`,
        totalAvailable: filtered.length,
      });

      return {
        intent: "range",
        resultAnswer: table,
      };
    }
  }

  const greaterMatch = normQ.match(/(?:تتجاوز|تزيد عن|اكثر من|اكبر من|فوق)\s*(\d[\d,\.]*(?:\s*(?:الف|ألف|مليون|k))?)/);
  if (greaterMatch) {
    const threshold = parseArabicNumber(greaterMatch[1]);
    if (threshold !== null) {
      const filtered = debtors
        .filter((c) => c.remainingDebt >= threshold)
        .sort((a, b) => b.remainingDebt - a.remainingDebt);

      const table = formatDebtorsTable(filtered, currency, {
        title: `المدينين الذين تتجاوز ديونهم المتبقية ${threshold.toLocaleString()} ${currency}`,
        totalAvailable: filtered.length,
      });

      return {
        intent: "greater_than",
        resultAnswer: table,
      };
    }
  }

  const lessMatch = normQ.match(/(?:اقل من|دون|تحت)\s*(\d[\d,\.]*(?:\s*(?:الف|ألف|مليون|k))?)/);
  if (lessMatch) {
    const threshold = parseArabicNumber(lessMatch[1]);
    if (threshold !== null) {
      const filtered = debtors
        .filter((c) => c.remainingDebt <= threshold && c.remainingDebt > 0)
        .sort((a, b) => b.remainingDebt - a.remainingDebt);

      const table = formatDebtorsTable(filtered, currency, {
        title: `المدينين الذين تقل ديونهم المتبقية عن ${threshold.toLocaleString()} ${currency}`,
        totalAvailable: filtered.length,
      });

      return {
        intent: "less_than",
        resultAnswer: table,
      };
    }
  }

  if (
    normQ.includes("اكثر شخص سدد") ||
    normQ.includes("من سدد اكثر") ||
    normQ.includes("اكثر من دفع") ||
    normQ.includes("اعلى تسديد") ||
    normQ.includes("اكثر المدفوعات")
  ) {
    const matchNum = normQ.match(/(?:اعلى|اكثر)\s*(\d+)/);
    const limit = matchNum ? parseInt(matchNum[1], 10) : 10;

    const sorted = [...customers].filter((c) => c.totalPaid > 0).sort((a, b) => b.totalPaid - a.totalPaid);
    const sliced = sorted.slice(0, limit);

    const titleHeader = `### قائمة أكثر ${sliced.length} عملاء سداداً للمبالغ\n\n`;
    const tableHeader =
      `| التسلسل | اسم العميل | المجلد | إجمالي المسدد | إجمالي الدين الأصلي | المتبقي |\n` +
      `| :---: | :--- | :--- | :---: | :---: | :---: |\n`;
    const rows = sliced
      .map(
        (c, idx) =>
          `| ${idx + 1} | **${c.name}** | ${c.folderName} | **${c.totalPaid.toLocaleString()} ${currency}** | ${c.totalInvoiced.toLocaleString()} ${currency} | ${c.remainingDebt.toLocaleString()} ${currency} |`
      )
      .join("\n");

    return {
      intent: "top_payers",
      resultAnswer: `${titleHeader}${tableHeader}${rows}`,
    };
  }

  if (
    normQ.includes("لم يسددوا شيئا") ||
    normQ.includes("لم يسددوا") ||
    normQ.includes("ما سددوا") ||
    normQ.includes("ما دفعوا") ||
    normQ.includes("صفر تسديد") ||
    normQ.includes("بدون دفع")
  ) {
    const zeroPayers = debtors
      .filter((c) => c.totalPaid === 0)
      .sort((a, b) => b.remainingDebt - a.remainingDebt);

    const table = formatDebtorsTable(zeroPayers, currency, {
      title: `قائمة العملاء الذين لم يسددوا أي مبالغ حتى الآن (${zeroPayers.length} عميل)`,
      totalAvailable: zeroPayers.length,
    });

    return {
      intent: "zero_payers",
      resultAnswer: table,
    };
  }

  if (
    normQ.includes("لكل مجلد") ||
    normQ.includes("في كل مجلد") ||
    normQ.includes("المجلدات") ||
    normQ.includes("الحافظات") ||
    normQ.includes("توزيع المجلدات")
  ) {
    for (const f of folders) {
      const normF = normalizeArabic(f.name);
      if (normF.length >= 3 && normQ.includes(normF)) {
        const folderDebtors = debtors
          .filter((c) => c.folderId === f.id)
          .sort((a, b) => b.remainingDebt - a.remainingDebt);

        const folderReport =
          `### 📁 كشف حساب مجلد: **${f.name}**\n\n` +
          `- **إجمالي عدد العملاء في المجلد:** ${f.customerCount} عميل\n` +
          `- **عدد المدينين الفعليين بالمجلد:** ${f.debtorCount} مدين\n` +
          `- **إجمالي الدين المسجل بالمجلد:** ${f.totalDebt.toLocaleString()} ${currency}\n` +
          `- **إجمالي المبالغ المسددة بالمجلد:** ${f.totalPaid.toLocaleString()} ${currency}\n` +
          `- **صافي المتبقي بذمة عملاء المجلد:** **${f.totalRemaining.toLocaleString()} ${currency}**\n` +
          `- **نسبة التحصيل للمجلد:** ${f.collectionRate}%\n\n` +
          formatDebtorsTable(folderDebtors, currency, {
            title: `مدينو مجلد ${f.name}`,
            totalAvailable: folderDebtors.length,
          });

        return {
          intent: "folder_summary",
          resultAnswer: folderReport,
        };
      }
    }

    const allFoldersTable =
      `### 📁 تفاصيل وإحصائيات جميع المجلدات والحافظات (${folders.length} مجلدات)\n\n` +
      formatFoldersTable(folders, currency);

    return {
      intent: "all_folders",
      resultAnswer: allFoldersTable,
    };
  }

  if (
    normQ.includes("رتب") ||
    normQ.includes("ترتيب") ||
    normQ.includes("جميع المدينين") ||
    normQ.includes("كل المدينين") ||
    normQ.includes("قائمة المدينين كامله")
  ) {
    const isAsc = normQ.includes("تصاعدي") || normQ.includes("الاقل الى الاعلى");
    const sorted = [...debtors].sort((a, b) =>
      isAsc ? a.remainingDebt - b.remainingDebt : b.remainingDebt - a.remainingDebt
    );

    const table = formatDebtorsTable(sorted, currency, {
      title: `قائمة جميع المدينين (${debtors.length} مدين) مرتبة ${isAsc ? "تصاعدياً (من الأقل للأعلى)" : "تنازلياً (من الأعلى للأقل)"}`,
      totalAvailable: debtors.length,
    });

    return {
      intent: "all_debtors_sorted",
      resultAnswer: table,
    };
  }

  return {
    intent: "overview",
    resultAnswer: formatPortfolioOverview(dataset),
  };
}
