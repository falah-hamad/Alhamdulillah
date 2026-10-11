import { Type } from "@google/genai";
import type { ProcessedFinancialDataset, CustomerDebtSummary } from "./accountingEngine";

export const FINANCIAL_ASSISTANT_TOOLS: any[] = [{
        functionDeclarations: [
          {
            name: "get_portfolio_summary",
            description: "استرجع الإحصائيات المالية الحقيقية الإجمالية ومجاميع كل المجلدات من بيانات المستخدم.",
            parameters: { type: Type.OBJECT, properties: {} },
          },
          {
            name: "search_customers",
            description: "ابحث في العملاء حسب شروط مرنة مجتمعة. مبالغ الفلترة تطبق على الدين المتبقي. استخدمها لنطاقات المبالغ وأعلى أو أقل العملاء والمجلد والمتأخرين.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                minRemainingDebt: { type: Type.NUMBER, description: "أقل دين متبقٍ شامل الحد." },
                maxRemainingDebt: { type: Type.NUMBER, description: "أعلى دين متبقٍ شامل الحد." },
                folderName: { type: Type.STRING, description: "اسم المجلد أو جزء منه." },
                nameContains: { type: Type.STRING, description: "اسم عميل أو جزء منه." },
                overdueOnly: { type: Type.BOOLEAN, description: "إرجاع المتأخرين فقط." },
                includeSettled: { type: Type.BOOLEAN, description: "تضمين العملاء المسددين بالكامل." },
                sortBy: { type: Type.STRING, enum: ["remainingDebt", "totalPaid", "totalInvoiced", "name"] },
                sortDirection: { type: Type.STRING, enum: ["asc", "desc"] },
                limit: { type: Type.NUMBER, description: "عدد النتائج بين 1 و100." },
              },
            },
          },
          {
            name: "search_invoices",
            description: "ابحث في الفواتير حسب العميل أو فترة التاريخ أو إجمالي الفاتورة. التاريخ بصيغة YYYY-MM-DD.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                customerName: { type: Type.STRING, description: "اسم العميل أو جزء منه." },
                fromDate: { type: Type.STRING, description: "تاريخ بداية شامل YYYY-MM-DD." },
                toDate: { type: Type.STRING, description: "تاريخ نهاية شامل YYYY-MM-DD." },
                minAmount: { type: Type.NUMBER, description: "أقل إجمالي فاتورة شامل الحد." },
                maxAmount: { type: Type.NUMBER, description: "أعلى إجمالي فاتورة شامل الحد." },
                limit: { type: Type.NUMBER, description: "عدد النتائج بين 1 و100." },
              },
            },
          },
          {
            name: "search_unpaid_invoices",
            description: "ابحث عن الفواتير التي لها مبلغ متبقٍ أكبر من صفر، مع فلترة اختيارية حسب العميل وتاريخ الفاتورة والحد الأدنى للمتبقي. استبعد الفواتير المحذوفة.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                customerName: { type: Type.STRING, description: "اسم العميل أو جزء منه." },
                fromDate: { type: Type.STRING, description: "تاريخ بداية الفاتورة شامل YYYY-MM-DD." },
                toDate: { type: Type.STRING, description: "تاريخ نهاية الفاتورة شامل YYYY-MM-DD." },
                minRemaining: { type: Type.NUMBER, description: "أقل مبلغ متبقٍ شامل الحد." },
                limit: { type: Type.NUMBER, description: "عدد النتائج بين 1 و100." },
              },
            },
          },
          {
            name: "get_overdue_invoices",
            description: "ابحث عن الفواتير التي تجاوزت تاريخ الاستحقاق وما زال عليها مبلغ متبقٍ. يدعم تاريخ التقييم واسم العميل والحد الأدنى للمتبقي.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                asOfDate: { type: Type.STRING, description: "تاريخ التقييم بصيغة YYYY-MM-DD، وإذا لم يحدد يستخدم تاريخ اليوم." },
                customerName: { type: Type.STRING, description: "اسم العميل أو جزء منه." },
                minRemaining: { type: Type.NUMBER, description: "أقل مبلغ متبقٍ شامل الحد." },
                limit: { type: Type.NUMBER, description: "عدد النتائج بين 1 و100." },
              },
            },
          },
          {
            name: "get_invoice_status_summary",
            description: "احسب عدد ومجموع الفواتير حسب حالتها: مسددة بالكامل، مسددة جزئياً، أو غير مسددة، مع إجمالي المتبقي. يستبعد الفواتير المحذوفة.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                fromDate: { type: Type.STRING, description: "بداية تاريخ الفاتورة شامل YYYY-MM-DD." },
                toDate: { type: Type.STRING, description: "نهاية تاريخ الفاتورة شامل YYYY-MM-DD." },
              },
            },
          },
          {
            name: "get_collection_priorities",
            description: "رتب العملاء حسب أولوية متابعة التحصيل، مع إبراز الدين المتبقي والمبلغ المتأخر وآخر دفعة ومجلد العميل. الأداة للقراءة فقط.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                folderName: { type: Type.STRING, description: "فلترة اختيارية باسم المجلد أو جزء منه." },
                minOverdueAmount: { type: Type.NUMBER, description: "أقل مبلغ متأخر شامل الحد." },
                limit: { type: Type.NUMBER, description: "عدد النتائج بين 1 و100." },
              },
            },
          },
          {
            name: "get_invoice_aging_summary",
            description: "لخص أعمار الديون المتبقية حسب تاريخ الاستحقاق: غير مستحقة، 1-30، 31-60، 61-90، وأكثر من 90 يوماً. يستبعد الفواتير المحذوفة.",
            parameters: { type: Type.OBJECT, properties: { asOfDate: { type: Type.STRING, description: "تاريخ التقييم YYYY-MM-DD، اختياري." }, folderName: { type: Type.STRING, description: "اسم المجلد اختيارياً." } } },
          },
          {
            name: "get_monthly_financial_trend",
            description: "اعرض ملخصاً شهرياً للفواتير والدفعات المسجلة في دفتر الدفعات خلال نطاق أشهر. لا تجمع paidOnInvoices مع paymentLedgerAmount لأنهما قد يمثلان نفس التحصيل.",
            parameters: { type: Type.OBJECT, properties: { fromMonth: { type: Type.STRING, description: "أول شهر شامل بصيغة YYYY-MM." }, toMonth: { type: Type.STRING, description: "آخر شهر شامل بصيغة YYYY-MM." } } },
          },
          {
            name: "get_customers_without_recent_payment",
            description: "ابحث عن العملاء الذين لم يسجل لهم دفع منذ عدد أيام محدد أو لم يسددوا قط، مع فلترة بالمجلد والحد الأدنى للدين المتبقي.",
            parameters: { type: Type.OBJECT, properties: { asOfDate: { type: Type.STRING, description: "تاريخ التقييم YYYY-MM-DD، اختياري." }, daysWithoutPayment: { type: Type.NUMBER, description: "عدد الأيام دون دفعة، الافتراضي 30." }, minRemainingDebt: { type: Type.NUMBER, description: "الحد الأدنى للدين المتبقي." }, folderName: { type: Type.STRING, description: "اسم المجلد اختيارياً." }, includeNeverPaid: { type: Type.BOOLEAN, description: "تضمين العملاء الذين ليس لهم أي دفعة مسجلة، الافتراضي نعم." }, limit: { type: Type.NUMBER, description: "عدد النتائج 1-100." } } },
          },
          {
            name: "get_customer_activity_timeline",
            description: "اجمع سجل نشاط عميل واحد زمنياً من فواتيره ودفعاته. إذا كان الاسم ملتبساً اطلب تحديد العميل.",
            parameters: { type: Type.OBJECT, properties: { customerName: { type: Type.STRING, description: "اسم العميل أو جزء منه." }, customerId: { type: Type.STRING, description: "معرف العميل إذا كان معروفاً." }, limit: { type: Type.NUMBER, description: "عدد الأحداث 1-100." } } },
          },
          {
            name: "get_payment_reconciliation",
            description: "قارن المبالغ المسددة المسجلة على الفواتير مع مجموع قيود دفتر الدفعات لكل عميل، وأظهر الفروقات المحتملة للمراجعة دون تغيير أي بيانات أو اعتبارها خطأ مؤكداً.",
            parameters: { type: Type.OBJECT, properties: { minDifference: { type: Type.NUMBER, description: "أقل فرق مطلق لعرضه، الافتراضي صفر." }, limit: { type: Type.NUMBER, description: "عدد العملاء 1-100." } } },
          },
          {
            name: "get_customer_ledger",
            description: "استرجع كشف حساب عميل محدد مع فواتيره ودفعاته. إذا تشابهت الأسماء، اطلب تحديد العميل.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                customerName: { type: Type.STRING, description: "اسم العميل أو جزء واضح منه." },
                customerId: { type: Type.STRING, description: "معرف العميل إن كان معروفاً." },
              },
            },
          },
          {
            name: "get_folder_summary",
            description: "استرجع ملخص مجلد واحد أو كل المجلدات وعدد العملاء والمدينين ومجموع المتبقي.",
            parameters: {
              type: Type.OBJECT,
              properties: { folderName: { type: Type.STRING, description: "اسم المجلد أو جزء منه، اتركه فارغاً لكل المجلدات." } },
            },
          },
          {
            name: "get_payment_summary",
            description: "احسب ملخص الدفعات خلال فترة زمنية، مع إجمالي المبالغ وعدد الدفعات وتوزيعها حسب طريقة الدفع، واستبعد الدفعات المحذوفة.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                fromDate: { type: Type.STRING, description: "تاريخ بداية شامل YYYY-MM-DD." },
                toDate: { type: Type.STRING, description: "تاريخ نهاية شامل YYYY-MM-DD." },
              },
            },
          },
          {
            name: "search_payments",
            description: "ابحث في الدفعات حسب العميل أو فترة التاريخ أو مبلغ الدفعة. التاريخ بصيغة YYYY-MM-DD.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                customerName: { type: Type.STRING },
                fromDate: { type: Type.STRING, description: "تاريخ بداية شامل YYYY-MM-DD." },
                toDate: { type: Type.STRING, description: "تاريخ نهاية شامل YYYY-MM-DD." },
                minAmount: { type: Type.NUMBER },
                maxAmount: { type: Type.NUMBER },
                limit: { type: Type.NUMBER },
              },
            },
          },
        ],
      }];

