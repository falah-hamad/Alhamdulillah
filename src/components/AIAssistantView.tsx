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
  Share2,
  ThumbsUp,
  ThumbsDown,
  Quote,
  Reply,
  MoreVertical,
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
  const [replyContext, setReplyContext] = useState<{ id: string; text: string; sender: "user" | "ai"; mode: "quote" | "reply" } | null>(null);
  const [notice, setNotice] = useState("");
  const [messageFontSize, setMessageFontSize] = useState(16);
  const [chatStyle, setChatStyle] = useState<"classic" | "soft" | "midnight" | "mint">("classic");

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
      text: `أهلاً بك! أنا **مساعدك المحاسبي ومساعد البضاعة الذكي** 🤖✨

أقدر أبحث في بيانات حسابك الحقيقية، وأساعدك في:
- **الديون والعملاء والدفعات والفواتير**
- **البحث عن صنف بالاسم أو التصنيف أو المجهّز**
- **معرفة الكميات المتوفرة والأصناف الناقصة أو النافدة**
- **حساب قيمة المخزون بسعر الشراء والبيع والربح المحتمل**
- **مراجعة سجل أسعار الشراء والبيع وحركات المخزون**
- **مقارنة البضاعة حسب التصنيفات**
- **تصدير كشوفات وتقارير PDF جاهزة**

مثلاً اسألني: «شنو البضاعة اللي قربت تخلص؟» أو «ابحث عن الشاي» أو «كم قيمة المخزون بسعر الشراء؟». أستخدم السجلات المحفوظة بحسابك ولا أخمّن البيانات غير الموجودة.`,
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
      if (q.length < 80 && !/[\n\r]/.test(q)) {
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
    const contextForSend = queryText ? null : replyContext;
    const requestText = contextForSend
      ? `السياق المرتبط برسالتك الحالية (اقرأه كمرجع للسؤال وليس كسؤال مستقل):\n${contextForSend.mode === "quote" ? "النص المقتبس" : "الرسالة التي يريد المستخدم الرد عليها"} من ${contextForSend.sender === "ai" ? "المساعد" : "المستخدم"}: «${contextForSend.text}»\n\nسؤال/تعليق المستخدم: ${textToSend}`
      : textToSend;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
      ...(contextForSend ? {
        quotedText: contextForSend.text,
        replyToMessageId: contextForSend.id,
        replyToSender: contextForSend.sender,
        replyMode: contextForSend.mode,
      } : {}),
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
    setReplyContext(null);
    setIsLoading(true);

    // Abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response: FinancialAssistantResponse = await askFinancialAssistantServer(requestText, {
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

  // Copy text helper with a fallback for browsers/webviews without Clipboard API.
  const handleCopy = async (id: string, text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const temporary = document.createElement("textarea");
        temporary.value = text;
        temporary.style.position = "fixed";
        temporary.style.opacity = "0";
        document.body.appendChild(temporary);
        temporary.select();
        const copied = document.execCommand("copy");
        temporary.remove();
        if (!copied) throw new Error("تعذر النسخ");
      }
      setCopiedMsgId(id);
      setNotice("تم نسخ النص");
    } catch {
      setNotice("تعذر النسخ تلقائياً؛ حدّد النص وانسخه يدوياً");
    }
    window.setTimeout(() => { setCopiedMsgId(null); setNotice(""); }, 2200);
  };

  const createSingleMessagePrintNode = (msg: ChatMessage): HTMLDivElement => {
    const source = document.querySelector<HTMLElement>(`[data-message-card="${CSS.escape(msg.id)}"]`);
    if (!source) throw new Error("تعذر العثور على بطاقة الرسالة");
    const printable = document.createElement("div");
    printable.dir = "rtl";
    printable.lang = "ar";
    printable.className = "message-export-root";
    printable.style.cssText = "width:100%;max-width:100%;margin:0 auto;padding:18px;background:#fff;color:#0f172a;direction:rtl;text-align:right;font-family:Cairo,'Noto Sans Arabic',Arial,sans-serif;line-height:1.8;box-sizing:border-box";
    const heading = document.createElement("div");
    heading.style.cssText = "display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b";
    const sender = document.createElement("strong");
    sender.textContent = msg.sender === "ai" ? "مساعد الحمدلله" : "رسالتك";
    const time = document.createElement("span");
    time.textContent = msg.timestamp;
    heading.append(sender, time);
    const card = source.cloneNode(true) as HTMLElement;
    card.querySelectorAll("button, .no-print, [data-no-print='true']").forEach((node) => node.remove());
    card.style.width = "100%";
    card.style.maxWidth = "100%";
    card.style.margin = "0";
    card.style.boxSizing = "border-box";
    printable.append(heading, card);
    return printable;
  };

  const handleExportSingleMessagePDF = async (msg: ChatMessage) => {
    let printable: HTMLDivElement | null = null;
    try {
      printable = createSingleMessagePrintNode(msg);
      document.body.appendChild(printable);
      printable.style.position = "fixed";
      printable.style.left = "-10000px";
      printable.style.top = "0";
      await exportElementToPDF(printable, { filename: `رسالة_${msg.id}`, title: `رسالة من مساعد الحمدلله - ${msg.sender === "ai" ? "المساعد" : "أنت"}` });
      setNotice("تم تصدير الرسالة المحددة إلى PDF");
    } catch (error) {
      console.error("Message PDF export failed:", error);
      setNotice("تعذر إنشاء PDF لهذه الرسالة");
    } finally {
      printable?.remove();
      window.setTimeout(() => setNotice(""), 2200);
    }
  };

  const handlePrintSingleMessage = async (msg: ChatMessage) => {
    let printable: HTMLDivElement | null = null;
    try {
      printable = createSingleMessagePrintNode(msg);
      printable.style.position = "fixed";
      printable.style.left = "-10000px";
      printable.style.top = "0";
      document.body.appendChild(printable);
      const { printElement } = await import("../utils/printUtils");
      await printElement(printable, { title: `رسالة من مساعد الحمدلله - ${msg.sender === "ai" ? "المساعد" : "أنت"}` });
    } catch (error) {
      console.error("Message print failed:", error);
      setNotice("تعذرت طباعة هذه الرسالة");
      window.setTimeout(() => setNotice(""), 2200);
    } finally {
      printable?.remove();
    }
  };
  const handleShareMessage = async (text: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "رسالة من مساعد الحمدلله", text });
      } else {
        await handleCopy("share", text);
        setNotice("المشاركة غير مدعومة هنا؛ تم نسخ النص لتتمكن من مشاركته");
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        await handleCopy("share", text);
      }
    }
  };

  const handleSetReplyContext = (msg: ChatMessage, mode: "quote" | "reply") => {
    const selection = window.getSelection()?.toString().trim();
    const chosenText = mode === "quote" && selection ? selection : msg.text;
    setReplyContext({ id: msg.id, text: chosenText.slice(0, 4000), sender: msg.sender, mode });
    setNotice(mode === "quote" ? "تم تجهيز الاقتباس" : "تم تفعيل الرد على الرسالة");
    inputRef.current?.focus();
    window.setTimeout(() => setNotice(""), 1800);
  };

  const handleRateMessage = (msgId: string, rating: "like" | "dislike") => {
    if (!activeConversation) return;
    const existing = activeConversation.messages.find((m) => m.id === msgId);
    const nextRating = existing?.rating === rating ? undefined : rating;
    const updatedMessages = activeConversation.messages.map((m) =>
      m.id === msgId ? { ...m, rating: nextRating } : m
    );
    const updatedConversation = { ...activeConversation, messages: updatedMessages, updatedAt: new Date().toISOString() };
    setConversations((prev) => prev.map((c) => c.id === updatedConversation.id ? updatedConversation : c));
    void persistConversation(updatedConversation, userId);
    setNotice(nextRating ? "تم حفظ تقييمك" : "تم إلغاء التقييم");
    window.setTimeout(() => setNotice(""), 1800);
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
  const handleExportAllJSON = async () => {
    const jsonStr = JSON.stringify(conversations, null, 2);
    const fileName = `سجل_محادثات_الذكاء_الاصطناعي_${new Date().toISOString().split("T")[0]}.json`;

    try {
      const { isNativeAndroid, saveNativeJsonFile } = await import("../lib/native");
      if (isNativeAndroid()) {
        const savedName = await saveNativeJsonFile(fileName, jsonStr);
        setNotice(`تم حفظ ملف المحادثات باسم ${savedName || fileName}.`);
        return;
      }

      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Conversation export failed:", error);
      setNotice("تعذر حفظ ملف المحادثات. حاول مرة أخرى.");
    }
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
      className="flex h-[calc(100dvh-4rem)] min-h-0 w-full min-w-0 max-w-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden relative"
    >
      {/* =========================================================================
          1. CONVERSATION HISTORY SIDEBAR / DRAWER
      ========================================================================= */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex flex-col bg-white dark:bg-slate-900 transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
          isSidebarOpen
            ? "w-[min(18rem,calc(100vw-1rem))] sm:w-80 min-w-0 sm:min-w-[20rem] max-w-[20rem] translate-x-0 opacity-100 visible border-l border-slate-200 dark:border-slate-800 shadow-xl sm:shadow-none"
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
        <div className="w-[min(18rem,calc(100vw-1rem))] sm:w-80 h-full flex flex-col shrink-0 min-w-0 sm:min-w-[20rem]">
          {/* Sidebar Header */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
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
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* =========================================================================
          2. MAIN CHAT CONTAINER
      ========================================================================= */}
      <main className="flex-1 flex flex-col h-full min-w-0 w-full bg-slate-50/50 dark:bg-slate-950">
        {/* Top Chat Header */}
        <header className="px-2 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 shadow-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-0.5 min-w-0">
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
          <div className="flex items-center gap-1 shrink-0">
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
              className="px-2 sm:px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">محادثة جديدة</span>
            </button>
          </div>
        </header>

        {/* Messages Scroll Area */}
        <div
          ref={chatContainerRef}
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-5 space-y-4"
        >
          {/* Financial Fast-Facts Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 min-w-0">
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
                    data-message-card={msg.id}
                    className={`p-3.5 sm:p-4 shadow-xs ${aiSettings.bubbleShape} ${
                      chatStyle === "soft" ? "ring-1 ring-violet-200 dark:ring-violet-900 shadow-md" : chatStyle === "midnight" ? (isUser ? "bg-slate-700 text-white border border-slate-600" : "bg-slate-900 text-slate-100 border border-slate-700") : chatStyle === "mint" ? (isUser ? "bg-emerald-600 text-white border border-emerald-500" : "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-emerald-50") : ""
                    } ${
                      isUser
                        ? "bg-blue-600 text-white rounded-br-xs"
                        : msg.isError
                        ? "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-100 rounded-bl-xs"
                        : "bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 rounded-bl-xs"
                    }`}
                  >
                    {/* User Edit Mode */}
                    {isUser && editingMessageId === msg.id ? (
                      <div className="space-y-2 w-full min-w-0">
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
                      <div className="min-w-0 max-w-full">
                        {msg.quotedText && (
                          <div className="mb-2 border-r-2 border-blue-300 pr-2 text-xs text-blue-100/90">
                            <div className="font-bold">{msg.replyMode === "reply" ? "رد على" : "اقتباس من"} {msg.replyToSender === "ai" ? "المساعد" : "رسالتك"}</div>
                            <div className="line-clamp-3 whitespace-pre-wrap break-words">{msg.quotedText}</div>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed select-text" style={{ fontSize: `${messageFontSize}px` }}>{msg.text}</p>
                      </div>
                    ) : (
                      <div style={{ fontSize: `${messageFontSize}px` }}>
                        <FormattedMessageContent
                          content={msg.text}
                          customers={activeCustomers}
                          onSelectCustomerForLedger={onSelectCustomerForLedger}
                        />
                      </div>
                    )}
                  </div>

                  {/* Message metadata above a toolbar visually attached to the card */}
                  <div className="flex flex-wrap items-center gap-2 mt-1 px-1 text-[11px] text-slate-400">
                    <span>{msg.timestamp}</span>
                    {!isUser && msg.modelUsed && (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        <Cpu className="w-2.5 h-2.5" />
                        <span>{msg.modelUsed}</span>
                        {msg.latencyMs && <span>({(msg.latencyMs / 1000).toFixed(1)}s)</span>}
                      </span>
                    )}
                  </div>
                  {!isUser ? (
                    <div
                      role="toolbar"
                      aria-label="إجراءات إجابة المساعد"
                      dir="rtl"
                      className="flex flex-wrap items-center justify-start gap-2 px-2 py-1 -mt-px rounded-b-xl bg-transparent"
                    >
                      <button
                        type="button"
                        onClick={() => handleRateMessage(msg.id, "dislike")}
                        title="لم يعجبني"
                        aria-label="لم يعجبني"
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${msg.rating === "dislike" ? "text-red-600 bg-red-50 dark:bg-red-900/20" : ""}`}
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRateMessage(msg.id, "like")}
                        title="أعجبني"
                        aria-label="أعجبني"
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${msg.rating === "like" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" : ""}`}
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </button>
                      {isLastMessage && (
                        <button
                          type="button"
                          onClick={handleRegenerate}
                          title="إعادة التوليد"
                          aria-label="إعادة التوليد"
                          disabled={isLoading}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40"
                        >
                          <RotateCw className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSetReplyContext(msg, "quote")}
                        title="اقتباس النص المحدد أو الرسالة"
                        aria-label="اقتباس الرسالة"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Quote className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareMessage(msg.text)}
                        title="مشاركة الرسالة"
                        aria-label="مشاركة الرسالة"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintSingleMessage(msg)}
                        title="طباعة الرسالة"
                        aria-label="طباعة الرسالة"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExportSingleMessagePDF(msg)}
                        title="تنزيل الرسالة PDF"
                        aria-label="تنزيل الرسالة PDF"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <FileDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        title={copiedMsgId === msg.id ? "تم النسخ" : "نسخ النص"}
                        aria-label="نسخ النص"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        {copiedMsgId === msg.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : (
                    <div
                      role="toolbar"
                      aria-label="إجراءات رسالتك"
                      dir="rtl"
                      className="flex flex-wrap items-center gap-2 px-2 py-1 -mt-px rounded-b-xl bg-blue-50/70 dark:bg-slate-800/90"
                    >
                      <button
                        type="button"
                        onClick={() => handleStartEditMessage(msg)}
                        title="تعديل السؤال"
                        aria-label="تعديل السؤال"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetReplyContext(msg, "reply")}
                        title="الرد على هذه الرسالة"
                        aria-label="الرد على الرسالة"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Reply className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetReplyContext(msg, "quote")}
                        title="اقتباس الرسالة"
                        aria-label="اقتباس الرسالة"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Quote className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareMessage(msg.text)}
                        title="مشاركة الرسالة"
                        aria-label="مشاركة الرسالة"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintSingleMessage(msg)}
                        title="طباعة الرسالة"
                        aria-label="طباعة الرسالة"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExportSingleMessagePDF(msg)}
                        title="تنزيل الرسالة PDF"
                        aria-label="تنزيل الرسالة PDF"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <FileDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        title="نسخ الرسالة"
                        aria-label="نسخ الرسالة"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        {copiedMsgId === msg.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
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

        {notice && (
          <div role="status" aria-live="polite" className="px-3 py-1 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30 border-t border-emerald-100 dark:border-emerald-900">
            {notice}
          </div>
        )}

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
        <div className="p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 relative shrink-0">
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

            {replyContext && (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/80 dark:bg-blue-950/30 p-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                  {replyContext.mode === "quote" ? <Quote className="w-3.5 h-3.5" /> : <Reply className="w-3.5 h-3.5" />}
                  <span>{replyContext.mode === "quote" ? "اقتباس من رسالة" : "الرد على رسالة"}</span>
                  <span>· {replyContext.sender === "ai" ? "المساعد" : "أنت"}</span>
                </div>
                <p className="mt-1 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words line-clamp-3">{replyContext.text}</p>
              </div>
              <button type="button" onClick={() => setReplyContext(null)} title="إلغاء الاقتباس أو الرد" aria-label="إلغاء الاقتباس أو الرد" className="p-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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
        messageFontSize={messageFontSize}
        onMessageFontSizeChange={setMessageFontSize}
        chatStyle={chatStyle}
        onChatStyleChange={setChatStyle}
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

        {/* Conversation options menu */}
        {!isEditing && (
          <details className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
            <summary
              title="خيارات المحادثة"
              aria-label="خيارات المحادثة"
              className="list-none cursor-pointer p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <MoreVertical className="w-4 h-4" />
            </summary>
            <div className="absolute left-0 top-full z-40 mt-1 w-44 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-xl text-xs">
              <button type="button" onClick={(e) => { e.stopPropagation(); handleTogglePin(conv.id); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-right hover:bg-slate-100 dark:hover:bg-slate-800">
                {conv.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                {conv.isPinned ? "إلغاء التثبيت" : "تثبيت في الأعلى"}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setEditingConvId(conv.id); setEditingConvTitle(conv.title); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-right hover:bg-slate-100 dark:hover:bg-slate-800">
                <Edit3 className="w-3.5 h-3.5" /> إعادة التسمية
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleArchive(conv.id); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-right hover:bg-slate-100 dark:hover:bg-slate-800">
                {conv.isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {conv.isArchived ? "إلغاء الأرشفة" : "أرشفة المحادثة"}
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button type="button" onClick={(e) => { e.stopPropagation(); if (window.confirm("هل أنت متأكد من حذف هذه المحادثة؟ لا يمكن التراجع عن الحذف.")) void handleDeleteConversation(conv.id); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-right text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                <Trash2 className="w-3.5 h-3.5" /> حذف المحادثة
              </button>
            </div>
          </details>
        )}
      </div>
    );
  }
}
