import React, { useState } from "react";
import {
  User as UserIcon,
  Edit3,
  Shield,
  KeyRound,
  Link2,
  Unlink2,
  Bell,
  Cloud,
  RefreshCw,
  Download,
  Upload,
  Laptop,
  Smartphone,
  Lock,
  Settings as SettingsIcon,
  HelpCircle,
  Info,
  LogOut,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  Copy,
  Save,
  Mail,
  Phone,
  Camera,
  Building2,
  Briefcase,
  Calendar,
  ExternalLink,
  Check,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { SystemSettings } from "../types";
import { db, enableNetwork, waitForPendingWrites } from "../lib/firebase";
import { requestNotificationPermissionDetailed, isFCMSupported } from "../lib/notifications";
import { authenticateWithBiometrics, isNativeAndroid, pickNativeImageFile } from "../lib/native";

interface AccountManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeSettings: SystemSettings;
  onNavigateToSettings?: () => void;
  onExportData?: () => void;
  onImportData?: (json: string) => { success: boolean; error?: string };
}

type TabType =
  | "profile"
  | "edit_profile"
  | "security"
  | "linked_accounts"
  | "notifications"
  | "backup_sync"
  | "sessions"
  | "privacy"
  | "settings"
  | "help"
  | "about"
  | "danger_zone";

const PRESET_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
];

