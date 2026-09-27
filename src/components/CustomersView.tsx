import React, { useState } from "react";
import {
  Users,
  Search,
  PlusCircle,
  Phone,
  MapPin,
  FileText,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  Trash2,
  Calendar,
  X,
  CreditCard,
  Edit,
  ClipboardList,
  ChevronLeft,
  ArrowRight,
  LayoutGrid,
  List,
  Folder,
  FolderOpen,
  User,
  Loader2
} from "lucide-react";
import { Customer, Invoice, Payment, SystemSettings } from "../types";
import { printElement } from "../utils/printUtils";

interface CustomersViewProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
  addCustomer: (customer: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (customer: Customer) => void;
  deleteCustomer: (id: string) => void;
}

export default function CustomersView({
  customers,
  invoices,
  payments,
  settings,
  addCustomer,
  updateCustomer,
  deleteCustomer,
}: CustomersViewProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerTab, setCustomerTab] = useState<"statement" | "invoices" | "purchases" | "payments">("statement");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPrintingCustomer, setIsPrintingCustomer] = useState(false);

  // Modals for Customer Management
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Add/Edit Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Customer View Mode: "grid" | "list" | "large_icons" | "small_icons"
  const [customerViewMode, setCustomerViewMode] = useState<"grid" | "list" | "large_icons" | "small_icons">(() => {
    try {
      return (localStorage.getItem("ledger_customer_view_mode") as any) || "list";
    } catch {
      return "list";
    }
  });

  const handleSetCustomerViewMode = (mode: "grid" | "list" | "large_icons" | "small_icons") => {
    setCustomerViewMode(mode);
    try {
      localStorage.setItem("ledger_customer_view_mode", mode);
    } catch {}
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Calculations for a customer
  const getCustomerMetrics = (custId: string) => {
    const custInvoices = invoices.filter((inv) => inv.customerId === custId);
    const custPayments = payments.filter((p) => p.customerId === custId);

    const totalDebts = custInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
    const totalPaid = custPayments.reduce((acc, p) => acc + p.amount, 0);
    const totalRemaining = custInvoices.reduce((acc, inv) => acc + inv.remainingAmount, 0);

    // Get all purchases (items list)
    const purchases = custInvoices.flatMap((inv) =>
      inv.items.map((item) => ({
        ...item,
        date: inv.date,
        invoiceNumber: inv.invoiceNumber,
      }))
    );

    // Build unified chronological ledger (statement of account)
    const ledgerEntries: {
      date: string;
      id: string;
      type: "invoice" | "payment";
      description: string;
      debit: number; // Invoice increase debt
      credit: number; // Payment decrease debt
    }[] = [];

    custInvoices.forEach((inv) => {
      ledgerEntries.push({
        date: inv.date,
        id: inv.id,
        type: "invoice",
        description: `فاتورة مبيعات ديون رقم ${inv.invoiceNumber}`,
        debit: inv.grandTotal,
        credit: 0,
      });
    });

    custPayments.forEach((p) => {
      ledgerEntries.push({
        date: p.date,
        id: p.id,
        type: "payment",
        description: `دفعة تسديد مستلمة (${p.method}) ${p.notes ? `• ${p.notes}` : ""}`,
        debit: 0,
        credit: p.amount,
      });
    });

    // Sort by date
    ledgerEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let balance = 0;
    const ledgerWithBalance = ledgerEntries.map((entry) => {
      balance += entry.debit - entry.credit;
      return {
        ...entry,
        runningBalance: balance,
      };
    });

    return {
      totalDebts,
      totalPaid,
      totalRemaining,
      invoiceCount: custInvoices.length,
      paymentCount: custPayments.length,
      invoices: custInvoices,
      payments: custPayments,
      purchases,
      ledger: ledgerWithBalance,
    };
  };

  // Submit forms
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert("الرجاء تعبئة الاسم ورقم الهاتف.");
      return;
    }
    addCustomer({ name, phone, address });
    setIsAddModalOpen(false);
    setName("");
    setPhone("");
    setAddress("");
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    if (!name.trim() || !phone.trim()) {
      alert("الرجاء تعبئة الاسم ورقم الهاتف.");
      return;
    }
    updateCustomer({
      ...editingCustomer,
      name,
      phone,
      address,
    });
    setIsEditModalOpen(false);
    setEditingCustomer(null);
    setName("");
    setPhone("");
    setAddress("");
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address || "");
    setIsEditModalOpen(true);
  };

  const handleDelete = (id: string, cName: string) => {
    if (confirm(`تحذير: هل أنت متأكد من حذف العميل "${cName}"؟ سيؤدي ذلك لحذف جميع فواتيره ودفعاته من النظام ولا يمكن التراجع عن هذا الإجراء.`)) {
      deleteCustomer(id);
      setSelectedCustomerId(null);
    }
  };

  // Filter customers
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.address && c.address.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Search & Actions Top Header */}
      {!selectedCustomerId && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                إدارة ملفات العملاء والحسابات
              </h1>
              <p className="text-slate-500 text-xs">
                إضافة، تعديل، وحذف بيانات العملاء واستعراض كشوفات حساب تفصيلية لكل عميل.
              </p>
            </div>
            <button
              id="customers-btn-add"
              onClick={() => {
                setName("");
                setPhone("");
                setAddress("");
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              إضافة عميل جديد
            </button>
          </div>

          {/* Search & View Mode Switcher Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search bar */}
            <div className="relative flex-1">
              <Search className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                id="customers-search-input"
                type="text"
                placeholder="ابحث عن العميل بالاسم، رقم الهاتف أو العنوان..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-2xs"
              />
            </div>

            {/* View Mode Switcher Buttons */}
            <div
              className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs shrink-0 select-none overflow-x-auto"
            >
              <button
                type="button"
                onClick={() => handleSetCustomerViewMode("grid")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  customerViewMode === "grid"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
                title="Grid View — عرض شبكي، المجلدات تظهر كمربعات وبطاقات"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>عرض شبكي</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetCustomerViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  customerViewMode === "list"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
                title="List View — عرض قائمة أسطر مفصلة"
              >
                <List className="w-3.5 h-3.5" />
                <span>عرض قائمة</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetCustomerViewMode("large_icons")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  customerViewMode === "large_icons"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
                title="Large Icons — أيقونات مجلدات كبيرة"
              >
                <Folder className={`w-3.5 h-3.5 ${customerViewMode === "large_icons" ? "text-amber-200 fill-amber-300" : "text-amber-500 fill-amber-400"}`} />
                <span>أيقونات كبيرة</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetCustomerViewMode("small_icons")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  customerViewMode === "small_icons"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
                title="Small Icons — أيقونات صغيرة مدمجة"
              >
                <FolderOpen className={`w-3.5 h-3.5 ${customerViewMode === "small_icons" ? "text-amber-200" : "text-amber-600"}`} />
                <span>أيقونات صغيرة</span>
              </button>
            </div>
          </div>

          {/* Customers Table/Grid */}
          {filteredCustomers.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 py-12 text-center text-slate-400 text-xs shadow-sm">
              لم يتم العثور على أي عملاء مسجلين.
            </div>
          ) : (
            <>
              {/* 1. GRID VIEW — عرض شبكي، المجلدات تظهر كمربعات/بطاقات */}
              {customerViewMode === "grid" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCustomers.map((c) => {
                    const metrics = getCustomerMetrics(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedCustomerId(c.id)}
                        className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all p-5 flex flex-col justify-between cursor-pointer group hover:border-blue-300"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-2xs">
                                <User className="w-5 h-5" />
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-900 text-sm leading-tight group-hover:text-blue-700 transition-colors">
                                  {c.name}
                                </h3>
                                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                                  <span className="flex items-center gap-1 font-mono">
                                    <Phone className="w-3 h-3 text-slate-400" /> {c.phone}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold border border-slate-200 shrink-0">
                              {metrics.invoiceCount} قوائم
                            </span>
                          </div>

                          {/* Quick Balance Grid */}
                          <div className="grid grid-cols-3 gap-2 bg-slate-50/80 p-2.5 rounded-xl text-center font-mono border border-slate-100">
                            <div>
                              <p className="text-[9px] text-slate-400 font-sans font-medium">الديون</p>
                              <p className="text-xs font-bold text-slate-800 mt-0.5">
                                {metrics.totalDebts.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-400 font-sans font-medium">المسدد</p>
                              <p className="text-xs font-bold text-blue-600 mt-0.5">
                                {metrics.totalPaid.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-400 font-sans font-medium">المطلوب</p>
                              <p className="text-xs font-black text-rose-600 mt-0.5">
                                {metrics.totalRemaining.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-mono">
                            {c.address ? c.address : `معرف: ${c.id.slice(0, 8)}`}
                          </span>
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => openEditModal(c)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="تعديل"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <span
                              onClick={() => setSelectedCustomerId(c.id)}
                              className="px-3 py-1 bg-blue-50 group-hover:bg-blue-600 text-blue-700 group-hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                            >
                              كشف الحساب <ChevronLeft className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2. LIST VIEW — عرض قائمة: الاسم، الموقع، وفتح الدفتر فقط */}
              {customerViewMode === "list" && (
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-bold select-none">
                          <th className="p-3.5 pr-5">الاسم</th>
                          <th className="p-3.5">الموقع</th>
                          <th className="p-3.5 text-center">فتح الدفتر</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredCustomers.map((c) => {
                          return (
                            <tr
                              key={c.id}
                              onClick={() => setSelectedCustomerId(c.id)}
                              className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                            >
                              {/* الاسم فقط مع أيقونة الزبون / الشخص */}
                              <td className="p-3.5 pr-5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200/80 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-2xs">
                                    <User className="w-4 h-4" />
                                  </div>
                                  <span className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                                    {c.name}
                                  </span>
                                </div>
                              </td>

                              {/* الموقع فقط */}
                              <td className="p-3.5">
                                <div className="flex items-center gap-1.5 text-slate-700">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="font-medium text-xs">
                                    {c.address && c.address.trim() ? c.address : "غير محدد"}
                                  </span>
                                </div>
                              </td>

                              {/* فتح الدفتر فقط */}
                              <td className="p-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCustomerId(c.id);
                                  }}
                                  className="px-3.5 py-1.5 bg-blue-50 group-hover:bg-blue-600 text-blue-700 group-hover:text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                >
                                  <span>فتح الدفتر</span>
                                  <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 3. LARGE ICONS — أيقونات شخص/زبون كبيرة */}
              {customerViewMode === "large_icons" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
                  {filteredCustomers.map((c) => {
                    const metrics = getCustomerMetrics(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedCustomerId(c.id)}
                        className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition-all p-3.5 flex flex-col items-center text-center cursor-pointer group hover:border-blue-400 relative"
                      >
                        {/* Customer Avatar Graphic */}
                        <div className="relative my-1">
                          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-gradient-to-br from-blue-100 via-blue-50 to-indigo-100 border border-blue-200/90 flex items-center justify-center shadow-xs group-hover:scale-105 group-hover:shadow-sm transition-transform text-blue-600">
                            <User className="w-9 h-9 sm:w-10 sm:h-10 text-blue-600 drop-shadow-2xs" />
                          </div>
                          <span className="absolute -top-1 -left-1 px-1.5 py-0.2 bg-blue-600 text-white font-mono font-bold text-[9px] rounded-full shadow-xs">
                            {metrics.invoiceCount}
                          </span>
                        </div>

                        {/* Customer Name */}
                        <h4 className="font-bold text-slate-900 text-xs sm:text-sm mt-2 line-clamp-1 w-full group-hover:text-blue-700 transition-colors">
                          {c.name}
                        </h4>

                        {/* Phone */}
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate w-full">
                          {c.phone}
                        </p>

                        {/* Debt Status Badge */}
                        <div className="mt-2.5 w-full">
                          <div className={`w-full py-1 px-1.5 rounded-lg text-[10px] font-mono font-bold truncate ${
                            metrics.totalRemaining > 0
                              ? "bg-rose-50 text-rose-700 border border-rose-200/80"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                          }`}>
                            {metrics.totalRemaining > 0
                              ? `${metrics.totalRemaining.toLocaleString()} ${settings.currency}`
                              : "مسدد بالكامل"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 4. SMALL ICONS — أيقونات شخص/زبون صغيرة مدمجة */}
              {customerViewMode === "small_icons" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {filteredCustomers.map((c) => {
                    const metrics = getCustomerMetrics(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedCustomerId(c.id)}
                        className="bg-white rounded-xl border border-slate-200/80 hover:border-blue-400 shadow-2xs hover:shadow-xs transition-all p-2.5 flex items-center justify-between gap-2.5 cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <User className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-xs truncate group-hover:text-blue-700 transition-colors">
                              {c.name}
                            </p>
                            <p className="text-[10px] font-mono text-slate-400 truncate">
                              {c.phone}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-left font-mono">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            metrics.totalRemaining > 0
                              ? "bg-rose-50 text-rose-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}>
                            {metrics.totalRemaining > 0 ? metrics.totalRemaining.toLocaleString() : "مسدد"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 2. CUSTOMER COMPREHENSIVE STATEMENT PROFILE SCREEN */}
      {selectedCustomerId && selectedCustomer && (
        <div className="space-y-6">
          
          {/* Header Return button & info */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm no-print">
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs font-bold cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" /> العودة لإدارة العملاء
            </button>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (isPrintingCustomer) return;
                  setIsPrintingCustomer(true);
                  try {
                    await printElement("customer-statement-card", {
                      title: `كشف_حساب_${selectedCustomer.name}`,
                      onComplete: () => setIsPrintingCustomer(false),
                    });
                  } catch (err) {
                    console.error("Print error", err);
                    setIsPrintingCustomer(false);
                  } finally {
                    setTimeout(() => setIsPrintingCustomer(false), 1500);
                  }
                }}
                disabled={isPrintingCustomer}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="طباعة كشف حساب العميل كاملاً"
              >
                {isPrintingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span>{isPrintingCustomer ? "جاري تجهيز الكشف..." : "طباعة كشف الحساب"}</span>
              </button>
              <button
                onClick={() => openEditModal(selectedCustomer)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Edit className="w-4 h-4" /> تعديل بيانات العميل
              </button>
            </div>
          </div>

          {/* Customer profile card summary */}
          <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="space-y-2 md:col-span-2">
                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-bold border border-blue-100 uppercase">
                  ملف العميل المالي
                </span>
                <h2 className="text-xl font-black text-slate-900 leading-tight">
                  {selectedCustomer.name}
                </h2>
                <div className="flex flex-wrap gap-4 text-xs text-slate-400 font-medium">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-300" /> {selectedCustomer.phone}
                  </span>
                  {selectedCustomer.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-300" /> {selectedCustomer.address}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-300" /> تسجيل: {new Date(selectedCustomer.createdAt).toLocaleDateString("ar-SA")}
                  </span>
                </div>
              </div>

              {/* Dynamic metrics card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono text-right grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[9px] text-slate-400 font-sans font-semibold">إجمالي الديون</span>
                  <p className="text-sm font-bold text-slate-800 mt-1">
                    {getCustomerMetrics(selectedCustomer.id).totalDebts.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 font-sans font-semibold">إجمالي المسدد</span>
                  <p className="text-sm font-bold text-blue-600 mt-1">
                    {getCustomerMetrics(selectedCustomer.id).totalPaid.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 font-sans font-semibold">الرصيد المطلوب</span>
                  <p className="text-sm font-bold text-rose-600 mt-1">
                    {getCustomerMetrics(selectedCustomer.id).totalRemaining.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tab Selection */}
          <div className="flex border-b border-slate-200 no-print">
            <button
              onClick={() => setCustomerTab("statement")}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                customerTab === "statement"
                  ? "border-blue-600 text-blue-700 font-black"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <ClipboardList className="w-4 h-4" /> كشف حساب مالي تفصيلي
            </button>
            <button
              onClick={() => setCustomerTab("invoices")}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                customerTab === "invoices"
                  ? "border-blue-600 text-blue-700 font-black"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileText className="w-4 h-4" /> قوائم الحساب والفواتير ({getCustomerMetrics(selectedCustomer.id).invoiceCount})
            </button>
            <button
              onClick={() => setCustomerTab("purchases")}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                customerTab === "purchases"
                  ? "border-blue-600 text-blue-700 font-black"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <ClipboardList className="w-4 h-4" /> البنود والمشتريات
            </button>
            <button
              onClick={() => setCustomerTab("payments")}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                customerTab === "payments"
                  ? "border-blue-600 text-blue-700 font-black"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <DollarSign className="w-4 h-4" /> عمليات التسديد ({getCustomerMetrics(selectedCustomer.id).paymentCount})
            </button>
          </div>

          {/* Tab Content 1: Unified Statement of Account (كشف حساب مالي تفصيلي) */}
          {customerTab === "statement" && (
            <div id="customer-statement-card" className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4 print-container">
              
              {/* Header inside print area */}
              <div className="hidden print:block text-center border-b pb-4 space-y-1 mb-4">
                <h1 className="text-lg font-bold">{settings.companyName}</h1>
                <p className="text-xs">كشف حساب عميل مفصل ومصدّق</p>
                <div className="text-[10px] text-slate-500 flex justify-center gap-4 mt-2">
                  <span>اسم العميل: {selectedCustomer.name}</span>
                  <span>رقم الهاتف: {selectedCustomer.phone}</span>
                  <span>تاريخ الطباعة: {new Date().toLocaleDateString("ar-SA")}</span>
                </div>
              </div>

              <div className="flex justify-between items-center no-print">
                <h3 className="text-xs font-bold text-slate-500 uppercase">حركة القيود والعمليات المالية للعميل</h3>
                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 font-mono rounded">
                  {getCustomerMetrics(selectedCustomer.id).ledger.length} قيود
                </span>
              </div>

              {getCustomerMetrics(selectedCustomer.id).ledger.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  لا توجد أي قيود أو عمليات مالية مسجلة للعميل حتى الآن.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                        <th className="p-3">التاريخ</th>
                        <th className="p-3 text-right">البيان / تفاصيل العملية</th>
                        <th className="p-3 text-left">مدين (قيمة الفاتورة)</th>
                        <th className="p-3 text-left">دائن (تسديد العميل)</th>
                        <th className="p-3 text-left font-sans">الرصيد الجاري المستحق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {getCustomerMetrics(selectedCustomer.id).ledger.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="p-3 font-sans text-slate-500 whitespace-nowrap">
                            {entry.date}
                          </td>
                          <td className="p-3 text-right text-slate-800 font-sans font-medium">
                            {entry.description}
                          </td>
                          <td className="p-3 text-left font-bold text-rose-600">
                            {entry.debit > 0 ? `${entry.debit.toLocaleString()} ${settings.currency}` : "-"}
                          </td>
                          <td className="p-3 text-left font-bold text-blue-600">
                            {entry.credit > 0 ? `${entry.credit.toLocaleString()} ${settings.currency}` : "-"}
                          </td>
                          <td className="p-3 text-left font-bold text-slate-900 bg-slate-50/30">
                            {entry.runningBalance.toLocaleString()} {settings.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Account statement sign off (Print only) */}
              <div className="hidden print:grid grid-cols-2 gap-4 pt-10 text-xs text-slate-600 text-center">
                <div>
                  <p className="font-semibold">توقيع المحاسب / مسؤول الخزينة</p>
                  <p className="mt-8 border-t border-dashed w-48 mx-auto pt-1 text-[11px] text-slate-400">عبدالرحمن الحربي</p>
                </div>
                <div>
                  <p className="font-semibold">توقيع / مصادقة العميل المدين</p>
                  <p className="mt-8 border-t border-dashed w-48 mx-auto pt-1 text-[11px] text-slate-400">{selectedCustomer.name}</p>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content 2: Ledgers / Invoices list */}
          {customerTab === "invoices" && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase">قوائم فواتير الديون المسجلة</h3>
              {getCustomerMetrics(selectedCustomer.id).invoices.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  لم يتم إصدار أي فواتير أو قوائم حساب لهذا العميل.
                </div>
              ) : (
                <div className="space-y-3">
                  {getCustomerMetrics(selectedCustomer.id).invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="border border-slate-100 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 font-mono">
                            {inv.invoiceNumber}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {inv.date}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          بند السجل: {inv.items.map((item) => item.details).join("، ")}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 justify-between font-mono">
                        <div className="text-right">
                          <span className="block text-[9px] text-slate-400 font-sans">القيمة الكلية</span>
                          <span className="font-bold text-slate-800 text-xs">
                            {inv.grandTotal.toLocaleString()} {settings.currency}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[9px] text-slate-400 font-sans">المتبقي المطلوب</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              inv.remainingAmount === 0
                                ? "bg-blue-50 text-blue-700"
                                : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {inv.remainingAmount.toLocaleString()} {settings.currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Content 3: Purchases/Items summary */}
          {customerTab === "purchases" && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase">جميع بنود ومواد الشراء التفصيلية للعميل</h3>
              {getCustomerMetrics(selectedCustomer.id).purchases.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  لا توجد أي مشتريات مسجلة للعميل.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                        <th className="p-3">التاريخ</th>
                        <th className="p-3">رقم الفاتورة</th>
                        <th className="p-3">تفاصيل المادة</th>
                        <th className="p-3 text-center">العدد</th>
                        <th className="p-3 text-left">سعر المفرد</th>
                        <th className="p-3 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {getCustomerMetrics(selectedCustomer.id).purchases.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                            {item.date}
                          </td>
                          <td className="p-3 font-mono font-semibold text-slate-700">
                            {item.invoiceNumber}
                          </td>
                          <td className="p-3 font-bold text-slate-800">
                            {item.details}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-700">
                            {item.quantity}
                          </td>
                          <td className="p-3 text-left font-mono font-semibold text-slate-600">
                            {item.unitPrice.toLocaleString()} {settings.currency}
                          </td>
                          <td className="p-3 text-left font-mono font-bold text-slate-900">
                            {item.total.toLocaleString()} {settings.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab Content 4: Repayments / Payments list */}
          {customerTab === "payments" && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase">سجل إيصالات التسديد المالي المستلمة</h3>
              {getCustomerMetrics(selectedCustomer.id).payments.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  لا توجد أي سندات تسديد أو دفعات مستلمة حتى الآن.
                </div>
              ) : (
                <div className="space-y-3">
                  {getCustomerMetrics(selectedCustomer.id).payments.map((p) => (
                    <div
                      key={p.id}
                      className="border border-slate-100 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-700 rounded shrink-0">
                          <ArrowDownLeft className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-800 font-mono">
                            قسيمة دفعة ID: {p.id.slice(-6)}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            تاريخ السند: {p.date} • طريقة الدفع: {p.method}
                          </p>
                          {p.notes && (
                            <p className="text-[11px] text-slate-500 mt-1 font-sans">
                              ملاحظة: {p.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-left font-mono shrink-0">
                        <p className="text-base font-extrabold text-blue-600">
                          +{p.amount.toLocaleString()} {settings.currency}
                        </p>
                        <span className="text-[9px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold font-sans uppercase">
                          مستلم ومعتمد
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* MODAL 1: ADD CUSTOMER */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                إضافة ملف عميل جديد بالنظام
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">اسم العميل بالكامل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد عبد الله الرويلي"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded text-xs focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">رقم الهاتف الفعال *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 0501234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded text-xs font-mono text-right focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">العنوان السكني / التجاري (اختياري)</label>
                <input
                  type="text"
                  placeholder="مثال: الرياض - حي الصحافة - شارع العليا"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded text-xs focus:outline-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  حفظ العميل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT CUSTOMER */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600" />
                تعديل بيانات العميل الحالي
              </h3>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingCustomer(null);
                }}
                className="p-1 rounded hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">اسم العميل بالكامل *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded text-xs focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">رقم الهاتف الفعال *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded text-xs font-mono text-right focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">العنوان السكني / التجاري (اختياري)</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded text-xs focus:outline-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingCustomer(null);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
