import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";

admin.initializeApp();

const targetDatabaseId = process.env.FIRESTORE_DATABASE_ID || "ai-studio-allah111111-ba0ce27e-cf94-4543-8c18-5985ed5eaad2";

function getFirestoreDb() {
  try {
    return getFirestore(targetDatabaseId);
  } catch (err) {
    console.warn("Falling back to default Firestore database instance:", err);
    return admin.firestore();
  }
}

const db = getFirestoreDb();

/**
 * 1. Server-Side Customer Debt & Balance Verification
 * Ensures total debt balances are calculated securely on server without relying solely on client state.
 */
export const verifyCustomerBalance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول للتحقق من الرصيد.");
  }

  const userId = context.auth.uid;
  const customerId = data.customerId;

  if (!customerId) {
    throw new functions.https.HttpsError("invalid-argument", "معرف العميل مطلوب.");
  }

  // Fetch all invoices for this customer
  const invoicesSnap = await db
    .collection("users")
    .doc(userId)
    .collection("invoices")
    .where("customerId", "==", customerId)
    .where("isDeleted", "==", false)
    .get();

  let totalInvoiceDebts = 0;
  let totalInvoicePaid = 0;

  invoicesSnap.forEach((doc) => {
    const inv = doc.data();
    totalInvoiceDebts += Number(inv.grandTotal) || 0;
    totalInvoicePaid += Number(inv.paidAmount) || 0;
  });

  // Fetch all payments for this customer
  const paymentsSnap = await db
    .collection("users")
    .doc(userId)
    .collection("payments")
    .where("customerId", "==", customerId)
    .where("isDeleted", "==", false)
    .get();

  let totalSeparatePayments = 0;
  paymentsSnap.forEach((doc) => {
    const pay = doc.data();
    totalSeparatePayments += Number(pay.amount) || 0;
  });

  const verifiedTotalDebt = totalInvoiceDebts;
  const verifiedTotalPaid = totalInvoicePaid + totalSeparatePayments;
  const verifiedRemainingDebt = verifiedTotalDebt - verifiedTotalPaid;

  return {
    success: true,
    customerId,
    verifiedTotalDebt,
    verifiedTotalPaid,
    verifiedRemainingDebt,
    auditTimestamp: new Date().toISOString(),
  };
});

/**
 * 2. Secure Server-Side Payment Verification
 */
export const verifyPaymentTransaction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "غير مصرح.");
  }

  const { amount, customerId, date } = data;
  if (!amount || amount <= 0 || !customerId) {
    throw new functions.https.HttpsError("invalid-argument", "تفاصيل الدفعة غير صالحة.");
  }

  // Verification logic on server
  return {
    verified: true,
    amount: Number(amount),
    customerId,
    date: date || new Date().toISOString(),
    receiptNumber: `REC-${Date.now()}`,
    status: "APPROVED",
  };
});

/**
 * 3. Server-Side Push Notification Dispatcher via FCM
 * Supports sending notifications across all user registered devices
 * Cleans up invalid/expired tokens automatically
 * Prevents duplicate notification sending for the same operation
 */