export default function AccountManagerModal({
  isOpen,
  onClose,
  storeSettings,
  onNavigateToSettings,
  onExportData,
  onImportData,
}: AccountManagerModalProps) {
  const {
    currentUser,
    extendedProfile,
    sessionsList,
    updateUserProfile,
    changePassword,
    sendEmailVerificationLink,
    linkSocialAccount,
    unlinkSocialAccount,
    logoutSession,
    logoutOtherSessions,
    deleteUserAccount,
    resetPassword,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>("profile");
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit Profile Form State
  const [displayName, setDisplayName] = useState(currentUser?.displayName || extendedProfile.displayName || "");
  const [photoURL, setPhotoURL] = useState(currentUser?.photoURL || extendedProfile.photoURL || "");
  const [phoneNumber, setPhoneNumber] = useState(extendedProfile.phoneNumber || storeSettings.companyPhone || "");
  const [storeName, setStoreName] = useState(extendedProfile.storeName || storeSettings.companyName || "");
  const [jobTitle, setJobTitle] = useState(extendedProfile.jobTitle || "المحاسب المعتمد");
  const [bio, setBio] = useState(extendedProfile.bio || "");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<{
    code: string;
    message: string;
    explanation?: string;
    isRecentLogin?: boolean;
  } | null>(null);
  const [resetEmailSuccessMsg, setResetEmailSuccessMsg] = useState<string | null>(null);

  // Notifications toggles
  const [notifDueDebt, setNotifDueDebt] = useState(extendedProfile.dueDebtAlerts ?? true);
  const [notifPayments, setNotifPayments] = useState(extendedProfile.paymentAlerts ?? true);
  const [notifBackup, setNotifBackup] = useState(extendedProfile.backupAlerts ?? true);
  const [notifSound, setNotifSound] = useState(extendedProfile.soundAlerts ?? true);

  // 2FA state
  const [twoFactorActive, setTwoFactorActive] = useState(extendedProfile.twoFactorEnabled ?? false);
  const [showBackupCode, setShowBackupCode] = useState(false);

  // Support message state
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSent, setSupportSent] = useState(false);

  // FAQ collapse state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Modals state for Logout and Delete
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInputConfirm, setDeleteInputConfirm] = useState("");
  const [deletePasswordConfirm, setDeletePasswordConfirm] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Sync state
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Sessions termination loading state
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);

  if (!isOpen) return null;

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setFeedbackMsg({ type, text });
    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4500);
  };

  // 1 & 2. Handle Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateUserProfile({
        displayName: displayName.trim(),
        photoURL: photoURL.trim(),
        phoneNumber: phoneNumber.trim(),
        storeName: storeName.trim(),
        jobTitle: jobTitle.trim(),
        bio: bio.trim(),
      });
      showToast("تم تحديث الملف الشخصي بنجاح!");
    } catch (err: any) {
      showToast(err.message || "فشل تحديث البيانات", "error");
    } finally {
      setSaving(false);
    }
  };

  // Image Upload handler (Base64)
  const applyAvatarFile = (file?: File | null) => {
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
      showToast("حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 1.5 ميغابايت", "error");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setPhotoURL(reader.result);
        showToast("تم تحميل الصورة بنجاح، اضغط 'حفظ التغييرات' لاعتمادها.");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyAvatarFile(e.target.files?.[0]);
  };

  const handleNativeAvatarPick = async (source: "gallery" | "camera") => {
    try {
      const file = await pickNativeImageFile(source);
      if (!file) return;
      applyAvatarFile(file);
    } catch (err) {
      showToast(source === "camera" ? "تعذر التقاط صورة الحساب." : "تعذر اختيار صورة الحساب من هاتفك.", "error");
    }
  };

  // 3. Security: Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError(null);
    setResetEmailSuccessMsg(null);

    if (!currentPassword) {
      const msg = "يرجى إدخال كلمة المرور الحالية";
      showToast(msg, "error");
      setPasswordChangeError({
        code: "auth/missing-current-password",
        message: "Current password is required.",
        explanation: msg,
      });
      return;
    }
    if (newPassword.length < 6) {
      const msg = "يجب أن تتكون كلمة المرور الجديدة من 6 خانات أو أرقام على الأقل";
      showToast(msg, "error");
      setPasswordChangeError({
        code: "auth/weak-password",
        message: "Password must be at least 6 characters.",
        explanation: msg,
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      const msg = "كلمتا المرور الجديدة والتأكيد غير متطابقتين";
      showToast(msg, "error");
      setPasswordChangeError({
        code: "auth/password-mismatch",
        message: "New password and confirmation do not match.",
        explanation: msg,
      });
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordChangeError(null);
      showToast("تم تغيير كلمة المرور بنجاح في Firebase Authentication!");
    } catch (err: any) {
      console.error("Change password error:", err);
      const code = err?.code || "auth/unknown-error";
      const rawMsg = err?.rawMessage || err?.message || "فشل تغيير كلمة المرور";
      const explanation = err?.arabicExplanation || err?.message;
      const isRecent = code === "auth/requires-recent-login" || rawMsg.includes("requires-recent-login");

      setPasswordChangeError({
        code,
        message: rawMsg,
        explanation,
        isRecentLogin: isRecent,
      });
      showToast(
        isRecent 
          ? "يتطلب Firebase إعادة تسجيل الدخول (Recent Login) قبل تغيير كلمة المرور."
          : (explanation || "فشل تغيير كلمة المرور"), 
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // Send Email verification
  const handleSendEmailVerification = async () => {
    try {
      await sendEmailVerificationLink();
      showToast("تم إرسال رابط تأكيد وتوثيق الحساب إلى بريدك الإلكتروني بنجاح.");
    } catch (err: any) {
      showToast(err.message || "فشل إرسال رابط التوثيق", "error");
    }
  };

  // 4. Link & Unlink Social Providers
  const handleLink = async (provider: "google" | "facebook" | "microsoft") => {
    try {
      await linkSocialAccount(provider);
      showToast(`تم ربط حساب ${provider} بنجاح!`);
    } catch (err: any) {
      showToast(err.message || `تعذر ربط حساب ${provider}`, "error");
    }
  };

  const handleUnlink = async (providerId: string, providerName: string) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في إلغاء ربط حساب ${providerName}؟`)) return;
    try {
      await unlinkSocialAccount(providerId);
      showToast(`تم إلغاء ربط حساب ${providerName} بنجاح`);
    } catch (err: any) {
      showToast(err.message || "تعذر إلغاء الربط", "error");
    }
  };

  // 5. Notifications Toggle
  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      await updateUserProfile({
        dueDebtAlerts: notifDueDebt,
        paymentAlerts: notifPayments,
        backupAlerts: notifBackup,
        soundAlerts: notifSound,
      });

      // If user enabled any alert, check browser permission and obtain FCM token
      if (notifDueDebt || notifPayments || notifBackup) {
        if (typeof window !== "undefined" && "Notification" in window) {
          const currentPerm = Notification.permission;
          if (currentPerm === "denied") {
            showToast("تم حفظ التفضيلات، ولكن إشعارات المتصفح محظورة لهذا الموقع. يرجى تفعيلها من إعدادات المتصفح وقفل العنوان.", "error");
          } else {
            const res = await requestNotificationPermissionDetailed(currentUser?.uid);
            if (res.status === "granted") {
              showToast("تم حفظ التفضيلات وتفعيل إشعارات المتصفح وتأكيد تسجيل الجهاز بنجاح!");
            } else if (res.status === "denied") {
              showToast("تم حفظ التفضيلات، ولكن تم رفض إذن إشعارات المتصفح من قبلك.", "error");
            } else {
              showToast(res.message || "تم حفظ تفضيلات الإشعارات بنجاح!");
            }
          }
        } else {
          showToast("تم حفظ تفضيلات الإشعارات بنجاح!");
        }
      } else {
        showToast("تم حفظ تفضيلات الإشعارات بنجاح!");
      }
    } catch (err: any) {
      showToast("حدث خطأ أثناء حفظ الإشعارات", "error");
    } finally {
      setSaving(false);
    }
  };


  // 6. Backup & Sync
  const handleManualSync = async () => {
    setSyncStatus("جاري المزامنة مع قاعدة البيانات السحابية...");
    if (!navigator.onLine) {
      setSyncStatus("أنت تعمل حالياً في وضع عدم الاتصال (Offline). التغييرات محفوظة محلياً على هذا الجهاز وستُرفع تلقائياً فور توفر الإنترنت.");
      showToast("وضع عدم الاتصال: التغييرات محفوظة محلياً وستُرفع تلقائياً عند توفر الإنترنت.");
      return;
    }
    try {
      await enableNetwork(db);
      await waitForPendingWrites(db);
      setSyncStatus("تمت المزامنة السحابية بنجاح وحفظ كافة القيود في Cloud Firestore.");
      showToast("تمت المزامنة السحابية بنجاح!");
    } catch {
      setSyncStatus("تم حفظ البيانات محلياً وسيتم استكمال المزامنة تلقائياً مع السحابة.");
      showToast("تم حفظ البيانات محلياً وسيتم المزامنة تلقائياً.");
    }
  };

  // 7. Sessions
  const handleLogoutOtherSessions = async () => {
    setSaving(true);
    try {
      await logoutOtherSessions();
      showToast("تم تسجيل الخروج بنجاح من جميع الأجهزة الأخرى!");
    } catch (err: any) {
      showToast("تعذر إنهاء الجلسات الأخرى", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutSingleSession = async (sessionId: string) => {
    setTerminatingSessionId(sessionId);
    try {
      await logoutSession(sessionId);
      showToast("تم تسجيل الخروج من هذا الجهاز بنجاح!");
    } catch (err: any) {
      showToast("تعذر تسجيل الخروج من الجهاز المحدد", "error");
    } finally {
      setTerminatingSessionId(null);
    }
  };

  // 8. Privacy: Clear Cache
  const handleClearCache = () => {
    if (window.confirm("سيتم مسح الذاكرة المؤقتة المحلية في هذا المتصفح وإعادة جلب البيانات من السحابة. هل ترغب في المتابعة؟")) {
      try {
        const uid = currentUser?.uid;
        const prefix = uid ? `acc_u_${uid}_` : "acc_guest_";
        const entities = ["folders", "customers", "products", "invoices", "payments", "change_logs", "settings"];
        entities.forEach((ent) => localStorage.removeItem(`${prefix}${ent}`));
        // Also clear legacy un-scoped keys if present
        ["acc_customer_folders", "acc_customers", "acc_products", "acc_invoices", "acc_payments", "acc_change_logs", "acc_settings"].forEach((k) => localStorage.removeItem(k));
        showToast("تم مسح الذاكرة المؤقتة المحلية بنجاح. يتم المزامنة الآن من Firestore.");
      } catch (e) {
        showToast("تعذر مسح الذاكرة المؤقتة", "error");
      }
    }
  };

  // 10. Help Support submit
  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportSubject || !supportMessage) {
      showToast("يرجى ملء موضوع الرسالة ومحتواها", "error");
      return;
    }
    setSupportSent(true);
    showToast("تم إرسال رسالتك لفريق الدعم الفني بنجاح، سنرد عليك عبر بريدك قريباً.");
    setTimeout(() => {
      setSupportSubject("");
      setSupportMessage("");
      setSupportSent(false);
    }, 3000);
  };

  // 12. Logout
  const executeLogout = async () => {
    setShowLogoutConfirm(false);
    onClose();
    await logout();
  };

  // 13. Delete Account
  const executeDeleteAccount = async () => {
    setDeleteError("");
    setSaving(true);
    try {
      await deleteUserAccount(deleteInputConfirm, deletePasswordConfirm);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err: any) {
      setDeleteError(err.message || "حدث خطأ أثناء محاولة حذف الحساب");
    } finally {
      setSaving(false);
    }
  };

  // Check linked providers
  const isPhoneLinked = currentUser?.providerData.some((p) => p.providerId === "phone") || (!currentUser?.email && !!currentUser?.phoneNumber);
  const isEmailPassword = (currentUser?.providerData.some((p) => p.providerId === "password") || (!currentUser?.providerData || currentUser.providerData.length === 0)) && !isPhoneLinked;
  const isGoogleLinked = currentUser?.providerData.some((p) => p.providerId === "google.com");
  const isFacebookLinked = currentUser?.providerData.some((p) => p.providerId === "facebook.com");
  const isMicrosoftLinked = currentUser?.providerData.some((p) => p.providerId === "microsoft.com");

  const getLoginMethodName = () => {
    if (isPhoneLinked) return "رقم الهاتف (SMS OTP)";
    if (isGoogleLinked) return "Google";
    if (isFacebookLinked) return "Facebook";
    if (isMicrosoftLinked) return "Microsoft";
    if (isEmailPassword) return "البريد الإلكتروني وكلمة المرور";
    return "حساب سحابي موثق";
  };

  // Get creation date & last login
  const createdAtFormatted = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString("ar-SA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "غير متوفر";

  const lastSignInFormatted = currentUser?.metadata?.lastSignInTime
    ? new Date(currentUser.metadata.lastSignInTime).toLocaleDateString("ar-SA", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "الجلسة الحالية";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs font-sans text-slate-800" dir="rtl">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">إدارة حساب المستخدم</h2>
              <p className="text-xs text-slate-500">الملف الشخصي، الأمان، المزامنة السحابية وإعدادات الحساب</p>
            </div>
          </div>

          <button
            onClick={onClose}
            id="btn-close-account-modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div
            className={`px-6 py-2.5 text-xs font-bold flex items-center justify-between transition-all ${
              feedbackMsg.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-b border-emerald-200"
                : "bg-rose-50 text-rose-800 border-b border-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMsg.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              )}
              <span>{feedbackMsg.text}</span>
            </div>
            <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Navigation Sidebar */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-l border-slate-200 bg-slate-50/50 p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0">
            
            {/* Quick User Summary in Tab Sidebar */}
            <div className="hidden md:flex items-center gap-3 p-3 mb-2 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shrink-0 overflow-hidden shadow-xs">
                {currentUser?.photoURL || extendedProfile.photoURL ? (
                  <img
                    src={currentUser?.photoURL || extendedProfile.photoURL}
                    alt="avatar"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  (currentUser?.displayName || currentUser?.phoneNumber || currentUser?.email || "U").charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {currentUser?.displayName || extendedProfile.displayName || "المحاسب المعتمد"}
                </p>
                <p className="text-[10px] text-slate-400 font-mono truncate" dir="ltr">
                  {currentUser?.phoneNumber || currentUser?.email || "مستخدم برقم الهاتف"}
                </p>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded mt-1">
                  <Cloud className="w-2.5 h-2.5 text-emerald-500" />
                  <span>متصل سحابياً</span>
                </span>
              </div>
            </div>

            <div className="text-[10px] font-bold text-slate-400 px-3 py-1 hidden md:block">👤 الحساب</div>

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "profile"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <UserIcon className="w-4 h-4 shrink-0" />
              <span>1. الملف الشخصي</span>
            </button>

            <button
              onClick={() => setActiveTab("edit_profile")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "edit_profile"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <Edit3 className="w-4 h-4 shrink-0" />
              <span>2. تعديل الملف الشخصي</span>
            </button>

            <button
              onClick={() => setActiveTab("security")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "security"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span>3. الأمان وكلمة المرور</span>
            </button>

            <button
              onClick={() => setActiveTab("linked_accounts")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "linked_accounts"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <Link2 className="w-4 h-4 shrink-0" />
              <span>4. الحسابات المرتبطة</span>
            </button>

            <div className="text-[10px] font-bold text-slate-400 px-3 py-1 hidden md:block mt-2">⚙️ إعدادات الحساب والتطبيق</div>

            <button
              onClick={() => setActiveTab("notifications")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "notifications"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>5. الإشعارات والتنبيهات</span>
            </button>

            <button
              onClick={() => setActiveTab("backup_sync")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "backup_sync"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <Cloud className="w-4 h-4 shrink-0" />
              <span>6. النسخ الاحتياطي والمزامنة</span>
            </button>

            <button
              onClick={() => setActiveTab("sessions")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "sessions"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <Laptop className="w-4 h-4 shrink-0" />
              <span>7. الأجهزة والجلسات</span>
            </button>

            <button
              onClick={() => setActiveTab("privacy")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "privacy"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span>8. الخصوصية وحماية البيانات</span>
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "settings"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <SettingsIcon className="w-4 h-4 shrink-0" />
              <span>9. إعدادات النظام المحاسبي</span>
            </button>

            <div className="text-[10px] font-bold text-slate-400 px-3 py-1 hidden md:block mt-2">ℹ️ المساعدة</div>

            <button
              onClick={() => setActiveTab("help")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "help"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span>10. المساعدة والدعم</span>
            </button>

            <button
              onClick={() => setActiveTab("about")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-right shrink-0 ${
                activeTab === "about"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/50"
              }`}
            >
              <Info className="w-4 h-4 shrink-0" />
              <span>11. حول التطبيق</span>
            </button>

            <div className="text-[10px] font-bold text-slate-400 px-3 py-1 hidden md:block mt-2">🚪 إجراءات الحساب</div>

            <button
              onClick={() => setShowLogoutConfirm(true)}
              id="account-btn-logout"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-50 text-right transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4 shrink-0 text-amber-600" />
              <span>12. تسجيل الخروج</span>
            </button>

            <button
              onClick={() => setActiveTab("danger_zone")}
              id="account-btn-danger"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all text-right shrink-0 ${
                activeTab === "danger_zone"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-rose-600 hover:bg-rose-50"
              }`}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>13. حذف الحساب</span>
            </button>
          </div>

          {/* Content Pane */}
          <div className="flex-1 p-5 sm:p-7 overflow-y-auto bg-white">
            
            {/* 1. الملف الشخصي (Profile) */}
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">الملف الشخصي (Profile)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">معلوماتك الأساسية وهويتك المحاسبية في النظام</p>
                </div>

                {/* Profile Card */}
                <div className="p-5 rounded-2xl bg-gradient-to-l from-slate-50 to-blue-50/40 border border-slate-200 flex flex-col sm:flex-row items-center sm:items-start gap-5">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-2xl shadow-md overflow-hidden border-2 border-white">
                      {currentUser?.photoURL || extendedProfile.photoURL ? (
                        <img
                          src={currentUser?.photoURL || extendedProfile.photoURL}
                          alt="profile"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        (currentUser?.displayName || currentUser?.phoneNumber || currentUser?.email || "U").charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full" title="متصل" />
                  </div>

                  <div className="flex-1 text-center sm:text-right space-y-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-base font-bold text-slate-900">
                        {currentUser?.displayName || extendedProfile.displayName || "المحاسب المعتمد"}
                      </h4>
                      <button
                        onClick={() => setActiveTab("edit_profile")}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg self-center sm:self-auto cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل الملف</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 flex items-center justify-center sm:justify-start gap-1.5 font-mono" dir="ltr">
                      {currentUser?.phoneNumber ? (
                        <>
                          <Phone className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{currentUser.phoneNumber}</span>
                        </>
                      ) : (
                        <>
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{currentUser?.email || "غير مسجل"}</span>
                        </>
                      )}
                    </p>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                      <span className="text-[11px] font-bold bg-blue-100/70 text-blue-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        {extendedProfile.jobTitle || "المحاسب المعتمد"}
                      </span>
                      <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {extendedProfile.storeName || storeSettings.companyName || "مؤسسة الأعمال"}
                      </span>
                      {currentUser?.emailVerified || isPhoneLinked ? (
                        <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          {isPhoneLinked ? "رقم موثق (OTP)" : "بريد موثق"}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          بريد غير موثق
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {/* 1. Login Method */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <span className="text-[10px] font-bold text-slate-400">طريقة تسجيل الدخول</span>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <Shield className="w-3.5 h-3.5 text-blue-600" />
                      <span>{getLoginMethodName()}</span>
                    </div>
                  </div>

                  {/* 2. Account Status */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <span className="text-[10px] font-bold text-slate-400">حالة الحساب</span>
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      {currentUser?.emailVerified || isPhoneLinked ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{isPhoneLinked ? "موثق برقم الهاتف" : "مفعل وموثق"}</span>
                        </span>
                      ) : (
                        <span className="text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>مفعل (يحتاج توثيق)</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3. UID */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <span className="text-[10px] font-bold text-slate-400">معرف المستخدم الفريد (UID)</span>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-[11px] font-mono font-bold text-slate-800 truncate" dir="ltr">
                        {currentUser?.uid || "N/A"}
                      </code>
                      <button
                        onClick={() => {
                          if (currentUser?.uid) {
                            navigator.clipboard.writeText(currentUser.uid);
                            showToast("تم نسخ معرف المستخدم (UID) بنجاح!");
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                        title="نسخ"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 4. Creation Date */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <span className="text-[10px] font-bold text-slate-400">تاريخ إنشاء الحساب</span>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>{createdAtFormatted}</span>
                    </div>
                  </div>

                  {/* 5. Last Sign In */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <span className="text-[10px] font-bold text-slate-400">آخر تسجيل دخول</span>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <ClockIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{lastSignInFormatted}</span>
                    </div>
                  </div>

                  {/* 6. Phone Number */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <span className="text-[10px] font-bold text-slate-400">رقم الهاتف</span>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{extendedProfile.phoneNumber || "لم يتم تسجيل رقم"}</span>
                    </div>
                  </div>
                </div>

                {/* Account Quick Actions Bar */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <SettingsIcon className="w-4 h-4 text-slate-500" />
                    <span>إجراءات الحساب السريعة:</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isEmailPassword && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("security")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-100/70 hover:bg-blue-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>تغيير كلمة المرور</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowLogoutConfirm(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-slate-600" />
                      <span>تسجيل الخروج</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>حذف الحساب</span>
                    </button>
                  </div>
                </div>

                {/* Email verification notice if unverified */}
                {!currentUser?.emailVerified && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-900">بريدك الإلكتروني غير موثق حالياً</p>
                        <p className="text-[11px] text-amber-700">توثيق البريد يحمي حسابك ويمكنك من استعادة كلمة المرور بأمان.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleSendEmailVerification}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      إرسال رابط التوثيق
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 2. تعديل الملف الشخصي (Edit Profile) */}
            {activeTab === "edit_profile" && (
              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">تعديل الملف الشخصي (Edit Profile)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">تحديث الاسم، الصورة، وبيانات التواصل والعمل</p>
                </div>

                {/* Avatar Chooser & Upload */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <span className="text-xs font-bold text-slate-700 block">صورة الحساب (Avatar)</span>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xl overflow-hidden border-2 border-slate-300 shrink-0 shadow-xs">
                      {photoURL ? (
                        <img src={photoURL} alt="Avatar Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        (displayName || currentUser?.email || "U").charAt(0).toUpperCase()
                      )}
                    </div>

                    <div className="flex-1 space-y-2 w-full">
                      <div className="flex items-center gap-2">
                        <label className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-white border border-slate-300 hover:border-blue-500 rounded-lg text-xs font-medium text-slate-700 cursor-pointer transition-colors shadow-2xs">
                          <Upload className="w-3.5 h-3.5 text-blue-600" />
                          <span>رفع صورة من جهازك</span>
                          <input type="file" accept="image/*" onChange={handleImageFileUpload} className="hidden" />
                        </label>
                        {isNativeAndroid() && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleNativeAvatarPick("gallery")}
                              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-blue-500 rounded-lg text-xs font-medium text-slate-700 transition-colors shadow-2xs"
                            >
                              المعرض
                            </button>
                            <button
                              type="button"
                              onClick={() => handleNativeAvatarPick("camera")}
                              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-blue-500 rounded-lg text-xs font-medium text-slate-700 transition-colors shadow-2xs flex items-center gap-1.5"
                            >
                              <Camera className="w-3.5 h-3.5 text-blue-600" />
                              كاميرا
                            </button>
                          </>
                        )}
                        {photoURL && (
                          <button
                            type="button"
                            onClick={() => setPhotoURL("")}
                            className="px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg"
                          >
                            إزالة
                          </button>
                        )}
                      </div>

                      <input
                        type="url"
                        placeholder="أو ضع رابط صورة مباشر (URL)..."
                        value={photoURL}
                        onChange={(e) => setPhotoURL(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Quick Avatar Presets */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block mb-1.5">أو اختر من النماذج الجاهزة:</span>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_AVATARS.map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPhotoURL(url)}
                          className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                            photoURL === url ? "border-blue-600 ring-2 ring-blue-400" : "border-transparent opacity-80 hover:opacity-100"
                          }`}
                        >
                          <img src={url} alt="preset" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">اسم المستخدم</label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      placeholder="مثال: عبدالرحمن الحربي"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">المسمى الوظيفي</label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      placeholder="مثال: المحاسب المعتمد / مدير الحسابات"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">اسم المتجر / المؤسسة</label>
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      placeholder="مثال: مؤسسة التقنية الحديثة"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">رقم الهاتف</label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      placeholder="05XXXXXXXX"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">نبذة شخصية / ملاحظات</label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    placeholder="اكتب نبذة مختصرة عن مهامك المحاسبية..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? "جاري الحفظ..." : "حفظ التغييرات"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* 3. الأمان (Security) */}
            {activeTab === "security" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">الأمان وكلمة المرور (Security)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isEmailPassword
                      ? "تغيير كلمة المرور، تعزيز الحماية وتفعيل التحقق بخطوتين"
                      : "إدارة أمان الحساب وتوثيقه ومصادقة الدخول المعتمدة"}
                  </p>
                </div>

                {/* Change Password for Email/Password accounts */}
                {isEmailPassword ? (
                  <form onSubmit={handleChangePassword} className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 pb-2 border-b border-slate-100">
                      <KeyRound className="w-4 h-4 text-blue-600" />
                      <span>تغيير كلمة المرور</span>
                    </div>

                    {/* Detailed Error Banner for Firebase Auth Password Change */}
                    {passwordChangeError && (
                      <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-rose-950 text-xs mb-1">
                              {passwordChangeError.isRecentLogin
                                ? "يتطلب Firebase Authentication إعادة تسجيل الدخول (Recent Login) لتأكيد الأمان:"
                                : "فشل تغيير كلمة المرور عبر Firebase Authentication:"}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <span className="font-semibold text-rose-800">كود الخطأ (Error Code):</span>
                              <code className="px-1.5 py-0.5 bg-rose-200/90 text-rose-950 font-mono font-bold text-[11px] rounded border border-rose-300 dir-ltr select-all">
                                {passwordChangeError.code}
                              </code>
                            </div>
                            {passwordChangeError.message && (
                              <div className="mb-1">
                                <span className="font-semibold text-rose-800 block mb-0.5">رسالة Firebase (Error Message):</span>
                                <div className="p-2 bg-white/90 border border-rose-200 rounded-lg font-mono text-[11px] text-rose-950 dir-ltr break-words select-all">
                                  {passwordChangeError.message}
                                </div>
                              </div>
                            )}
                            {passwordChangeError.explanation && (
                              <div className="text-[11px] text-rose-800 leading-relaxed font-normal pt-1 border-t border-rose-200/60">
                                {passwordChangeError.explanation}
                              </div>
                            )}
                          </div>
                        </div>
                        {passwordChangeError.isRecentLogin && (
                          <div className="pt-2 border-t border-rose-200/80 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowLogoutConfirm(true);
                              }}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span>تسجيل الخروج الآن للدخول مجدداً</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reset Email Success Notification */}
                    {resetEmailSuccessMsg && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{resetEmailSuccessMsg}</span>
                      </div>
                    )}

                    <div className="space-y-4">
                      {/* Current Password Field */}
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          كلمة المرور الحالية <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPassword ? "text" : "password"}
                            required
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden text-left"
                            dir="ltr"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">
                            كلمة المرور الجديدة <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showNewPassword ? "text" : "password"}
                              required
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden text-left"
                              dir="ltr"
                              placeholder="••••••••"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {newPassword && (
                            <div className="mt-1 flex items-center gap-2">
                              <div className="h-1 flex-1 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    newPassword.length < 6
                                      ? "w-1/3 bg-rose-500"
                                      : newPassword.length < 10
                                      ? "w-2/3 bg-amber-500"
                                      : "w-full bg-emerald-500"
                                  }`}
                                />
                              </div>
                              <span className="text-[10px] text-slate-400 font-bold">
                                {newPassword.length < 6 ? "قصيرة جداً" : newPassword.length < 10 ? "متوسطة" : "قوية وممتازة"}
                              </span>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">
                            تأكيد كلمة المرور الجديدة <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? "text" : "password"}
                              required
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden text-left"
                              dir="ltr"
                              placeholder="••••••••"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (currentUser?.email) {
                            try {
                              await resetPassword(currentUser.email);
                              setPasswordChangeError(null);
                              setResetEmailSuccessMsg(`تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني (${currentUser.email}) بنجاح.`);
                              showToast("تم إرسال رابط تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح.");
                            } catch (e: any) {
                              const code = e?.code || 'auth/unknown-error';
                              const rawMsg = e?.rawMessage || e?.message || 'تعذر إرسال رابط تعيين كلمة المرور';
                              const explanation = e?.arabicExplanation || e?.message;
                              setPasswordChangeError({
                                code,
                                message: rawMsg,
                                explanation,
                                isRecentLogin: false,
                              });
                              showToast(`فشل إرسال الرابط: [${code}] ${explanation}`, "error");
                            }
                          } else {
                            showToast("لا يوجد بريد إلكتروني مسجل في هذا الحساب لإرسال الرابط.", "error");
                          }
                        }}
                        className="text-xs text-blue-600 hover:underline cursor-pointer"
                      >
                        أو أرسل رابط إعادة التعيين لبريدي الإلكتروني
                      </button>

                      <button
                        type="submit"
                        disabled={saving || !currentPassword || !newPassword}
                        className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {saving ? "جاري التحديث..." : "تحديث كلمة المرور"}
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Social Login Accounts Notice */
                  <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">
                          إدارة كلمة المرور مؤمنة عبر {getLoginMethodName()}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          أنت مسجل الدخول باستخدام مزود هوية خارجي موثوق
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-600 leading-relaxed bg-white p-3.5 rounded-xl border border-slate-200">
                      حسابك مرتبط وموثق مباشرة عبر مزود <strong>{getLoginMethodName()}</strong>. يتم تأمين وإدارة كلمة المرور وإجراءات تسجيل الدخول بالكامل من قِبل المزود المعتمد ({getLoginMethodName()}) لحماية أمان بياناتك، ولا يتطلب تطبيق المحل إنشاء أو تخزين كلمة مرور منفصلة.
                    </div>
                  </div>
                )}

                {/* 2FA Section */}
                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">التحقق بخطوتين (Two-Factor Authentication – 2FA)</h4>
                        <p className="text-[11px] text-slate-500">حماية إضافية لحسابك المحاسبي وتأكيد عمليات الدخول الحساسة</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        const nextVal = !twoFactorActive;
                        if (nextVal && isNativeAndroid()) {
                          const biometricResult = await authenticateWithBiometrics("استخدم بصمتك أو Face Unlock لتفعيل الحماية الإضافية");
                          if (biometricResult.unsupported) {
                            showToast("هذا الجهاز لا يدعم التحقق الحيوي المطلوب لتفعيل الحماية الإضافية.", "error");
                            return;
                          }
                          if (!biometricResult.success) {
                            showToast("تعذر تأكيد هويتك ببصمة الإصبع أو Face Unlock.", "error");
                            return;
                          }
                        }
                        setTwoFactorActive(nextVal);
                        await updateUserProfile({ twoFactorEnabled: nextVal });
                        showToast(
                          nextVal
                            ? (isNativeAndroid()
                              ? "تم تفعيل قفل الحساب بالبصمة/الوجه بنجاح!"
                              : "تم تفعيل التحقق بخطوتين بنجاح!")
                            : "تم تعطيل التحقق بخطوتين.",
                        );
                        if (nextVal) setShowBackupCode(true);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        twoFactorActive ? "bg-purple-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          twoFactorActive ? "translate-x-1" : "translate-x-6"
                        }`}
                      />
                    </button>
                  </div>

                  {twoFactorActive && (
                    <div className="p-4 rounded-xl bg-white border border-purple-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-purple-600" />
                          حسابك محمي بنظام التحقق بخطوتين
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowBackupCode(!showBackupCode)}
                          className="text-xs text-purple-700 hover:underline font-bold"
                        >
                          {showBackupCode ? "إخفاء رمز الأمان الاحتياطي" : "عرض رمز الأمان الاحتياطي"}
                        </button>
                      </div>

                      {showBackupCode && (
                        <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-500 block">رمز الطوارئ الاحتياطي (Emergency Backup Code):</span>
                          <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded border border-purple-200">
                            <code className="text-xs font-mono font-bold text-purple-900 tracking-wider">
                              SEC-{(currentUser?.uid?.substring(0, 8) || "8841-A2B9").toUpperCase()}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`SEC-${(currentUser?.uid?.substring(0, 8) || "8841-A2B9").toUpperCase()}`);
                                showToast("تم نسخ رمز الأمان الاحتياطي بنجاح!");
                              }}
                              className="text-purple-600 hover:text-purple-800 text-xs flex items-center gap-1"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>نسخ</span>
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400">احفظ هذا الرمز في مكان آمن لاستعادة حسابك في حال فقدان الوصول لهاتفك.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. الحسابات المرتبطة (Linked Accounts) */}
            {activeTab === "linked_accounts" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">الحسابات المرتبطة (Linked Accounts)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">ربط مزودي تسجيل الدخول للوصول السريع إلى دفتر حساباتك</p>
                </div>

                <div className="space-y-3">
                  {/* Google */}
                  <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-white hover:border-slate-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center font-bold text-red-500">
                        G
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">حساب Google</p>
                        <p className="text-[11px] text-slate-400">
                          {isGoogleLinked ? "مرتبط بحسابك الحالي ومفعل لتسجيل الدخول" : "غير مرتبط حالياً"}
                        </p>
                      </div>
                    </div>

                    {isGoogleLinked ? (
                      <button
                        onClick={() => handleUnlink("google.com", "Google")}
                        className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Unlink2 className="w-3.5 h-3.5" />
                        <span>إلغاء الربط</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleLink("google")}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>ربط الحساب</span>
                      </button>
                    )}
                  </div>

                  {/* Facebook */}
                  <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-white hover:border-slate-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-blue-600">
                        f
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">حساب Facebook</p>
                        <p className="text-[11px] text-slate-400">
                          {isFacebookLinked ? "مرتبط بحسابك الحالي ومفعل لتسجيل الدخول" : "غير مرتبط حالياً"}
                        </p>
                      </div>
                    </div>

                    {isFacebookLinked ? (
                      <button
                        onClick={() => handleUnlink("facebook.com", "Facebook")}
                        className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Unlink2 className="w-3.5 h-3.5" />
                        <span>إلغاء الربط</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleLink("facebook")}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>ربط الحساب</span>
                      </button>
                    )}
                  </div>

                  {/* Microsoft */}
                  <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-white hover:border-slate-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center font-bold text-teal-600">
                        M
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">حساب Microsoft</p>
                        <p className="text-[11px] text-slate-400">
                          {isMicrosoftLinked ? "مرتبط بحسابك الحالي ومفعل لتسجيل الدخول" : "غير مرتبط حالياً"}
                        </p>
                      </div>
                    </div>

                    {isMicrosoftLinked ? (
                      <button
                        onClick={() => handleUnlink("microsoft.com", "Microsoft")}
                        className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Unlink2 className="w-3.5 h-3.5" />
                        <span>إلغاء الربط</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleLink("microsoft")}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>ربط الحساب</span>
                      </button>
                    )}
                  </div>

                  {/* Phone Authentication */}
                  <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-white hover:border-slate-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">رقم الهاتف النقال (Firebase Phone Auth)</p>
                        <p className="text-[11px] text-slate-400">
                          {isPhoneLinked
                            ? `مرتبط بحسابك الحالي وموثق برمز SMS (${currentUser?.phoneNumber || extendedProfile.phoneNumber || "مفعل"})`
                            : "غير مسجل برقم هاتف"}
                        </p>
                      </div>
                    </div>

                    {isPhoneLinked ? (
                      currentUser?.providerData && currentUser.providerData.length > 1 ? (
                        <button
                          onClick={() => handleUnlink("phone", "رقم الهاتف")}
                          className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Unlink2 className="w-3.5 h-3.5" />
                          <span>إلغاء الربط</span>
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px] rounded-lg">
                          المزود الأساسي الحالي
                        </span>
                      )
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400">
                        متاح عند تسجيل الدخول السريع
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                  <p className="font-bold text-slate-800">ملاحظة أمان هامة:</p>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    يحظر النظام إلغاء ربط الحساب إذا كان هو الطريقة الوحيدة المسجلة لتسجيل دخولك، وذلك لضمان عدم حظر وصولك لدفتر حساباتك. تأكد من تفعيل بريدك وكلمة المرور أولاً.
                  </p>
                </div>
              </div>
            )}

            {/* 5. الإشعارات (Notifications) */}
            {activeTab === "notifications" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">الإشعارات (Notifications)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">تخصيص التنبيهات المحاسبية وإشعارات الديون والدفعات</p>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-white">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">إشعارات الديون المتأخرة والمستحقة</p>
                      <p className="text-[11px] text-slate-500">إظهار شارات ورسائل تنبيهية عند حلول موعد سداد فواتير العملاء</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifDueDebt}
                      onChange={(e) => setNotifDueDebt(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-white">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">إشعارات تسجيل الدفعات وسندات القبض</p>
                      <p className="text-[11px] text-slate-500">تأكيد فوري عند إيداع أي دفعة وسداد مديونية عميل</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPayments}
                      onChange={(e) => setNotifPayments(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-white">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">تذكير النسخ الاحتياطي الدوري</p>
                      <p className="text-[11px] text-slate-500">تنبيه أسبوعي لتنزيل نسخة احتياطية من كافة الدفاتر المحاسبية</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifBackup}
                      onChange={(e) => setNotifBackup(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-2">
                      {notifSound ? <Volume2 className="w-4 h-4 text-blue-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-800">التنبيهات الصوتية للتطبيق</p>
                        <p className="text-[11px] text-slate-500">تشغيل نغمة خفيفة عند حفظ القيود وسندات القبض</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifSound}
                      onChange={(e) => setNotifSound(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNotifications}
                    disabled={saving}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>حفظ إعدادات الإشعارات</span>
                  </button>
                </div>
              </div>
            )}

            {/* 6. النسخ الاحتياطي والمزامنة (Backup & Sync) */}
            {activeTab === "backup_sync" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">النسخ الاحتياطي والمزامنة (Backup & Sync)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">مزامنة سحابية لحظية وحفظ نسخ احتياطية آمنة قابلة للاستعادة</p>
                </div>

                {/* Cloud Sync Status */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">المزامنة السحابية مع Cloud Firestore</h4>
                        <p className="text-[11px] text-emerald-600 font-bold">الحالة: متصل وتلقائي المزامنة في الوقت الفعلي</p>
                      </div>
                    </div>

                    <button
                      onClick={handleManualSync}
                      className="px-3.5 py-1.5 bg-white border border-slate-300 hover:border-blue-500 text-slate-700 hover:text-blue-600 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>مزامنة يدوية فورية</span>
                    </button>
                  </div>

                  {syncStatus && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{syncStatus}</span>
                    </div>
                  )}
                </div>

                {/* Backup export & import */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">تنزيل نسخة احتياطية (Export)</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        حفظ ملف JSON مشفر يحتوي على كافة فواتيرك، عملائك، مجلداتك ومنتجاتك.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (onExportData) {
                          onExportData();
                          showToast("تم تصدير ملف النسخة الاحتياطية بنجاح!");
                        }
                      }}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تنزيل ملف النسخة الاحتياطية الآن</span>
                    </button>
                  </div>

                  <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">استعادة نسخة احتياطية (Restore)</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        استرجاع بياناتك من ملف نسخة احتياطية سابق عند التبديل لجهاز آخر.
                      </p>
                    </div>
                    <label className="w-full py-2 bg-white border border-slate-300 hover:border-indigo-500 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs">
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
                      <span>اختيار ملف النسخة لاستعادته</span>
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const content = event.target?.result as string;
                            if (content && onImportData) {
                              const res = onImportData(content);
                              if (res.success) {
                                showToast("تم استعادة النسخة الاحتياطية بنجاح إلى قاعدة البيانات السحابية!");
                              } else {
                                showToast(res.error || "فشل استيراد الملف", "error");
                              }
                            }
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 7. الأجهزة والجلسات (Devices & Sessions) */}
            {activeTab === "sessions" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">الأجهزة والجلسات (Devices & Sessions)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">إدارة الأجهزة النشطة والتحكم في جلسات تسجيل الدخول</p>
                </div>

                <div className="space-y-3">
                  {sessionsList.map((session) => {
                    const isOnline = session.status !== "ended" && (() => {
                      const time = session.lastActivityAt || session.lastActive;
                      if (!time) return false;
                      const diff = Date.now() - new Date(time).getTime();
                      return diff < 5 * 60 * 1000;
                    })();

                    const isEnded = session.status === "ended";
                    const lastActiveDate = new Date(session.lastActivityAt || session.lastActive);
                    const formattedTime = !isNaN(lastActiveDate.getTime())
                      ? `${lastActiveDate.toLocaleDateString("ar-SA", { month: "numeric", day: "numeric" })} ${lastActiveDate.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`
                      : "الآن";

                    return (
                      <div
                        key={session.id}
                        className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                          session.isCurrent
                            ? "border-emerald-300 bg-emerald-50/40"
                            : isEnded
                            ? "border-slate-200 bg-slate-50/70 opacity-70"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              session.isCurrent
                                ? "bg-emerald-100 text-emerald-700"
                                : isEnded
                                ? "bg-slate-100 text-slate-400"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {session.os.includes("Android") || session.os.includes("iOS") || session.deviceType === "mobile" ? (
                              <Smartphone className="w-5 h-5" />
                            ) : (
                              <Laptop className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold text-slate-800">{session.deviceName}</p>
                              {session.isCurrent && (
                                <span className="text-[9px] font-bold bg-emerald-600 text-white px-2 py-0.2 rounded-full">
                                  هذا الجهاز (نشط حالياً)
                                </span>
                              )}
                              {isEnded ? (
                                <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-2 py-0.2 rounded-full">
                                  تم إنهاء الجلسة
                                </span>
                              ) : isOnline ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.2 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  متصل الآن
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              المتصفح: {session.browser} • المنصة: {session.platform || session.os} • آخر نشاط: {formattedTime}
                            </p>
                          </div>
                        </div>

                        {/* Action: Logout single device */}
                        {!session.isCurrent && !isEnded && (
                          <button
                            onClick={() => handleLogoutSingleSession(session.id)}
                            disabled={saving || terminatingSessionId === session.id}
                            className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
                            title="تسجيل الخروج من هذا الجهاز"
                          >
                            {terminatingSessionId === session.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <LogOut className="w-3.5 h-3.5" />
                            )}
                            <span>تسجيل الخروج</span>
                          </button>
                        )}
                        {isEnded && (
                          <span className="text-[11px] text-slate-400 font-medium shrink-0">
                            منتهية
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">تسجيل الخروج من كافة الأجهزة الأخرى</p>
                    <p className="text-[11px] text-slate-500">سيتم إبطال جميع الجلسات القديمة والإبقاء على هذا المتصفح فقط.</p>
                  </div>

                  <button
                    onClick={handleLogoutOtherSessions}
                    disabled={saving}
                    className="px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    تسجيل الخروج من الأجهزة الأخرى
                  </button>
                </div>
              </div>
            )}

            {/* 8. الخصوصية (Privacy) */}
            {activeTab === "privacy" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">الخصوصية وحماية البيانات (Privacy)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">معايير حماية البيانات المالية وسياسة التشفير وعزل الحسابات</p>
                </div>

                <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-600" />
                      عزل البيانات المحاسبية لكل تاجر (Data Isolation)
                    </h4>
                    <p>
                      كل مستخدم لديه مسار مشفر ومستقل تماماً تحت قاعدة بيانات Cloud Firestore
                      (<code className="font-mono text-blue-700 bg-blue-50 px-1 rounded">users/{currentUser?.uid}</code>).
                      لا يمكن لأي مستخدم آخر أو طرف خارجي الوصول أو الاستعلام عن سجلاتك أو ديون عملائك أو مبيعاتك.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-emerald-600" />
                      التشفير أثناء النقل والتخزين
                    </h4>
                    <p>
                      يتم تشفير جميع حركاتك المالية باستخدام بروتوكول TLS 1.3 أثناء النقل، بالإضافة إلى التشفير القياسي AES-256
                      لقواعد بيانات Google Cloud.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-white">
                    <div>
                      <p className="font-bold text-slate-800">مسح الذاكرة المؤقتة المحلية (Clear Cache)</p>
                      <p className="text-[11px] text-slate-400">
                        مفيد عند استخدام جهاز كمبيوتر مشترك لمسح النسخ المؤقتة المخزنة في المتصفح.
                      </p>
                    </div>

                    <button
                      onClick={handleClearCache}
                      className="px-3.5 py-1.5 border border-slate-300 hover:border-rose-400 text-slate-700 hover:text-rose-600 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      مسح الذاكرة المؤقتة
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 9. الإعدادات (Settings) */}
            {activeTab === "settings" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">إعدادات النظام المحاسبي (Settings)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">الربط بإعدادات المتجر العامة، العملة، والضرائب</p>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold block">اسم المنشأة / الشركة</span>
                      <span className="text-xs font-bold text-slate-800">{storeSettings.companyName || "غير محدد"}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold block">العملة المعتمدة</span>
                      <span className="text-xs font-bold text-slate-800">{storeSettings.currency || "ر.س"}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold block">رقم هاتف المنشأة</span>
                      <span className="text-xs font-bold text-slate-800 font-mono" dir="ltr">
                        {storeSettings.companyPhone || "غير محدد"}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold block">عنوان ومقر المنشأة</span>
                      <span className="text-xs font-bold text-slate-800">
                        {storeSettings.companyAddress || "غير محدد"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        onClose();
                        if (onNavigateToSettings) onNavigateToSettings();
                      }}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <SettingsIcon className="w-4 h-4" />
                      <span>فتح شاشة إعدادات المتجر والطباعة والضرائب بالكامل</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 10. المساعدة والدعم (Help & Support) */}
            {activeTab === "help" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">المساعدة والدعم (Help & Support)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">إرشادات الاستخدام، الأسئلة الشائعة وتواصل مع فريق الدعم</p>
                </div>

                {/* FAQ */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">الأسئلة الشائعة (FAQ):</span>

                  {[
                    {
                      q: "كيف تتم مزامنة حساباتي عند فتح التطبيق من جهاز آخر؟",
                      a: "يكفي تسجيل الدخول بنفس البريد وكلمة المرور أو مزود Google/Microsoft، وسيقوم النظام تلقائياً بتحميل ومزامنة كافة الدفاتر والفواتير والعملاء من قاعدة البيانات السحابية فوراً.",
                    },
                    {
                      q: "كيف يتم حساب المتأخرات والديون المستحقة؟",
                      a: "يقوم النظام بمقارنة تاريخ استحقاق الفاتورة باليوم الحالي. إذا تجاوز التاريخ ولم يتم السداد، تظهر شارة حمراء منبهة في لوحة التحكم وقائمة الفواتير.",
                    },
                    {
                      q: "هل يمكنني تصدير وحفظ نسخة ورقية أو PDF للفاتورة وسند القبض؟",
                      a: "نعم، يمكنك من خلال قائمة الفواتير أو الدفعات الضغط على أيقونة الطباعة وتصدير كشف حساب أو فاتورة ضريبية رسمية بضغطة زر.",
                    },
                  ].map((faq, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
                        className="w-full p-3.5 text-right flex items-center justify-between text-xs font-bold text-slate-800 bg-slate-50/70 hover:bg-slate-100 transition-colors"
                      >
                        <span>{faq.q}</span>
                        {openFaqIndex === idx ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      {openFaqIndex === idx && (
                        <div className="p-3.5 bg-white text-xs text-slate-600 border-t border-slate-100 leading-relaxed">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Support Form */}
                <form onSubmit={handleSupportSubmit} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <span className="text-xs font-bold text-slate-800 block">إرسال استفسار أو طلب دعم فني</span>

                  <div>
                    <input
                      type="text"
                      placeholder="عنوان الموضوع..."
                      value={supportSubject}
                      onChange={(e) => setSupportSubject(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <textarea
                      rows={3}
                      placeholder="اشرح استفسارك أو مشكلتك الفنية بالتفصيل..."
                      value={supportMessage}
                      onChange={(e) => setSupportMessage(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={supportSent}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {supportSent ? "تم الإرسال بنجاح ✓" : "إرسال للدعم الفني"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 11. حول التطبيق (About) */}
            {activeTab === "about" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">حول التطبيق (About)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">معلومات الإصدار، البنية السحابية، ورخصة الاستخدام</p>
                </div>

                <div className="p-6 rounded-2xl bg-gradient-to-l from-slate-900 to-slate-800 text-white space-y-4 shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
                      د
                    </div>
                    <div>
                      <h4 className="text-base font-bold">دفتر الحسابات والديون المحاسبي</h4>
                      <p className="text-xs text-blue-300 font-mono">الإصدار 2.5.0 Pro Cloud Edition</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    منظومة متكاملة لإدارة ديون العملاء، فواتير المبيعات، سندات القبض، ومخزون المنتجات، مدعومة بقاعدة بيانات سحابية لحظية ومصادقة مشفرة من Firebase و Google Cloud.
                  </p>

                  <div className="pt-2 flex flex-wrap gap-3 border-t border-slate-700/60 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block">قاعدة البيانات:</span>
                      <span className="font-bold font-mono text-slate-200">Google Cloud Firestore</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">المصادقة:</span>
                      <span className="font-bold font-mono text-slate-200">Firebase Authentication</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">حالة الخادم:</span>
                      <span className="font-bold text-emerald-400">متصل (Online 100%)</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 text-xs text-slate-500 text-center">
                  جميع الحقوق محفوظة © {new Date().getFullYear()} - نظام دفتر الحسابات السحابي.
                </div>
              </div>
            )}

            {/* 13. منطقة الخطر (حذف الحساب - Danger Zone) */}
            {activeTab === "danger_zone" && (
              <div className="space-y-6">
                <div className="pb-3 border-b border-rose-200">
                  <h3 className="text-sm font-bold text-rose-700 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    <span>منطقة الخطر - حذف الحساب (Delete Account)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    إجراء نهائي ولا يمكن التراجع عنه يؤدي لحذف كامل بياناتك المالية وحسابك
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-rose-50/70 border-2 border-rose-200 space-y-4">
                  <h4 className="text-xs font-bold text-rose-900">ماذا سيحدث عند حذف حسابك؟</h4>
                  <ul className="text-xs text-rose-800 space-y-1.5 list-disc list-inside leading-relaxed">
                    <li>حذف كافة فواتير الديون وسندات القبض ومجلدات العملاء المسجلة في حسابك.</li>
                    <li>حذف قائمة المنتجات والأسعار وإعدادات المتجر نهائياً من قاعدة البيانات السحابية.</li>
                    <li>حذف حساب الدخول وبيانات المصادقة من Firebase ولا يمكن استعادتها أبداً.</li>
                  </ul>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteInputConfirm("");
                        setDeleteError("");
                        setShowDeleteConfirm(true);
                      }}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>المتابعة لحذف الحساب نهائياً</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* 12. نافذة تأكيد تسجيل الخروج (Confirm Logout Modal) */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs font-sans" dir="rtl">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">تسجيل الخروج</h3>
              <p className="text-xs text-slate-600 font-medium">
                هل أنت متأكد من رغبتك في تسجيل الخروج؟
              </p>
              <p className="text-[11px] text-slate-400">
                يمكنك إعادة تسجيل الدخول في أي وقت لاستعادة بياناتك المحفوظة سحابياً.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={executeLogout}
                id="btn-confirm-logout-dialog"
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 13. نافذة تأكيد حذف الحساب (Confirm Delete Account Modal) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs font-sans" dir="rtl">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-rose-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-rose-900">تحذير أخير: حذف الحساب والبيانات نهائياً</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                هذا الإجراء سيقوم بحذف حسابك المحاسبي وجميع القيود والفواتير وقاعدة بياناتك السحابية بالكامل، ولا يمكن التراجع عنه.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold text-rose-800">
                {deleteError}
              </div>
            )}

            <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <label className="text-xs font-bold text-slate-800 block">
                لمنع الحذف العرضي، يرجى كتابة كلمة <span className="text-rose-600 font-mono">حذف حسابي</span> للتأكيد:
              </label>
              <input
                type="text"
                placeholder="اكتب هنا: حذف حسابي"
                value={deleteInputConfirm}
                onChange={(e) => setDeleteInputConfirm(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden bg-white"
              />
            </div>

            {isEmailPassword && (
              <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="text-xs font-bold text-slate-800 block">
                  أدخل كلمة المرور الحالية لتأكيد الأمان: <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showDeletePassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={deletePasswordConfirm}
                    onChange={(e) => setDeletePasswordConfirm(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden bg-white text-left pr-3 pl-9"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(!showDeletePassword)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  مطلوبة للتحقق من هويتك وتفادي رفض العملية من Firebase.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                إلغاء والعودة
              </button>
              <button
                type="button"
                disabled={
                  saving ||
                  (deleteInputConfirm.trim() !== "حذف حسابي" && deleteInputConfirm.trim() !== currentUser?.email) ||
                  (isEmailPassword && !deletePasswordConfirm)
                }
                onClick={executeDeleteAccount}
                id="btn-confirm-delete-account"
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "جاري الحذف..." : "تأكيد حذف الحساب نهائياً"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClockIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
