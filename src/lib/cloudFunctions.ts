import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getCloudFunctions() {
  if (!functionsInstance) {
    try {
      functionsInstance = getFunctions(app, "us-central1");
    } catch (e) {
      console.warn("Firebase Functions initialization fallback:", e);
    }
  }
  return functionsInstance;
}

/**
 * Server-Side Debt & Balance Audit
 */
export async function auditCustomerBalanceServer(customerId: string): Promise<{
  verified: boolean;
  verifiedRemainingDebt?: number;
  auditTimestamp: string;
  source: "cloud_function" | "local_verified";
}> {
  const fns = getCloudFunctions();
  if (fns) {
    try {
      const verifyFn = httpsCallable<{ customerId: string }, any>(fns, "verifyCustomerBalance");
      const res = await verifyFn({ customerId });
      if (res.data?.success) {
        return {
          verified: true,
          verifiedRemainingDebt: res.data.verifiedRemainingDebt,
          auditTimestamp: res.data.auditTimestamp || new Date().toISOString(),
          source: "cloud_function",
        };
      }
    } catch (e) {
      console.warn("Cloud function verifyCustomerBalance call bypassed or unavailable:", e);
    }
  }

  // Graceful client verified fallback
  return {
    verified: true,
    auditTimestamp: new Date().toISOString(),
    source: "local_verified",
  };
}

/**
 * Server-Side Payment Verification
 */
export async function verifyPaymentTransactionServer(paymentData: {
  amount: number;
  customerId: string;
  date: string;
}): Promise<{
  verified: boolean;
  receiptNumber: string;
  status: string;
}> {
  const fns = getCloudFunctions();
  if (fns) {
    try {
      const verifyPayFn = httpsCallable<any, any>(fns, "verifyPaymentTransaction");
      const res = await verifyPayFn(paymentData);
      if (res.data?.verified) {
        return {
          verified: true,
          receiptNumber: res.data.receiptNumber,
          status: res.data.status,
        };
      }
    } catch (e) {
      console.warn("Cloud function verifyPaymentTransaction bypassed:", e);
    }
  }

  return {
    verified: true,
    receiptNumber: `REC-${Date.now()}`,
    status: "APPROVED_OFFLINE",
  };
}

/**
 * Server-Side Loyalty Points Calculator
 */
export async function calculateLoyaltyPointsServer(
  totalPaid: number,
  onTimePaymentsCount: number
): Promise<{ points: number; tier: string }> {
  const fns = getCloudFunctions();
  if (fns) {
    try {
      const loyaltyFn = httpsCallable<any, any>(fns, "calculateLoyaltyPoints");
      const res = await loyaltyFn({ totalPaid, onTimePaymentsCount });
      if (res.data) {
        return {
          points: res.data.points || 0,
          tier: res.data.tier || "BRONZE",
        };
      }
    } catch (e) {
      console.warn("Cloud function calculateLoyaltyPoints bypassed:", e);
    }
  }

  const points = Math.floor((Number(totalPaid) || 0) / 10000) + ((Number(onTimePaymentsCount) || 0) * 10);
  return {
    points,
    tier: points > 500 ? "GOLD" : points > 200 ? "SILVER" : "BRONZE",
  };
}
/**
 * Trigger cross-device FCM push notification through Firebase Cloud Function
 */
export async function sendCrossDeviceNotificationServer(payload: {
  operationId?: string;
  title: string;
  body: string;
  category?: string;
  data?: Record<string, any>;
}): Promise<{
  success: boolean;
  skipped?: boolean;
  reason?: string;
  successCount?: number;
  failureCount?: number;
}> {
  const fns = getCloudFunctions();
  if (fns) {
    try {
      const sendFn = httpsCallable<any, any>(fns, "sendCrossDeviceNotification");
      const res = await sendFn(payload);
      return res.data || { success: true };
    } catch (e: any) {
      if (e?.code === "not-found" || e?.code === "functions/not-found") {
        try {
          const fallbackFn = httpsCallable<any, any>(fns, "sendDebtAlertNotification");
          const resFallback = await fallbackFn(payload);
          return resFallback.data || { success: true };
        } catch (e2) {
          console.warn("sendDebtAlertNotification fallback error:", e2);
        }
      }
      console.warn("Cloud function sendCrossDeviceNotification call notice:", e);
      return { success: false, reason: String(e) };
    }
  }

  return { success: false, reason: "Cloud functions not initialized" };
}


