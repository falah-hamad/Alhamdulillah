import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Menu, Calendar, BookOpen, User, Building2, ShieldAlert, BellRing, Bell, LogOut, Cloud, WifiOff, Wifi, Sparkles } from "lucide-react";
import { App as CapApp } from "@capacitor/app";
import { useAccountingData } from "./hooks/useAccountingData";
import { isInvoiceOverdue } from "./utils/overdueUtils";
import { useAuth } from "./contexts/AuthContext";
import {
  setupForegroundNotificationListener,
  syncNotificationTokenIfPermitted,
  subscribeAppNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  saveFcmTokenToFirestore,
} from "./lib/notifications";
import {
  authenticateWithBiometrics,
  ensureNativeNotificationChannel,
  isNativeAndroid,
  saveNativeJsonFile,
  addNativeNotificationActionListener,
  setupNativePushTokenRefreshListener,
} from "./lib/native";
import { FirstLaunchOnboarding, FirstUseCoachMarks } from "./components/FirstLaunchOnboarding";
import {
  isCoachMarksCompleted,
  isFirstLaunchCompleted,
  setCoachMarksCompleted,
  setFirstLaunchCompleted,
} from "./lib/firstLaunch";
import AuthModal from "./components/AuthModal";
import AccountManagerModal from "./components/AccountManagerModal";
import NotificationCenterModal from "./components/NotificationCenterModal";
import { AppNotification } from "./types";


// Views
import Sidebar from "./components/Sidebar";
import DashboardView from "./components/DashboardView";
import LedgerView from "./components/LedgerView";
import CustomersView from "./components/CustomersView";
import ProductsView from "./components/ProductsView";
import PaymentsView from "./components/PaymentsView";
import InvoicesView from "./components/InvoicesView";
import StatsView from "./components/StatsView";
import ReportsView from "./components/ReportsView";
import SettingsView from "./components/SettingsView";
import FileManagerView from "./components/FileManagerView";
import OverdueDebtorsView from "./components/OverdueDebtorsView";
import AIAssistantView from "./components/AIAssistantView";


