import React, { useState, useMemo } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Filter,
  ArrowUpDown,
  X,
  CreditCard,
  Banknote,
  AlertCircle,
  Database,
  ShieldCheck,
  Info,
  Calendar,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { AppNotification, NotificationCategory } from "../types";

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
  onClearAll: () => void;
  onSelectNotificationAction?: (notification: AppNotification) => void;
}

const CATEGORY_LABELS: Record<NotificationCategory, { label: string; icon: any; color: string; bg: string }> = {
  debts: {
    label: "الديون",
    icon: CreditCard,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
  },
  payments: {
    label: "الدفعات",
    icon: Banknote,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
  },
  due_debts: {
    label: "المستحقات والمتأخرات",
    icon: AlertCircle,
    color: "text-rose-600",
    bg: "bg-rose-50 border-rose-200",
  },
  backup: {
    label: "النسخ الاحتياطي",
    icon: Database,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
  },
  account: {
    label: "الحساب والأمان",
    icon: ShieldCheck,
    color: "text-indigo-600",
    bg: "bg-indigo-50 border-indigo-200",
  },
  system_updates: {
    label: "تحديثات التطبيق",
    icon: Sparkles,
    color: "text-purple-600",
    bg: "bg-purple-50 border-purple-200",
  },
  general: {
    label: "عامة",
    icon: Info,
    color: "text-slate-600",
    bg: "bg-slate-50 border-slate-200",
  },
};

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onClearAll,
  onSelectNotificationAction,
}) => {
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

  // Filter and sort notifications
  const filteredNotifications = useMemo(() => {
    return notifications
      .filter((n) => {
        if (readFilter === "unread" && n.isRead) return false;
        if (readFilter === "read" && !n.isRead) return false;
        if (categoryFilter !== "all" && n.category !== categoryFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
      });
  }, [notifications, readFilter, categoryFilter, sortOrder]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.isRead) {
      onMarkAsRead(n.id);
    }
    setSelectedNotification(n);
  };

  return (
    <div
      id="notification-center-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="notification-center-modal"
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] text-right font-sans"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-2xs">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">مركز الإشعارات</h3>
                {unreadCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500 text-white shadow-2xs animate-pulse">
                    {unreadCount} غير مقروء
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                    الكل مقروء
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                سجل إشعاراتك وتنبيهات الحساب المحفوظة سحابياً والمتزامنة بين أجهزتك
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                title="تحديد الكل كمقروء"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
              >
                <CheckCheck className="w-4 h-4" />
                <span className="hidden sm:inline">قراءة الكل</span>
              </button>
            )}

            {notifications.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm("هل أنت متأكد من مسح جميع الإشعارات؟")) {
                    onClearAll();
                  }
                }}
                title="مسح كافة الإشعارات"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-3 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Read State Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setReadFilter("all")}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                readFilter === "all" ? "bg-white text-blue-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setReadFilter("unread")}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                readFilter === "unread" ? "bg-white text-rose-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              غير المقروءة ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setReadFilter("read")}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                readFilter === "read" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              المقروءة ({notifications.length - unreadCount})
            </button>
          </div>

          {/* Categories & Sort */}
          <div className="flex items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">كافة التصنيفات</option>
              <option value="debts">الديون</option>
              <option value="payments">الدفعات</option>
              <option value="due_debts">المستحقات والمتأخرات</option>
              <option value="backup">النسخ الاحتياطي</option>
              <option value="account">الحساب والأمان</option>
              <option value="system_updates">تحديثات التطبيق</option>
              <option value="general">عامة</option>
            </select>

            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === "newest" ? "oldest" : "newest"))}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              title={sortOrder === "newest" ? "الفرز: الأحدث أولاً" : "الفرز: الأقدم أولاً"}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <span>{sortOrder === "newest" ? "الأحدث" : "الأقدم"}</span>
            </button>
          </div>
        </div>

        {/* Notifications List Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 max-h-[55vh]">
          {filteredNotifications.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                <Bell className="w-7 h-7 stroke-[1.5]" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-700">لا توجد إشعارات حالياً</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  {readFilter === "unread"
                    ? "لقد قمت بقراءة كافة الإشعارات والتنبيهات، لا توجد إشعارات جديدة بانتظارك."
                    : "سيتم إظهار كافة الإشعارات المحاسبية وتنبيهات السداد والدفعات هنا فور وصولها."}
                </p>
              </div>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const catConfig = CATEGORY_LABELS[notif.category] || CATEGORY_LABELS.general;
              const IconComp = catConfig.icon;
              const dateObj = new Date(notif.createdAt);
              const formattedTime = dateObj.toLocaleDateString("ar-EG", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`group p-3.5 rounded-xl border transition-all cursor-pointer relative flex items-start justify-between gap-3 ${
                    notif.isRead
                      ? "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50"
                      : "bg-blue-50/40 border-blue-100 hover:border-blue-200 hover:bg-blue-50/70 shadow-2xs"
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${catConfig.bg} ${catConfig.color}`}
                    >
                      <IconComp className="w-4 h-4" />
                    </div>

                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 leading-snug truncate">
                          {notif.title}
                        </span>
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></span>
                        )}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${catConfig.bg} ${catConfig.color}`}
                        >
                          {catConfig.label}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {notif.body}
                      </p>

                      <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formattedTime}</span>
                        </span>
                        {notif.data?.source && (
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-500 font-mono">
                            {notif.data.source}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions (hover or tap) */}
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!notif.isRead ? (
                      <button
                        onClick={() => onMarkAsRead(notif.id)}
                        title="تحديد كمقروء"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    ) : null}

                    <button
                      onClick={() => onDeleteNotification(notif.id)}
                      title="حذف الإشعار"
                      className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer / Notification Details Preview */}
        {selectedNotification && (
          <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-slate-500">تفاصيل الإشعار المحدد:</span>
              <p className="text-xs font-bold text-slate-900">{selectedNotification.title}</p>
              <p className="text-xs text-slate-600">{selectedNotification.body}</p>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              {onSelectNotificationAction && (selectedNotification.data?.action || selectedNotification.data?.customerId || selectedNotification.data?.customer_id) && (
                <button
                  onClick={() => {
                    onSelectNotificationAction(selectedNotification);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح حساب الزبون / الإجراء</span>
                </button>
              )}
              <button
                onClick={() => setSelectedNotification(null)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                إغلاق التفاصيل
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default NotificationCenterModal;
