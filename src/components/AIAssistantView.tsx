import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Bot,
  User as UserIcon,
  Trash2,
  DollarSign,
  Users,
  AlertTriangle,
  Receipt,
  HelpCircle,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { Customer, Invoice, Payment, SystemSettings } from "../types";
import { askFinancialAssistantServer, FinancialAssistantResponse } from "../lib/cloudFunctions";

interface AIAssistantViewProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
  onSelectCustomerForLedger?: (customerId: string) => void;
  setCurrentTab?: (tab: string) => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  source?: "gemini";
}

const SUGGESTED_QUESTIONS = [
  { label: "من عليه ديون؟", query: "من عليه ديون متبقية حالياً؟", icon: Users },
  { label: "كم مجموع الديون؟", query: "كم مجموع الديون والمبالغ المسددة والمتبقية؟", icon: DollarSign },
  { label: "من قام بالتسديد؟", query: "من قام بالتسديد ومَن دفع مؤخراً؟", icon: Receipt },
  { label: "الزبائن المتأخرين", query: "من هم الزبائن المتأخرين عن موعد سداد فواتيرهم؟", icon: AlertTriangle },
  { label: "ملخص الحسابات", query: "أعطني ملخصاً محاسبياً شاملاً للحسابات والديون", icon: TrendingUp },
];

