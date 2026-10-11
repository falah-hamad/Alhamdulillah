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
  | "get_customer_ledger"
  | "get_folder_summary"
  | "search_payments";

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

    default:
      return { error: `الأداة غير معروفة: ${name}` };
  }
}
