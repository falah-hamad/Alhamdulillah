import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "10mb" }));

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

// AI Chat generation endpoint
app.post("/api/ai/chat", async (req, res) => {
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: "مفتاح GEMINI_API_KEY غير مهيأ في بيئة الخادم.",
      source: "no_api_key",
    });
  }

  const modelToUse = resolveModelId(model);

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Build context summary from contextData
    const currency = contextData?.currency || "د.ع";
    const totalDebt = contextData?.totalDebt ? Number(contextData.totalDebt).toLocaleString() : "0";
    const totalPaid = contextData?.totalPaid ? Number(contextData.totalPaid).toLocaleString() : "0";
    const totalRemaining = contextData?.totalRemaining ? Number(contextData.totalRemaining).toLocaleString() : "0";
    const debtorsList = Array.isArray(contextData?.debtors)
      ? contextData.debtors
          .slice(0, 50)
          .map(
            (c: any, i: number) =>
              `${i + 1}. العميل: ${c.name} | المتبقي: ${Number(c.remainingDebt || 0).toLocaleString()} ${currency} | الهاتف: ${c.phone || "غير مسجل"}`
          )
          .join("\n")
      : "لا توجد قائمة ديون محددة";

    const recentPayments = Array.isArray(contextData?.recentPayments)
      ? contextData.recentPayments
          .slice(0, 15)
          .map(
            (p: any) =>
              `- العميل: ${p.customerName || "عميل"} | المبلغ: ${Number(p.amount || 0).toLocaleString()} ${currency} | التاريخ: ${p.date || ""}`
          )
          .join("\n")
      : "لا توجد دفعات حديثة";

    let historyText = "";
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      historyText = conversationHistory
        .slice(-6)
        .map((m: any) => `${m.sender === "user" ? "المستخدم" : "المساعد"}: ${m.text}`)
        .join("\n\n");
    }

    const systemInstruction = `أنت "المساعد المالي والمحاسبي الذكي" لتطبيق "دفتر الديون المحاسبي".
مهمتك مساعدة التاجر وصاحب العمل في فهم حساباته، تحصيل ديونه، كشف حسابات الزبائن، وتقديم نصائح مالية مبنية حصراً على بياناته.

بيئة العمل الحالية:
- العملة المستخدمة: ${currency}
- إجمالي المبيعات / الديون: ${totalDebt} ${currency}
- إجمالي المبالغ المسددة (المقبوضة): ${totalPaid} ${currency}
- صافي الديون المتبقية بذمة العملاء بالسوق: ${totalRemaining} ${currency}

قائمة أبرز العملاء المدينين:
${debtorsList}

آخر الدفعات والمقبوضات المستلمة:
${recentPayments}

${customInstructions ? `تعليمات إضافية مخصصة من المستخدم:\n${customInstructions}\n` : ""}

القواعد الإلزامية:
1. اعتمد حصراً على بيانات الحسابات المرفقة أعلاه، ولا تخترع أو تفترض أي أرقام أو عملاء من عندك.
2. إذا سأل المستخدم عن عميل غير موجود في السجل، أخبره بلطف ووضوح أن الاسم غير مدرج في دفتر الديون.
3. نسق الإجابة بتنسيق Markdown راقٍ وجميل، باستخدام عناوين واضحة (###)، نقاط بارزة، جداول عند الحاجة، وبطاقات أرقام.
4. اذكر دائماً المبالغ بالأرقام مع العملة (${currency}).
5. تحدث بلغة عربية احترافية، مهذبة، ومباشرة.
6. إذا طلب المستخدم تقريراً أو كشفاً، قدمه منظماً ككشف حساب جاهز للمراجعة أو الطباعة.`;

    const userPrompt = historyText
      ? `سياق المحادثة السابقة:\n${historyText}\n\nالسؤال الحالي:\n${question}`
      : question;

    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: userPrompt,
      config: {
        systemInstruction,
      },
    });

    const answer = response.text?.trim() || "لم يتم استلام رد من النموذج.";

    return res.json({
      success: true,
      answer,
      modelUsed: modelToUse,
      requestedModel: model,
      source: "gemini",
    });
  } catch (err: any) {
    console.error(`Error in /api/ai/chat with model ${modelToUse}:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err?.message || "حدث خطأ أثناء معالجة الطلب بالذكاء الاصطناعي.",
      modelUsed: modelToUse,
      requestedModel: model,
    });
  }
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
