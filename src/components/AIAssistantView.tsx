import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
  Plus,
  Search,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Edit3,
  Check,
  X,
  Sliders,
  Copy,
  RotateCw,
  Square,
  FileDown,
  Printer,
  ChevronDown,
  ChevronRight,
  Menu,
  Clock,
  ArrowUpRight,
  ExternalLink,
  MessageSquare,
  AtSign,
  AlertCircle,
  Cpu,
} from "lucide-react";
import { Customer, Invoice, Payment, SystemSettings } from "../types";
import {
  ChatMessage,
  ChatConversation,
  AISettings,
  SUPPORTED_GEMINI_MODELS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_QUICK_QUESTIONS,
} from "../types/aiChat";
import {
  fetchUserConversations,
  persistConversation,
  removeConversation,
  fetchUserAISettings,
  persistAISettings,
} from "../lib/aiChatStorage";
import {
  askFinancialAssistantServer,
  FinancialAssistantResponse,
} from "../lib/cloudFunctions";
import { useAuth } from "../contexts/AuthContext";
import FormattedMessageContent from "./ai/FormattedMessageContent";
import AIChatSettingsModal from "./ai/AIChatSettingsModal";
import CustomerMentionDropdown from "./ai/CustomerMentionDropdown";
import { exportElementToPDF } from "../utils/printUtils";

interface AIAssistantViewProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
  onSelectCustomerForLedger?: (customerId: string) => void;
  setCurrentTab?: (tab: string) => void;
}

