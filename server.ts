import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import dotenv from "dotenv";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import {
  processFullAccountingDataset,
  executeDeterministicFinancialQuery,
} from "./src/lib/accountingEngine";

dotenv.config();

// Initialize Firebase Admin for server-side token verification and Firestore queries
try {
  if (!getApps().length) {
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
} catch (err) {
  console.warn("Notice: Firebase Admin initialization in server:", err);
}

function getFirestoreDb() {
  const targetDb = firebaseConfig.firestoreDatabaseId || undefined;
  try {
    return targetDb ? getFirestore(targetDb) : getFirestore();
  } catch (e) {
    return getFirestore();
  }
}

const db = getFirestoreDb();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "25mb" }));

// Model identifier normalization & validation
function resolveModelId(requestedModel?: string): string {
  if (!requestedModel) return "gemini-3.8-flash";
  const m = requestedModel.trim();
  if (m === "gemini-3.5-flash-lite") return "gemini-3.1-flash-lite";
  if (m === "gemini-flash" || m === "flash") return "gemini-3.8-flash";
  if (m === "gemini-pro" || m === "pro") return "gemini-3.1-pro-preview";
  return m;
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    firebaseConfigured: !!getApps().length,
    timestamp: new Date().toISOString(),
  });
});

// Test connection to a specific Gemini model
app.post("/api/ai/test-model", async (req, res) => {
  const startTime = Date.now();
  const rawModel = req.body?.model || "gemini-3.8-flash";
  const modelToUse = resolveModelId(rawModel);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      model: modelToUse,
      error: "مفتاح GEMINI_API_KEY غير مهيأ في بيئة الخادم. يرجى التأكد من إعداد المفتاح.",
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: "اختبار اتصال سريع. أجب بكلمة: 'متصل'",
      config: {
        maxOutputTokens: 20,
        temperature: 0.1,
      },
    });

    const latencyMs = Date.now() - startTime;
    return res.json({
      success: true,
      model: modelToUse,
      rawModelRequested: rawModel,
      latencyMs,
      response: response.text?.trim() || "متصل",
      message: `الاتصال بنموذج ${modelToUse} ناجح وسريع (${latencyMs}ms)`,
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    console.error(`Gemini connection test failed for ${modelToUse}:`, err?.message || err);
    return res.status(500).json({
      success: false,
      model: modelToUse,
      latencyMs,
      error: err?.message || "فشل الاتصال بالنموذج.",
    });
  }
});

