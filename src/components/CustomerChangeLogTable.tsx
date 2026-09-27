import React, { useState, useMemo } from "react";
import {
  History,
  PlusCircle,
  Trash2,
  ArrowDownCircle,
  RotateCcw,
  CheckCircle2,
  Printer,
  Search,
  Filter,
  Cloud,
  FileSpreadsheet,
  AlertCircle,
} from "lucide-react";
import { CustomerChangeLogItem, ChangeLogActionType } from "../types";
import { printElement } from "../utils/printUtils";

interface CustomerChangeLogTableProps {
  customerId: string;
  customerName: string;
  changeLogs: CustomerChangeLogItem[];
  currency?: string;
  onDeleteLog?: (id: string) => void;
  onClearLogs?: (customerId: string) => void;
  onClearCustomerLogs?: (customerId: string) => void;
  onRevertLog?: (log: CustomerChangeLogItem) => void;
  onRevertAction?: (log: CustomerChangeLogItem) => void;
  isSyncing?: boolean;
  isCloudSyncing?: boolean;
}

export default function CustomerChangeLogTable({
  customerId,
  customerName,
  changeLogs,
  currency = "د.ع",
  onDeleteLog,
  onClearLogs,
  onClearCustomerLogs,
  onRevertLog,
  onRevertAction,
  isSyncing = false,
  isCloudSyncing = false,
}: CustomerChangeLogTableProps) {
  const handleClear = onClearCustomerLogs || onClearLogs;
  const handleRevert = onRevertAction || onRevertLog;
  const syncingState = isCloudSyncing || isSyncing;

  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filter logs for this specific customer
  const customerLogs = useMemo(() => {
    return changeLogs
      .filter((log) => log.customerId === customerId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [changeLogs, customerId]);

  // Search and type filtering
  const filteredLogs = useMemo(() => {
    return customerLogs.filter((log) => {
      const matchesType =
        filterType === "all" ||
        (filterType === "debts" && (log.actionType === "إضافة دين" || log.actionType === "حذف دين")) ||
        (filterType === "payments" && (log.actionType === "إضافة واصل" || log.actionType === "حذف واصل")) ||
        log.actionType === filterType;

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        log.details.toLowerCase().includes(q) ||
        log.actionType.toLowerCase().includes(q) ||
        log.formattedDateTime.toLowerCase().includes(q);

      return matchesType && matchesSearch;
    });
  }, [customerLogs, filterType, searchQuery]);

  // Badge styler for action types
  const getActionBadge = (type: ChangeLogActionType) => {
    switch (type) {
      case "إضافة دين":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100/90 text-emerald-800 border border-emerald-300">
            <PlusCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>إضافة دين</span>
          </span>
        );
      case "حذف دين":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100/90 text-rose-800 border border-rose-300">
            <Trash2 className="w-3.5 h-3.5 text-rose-700 shrink-0" />
            <span>حذف دين</span>
          </span>
        );
      case "إضافة واصل":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100/90 text-blue-800 border border-blue-300">
            <ArrowDownCircle className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            <span>إضافة واصل</span>
          </span>
        );
      case "حذف واصل":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100/90 text-amber-900 border border-amber-300">
            <Trash2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>حذف واصل</span>
          </span>
        );
      case "استرجاع عملية":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100/90 text-purple-800 border border-purple-300">
            <RotateCcw className="w-3.5 h-3.5 text-purple-700 shrink-0" />
            <span>استرجاع عملية</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <span>{type}</span>
          </span>
        );
    }
  };

  const handlePrintLogs = () => {
    printElement("printable-customer-changelog-table", {
      title: `سجل تغييرات حساب - ${customerName}`,
    });
  };

  const handleClearAll = () => {
    if (customerLogs.length === 0) return;
    const confirmed = window.confirm(
      `هل أنت متأكد من تفريغ سجل التغييرات للزبون "${customerName}"؟ لا يمكن التراجع عن هذا الإجراء.`
    );
    if (confirmed && handleClear) {
      handleClear(customerId);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all text-slate-800">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-amber-50/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-base text-slate-900">سجل التغييرات</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                {customerLogs.length} حركة
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              متابعة حركات الإضافة والحذف للديون والواصل في ورقة حساب الزبون:{" "}
              <span className="font-bold text-slate-700">{customerName}</span>
            </p>
          </div>
        </div>

        {/* Sync & Action controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100/90 text-slate-600 border border-slate-200">
            <Cloud className={`w-3.5 h-3.5 ${syncingState ? "text-amber-500 animate-spin" : "text-emerald-500"}`} />
            <span>{syncingState ? "جاري المزامنة..." : "مزامن سحابياً"}</span>
          </div>

          <button
            type="button"
            onClick={handlePrintLogs}
            disabled={filteredLogs.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
            title="طباعة سجل التغييرات"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة السجل</span>
          </button>

          {customerLogs.length > 0 && handleClear && (
            <button
              type="button"
              onClick={handleClearAll}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="تفريغ سجل التغييرات"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>تفريغ</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            تصفية:
          </span>
          {[
            { id: "all", label: "كافة الحركات" },
            { id: "debts", label: "الديون فقط" },
            { id: "payments", label: "الواصل فقط" },
            { id: "إضافة دين", label: "إضافة دين" },
            { id: "حذف دين", label: "حذف دين" },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setFilterType(btn.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === btn.id
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1 sm:flex-none">
          <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في تفاصيل أو وقت الحركة..."
            className="w-full pr-8 pl-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table Container */}
      <div id="printable-customer-changelog-table" className="overflow-x-auto">
        <table className="w-full text-right border-collapse select-text">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 text-xs font-bold border-b border-slate-200">
              <th className="py-3 px-4 text-center w-16">#</th>
              <th className="py-3 px-4 text-right min-w-[140px]">نوع الحركة</th>
              <th className="py-3 px-6 text-right min-w-[240px]">تفاصيل الحركة</th>
              <th className="py-3 px-4 text-right min-w-[180px]">وقت ويوم الحركة</th>
              {onRevertLog && <th className="py-3 px-4 text-center w-28 no-print">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={onRevertLog ? 5 : 4} className="py-12 px-4 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileSpreadsheet className="w-8 h-8 text-slate-300 stroke-1" />
                    <p className="font-bold text-sm text-slate-600">لا توجد حركات مسجلة في سجل التغييرات</p>
                    <p className="text-xs text-slate-400 max-w-sm">
                      يتم تسجيل العمليات تلقائياً عند إضافة دين جديد بالمبلغ والبيان، أو حذف أي صف دين أو واصل من ورقة الحساب.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredLogs.map((log, idx) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-50/80 transition-colors group"
                >
                  {/* Sequence Number */}
                  <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-400">
                    {filteredLogs.length - idx}
                  </td>

                  {/* نوع الحركة (Action Type) */}
                  <td className="py-2.5 px-4">
                    {getActionBadge(log.actionType)}
                  </td>

                  {/* تفاصيل الحركة (Details) */}
                  <td className="py-2.5 px-6 font-bold text-slate-900 text-[13px] font-sans">
                    {log.details}
                  </td>

                  {/* وقت ويوم الحركة (Date & Time) */}
                  <td className="py-2.5 px-4 text-slate-600 font-mono text-xs" dir="ltr">
                    <span className="font-semibold text-slate-800">{log.formattedDateTime}</span>
                  </td>

                  {/* Action (Revert / Delete) */}
                  {handleRevert && (
                    <td className="py-2.5 px-4 text-center no-print">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRevert(log)}
                          className="px-2 py-1 rounded text-[11px] font-bold text-purple-700 hover:bg-purple-100 flex items-center gap-1 transition-colors cursor-pointer border border-purple-200"
                          title="استرجاع هذه العملية إلى ورقة الحساب"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>استرجاع</span>
                        </button>
                        {onDeleteLog && (
                          <button
                            type="button"
                            onClick={() => onDeleteLog(log.id)}
                            className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="حذف هذا السجل فقط"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / Summary */}
      {customerLogs.length > 0 && (
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span>
              إجمالي الحركات: <strong className="text-slate-800">{customerLogs.length}</strong>
            </span>
            <span>
              إضافات الديون:{" "}
              <strong className="text-emerald-700">
                {customerLogs.filter((l) => l.actionType === "إضافة دين").length}
              </strong>
            </span>
            <span>
              حذف الديون:{" "}
              <strong className="text-rose-700">
                {customerLogs.filter((l) => l.actionType === "حذف دين").length}
              </strong>
            </span>
            <span>
              الواصل (إضافة/حذف):{" "}
              <strong className="text-blue-700">
                {customerLogs.filter((l) => l.actionType === "إضافة واصل" || l.actionType === "حذف واصل").length}
              </strong>
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            سجل دقيق مرتبط مباشرة بجدول ورقة الحساب الحقيقي
          </span>
        </div>
      )}
    </div>
  );
}