export default function AIAssistantView({
  customers,
  invoices,
  payments,
  settings,
  onSelectCustomerForLedger,
  setCurrentTab,
}: AIAssistantViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: "welcome",
        sender: "ai",
        text: `أهلاً بك! أنا **مساعدك المحاسبي والمالي الذكي** 🤖✨\n\nأنا مرتبط مباشرة ببيانات دفتر ديونك الحقيقية، ويمكنني الإجابة على أي استفسار حول:\n- **العملاء المدينين والمبالغ المتبقية**\n- **تفاصيل وكشف حساب أي عميل محدد**\n- **إجمالي الديون ونسب التحصيل**\n- **سجل التسديدات والمقبوضات**\n- **الزبائن المتأخرين عن السداد**\n\nاختر أحد الأسئلة المقترحة بالأسفل أو اكتب سؤالك بلغتك الطبيعية!`,
        timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
      },
    ];
  });

  const [inputQuery, setInputQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState<"gemini-3.8-flash" | "gemini-3.5-flash-lite">("gemini-3.8-flash");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const activeCustomers = customers.filter((c) => !c.isDeleted);
  const activeInvoices = invoices.filter((i) => !i.isDeleted);
  const activePayments = payments.filter((p) => !p.isDeleted);

  const totalInvoiced = activeInvoices.reduce((acc, inv) => acc + (Number(inv.grandTotal) || 0), 0);
  const totalPaidInvoices = activeInvoices.reduce((acc, inv) => acc + (Number(inv.paidAmount) || 0), 0);
  const totalSeparatePayments = activePayments.reduce((acc, pay) => acc + (Number(pay.amount) || 0), 0);
  const totalCollected = totalPaidInvoices + totalSeparatePayments;
  const totalRemaining = Math.max(0, activeInvoices.reduce((acc, inv) => acc + (Number(inv.remainingAmount) || 0), 0) - totalSeparatePayments);

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery("");
    setIsLoading(true);

    try {
      const conversationHistory = [...messages, userMsg]
        .filter((m) => m.id !== "welcome" && !m.id.startsWith("welcome_"))
        .slice(-12)
        .map((m) => ({
          role: m.sender === "user" ? "user" as const : "assistant" as const,
          text: m.text,
        }));

      const response: FinancialAssistantResponse = await askFinancialAssistantServer(
        textToSend,
        conversationHistory,
        selectedModel
      );

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: "ai",
        text: response.answer,
        timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
        source: response.source,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: "ai",
        text: `عذراً، حدثت مشكلة أثناء معالجة السؤال: ${err?.message || "يرجى المحاولة مرة أخرى."}`,
        timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        sender: "ai",
        text: "تم مسح المحادثة. كيف يمكنني مساعدتك الآن في حساباتك وديونك؟",
        timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const renderInlineBold = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-bold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  const renderFormattedText = (text: string) => {
    return text.split("\n").map((line, idx) => {
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="font-extrabold text-slate-900 text-sm mt-2 mb-1.5 flex items-center gap-1.5">
            {line.replace("### ", "")}
          </h4>
        );
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const itemContent = line.replace(/^[-*]\s+/, "");
        return (
          <div key={idx} className="flex items-start gap-1.5 my-0.5 text-xs text-slate-700 leading-relaxed">
            <span className="text-blue-600 font-bold shrink-0 mt-0.5">•</span>
            <span>{renderInlineBold(itemContent)}</span>
          </div>
        );
      }
      if (/^\d+\.\s/.test(line)) {
        return (
          <div key={idx} className="flex items-start gap-1.5 my-1 text-xs text-slate-800 leading-relaxed font-medium">
            <span>{renderInlineBold(line)}</span>
          </div>
        );
      }
      if (!line.trim()) {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="my-0.5 text-xs text-slate-700 leading-relaxed">
          {renderInlineBold(line)}
        </p>
      );
    });
  };


  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 rounded-2xl p-5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shrink-0">
            <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">المساعد المالي والمحاسبي الذكي (AI)</h2>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                متصل بالبيانات الفعلية
              </span>
            </div>
            <p className="text-xs text-blue-100 mt-0.5">
              حلل ديونك وحساباتك واطرح أي سؤال محاسبي وسيجيبك بدقة تامة اعتماداً على فواتيرك وزبائنك.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <button
            type="button"
            onClick={handleClearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-white/10"
            title="بدء محادثة جديدة ومسح الرسائل"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>محادثة جديدة</span>
          </button>
        </div>
      </div>

      {/* Mini Financial Summary Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-slate-500 block truncate">إجمالي الديون المتبقية</span>
            <span className="text-sm font-extrabold text-rose-600 font-mono block truncate">
              {totalRemaining.toLocaleString()} {settings.currency}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-slate-500 block truncate">المبالغ المسددة (الواصل)</span>
            <span className="text-sm font-extrabold text-emerald-600 font-mono block truncate">
              {totalCollected.toLocaleString()} {settings.currency}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-slate-500 block truncate">إجمالي العملاء</span>
            <span className="text-sm font-extrabold text-blue-600 font-mono block truncate">
              {activeCustomers.length} عميل
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] text-slate-500 block truncate">إجمالي الفواتير</span>
            <span className="text-sm font-extrabold text-amber-600 font-mono block truncate">
              {activeInvoices.length} فاتورة
            </span>
          </div>
        </div>
      </div>

      {/* Gemini Model Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <label htmlFor="gemini-model" className="text-xs font-bold text-slate-700 shrink-0">نموذج الذكاء الاصطناعي</label>
        <select
          id="gemini-model"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value as "gemini-3.8-flash" | "gemini-3.5-flash-lite")}
          disabled={isLoading}
          className="w-full sm:w-auto flex-1 bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none disabled:opacity-60"
        >
          <option value="gemini-3.8-flash">Gemini 3.8 Flash — ذكي ومتوازن</option>
          <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite — أسرع واقتصادي</option>
        </select>
        <span className="text-[10px] text-slate-500">يُطبّق الاختيار على الرسائل الجديدة</span>
      </div>

      {/* Suggested Questions Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5" /> أسئلة مقترحة:
        </span>
        {SUGGESTED_QUESTIONS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => handleSend(item.query)}
              className="px-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-slate-700 text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Icon className="w-3 h-3 text-blue-600" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>


      {/* Chat Messages Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[520px]">
        {/* Messages List Area */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
          {messages.map((msg) => {
            const isAi = msg.sender === "ai";
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isAi ? "flex-row" : "flex-row-reverse"}`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                    isAi
                      ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white"
                      : "bg-slate-800 text-white"
                  }`}
                >
                  {isAi ? <Bot className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 shadow-xs ${
                    isAi
                      ? "bg-slate-50 border border-slate-200 text-slate-800 rounded-tr-none"
                      : "bg-blue-600 text-white rounded-tl-none"
                  }`}
                >
                  {isAi ? (
                    <div className="text-xs leading-relaxed">{renderFormattedText(msg.text)}</div>
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  )}

                  <div
                    className={`mt-2 flex items-center justify-between gap-3 text-[10px] ${
                      isAi ? "text-slate-400" : "text-blue-100"
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {isAi && msg.source && (
                      <span className="flex items-center gap-1 text-[9px] text-slate-400 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200">
                        Google Gemini AI
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tr-none p-3.5 shadow-xs max-w-[80%] flex items-center gap-2.5 text-xs text-slate-600 font-medium">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span>جاري استرجاع وتحليل البيانات عبر الذكاء الاصطناعي...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="اكتب سؤالك هنا (مثال: من عليه ديون؟، كم باقي على فلان؟، كم مجموع الديون؟)..."
              disabled={isLoading}
              className="flex-1 bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none transition-all disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <span>إرسال</span>
              <Send className="w-3.5 h-3.5 rotate-180" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

