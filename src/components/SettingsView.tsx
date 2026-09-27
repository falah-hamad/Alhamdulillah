import React, { useState, useRef } from "react";
import {
  Settings,
  Building,
  Phone,
  MapPin,
  Coins,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  CheckCircle,
  AlertTriangle,
  PenTool,
  Database,
  FileCheck2,
  ShieldCheck,
  HardDriveDownload,
  FileJson,
  Check,
  Users,
  Package,
  FileText,
  CreditCard,
  LogOut,
  Cloud,
  UserCheck,
  Image as ImageIcon,
  Loader2,
  Calendar,
  Bell,
  Camera,
  Fingerprint,
  Shield,
  RefreshCcw,
  KeyRound,
} from "lucide-react";
import { SystemSettings, CloudBackupItem } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { uploadUserFile, deleteUserFileByUrl } from "../lib/firebase";
import {
  checkNativePermissionsStatus,
  isNativeAndroid,
  openNativeAppSettings,
  pickNativeImageFile,
  pickNativeJsonFile,
  requestNativeCameraAndPhotosPermission,
  saveNativeJsonFile,
} from "../lib/native";
import { requestNotificationPermissionDetailed } from "../lib/notifications";
import { resetFirstLaunchExperience } from "../lib/firstLaunch";

interface SettingsViewProps {
  settings: SystemSettings;
  updateSettings: (settings: SystemSettings) => void;
  resetToDefault: () => void;
  clearAllData: () => void;
  importData: (jsonData: string) => { success: boolean; error?: string };
  // Raw data lists for export
  folders?: any[];
  customers: any[];
  products: any[];
  invoices: any[];
  payments: any[];
  cloudBackups?: CloudBackupItem[];
  onCreateCloudBackup?: (name?: string) => Promise<any>;
  onRestoreCloudBackup?: (backupId: string) => Promise<any>;
  onDeleteCloudBackup?: (backupId: string) => Promise<void>;
}