export default function AIAssistantView({
  customers,
  invoices,
  payments,
  settings,
  onSelectCustomerForLedger,
  setCurrentTab,
}: AIAssistantViewProps) {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;

  // AI & Appearance Settings
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Conversations State
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [conversationSearch, setConversationSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Inline Conversation Renaming
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingConvTitle, setEditingConvTitle] = useState("");

  // Chat Input & Flow State
  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");

  // Mention Autocomplete
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  // Abort controller ref for stop button
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Active Customer & Accounting Stats
  const activeCustomers = useMemo(() => customers.filter((c) => !c.isDeleted), [customers]);
  const activeInvoices = useMemo(() => invoices.filter((i) => !i.isDeleted), [invoices]);
  const activePayments = useMemo(() => payments.filter((p) => !p.isDeleted), [payments]);
  const currency = settings?.currency || "د.ع";

  // Pre-calculate overview numbers
  const totalInvoiced = useMemo(
    () => activeInvoices.reduce((acc, inv) => acc + (Number(inv.grandTotal) || 0), 0),
    [activeInvoices]
  );
  const totalPaidInvoices = useMemo(
    () => activeInvoices.reduce((acc, inv) => acc + (Number(inv.paidAmount) || 0), 0),
    [activeInvoices]
  );
  const totalSeparatePayments = useMemo(
    () => activePayments.reduce((acc, pay) => acc + (Number(pay.amount) || 0), 0),
    [activePayments]
  );
  const totalCollected = totalPaidInvoices + totalSeparatePayments;
  const totalRemaining = Math.max(
    0,
    activeInvoices.reduce((acc, inv) => acc + (Number(inv.remainingAmount) || 0), 0) - totalSeparatePayments
  );

  // Load Settings & Conversations on Mount or user change
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const userSettings = await fetchUserAISettings(userId);
      if (isMounted) {
        setAiSettings(userSettings);
      }

      const userConvs = await fetchUserConversations(userId);
      if (isMounted) {
        if (userConvs.length > 0) {
          setConversations(userConvs);
          setActiveConversationId(userConvs[0].id);
        } else {
          // Initialize first welcome conversation
          const initialConv = createNewConversationRecord();
          setConversations([initialConv]);
          setActiveConversationId(initialConv.id);
          persistConversation(initialConv, userId);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  // Create standard new conversation record
  const createNewConversationRecord = (): ChatConversation => {
    const newId = `conv_${Date.now()}`;
    const initialMessage: ChatMessage = {
      id: `welcome_${Date.now()}`,
      sender: "ai",
      text: `أهلاً بك! أنا **مساعدك المحاسبي والمالي الذكي** 🤖✨

أنا مرتبط مباشرة ببيانات دفتر ديونك الحقيقية، ويمكنني مساعدتك في:
- **معرفة من عليه ديون متبقية ومقدار المبالغ**
- **كشف حساب فوري لأي عميل** (اكتب @ لاختيار العميل)
- **إجمالي الديون ونسب التحصيل والمقبوضات**
- **تنبيهات العملاء المتأخرين عن السداد**
- **تصدير كشوفات وتقارير PDF جاهزة**

اختر أحد الأسئلة المقترحة أو اكتب استفسارك بلغتك المعتادة!`,
      timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
      source: "client_fallback",
      modelUsed: aiSettings.selectedModel,
    };

    return {
      id: newId,
      userId,
      title: "محادثة محاسبية جديدة",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPinned: false,
      isArchived: false,
      messages: [initialMessage],
      modelId: aiSettings.selectedModel,
    };
  };

  // Current active conversation
  const activeConversation = useMemo(() => {
    return (
      conversations.find((c) => c.id === activeConversationId) ||
      conversations[0] ||
      null
    );
  }, [conversations, activeConversationId]);

  // Messages in active conversation
  const messages = useMemo(() => {
    return activeConversation?.messages || [];
  }, [activeConversation]);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Save Settings handler
  const handleSaveSettings = async (newSettings: AISettings) => {
    setAiSettings(newSettings);
    await persistAISettings(newSettings, userId);
  };

  // Create New Chat Button
  const handleCreateNewChat = () => {
    const newConv = createNewConversationRecord();
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    persistConversation(newConv, userId);
    setIsSidebarOpen(false);
  };

  // Delete Conversation
  const handleDeleteConversation = async (convId: string) => {
    if (conversations.length <= 1) {
      // If deleting the only conversation, reset it to new
      const resetConv = createNewConversationRecord();
      setConversations([resetConv]);
      setActiveConversationId(resetConv.id);
      await removeConversation(convId, userId);
      await persistConversation(resetConv, userId);
      return;
    }

    const nextConversations = conversations.filter((c) => c.id !== convId);
    setConversations(nextConversations);
    if (activeConversationId === convId) {
      setActiveConversationId(nextConversations[0]?.id || "");
    }
    await removeConversation(convId, userId);
  };

  // Pin/Unpin Conversation
  const handleTogglePin = (convId: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === convId) {
          const updated = { ...c, isPinned: !c.isPinned, updatedAt: new Date().toISOString() };
          persistConversation(updated, userId);
          return updated;
        }
        return c;
      })
    );
  };

  // Archive/Unarchive Conversation
  const handleToggleArchive = (convId: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === convId) {
          const updated = { ...c, isArchived: !c.isArchived, updatedAt: new Date().toISOString() };
          persistConversation(updated, userId);
          return updated;
        }
        return c;
      })
    );
  };

  // Rename Conversation
  const handleSaveRename = (convId: string) => {
    const trimmed = editingConvTitle.trim();
    if (!trimmed) {
      setEditingConvId(null);
      return;
    }
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === convId) {
          const updated = { ...c, title: trimmed, updatedAt: new Date().toISOString() };
          persistConversation(updated, userId);
          return updated;
        }
        return c;
      })
    );
    setEditingConvId(null);
    setEditingConvTitle("");
  };

  // Handle Input Change and Mention Trigger
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputQuery(val);

    // Check if user is typing a mention @
    const cursor = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");

    if (lastAtIdx !== -1 && (lastAtIdx === 0 || /\s/.test(textBeforeCursor[lastAtIdx - 1]))) {
      const q = textBeforeCursor.slice(lastAtIdx + 1);
      if (!q.includes(" ") && q.length < 25) {
        setMentionQuery(q);
        setShowMentionDropdown(true);
        return;
      }
    }
    setShowMentionDropdown(false);
  };

  // Select Customer from mention dropdown
  const handleSelectMentionCustomer = (customer: Customer) => {
    if (!inputRef.current) return;
    const val = inputQuery;
    const cursor = inputRef.current.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const textAfterCursor = val.slice(cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");

    let newText = "";
    if (lastAtIdx !== -1) {
      newText = textBeforeCursor.slice(0, lastAtIdx) + `@${customer.name} ` + textAfterCursor;
    } else {
      newText = val + ` @${customer.name} `;
    }

    setInputQuery(newText);
    setShowMentionDropdown(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Send Question / Message
  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isLoading || !activeConversation) return;

    setShowMentionDropdown(false);

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
    };

    // Auto title for conversation if it's the first user question
    let newTitle = activeConversation.title;
    if (activeConversation.title === "محادثة محاسبية جديدة" || activeConversation.messages.length <= 1) {
      newTitle = textToSend.slice(0, 32) + (textToSend.length > 32 ? "..." : "");
    }

    const updatedMessages = [...activeConversation.messages, userMsg];
    const updatedConversation: ChatConversation = {
      ...activeConversation,
      title: newTitle,
      messages: updatedMessages,
      updatedAt: new Date().toISOString(),
      modelId: aiSettings.selectedModel,
    };

    // Update state immediately
    setConversations((prev) =>
      prev.map((c) => (c.id === updatedConversation.id ? updatedConversation : c))
    );
    setInputQuery("");
    setIsLoading(true);

    // Abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response: FinancialAssistantResponse = await askFinancialAssistantServer(textToSend, {
        model: aiSettings.selectedModel,
        customInstructions: aiSettings.customInstructions,
        conversationHistory: updatedMessages.slice(-8).map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
        localData: {
          customers: activeCustomers,
          invoices: activeInvoices,
          payments: activePayments,
          settings,
        },
        abortSignal: controller.signal,
      });

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: "ai",
        text: response.answer,
        timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
        source: response.source,
        modelUsed: response.modelUsed || aiSettings.selectedModel,
        latencyMs: response.latencyMs,
      };

      const finalConversation: ChatConversation = {
        ...updatedConversation,
        messages: [...updatedMessages, aiMsg],
        updatedAt: new Date().toISOString(),
      };

      setConversations((prev) =>
        prev.map((c) => (c.id === finalConversation.id ? finalConversation : c))
      );
      persistConversation(finalConversation, userId);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        const abortedMsg: ChatMessage = {
          id: `abort_${Date.now()}`,
          sender: "ai",
          text: "⏹ تم إيقاف توليد الإجابة بناءً على طلبك.",
          timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
          source: "client_fallback",
        };
        const finalConversation: ChatConversation = {
          ...updatedConversation,
          messages: [...updatedMessages, abortedMsg],
        };
        setConversations((prev) =>
          prev.map((c) => (c.id === finalConversation.id ? finalConversation : c))
        );
        persistConversation(finalConversation, userId);
      } else {
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          sender: "ai",
          text: `⚠️ **حدث خطأ أثناء معالجة السؤال:**\n${err?.message || "تعذر الاتصال بالخادم."}\n\nيمكنك الضغط على زر "إعادة المحاولة" أدناه.`,
          timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
          isError: true,
          source: "client_fallback",
        };
        const finalConversation: ChatConversation = {
          ...updatedConversation,
          messages: [...updatedMessages, errorMsg],
        };
        setConversations((prev) =>
          prev.map((c) => (c.id === finalConversation.id ? finalConversation : c))
        );
        persistConversation(finalConversation, userId);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Stop Generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Regenerate last AI response
  const handleRegenerate = async () => {
    if (!activeConversation || isLoading) return;
    const msgs = activeConversation.messages;
    if (msgs.length < 2) return;

    // Find the last user message
    let lastUserMsg: ChatMessage | null = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].sender === "user") {
        lastUserMsg = msgs[i];
        break;
      }
    }

    if (lastUserMsg) {
      // Remove last AI response if it followed the user message
      const filteredMsgs = msgs.slice(0, msgs.length - 1);
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversation.id ? { ...c, messages: filteredMsgs } : c))
      );
      handleSendMessage(lastUserMsg.text);
    }
  };

  // Retry when error occurs
  const handleRetry = (userQuestionText: string) => {
    handleSendMessage(userQuestionText);
  };

  // Copy text helper
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Edit Message
  const handleStartEditMessage = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditingMessageText(msg.text);
  };

  const handleSaveEditedMessage = (msgId: string) => {
    const text = editingMessageText.trim();
    if (!text || !activeConversation) return;

    // Remove subsequent messages and resend
    const msgIdx = activeConversation.messages.findIndex((m) => m.id === msgId);
    if (msgIdx !== -1) {
      const truncated = activeConversation.messages.slice(0, msgIdx);
      const updatedConv = { ...activeConversation, messages: truncated };
      setConversations((prev) =>
        prev.map((c) => (c.id === updatedConv.id ? updatedConv : c))
      );
      setEditingMessageId(null);
      setEditingMessageText("");
      handleSendMessage(text);
    }
  };

  // Export current conversation as PDF
  const handleExportPDF = async () => {
    if (!chatContainerRef.current) return;
    try {
      await exportElementToPDF(chatContainerRef.current, {
        filename: `تقرير_المساعد_الذكي_${activeConversation?.title || "محادثة"}`,
        title: `تقرير المساعد الذكي - ${activeConversation?.title || "دفتر الديون"}`,
      });
    } catch (err) {
      console.error("PDF export failed:", err);
    }
  };

  // Export all conversations JSON
  const handleExportAllJSON = () => {
    const jsonStr = JSON.stringify(conversations, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `سجل_محادثات_الذكاء_الاصطناعي_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Clear all conversations
  const handleClearAllConversations = async () => {
    for (const c of conversations) {
      await removeConversation(c.id, userId);
    }
    const fresh = createNewConversationRecord();
    setConversations([fresh]);
    setActiveConversationId(fresh.id);
    await persistConversation(fresh, userId);
  };

  // Filter conversations for sidebar
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (!showArchived && c.isArchived) return false;
      if (showArchived && !c.isArchived) return false;
      if (!conversationSearch.trim()) return true;
      const q = conversationSearch.toLowerCase();
      const titleMatch = c.title.toLowerCase().includes(q);
      const msgMatch = c.messages.some((m) => m.text.toLowerCase().includes(q));
      return titleMatch || msgMatch;
    });
  }, [conversations, showArchived, conversationSearch]);

  const pinnedConversations = useMemo(
    () => filteredConversations.filter((c) => c.isPinned),
    [filteredConversations]
  );
  const otherConversations = useMemo(
    () => filteredConversations.filter((c) => !c.isPinned),
    [filteredConversations]
  );

  // Model info for header badge
  const currentModelInfo = useMemo(() => {
    return (
      SUPPORTED_GEMINI_MODELS.find((m) => m.id === aiSettings.selectedModel) ||
      SUPPORTED_GEMINI_MODELS[0]
    );
  }, [aiSettings.selectedModel]);

  // Styling helpers based on settings
  const fontStyle = {
    fontFamily: aiSettings.fontFamily,
  };

  const fontSizeClass = {
    sm: "text-xs sm:text-sm",
    md: "text-sm sm:text-base",
    lg: "text-base sm:text-lg",
    xl: "text-lg sm:text-xl",
  }[aiSettings.fontSize];

  return (
    <div
      style={fontStyle}
      className="flex h-[calc(100vh-4rem)] max-w-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden relative"
    >
      {/* =========================================================================
          1. CONVERSATION HISTORY SIDEBAR / DRAWER
      ========================================================================= */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 sm:relative flex flex-col bg-white dark:bg-slate-900 transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
          isSidebarOpen
            ? "w-72 sm:w-80 min-w-[18rem] sm:min-w-[20rem] max-w-[20rem] translate-x-0 opacity-100 visible border-l border-slate-200 dark:border-slate-800 shadow-xl sm:shadow-none"
            : "w-0 min-w-0 max-w-0 translate-x-full sm:translate-x-0 opacity-0 invisible pointer-events-none border-0 p-0 m-0"
        }`}
        style={{
          width: isSidebarOpen ? undefined : 0,
          minWidth: isSidebarOpen ? undefined : 0,
          maxWidth: isSidebarOpen ? undefined : 0,
          opacity: isSidebarOpen ? 1 : 0,
          visibility: isSidebarOpen ? "visible" : "hidden",
          borderWidth: isSidebarOpen ? undefined : 0,
          pointerEvents: isSidebarOpen ? "auto" : "none",
        }}
      >
        <div className="w-72 sm:w-80 h-full flex flex-col shrink-0 min-w-[18rem] sm:min-w-[20rem]">
          {/* Sidebar Header */}
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  سجل المحادثات
                </div>
                <div className="text-[10px] text-slate-500">
                  {conversations.length} محادثة محفوظة
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCreateNewChat}
                title="بدء محادثة جديدة"
                className="p-1.5 px-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors flex items-center gap-1 text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>جديدة</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                title="طي وإخفاء سجل المحادثات"
                className="p-1.5 px-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
              >
                <ChevronRight className="w-4 h-4" />
                <span className="text-[11px]">طي السجل</span>
              </button>
            </div>
          </div>

          {/* Search bar inside sidebar */}
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800/80">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={conversationSearch}
                onChange={(e) => setConversationSearch(e.target.value)}
                placeholder="بحث في المحادثات..."
                className="w-full pr-8 pl-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Archive toggle */}
          <div className="px-3 py-1.5 flex items-center justify-between text-xs text-slate-500 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
            <span>{showArchived ? "المحادثات المؤرشفة" : "المحادثات النشطة"}</span>
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 text-[11px]"
            >
              {showArchived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
              <span>{showArchived ? "عرض النشطة" : "عرض المؤرشفة"}</span>
            </button>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                لا توجد محادثات تطابق البحث
              </div>
            ) : (
              <>
                {/* Pinned Section */}
                {pinnedConversations.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-[11px] font-bold text-slate-400 flex items-center gap-1">
                      <Pin className="w-3 h-3 text-amber-500" />
                      <span>المثبتة في الأعلى</span>
                    </div>
                    {pinnedConversations.map((conv) => renderConversationItem(conv))}
                  </div>
                )}

                {/* Other Section */}
                {otherConversations.length > 0 && (
                  <div>
                    {pinnedConversations.length > 0 && (
                      <div className="px-2 py-1 text-[11px] font-bold text-slate-400">
                        باقي المحادثات
                      </div>
                    )}
                    {otherConversations.map((conv) => renderConversationItem(conv))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sidebar Footer Stats & Settings shortcut */}
          <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              <span>إعدادات الدردشة</span>
            </button>

            <div className="text-[11px] text-slate-400 font-mono">
              {currentModelInfo.name}
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile sidebar */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* =========================================================================
          2. MAIN CHAT CONTAINER
      ========================================================================= */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-slate-50/50 dark:bg-slate-950">
        {/* Top Chat Header */}
        <header className="px-3 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 shadow-xs shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Toggle Conversation History Sidebar Button - Click to collapse, click to open on ALL devices */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className={`p-1.5 sm:px-3 sm:py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all shadow-xs cursor-pointer ${
                isSidebarOpen
                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
                  : "border-blue-500 bg-blue-600 text-white hover:bg-blue-700 shadow-sm animate-pulse-subtle"
              }`}
              title={isSidebarOpen ? "طي وإخفاء سجل المحادثات (ضغطة للطي)" : "فتح وإظهار سجل المحادثات (ضغطة للفتح)"}
            >
              <Menu className="w-4 h-4" />
              <span>{isSidebarOpen ? "طي السجل" : "سجل المحادثات"}</span>
            </button>

            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate flex items-center gap-2">
                <span>{activeConversation?.title || "محادثة محاسبية"}</span>
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold">
                  <Sparkles className="w-3 h-3" />
                  <span>{currentModelInfo.name}</span>
                </span>
                <span>•</span>
                <span>الديون المتبقية: <strong>{totalRemaining.toLocaleString()} {currency}</strong></span>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleExportPDF}
              title="تصدير كشف المحادثة كملف PDF"
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 transition-colors flex items-center gap-1 text-xs font-semibold"
            >
              <FileDown className="w-4 h-4 text-rose-500" />
              <span className="hidden md:inline">تصدير PDF</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              title="إعدادات المظهر والنماذج"
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 transition-colors flex items-center gap-1 text-xs font-semibold"
            >
              <Sliders className="w-4 h-4 text-blue-600" />
              <span className="hidden md:inline">الإعدادات</span>
            </button>

            <button
              type="button"
              onClick={handleCreateNewChat}
              title="محادثة جديدة"
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>محادثة جديدة</span>
            </button>
          </div>
        </header>

        {/* Messages Scroll Area */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4"
        >
          {/* Financial Fast-Facts Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 shadow-xs">
              <div className="text-[10px] text-slate-500 font-bold">إجمالي الديون المسجلة</div>
              <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5">
                {totalInvoiced.toLocaleString()} {currency}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 shadow-xs">
              <div className="text-[10px] text-slate-500 font-bold">المقبوضات والواصل</div>
              <div className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {totalCollected.toLocaleString()} {currency}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 shadow-xs">
              <div className="text-[10px] text-slate-500 font-bold">صافي الديون المتبقية</div>
              <div className="text-xs sm:text-sm font-black text-red-600 dark:text-red-400 mt-0.5">
                {totalRemaining.toLocaleString()} {currency}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 shadow-xs">
              <div className="text-[10px] text-slate-500 font-bold">العملاء والمدينين</div>
              <div className="text-xs sm:text-sm font-black text-blue-600 dark:text-blue-400 mt-0.5">
                {activeCustomers.length} عميل
              </div>
            </div>
          </div>

          {/* Render Chat Messages */}
          {messages.map((msg, index) => {
            const isUser = msg.sender === "user";
            const isLastMessage = index === messages.length - 1;

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 sm:gap-3.5 ${isUser ? "flex-row-reverse" : "flex-row"} items-start group`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                    isUser
                      ? "bg-slate-800 dark:bg-slate-700 text-white"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div className={`max-w-[85%] sm:max-w-[78%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                  <div
                    className={`p-3.5 sm:p-4 shadow-xs ${aiSettings.bubbleShape} ${
                      isUser
                        ? "bg-blue-600 text-white rounded-br-xs"
                        : msg.isError
                        ? "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-100 rounded-bl-xs"
                        : "bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 rounded-bl-xs"
                    }`}
                  >
                    {/* User Edit Mode */}
                    {isUser && editingMessageId === msg.id ? (
                      <div className="space-y-2 min-w-[240px]">
                        <textarea
                          value={editingMessageText}
                          onChange={(e) => setEditingMessageText(e.target.value)}
                          className="w-full p-2 text-xs text-slate-900 bg-white rounded-lg border border-slate-300"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingMessageId(null)}
                            className="px-2 py-1 text-xs bg-slate-700 text-white rounded"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEditedMessage(msg.id)}
                            className="px-2 py-1 text-xs bg-emerald-600 text-white font-bold rounded"
                          >
                            إعادة الإرسال
                          </button>
                        </div>
                      </div>
                    ) : isUser ? (
                      <p className={`whitespace-pre-wrap leading-relaxed ${fontSizeClass}`}>{msg.text}</p>
                    ) : (
                      <div className={fontSizeClass}>
                        <FormattedMessageContent
                          content={msg.text}
                          customers={activeCustomers}
                          onSelectCustomerForLedger={onSelectCustomerForLedger}
                        />
                      </div>
                    )}
                  </div>

                  {/* Message Meta Info & Action Buttons */}
                  <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-slate-400">
                    <span>{msg.timestamp}</span>

                    {!isUser && msg.modelUsed && (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        <Cpu className="w-2.5 h-2.5" />
                        <span>{msg.modelUsed}</span>
                        {msg.latencyMs && <span>({(msg.latencyMs / 1000).toFixed(1)}s)</span>}
                      </span>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        title="نسخ الرسالة"
                        className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>

                      {isUser && (
                        <button
                          type="button"
                          onClick={() => handleStartEditMessage(msg)}
                          title="تعديل السؤال"
                          className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      )}

                      {!isUser && isLastMessage && (
                        <button
                          type="button"
                          onClick={handleRegenerate}
                          title="إعادة التوليد"
                          disabled={isLoading}
                          className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                        >
                          <RotateCw className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {msg.isError && (
                      <button
                        type="button"
                        onClick={() => handleRetry(msg.text)}
                        className="text-xs text-red-600 hover:underline font-bold mr-1"
                      >
                        إعادة المحاولة
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator while generating */}
          {isLoading && (
            <div className="flex gap-3 items-start animate-in fade-in duration-200">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Bot className="w-4 h-4 animate-bounce" />
              </div>

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3.5 rounded-2xl rounded-bl-xs shadow-xs space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                  <span>المساعد يفحص السجلات ويحلل البيانات بنموذج <strong>{aiSettings.selectedModel}</strong>...</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions Suggestions Carousel */}
        <div className="px-3 sm:px-5 py-2 border-t border-slate-200/70 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xs flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
            <HelpCircle className="w-3 h-3 text-blue-500" />
            <span>أسئلة سريعة:</span>
          </span>
          {aiSettings.quickQuestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(q)}
              disabled={isLoading}
              className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200/60 dark:border-slate-700 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {/* =========================================================================
            3. CHAT INPUT BAR & MENTION POPUP
        ========================================================================= */}
        <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 relative shrink-0">
          {/* Debtor Mention Autocomplete Dropdown */}
          {showMentionDropdown && (
            <CustomerMentionDropdown
              query={mentionQuery}
              customers={activeCustomers}
              invoices={activeInvoices}
              payments={activePayments}
              currency={currency}
              onSelectCustomer={handleSelectMentionCustomer}
              onClose={() => setShowMentionDropdown(false)}
            />
          )}

          <div className="relative flex items-end gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
            {/* Mention button */}
            <button
              type="button"
              onClick={() => {
                setShowMentionDropdown((prev) => !prev);
                setMentionQuery("");
              }}
              title="الإشارة لعميل (@)"
              className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <AtSign className="w-4 h-4" />
            </button>

            {/* Input Textarea */}
            <textarea
              ref={inputRef}
              value={inputQuery}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="اكتب استفسارك هنا... (أو اكتب @ لاختيار عميل محدد)"
              rows={1}
              className="flex-1 max-h-32 min-h-[38px] py-2 px-1 text-sm bg-transparent border-0 focus:outline-hidden text-slate-900 dark:text-white placeholder:text-slate-400 resize-none leading-relaxed"
            />

            {/* Stop or Send Action Button */}
            {isLoading ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                title="إيقاف التوليد"
                className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition-colors shrink-0 shadow-xs flex items-center justify-center cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputQuery.trim()}
                title="إرسال (Enter)"
                className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all disabled:opacity-40 disabled:hover:bg-blue-600 shrink-0 shadow-xs flex items-center justify-center cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Floating Quick-Open Handle when sidebar is collapsed */}
        {!isSidebarOpen && (
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            title="فتح سجل المحادثات (ضغطة للفتح)"
            className="fixed top-28 right-0 z-30 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-2 px-2.5 rounded-l-xl shadow-lg border-y border-l border-blue-400 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer group animate-in fade-in slide-in-from-right-4 duration-200"
          >
            <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[11px] font-bold">سجل المحادثات</span>
          </button>
        )}
      </main>

      {/* =========================================================================
          4. SETTINGS MODAL
      ========================================================================= */}
      <AIChatSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={aiSettings}
        onSaveSettings={handleSaveSettings}
        totalConversationsCount={conversations.length}
        totalMessagesCount={conversations.reduce((acc, c) => acc + c.messages.length, 0)}
        onExportAllConversations={handleExportAllJSON}
        onClearAllConversations={handleClearAllConversations}
      />
    </div>
  );

  /**
   * Helper to render conversation list item in the sidebar
   */
  function renderConversationItem(conv: ChatConversation) {
    const isActive = conv.id === activeConversationId;
    const isEditing = editingConvId === conv.id;

    return (
      <div
        key={conv.id}
        onClick={() => {
          if (!isEditing) {
            setActiveConversationId(conv.id);
            setIsSidebarOpen(false);
          }
        }}
        className={`group p-2.5 rounded-xl border text-right transition-all flex items-center justify-between gap-2 cursor-pointer ${
          isActive
            ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 shadow-xs"
            : "border-transparent hover:border-slate-200 dark:hover:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`} />

          {isEditing ? (
            <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editingConvTitle}
                onChange={(e) => setEditingConvTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveRename(conv.id)}
                className="w-full text-xs px-1.5 py-0.5 rounded border border-blue-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                autoFocus
              />
              <button
                type="button"
                onClick={() => handleSaveRename(conv.id)}
                className="p-1 text-emerald-600"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold truncate">
                {conv.title}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <span>{conv.messages.length} رسالة</span>
                {conv.isPinned && <Pin className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />}
                {conv.isArchived && <Archive className="w-2.5 h-2.5 text-slate-400" />}
              </div>
            </div>
          )}
        </div>

        {/* Quick actions on conversation */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePin(conv.id);
              }}
              title={conv.isPinned ? "إلغاء التثبيت" : "تثبيت في الأعلى"}
              className="p-1 rounded text-slate-400 hover:text-amber-500"
            >
              {conv.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingConvId(conv.id);
                setEditingConvTitle(conv.title);
              }}
              title="إعادة تسمية"
              className="p-1 rounded text-slate-400 hover:text-blue-600"
            >
              <Edit3 className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleArchive(conv.id);
              }}
              title={conv.isArchived ? "إلغاء الأرشفة" : "أرشفة المحادثة"}
              className="p-1 rounded text-slate-400 hover:text-slate-700"
            >
              {conv.isArchived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("هل أنت متأكد من حذف هذه المحادثة؟")) {
                  handleDeleteConversation(conv.id);
                }
              }}
              title="حذف المحادثة"
              className="p-1 rounded text-slate-400 hover:text-red-600"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }
}
