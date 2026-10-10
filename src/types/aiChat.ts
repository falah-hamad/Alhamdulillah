export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  source?: "gemini" | "deterministic_analyzer" | "client_fallback";
  modelUsed?: string;
  latencyMs?: number;
  isError?: boolean;
  referencedCustomerId?: string;
  referencedCustomerName?: string;
}

export interface ChatConversation {
  id: string;
  userId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  isArchived?: boolean;
  messages: ChatMessage[];
  modelId?: string;
}

export type FontFamilyType = "Cairo" | "Tajawal" | "Noto Sans Arabic" | "Alexandria";
export type FontSizeOption = "sm" | "md" | "lg" | "xl";
export type BubbleShapeOption = "rounded-3xl" | "rounded-2xl" | "rounded-xl" | "rounded-lg";
export type ThemeColorOption = "blue" | "indigo" | "emerald" | "purple" | "amber" | "slate";
export type ThemeModeOption = "light" | "dark" | "system";

export interface AISettings {
  selectedModel: string;
  customInstructions: string;
  fontFamily: FontFamilyType;
  fontSize: FontSizeOption;
  themeMode: ThemeModeOption;
  bubbleShape: BubbleShapeOption;
  themeColor: ThemeColorOption;
  quickQuestions: string[];
}

export interface GeminiModelInfo {
  id: string;
  name: string;
  tag: string;
  description: string;
  speed: string;
  intelligence: string;
  costTier: string;
  isRecommended?: boolean;
  capabilities: string[];
}

export const SUPPORTED_GEMINI_MODELS: GeminiModelInfo[] = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    tag: "الأحدث والأسرع (موصى به)",
    description: "النموذج القياسي الأحدث من Google. سرعة استجابة فائقة ودقة استثنائية في الاستفسارات المحاسبية اليومية.",
    speed: "⚡ فائق السرعة (< 0.8s)",
    intelligence: "★ 8.5/10 متقدم جداً",
    costTier: "اقتصادي جداً / مجاني بالحد المسموح",
    isRecommended: true,
    capabilities: ["استفسارات فورية", "كشوفات سريعة", "ملخصات مالية", "تحليل الديون"],
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    tag: "التحليل المحاسبي العميق",
    description: "نموذج الذكاء المتقدم للاستنتاج المنطقي والعمليات المالية المعقدة والتخطيط الاستراتيجي للديون والتحصيل.",
    speed: "⏳ متوسط (1.5s - 2.5s)",
    intelligence: "★ 9.8/10 فائق الذكاء والاستنتاج",
    costTier: "فئة متقدمة (Pro)",
    isRecommended: false,
    capabilities: ["تحليل مالي متقدم", "توقعات تدفق نقدي", "كشوفات تفصيلية", "تدقيق حسابات"],
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.5 / 3.1 Flash-Lite",
    tag: "خفيف واقتصادي",
    description: "نسخة مخففة ومصممة للسرعة القصوى وتقليل استهلاك البيانات والذاكرة، مثالية لاتصالات الإنترنت الضعيفة.",
    speed: "⚡⚡ برق (< 0.5s)",
    intelligence: "★ 7.8/10 كافٍ ودقيق",
    costTier: "الأقل تكلفة واستهلاكاً",
    isRecommended: false,
    capabilities: ["أسئلة مباشرة سريعة", "عمل على هواتف ذات أداء متواضع", "استهلاك بيانات منخفض"],
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    tag: "إصدار مستقر ومعتمد",
    description: "النموذج المستقر عالي الاعتمادية والمستخدم في الخدمات السحابية للشركات.",
    speed: "⚡ سريع جداً (~ 1s)",
    intelligence: "★ 8.2/10 عالي الكفاءة",
    costTier: "اقتصادي ومرن",
    isRecommended: false,
    capabilities: ["استقرار عالي", "توافق مضمون", "إجابات محاسبية دقيقة"],
  },
];

export const DEFAULT_QUICK_QUESTIONS: string[] = [
  "من أكثر شخص عليه ديون متبقية؟",
  "كم مجموع الديون المتبقية بالسوق ونسبة التحصيل؟",
  "ما المدفوعات والتسديدات المستلمة مؤخراً؟",
  "من هم الزبائن المتأخرين عن موعد سداد فواتيرهم؟",
  "أعطني ملخصاً محاسبياً شاملاً لجميع الحسابات",
];

export const DEFAULT_AI_SETTINGS: AISettings = {
  selectedModel: "gemini-3.8-flash",
  customInstructions: "كن دقيقاً جداً في الأرقام، واعرض المبالغ بالعملة المحلية دائماً مع التنسيق بنقاط واضحة.",
  fontFamily: "Cairo",
  fontSize: "md",
  themeMode: "system",
  bubbleShape: "rounded-2xl",
  themeColor: "blue",
  quickQuestions: DEFAULT_QUICK_QUESTIONS,
};
