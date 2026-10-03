import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Bot,
  User,
  RotateCcw,
  Copy,
  Check,
  Printer,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  Users,
  DollarSign,
  FileText,
  Mic,
  MicOff
} from "lucide-react";
import { askAccountingAssistantServer, AssistantResponse } from "../lib/cloudFunctions";
import { Customer, SystemSettings } from "../types";
import { useAuth } from "../contexts/AuthContext";

interface AIAssistantViewProps {
  customers: Customer[];
  settings: SystemSettings;
  onNavigateToLedger?: (customerId: string) => void;
  onOpenAuthModal?: () => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  matchedCustomer?: AssistantResponse["matchedCustomer"];
  aggregates?: AssistantResponse["aggregates"];
  isReport?: boolean;
  isError?: boolean;
}

const QUICK_PROMPTS = [
  { label: "أحمد شكد مطلوب؟", category: "customer" },
  { label: "منو أكثر شخص عليه ديون؟", category: "debtors" },
  { label: "شنو الديون اللي متأخرة؟", category: "overdue" },
  { label: "علي شكد دفع هذا الشهر؟", category: "payments" },
  { label: "لخصلي حساباتي.", category: "summary" },
  { label: "شنو مجموع الديون كلها؟", category: "summary" },
  { label: "منو سدد كامل حسابه؟", category: "settled" },
  { label: "سويلي تقرير عن الحسابات", category: "report" },
];