export default function App() {
  const { currentUser, extendedProfile, isGuest, continueAsGuest, loading: authLoading, logout } = useAuth();

  const {
    folders,
    customers,
    products,
    invoices,
    payments,
    settings,
    loading,
    addFolder,
    updateFolder,
    deleteFolder,
    moveToTrashFolder,
    restoreFolder,
    permanentDeleteFolder,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    moveToTrashCustomer,
    restoreCustomer,
    permanentDeleteCustomer,
    batchMoveToTrash,
    batchRestore,
    batchPermanentDelete,
    emptyTrash,
    restoreAllTrash,
    addProduct,
    updateProduct,
    deleteProduct,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    addPayment,
    deletePayment,
    updateSettings,
    changeLogs,
    cloudBackups,
    isCloudSyncing,
    addChangeLog,
    deleteChangeLog,
    clearCustomerChangeLogs,
    revertChangeLogAction,
    createCloudBackup,
    restoreCloudBackup,
    deleteCloudBackup,
    importData,
    resetToDefault,
    clearAllData,
  } = useAccountingData();

  const [currentTab, setCurrentTab] = useState("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [notificationsList, setNotificationsList] = useState<AppNotification[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [showReconnectedBanner, setShowReconnectedBanner] = useState<boolean>(false);
  const hadBeenOfflineRef = useRef<boolean>(!navigator.onLine);
  const [nativeUnlockPending, setNativeUnlockPending] = useState(false);
  const [nativeUnlockError, setNativeUnlockError] = useState<string | null>(null);
  const [showFirstLaunchOnboarding, setShowFirstLaunchOnboarding] = useState(false);
  const [showCoachMarks, setShowCoachMarks] = useState(false);

  const isNativeBiometricLockEnabled = Boolean(currentUser && extendedProfile.twoFactorEnabled && isNativeAndroid());

  const requestNativeUnlock = useCallback(async () => {
    if (!isNativeBiometricLockEnabled) {
      setNativeUnlockPending(false);
      setNativeUnlockError(null);
      return true;
    }

    setNativeUnlockPending(true);
    setNativeUnlockError(null);
    const result = await authenticateWithBiometrics("استخدم بصمتك أو Face Unlock لفتح التطبيق");

    if (result.success) {
      setNativeUnlockPending(false);
      setNativeUnlockError(null);
      return true;
    }

    setNativeUnlockPending(false);
    setNativeUnlockError(
      result.unsupported
        ? "هذا الجهاز لا يدعم البصمة أو Face Unlock المطلوبة لهذا الحساب. استخدم جهازاً مدعوماً أو عطّل الميزة من جلسة أخرى."
        : "تعذر تأكيد هويتك. أعد المحاولة للمتابعة إلى التطبيق.",
    );
    return false;
  }, [isNativeBiometricLockEnabled]);

  useEffect(() => {
    setShowFirstLaunchOnboarding(!isFirstLaunchCompleted());
    setShowCoachMarks(isFirstLaunchCompleted() && !isCoachMarksCompleted());
  }, []);

  useEffect(() => {
    const restartHandler = () => {
      setShowFirstLaunchOnboarding(true);
      setShowCoachMarks(false);
    };
    window.addEventListener("acc-restart-onboarding", restartHandler as EventListener);
    return () => window.removeEventListener("acc-restart-onboarding", restartHandler as EventListener);
  }, []);

  useEffect(() => {
    if (!isNativeAndroid()) return;
    void ensureNativeNotificationChannel();
  }, []);

  useEffect(() => {
    let reconnectTimeout: any = null;
    const handleOnline = () => {
      setIsOnline(true);
      if (hadBeenOfflineRef.current) {
        setShowReconnectedBanner(true);
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          setShowReconnectedBanner(false);
        }, 4000);
      }
      hadBeenOfflineRef.current = false;
    };
    const handleOffline = () => {
      hadBeenOfflineRef.current = true;
      setIsOnline(false);
      setShowReconnectedBanner(false);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  useEffect(() => {
    if (!isNativeBiometricLockEnabled) {
      setNativeUnlockPending(false);
      setNativeUnlockError(null);
      return;
    }
    void requestNativeUnlock();
  }, [isNativeBiometricLockEnabled, requestNativeUnlock]);

  useEffect(() => {
    if (!isNativeAndroid()) return;

    let isMounted = true;
    let listenerHandle: { remove: () => Promise<void> } | undefined;

    CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isMounted || !isActive || !isNativeBiometricLockEnabled) return;
      void requestNativeUnlock();
    }).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      isMounted = false;
      listenerHandle?.remove();
    };
  }, [isNativeBiometricLockEnabled, requestNativeUnlock]);

  // Detect Firebase password reset links in URL (?mode=resetPassword&oobCode=...)
  useEffect(() => {
    try {
      const search = window.location.search || (window.location.hash.includes('?') ? window.location.hash.substring(window.location.hash.indexOf('?')) : '');
      const params = new URLSearchParams(search);
      const urlMode = params.get('mode');
      const oobCode = params.get('oobCode');
      if (urlMode === 'resetPassword' && oobCode) {
        setIsAuthModalOpen(true);
      }
    } catch (e) {
      console.warn("Could not parse auth redirect params:", e);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      let cleanupForeground: (() => void) | null = null;
      setupForegroundNotificationListener((payload) => {
        console.log("Push notification received in foreground:", payload);
      }).then((unsub) => {
        if (unsub) cleanupForeground = unsub;
      });

      syncNotificationTokenIfPermitted(currentUser.uid).catch((e) => {
        console.warn("FCM device token sync notice:", e);
      });

      // Listen for FCM token refreshes in runtime (reinstall, app update, token rotation)
      let cleanupTokenRefresh: (() => void) | null = null;
      setupNativePushTokenRefreshListener((newToken) => {
        saveFcmTokenToFirestore(currentUser.uid, newToken, "android").catch((err) => {
          console.warn("Auto-synced refreshed FCM token notice:", err);
        });
      }).then((unsub) => {
        if (unsub) cleanupTokenRefresh = unsub;
      });

      // Subscribe to real-time synchronized Firestore in-app notifications
      const unsubscribeNotifications = subscribeAppNotifications(currentUser.uid, (items) => {
        setNotificationsList(items);
      });

      return () => {
        if (cleanupForeground) cleanupForeground();
        if (cleanupTokenRefresh) cleanupTokenRefresh();
        unsubscribeNotifications();
      };
    } else {
      setNotificationsList([]);
    }
  }, [currentUser]);

  // Function to navigate when a notification is clicked (either from Android status bar or Web Service Worker)
  const handleNavigateFromNotification = useCallback((data: any) => {
    if (!data) return;
    const customerId = data.customerId;
    const invoiceId = data.invoiceId;
    const category = data.category;
    const type = data.type;

    if (customerId) {
      setCurrentTab("ledger");
      setLedgerTargetCustomerId(customerId);
      if (invoiceId) {
        setLedgerTargetInvoiceId(invoiceId);
      }
    } else if (category === "due_debts") {
      setCurrentTab("overdue");
    } else if (category === "payments" || type === "payment_receipt" || type === "partial_or_full_payment") {
      setCurrentTab("payments");
    } else if (category === "debts" || type === "new_debt") {
      setCurrentTab("ledger");
    } else if (type === "new_customer") {
      setCurrentTab("customers");
    }
  }, []);

  // Listen for native Android notification click/tap actions
  useEffect(() => {
    let cleanupActionListener: (() => void) | undefined;
    addNativeNotificationActionListener((action) => {
      console.log("Native notification action received:", action);
      const data = action?.notification?.data;
      if (data) {
        handleNavigateFromNotification(data);
      }
    }).then((unsub) => {
      cleanupActionListener = unsub;
    });

    // Listen for Web Service Worker message when notification is clicked
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.action === "OPEN_CUSTOMER_PAGE") {
        handleNavigateFromNotification(event.data);
      }
    };
    if (typeof window !== "undefined" && "navigator" in window && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
    }

    // Check URL parameters on mount in web mode (?customerId=...&invoiceId=...)
    try {
      const search = window.location.search;
      if (search) {
        const params = new URLSearchParams(search);
        const customerId = params.get("customerId");
        const invoiceId = params.get("invoiceId");
        const type = params.get("type");
        if (customerId) {
          handleNavigateFromNotification({ customerId, invoiceId, type });
        }
      }
    } catch (e) {
      console.warn("Could not parse notification query parameters:", e);
    }

    return () => {
      if (cleanupActionListener) cleanupActionListener();
      if (typeof window !== "undefined" && "navigator" in window && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
      }
    };
  }, [handleNavigateFromNotification]);


  // Quick export backup helper for Account Manager
  const handleExportBackup = async () => {
    try {
      const timestamp = new Date().toISOString();
      const backupData = {
        meta: {
          appName: "نظام إدارة المحل والدفاتر المحاسبية",
          exportDate: timestamp,
          userEmail: currentUser?.email,
          userId: currentUser?.uid,
        },
        data: {
          folders,
          customers,
          products,
          invoices,
          payments,
          changeLogs,
          settings,
        },
      };
      const fileName = `store_backup_${currentUser?.email?.split('@')[0] || 'account'}_${timestamp.slice(0, 10)}.json`;
      const rawJson = JSON.stringify(backupData, null, 2);
      if (isNativeAndroid()) {
        await saveNativeJsonFile(fileName, rawJson);
        return;
      }
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(rawJson)}`;
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute("download", fileName);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.error("Export backup error:", e);
    }
  };

  // References to communicate custom actions between pages
  const ledgerViewRef = useRef<{
    setSelectedCustomerId: (id: string | null) => void;
    setSelectedInvoiceId: (id: string | null) => void;
    setIsAddingInvoice: (val: boolean) => void;
  } | null>(null);

  // Single Source of Truth (SSOT): Central active datasets
  const activeCustomers = useMemo(() => customers.filter((c) => !c.isDeleted), [customers]);
  const activeCustomerIds = useMemo(() => new Set(activeCustomers.map((c) => c.id)), [activeCustomers]);
  const activeInvoices = useMemo(
    () => invoices.filter((inv) => !inv.isDeleted && activeCustomerIds.has(inv.customerId)),
    [invoices, activeCustomerIds]
  );
  const activePayments = useMemo(
    () => payments.filter((p) => !p.isDeleted && activeCustomerIds.has(p.customerId)),
    [payments, activeCustomerIds]
  );

  // Overdue debtors count: ONLY active customers who have remaining debt > 0
  const overdueDebtorsCount = useMemo(() => {
    return activeCustomers.filter((c) => {
      const custInvs = activeInvoices.filter((inv) => inv.customerId === c.id);
      const custPayments = activePayments.filter((p) => p.customerId === c.id);
      const totalDebts = custInvs.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0);
      const totalPaid =
        custPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) +
        custInvs.reduce((sum, inv) => sum + (Number(inv.paidAmount) || 0), 0);
      return (totalDebts - totalPaid) > 0;
    }).length;
  }, [activeCustomers, activeInvoices, activePayments]);

  // Selection from invoices register to ledger page
  const handleSelectInvoiceForLedger = (customerId: string, invoiceId: string) => {
    setCurrentTab("ledger");
    // We let the active render look at these states.
    // Instead of refs which might be tricky with nested elements, 
    // we will store these parameters in local App states and pass them down!
    setLedgerTargetCustomerId(customerId);
    setLedgerTargetInvoiceId(invoiceId);
  };

  // State to pass target selections to ledger
  const [ledgerTargetCustomerId, setLedgerTargetCustomerId] = useState<string | null>(null);
  const [ledgerTargetInvoiceId, setLedgerTargetInvoiceId] = useState<string | null>(null);

  // Quick shortcut triggers from Dashboard
  const handleOpenNewInvoiceDashboard = () => {
    setCurrentTab("ledger");
    // Pre-select first customer or null
    if (customers.length > 0) {
      setLedgerTargetCustomerId(customers[0].id);
    }
    setLedgerTargetInvoiceId(null);
  };

  const handleOpenNewPaymentDashboard = () => {
    setCurrentTab("payments");
  };

  const handleOpenNewCustomerDashboard = () => {
    setCurrentTab("customers");
  };

  const handleOpenNewProductDashboard = () => {
    setCurrentTab("products");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-sans text-white p-4" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-300">جاري التحقق من جلسة المستخدم وقاعدة البيانات السحابية...</p>
        </div>
      </div>
    );
  }

  // Prevent unauthenticated users from accessing internal application pages unless in guest mode
  if (!currentUser && !isGuest) {
    return <AuthModal onClose={() => continueAsGuest()} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-600">يجري مزامنة البيانات السحابية من Cloud Firestore...</p>
        </div>
      </div>
    );
  }

  if (showFirstLaunchOnboarding) {
    return (
      <FirstLaunchOnboarding
        userId={currentUser?.uid}
        onComplete={(options) => {
          setFirstLaunchCompleted(true);
          setShowFirstLaunchOnboarding(false);
          if (options?.skipped) {
            setCoachMarksCompleted(true);
            setShowCoachMarks(false);
            return;
          }
          setShowCoachMarks(!isCoachMarksCompleted());
        }}
      />
    );
  }

  if (isNativeBiometricLockEnabled && (nativeUnlockPending || nativeUnlockError)) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-5" dir="rtl">
        <div className="w-full max-w-sm bg-slate-800/90 border border-slate-700 rounded-3xl p-6 text-center shadow-2xl space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-blue-300" />
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-extrabold">التطبيق مقفل بالحماية الحيوية</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              استخدم بصمتك أو Face Unlock للوصول إلى بياناتك السحابية المحمية داخل التطبيق.
            </p>
          </div>
          {nativeUnlockPending ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-200">بانتظار تأكيد الهوية من Android…</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-rose-300">{nativeUnlockError}</p>
              <button
                type="button"
                onClick={() => void requestNativeUnlock()}
                className="w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
              >
                إعادة المحاولة
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800 font-sans antialiased overflow-x-hidden">
      {showCoachMarks && (
        <FirstUseCoachMarks
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          onComplete={() => {
            setCoachMarksCompleted(true);
            setShowCoachMarks(false);
          }}
        />
      )}
      
      {/* Sidebar Component */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        settings={settings}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        overdueInvoicesCount={overdueDebtorsCount}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-y-auto">
        
        {/* Top Navbar Header */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 sm:px-6 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-100">
                2026-07-12
              </span>
              <h1 className="text-sm font-extrabold text-slate-800 hidden sm:block">
                {currentTab === "home" && "لوحة تحكم الرئيسية"}
                {currentTab === "ai" && "المساعد المالي والمحاسبي الذكي (AI)"}

                {currentTab === "ledger" && "دفتر الديون وسجل العملاء الورقي"}
                {currentTab === "overdue" && "قسم الزبائن المتأخرين عن السداد"}
                {currentTab === "folders" && "مدير المجلدات والملفات (File Manager)"}
                {currentTab === "customers" && "ملفات حسابات العملاء"}
                {currentTab === "products" && "جرد البضائع والمستودع"}
                {currentTab === "payments" && "سجل المقبوضات والدفعات"}
                {currentTab === "invoices" && "دفتر مبيعات الفواتير"}
                {currentTab === "stats" && "التقارير البيانية والحسابات"}
                {currentTab === "reports" && "تصدير التقارير المعتمدة"}
                {currentTab === "settings" && "الإعدادات وتأمين البيانات"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Overdue Alert Bell in Header */}
            {overdueDebtorsCount > 0 && (
              <button
                onClick={() => setCurrentTab("overdue")}
                className="relative p-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 transition-all border border-rose-200 cursor-pointer flex items-center gap-1.5"
                title={`${overdueDebtorsCount} زبائن متأخرين عن السداد (لديهم رصيد متبقي) - انقر للعرض`}
              >
                <BellRing className="w-4 h-4 text-rose-600 animate-bounce" />
                <span className="text-xs font-bold font-mono bg-rose-600 text-white px-1.5 py-0.2 rounded-full">
                  {overdueDebtorsCount}
                </span>
                <span className="text-[11px] font-bold text-rose-800 hidden md:inline">
                  متأخرات
                </span>
              </button>
            )}

            {/* Quick Balance Header Info */}
            <div className="hidden md:flex items-center gap-3 text-xs border-l border-slate-200 pl-4">
              <span className="text-slate-400">إجمالي المديونية الحالية:</span>
              <span className="font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                {activeInvoices.reduce((acc, inv) => acc + inv.remainingAmount, 0).toLocaleString()} {settings.currency}
              </span>
            </div>

            {/* Notification Bell Icon */}
            <button
              type="button"
              id="header-btn-notification-center"
              onClick={() => setIsNotificationCenterOpen(true)}
              title="مركز الإشعارات والتنبيهات"
              className="relative p-2 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {notificationsList.filter((n) => !n.isRead).length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-2xs animate-pulse">
                  {notificationsList.filter((n) => !n.isRead).length > 99
                    ? "99+"
                    : notificationsList.filter((n) => !n.isRead).length}
                </span>
              )}
            </button>

            {/* AI Assistant Header Button */}
            <button
              type="button"
              id="header-btn-ai-assistant"
              onClick={() => setCurrentTab("ai")}
              title="المساعد المالي والمحاسبي الذكي (AI)"
              className={`relative p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                currentTab === "ai"
                  ? "bg-blue-600 text-white shadow-xs font-bold"
                  : "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-medium"
              }`}
            >
              <Sparkles className={`w-4 h-4 ${currentTab === "ai" ? "text-amber-300 animate-pulse" : "text-blue-600"}`} />
              <span className="text-xs hidden md:inline">المساعد الذكي</span>
            </button>

            {/* User Profile and Cloud State display */}
            <div className="flex items-center gap-2 sm:gap-3">

              {currentUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsAccountModalOpen(true)}
                    id="header-btn-user-profile"
                    title="إدارة الحساب والملف الشخصي والأمان"
                    className="flex items-center gap-2 p-1.5 -m-1 rounded-xl hover:bg-slate-100 transition-all cursor-pointer text-right group border border-transparent hover:border-slate-200"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-sm overflow-hidden group-hover:ring-2 group-hover:ring-blue-400">
                      {currentUser?.photoURL ? (
                        <img
                          src={currentUser.photoURL}
                          alt="avatar"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        (currentUser?.displayName || currentUser?.email || "U").charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-bold text-slate-800 leading-tight group-hover:text-blue-700">
                        {currentUser?.displayName || currentUser?.email?.split('@')[0] || "المحاسب المعتمد"}
                      </p>
                      <p className="text-[10px] text-emerald-600 font-bold leading-none mt-0.5 flex items-center gap-1">
                        <Cloud className="w-3 h-3 text-emerald-500" />
                        <span>سحابي متصل</span>
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => logout()}
                    id="header-btn-logout"
                    title="تسجيل الخروج"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  id="header-btn-auth-signin"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="تسجيل الدخول ومزامنة بياناتك سحابياً"
                >
                  <Cloud className="w-4 h-4" />
                  <span>تسجيل الدخول / ربط السحابة</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Offline notification banner & reconnection indicator */}
        {!isOnline ? (
          <div className="bg-amber-500 text-white px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all animate-in fade-in">
            <WifiOff className="w-4 h-4" />
            <span>أنت تعمل الآن في وضع عدم الاتصال (Offline Mode) — سيتم حفظ وتخزين كافة عملياتك ومزامنتها تلقائياً مع Firebase فور عودة الإنترنت.</span>
          </div>
        ) : showReconnectedBanner ? (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all animate-in fade-in">
            <Wifi className="w-4 h-4" />
            <span>تمت استعادة الاتصال بالإنترنت — جاري مزامنة التغييرات المحلية تلقائياً مع Cloud Firestore.</span>
          </div>
        ) : null}

        {/* Dynamic Main Workspace Panels */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {currentTab === "home" && (
            <DashboardView
              customers={activeCustomers}
              products={products}
              invoices={activeInvoices}
              payments={activePayments}
              settings={settings}
              setCurrentTab={setCurrentTab}
              onOpenNewInvoiceModal={handleOpenNewInvoiceDashboard}
              onOpenNewPaymentModal={handleOpenNewPaymentDashboard}
              onOpenNewCustomerModal={handleOpenNewCustomerDashboard}
              onOpenNewProductModal={handleOpenNewProductDashboard}
              onSelectInvoiceForLedger={handleSelectInvoiceForLedger}
              onUpdateInvoice={updateInvoice}
            />
          )}
          {currentTab === "ai" && (
            <AIAssistantView
              customers={activeCustomers}
              invoices={activeInvoices}
              payments={activePayments}
              settings={settings}
              setCurrentTab={setCurrentTab}
              onSelectCustomerForLedger={(customerId) => {
                setCurrentTab("ledger");
                setLedgerTargetCustomerId(customerId);
                setLedgerTargetInvoiceId(null);
              }}
            />
          )}


          {currentTab === "overdue" && (
            <OverdueDebtorsView
              customers={activeCustomers}
              invoices={activeInvoices}
              payments={activePayments}
              settings={settings}
              folders={folders}
              onSelectCustomerForLedger={(customerId) => {
                setCurrentTab("ledger");
                setLedgerTargetCustomerId(customerId);
                setLedgerTargetInvoiceId(null);
              }}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === "ledger" && (
            <LedgerWrapper
              customers={customers}
              products={products}
              invoices={invoices}
              payments={payments}
              settings={settings}
              folders={folders}
              addFolder={addFolder}
              updateFolder={updateFolder}
              deleteFolder={deleteFolder}
              restoreFolder={restoreFolder}
              permanentDeleteFolder={permanentDeleteFolder}
              onMoveItems={(folderIds: string[], customerIds: string[], targetFolderId: string | null) => {
                folderIds.forEach((fId) => {
                  const f = folders.find((x) => x.id === fId);
                  if (f) updateFolder({ ...f, parentId: targetFolderId });
                });
                customerIds.forEach((cId) => {
                  const c = customers.find((x) => x.id === cId);
                  if (c) updateCustomer({ ...c, folderId: targetFolderId || undefined });
                });
              }}
              onBulkDelete={(folderIds: string[], customerIds: string[]) => {
                batchMoveToTrash(folderIds, customerIds);
              }}
              onBulkRestore={(folderIds: string[], customerIds: string[]) => {
                batchRestore(folderIds, customerIds);
              }}
              onBulkPermanentDelete={(folderIds: string[], customerIds: string[]) => {
                batchPermanentDelete(folderIds, customerIds);
              }}
              onEmptyTrash={emptyTrash}
              onRestoreAllTrash={restoreAllTrash}
              addInvoice={addInvoice}
              updateInvoice={updateInvoice}
              addPayment={addPayment}
              deleteInvoice={deleteInvoice}
              addCustomer={addCustomer}
              updateCustomer={updateCustomer}
              deleteCustomer={deleteCustomer}
              restoreCustomer={restoreCustomer}
              permanentDeleteCustomer={permanentDeleteCustomer}
              onOpenNewCustomerModal={handleOpenNewCustomerDashboard}
              targetCustomerId={ledgerTargetCustomerId}
              targetInvoiceId={ledgerTargetInvoiceId}
              clearTargets={() => {
                setLedgerTargetCustomerId(null);
                setLedgerTargetInvoiceId(null);
              }}
              changeLogs={changeLogs}
              isCloudSyncing={isCloudSyncing}
              addChangeLog={addChangeLog}
              deleteChangeLog={deleteChangeLog}
              clearCustomerChangeLogs={clearCustomerChangeLogs}
              revertChangeLogAction={revertChangeLogAction}
            />
          )}

          {currentTab === "customers" && (
            <CustomersView
              customers={activeCustomers}
              invoices={activeInvoices}
              payments={activePayments}
              settings={settings}
              addCustomer={addCustomer}
              updateCustomer={updateCustomer}
              deleteCustomer={deleteCustomer}
            />
          )}

          {currentTab === "products" && (
            <ProductsView
              products={products}
              settings={settings}
              addProduct={addProduct}
              updateProduct={updateProduct}
              deleteProduct={deleteProduct}
            />
          )}

          {currentTab === "payments" && (
            <PaymentsView
              payments={activePayments}
              customers={activeCustomers}
              settings={settings}
              addPayment={addPayment}
              deletePayment={deletePayment}
            />
          )}

          {currentTab === "invoices" && (
            <InvoicesView
              invoices={activeInvoices}
              settings={settings}
              deleteInvoice={deleteInvoice}
              onSelectInvoiceForLedger={handleSelectInvoiceForLedger}
            />
          )}

          {currentTab === "stats" && (
            <StatsView
              customers={activeCustomers}
              products={products}
              invoices={activeInvoices}
              payments={activePayments}
              settings={settings}
            />
          )}

          {currentTab === "reports" && (
            <ReportsView
              customers={activeCustomers}
              products={products}
              invoices={activeInvoices}
              payments={activePayments}
              settings={settings}
              folders={folders}
            />
          )}

          {currentTab === "settings" && (
            <SettingsView
              settings={settings}
              updateSettings={updateSettings}
              resetToDefault={resetToDefault}
              clearAllData={clearAllData}
              importData={importData}
              customers={activeCustomers}
              products={products}
              invoices={activeInvoices}
              payments={activePayments}
              cloudBackups={cloudBackups}
              onCreateCloudBackup={createCloudBackup}
              onRestoreCloudBackup={restoreCloudBackup}
              onDeleteCloudBackup={deleteCloudBackup}
            />
          )}
        </main>

        {/* User Account Manager Modal */}
        <AccountManagerModal
          isOpen={isAccountModalOpen}
          onClose={() => setIsAccountModalOpen(false)}
          storeSettings={settings}
          onNavigateToSettings={() => setCurrentTab("settings")}
          onExportData={handleExportBackup}
          onImportData={importData}
        />

        {/* Notification Center Modal */}
        <NotificationCenterModal
          isOpen={isNotificationCenterOpen}
          onClose={() => setIsNotificationCenterOpen(false)}
          notifications={notificationsList}
          onMarkAsRead={(id) => {
            if (currentUser) {
              markNotificationAsRead(currentUser.uid, id);
            } else {
              setNotificationsList((prev) =>
                prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
              );
            }
          }}
          onMarkAllAsRead={() => {
            if (currentUser) {
              markAllNotificationsAsRead(currentUser.uid, notificationsList);
            } else {
              setNotificationsList((prev) => prev.map((n) => ({ ...n, isRead: true })));
            }
          }}
          onDeleteNotification={(id) => {
            if (currentUser) {
              deleteNotification(currentUser.uid, id);
            } else {
              setNotificationsList((prev) => prev.filter((n) => n.id !== id));
            }
          }}
          onClearAll={() => {
            if (currentUser) {
              clearAllNotifications(currentUser.uid, notificationsList);
            } else {
              setNotificationsList([]);
            }
          }}
          onSelectNotificationAction={(n) => {
            if (n.data && (n.data.customerId || n.data.type)) {
              handleNavigateFromNotification(n.data);
            } else if (n.category === "due_debts") {
              setCurrentTab("overdue");
            } else if (n.category === "debts" || n.category === "payments") {
              setCurrentTab("ledger");
            } else if (n.category === "backup" || n.category === "account") {
              setIsAccountModalOpen(true);
            }
          }}
        />

        {/* Auth Modal for guest users seeking cloud sync */}

        {isAuthModalOpen && (
          <AuthModal
            onSuccess={() => setIsAuthModalOpen(false)}
            onClose={() => setIsAuthModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// LedgerWrapper to handle target selections cleanly when redirecting from other screens
interface LedgerWrapperProps {
  customers: any[];
  products: any[];
  invoices: any[];
  payments: any[];
  settings: any;
  folders?: any[];
  addFolder?: any;
  updateFolder?: any;
  deleteFolder?: any;
  onMoveItems?: any;
  onBulkDelete?: any;
  onBulkRestore?: any;
  onBulkPermanentDelete?: any;
  onEmptyTrash?: any;
  onRestoreAllTrash?: any;
  addInvoice: any;
  updateInvoice: any;
  addPayment: any;
  deleteInvoice: any;
  addCustomer?: any;
  updateCustomer?: any;
  deleteCustomer?: any;
  restoreCustomer?: any;
  permanentDeleteCustomer?: any;
  restoreFolder?: any;
  permanentDeleteFolder?: any;
  onOpenNewCustomerModal: any;
  targetCustomerId: string | null;
  targetInvoiceId: string | null;
  clearTargets: () => void;
  changeLogs?: any[];
  isCloudSyncing?: boolean;
  addChangeLog?: any;
  deleteChangeLog?: any;
  clearCustomerChangeLogs?: any;
  revertChangeLogAction?: any;
}

function LedgerWrapper({
  customers,
  products,
  invoices,
  payments,
  settings,
  folders,
  addFolder,
  updateFolder,
  deleteFolder,
  restoreFolder,
  permanentDeleteFolder,
  onMoveItems,
  onBulkDelete,
  onBulkRestore,
  onBulkPermanentDelete,
  onEmptyTrash,
  onRestoreAllTrash,
  addInvoice,
  updateInvoice,
  addPayment,
  deleteInvoice,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  permanentDeleteCustomer,
  onOpenNewCustomerModal,
  targetCustomerId,
  targetInvoiceId,
  clearTargets,
  changeLogs,
  isCloudSyncing,
  addChangeLog,
  deleteChangeLog,
  clearCustomerChangeLogs,
  revertChangeLogAction,
}: LedgerWrapperProps) {
  // We can initialize LedgerView with a custom internal state that listens to these props
  const [internalCustomerId, setInternalCustomerId] = useState<string | null>(targetCustomerId);
  const [internalInvoiceId, setInternalInvoiceId] = useState<string | null>(targetInvoiceId);

  // Simple interceptor component to synchronize target props
  React.useEffect(() => {
    if (targetCustomerId) {
      setInternalCustomerId(targetCustomerId);
    }
    if (targetInvoiceId) {
      setInternalInvoiceId(targetInvoiceId);
    }
    // Clear once consumed
    clearTargets();
  }, [targetCustomerId, targetInvoiceId]);

  return (
    <LedgerViewIntercepted
      customers={customers}
      products={products}
      invoices={invoices}
      payments={payments}
      settings={settings}
      folders={folders}
      addFolder={addFolder}
      updateFolder={updateFolder}
      deleteFolder={deleteFolder}
      restoreFolder={restoreFolder}
      permanentDeleteFolder={permanentDeleteFolder}
      onMoveItems={onMoveItems}
      onBulkDelete={onBulkDelete}
      onBulkRestore={onBulkRestore}
      onBulkPermanentDelete={onBulkPermanentDelete}
      onEmptyTrash={onEmptyTrash}
      onRestoreAllTrash={onRestoreAllTrash}
      addInvoice={addInvoice}
      updateInvoice={updateInvoice}
      addPayment={addPayment}
      deleteInvoice={deleteInvoice}
      addCustomer={addCustomer}
      updateCustomer={updateCustomer}
      deleteCustomer={deleteCustomer}
      restoreCustomer={restoreCustomer}
      permanentDeleteCustomer={permanentDeleteCustomer}
      onOpenNewCustomerModal={onOpenNewCustomerModal}
      selectedCustomerId={internalCustomerId}
      setSelectedCustomerId={setInternalCustomerId}
      selectedInvoiceId={internalInvoiceId}
      setSelectedInvoiceId={setInternalInvoiceId}
      changeLogs={changeLogs}
      isCloudSyncing={isCloudSyncing}
      addChangeLog={addChangeLog}
      deleteChangeLog={deleteChangeLog}
      clearCustomerChangeLogs={clearCustomerChangeLogs}
      revertChangeLogAction={revertChangeLogAction}
    />
  );
}

// Modified LedgerView to allow external state control (lifting selection state safely)
function LedgerViewIntercepted(props: any) {
  return <LedgerView {...props} />;
}