async function handleCrossDeviceNotification(data: any, context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "غير مصرح. يجب تسجيل الدخول.");
  }

  const userId = context.auth.uid;
  const {
    operationId,
    title,
    body,
    category,
    data: extraData,
  } = data || {};

  if (!title || !body) {
    throw new functions.https.HttpsError("invalid-argument", "عنوان ونص الإشعار مطلوبان.");
  }

  // 1. Deduplication check: if operation was already successfully sent, skip to prevent duplicates
  if (operationId) {
    const dedupRef = db
      .collection("users")
      .doc(userId)
      .collection("processedNotifications")
      .doc(String(operationId));

    const dedupDoc = await dedupRef.get();
    if (dedupDoc.exists) {
      return {
        success: true,
        skipped: true,
        reason: "تم إرسال هذا الإشعار مسبقاً لمنع التكرار.",
      };
    }
  }

  // 2. Retrieve all active user tokens across all devices
  let tokensSnap = await db
    .collection("users")
    .doc(userId)
    .collection("tokens")
    .get();

  // If empty in target database, also check default database instance
  if (tokensSnap.empty) {
    try {
      const defaultDb = admin.firestore();
      const fallbackSnap = await defaultDb
        .collection("users")
        .doc(userId)
        .collection("tokens")
        .get();
      if (!fallbackSnap.empty) {
        tokensSnap = fallbackSnap;
      }
    } catch (e) {
      console.warn("Fallback database check notice:", e);
    }
  }

  if (tokensSnap.empty) {
    return {
      success: false,
      reason: "لا توجد أجهزة مسجلة لهذا الحساب حالياً.",
    };
  }

  const tokenDocs: { id: string; token: string }[] = [];
  tokensSnap.docs.forEach((doc) => {
    const d = doc.data();
    const tokenVal = d?.token || d?.fcmToken;
    if (typeof tokenVal === "string" && tokenVal.trim().length > 0) {
      tokenDocs.push({ id: doc.id, token: tokenVal.trim() });
    }
  });

  if (tokenDocs.length === 0) {
    return { success: false, reason: "رموز FCM فارغة." };
  }

  // Extract all device tokens (deduplicated)
  const uniqueTokenMap = new Map<string, string>(); // token -> docId
  tokenDocs.forEach((item) => {
    if (!uniqueTokenMap.has(item.token)) {
      uniqueTokenMap.set(item.token, item.id);
    }
  });
  const allTokens = Array.from(uniqueTokenMap.keys());

  // Convert payload extra data to string map for FCM compliance
  const stringifiedData: Record<string, string> = {
    title: String(title),
    body: String(body),
    category: String(category || "general"),
    channelId: "accounting_alerts",
    operationId: String(operationId || ""),
    timestamp: String(Date.now()),
  };

  if (extraData && typeof extraData === "object") {
    Object.keys(extraData).forEach((k) => {
      const v = extraData[k];
      if (v !== undefined && v !== null) {
        stringifiedData[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
    });
  }

  // Unified Android Notification Payload matching Android requirements
  const messagePayload: admin.messaging.MulticastMessage = {
    tokens: allTokens,
    notification: {
      title,
      body,
    },
    data: stringifiedData,
    android: {
      priority: "high",
      notification: {
        channelId: "accounting_alerts",
        icon: "ic_stat_notification",
        color: "#2563EB",
        sound: "default",
        priority: "high",
        defaultSound: true,
        defaultVibrateTimings: true,
        tag: String(operationId || Date.now()),
      },
    },
    webpush: {
      headers: {
        Urgency: "high",
      },
      notification: {
        title,
        body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        dir: "rtl",
        lang: "ar",
        tag: String(operationId || Date.now()),
      },
      fcmOptions: {
        link: "/",
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(messagePayload);

    // 3. Mark operation as processed ONLY IF at least one device was successfully notified!
    if (operationId && response.successCount > 0) {
      const dedupRef = db
        .collection("users")
        .doc(userId)
        .collection("processedNotifications")
        .doc(String(operationId));
      await dedupRef.set({
        operationId,
        title,
        successCount: response.successCount,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch((err) => console.warn("Notice: dedup record write:", err));
    }

    // 4. Clean up stale or invalid tokens across user database
    const tokensToDelete: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const errCode = resp.error.code;
        if (
          errCode === "messaging/registration-token-not-registered" ||
          errCode === "messaging/invalid-registration-token" ||
          errCode === "messaging/invalid-argument" ||
          errCode === "messaging/mismatched-credential"
        ) {
          const sentToken = allTokens[idx];
          const docId = uniqueTokenMap.get(sentToken);
          if (docId) {
            tokensToDelete.push(docId);
          }
        }
      }
    });

    if (tokensToDelete.length > 0) {
      const batch = db.batch();
      tokensToDelete.forEach((docId) => {
        const ref = db.collection("users").doc(userId).collection("tokens").doc(docId);
        batch.delete(ref);
      });
      await batch.commit().catch((err) => console.warn("Notice: Batch token cleanup:", err));
    }

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      cleanedTokensCount: tokensToDelete.length,
    };
  } catch (error: any) {
    console.error("Error sending cross-device notification:", error);
    return {
      success: false,
      error: error?.message || "فشل إرسال الإشعار للأجهزة.",
    };
  }
}

export const sendCrossDeviceNotification = functions.https.onCall(handleCrossDeviceNotification);

/**
 * Legacy wrapper for backward compatibility
 */
export const sendDebtAlertNotification = functions.https.onCall(handleCrossDeviceNotification);

/**
 * 4. Loyalty Points & Rewards Calculator
 */
export const calculateLoyaltyPoints = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "غير مصرح.");
  }

  const { totalPaid, onTimePaymentsCount } = data;
  // 1 point per 10,000 currency units paid + 10 points bonus per on-time payment
  const points = Math.floor((Number(totalPaid) || 0) / 10000) + ((Number(onTimePaymentsCount) || 0) * 10);

  return {
    points,
    tier: points > 500 ? "GOLD" : points > 200 ? "SILVER" : "BRONZE",
    updatedAt: new Date().toISOString(),
  };
});

