import React, { useEffect, useState } from "react";
import { Bell, Camera, CheckCircle2, FolderUp, ShieldCheck, Smartphone } from "lucide-react";
import { requestNotificationPermissionDetailed } from "../lib/notifications";
import {
  checkNativePermissionsStatus,
  isNativeAndroid,
  openNativeAppSettings,
  requestNativeCameraAndPhotosPermission,
} from "../lib/native";

type OnboardingSlide = {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: "notifications" | "camera";
};

const onboardingSlides: OnboardingSlide[] = [
  {
    id: "welcome",
    icon: <Smartphone className="w-8 h-8 text-blue-600" />,
    title: "دفتر الديون المحاسبي",
    body: "مرحباً بك! هذا التطبيق يساعدك على إدارة العملاء والديون والمبيعات الآجلة مع مزامنة Firebase.",
  },
  {
    id: "features-core",
    icon: <CheckCircle2 className="w-8 h-8 text-blue-600" />,
    title: "إدارة متكاملة",
    body: "إدارة سجل الديون والعملاء والفواتير والدفعات، مع البحث السريع، التقارير، والطباعة.",
  },
  {
    id: "features-cloud",
    icon: <FolderUp className="w-8 h-8 text-blue-600" />,
    title: "المزامنة والنسخ الاحتياطي",
    body: "البيانات تُحفظ محلياً وتُزامن مع Firebase عند توفر الإنترنت، مع دعم النسخ الاحتياطي والاستعادة.",
  },
  {
    id: "permission-notifications",
    icon: <Bell className="w-8 h-8 text-blue-600" />,
    title: "الوصول إلى الإشعارات",
    body: "نحتاج إذن الإشعارات لإرسال تنبيهات الديون والدفعات وتحديثات النسخ الاحتياطي.",
    action: "notifications",
  },
  {
    id: "permission-camera",
    icon: <Camera className="w-8 h-8 text-blue-600" />,
    title: "الوصول إلى الكاميرا والصور",
    body: "نحتاج إذن الكاميرا/الصور لالتقاط أو اختيار صور الشعار والمرفقات داخل التطبيق.",
    action: "camera",
  },
  {
    id: "security",
    icon: <ShieldCheck className="w-8 h-8 text-blue-600" />,
    title: "الحماية الحيوية",
    body: "يمكنك تفعيل قفل التطبيق بالبصمة/Face Unlock لاحقاً من صفحة الإعدادات أو من إدارة الحساب.",
  },
];

interface FirstLaunchOnboardingProps {
  userId?: string | null;
  onComplete: (options?: { skipped?: boolean }) => void;
}

