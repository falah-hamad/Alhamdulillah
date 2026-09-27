import React, { useState } from "react";
import {
  Home,
  BookOpen,
  Users,
  Package,
  DollarSign,
  FileText,
  BarChart3,
  TrendingUp,
  Settings,
  Menu,
  X,
  Building2,
  FolderTree,
  LogOut,
  Cloud,
  AlertTriangle,
} from "lucide-react";
import { SystemSettings } from "../types";
import { useAuth } from "../contexts/AuthContext";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  settings: SystemSettings;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  overdueInvoicesCount?: number;
  onOpenAccountModal?: () => void;
  onOpenAuthModal?: () => void;
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  settings,
  sidebarOpen,
  setSidebarOpen,
  overdueInvoicesCount = 0,
  onOpenAccountModal,
  onOpenAuthModal,
}: SidebarProps) {
  const { currentUser, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleConfirmLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      setShowLogoutConfirm(false);
      onOpenAuthModal?.();
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const menuItems = [
    { id: "home", label: "الرئيسية", icon: Home },
    { id: "ledger", label: "سجل الديون", icon: BookOpen },
    { id: "overdue", label: "المتأخرين", icon: AlertTriangle },
    { id: "customers", label: "العملاء", icon: Users },
    { id: "products", label: "البضائع", icon: Package },
    { id: "payments", label: "الدفعات", icon: DollarSign },
    { id: "invoices", label: "الفواتير", icon: FileText },
    { id: "stats", label: "الحسابات", icon: BarChart3 },
    { id: "reports", label: "التقارير", icon: TrendingUp },
    { id: "settings", label: "الإعدادات", icon: Settings },
  ];

  const userName = currentUser?.displayName || currentUser?.phoneNumber || currentUser?.email?.split('@')[0] || "المحاسب المعتمد";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <>
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300 no-print"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-64 bg-white text-slate-700 flex flex-col border-l border-slate-200 shadow-sm transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        } no-print`}
      >
        {/* Header / Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded text-white shadow-sm shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-slate-900 line-clamp-1">
                {settings.companyName || "المحاسب المحترف"}
              </span>
              <span className="text-[10px] text-blue-600 font-bold flex items-center gap-1">
                <Cloud className="w-3 h-3 text-emerald-500 inline" />
                <span>سحابي ومزامن (Firestore)</span>
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5">
          <div className="px-5 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            القائمة العامة
          </div>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`sidebar-tab-${item.id}`}
                onClick={() => {
                  setCurrentTab(item.id);
                  setSidebarOpen(false); // Close sidebar on mobile
                }}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-xs font-medium transition-all border-r-4 ${
                  isActive
                    ? "bg-blue-50/80 text-blue-700 border-blue-600 font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                <div className="flex items-center justify-between flex-1">
                  <span>{item.label}</span>
                  {(item.id === "home" || item.id === "invoices" || item.id === "overdue") && overdueInvoicesCount > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-600 text-white animate-pulse">
                      {overdueInvoicesCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        {/* User Account & Logout Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-right space-y-2">
          {currentUser ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenAccountModal?.()}
                  id="sidebar-btn-profile"
                  title="إدارة الحساب والملف الشخصي والأمان"
                  className="flex items-center gap-2.5 min-w-0 flex-1 p-1 -m-1 rounded-lg hover:bg-slate-200/60 transition-colors text-right cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm overflow-hidden group-hover:ring-2 group-hover:ring-blue-400">
                    {currentUser?.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="avatar"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      userInitial
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-slate-800 leading-tight truncate group-hover:text-blue-700">
                      {userName}
                    </div>
                    <div className="text-[9px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      <span>متصل ومزامن</span>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  id="sidebar-btn-logout"
                  title="تسجيل الخروج من الحساب"
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

              {(currentUser?.email || currentUser?.phoneNumber) && (
                <div className="text-[10px] text-slate-400 font-mono truncate px-1" dir="ltr">
                  {currentUser.phoneNumber || currentUser.email}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => onOpenAuthModal?.()}
                id="sidebar-btn-login"
                className="w-full py-2 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>تسجيل الدخول / ربط السحابة</span>
              </button>
              <p className="text-[10px] text-slate-400 text-center font-medium">
                الوضع المحلي مفعل (الحفظ بذاكرة المتصفح)
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Confirmation Dialog for Logout */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs font-sans" dir="rtl">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">تسجيل الخروج</h3>
              <p className="text-xs text-slate-600 font-medium">
                هل أنت متأكد من رغبتك في تسجيل الخروج؟
              </p>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 leading-relaxed font-bold">
                ✓ جميع بياناتك وفواتيرك المحاسبية محفوظة ومؤمنة تماماً في السحابة، ويمكنك العودة إليها في أي وقت بمجرد تسجيل الدخول مجدداً.
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={isLoggingOut}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                disabled={isLoggingOut}
                id="sidebar-btn-confirm-logout"
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isLoggingOut ? "جاري الخروج..." : "تأكيد الخروج"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