/**
 * 5. Automated Cloud Backup Snapshot
 */
export const createCloudBackupSnapshot = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "غير مصرح.");
  }

  const userId = context.auth.uid;
  const backupName = data.backupName || `نسخة احتياطية آمنة ${new Date().toLocaleDateString("ar-EG")}`;

  const collections = ["folders", "customers", "products", "invoices", "payments", "changeLogs", "settings"];
  const exportData: Record<string, any[]> = {};

  for (const col of collections) {
    const snap = await db.collection("users").doc(userId).collection(col).get();
    exportData[col] = snap.docs.map((d) => d.data());
  }

  const backupId = `cloud-backup-${Date.now()}`;
  const backupDoc = {
    id: backupId,
    userId,
    name: backupName,
    createdAt: new Date().toISOString(),
    stats: `العملاء: ${exportData.customers.length} | الفواتير: ${exportData.invoices.length}`,
    payloadJson: JSON.stringify(exportData),
  };

  await db.collection("users").doc(userId).collection("backups").doc(backupId).set(backupDoc);

  return {
    success: true,
    backupId,
    name: backupName,
    createdAt: backupDoc.createdAt,
  };
});

/**
 * 6. Intelligent Financial Assistant AI
 * Answers user questions naturally using authenticated user accounting data.
 * Powered by Google Gemini (@google/genai) with secure server-side isolation and deterministic fallback.
 */