// AI Chat generation endpoint with deterministic query engine and zero sampling
app.post("/api/ai/chat", async (req, res) => {
  const startTime = Date.now();
  const {
    question,
    model = "gemini-3.8-flash",
    contextData,
    customInstructions,
    conversationHistory,
  } = req.body;

  if (!question || typeof question !== "string") {
    return res.status(400).json({ success: false, error: "السؤال مطلوب." });
  }

  // 1. Authenticate user if Bearer token is provided
  let authenticatedUserId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const idToken = authHeader.split("Bearer ")[1]?.trim();
    if (idToken) {
      try {
        const decoded = await getAuth().verifyIdToken(idToken);
        authenticatedUserId = decoded.uid;
      } catch (authErr) {
        console.warn("Notice: Token verification in /api/ai/chat:", authErr);
      }
    }
  }

  // 2. Fetch full user data from Firestore if authenticated, or use provided full context
  let folders: any[] = [];
  let customers: any[] = [];
  let invoices: any[] = [];
  let payments: any[] = [];
  let currency = contextData?.currency || "د.ع";

  if (authenticatedUserId) {
    try {
      const [foldSnap, custSnap, invSnap, paySnap, setDoc] = await Promise.all([
        db.collection("users").doc(authenticatedUserId).collection("folders").where("isDeleted", "==", false).get(),
        db.collection("users").doc(authenticatedUserId).collection("customers").where("isDeleted", "==", false).get(),
        db.collection("users").doc(authenticatedUserId).collection("invoices").where("isDeleted", "==", false).get(),
        db.collection("users").doc(authenticatedUserId).collection("payments").where("isDeleted", "==", false).get(),
        db.collection("users").doc(authenticatedUserId).collection("settings").doc("general").get(),
      ]);

      folders = foldSnap.docs.map((d) => d.data());
      customers = custSnap.docs.map((d) => d.data());
      invoices = invSnap.docs.map((d) => d.data());
      payments = paySnap.docs.map((d) => d.data());
      if (setDoc.exists && setDoc.data()?.currency) {
        currency = setDoc.data()?.currency;
      }
    } catch (dbErr) {
      console.warn("Notice: Could not fetch from Firestore in server, checking client context:", dbErr);
    }
  }

  // Merge client context data if it contains more items (e.g. offline cached state)
  if (contextData && typeof contextData === "object") {
    if (Array.isArray(contextData.folders) && contextData.folders.length > folders.length) {
      folders = contextData.folders;
    }
    if (Array.isArray(contextData.customers) && contextData.customers.length > customers.length) {
      customers = contextData.customers;
    }
    if (Array.isArray(contextData.invoices) && contextData.invoices.length > invoices.length) {
      invoices = contextData.invoices;
    }
    if (Array.isArray(contextData.payments) && contextData.payments.length > payments.length) {
      payments = contextData.payments;
    }
    if (contextData.currency) {
      currency = contextData.currency;
    }
  }

  // 3. Process complete dataset through deterministic engine (100% of records, zero truncation)
  const dataset = processFullAccountingDataset(customers, folders, invoices, payments, currency);
  const resolved = executeDeterministicFinancialQuery(question, dataset);

  const modelToUse = resolveModelId(model);
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });

      let historyText = "";
      if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        historyText = conversationHistory
          .slice(-6)
          .map((m: any) => `${m.sender === "user" ? "المستخدم" : "المساعد"}: ${m.text}`)
          .join("\n\n");
      }

      const contextPrompt = `بيانات مالية وحسابية حقيقية ومؤكدة بنسبة 100% محسوبة برمجياً من السجلات الكاملة:
- إجمالي عدد العملاء المسجلين: ${dataset.portfolio.customerCount} عميل
- إجمالي عدد المدينين (المتبقي > 0): ${dataset.portfolio.debtorCount} مدين
- إجمالي الديون المسجلة: ${dataset.portfolio.totalDebt.toLocaleString()} ${currency}
- إجمالي المبالغ المسددة: ${dataset.portfolio.totalPaid.toLocaleString()} ${currency}
- صافي الديون المتبقية بالسوق: ${dataset.portfolio.totalRemaining.toLocaleString()} ${currency}
- عدد المجلدات: ${dataset.portfolio.folderCount}
- نسبة التحصيل الإجمالية: ${dataset.portfolio.collectionRate}%

النتيجة الحسابية والجدول المحاسبي الدقيق المجهز برمجياً وفق سؤال المستخدم:
${resolved.resultAnswer}

${historyText ? `سياق المحادثة السابقة:\n${historyText}\n\n` : ""}سؤال المستخدم الحالي:
"${question}"
`;

      const systemInstruction = `أنت "المساعد الذكي والمستشار المالي الخبير" لتطبيق "دفتر الديون المحاسبي".
مهمتك تقديم الإجابات المحاسبية الدقيقة المعتمدة على البيانات المحسوبة برمجياً أعلاه دون أي تخمين أو تغيير في الأرقام.

القواعد الصارمة:
1. اعتمد حصراً وبشكل قطعي على الجدول الحسابي والأرقام المرفقة أعلاه، ولا تغير أي رقم أو اسم أو مبلغ.
2. اعرض الجداول بتنسيق Markdown الأنيق كما هي مجهزة.
3. تحدث بأسلوب راقٍ، مهني، مباشر، باللغة العربية.
4. اذكر دائماً المبالغ بالأرقام والعملة (${currency}).
${customInstructions ? `\nتعليمات إضافية مخصصة من المستخدم:\n${customInstructions}` : ""}`;

      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: contextPrompt,
        config: {
          systemInstruction,
        },
      });

      const answer = response.text?.trim();
      if (answer) {
        return res.json({
          success: true,
          answer,
          modelUsed: modelToUse,
          requestedModel: model,
          source: "gemini",
          latencyMs: Date.now() - startTime,
          dataSummary: {
            totalDebt: dataset.portfolio.totalDebt,
            totalPaid: dataset.portfolio.totalPaid,
            totalRemaining: dataset.portfolio.totalRemaining,
            debtorCount: dataset.portfolio.debtorCount,
            overdueCount: dataset.portfolio.overdueCount,
            currency,
          },
        });
      }
    } catch (aiErr: any) {
      console.warn("Gemini generation failed, falling back to deterministic answer:", aiErr?.message || aiErr);
    }
  }

  // Direct deterministic return
  return res.json({
    success: true,
    answer: resolved.resultAnswer,
    modelUsed: "المحرك المالي المحاسبي المباشر (موثق)",
    requestedModel: model,
    source: "deterministic_analyzer",
    latencyMs: Date.now() - startTime,
    dataSummary: {
      totalDebt: dataset.portfolio.totalDebt,
      totalPaid: dataset.portfolio.totalPaid,
      totalRemaining: dataset.portfolio.totalRemaining,
      debtorCount: dataset.portfolio.debtorCount,
      overdueCount: dataset.portfolio.overdueCount,
      currency,
    },
  });
});

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.resolve(process.cwd(), "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