export function FirstLaunchOnboarding({ userId, onComplete }: FirstLaunchOnboardingProps) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const slide = onboardingSlides[index];

  const handlePermissionAction = async () => {
    if (!slide?.action) return true;

    if (!isNativeAndroid()) {
      setMessage("أذونات Android الفعلية تظهر داخل التطبيق المثبّت على الهاتف.");
      return true;
    }

    if (slide.action === "notifications") {
      setBusy(true);
      try {
        const result = await requestNotificationPermissionDetailed(userId || undefined);
        if (result.status === "granted") {
          setMessage("تم تفعيل الإشعارات وتسجيل الجهاز بنجاح.");
        } else if (result.status === "denied") {
          setMessage("تم رفض إذن الإشعارات. يمكنك المتابعة الآن وتفعيله لاحقاً من الإعدادات.");
        } else {
          setMessage(result.message || "تعذر تفعيل الإشعارات حالياً.");
        }
      } finally {
        setBusy(false);
      }
      return true;
    }

    if (slide.action === "camera") {
      setBusy(true);
      try {
        const permissions = await requestNativeCameraAndPhotosPermission();
        if (permissions.camera === "granted" || permissions.photos === "granted" || permissions.photos === "limited") {
          setMessage(
            permissions.camera === "granted"
              ? "تم منح إذن الكاميرا/الصور بنجاح."
              : "تم منح إذن الصور. يمكنك استخدام اختيار الملفات حتى لو لم تمنح الكاميرا حالياً.",
          );
        } else {
          setMessage("تم رفض إذن الكاميرا/الصور. التطبيق سيستمر ويمكن التفعيل لاحقاً.");
        }
      } finally {
        setBusy(false);
      }
      return true;
    }

    return true;
  };

  const handleNext = async () => {
    await handlePermissionAction();
    if (index >= onboardingSlides.length - 1) {
      onComplete({ skipped: false });
      return;
    }
    setMessage(null);
    setIndex((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-5" dir="rtl">
      <div className="w-full max-w-md bg-slate-800/95 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-white/95 text-blue-700 flex items-center justify-center shadow-lg">
            {slide.icon}
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-lg font-extrabold">{slide.title}</h1>
          <p className="text-sm text-slate-300 leading-relaxed">{slide.body}</p>
        </div>

        {message && (
          <div className="text-xs rounded-xl bg-slate-700/60 border border-slate-600 p-3 text-slate-200">
            {message}
          </div>
        )}

        <div className="flex items-center justify-center gap-2">
          {onboardingSlides.map((item, idx) => (
            <span
              key={item.id}
              className={`w-2.5 h-2.5 rounded-full transition-all ${idx === index ? "bg-blue-500" : "bg-slate-600"}`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onComplete({ skipped: true })}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-500 text-slate-200 text-sm font-bold hover:bg-slate-700 transition-colors"
          >
            تخطي
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleNext()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors disabled:opacity-60"
          >
            {busy ? "جارٍ التنفيذ..." : index === onboardingSlides.length - 1 ? "بدء الاستخدام" : "التالي"}
          </button>
        </div>

        {isNativeAndroid() && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => void openNativeAppSettings()}
              className="text-xs text-blue-100 hover:text-white underline"
            >
              فتح إعدادات Android للأذونات
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type CoachStep = {
  id: string;
  targetId: string;
  title: string;
  body: string;
  targetTab?: string;
};

const coachSteps: CoachStep[] = [
  {
    id: "quick-add-customer",
    targetId: "dashboard-quick-add-customer",
    targetTab: "home",
    title: "زر إضافة سريع",
    body: "من هذا الزر يمكنك إضافة عميل جديد بسرعة دون مغادرة الصفحة الرئيسية.",
  },
  {
    id: "sidebar-customers",
    targetId: "sidebar-tab-customers",
    title: "قائمة العملاء",
    body: "من الشريط الجانبي انتقل سريعاً إلى العملاء، الفواتير، الدفعات، والإعدادات.",
  },
  {
    id: "header-notification",
    targetId: "header-btn-notification-center",
    title: "مركز الإشعارات",
    body: "هنا ستجد جميع التنبيهات المهمة مع إمكانية فتح الإجراء مباشرة.",
  },
  {
    id: "customers-search",
    targetId: "customers-search-input",
    targetTab: "customers",
    title: "البحث عن عميل",
    body: "استخدم حقل البحث للوصول السريع لأي عميل عبر الاسم أو الهاتف.",
  },
];

interface FirstUseCoachMarksProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onComplete: () => void;
}

export function FirstUseCoachMarks({ currentTab, setCurrentTab, onComplete }: FirstUseCoachMarksProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const step = coachSteps[stepIndex];

  useEffect(() => {
    if (step?.targetTab && currentTab !== step.targetTab) {
      setCurrentTab(step.targetTab);
    }
  }, [currentTab, setCurrentTab, step]);

  useEffect(() => {
    const updateRect = () => {
      const el = document.getElementById(step.targetId);
      setTargetRect(el ? el.getBoundingClientRect() : null);
    };
    updateRect();
    const timer = window.setTimeout(updateRect, 150);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [step, currentTab, stepIndex]);

  useEffect(() => {
    const el = document.getElementById(step.targetId);
    if (!el) return;
    const oldShadow = el.style.boxShadow;
    const oldPosition = el.style.position;
    const oldZIndex = el.style.zIndex;
    el.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.95), 0 0 0 9999px rgba(2,6,23,0.45)";
    el.style.position = el.style.position || "relative";
    el.style.zIndex = "70";
    return () => {
      el.style.boxShadow = oldShadow;
      el.style.position = oldPosition;
      el.style.zIndex = oldZIndex;
    };
  }, [step, currentTab, stepIndex]);

  const next = () => {
    if (stepIndex >= coachSteps.length - 1) {
      onComplete();
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const top = targetRect ? Math.min(window.innerHeight - 180, targetRect.bottom + 12) : window.innerHeight / 2 - 90;
  const left = targetRect ? Math.max(16, Math.min(window.innerWidth - 320, targetRect.left)) : Math.max(16, window.innerWidth / 2 - 150);

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none" dir="rtl">
      <div className="absolute inset-0 bg-slate-950/45 pointer-events-auto" />
      <div
        className="absolute w-[300px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 space-y-3 pointer-events-auto"
        style={{ top, left }}
      >
        <div className="text-[11px] text-blue-700 font-bold">إرشادات الاستخدام ({stepIndex + 1}/{coachSteps.length})</div>
        <h3 className="text-sm font-bold text-slate-900">{step.title}</h3>
        <p className="text-xs text-slate-600 leading-relaxed">{step.body}</p>
        {!targetRect && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            جارٍ الانتقال للواجهة المناسبة...
          </p>
        )}
        {isNativeAndroid() && !targetRect && (
          <button
            type="button"
            onClick={() => void openNativeAppSettings()}
            className="text-[11px] text-blue-600 underline"
          >
            فتح إعدادات أذونات Android
          </button>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onComplete}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            تخطي
          </button>
          <button
            type="button"
            onClick={next}
            className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
          >
            {stepIndex === coachSteps.length - 1 ? "إنهاء" : "التالي"}
          </button>
        </div>
      </div>
    </div>
  );
}

export async function getBiometricSupportSummary() {
  if (!isNativeAndroid()) return null;
  const status = await checkNativePermissionsStatus();
  return status.biometricAvailable;
}
