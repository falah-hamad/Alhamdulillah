import React, { useState } from "react";
import {
  X,
  Palette,
  Cpu,
  Sparkles,
  Sliders,
  HelpCircle,
  History,
  Check,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  RotateCcw,
  Zap,
  Activity,
  Download,
  AlertCircle,
  CheckCircle2,
  FileText,
} from "lucide-react";
import {
  AISettings,
  SUPPORTED_GEMINI_MODELS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_QUICK_QUESTIONS,
  FontFamilyType,
  FontSizeOption,
  ThemeModeOption,
  BubbleShapeOption,
  ThemeColorOption,
} from "../../types/aiChat";
import { testModelConnectionServer } from "../../lib/cloudFunctions";

interface AIChatSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  onSaveSettings: (newSettings: AISettings) => void;
  totalConversationsCount?: number;
  totalMessagesCount?: number;
  onExportAllConversations?: () => void;
  onClearAllConversations?: () => void;
}

type TabType = "appearance" | "models" | "customization" | "quick_questions" | "history";

export default function AIChatSettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  totalConversationsCount = 0,
  totalMessagesCount = 0,
  onExportAllConversations,
  onClearAllConversations,
}: AIChatSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("appearance");
  const [tempSettings, setTempSettings] = useState<AISettings>({ ...settings });

  // Quick question edit state
  const [newQuestionText, setNewQuestionText] = useState("");
  const [editingQuestionIdx, setEditingQuestionIdx] = useState<number | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState("");

  // Model connectivity test state
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    model: string;
    success: boolean;
    latencyMs?: number;
    message?: string;
    error?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveSettings(tempSettings);
    onClose();
  };

  const handleTestConnection = async (modelId: string) => {
    setTestingModelId(modelId);
    setTestResult(null);
    try {
      const res = await testModelConnectionServer(modelId);
      setTestResult({
        model: modelId,
        success: res.success,
        latencyMs: res.latencyMs,
        message: res.message,
        error: res.error,
      });
    } catch (e: any) {
      setTestResult({
        model: modelId,
        success: false,
        error: e?.message || "فشل الاتصال بالنموذج.",
      });
    } finally {
      setTestingModelId(null);
    }
  };

  const handleAddQuestion = () => {
    const q = newQuestionText.trim();
    if (!q) return;
    setTempSettings((prev) => ({
      ...prev,
      quickQuestions: [...prev.quickQuestions, q],
    }));
    setNewQuestionText("");
  };

  const handleDeleteQuestion = (idx: number) => {
    setTempSettings((prev) => ({
      ...prev,
      quickQuestions: prev.quickQuestions.filter((_, i) => i !== idx),
    }));
  };

  const handleStartEditQuestion = (idx: number) => {
    setEditingQuestionIdx(idx);
    setEditingQuestionText(tempSettings.quickQuestions[idx] || "");
  };

  const handleSaveEditQuestion = () => {
    if (editingQuestionIdx === null) return;
    const text = editingQuestionText.trim();
    if (!text) return;
    setTempSettings((prev) => {
      const updated = [...prev.quickQuestions];
      updated[editingQuestionIdx] = text;
      return { ...prev, quickQuestions: updated };
    });
    setEditingQuestionIdx(null);
    setEditingQuestionText("");
  };

  const handleResetQuestions = () => {
    setTempSettings((prev) => ({
      ...prev,
      quickQuestions: [...DEFAULT_QUICK_QUESTIONS],
    }));
  };

  const handleApplyPresetInstructions = (presetText: string) => {
    setTempSettings((prev) => ({
      ...prev,
      customInstructions: presetText,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                إعدادات المساعد الذكي
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تخصيص النماذج، المظهر، الأسئلة الجاهزة وسجل المحادثات
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto no-scrollbar">
          {[
            { id: "appearance", label: "المظهر والخطوط", icon: Palette },
            { id: "models", label: "نماذج Gemini", icon: Cpu },
            { id: "customization", label: "التخصيص والتعليمات", icon: Sparkles },
            { id: "quick_questions", label: "الأسئلة الجاهزة", icon: HelpCircle },
            { id: "history", label: "سجل المحادثات", icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* 1. APPEARANCE TAB */}
          {activeTab === "appearance" && (
            <div className="space-y-6">
              {/* Font Family */}
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">
                  نوع الخط العربي (Arabic Font)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(["Cairo", "Tajawal", "Noto Sans Arabic", "Alexandria"] as FontFamilyType[]).map((font) => (
                    <button
                      key={font}
                      type="button"
                      onClick={() => setTempSettings((prev) => ({ ...prev, fontFamily: font }))}
                      style={{ fontFamily: font }}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        tempSettings.fontFamily === font
                          ? "border-blue-600 bg-blue-50/70 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-bold shadow-xs"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                      }`}
                    >
                      <div className="text-sm font-bold">{font}</div>
                      <div className="text-xs opacity-75 mt-1">دفتر الديون الذكي</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">
                  حجم خط الرسائل
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: "sm", label: "صغير (13px)" },
                    { id: "md", label: "متوسط (15px)" },
                    { id: "lg", label: "كبير (17px)" },
                    { id: "xl", label: "كبير جداً (19px)" },
                  ].map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setTempSettings((prev) => ({ ...prev, fontSize: sz.id as FontSizeOption }))}
                      className={`py-2 px-3 rounded-xl border text-xs sm:text-sm font-semibold transition-all ${
                        tempSettings.fontSize === sz.id
                          ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme Mode */}
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">
                  الوضع والمظهر
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: "light", label: "فاتح (نهار)" },
                    { id: "dark", label: "داكن (ليل)" },
                    { id: "system", label: "تلقائي (حسب الجهاز)" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setTempSettings((prev) => ({ ...prev, themeMode: mode.id as ThemeModeOption }))}
                      className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                        tempSettings.themeMode === mode.id
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-xs"
                          : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Theme */}
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">
                  اللون الرئيسي لواجهة المساعد
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {[
                    { id: "blue", name: "أزرق قياسي", bg: "bg-blue-600" },
                    { id: "indigo", name: "نيلي داكن", bg: "bg-indigo-600" },
                    { id: "emerald", name: "زمردي هادئ", bg: "bg-emerald-600" },
                    { id: "purple", name: "بنفسجي ملكي", bg: "bg-purple-600" },
                    { id: "amber", name: "كهرماني دافئ", bg: "bg-amber-600" },
                    { id: "slate", name: "رصاصي فاخر", bg: "bg-slate-800" },
                  ].map((clr) => (
                    <button
                      key={clr.id}
                      type="button"
                      onClick={() => setTempSettings((prev) => ({ ...prev, themeColor: clr.id as ThemeColorOption }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                        tempSettings.themeColor === clr.id
                          ? "border-slate-900 dark:border-white ring-2 ring-blue-500/30 font-bold"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${clr.bg} shadow-xs`} />
                      <span className="text-xs text-slate-800 dark:text-slate-200">{clr.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bubble Shape */}
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">
                  استدارة وشكل فقاعات المحادثة
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "rounded-3xl", label: "مستديرة جداً (3xl)" },
                    { id: "rounded-2xl", label: "ناعمة معتدلة (2xl)" },
                    { id: "rounded-xl", label: "كلاسيكية (xl)" },
                    { id: "rounded-lg", label: "حادة مدمجة (lg)" },
                  ].map((shape) => (
                    <button
                      key={shape.id}
                      type="button"
                      onClick={() => setTempSettings((prev) => ({ ...prev, bubbleShape: shape.id as BubbleShapeOption }))}
                      className={`p-2.5 border text-xs font-bold transition-all ${shape.id} ${
                        tempSettings.bubbleShape === shape.id
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {shape.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. MODELS TAB */}
          {activeTab === "models" && (
            <div className="space-y-5">
              <div className="bg-blue-50/70 dark:bg-blue-950/30 p-3.5 rounded-2xl border border-blue-200 dark:border-blue-900/50 flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                  <strong>التحكم الفعلي بالنموذج:</strong> النموذج المختار هنا هو الذي سيقوم بمعالجة وتوليد الإجابات في كل سؤال. يمكنك فحص الاتصال والتأكد من سرعة كل نموذج مباشرة قبل اعتماده.
                </div>
              </div>

              {/* Model Cards */}
              <div className="space-y-3">
                {SUPPORTED_GEMINI_MODELS.map((model) => {
                  const isSelected = tempSettings.selectedModel === model.id;
                  const isTesting = testingModelId === model.id;
                  return (
                    <div
                      key={model.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/30 dark:bg-blue-950/20 shadow-md ring-1 ring-blue-500/20"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id={`model-${model.id}`}
                            name="gemini_model"
                            checked={isSelected}
                            onChange={() => setTempSettings((prev) => ({ ...prev, selectedModel: model.id }))}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <label htmlFor={`model-${model.id}`} className="font-bold text-sm sm:text-base text-slate-900 dark:text-white cursor-pointer flex items-center gap-2">
                            <span>{model.name}</span>
                            <span className="text-xs font-mono text-slate-400">({model.id})</span>
                          </label>
                        </div>

                        <div className="flex items-center gap-1.5 self-start sm:self-auto">
                          {model.isRecommended && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                              موصى به
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium">
                            {model.tag}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                        {model.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-xs mb-3 text-slate-600 dark:text-slate-300">
                        <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-medium">
                          {model.speed}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-medium">
                          {model.intelligence}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-medium text-slate-500">
                          {model.costTier}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {model.capabilities.map((cap, cIdx) => (
                            <span key={cIdx} className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 px-1.5 py-0.5 rounded">
                              • {cap}
                            </span>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTestConnection(model.id)}
                          disabled={isTesting}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
                        >
                          <Activity className={`w-3.5 h-3.5 ${isTesting ? "animate-spin text-blue-600" : "text-slate-400"}`} />
                          <span>{isTesting ? "جاري الفحص..." : "فحص الاتصال"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Test Connection Feedback */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-200 ${
                    testResult.success
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                      : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-bold">
                      {testResult.success
                        ? `الاتصال بنموذج ${testResult.model} تم بنجاح!`
                        : `تعذر الاتصال بنموذج ${testResult.model}`}
                    </div>
                    <div className="text-xs opacity-85 mt-0.5">
                      {testResult.success
                        ? `زمن الاستجابة: ${testResult.latencyMs}ms — النموذج جاهز للعمل والرد على فواتيرك.`
                        : testResult.error}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. CUSTOMIZATION TAB */}
          {activeTab === "customization" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  تعليمات وتوجيهات المساعد الخاصة (System Instructions)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  تحدد هذه التعليمات أسلوب الرد، اللهجة، وطريقة تنظيم البيانات المحاسبية حسب ما تفضله في محلك أو شركتك.
                </p>

                <textarea
                  value={tempSettings.customInstructions}
                  onChange={(e) => setTempSettings((prev) => ({ ...prev, customInstructions: e.target.value }))}
                  rows={5}
                  placeholder="اكتب هنا التوجيهات التي تريد من المساعد الالتزام بها..."
                  className="w-full p-3 text-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  نماذج وقوالب جاهزة للتعليمات:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      label: "🎯 محاسب صارم في التحصيل",
                      prompt: "ركز دائماً على المبالغ المتبقية والعملاء المتأخرين، واقترح أولويات التحصيل العاجلة بحزم ودقة.",
                    },
                    {
                      label: "🤝 مستشار مالي ودود وتفصيلي",
                      prompt: "قدم نصائح مالية داعمة، واذكر تاريخ كل دفعة بتفصيل، واقترح خطط تسوية للمدينين بأسلوب مهذب.",
                    },
                    {
                      label: "⚡ موجز ومباشر جداً",
                      prompt: "أجب بأقصر شكل ممكن: اذكر الأرقام الصافية مباشرة دون مقدمات أو إطالة كلامية.",
                    },
                  ].map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => handleApplyPresetInstructions(preset.prompt)}
                      className="p-3 text-right rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 transition-all hover:shadow-xs"
                    >
                      <div className="font-bold text-blue-600 dark:text-blue-400 mb-1">{preset.label}</div>
                      <div className="text-slate-500 dark:text-slate-400 line-clamp-2">{preset.prompt}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setTempSettings((prev) => ({ ...prev, customInstructions: DEFAULT_AI_SETTINGS.customInstructions }))}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>استعادة التعليمات الافتراضية</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. QUICK QUESTIONS TAB */}
          {activeTab === "quick_questions" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    الأسئلة السريعة والمقترحة
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    تظهر هذه الأسئلة كأزرار سريعة فوق شريط الكتابة لتسهيل الاستفسار بضغطة واحدة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetQuestions}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>استعادة الافتراضية</span>
                </button>
              </div>

              {/* Add New Question */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddQuestion()}
                  placeholder="أضف سؤالاً سريعاً جديداً... (مثال: ما ديون هذا الأسبوع؟)"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  disabled={!newQuestionText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center gap-1 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة</span>
                </button>
              </div>

              {/* Questions List */}
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {tempSettings.quickQuestions.map((q, idx) => {
                  const isEditing = editingQuestionIdx === idx;
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 flex items-center justify-between gap-3"
                    >
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingQuestionText}
                            onChange={(e) => setEditingQuestionText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveEditQuestion()}
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-blue-400 bg-blue-50/50 dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleSaveEditQuestion}
                            className="p-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingQuestionIdx(null)}
                            className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-sm text-slate-800 dark:text-slate-200 truncate font-medium">
                              {q}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEditQuestion(idx)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              title="تعديل السؤال"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(idx)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              title="حذف السؤال"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. HISTORY TAB */}
          {activeTab === "history" && (
            <div className="space-y-6">
              {/* Statistics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40">
                  <div className="text-xs text-blue-700 dark:text-blue-300 font-bold mb-1">
                    إجمالي المحادثات المخزنة
                  </div>
                  <div className="text-2xl font-black text-blue-900 dark:text-blue-100">
                    {totalConversationsCount} محادثة
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40">
                  <div className="text-xs text-indigo-700 dark:text-indigo-300 font-bold mb-1">
                    إجمالي الرسائل والاستفسارات
                  </div>
                  <div className="text-2xl font-black text-indigo-900 dark:text-indigo-100">
                    {totalMessagesCount} رسالة
                  </div>
                </div>
              </div>

              {/* Data actions */}
              <div className="space-y-3">
                {onExportAllConversations && (
                  <button
                    type="button"
                    onClick={onExportAllConversations}
                    className="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Download className="w-5 h-5 text-blue-600" />
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          تصدير سجل المحادثات كملف JSON
                        </div>
                        <div className="text-xs text-slate-500">
                          حفظ نسخة احتياطية من جميع محادثاتك على جهازك
                        </div>
                      </div>
                    </div>
                  </button>
                )}

                {onClearAllConversations && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("هل أنت متأكد من رغبتك في حذف جميع المحادثات المخزنة؟ لا يمكن التراجع عن هذا الإجراء.")) {
                        onClearAllConversations();
                      }
                    }}
                    className="w-full p-3.5 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/50 flex items-center justify-between transition-all text-red-700 dark:text-red-300"
                  >
                    <div className="flex items-center gap-3">
                      <Trash2 className="w-5 h-5 text-red-600" />
                      <div className="text-right">
                        <div className="text-sm font-bold">
                          مسح جميع المحادثات نهائياً
                        </div>
                        <div className="text-xs opacity-75">
                          إفراغ سجل الذكاء الاصطناعي وبدء سجل جديد
                        </div>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            النموذج النشط: <strong className="text-blue-600 dark:text-blue-400">{tempSettings.selectedModel}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>حفظ وتطبيق</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