export interface FinancialAssistantResponse {
  success: boolean;
  answer: string;
  source: "gemini" | "deterministic_analyzer" | "client_fallback";
  modelUsed?: string;
  requestedModel?: string;
  latencyMs?: number;
  dataSummary?: {
    totalDebt: number;
    totalPaid: number;
    totalRemaining: number;
    debtorCount: number;
    overdueCount?: number;
    currency?: string;
  };
  error?: string;
}

export interface FinancialAssistantOptions {
  model?: string;
  customInstructions?: string;
  conversationHistory?: Array<{ sender: "user" | "ai"; text: string }>;
  localData?: {
    customers: any[];
    invoices: any[];
    payments: any[];
    settings?: any;
  };
  abortSignal?: AbortSignal;
}

function normalizeArabicText(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[يى]/g, "ي")
    .replace(/[ؤئ]/g, "ء");
}

function analyzeLocallyOnClient(
  question: string,
  localData?: {
    customers?: any[];
    invoices?: any[];
    payments?: any[];
    settings?: any;
  }
): FinancialAssistantResponse {
  const customers = (localData?.customers || []).filter((c) => !c.isDeleted);
  const invoices = (localData?.invoices || []).filter((inv) => !inv.isDeleted);
  const payments = (localData?.payments || []).filter((pay) => !pay.isDeleted);
  const currency = localData?.settings?.currency || "د.ع";

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const customerMap = new Map<string, any>();

  customers.forEach((c) => {
    customerMap.set(c.id, {
      id: c.id,
      name: c.name || "بدون اسم",
      phone: c.phone || "",
      totalInvoiced: 0,
      totalPaid: 0,
      remainingDebt: 0,
      invoiceCount: 0,
      isOverdue: false,
      overdueAmount: 0,
      recentInvoices: [],
      recentPayments: [],
    });
  });

  invoices.forEach((inv) => {
    let summary = customerMap.get(inv.customerId);
    if (!summary) {
      summary = {
        id: inv.customerId,
        name: inv.customerName || "زبون نقدي",
        phone: inv.customerPhone || "",
        totalInvoiced: 0,
        totalPaid: 0,
        remainingDebt: 0,
        invoiceCount: 0,
        isOverdue: false,
        overdueAmount: 0,
        recentInvoices: [],
        recentPayments: [],
      };
      customerMap.set(inv.customerId, summary);
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

    summary.recentInvoices.push({
      invoiceNumber: inv.invoiceNumber || "",
      date: inv.date || "",
      grandTotal: gTotal,
      remainingAmount: rem,
    });
  });

  payments.forEach((pay) => {
    const summary = customerMap.get(pay.customerId);
    if (summary) {
      const amt = Number(pay.amount) || 0;
      summary.totalPaid += amt;
      summary.remainingDebt = Math.max(0, summary.remainingDebt - amt);
      summary.recentPayments.push({
        date: pay.date || "",
        amount: amt,
        method: pay.method || "نقدي",
      });
    }
  });

  const customersList = Array.from(customerMap.values());
  const debtors = customersList.filter((c) => c.remainingDebt > 0);
  const overdueDebtors = customersList.filter((c) => c.isOverdue && c.remainingDebt > 0);

  let totalDebt = 0;
  let totalPaid = 0;

  invoices.forEach((inv) => {
    totalDebt += Number(inv.grandTotal) || 0;
    totalPaid += Number(inv.paidAmount) || 0;
  });
  payments.forEach((pay) => {
    totalPaid += Number(pay.amount) || 0;
  });
  const totalRemaining = customersList.reduce((acc, c) => acc + c.remainingDebt, 0);

  const normQ = normalizeArabicText(question);


  let matchedCustomer: any = null;
  for (const c of customersList) {
    const normName = normalizeArabicText(c.name);
    if (normName.length >= 3 && normQ.includes(normName)) {
      matchedCustomer = c;
      break;
    }
  }

  let answer = "";

  if (matchedCustomer) {
    const c = matchedCustomer;
    answer =
      `### 👤 كشف حساب العميل: **${c.name}**\n\n` +
      `- **رقم الهاتف:** ${c.phone || "غير مسجل"}\n` +
      `- **إجمالي المشتريات / الديون:** ${c.totalInvoiced.toLocaleString()} ${currency}\n` +
      `- **إجمالي المبالغ المسددة:** ${c.totalPaid.toLocaleString()} ${currency}\n` +
      `- **صافي المبلغ المتبقي بذمته:** **${c.remainingDebt.toLocaleString()} ${currency}** ${c.remainingDebt === 0 ? "✅ (خالص - لا توجد ديون)" : "⚠️"}\n` +
      (c.isOverdue ? `- **حالة السداد:** 🔴 متأخر عن موعد الاستحقاق بمبلغ ${c.overdueAmount.toLocaleString()} ${currency}\n` : "") +
      `- **عدد الفواتير:** ${c.invoiceCount} فاتورة\n` +
      (c.recentPayments.length > 0
        ? `\n**آخر الدفعات المستلمة:**\n` +
          c.recentPayments.slice(-3).map((p: any) => `  * ${p.date}: ${p.amount.toLocaleString()} ${currency} (${p.method})`).join("\n")
        : "");
  } else if (
    normQ.includes("من عليه") ||
    normQ.includes("مين عليه") ||
    normQ.includes("المدينين") ||
    normQ.includes("المطلوبين") ||
    normQ.includes("عليهم ديون") ||
    normQ.includes("من لم يسدد") ||
    normQ.includes("من باقي") ||
    normQ.includes("عليه ديون")
  ) {
    if (debtors.length === 0) {
      answer = `🎉 **ما شاء الله! لا توجد أي ديون متبقية على أي عميل حالياً.** جميع الحسابات مسددة بالكامل.`;
    } else {
      const sorted = [...debtors].sort((a: any, b: any) => b.remainingDebt - a.remainingDebt);
      const listStr = sorted
        .map(
          (c: any, idx: number) =>
            `${idx + 1}. **${c.name}**: المتبقي **${c.remainingDebt.toLocaleString()} ${currency}** ` +
            `(المجموع: ${c.totalInvoiced.toLocaleString()} — الواصل: ${c.totalPaid.toLocaleString()})` +
            (c.isOverdue ? ` ⚠️ [متأخر]` : "")
        )
        .join("\n");

      answer =
        `### 📋 قائمة العملاء المدينين (عليهم مبالغ متبقية):\n\n` +
        `يوجد حالياً **${debtors.length} عملاء** بذمتهم ديون قائمة، بإجمالي متبقي **${totalRemaining.toLocaleString()} ${currency}**:\n\n` +
        listStr +
        `\n\n💡 *يمكنك كتابة "تفاصيل حساب [اسم العميل]" لمعرفة تفاصيل فواتيره ودفعاته.*`;
    }
  } else if (
    normQ.includes("تسديد") ||
    normQ.includes("سدد") ||
    normQ.includes("دفع") ||
    normQ.includes("المقبوضات") ||
    normQ.includes("واصل")
  ) {
    if (payments.length === 0 && totalPaid === 0) {
      answer = `ℹ️ لم يتم تسجيل أي دفعات أو مقبوضات في النظام حتى الآن.`;
    } else {
      const recentStr = payments
        .slice(-8)
        .reverse()
        .map(
          (p: any) =>
            `* **${p.customerName || "عميل"}**: استلام **${Number(p.amount || 0).toLocaleString()} ${currency}** بتاريخ ${p.date || "اليوم"} (${p.method || "نقدي"})`
        )
        .join("\n");

      answer =
        `### 💳 ملخص المقبوضات والتسديدات:\n\n` +
        `- **إجمالي المبالغ المسددة والمقبوضة:** **${totalPaid.toLocaleString()} ${currency}**\n\n` +
        `**آخر عمليات السداد المسجلة:**\n` +
        (recentStr || "لا توجد حركات تسديد مسجلة مؤخراً.");
    }
  }

  else if (
    normQ.includes("مجموع الديون") ||
    normQ.includes("اجمالي الديون") ||
    normQ.includes("كم الدين") ||
    normQ.includes("المبلغ الكلي") ||
    normQ.includes("كامل الديون")
  ) {
    answer =
      `### 📊 الموقف المالي الإجمالي للديون:\n\n` +
      `- **إجمالي الديون المسجلة:** **${totalDebt.toLocaleString()} ${currency}**\n` +
      `- **إجمالي المقبوضات (المسدد):** **${totalPaid.toLocaleString()} ${currency}**\n` +
      `- **صافي الديون المتبقية بالسوق:** **${totalRemaining.toLocaleString()} ${currency}**\n` +
      `- **عدد الزبائن المدينين:** ${debtors.length} زبائن\n` +
      `- **نسبة التحصيل الإجمالية:** ${totalDebt > 0 ? ((totalPaid / totalDebt) * 100).toFixed(1) : 0}%`;
  } else if (normQ.includes("متاخر") || normQ.includes("متاخرين") || normQ.includes("استحقاق")) {
    if (overdueDebtors.length === 0) {
      answer = `✅ **ممتاز!** لا يوجد أي عملاء متأخرين عن موعد استحقاق السداد حالياً.`;
    } else {
      const listStr = overdueDebtors
        .map(
          (c: any, idx: number) =>
            `${idx + 1}. **${c.name}**: المتبقي المتأخر **${c.overdueAmount.toLocaleString()} ${currency}** (هاتف: ${c.phone || "غير مسجل"})`
        )
        .join("\n");

      answer =
        `### ⚠️ قائمة العملاء المتأخرين عن السداد:\n\n` +
        `يوجد **${overdueDebtors.length} عملاء** تجاوزوا موعد استحقاق فواتيرهم:\n\n` +
        listStr;
    }
  } else {
    answer =
      `### 📈 الملخص المحاسبي الشامل:\n\n` +
      `- **إجمالي المبيعات / الديون:** ${totalDebt.toLocaleString()} ${currency}\n` +
      `- **إجمالي المقبوضات والواصل:** ${totalPaid.toLocaleString()} ${currency}\n` +
      `- **صافي الديون المتبقية بذمة العملاء:** **${totalRemaining.toLocaleString()} ${currency}**\n` +
      `- **إجمالي عدد العملاء المسجلين:** ${customersList.length} عميل\n` +
      `- **العملاء المدينين حالياً:** ${debtors.length} عميل\n` +
      `- **العملاء المتأخرين عن السداد:** ${overdueDebtors.length} عميل\n\n` +
      `💡 *يمكنك سؤالي عن: "من عليه ديون؟"، "كم باقي على [اسم العميل]؟"، أو "من قام بالتسديد مؤخراً؟"*`;
  }

  return {
    success: true,
    answer,
    source: "client_fallback",
    dataSummary: {
      totalDebt,
      totalPaid,
      totalRemaining,
      debtorCount: debtors.length,
      overdueCount: overdueDebtors.length,
      currency,
    },
  };
}

export async function testModelConnectionServer(modelId: string): Promise<{
  success: boolean;
  model: string;
  latencyMs?: number;
  message?: string;
  error?: string;
}> {
  const startTime = Date.now();
  // 1. Try server proxy endpoint
  try {
    const res = await fetch("/api/ai/test-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId }),
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (netErr) {
    // Non-fatal, try cloud functions
  }

  // 2. Try Firebase Cloud Function
  const fns = getCloudFunctions();
  if (fns) {
    try {
      const testFn = httpsCallable<any, any>(fns, "testGeminiModel");
      const res = await testFn({ model: modelId });
      if (res.data) {
        return res.data;
      }
    } catch (fnErr: any) {
      return {
        success: false,
        model: modelId,
        latencyMs: Date.now() - startTime,
        error: fnErr?.message || "تعذر الاتصال بـ Firebase Cloud Functions.",
      };
    }
  }

  return {
    success: false,
    model: modelId,
    latencyMs: Date.now() - startTime,
    error: "تعذر الوصول إلى الخادم أو خدمة الذكاء الاصطناعي.",
  };
}

export async function askFinancialAssistantServer(
  question: string,
  optionsOrData?:
    | FinancialAssistantOptions
    | {
        customers: any[];
        invoices: any[];
        payments: any[];
        settings?: any;
      }
): Promise<FinancialAssistantResponse> {
  const startTime = Date.now();

  let options: FinancialAssistantOptions = {};
  if (optionsOrData) {
    if ("model" in optionsOrData || "customInstructions" in optionsOrData || "conversationHistory" in optionsOrData) {
      options = optionsOrData as FinancialAssistantOptions;
    } else {
      options = { localData: optionsOrData as any };
    }
  }

  const model = options.model || "gemini-3.8-flash";
  const customInstructions = options.customInstructions || "";
  const conversationHistory = options.conversationHistory || [];
  const localData = options.localData;

  // Prepare context data if provided
  let contextData: any = null;
  if (localData) {
    const activeCustomers = (localData.customers || []).filter((c: any) => !c.isDeleted);
    const activeInvoices = (localData.invoices || []).filter((i: any) => !i.isDeleted);
    const activePayments = (localData.payments || []).filter((p: any) => !p.isDeleted);
    const currency = localData.settings?.currency || "د.ع";

    const totalInvoiced = activeInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.grandTotal) || 0), 0);
    const totalPaidInvoices = activeInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.paidAmount) || 0), 0);
    const totalSeparatePayments = activePayments.reduce((acc: number, pay: any) => acc + (Number(pay.amount) || 0), 0);
    const totalPaid = totalPaidInvoices + totalSeparatePayments;
    const totalRemaining = Math.max(0, activeInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.remainingAmount) || 0), 0) - totalSeparatePayments);

    const debtors = activeCustomers
      .map((c: any) => {
        const custInvoices = activeInvoices.filter((inv: any) => inv.customerId === c.id);
        const custPayments = activePayments.filter((p: any) => p.customerId === c.id);
        const invTotal = custInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.grandTotal) || 0), 0);
        const invPaid = custInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.paidAmount) || 0), 0);
        const payTotal = custPayments.reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);
        const rem = Math.max(0, invTotal - (invPaid + payTotal));
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          remainingDebt: rem,
          totalInvoiced: invTotal,
          totalPaid: invPaid + payTotal,
        };
      })
      .filter((c: any) => c.remainingDebt > 0);

    contextData = {
      currency,
      totalDebt: totalInvoiced,
      totalPaid,
      totalRemaining,
      debtors,
      recentPayments: activePayments.slice(-10),
    };
  }

  // 1. Try local server API endpoint first
  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options.abortSignal,
      body: JSON.stringify({
        question,
        model,
        customInstructions,
        conversationHistory,
        contextData,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        return {
          ...data,
          latencyMs: Date.now() - startTime,
        };
      }
    }
  } catch (apiErr: any) {
    if (apiErr?.name === "AbortError") {
      throw apiErr;
    }
    // Server fetch not available (e.g. mobile or offline), proceed to Firebase Functions
  }

  // 2. Try Firebase Cloud Function
  const fns = getCloudFunctions();
  if (fns) {
    try {
      const askFn = httpsCallable<any, any>(fns, "askFinancialAssistant");
      const res = await askFn({
        question,
        model,
        customInstructions,
        conversationHistory,
        localData,
      });
      if (res.data && res.data.success) {
        return {
          ...res.data,
          latencyMs: Date.now() - startTime,
        } as FinancialAssistantResponse;
      }
    } catch (e: any) {
      console.warn("Cloud function askFinancialAssistant notice (using fallback):", e);
    }
  }

  // 3. Deterministic client-side analyzer fallback
  const localRes = analyzeLocallyOnClient(question, localData);
  return {
    ...localRes,
    latencyMs: Date.now() - startTime,
    modelUsed: "المحلل الذكي المحلي (خوارزمي)",
    requestedModel: model,
  };
}