export default function SettingsView({
  settings,
  updateSettings,
  resetToDefault,
  clearAllData,
  importData,
  folders = [],
  customers,
  products,
  invoices,
  payments,
  cloudBackups = [],
  onCreateCloudBackup,
  onRestoreCloudBackup,
  onDeleteCloudBackup,
}: SettingsViewProps) {
  const { currentUser, logout, extendedProfile, updateUserProfile } = useAuth();
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [companyPhone, setCompanyPhone] = useState(settings.companyPhone);
  const [companyAddress, setCompanyAddress] = useState(settings.companyAddress);
  const [currency, setCurrency] = useState(settings.currency);
  const [signaturePlaceholder, setSignaturePlaceholder] = useState(settings.signaturePlaceholder || "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [creatingCloudBackup, setCreatingCloudBackup] = useState(false);
  const [customBackupName, setCustomBackupName] = useState("");
  const [showBackupNameInput, setShowBackupNameInput] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Sync state when settings prop updates
  React.useEffect(() => {
    setCompanyName(settings.companyName);
    setCompanyPhone(settings.companyPhone);
    setCompanyAddress(settings.companyAddress);
    setCurrency(settings.currency);
    setSignaturePlaceholder(settings.signaturePlaceholder || "");
  }, [settings]);

  React.useEffect(() => {
    setLocalBiometricLock(extendedProfile.twoFactorEnabled ?? false);
    setLocalNotifDebts(extendedProfile.dueDebtAlerts ?? true);
    setLocalNotifPayments(extendedProfile.paymentAlerts ?? true);
    setLocalNotifBackup(extendedProfile.backupAlerts ?? true);
  }, [extendedProfile]);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [localBiometricLock, setLocalBiometricLock] = useState(extendedProfile.twoFactorEnabled ?? false);
  const [localNotifDebts, setLocalNotifDebts] = useState(extendedProfile.dueDebtAlerts ?? true);
  const [localNotifPayments, setLocalNotifPayments] = useState(extendedProfile.paymentAlerts ?? true);
  const [localNotifBackup, setLocalNotifBackup] = useState(extendedProfile.backupAlerts ?? true);
  const [permissionStatus, setPermissionStatus] = useState({
    notifications: "unknown",
    camera: "unknown",
    photos: "unknown",
    biometric: false,
  });

  const handleLogoFile = async (file?: File | null) => {
    if (!file || !currentUser) return;
    if (!file.type.startsWith("image/")) {
      showMsg("error", "يرجى اختيار ملف صورة صالح (PNG, JPG, WebP)");
      return;
    }
    try {
      setLogoUploading(true);
      const ext = file.name.split(".").pop() || "png";
      const downloadUrl = await uploadUserFile(currentUser.uid, "branding", `logo.${ext}`, file);
      updateSettings({
        ...settings,
        logoUrl: downloadUrl,
      });
      showMsg("success", "تم رفع وحفظ شعار المتجر في Firebase Storage بنجاح!");
    } catch (err: any) {
      showMsg("error", "فشل رفع الشعار إلى التخزين السحابي.");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await handleLogoFile(e.target.files?.[0]);
  };

  const handleNativeLogoPick = async (source: "gallery" | "camera") => {
    try {
      const file = await pickNativeImageFile(source);
      if (!file) return;
      await handleLogoFile(file);
    } catch (err) {
      showMsg("error", source === "camera" ? "تعذر التقاط الشعار من الكاميرا." : "تعذر اختيار الشعار من هاتفك.");
    }
  };

  const handleRemoveLogo = async () => {
    if (!settings.logoUrl) return;
    try {
      setLogoUploading(true);
      await deleteUserFileByUrl(settings.logoUrl);
      updateSettings({
        ...settings,
        logoUrl: undefined,
      });
      showMsg("success", "تم حذف شعار المتجر من التخزين السحابي.");
    } catch (err: any) {
      showMsg("error", "فشل حذف الشعار.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleCreateCloudBackup = async () => {
    if (!onCreateCloudBackup) return;
    try {
      setCreatingCloudBackup(true);
      await onCreateCloudBackup(customBackupName.trim() || undefined);
      setCustomBackupName("");
      setShowBackupNameInput(false);
      showMsg("success", "تم أخذ وحفظ النسخة السحابية بنجاح في Firebase!");
    } catch (err) {
      showMsg("error", "حدث خطأ أثناء حفظ النسخة السحابية.");
    } finally {
      setCreatingCloudBackup(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      ...settings,
      companyName,
      companyPhone,
      companyAddress,
      currency,
      signaturePlaceholder,
    });
    showMsg("success", "تم حفظ إعدادات النظام وتحديث البيانات آلياً بنجاح!");
  };

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const refreshPermissionStatus = React.useCallback(async () => {
    if (!isNativeAndroid()) {
      setPermissionStatus({
        notifications: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
        camera: "unsupported",
        photos: "unsupported",
        biometric: false,
      });
      return;
    }

    const status = await checkNativePermissionsStatus();
    setPermissionStatus({
      notifications: status.notifications,
      camera: status.camera,
      photos: status.photos,
      biometric: status.biometricAvailable,
    });
  }, []);

  React.useEffect(() => {
    void refreshPermissionStatus();
  }, [refreshPermissionStatus]);

  const saveSecurityAndNotificationPrefs = async () => {
    try {
      setSavingSecurity(true);
      await updateUserProfile({
        twoFactorEnabled: localBiometricLock,
        dueDebtAlerts: localNotifDebts,
        paymentAlerts: localNotifPayments,
        backupAlerts: localNotifBackup,
      });
      showMsg("success", "تم حفظ إعدادات الأمان والإشعارات بنجاح.");
    } catch {
      showMsg("error", "تعذر حفظ إعدادات الأمان والإشعارات.");
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleEnableNotificationsPermission = async () => {
    const result = await requestNotificationPermissionDetailed(currentUser?.uid);
    if (result.status === "granted") {
      showMsg("success", "تم تفعيل إشعارات التطبيق بنجاح.");
    } else {
      showMsg("error", result.message || "لم يتم منح إذن الإشعارات.");
    }
    await refreshPermissionStatus();
  };

  const handleEnableCameraPermission = async () => {
    if (!isNativeAndroid()) return;
    await requestNativeCameraAndPhotosPermission();
    await refreshPermissionStatus();
  };

  // State for pending file import preview/confirmation
  const [pendingBackup, setPendingBackup] = useState<{
    file: File;
    parsed: any;
    stats: {
      customersCount: number;
      productsCount: number;
      invoicesCount: number;
      paymentsCount: number;
      exportDate?: string;
      appName?: string;
    };
  } | null>(null);

  const [isExporting, setIsExporting] = useState(false);

  // Export database to JSON with structured metadata & download trigger
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const timestamp = new Date().toISOString();
      const dateStr = timestamp.split("T")[0];
      const timeStr = timestamp.split("T")[1].replace(/[:.]/g, "-").slice(0, 8);

      const backupData = {
        meta: {
          appName: "نظام دفتر الديون والمبيعات الآجلة",
          appVersion: "2.1.0",
          exportDate: timestamp,
          locale: "ar",
          counts: {
            folders: folders.length,
            customers: customers.length,
            products: products.length,
            invoices: invoices.length,
            payments: payments.length,
          },
        },
        folders,
        customers,
        products,
        invoices,
        payments,
        settings,
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const fileName = `نسخة_احتياطية_قاعدة_البيانات_${dateStr}_${timeStr}.json`;

      if (isNativeAndroid()) {
        const savedPath = await saveNativeJsonFile(fileName, jsonStr);
        showMsg("success", `تم حفظ النسخة الاحتياطية داخل ${savedPath || "مجلد المستندات"} بنجاح.`);
        return;
      }

      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = url;
      downloadAnchor.download = fileName;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);

      showMsg("success", `تم تصدير قاعدة البيانات بنجاح (${folders.length} مجلد، ${customers.length} عميل، ${invoices.length} فاتورة، ${products.length} بضاعة، ${payments.length} دفعة).`);
    } catch (e: any) {
      showMsg("error", "فشل تصدير النسخة الاحتياطية: " + (e?.message || ""));
    } finally {
      setIsExporting(false);
    }
  };

  // Import database from JSON with safe file inspection
  const handleImportClick = () => {
    if (isNativeAndroid()) {
      handleNativeImport();
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleNativeImport = async () => {
    try {
      const picked = await pickNativeJsonFile();
      if (!picked) return;
      handleBackupContent(picked.content, picked.name);
    } catch (err) {
      showMsg("error", "تعذر قراءة النسخة الاحتياطية من هاتفك.");
    }
  };

  const handleBackupContent = (rawContent: string, fileName: string) => {
    try {
      const parsed = JSON.parse(rawContent);
      const payload = parsed.data || parsed;

      if (
        !payload ||
        !Array.isArray(payload.customers) ||
        !Array.isArray(payload.products) ||
        !Array.isArray(payload.invoices) ||
        !Array.isArray(payload.payments)
      ) {
        showMsg("error", "الملف المختار ليس نسخة احتياطية صالحة متوافقة مع قاعدة بيانات النظام.");
        return;
      }

      setPendingBackup({
        file: new File([rawContent], fileName, { type: "application/json" }),
        parsed,
        stats: {
          customersCount: payload.customers.length,
          productsCount: payload.products.length,
          invoicesCount: payload.invoices.length,
          paymentsCount: payload.payments.length,
          exportDate: parsed.meta?.exportDate || payload.exportDate || undefined,
          appName: parsed.meta?.appName || "نسخة احتياطية محلية",
        },
      });
    } catch (err: any) {
      showMsg("error", "فشل قراءة الملف؛ الملف ليس بصيغة JSON صحيحة أو تالف.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      handleBackupContent(event.target?.result as string, file.name);
    };
    reader.readAsText(file);
  };

  // Confirm import and restore data
  const handleConfirmRestore = () => {
    if (!pendingBackup) return;
    const res = importData(JSON.stringify(pendingBackup.parsed));
    if (res.success) {
      const stats = pendingBackup.stats;
      setPendingBackup(null);
      showMsg("success", `تمت استعادة قاعدة البيانات بنجاح (${stats.customersCount} عميل، ${stats.invoicesCount} فاتورة). جاري تطبيق التغييرات...`);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      showMsg("error", res.error || "تعذر استيراد الملف.");
    }
  };

  const handleResetToDemo = () => {
    if (confirm("هل تريد إعادة تعيين كافة البيانات إلى عينات العرض التوضيحية؟ سيؤدي ذلك لمسح أي تعديلات قمت بها حالياً.")) {
      resetToDefault();
      showMsg("success", "تمت استعادة عينات العرض التوضيحية بنجاح!");
      setTimeout(() => window.location.reload(), 800);
    }
  };

  const handleClearEverything = () => {
    if (confirm("تحذير شديد الخطورة: هل أنت متأكد من رغبتك في تصفير النظام وحذف كافة العملاء، الفواتير، البضائع والدفعات للبدء من الصفر؟ لا يمكن التراجع عن هذا الإجراء.")) {
      clearAllData();
      showMsg("success", "تم تصفير النظام وحذف كافة السجلات بنجاح!");
      setTimeout(() => window.location.reload(), 800);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Settings Title */}
      <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          إعدادات النظام والتهيئة
        </h1>
        <p className="text-slate-500 text-xs mt-1">
          قم بتعديل بيانات شركتك ومحلّك التجاري، وإدارة النسخ الاحتياطية لقواعد البيانات لضمان عدم فقدان السجلات الدفترية.
        </p>
      </div>

      {/* Action Messages alerts */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 border ${
            message.type === "success"
              ? "bg-blue-50 text-blue-800 border-blue-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-5 h-5 text-blue-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            الأمان والإشعارات والخصوصية
          </h2>
          <button
            type="button"
            onClick={() => void refreshPermissionStatus()}
            className="self-start sm:self-auto px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            تحديث حالة الصلاحيات
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Fingerprint className="w-4 h-4 text-purple-600" />
                قفل التطبيق بالبصمة/Face Unlock
              </span>
              {(!isNativeAndroid() || !permissionStatus.biometric) && (
                <p className="text-[10px] text-amber-700">غير متاح على هذا الجهاز حالياً.</p>
              )}
            </div>
            <input
              type="checkbox"
              checked={localBiometricLock}
              disabled={!isNativeAndroid() || !permissionStatus.biometric}
              onChange={(e) => setLocalBiometricLock(e.target.checked)}
              className="w-4 h-4"
            />
          </div>

          <label className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-blue-600" />
              تنبيهات الديون المستحقة
            </span>
            <input
              type="checkbox"
              checked={localNotifDebts}
              onChange={(e) => setLocalNotifDebts(e.target.checked)}
              className="w-4 h-4"
            />
          </label>

          <label className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <span className="font-bold text-slate-700">تنبيهات تسجيل الدفعات</span>
            <input
              type="checkbox"
              checked={localNotifPayments}
              onChange={(e) => setLocalNotifPayments(e.target.checked)}
              className="w-4 h-4"
            />
          </label>

          <label className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <span className="font-bold text-slate-700">تنبيهات النسخ الاحتياطي</span>
            <input
              type="checkbox"
              checked={localNotifBackup}
              onChange={(e) => setLocalNotifBackup(e.target.checked)}
              className="w-4 h-4"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="font-bold text-slate-800">حالة إذن الإشعارات</div>
            <div className="text-slate-500">الحالة الحالية: <strong>{permissionStatus.notifications}</strong></div>
            <button
              type="button"
              onClick={() => void handleEnableNotificationsPermission()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
            >
              طلب/تفعيل الإذن
            </button>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-blue-600" />
              حالة إذن الكاميرا/الصور
            </div>
            <div className="text-slate-500">
              الكاميرا: <strong>{permissionStatus.camera}</strong> — الصور: <strong>{permissionStatus.photos}</strong>
            </div>
            <button
              type="button"
              onClick={() => void handleEnableCameraPermission()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
            >
              طلب إذن الكاميرا
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={savingSecurity}
            onClick={() => void saveSecurityAndNotificationPrefs()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            حفظ إعدادات الأمان والإشعارات
          </button>
          {isNativeAndroid() && (
            <button
              type="button"
              onClick={() => void openNativeAppSettings()}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold hover:bg-slate-50"
            >
              فتح إعدادات Android
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              resetFirstLaunchExperience();
              showMsg("success", "تمت إعادة تهيئة دليل البداية وسيظهر الشرح مباشرة.");
              window.dispatchEvent(new Event("acc-restart-onboarding"));
            }}
            className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-xs font-bold hover:bg-blue-50"
          >
            إعادة مشاهدة الشرح
          </button>
        </div>
      </div>

      {/* Cloud Account & Firebase Status */}
      <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">حسابك السحابي والمزامنة (Firebase)</h2>
              <p className="text-xs text-slate-500 mt-0.5">قاعدة بيانات Cloud Firestore مشفرة ومربوطة بحسابك</p>
            </div>
          </div>
          <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold px-3 py-1 rounded-full flex items-center gap-1.5 self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            مزامنة سحابية نشطة
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
            <span className="text-slate-400 font-medium text-[11px]">البريد الإلكتروني المعتمد:</span>
            <p className="font-bold text-slate-800 font-mono" dir="ltr">
              {currentUser?.email || "غير مسجل"}
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
            <span className="text-slate-400 font-medium text-[11px]">معرف المستخدم الفريد (UID):</span>
            <p className="font-mono text-[11px] text-slate-600 truncate" dir="ltr">
              {currentUser?.uid || "---"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            بياناتك محفوظة بشكل منعزل تماماً ويتم تحديثها فورياً على أي جهاز تسجل الدخول منه.
          </p>

          <button
            type="button"
            onClick={() => logout()}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            تسجيل الخروج من الحساب
          </button>
        </div>
      </div>

      {/* 1. Edit Shop/Company Profile Form */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
        <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 border-b border-slate-100 pb-2">
          <Building className="w-4 h-4 text-blue-600" /> هويّة المتجر والتفاصيل المالية
        </h2>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Store Logo via Firebase Storage */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden flex items-center justify-center shrink-0">
                {settings.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt="شعار المتجر"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ImageIcon className="w-6 h-6 text-slate-300" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">شعار المتجر والمؤسسة (Firebase Storage)</p>
                <p className="text-[11px] text-slate-500">
                  يظهر الشعار في ترويسة الفواتير وسندات القبض المطبوعة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={logoInputRef}
                onChange={handleLogoUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                disabled={logoUploading}
                onClick={() => (isNativeAndroid() ? handleNativeLogoPick("gallery") : logoInputRef.current?.click())}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              >
                {logoUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                ) : (
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                )}
                {settings.logoUrl ? "تغيير الشعار" : "رفع شعار جديد"}
              </button>
              {isNativeAndroid() && (
                <button
                  type="button"
                  disabled={logoUploading}
                  onClick={() => handleNativeLogoPick("camera")}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                  التقاط
                </button>
              )}
              {settings.logoUrl && (
                <button
                  type="button"
                  disabled={logoUploading}
                  onClick={handleRemoveLogo}
                  className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  title="حذف الشعار"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1">اسم المؤسسة / المحل التجاري *</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-bold focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1">رقم الهاتف الفعال للمحل</label>
              <input
                type="text"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-right focus:outline-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1">العنوان والمقر الرئيسي</label>
            <input
              type="text"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1">رمز العملة المستخدمة بالنظام *</label>
              <input
                type="text"
                required
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="مثال: د.ع"
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-blue-500"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  { symbol: "د.ع", name: "دينار عراقي" },
                  { symbol: "ر.س", name: "ريال سعودي" },
                  { symbol: "$", name: "دولار" },
                  { symbol: "د.ك", name: "دينار كويتي" },
                  { symbol: "د.إ", name: "درهم إماراتي" },
                  { symbol: "د.أ", name: "دينار أردني" },
                  { symbol: "ج.م", name: "جنيه مصري" },
                ].map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => setCurrency(item.symbol)}
                    className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      currency === item.symbol
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    {item.symbol} ({item.name})
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1">المسمّى الوظيفي للتوقيعات بالفواتير</label>
              <input
                type="text"
                value={signaturePlaceholder}
                onChange={(e) => setSignaturePlaceholder(e.target.value)}
                placeholder="أمين الصندوق / المدير العام"
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm cursor-pointer transition-colors"
            >
              حفظ هوية المتجر والعملة
            </button>
          </div>
        </form>
      </div>

      {/* 2. Data Backup and Portability */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            النسخ الاحتياطي واستعادة قاعدة البيانات (JSON)
          </h2>
          <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100 font-bold flex items-center gap-1 self-start sm:self-auto">
            <ShieldCheck className="w-3.5 h-3.5" />
            تخزين محلي آمن ومحمي
          </span>
        </div>

        <p className="text-slate-500 text-xs leading-relaxed">
          جميع بيانات حساباتك، العملاء، فواتير المبيعات، سندات القبض، وجرد المستودع يتم حفظها محلياً. يتيح لك النظام تصدير نسخة كاملة بصيغة <strong>JSON</strong> قابلة للاستيراد في أي وقت أو عند الانتقال لجهاز أو متصفح آخر لضمان عدم ضياع أي سجل محاسبي.
        </p>

        {/* Current Database Summary Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-bold">العملاء</p>
              <p className="text-sm font-extrabold text-slate-800 font-mono">{customers.length}</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-bold">الفواتير</p>
              <p className="text-sm font-extrabold text-slate-800 font-mono">{invoices.length}</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-bold">البضائع</p>
              <p className="text-sm font-extrabold text-slate-800 font-mono">{products.length}</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-bold">سندات القبض</p>
              <p className="text-sm font-extrabold text-slate-800 font-mono">{payments.length}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Export JSON Button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex flex-col items-center text-center p-5 border-2 border-dashed border-blue-200 bg-blue-50/60 hover:bg-blue-50/90 hover:border-blue-300 text-blue-900 rounded-2xl transition-all cursor-pointer group shadow-2xs"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shadow-sm">
              <HardDriveDownload className="w-6 h-6" />
            </div>
            <span className="font-bold text-xs text-blue-900 mb-1">
              تصدير قاعدة البيانات كملف JSON
            </span>
            <span className="text-[11px] text-blue-700/80 font-sans">
              تحميل ملف نسخة احتياطية شاملة وحفظها على جهازك
            </span>
          </button>

          {/* Import JSON Button */}
          <button
            type="button"
            onClick={handleImportClick}
            className="flex flex-col items-center text-center p-5 border-2 border-dashed border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50/90 hover:border-emerald-300 text-emerald-900 rounded-2xl transition-all cursor-pointer group shadow-2xs"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shadow-sm">
              <Upload className="w-6 h-6" />
            </div>
            <span className="font-bold text-xs text-emerald-900 mb-1">
              استيراد واستعادة نسخة احتياطية
            </span>
            <span className="text-[11px] text-emerald-700/80 font-sans">
              استرجاع السجلات من ملف JSON محفوظ مسبقاً
            </span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,application/json"
            className="hidden"
          />
        </div>
      </div>

      {/* Confirmation Modal for Imported File Inspection */}
      {pendingBackup && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  معاينة وتأكيد استيراد النسخة الاحتياطية
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  الملف: {pendingBackup.file.name}
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                <strong>تنبيه:</strong> سيؤدي استيراد هذه النسخة إلى استبدال كافة السجلات الحالية في قاعدة البيانات ببيانات هذا الملف. يوصى بأخذ نسخة احتياطية من بياناتك الحالية قبل المتابعة.
              </p>
            </div>

            {/* Inspect File Contents Summary */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">محتويات النسخة الاحتياطية المراد استعادتها:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold">العملاء</p>
                  <p className="text-base font-extrabold text-blue-700 font-mono">
                    {pendingBackup.stats.customersCount}
                  </p>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold">الفواتير</p>
                  <p className="text-base font-extrabold text-indigo-700 font-mono">
                    {pendingBackup.stats.invoicesCount}
                  </p>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold">المنتجات</p>
                  <p className="text-base font-extrabold text-amber-700 font-mono">
                    {pendingBackup.stats.productsCount}
                  </p>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold">الدفعات</p>
                  <p className="text-base font-extrabold text-emerald-700 font-mono">
                    {pendingBackup.stats.paymentsCount}
                  </p>
                </div>
              </div>
              {pendingBackup.stats.exportDate && (
                <p className="text-[11px] text-slate-500 text-center font-mono pt-1">
                  تاريخ إنشاء النسخة: {new Date(pendingBackup.stats.exportDate).toLocaleString("ar-IQ")}
                </p>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingBackup(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-4 h-4" />
                تأكيد واستعادة البيانات الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2.5. Firebase Cloud Backups */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Cloud className="w-4 h-4 text-blue-600" />
              النسخ الاحتياطي السحابي التلقائي (Firebase Cloud Backups)
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              يتم حفظ واسترجاع النسخ السحابية مباشرة في حسابك بـ Firebase لحماية كامل بياناتك من الضياع
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowBackupNameInput(!showBackupNameInput)}
            className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Cloud className="w-3.5 h-3.5" />
            أخذ نسخة سحابية جديدة الآن
          </button>
        </div>

        {/* New Backup Name Form */}
        {showBackupNameInput && (
          <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-3">
            <label className="block text-xs font-bold text-slate-700">
              تسمية النسخة السحابية (اختياري):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customBackupName}
                onChange={(e) => setCustomBackupName(e.target.value)}
                placeholder={`نسخة احتياطية ${new Date().toLocaleDateString("ar-SA")}`}
                className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
              />
              <button
                type="button"
                disabled={creatingCloudBackup}
                onClick={handleCreateCloudBackup}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {creatingCloudBackup ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                حفظ في السحابة
              </button>
              <button
                type="button"
                onClick={() => setShowBackupNameInput(false)}
                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* Backups List */}
        {cloudBackups.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <Cloud className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-600">لا توجد نسخ احتياطية سحابية محفوظة بعد</p>
            <p className="text-[11px] text-slate-400 mt-1">
              انقر على &quot;أخذ نسخة سحابية جديدة الآن&quot; لإنشاء نقطة استعادة آمنة في Firebase
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {cloudBackups.map((b) => (
              <div
                key={b.id}
                className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">{b.name}</span>
                    <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-mono">
                      {new Date(b.createdAt).toLocaleDateString("ar-SA")} {new Date(b.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">{b.stats}</p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm(`هل أنت متأكد من استعادة النسخة السحابية: "${b.name}"؟ سيتم استبدال البيانات الحالية.`)) {
                        if (onRestoreCloudBackup) {
                          const res = await onRestoreCloudBackup(b.id);
                          if (res?.success) {
                            showMsg("success", "تمت استعادة النسخة الاحتياطية بنجاح!");
                          } else {
                            showMsg("error", res?.error || "فشلت الاستعادة.");
                          }
                        }
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                    استعادة
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm(`هل تريد بالتأكيد حذف هذه النسخة السحابية من Firebase؟`)) {
                        if (onDeleteCloudBackup) {
                          await onDeleteCloudBackup(b.id);
                          showMsg("success", "تم حذف النسخة السحابية بنجاح.");
                        }
                      }
                    }}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                    title="حذف النسخة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. System Resets */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
        <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 border-b border-slate-100 pb-2">
          <Trash2 className="w-4 h-4 text-rose-600" /> أدوات الصيانة والتصفير وإعادة التعيين
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleResetToDemo}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-amber-600 animate-spin-hover" />
            إعادة تعيين عينات البيانات التوضيحية للتدريب
          </button>

          <button
            onClick={handleClearEverything}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            مسح كافة السجلات الحالية والبدء من الصفر
          </button>
        </div>
      </div>
    </div>
  );
}