export type FinancialToolName =
  | "get_portfolio_summary"
  | "search_customers"
  | "search_invoices"
  | "search_unpaid_invoices"
  | "get_overdue_invoices"
  | "get_invoice_status_summary"
  | "get_collection_priorities"
  | "get_invoice_aging_summary"
  | "get_monthly_financial_trend"
  | "get_customers_without_recent_payment"
  | "get_customer_activity_timeline"
  | "get_payment_reconciliation"
  | "get_customer_ledger"
  | "get_folder_summary"
  | "search_payments"
  | "get_payment_summary";

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .toLowerCase()
    .trim();
}

function safeLimit(value: unknown, fallback = 20, max = 100): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

function customerRow(c: CustomerDebtSummary) {
  return {
    id: c.id,
    name: c.name,
    folder: c.folderName,
    totalInvoiced: c.totalInvoiced,
    totalPaid: c.totalPaid,
    remainingDebt: c.remainingDebt,
    invoiceCount: c.invoiceCount,
    paymentCount: c.paymentCount,
    overdue: c.isOverdue,
    overdueAmount: c.overdueAmount,
    lastPaymentDate: c.lastPaymentDate ?? null,
  };
}

export function executeFinancialAssistantTool(
  name: FinancialToolName | string,
  args: Record<string, unknown>,
  dataset: ProcessedFinancialDataset
): unknown {
  switch (name) {
    case "get_portfolio_summary":
      return {
        ...dataset.portfolio,
        folders: dataset.folders.map((f) => ({
          name: f.name,
          customerCount: f.customerCount,
          debtorCount: f.debtorCount,
          totalRemaining: f.totalRemaining,
          collectionRate: f.collectionRate,
        })),
      };

    case "search_customers": {
      const min = args.minRemainingDebt === undefined ? null : Number(args.minRemainingDebt);
      const max = args.maxRemainingDebt === undefined ? null : Number(args.maxRemainingDebt);
      if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) {
        return { error: "حدود مبلغ الدين غير صالحة." };
      }
      if (min !== null && max !== null && min > max) {
        return { error: "الحد الأدنى للمبلغ أكبر من الحد الأعلى." };
      }
      const folderQuery = normalize(args.folderName);
      const nameQuery = normalize(args.nameContains);
      const sortBy = String(args.sortBy ?? "remainingDebt");
      const direction = args.sortDirection === "asc" ? 1 : -1;
      const includeSettled = args.includeSettled === true;
      let rows = dataset.customers.filter((c) => {
        if (!includeSettled && c.remainingDebt <= 0) return false;
        if (min !== null && c.remainingDebt < min) return false;
        if (max !== null && c.remainingDebt > max) return false;
        if (args.overdueOnly === true && !c.isOverdue) return false;
        if (folderQuery && !normalize(c.folderName).includes(folderQuery)) return false;
        if (nameQuery && !normalize(c.name).includes(nameQuery)) return false;
        return true;
      });
      rows.sort((a, b) => {
        if (sortBy === "name") return direction * a.name.localeCompare(b.name, "ar");
        const av = sortBy === "totalPaid" ? a.totalPaid : sortBy === "totalInvoiced" ? a.totalInvoiced : a.remainingDebt;
        const bv = sortBy === "totalPaid" ? b.totalPaid : sortBy === "totalInvoiced" ? b.totalInvoiced : b.remainingDebt;
        return direction * (av - bv);
      });
      const totalMatches = rows.length;
      const limit = safeLimit(args.limit);
      return {
        totalMatches,
        returned: Math.min(limit, totalMatches),
        filters: {
          minRemainingDebt: min,
          maxRemainingDebt: max,
          folderName: args.folderName ?? null,
          nameContains: args.nameContains ?? null,
          overdueOnly: args.overdueOnly === true,
          sortBy,
          sortDirection: direction === 1 ? "asc" : "desc",
        },
        customers: rows.slice(0, limit).map(customerRow),
        currency: dataset.currency,
      };
    }

    case "search_invoices": {
      const customerQuery = normalize(args.customerName);
      const from = args.fromDate ? String(args.fromDate) : "";
      const to = args.toDate ? String(args.toDate) : "";
      const minAmount = args.minAmount === undefined ? null : Number(args.minAmount);
      const maxAmount = args.maxAmount === undefined ? null : Number(args.maxAmount);
      if ((minAmount !== null && !Number.isFinite(minAmount)) || (maxAmount !== null && !Number.isFinite(maxAmount))) {
        return { error: "حدود مبلغ الفاتورة غير صالحة." };
      }
      if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
        return { error: "الحد الأدنى لإجمالي الفاتورة أكبر من الحد الأعلى." };
      }
      let rows = dataset.rawInvoices
        .filter((inv: any) => inv?.isDeleted !== true)
        .map((inv: any) => {
          const customerId = String(inv.customerId ?? "");
          const customer = dataset.customerMap.get(customerId);
          const total = Number(inv.grandTotal) || 0;
          const paid = Number(inv.paidAmount) || 0;
          return {
            id: String(inv.id ?? inv.invoiceNumber ?? ""),
            customerId,
            customerName: customer?.name ?? String(inv.customerName ?? "عميل غير معروف"),
            date: String(inv.date ?? ""),
            dueDate: inv.dueDate ?? null,
            description: String(inv.description ?? inv.notes ?? ""),
            total,
            paid,
            remaining: Number(inv.remainingAmount ?? (total - paid)) || 0,
          };
        })
        .filter((inv) => {
          const dateKey = inv.date.slice(0, 10);
          if (customerQuery && !normalize(inv.customerName).includes(customerQuery)) return false;
          if (from && dateKey < from) return false;
          if (to && dateKey > to) return false;
          if (minAmount !== null && inv.total < minAmount) return false;
          if (maxAmount !== null && inv.total > maxAmount) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date));
      const totalMatches = rows.length;
      const totalAmount = rows.reduce((sum, inv) => sum + inv.total, 0);
      const totalRemaining = rows.reduce((sum, inv) => sum + inv.remaining, 0);
      const limit = safeLimit(args.limit, 30, 100);
      rows = rows.slice(0, limit);
      return { totalMatches, totalAmount, totalRemaining, returned: rows.length, invoices: rows, currency: dataset.currency };
    }

    case "search_unpaid_invoices": {
      const customerQuery = normalize(args.customerName);
      const from = args.fromDate ? String(args.fromDate) : "";
      const to = args.toDate ? String(args.toDate) : "";
      const minRemaining = args.minRemaining === undefined ? 0 : Number(args.minRemaining);
      const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!Number.isFinite(minRemaining) || minRemaining < 0) {
        return { error: "الحد الأدنى للمبلغ المتبقي غير صالح." };
      }
      if (!validDate(from) || !validDate(to)) {
        return { error: "صيغة التاريخ غير صالحة. استخدم YYYY-MM-DD." };
      }
      if (from && to && from > to) {
        return { error: "تاريخ البداية يجب ألا يكون بعد تاريخ النهاية." };
      }
      let rows = dataset.rawInvoices
        .filter((inv: any) => inv?.isDeleted !== true)
        .map((inv: any) => {
          const customerId = String(inv.customerId ?? "");
          const customer = dataset.customerMap.get(customerId);
          const total = Number(inv.grandTotal) || 0;
          const paid = Number(inv.paidAmount) || 0;
          return {
            id: String(inv.id ?? inv.invoiceNumber ?? ""),
            customerId,
            customerName: customer?.name ?? String(inv.customerName ?? "عميل غير معروف"),
            date: String(inv.date ?? ""),
            dueDate: inv.dueDate ?? null,
            description: String(inv.description ?? inv.notes ?? ""),
            total,
            paid,
            remaining: Number(inv.remainingAmount ?? (total - paid)) || 0,
          };
        })
        .filter((inv) => {
          const dateKey = inv.date.slice(0, 10);
          if (inv.remaining <= 0 || inv.remaining < minRemaining) return false;
          if (customerQuery && !normalize(inv.customerName).includes(customerQuery)) return false;
          if (from && (!dateKey || dateKey < from)) return false;
          if (to && (!dateKey || dateKey > to)) return false;
          return true;
        })
        .sort((a, b) => b.remaining - a.remaining);
      const totalMatches = rows.length;
      const totalRemaining = rows.reduce((sum, inv) => sum + inv.remaining, 0);
      const limit = safeLimit(args.limit, 30, 100);
      rows = rows.slice(0, limit);
      return {
        totalMatches,
        totalRemaining,
        returned: rows.length,
        invoices: rows,
        currency: dataset.currency,
      };
    }

    case "get_overdue_invoices": {
      const asOfDate = args.asOfDate ? String(args.asOfDate) : new Date().toISOString().slice(0, 10);
      const customerQuery = normalize(args.customerName);
      const minRemaining = args.minRemaining === undefined ? 0 : Number(args.minRemaining);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
        return { error: "صيغة تاريخ التقييم غير صالحة. استخدم YYYY-MM-DD." };
      }
      if (!Number.isFinite(minRemaining) || minRemaining < 0) {
        return { error: "الحد الأدنى للمبلغ المتبقي غير صالح." };
      }
      let rows = dataset.rawInvoices
        .filter((inv: any) => inv?.isDeleted !== true)
        .map((inv: any) => {
          const customerId = String(inv.customerId ?? "");
          const customer = dataset.customerMap.get(customerId);
          const total = Number(inv.grandTotal) || 0;
          const paid = Number(inv.paidAmount) || 0;
          return {
            id: String(inv.id ?? inv.invoiceNumber ?? ""),
            invoiceNumber: String(inv.invoiceNumber ?? inv.id ?? ""),
            customerId,
            customerName: customer?.name ?? String(inv.customerName ?? "عميل غير معروف"),
            date: String(inv.date ?? ""),
            dueDate: String(inv.dueDate ?? ""),
            total,
            paid,
            remaining: Number(inv.remainingAmount ?? (total - paid)) || 0,
          };
        })
        .filter((inv) => inv.dueDate && inv.dueDate.slice(0, 10) < asOfDate &&
          inv.remaining > 0 && inv.remaining >= minRemaining &&
          (!customerQuery || normalize(inv.customerName).includes(customerQuery)))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const totalMatches = rows.length;
      const totalRemaining = rows.reduce((sum, inv) => sum + inv.remaining, 0);
      const limit = safeLimit(args.limit, 30, 100);
      rows = rows.slice(0, limit);
      return { asOfDate, totalMatches, totalRemaining, returned: rows.length, invoices: rows, currency: dataset.currency };
    }

    case "get_invoice_status_summary": {
      const from = args.fromDate ? String(args.fromDate) : "";
      const to = args.toDate ? String(args.toDate) : "";
      const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!validDate(from) || !validDate(to)) return { error: "صيغة التاريخ غير صالحة. استخدم YYYY-MM-DD." };
      if (from && to && from > to) return { error: "تاريخ البداية يجب ألا يكون بعد تاريخ النهاية." };
      const invoices = dataset.rawInvoices
        .filter((inv: any) => inv?.isDeleted !== true)
        .filter((inv: any) => {
          const date = String(inv.date ?? "").slice(0, 10);
          if (from && (!date || date < from)) return false;
          if (to && (!date || date > to)) return false;
          return true;
        })
        .map((inv: any) => {
          const total = Number(inv.grandTotal) || 0;
          const paid = Number(inv.paidAmount) || 0;
          const remaining = Number(inv.remainingAmount ?? (total - paid)) || 0;
          const status = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
          return { total, paid, remaining: Math.max(0, remaining), status };
        });
      const statuses = {
        paid: { label: "مسددة بالكامل", count: 0, totalAmount: 0, totalRemaining: 0 },
        partial: { label: "مسددة جزئياً", count: 0, totalAmount: 0, totalRemaining: 0 },
        unpaid: { label: "غير مسددة", count: 0, totalAmount: 0, totalRemaining: 0 },
      };
      for (const inv of invoices) {
        const bucket = statuses[inv.status];
        bucket.count += 1;
        bucket.totalAmount += inv.total;
        bucket.totalRemaining += inv.remaining;
      }
      return {
        fromDate: from || null,
        toDate: to || null,
        invoiceCount: invoices.length,
        totalAmount: invoices.reduce((sum, inv) => sum + inv.total, 0),
        totalPaidRecordedOnInvoices: invoices.reduce((sum, inv) => sum + inv.paid, 0),
        totalRemaining: invoices.reduce((sum, inv) => sum + inv.remaining, 0),
        statuses,
        currency: dataset.currency,
      };
    }

    case "get_collection_priorities": {
      const folderQuery = normalize(args.folderName);
      const minOverdue = args.minOverdueAmount === undefined ? 0 : Number(args.minOverdueAmount);
      if (!Number.isFinite(minOverdue) || minOverdue < 0) {
        return { error: "الحد الأدنى للمبلغ المتأخر غير صالح." };
      }
      const rows = dataset.customers
        .filter((customer) => customer.remainingDebt > 0 && customer.isOverdue && customer.overdueAmount >= minOverdue)
        .filter((customer) => !folderQuery || normalize(customer.folderName).includes(folderQuery))
        .sort((a, b) => b.overdueAmount - a.overdueAmount || b.remainingDebt - a.remainingDebt)
        .slice(0, safeLimit(args.limit, 30, 100))
        .map((customer) => ({
          ...customerRow(customer),
          collectionPriority: customer.overdueAmount >= 100000 ? "عالية" : customer.overdueAmount >= 25000 ? "متوسطة" : "عادية",
          suggestedNextStep: "راجع كشف الحساب وتواصل مع العميل لتأكيد الرصيد وموعد السداد.",
        }));
      return {
        returned: rows.length,
        totalOverdueAmount: rows.reduce((sum, customer) => sum + customer.overdueAmount, 0),
        totalRemainingDebt: rows.reduce((sum, customer) => sum + customer.remainingDebt, 0),
        customers: rows,
        currency: dataset.currency,
        note: "الأولوية إرشادية حسب المبلغ المتأخر، وليست حكماً على العميل.",
      };
    }

    case "get_invoice_aging_summary": {
      const asOfDate = args.asOfDate ? String(args.asOfDate) : new Date().toISOString().slice(0, 10);
      const folderQuery = normalize(args.folderName);
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(asOfDate)) return { error: "صيغة تاريخ التقييم غير صالحة. استخدم YYYY-MM-DD." };
      const asOfMs = Date.parse(asOfDate + "T00:00:00Z");
      const buckets: Record<string, { label: string; count: number; totalRemaining: number }> = {
        notDue: { label: "غير مستحقة بعد", count: 0, totalRemaining: 0 },
        days1to30: { label: "متأخرة 1-30 يوماً", count: 0, totalRemaining: 0 },
        days31to60: { label: "متأخرة 31-60 يوماً", count: 0, totalRemaining: 0 },
        days61to90: { label: "متأخرة 61-90 يوماً", count: 0, totalRemaining: 0 },
        over90: { label: "متأخرة أكثر من 90 يوماً", count: 0, totalRemaining: 0 },
        missingDueDate: { label: "بلا تاريخ استحقاق", count: 0, totalRemaining: 0 },
      };
      for (const inv of dataset.rawInvoices.filter((row: any) => row?.isDeleted !== true)) {
        const remaining = Number(inv.remainingAmount ?? ((Number(inv.grandTotal) || 0) - (Number(inv.paidAmount) || 0))) || 0;
        if (remaining <= 0) continue;
        const customer = dataset.customerMap.get(String(inv.customerId ?? ""));
        if (folderQuery && !normalize(customer?.folderName).includes(folderQuery)) continue;
        const dueDate = String(inv.dueDate ?? "").slice(0, 10);
        let key = "missingDueDate";
        if (/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate)) {
          const ageDays = Math.floor((asOfMs - Date.parse(dueDate + "T00:00:00Z")) / 86400000);
          key = ageDays < 0 ? "notDue" : ageDays <= 30 ? "days1to30" : ageDays <= 60 ? "days31to60" : ageDays <= 90 ? "days61to90" : "over90";
        }
        buckets[key].count += 1;
        buckets[key].totalRemaining += remaining;
      }
      return { asOfDate, buckets, totalOutstanding: Object.values(buckets).reduce((sum, b) => sum + b.totalRemaining, 0), currency: dataset.currency, note: "الفواتير التي لا تملك تاريخ استحقاق تظهر منفصلة ولا تُحسب ضمن المتأخرة." };
    }

    case "get_monthly_financial_trend": {
      const from = args.fromMonth ? String(args.fromMonth) : "";
      const to = args.toMonth ? String(args.toMonth) : "";
      const validMonth = (value: string) => !value || /^\\d{4}-(0[1-9]|1[0-2])$/.test(value);
      if (!validMonth(from) || !validMonth(to)) return { error: "صيغة الشهر غير صالحة. استخدم YYYY-MM." };
      if (from && to && from > to) return { error: "شهر البداية يجب ألا يكون بعد شهر النهاية." };
      const monthly = new Map<string, any>();
      const getRow = (month: string) => {
        if (!monthly.has(month)) monthly.set(month, { month, invoiceCount: 0, invoiceTotal: 0, paidOnInvoices: 0, invoiceRemaining: 0, paymentCount: 0, paymentLedgerAmount: 0 });
        return monthly.get(month);
      };
      const inRange = (month: string) => !!month && (!from || month >= from) && (!to || month <= to);
      for (const inv of dataset.rawInvoices.filter((row: any) => row?.isDeleted !== true)) {
        const month = String(inv.date ?? "").slice(0, 7);
        if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month) || !inRange(month)) continue;
        const row = getRow(month);
        const total = Number(inv.grandTotal) || 0;
        const paid = Number(inv.paidAmount) || 0;
        row.invoiceCount += 1;
        row.invoiceTotal += total;
        row.paidOnInvoices += paid;
        row.invoiceRemaining += Math.max(0, Number(inv.remainingAmount ?? (total - paid)) || 0);
      }
      for (const payment of dataset.rawPayments.filter((row: any) => row?.isDeleted !== true)) {
        const month = String(payment.date ?? "").slice(0, 7);
        if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month) || !inRange(month)) continue;
        const row = getRow(month);
        row.paymentCount += 1;
        row.paymentLedgerAmount += Number(payment.amount) || 0;
      }
      const months = Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month));
      return { fromMonth: from || null, toMonth: to || null, months, currency: dataset.currency, note: "paidOnInvoices وpaymentLedgerAmount مصدران مختلفان وقد يصفان التحصيل نفسه؛ لا تجمعهما." };
    }

    case "get_customers_without_recent_payment": {
      const asOfDate = args.asOfDate ? String(args.asOfDate) : new Date().toISOString().slice(0, 10);
      const days = args.daysWithoutPayment === undefined ? 30 : Number(args.daysWithoutPayment);
      const minRemaining = args.minRemainingDebt === undefined ? 0 : Number(args.minRemainingDebt);
      const folderQuery = normalize(args.folderName);
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(asOfDate)) return { error: "صيغة تاريخ التقييم غير صالحة. استخدم YYYY-MM-DD." };
      if (!Number.isInteger(days) || days < 1 || days > 3650) return { error: "عدد الأيام يجب أن يكون بين 1 و3650." };
      if (!Number.isFinite(minRemaining) || minRemaining < 0) return { error: "الحد الأدنى للدين المتبقي غير صالح." };
      const cutoff = Date.parse(asOfDate + "T00:00:00Z") - days * 86400000;
      const rows = dataset.customers.filter((c) => {
        if (c.remainingDebt < minRemaining || c.remainingDebt <= 0) return false;
        if (folderQuery && !normalize(c.folderName).includes(folderQuery)) return false;
        const last = c.lastPaymentDate ? Date.parse(String(c.lastPaymentDate).slice(0, 10) + "T00:00:00Z") : NaN;
        if (!Number.isFinite(last)) return args.includeNeverPaid !== false;
        return last <= cutoff;
      }).sort((a, b) => {
        const ad = a.lastPaymentDate ? String(a.lastPaymentDate) : "";
        const bd = b.lastPaymentDate ? String(b.lastPaymentDate) : "";
        return ad.localeCompare(bd) || b.remainingDebt - a.remainingDebt;
      });
      const totalMatches = rows.length;
      const limit = safeLimit(args.limit, 30, 100);
      return { asOfDate, daysWithoutPayment: days, totalMatches, returned: Math.min(limit, totalMatches), customers: rows.slice(0, limit).map((c) => ({ ...customerRow(c), daysSinceLastPayment: c.lastPaymentDate ? Math.max(0, Math.floor((Date.parse(asOfDate + "T00:00:00Z") - Date.parse(String(c.lastPaymentDate).slice(0, 10) + "T00:00:00Z")) / 86400000)) : null, neverPaid: !c.lastPaymentDate }), currency: dataset.currency };
    }

    case "get_customer_activity_timeline": {
      const query = normalize(args.customerName ?? args.customerId);
      if (!query) return { error: "اسم العميل أو معرفه مطلوب." };
      const matches = dataset.customers.filter((c) => c.id === String(args.customerId ?? "") || normalize(c.name) === query || normalize(c.name).includes(query));
      if (!matches.length) return { found: false, message: "لم يتم العثور على عميل مطابق." };
      if (matches.length > 1 && !matches.some((c) => c.id === String(args.customerId ?? ""))) return { found: false, ambiguous: true, matches: matches.slice(0, 10).map((c) => ({ id: c.id, name: c.name, folder: c.folderName })) };
      const customer = matches.find((c) => c.id === String(args.customerId ?? "")) ?? matches[0];
      const events = [
        ...dataset.rawInvoices.filter((inv: any) => inv?.isDeleted !== true && String(inv.customerId ?? "") === customer.id).map((inv: any) => ({ type: "invoice", date: String(inv.date ?? ""), id: String(inv.invoiceNumber ?? inv.id ?? ""), amount: Number(inv.grandTotal) || 0, remaining: Number(inv.remainingAmount ?? ((Number(inv.grandTotal) || 0) - (Number(inv.paidAmount) || 0))) || 0, description: String(inv.description ?? inv.notes ?? "فاتورة") })),
        ...dataset.rawPayments.filter((p: any) => p?.isDeleted !== true && String(p.customerId ?? "") === customer.id).map((p: any) => ({ type: "payment", date: String(p.date ?? ""), id: String(p.receiptNumber ?? p.id ?? ""), amount: Number(p.amount) || 0, method: String(p.method ?? "غير محدد"), description: String(p.note ?? p.notes ?? "دفعة مسجلة") })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      const limit = safeLimit(args.limit, 30, 100);
      return { found: true, customer: customerRow(customer), totalEvents: events.length, events: events.slice(0, limit), currency: dataset.currency, note: "الدفعات والفواتير أحداث منفصلة؛ لا تجمع قيمها كمجموع مالي واحد." };
    }

    case "get_payment_reconciliation": {
      const minDifference = args.minDifference === undefined ? 0 : Number(args.minDifference);
      if (!Number.isFinite(minDifference) || minDifference < 0) return { error: "الحد الأدنى للفرق غير صالح." };
      const rows = dataset.customers.map((customer) => {
        const invoicePaid = dataset.rawInvoices.filter((inv: any) => inv?.isDeleted !== true && String(inv.customerId ?? "") === customer.id).reduce((sum: number, inv: any) => sum + (Number(inv.paidAmount) || 0), 0);
        const ledgerPaid = dataset.rawPayments.filter((p: any) => p?.isDeleted !== true && String(p.customerId ?? "") === customer.id).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
        const difference = invoicePaid - ledgerPaid;
        return { id: customer.id, name: customer.name, folder: customer.folderName, invoicePaid, paymentLedgerAmount: ledgerPaid, difference, absoluteDifference: Math.abs(difference), remainingDebt: customer.remainingDebt };
      }).filter((row) => row.absoluteDifference >= minDifference)
        .sort((a, b) => b.absoluteDifference - a.absoluteDifference);
      const totalMatches = rows.length;
      const limit = safeLimit(args.limit, 50, 100);
      return { totalMatches, returned: Math.min(limit, totalMatches), customers: rows.slice(0, limit), currency: dataset.currency, note: "الفرق مؤشر للمراجعة فقط؛ قد توجد دفعات قديمة أو تسويات أو اختلافات في طريقة التسجيل. لم يتم تعديل أي سجل." };
    }

    case "get_customer_ledger": {
      const query = normalize(args.customerName ?? args.customerId);
      if (!query) return { error: "اسم العميل أو معرفه مطلوب." };
      const matches = dataset.customers.filter((c) =>
        c.id === String(args.customerId ?? "") ||
        normalize(c.name) === query ||
        normalize(c.name).includes(query)
      );
      if (matches.length === 0) return { found: false, message: "لم يتم العثور على عميل مطابق." };
      if (matches.length > 1 && !matches.some((c) => c.id === String(args.customerId ?? ""))) {
        return { found: false, ambiguous: true, matches: matches.slice(0, 10).map((c) => ({ id: c.id, name: c.name, folder: c.folderName })) };
      }
      const customer = matches[0];
      const invoices = dataset.rawInvoices
        .filter((inv: any) => inv?.isDeleted !== true && String(inv.customerId ?? "") === customer.id)
        .map((inv: any) => ({
          id: String(inv.id ?? ""),
          date: inv.date ?? null,
          dueDate: inv.dueDate ?? null,
          description: inv.description ?? inv.notes ?? null,
          total: Number(inv.grandTotal) || 0,
          paid: Number(inv.paidAmount) || 0,
          remaining: Number(inv.remainingAmount ?? ((Number(inv.grandTotal) || 0) - (Number(inv.paidAmount) || 0))) || 0,
          isDeleted: inv.isDeleted === true,
        }));
      const payments = dataset.rawPayments
        .filter((p: any) => p?.isDeleted !== true && String(p.customerId ?? "") === customer.id)
        .map((p: any) => ({
          id: String(p.id ?? p.receiptNumber ?? ""),
          date: p.date ?? null,
          amount: Number(p.amount) || 0,
          method: p.method ?? "غير محدد",
          note: p.note ?? p.notes ?? null,
        }))
        .sort((a: any, b: any) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
        .slice(0, 50);
      return {
        found: true,
        customer: customerRow(customer),
        invoices,
        recentPayments: payments,
        currency: dataset.currency,
      };
    }

    case "get_folder_summary": {
      const query = normalize(args.folderName);
      let folders = dataset.folders;
      if (query) folders = folders.filter((f) => normalize(f.name).includes(query));
      return {
        matches: folders.length,
        folders: folders.map((f) => ({
          id: f.id,
          name: f.name,
          customerCount: f.customerCount,
          debtorCount: f.debtorCount,
          totalDebt: f.totalDebt,
          totalPaid: f.totalPaid,
          totalRemaining: f.totalRemaining,
          collectionRate: f.collectionRate,
          currency: dataset.currency,
        })),
      };
    }

    case "search_payments": {
      const customerQuery = normalize(args.customerName);
      const from = args.fromDate ? String(args.fromDate) : "";
      const to = args.toDate ? String(args.toDate) : "";
      const minAmount = args.minAmount === undefined ? null : Number(args.minAmount);
      const maxAmount = args.maxAmount === undefined ? null : Number(args.maxAmount);
      if ((minAmount !== null && !Number.isFinite(minAmount)) || (maxAmount !== null && !Number.isFinite(maxAmount))) {
        return { error: "حدود مبلغ الدفعة غير صالحة." };
      }
      let rows = dataset.rawPayments
        .filter((p: any) => p?.isDeleted !== true)
        .map((p: any) => {
          const id = String(p.customerId ?? "");
          const customer = dataset.customerMap.get(id);
          return {
            id: String(p.id ?? p.receiptNumber ?? ""),
            customerId: id,
            customerName: customer?.name ?? String(p.customerName ?? "عميل غير معروف"),
            date: String(p.date ?? ""),
            amount: Number(p.amount) || 0,
            method: String(p.method ?? "غير محدد"),
            note: String(p.note ?? p.notes ?? ""),
          };
        })
        .filter((p) => {
          const dateKey = p.date.slice(0, 10);
          if (customerQuery && !normalize(p.customerName).includes(customerQuery)) return false;
          if (from && dateKey < from) return false;
          if (to && dateKey > to) return false;
          if (minAmount !== null && p.amount < minAmount) return false;
          if (maxAmount !== null && p.amount > maxAmount) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date));
      const totalMatches = rows.length;
      const totalAmount = rows.reduce((sum, p) => sum + p.amount, 0);
      const limit = safeLimit(args.limit, 30, 100);
      rows = rows.slice(0, limit);
      return { totalMatches, totalAmount, returned: rows.length, payments: rows, currency: dataset.currency };
    }

    case "get_payment_summary": {
      const from = args.fromDate ? String(args.fromDate) : "";
      const to = args.toDate ? String(args.toDate) : "";
      const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!validDate(from) || !validDate(to)) {
        return { error: "صيغة التاريخ غير صالحة. استخدم YYYY-MM-DD." };
      }
      if (from && to && from > to) {
        return { error: "تاريخ البداية يجب ألا يكون بعد تاريخ النهاية." };
      }
      const rows = dataset.rawPayments
        .filter((p: any) => p?.isDeleted !== true)
        .map((p: any) => {
          const customerId = String(p.customerId ?? "");
          const customer = dataset.customerMap.get(customerId);
          return {
            id: String(p.id ?? p.receiptNumber ?? ""),
            customerName: customer?.name ?? String(p.customerName ?? "عميل غير معروف"),
            date: String(p.date ?? ""),
            amount: Number(p.amount) || 0,
            method: String(p.method ?? "غير محدد"),
          };
        })
        .filter((p) => {
          const dateKey = p.date.slice(0, 10);
          if (from && (!dateKey || dateKey < from)) return false;
          if (to && (!dateKey || dateKey > to)) return false;
          return true;
        });
      const methods = new Map<string, { method: string; count: number; totalAmount: number }>();
      for (const payment of rows) {
        const method = payment.method || "غير محدد";
        const entry = methods.get(method) ?? { method, count: 0, totalAmount: 0 };
        entry.count += 1;
        entry.totalAmount += payment.amount;
        methods.set(method, entry);
      }
      return {
        fromDate: from || null,
        toDate: to || null,
        totalPayments: rows.length,
        totalAmount: rows.reduce((sum, p) => sum + p.amount, 0),
        methods: Array.from(methods.values()).sort((a, b) => b.totalAmount - a.totalAmount),
        recentPayments: rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
        currency: dataset.currency,
      };
    }

    default:
      return { error: `الأداة غير معروفة: ${name}` };
  }
}