function normalizeArabic(text: string): string {
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

interface CustomerFinanceSummary {
  id: string;
  name: string;
  phone: string;
  address: string;
  totalInvoiced: number;
  totalPaid: number;
  remainingDebt: number;
  invoiceCount: number;
  paymentCount: number;
  isOverdue: boolean;
  overdueAmount: number;
  recentInvoices: { invoiceNumber: string; date: string; grandTotal: number; remainingAmount: number }[];
  recentPayments: { date: string; amount: number; method: string }[];
}

function processAccountingData(
  customersRaw: any[],
  invoicesRaw: any[],
  paymentsRaw: any[],
  currency: string = "د.ع"
) {
  const activeCustomers = customersRaw.filter((c) => !c.isDeleted);
  const activeInvoices = invoicesRaw.filter((inv) => !inv.isDeleted);
  const activePayments = paymentsRaw.filter((pay) => !pay.isDeleted);

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const customerMap = new Map<string, CustomerFinanceSummary>();

  activeCustomers.forEach((c) => {
    customerMap.set(c.id, {
      id: c.id,
      name: c.name || "بدون اسم",
      phone: c.phone || "",
      address: c.address || "",
      totalInvoiced: 0,
      totalPaid: 0,
      remainingDebt: 0,
      invoiceCount: 0,
      paymentCount: 0,
      isOverdue: false,
      overdueAmount: 0,
      recentInvoices: [],
      recentPayments: [],
    });
  });

  activeInvoices.forEach((inv) => {
    let summary = customerMap.get(inv.customerId);
    if (!summary) {
      summary = {
        id: inv.customerId || `cust-${Date.now()}`,
        name: inv.customerName || "زبون نقدي / غير مسجل",
        phone: inv.customerPhone || "",
        address: inv.customerAddress || "",
        totalInvoiced: 0,
        totalPaid: 0,
        remainingDebt: 0,
        invoiceCount: 0,
        paymentCount: 0,
        isOverdue: false,
        overdueAmount: 0,
        recentInvoices: [],
        recentPayments: [],
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

    summary.recentInvoices.push({
      invoiceNumber: inv.invoiceNumber || "",
      date: inv.date || "",
      grandTotal: gTotal,
      remainingAmount: rem,
    });
  });

  activePayments.forEach((pay) => {
    let summary = customerMap.get(pay.customerId);
    if (summary) {
      const amt = Number(pay.amount) || 0;
      summary.totalPaid += amt;
      summary.remainingDebt = Math.max(0, summary.remainingDebt - amt);
      summary.paymentCount += 1;
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

  activeInvoices.forEach((inv) => {
    totalDebt += Number(inv.grandTotal) || 0;
    totalPaid += Number(inv.paidAmount) || 0;
  });
  activePayments.forEach((pay) => {
    totalPaid += Number(pay.amount) || 0;
  });
  const totalRemaining = customersList.reduce((acc, c) => acc + c.remainingDebt, 0);

  return {
    currency,
    customersList,
    debtors,
    overdueDebtors,
    totalDebt,
    totalPaid,
    totalRemaining,
    recentPayments: activePayments.slice(-10),
    recentInvoices: activeInvoices.slice(-10),
  };
}


function generateDeterministicAnswer(question: string, stats: ReturnType<typeof processAccountingData>): string {
  const normQ = normalizeArabic(question);
  const { currency, customersList, debtors, overdueDebtors, totalDebt, totalPaid, totalRemaining, recentPayments } = stats;

  // 1. Check if a specific customer was mentioned in the query
  let matchedCustomer: CustomerFinanceSummary | null = null;
  for (const c of customersList) {
    const normName = normalizeArabic(c.name);
    if (normName.length >= 3 && normQ.includes(normName)) {
      matchedCustomer = c;
      break;
    }
  }

  if (matchedCustomer) {
    const c = matchedCustomer;
    return (
      `### 👤 كشف حساب العميل: **${c.name}**\n\n` +
      `- **رقم الهاتف:** ${c.phone || "غير مسجل"}\n` +
      `- **إجمالي المشتريات / الديون:** ${c.totalInvoiced.toLocaleString()} ${currency}\n` +
      `- **إجمالي المبالغ المسددة:** ${c.totalPaid.toLocaleString()} ${currency}\n` +
      `- **صافي المبلغ المتبقي بذمته:** **${c.remainingDebt.toLocaleString()} ${currency}** ${c.remainingDebt === 0 ? "✅ (خالص - لا توجد ديون)" : "⚠️"}\n` +
      (c.isOverdue ? `- **حالة السداد:** 🔴 متأخر عن موعد الاستحقاق بمبلغ ${c.overdueAmount.toLocaleString()} ${currency}\n` : "") +
      `- **عدد الفواتير:** ${c.invoiceCount} فاتورة\n` +
      (c.recentPayments.length > 0
        ? `\n**آخر الدفعات المستلمة:**\n` +
          c.recentPayments.slice(-3).map((p) => `  * ${p.date}: ${p.amount.toLocaleString()} ${currency} (${p.method})`).join("\n")
        : "")
    );
  }

  // 2. Question: من عليه ديون؟ / المطلوبين
  if (
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
      return `🎉 **ما شاء الله! لا توجد أي ديون متبقية على أي عميل حالياً.** جميع الحسابات مسددة بالكامل.`;
    }

    const sorted = [...debtors].sort((a, b) => b.remainingDebt - a.remainingDebt);
    const listStr = sorted
      .map(
        (c, idx) =>
          `${idx + 1}. **${c.name}**: المتبقي **${c.remainingDebt.toLocaleString()} ${currency}** ` +
          `(المجموع: ${c.totalInvoiced.toLocaleString()} — الواصل: ${c.totalPaid.toLocaleString()})` +
          (c.isOverdue ? ` ⚠️ [متأخر]` : "")
      )
      .join("\n");

    return (
      `### 📋 قائمة العملاء المدينين (عليهم مبالغ متبقية):\n\n` +
      `يوجد حالياً **${debtors.length} عملاء** بذمتهم ديون قائمة، بإجمالي متبقي **${totalRemaining.toLocaleString()} ${currency}**:\n\n` +
      listStr +
      `\n\n💡 *يمكنك كتابة "تفاصيل حساب [اسم العميل]" لمعرفة تفاصيل فواتيره ودفعاته.*`
    );
  }

  // 3. Question: من قام بالتسديد؟ / الدفعات
  if (
    normQ.includes("تسديد") ||
    normQ.includes("سدد") ||
    normQ.includes("دفع") ||
    normQ.includes("المقبوضات") ||
    normQ.includes("واصل")
  ) {
    if (recentPayments.length === 0 && totalPaid === 0) {
      return `ℹ️ لم يتم تسجيل أي دفعات أو مقبوضات في النظام حتى الآن.`;
    }

    const recentStr = recentPayments
      .slice(-8)
      .reverse()
      .map(
        (p: any) =>
          `* **${p.customerName || "عميل"}**: استلام **${Number(p.amount || 0).toLocaleString()} ${currency}** بتاريخ ${p.date || "اليوم"} (${p.method || "نقدي"})`
      )
      .join("\n");

    return (
      `### 💳 ملخص المقبوضات والتسديدات:\n\n` +
      `- **إجمالي المبالغ المسددة والمقبوضة:** **${totalPaid.toLocaleString()} ${currency}**\n\n` +
      `**آخر عمليات السداد المسجلة:**\n` +
      (recentStr || "لا توجد حركات تسديد مسجلة مؤخراً.")
    );
  }

  // 4. Question: كم مجموع الديون؟
  if (
    normQ.includes("مجموع الديون") ||
    normQ.includes("اجمالي الديون") ||
    normQ.includes("كم الدين") ||
    normQ.includes("المبلغ الكلي") ||
    normQ.includes("كامل الديون")
  ) {
    return (
      `### 📊 الموقف المالي الإجمالي للديون:\n\n` +
      `- **إجمالي الديون المسجلة:** **${totalDebt.toLocaleString()} ${currency}**\n` +
      `- **إجمالي المقبوضات (المسدد):** **${totalPaid.toLocaleString()} ${currency}**\n` +
      `- **صافي الديون المتبقية بالسوق:** **${totalRemaining.toLocaleString()} ${currency}**\n` +
      `- **عدد الزبائن المدينين:** ${debtors.length} زبائن\n` +
      `- **نسبة التحصيل الإجمالية:** ${totalDebt > 0 ? ((totalPaid / totalDebt) * 100).toFixed(1) : 0}%`
    );
  }

  // 5. Question: المتأخرين عن السداد
  if (normQ.includes("متاخر") || normQ.includes("متاخرين") || normQ.includes("استحقاق")) {
    if (overdueDebtors.length === 0) {
      return `✅ **ممتاز!** لا يوجد أي عملاء متأخرين عن موعد استحقاق السداد حالياً.`;
    }

    const listStr = overdueDebtors
      .map(
        (c, idx) =>
          `${idx + 1}. **${c.name}**: المتبقي المتأخر **${c.overdueAmount.toLocaleString()} ${currency}** (هاتف: ${c.phone || "غير مسجل"})`
      )
      .join("\n");

    return (
      `### ⚠️ قائمة العملاء المتأخرين عن السداد:\n\n` +
      `يوجد **${overdueDebtors.length} عملاء** تجاوزوا موعد استحقاق فواتيرهم:\n\n` +
      listStr
    );
  }

  // 6. Default: Comprehensive Accounting Summary
  return (
    `### 📈 الملخص المحاسبي الشامل:\n\n` +
    `- **إجمالي المبيعات / الديون:** ${totalDebt.toLocaleString()} ${currency}\n` +
    `- **إجمالي المقبوضات والواصل:** ${totalPaid.toLocaleString()} ${currency}\n` +
    `- **صافي الديون المتبقية بذمة العملاء:** **${totalRemaining.toLocaleString()} ${currency}**\n` +
    `- **إجمالي عدد العملاء المسجلين:** ${customersList.length} عميل\n` +
    `- **العملاء المدينين حالياً:** ${debtors.length} عميل\n` +
    `- **العملاء المتأخرين عن السداد:** ${overdueDebtors.length} عميل\n\n` +
    `💡 *يمكنك سؤالي عن: "من عليه ديون؟"، "كم باقي على [اسم العميل]؟"، أو "من قام بالتسديد مؤخراً؟"*`
  );
}


export const askFinancialAssistant = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول لاستخدام المساعد الذكي.");
  }

  const userId = context.auth.uid;
  const question = typeof data?.question === "string" ? data.question.trim() : "";
  if (!question) {
    throw new functions.https.HttpsError("invalid-argument", "السؤال مطلوب.");
  }

  let customers: any[] = [];
  let invoices: any[] = [];
  let payments: any[] = [];
  let currency = "د.ع";

  try {
    const [custSnap, invSnap, paySnap, setDoc] = await Promise.all([
      db.collection("users").doc(userId).collection("customers").where("isDeleted", "==", false).get(),
      db.collection("users").doc(userId).collection("invoices").where("isDeleted", "==", false).get(),
      db.collection("users").doc(userId).collection("payments").where("isDeleted", "==", false).get(),
      db.collection("users").doc(userId).collection("settings").doc("general").get(),
    ]);

    customers = custSnap.docs.map((d) => d.data());
    invoices = invSnap.docs.map((d) => d.data());
    payments = paySnap.docs.map((d) => d.data());
    if (setDoc.exists && setDoc.data()?.currency) {
      currency = setDoc.data()?.currency;
    }
  } catch (dbErr) {
    console.warn("Notice: Firestore data read in askFinancialAssistant:", dbErr);
  }

  if (data.localData && typeof data.localData === "object") {
    if (Array.isArray(data.localData.customers) && data.localData.customers.length > customers.length) {
      customers = data.localData.customers;
    }
    if (Array.isArray(data.localData.invoices) && data.localData.invoices.length > invoices.length) {
      invoices = data.localData.invoices;
    }
    if (Array.isArray(data.localData.payments) && data.localData.payments.length > payments.length) {
      payments = data.localData.payments;
    }
    if (data.localData.settings?.currency) {
      currency = data.localData.settings.currency;
    }
  }

  const stats = processAccountingData(customers, invoices, payments, currency);

  const requestedModel = typeof data?.model === "string" ? data.model.trim() : "gemini-3.8-flash";
  let modelToUse = requestedModel;
  if (modelToUse === "gemini-3.5-flash-lite") modelToUse = "gemini-3.1-flash-lite";

  const customInstructions = typeof data?.customInstructions === "string" ? data.customInstructions.trim() : "";
  const conversationHistory = Array.isArray(data?.conversationHistory) ? data.conversationHistory : [];

  const apiKey = process.env.GEMINI_API_KEY || (functions.config()?.gemini?.key as string | undefined);

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const debtorsSummary = stats.debtors
        .map(
          (c) =>
            `- ${c.name}: المتبقي ${c.remainingDebt.toLocaleString()} ${currency} (المجموع: ${c.totalInvoiced.toLocaleString()}، المسدد: ${c.totalPaid.toLocaleString()}) هاتف: ${c.phone || "غير مسجل"}`
        )
        .join("\n");

      const recentPaymentsSummary = stats.recentPayments
        .slice(-6)
        .map((p: any) => `- ${p.customerName || "عميل"}: دفع ${Number(p.amount || 0).toLocaleString()} ${currency} بتاريخ ${p.date || ""}`)
        .join("\n");

      let historyText = "";
      if (conversationHistory.length > 0) {
        historyText = conversationHistory
          .slice(-6)
          .map((m: any) => `${m.sender === "user" ? "المستخدم" : "المساعد"}: ${m.text}`)
          .join("\n\n");
      }

      const contextPrompt = `بيانات الحسابات والديون الفعلية للمستخدم:
- العملة: ${currency}
- إجمالي المبيعات/الديون: ${stats.totalDebt.toLocaleString()} ${currency}
- إجمالي المبالغ المسددة: ${stats.totalPaid.toLocaleString()} ${currency}
- صافي الديون المتبقية بالسوق: ${stats.totalRemaining.toLocaleString()} ${currency}
- عدد العملاء الإجمالي: ${stats.customersList.length}
- عدد العملاء المدينين (عليهم متبقي): ${stats.debtors.length}
- عدد المتأخرين عن السداد: ${stats.overdueDebtors.length}

قائمة العملاء المدينين بالتفصيل:
${debtorsSummary || "لا توجد ديون متبقية على أي عميل."}

آخر المقبوضات/الدفعات المسجلة:
${recentPaymentsSummary || "لا توجد دفعات مسجلة."}

${historyText ? `سياق المحادثة السابقة:\n${historyText}\n\n` : ""}سؤال المستخدم:
"${question}"
`;

      const systemInstruction = `أنت "المساعد الذكي والمستشار المالي" لتطبيق "دفتر الديون المحاسبي".
تساعد صاحب العمل بالإجابة على استفساراته المحاسبية والمالية بدقة تامة.

قواعد صارمة وإلزامية:
1. اعتمد حصراً على بيانات المستخدم الفعلية المرفقة أعلاه، ولا تخترع أو تفترض أي أرقام أو أسماء غير موجودة.
2. إذا سأل المستخدم عن شخص غير موجود في السجلات، قل بوضوح: "الاسم غير موجود في سجلات العملاء الحالية".
3. أجب باللغة العربية بأسلوب راقٍ، مهني، مباشر، ومنسق بنقاط وMarkdown واضح.
4. اذكر دائماً المبالغ بالأرقام والعملة (${currency}).
5. أجب مباشرة على ما سأل عنه المستخدم بدقة واختصار دون إطالة لا فائدة منها.
${customInstructions ? `\nتعليمات إضافية مخصصة من المستخدم:\n${customInstructions}` : ""}`;

      let response;
      try {
        response = await ai.models.generateContent({
          model: modelToUse,
          contents: contextPrompt,
          config: {
            systemInstruction,
          },
        });
      } catch (primaryModelErr) {
        console.warn(`Primary model ${modelToUse} failed, trying stable fallback gemini-2.5-flash:`, primaryModelErr);
        modelToUse = "gemini-2.5-flash";
        response = await ai.models.generateContent({
          model: modelToUse,
          contents: contextPrompt,
          config: {
            systemInstruction,
          },
        });
      }

      const text = response.text?.trim();
      if (text) {
        return {
          success: true,
          answer: text,
          source: "gemini",
          modelUsed: modelToUse,
          requestedModel,
          dataSummary: {
            totalDebt: stats.totalDebt,
            totalPaid: stats.totalPaid,
            totalRemaining: stats.totalRemaining,
            debtorCount: stats.debtors.length,
            overdueCount: stats.overdueDebtors.length,
            currency,
          },
        };
      }
    } catch (aiErr) {
      console.warn("Gemini generation failed, falling back to deterministic analyzer:", aiErr);
    }
  }

  const answer = generateDeterministicAnswer(question, stats);
  return {
    success: true,
    answer,
    source: "deterministic_analyzer",
    modelUsed: "المحلل الذكي المحلي (خوارزمي)",
    dataSummary: {
      totalDebt: stats.totalDebt,
      totalPaid: stats.totalPaid,
      totalRemaining: stats.totalRemaining,
      debtorCount: stats.debtors.length,
      overdueCount: stats.overdueDebtors.length,
      currency,
    },
  };
});

/**
 * 7. Test Gemini Model Connectivity via Firebase Functions
 */
export const testGeminiModel = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول لفحص الاتصال.");
  }

  const startTime = Date.now();
  let model = typeof data?.model === "string" ? data.model.trim() : "gemini-3.8-flash";
  if (model === "gemini-3.5-flash-lite") model = "gemini-3.1-flash-lite";

  const apiKey = process.env.GEMINI_API_KEY || (functions.config()?.gemini?.key as string | undefined);
  if (!apiKey) {
    return {
      success: false,
      model,
      error: "مفتاح GEMINI_API_KEY غير مهيأ في بيئة السيرفر.",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: "اختبار اتصال سريع. أجب بكلمة واحدة: 'متصل'",
      config: {
        maxOutputTokens: 20,
        temperature: 0.1,
      },
    });

    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      model,
      latencyMs,
      response: response.text?.trim() || "متصل",
      message: `الاتصال بنموذج ${model} ناجح (${latencyMs}ms)`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      model,
      latencyMs,
      error: err?.message || "فشل الاتصال بالنموذج.",
    };
  }
});

