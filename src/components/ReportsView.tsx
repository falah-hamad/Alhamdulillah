import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  Printer,
  Calendar,
  FileSpreadsheet,
  Package,
  Users,
  Building,
  BarChart,
  ClipboardList,
  Folder,
  FolderOpen,
  FolderTree,
  ChevronDown
} from "lucide-react";
import { Customer, CustomerFolder, Product, Invoice, Payment, SystemSettings } from "../types";

interface ReportsViewProps {
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
  folders?: CustomerFolder[];
}

interface FolderOption {
  id: string;
  name: string;
  depth: number;
  prefix: string;
  isSubfolder: boolean;
}

export default function ReportsView({
  customers,
  products,
  invoices,
  payments,
  settings,
  folders = [],
}: ReportsViewProps) {
  const [reportType, setReportType] = useState<"debts" | "collections" | "inventory">("debts");

  // Filter by folder: "all" or folderId
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");

  // Filters state
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-12-31");
  const [reportGenerated, setReportGenerated] = useState(true);

  // Active non-deleted folders
  const activeFolders = useMemo(() => {
    return folders.filter((f) => !f.isDeleted);
  }, [folders]);

  // Build hierarchical folder list for dropdown (الكل -> المجلدات -> المجلدات الفرعية)
  const hierarchicalFolderOptions = useMemo(() => {
    const list: FolderOption[] = [];
    const visited = new Set<string>();

    const traverse = (parentId: string | null, depth: number) => {
      const children = activeFolders.filter((f) => {
        if (!parentId) {
          return !f.parentId;
        }
        return f.parentId === parentId;
      });

      // Sort alphabetically for clean presentation
      children.sort((a, b) => a.name.localeCompare(b.name, "ar"));

      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);

        let prefix = "";
        if (depth > 0) {
          prefix = "— ".repeat(depth);
        }

        list.push({
          id: child.id,
          name: child.name,
          depth,
          prefix,
          isSubfolder: depth > 0,
        });

        traverse(child.id, depth + 1);
      }
    };

    traverse(null, 0);

    // Also include any orphan active folders if parentId does not exist in activeFolders
    for (const f of activeFolders) {
      if (!visited.has(f.id)) {
        list.push({
          id: f.id,
          name: f.name,
          depth: 0,
          prefix: "",
          isSubfolder: false,
        });
      }
    }

    return list;
  }, [activeFolders]);

  // Recursively collect all descendant folder IDs for a selected folder
  const targetFolderIds = useMemo(() => {
    if (selectedFolderId === "all") return null;

    const ids = new Set<string>([selectedFolderId]);
    const queue = [selectedFolderId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = activeFolders.filter((f) => f.parentId === currentId);
      for (const child of children) {
        if (!ids.has(child.id)) {
          ids.add(child.id);
          queue.push(child.id);
        }
      }
    }

    return ids;
  }, [selectedFolderId, activeFolders]);

  // Selected folder object & breadcrumb label
  const selectedFolderInfo = useMemo(() => {
    if (selectedFolderId === "all") {
      return { name: "الكل (جميع المجلدات)", isSub: false };
    }
    const found = activeFolders.find((f) => f.id === selectedFolderId);
    if (!found) return { name: "مجلد محدد", isSub: false };

    // Build path trail e.g. "المجلد الرئيسي / المجلد الفرعي"
    const trail: string[] = [];
    let curr: CustomerFolder | undefined = found;
    const visited = new Set<string>();
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      trail.unshift(curr.name);
      if (curr.parentId) {
        curr = activeFolders.find((f) => f.id === curr!.parentId);
      } else {
        break;
      }
    }

    return {
      name: trail.join(" / "),
      isSub: !!found.parentId,
    };
  }, [selectedFolderId, activeFolders]);

  // Filter customers based on selected folder (including subfolders)
  const scopedCustomers = useMemo(() => {
    if (!targetFolderIds) {
      return customers;
    }
    return customers.filter((c) => c.folderId && targetFolderIds.has(c.folderId));
  }, [customers, targetFolderIds]);

  // Map of scoped customer IDs for quick lookup in invoices and payments
  const scopedCustomerIds = useMemo(() => {
    return new Set(scopedCustomers.map((c) => c.id));
  }, [scopedCustomers]);

  // Scoped invoices
  const scopedInvoices = useMemo(() => {
    if (!targetFolderIds) return invoices;
    return invoices.filter((inv) => scopedCustomerIds.has(inv.customerId));
  }, [invoices, targetFolderIds, scopedCustomerIds]);

  // Scoped payments
  const scopedPayments = useMemo(() => {
    if (!targetFolderIds) return payments;
    return payments.filter((p) => p.customerId && scopedCustomerIds.has(p.customerId));
  }, [payments, targetFolderIds, scopedCustomerIds]);

  // 1. Calculations: Debts Report
  const debtsReportData = useMemo(() => {
    return scopedCustomers
      .map((c) => {
        const custInvoices = scopedInvoices.filter((inv) => inv.customerId === c.id);
        const totalInvoiced = custInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
        const totalRemaining = custInvoices.reduce((acc, inv) => acc + inv.remainingAmount, 0);
        const totalPaid = totalInvoiced - totalRemaining;

        // Get last invoice date
        let lastActive = "لا يوجد";
        if (custInvoices.length > 0) {
          const sorted = [...custInvoices].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          lastActive = sorted[0].date;
        }

        // Folder name for customer
        const custFolder = c.folderId ? activeFolders.find((f) => f.id === c.folderId) : null;

        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          folderName: custFolder ? custFolder.name : "عام",
          totalInvoiced,
          totalPaid,
          totalRemaining,
          lastActive,
        };
      })
      .filter((c) => c.totalInvoiced > 0);
  }, [scopedCustomers, scopedInvoices, activeFolders]);

  const debtsReportSummary = useMemo(() => {
    return {
      totalDebts: debtsReportData.reduce((acc, c) => acc + c.totalRemaining, 0),
      totalCollected: debtsReportData.reduce((acc, c) => acc + c.totalPaid, 0),
      totalOverall: debtsReportData.reduce((acc, c) => acc + c.totalInvoiced, 0),
      totalCustomers: debtsReportData.length,
      settledCustomersCount: debtsReportData.filter((c) => c.totalRemaining <= 0).length,
      unsettledCustomersCount: debtsReportData.filter((c) => c.totalRemaining > 0).length,
    };
  }, [debtsReportData]);

  // 2. Calculations: Collections Report within range
  const collectionsReportData = useMemo(() => {
    return scopedPayments.filter((p) => {
      const pDate = new Date(p.date);
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      return pDate >= sDate && pDate <= eDate;
    });
  }, [scopedPayments, startDate, endDate]);

  const collectionsReportSummary = useMemo(() => {
    return {
      totalCollected: collectionsReportData.reduce((acc, p) => acc + p.amount, 0),
      count: collectionsReportData.length,
    };
  }, [collectionsReportData]);

  // 3. Calculations: Inventory Report
  const inventoryReportData = useMemo(() => {
    return products.map((p) => {
      const totalCost = p.purchasePrice * p.quantity;
      const totalRetail = p.salePrice * p.quantity;
      const potentialProfit = totalRetail - totalCost;

      return {
        ...p,
        totalCost,
        totalRetail,
        potentialProfit,
      };
    });
  }, [products]);

  const inventoryReportSummary = useMemo(() => {
    return {
      totalItems: products.reduce((acc, p) => acc + p.quantity, 0),
      totalCost: products.reduce((acc, p) => acc + p.purchasePrice * p.quantity, 0),
      totalRetail: products.reduce((acc, p) => acc + p.salePrice * p.quantity, 0),
    };
  }, [products]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Selection Panel */}
      <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4 no-print">
        <div className="space-y-1 border-b border-slate-100 pb-3">
          <h1 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-600" />
            مركز التقارير المالية والمحاسبية المصدقة
          </h1>
          <p className="text-[11px] text-slate-500">
            حدد نوع التقرير والمجلد المطلوب وعناصر الفلترة ثم أنشئ التقارير وصدرها للطباعة أو الحفظ كملف PDF بشكل رسمي.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Report Type */}
          <div className="space-y-1">
            <label className="block text-slate-500 text-[11px] font-semibold">نوع التقرير المالي</label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as any);
                setReportGenerated(true);
              }}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-blue-500"
            >
              <option value="debts">📒 تقرير الذمم والديون المستحقة للعملاء</option>
              <option value="collections">💰 تقرير حركة المقبوضات والتحصيلات في فترة</option>
              <option value="inventory">📦 تقرير جرد المخزون وحركة الأصول السلعية</option>
            </select>
          </div>

          {/* Folder Selector (عرض حسب: الكل / المجلدات / المجلدات الفرعية) */}
          <div className="space-y-1">
            <label className="block text-slate-500 text-[11px] font-semibold flex items-center justify-between">
              <span>عرض حسب:</span>
              {selectedFolderId !== "all" && (
                <span className="text-[10px] text-blue-600 font-bold">مصفّى حسب المجلد</span>
              )}
            </label>
            <div className="relative">
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="w-full p-2 pr-2 pl-7 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-blue-500 appearance-none text-slate-800"
              >
                <option value="all">📂 الكل (جميع المجلدات)</option>
                {hierarchicalFolderOptions.length > 0 && (
                  <optgroup label="المجلدات والمجلدات الفرعية">
                    {hierarchicalFolderOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.prefix}{f.isSubfolder ? "📁 " : "📁 "}{f.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Date Range - Only shows for Collections */}
          {reportType === "collections" && (
            <>
              <div className="space-y-1">
                <label className="block text-slate-500 text-[11px] font-semibold font-sans">تاريخ البداية</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-slate-500 text-[11px] font-semibold font-sans">تاريخ النهاية</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-blue-500"
                />
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end sm:col-span-2 lg:col-span-1 lg:col-start-4">
            <button
              onClick={handlePrint}
              className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" /> طباعة التقرير الحالي
            </button>
          </div>
        </div>
      </div>

      {/* Printable Report Document Sheet */}
      {reportGenerated && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-md p-6 sm:p-10 space-y-6 print-container text-slate-800 relative">
          
          {/* Official Document Header */}
          <div className="border-b-2 border-slate-300 pb-5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-center sm:text-right space-y-1">
              <div className="flex items-center gap-2 justify-center sm:justify-start text-blue-700">
                <Building className="w-5 h-5" />
                <span className="font-extrabold text-base">{settings.companyName}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">
                هاتف: {settings.companyPhone || "غير مسجل"}
              </p>
              <p className="text-[10px] text-slate-500 line-clamp-1">
                العنوان: {settings.companyAddress || "المملكة العربية السعودية"}
              </p>
            </div>

            <div className="text-center sm:text-left space-y-1">
              <h2 className="text-lg font-black tracking-tight text-slate-950">مستند مالي رسمي ومصدّق</h2>
              <p className="text-[10px] text-slate-400 font-mono">
                تاريخ الاستخراج: {new Date().toLocaleDateString("ar-SA")} | 2026-07-12
              </p>
            </div>
          </div>

          {/* Report Title Banner */}
          <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-200/80 space-y-1.5">
            <h3 className="text-sm font-extrabold text-slate-900">
              {reportType === "debts" && "تقرير أرصدة ذمم مديونيات العملاء الإجمالية"}
              {reportType === "collections" && `تقرير حركة المقبوضات والتحصيلات في الفترة من [${startDate}] إلى [${endDate}]`}
              {reportType === "inventory" && "تقرير جرد المواد ومستوى الأصول وقيم الربحية بالمخزن"}
            </h3>
            
            {/* Display Active Folder Scope Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full text-[11px] font-bold text-slate-700 shadow-2xs">
              <FolderTree className="w-3.5 h-3.5 text-blue-600" />
              <span>نطاق العرض:</span>
              <span className="text-blue-700">{selectedFolderInfo.name}</span>
            </div>

            <p className="text-[10px] text-slate-500">
              تقرير آلي دقيق مصدّر من خادم المحاسبة وسجل الديون الإلكتروني.
            </p>
          </div>

          {/* REPORT DATA 1: DEBTS */}
          {reportType === "debts" && (
            <div className="space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b-2 border-slate-300 text-slate-700 font-bold">
                      <th className="p-2.5">العميل المدين</th>
                      <th className="p-2.5">الحافظة / المجلد</th>
                      <th className="p-2.5">رقم الهاتف</th>
                      <th className="p-2.5 text-left">إجمالي المبيعات</th>
                      <th className="p-2.5 text-left">إجمالي المسدد</th>
                      <th className="p-2.5 text-left">الذمة المتبقية المطلوبة</th>
                      <th className="p-2.5 text-center">أخر عملية حركة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {debtsReportData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 font-sans text-xs">
                          لا توجد مديونيات أو عملاء في هذا المجلد.
                        </td>
                      </tr>
                    ) : (
                      debtsReportData.map((c, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-2.5 font-sans font-bold text-slate-900">{c.name}</td>
                          <td className="p-2.5 font-sans text-slate-600 text-[11px]">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              <Folder className="w-2.5 h-2.5 text-slate-500" />
                              <span>{c.folderName}</span>
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-600">{c.phone}</td>
                          <td className="p-2.5 text-left text-slate-700 font-semibold">{c.totalInvoiced.toLocaleString()}</td>
                          <td className="p-2.5 text-left text-blue-600 font-semibold">{c.totalPaid.toLocaleString()}</td>
                          <td className="p-2.5 text-left text-rose-600 font-extrabold">{c.totalRemaining.toLocaleString()}</td>
                          <td className="p-2.5 text-center font-sans text-slate-400 text-[10px]">{c.lastActive}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Debts Summary Block */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-2 border-slate-200 bg-slate-50 p-4 rounded-xl font-mono text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-sans font-semibold">إجمالي حجم المبيعات الموثقة:</span>
                  <p className="text-base font-extrabold text-slate-800">{debtsReportSummary.totalOverall.toLocaleString()} {settings.currency}</p>
                </div>
                <div className="space-y-1 border-r sm:border-r-0 sm:border-x border-slate-200 px-0 sm:px-4">
                  <span className="text-[10px] text-slate-400 font-sans font-semibold">إجمالي الأموال المحصلة فعلاً:</span>
                  <p className="text-base font-extrabold text-blue-600">{debtsReportSummary.totalCollected.toLocaleString()} {settings.currency}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-sans font-semibold">إجمالي الديون والذمم المتبقية بذمتهم:</span>
                  <p className="text-base font-black text-rose-600 underline">{debtsReportSummary.totalDebts.toLocaleString()} {settings.currency}</p>
                </div>
              </div>

              {/* Customers & Settlement Statistics for this Folder */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/70">
                <div className="flex items-center justify-between px-2">
                  <span className="text-slate-500 font-medium">عدد الزبائن في النطاق:</span>
                  <span className="font-bold text-slate-800 font-mono text-sm">{debtsReportSummary.totalCustomers}</span>
                </div>
                <div className="flex items-center justify-between px-2 sm:border-r border-slate-200">
                  <span className="text-emerald-700 font-medium">الزبائن المسددين بالكامل:</span>
                  <span className="font-bold text-emerald-800 font-mono text-sm">{debtsReportSummary.settledCustomersCount}</span>
                </div>
                <div className="flex items-center justify-between px-2 sm:border-r border-slate-200">
                  <span className="text-rose-700 font-medium">الزبائن المتبقي عليهم ديون:</span>
                  <span className="font-bold text-rose-800 font-mono text-sm">{debtsReportSummary.unsettledCustomersCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* REPORT DATA 2: COLLECTIONS */}
          {reportType === "collections" && (
            <div className="space-y-6">
              {collectionsReportData.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">لا توجد تحصيلات مسجلة في هذا النطاق الزمني أو المجلد المحدد.</div>
              ) : (
                <div className="space-y-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 border-b-2 border-slate-300 text-slate-700 font-bold">
                          <th className="p-2.5">رقم السند</th>
                          <th className="p-2.5">تاريخ التحصيل</th>
                          <th className="p-2.5">العميل المسدد</th>
                          <th className="p-2.5 text-center">طريقة الدفع</th>
                          <th className="p-2.5 text-right">ملاحظات تبيين الدفعة</th>
                          <th className="p-2.5 text-left">قيمة الدفعة المحصلة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {collectionsReportData.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-2.5 text-slate-500 font-mono uppercase">{p.id.slice(-8)}</td>
                            <td className="p-2.5 text-slate-600">{p.date}</td>
                            <td className="p-2.5 font-sans font-bold text-slate-800">{p.customerName}</td>
                            <td className="p-2.5 text-center font-sans font-semibold text-slate-700">{p.method}</td>
                            <td className="p-2.5 text-right font-sans text-slate-500">{p.notes || "لا توجد"}</td>
                            <td className="p-2.5 text-left text-blue-600 font-extrabold">{p.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary */}
                  <div className="border-2 border-slate-200 bg-slate-50 p-4 rounded-xl font-mono text-left text-xs flex justify-between items-center">
                    <span className="font-sans font-bold text-slate-600 text-sm">مجموع المبالغ المقبوضة والمستلمة في هذه الفترة:</span>
                    <span className="text-lg font-black text-blue-600">
                      {collectionsReportSummary.totalCollected.toLocaleString()} {settings.currency}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* REPORT DATA 3: INVENTORY */}
          {reportType === "inventory" && (
            <div className="space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b-2 border-slate-300 text-slate-700 font-bold">
                      <th className="p-2.5">البضاعة</th>
                      <th className="p-2.5">التصنيف</th>
                      <th className="p-2.5 text-center">الكمية المتوفرة</th>
                      <th className="p-2.5 text-left">سعر الشراء الكلي</th>
                      <th className="p-2.5 text-left">سعر البيع الكلي</th>
                      <th className="p-2.5 text-left">الأرباح المتوقعة الكاملة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {inventoryReportData.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-2.5 font-sans font-bold text-slate-900">{p.name}</td>
                        <td className="p-2.5 font-sans text-slate-500">{p.category}</td>
                        <td className="p-2.5 text-center font-extrabold text-slate-700">{p.quantity} وحدة</td>
                        <td className="p-2.5 text-left text-slate-500">{p.totalCost.toLocaleString()}</td>
                        <td className="p-2.5 text-left text-slate-700">{p.totalRetail.toLocaleString()}</td>
                        <td className="p-2.5 text-left text-blue-600 font-extrabold">{p.potentialProfit.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-2 border-slate-200 bg-slate-50 p-4 rounded-xl font-mono text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-sans font-semibold">إجمالي السلع والوحدات بالمستودع:</span>
                  <p className="text-base font-extrabold text-slate-800">{inventoryReportSummary.totalItems.toLocaleString()} قطع</p>
                </div>
                <div className="space-y-1 border-r sm:border-r-0 sm:border-x border-slate-200 px-0 sm:px-4">
                  <span className="text-[10px] text-slate-400 font-sans font-semibold">إجمالي التكلفة الكلية (الأصول بسعر الشراء):</span>
                  <p className="text-base font-extrabold text-slate-800">{inventoryReportSummary.totalCost.toLocaleString()} {settings.currency}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-sans font-semibold">القيمة التسييلية الإجمالية للمخزن:</span>
                  <p className="text-base font-black text-blue-600">{inventoryReportSummary.totalRetail.toLocaleString()} {settings.currency}</p>
                </div>
              </div>
            </div>
          )}

          {/* Formal Stamp/Signature section in reports */}
          <div className="pt-10 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 text-center">
            <div>
              <p className="font-semibold">الموظف المدخل والمعد للتقرير</p>
              <p className="mt-8 border-t border-dotted border-slate-300 w-48 mx-auto pt-1 text-[11px] text-slate-400">عبدالرحمن الحربي</p>
            </div>
            <div>
              <p className="font-semibold">المدير المالي والاعتماد والمصادقة</p>
              <p className="mt-8 border-t border-dotted border-slate-300 w-48 mx-auto pt-1 text-[11px] text-slate-400">{settings.signaturePlaceholder || "المحاسب المسؤول"}</p>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="w-16 h-16 border-2 border-dashed border-slate-300 rounded-full flex items-center justify-center text-[9px] text-slate-300 font-sans tracking-wide uppercase select-none">
                الختم الرسمي
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