export default function AIAssistantView({
  customers,
  settings,
  onNavigateToLedger,
  onOpenAuthModal,
}: AIAssistantViewProps) {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: "welcome-msg",
        sender: "assistant",
        text: `أهلاً بك! أنا مساعدك المحاسبي الذكي.\n\nيمكنك أن تسألني أي سؤال عن ديونك، حسابات عملائك، الدفعات، والتقارير المالية باللغة العربية أو باللهجة العراقية اليومية (مثل: "أحمد شكد مطلوب؟"، "منو أكثر شخص عليه دين؟"، "لخصلي الديون").\n\nجميع الإجابات مستخرجة مباشرة ومحصورة في بياناتك المالية المحفوظة في التطبيق بدقة 100%.`,
        timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
      },
    ];
  });

  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputPrompt).trim();
    if (!prompt || isLoading) return;

    if (!currentUser) {
      const authRequiredMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: "assistant",
        text: "يجب تسجيل الدخول بحسابك السحابي لتتمكن من التحدث مع المساعد الذكي وقراءة ديونك وبياناتك المحاسبية بأمان.",
        timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
        isError: true,
      };
      setMessages((prev) => [...prev, authRequiredMsg]);
      onOpenAuthModal?.();
      return;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: prompt,
      timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt("");
    setIsLoading(true);

    try {
      const response = await askAccountingAssistantServer(prompt);

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: response.reply,
        timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
        matchedCustomer: response.matchedCustomer,
        aggregates: response.aggregates,
        isReport: response.isReport,
        isError: !response.success,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        text: "تعذر الاتصال بالمساعد الذكي حالياً. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.",
        timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrintReport = (msg: ChatMessage) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.print();
      return;
    }

    const title = settings.companyName || "دفتر الديون المحاسبي";
    const reportHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <title>تقرير محاسبي - ${title}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 30px; direction: rtl; color: #1e293b; }
            .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
            .title { font-size: 24px; font-weight: bold; color: #1e3a8a; }
            .subtitle { font-size: 14px; color: #64748b; margin-top: 5px; }
            .content { white-space: pre-wrap; font-size: 15px; line-height: 1.8; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${title}</div>
            <div class="subtitle">تقرير صادر عن المساعد الذكي - ${new Date().toLocaleDateString("ar-EG")}</div>
          </div>
          <div class="content">${msg.text}</div>
          <div class="footer">تم إنشاء هذا التقرير تلقائياً استناداً إلى القيود المحاسبية المسجلة في التطبيق.</div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(reportHtml);
    printWindow.document.close();
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "assistant",
        text: "تم مسح المحادثة. يمكنك الآن كتابة أي سؤال جديد أو استخدام الاقتراحات السريعة بالأسفل.",
        timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  // Optional Voice Input via Web Speech API
  const handleToggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("التعرف على الصوت غير مدعوم في هذا المتصفح.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "ar-IQ"; // Arabic (Iraq)
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] max-w-5xl mx-auto bg-slate-50 border border-slate-200 rounded-xl shadow-sm overflow-hidden no-print">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl text-white shadow-md">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 text-base">المساعد المحاسبي الذكي</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                Gemini AI
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>مؤمّن سحابياً عبر Cloud Functions (بدون كشف مفاتيح)</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            title="بدء محادثة جديدة"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">محادثة جديدة</span>
          </button>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                  isUser
                    ? "bg-slate-800 text-white"
                    : msg.isError
                    ? "bg-rose-600 text-white"
                    : "bg-blue-600 text-white"
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble Container */}
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-xs text-sm leading-relaxed ${
                  isUser
                    ? "bg-blue-600 text-white rounded-tr-none"
                    : msg.isError
                    ? "bg-rose-50 text-rose-900 border border-rose-200 rounded-tl-none"
                    : "bg-white text-slate-800 border border-slate-200 rounded-tl-none"
                }`}
              >
                {/* Text Content */}
                <div className="whitespace-pre-wrap font-sans space-y-2">
                  {msg.text}
                </div>

                {/* Matched Customer Fast Action Card */}
                {msg.matchedCustomer && onNavigateToLedger && (
                  <div className="mt-3 p-3 bg-blue-50/80 rounded-xl border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-blue-900">
                        العميل: {msg.matchedCustomer.name}
                      </span>
                      <div className="text-slate-600 mt-0.5">
                        المتبقي:{" "}
                        <span className="font-bold text-rose-600">
                          {Number(msg.matchedCustomer.remainingDebt).toLocaleString()} {settings.currency || "د.ع"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigateToLedger(msg.matchedCustomer!.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-xs text-xs"
                    >
                      <span>فتح سجل العميل</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Actions & Timestamp */}
                <div
                  className={`flex items-center justify-between gap-4 mt-2 pt-2 border-t text-[11px] ${
                    isUser
                      ? "border-blue-500/30 text-blue-100"
                      : "border-slate-100 text-slate-400"
                  }`}
                >
                  <span>{msg.timestamp}</span>

                  {!isUser && !msg.isError && (
                    <div className="flex items-center gap-2">
                      {msg.isReport && (
                        <button
                          onClick={() => handlePrintReport(msg)}
                          className="flex items-center gap-1 hover:text-blue-600 transition"
                          title="طباعة أو تصدير كـ PDF"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>طباعة PDF</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyText(msg.id, msg.text)}
                        className="flex items-center gap-1 hover:text-slate-700 transition"
                        title="نسخ النص"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600">تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3.5 shadow-xs flex items-center gap-2 text-slate-500 text-xs">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: "300ms" }} />
              <span className="mr-1">جاري قراءة البيانات الحسابية واستخراج الإجابة...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      <div className="px-4 py-2 bg-white/70 border-t border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-xs text-slate-400 shrink-0 font-medium flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
          <span>أسئلة شائعة:</span>
        </span>
        {QUICK_PROMPTS.map((qp, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(qp.label)}
            disabled={isLoading}
            className="shrink-0 text-xs px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-slate-700 rounded-full border border-slate-200 transition-all active:scale-95 disabled:opacity-50"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div className="p-3 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="اكتب سؤالك هنا... (مثال: أحمد شكد مطلوب؟، لخصلي حساباتي)"
              disabled={isLoading}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              dir="auto"
            />
            {/* Mic button */}
            <button
              type="button"
              onClick={handleToggleVoice}
              className={`absolute left-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition ${
                isListening ? "text-rose-600 bg-rose-50 animate-pulse" : "text-slate-400 hover:text-slate-600"
              }`}
              title={isListening ? "جاري الاستماع... اضغط للإيقاف" : "إدخال صوتي"}
            >
              {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={!inputPrompt.trim() || isLoading}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition shadow-xs disabled:cursor-not-allowed shrink-0"
          >
            <span>إرسال</span>
            <Send className="w-4 h-4 rotate-180" />
          </button>
        </form>
      </div>
    </div>
  );
}
