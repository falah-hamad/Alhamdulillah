import React, { useState } from "react";
import {
  Users,
  Search,
  PlusCircle,
  Phone,
  MapPin,
  X,
  Edit,
  ChevronLeft,
  User
} from "lucide-react";
import { Customer, CustomerFolder, Invoice, Payment, SystemSettings } from "../types";
import { FilterPanel, FilterSelect } from "./FilterPanel";
import { printElement } from "../utils/printUtils";
import CustomerDataTable from "./CustomerDataTable";

interface CustomersViewProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  folders?: CustomerFolder[];
  settings: SystemSettings;
  addCustomer: (customer: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (customer: Customer) => void;
  deleteCustomer: (id: string) => void;
  onOpenLedger: (customerId: string) => void;
}
interface CustomerFilterState {
  folderId: string;
  address: string;
  occupation: string;
  salaryStatus: "all" | "yes" | "no";
  salaryType: string;
  balanceStatus: "all" | "owing" | "settled";
  minBalance: string;
  maxBalance: string;
  overdueOnly: boolean;
  activityFrom: string;
  activityTo: string;
  relationshipExact: string;
  relationshipMin: string;
  relationshipMax: string;
  relationshipUnit: "days" | "months" | "years";
  purchaseOn: string;
  purchaseFrom: string;
  purchaseTo: string;
  quantityExact: string;
  quantityMin: string;
  quantityMax: string;
  costExact: string;
  costMin: string;
  costMax: string;
  salesExact: string;
  salesMin: string;
  salesMax: string;
  profitExact: string;
  profitMin: string;
  profitMax: string;
  paidExact: string;
  paidMin: string;
  paidMax: string;
  remainingExact: string;
  remainingMin: string;
  remainingMax: string;
  sellerName: string;
  paymentRecipient: string;
}

const emptyCustomerFilters = (): CustomerFilterState => ({
  folderId: "all", address: "all", occupation: "all", salaryStatus: "all", salaryType: "all",
  balanceStatus: "all", minBalance: "", maxBalance: "", overdueOnly: false, activityFrom: "", activityTo: "",
  relationshipExact: "", relationshipMin: "", relationshipMax: "", relationshipUnit: "days",
  purchaseOn: "", purchaseFrom: "", purchaseTo: "", quantityExact: "", quantityMin: "", quantityMax: "",
  costExact: "", costMin: "", costMax: "", salesExact: "", salesMin: "", salesMax: "",
  profitExact: "", profitMin: "", profitMax: "", paidExact: "", paidMin: "", paidMax: "",
  remainingExact: "", remainingMin: "", remainingMax: "", sellerName: "all", paymentRecipient: "all",
});


export default function CustomersView({
  customers,
  invoices,
  payments,
  folders = [],
  settings,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  onOpenLedger,
}: CustomersViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCustomerData, setShowCustomerData] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customerFilters, setCustomerFilters] = useState<CustomerFilterState>(emptyCustomerFilters);
  const [draftFilters, setDraftFilters] = useState<CustomerFilterState>(emptyCustomerFilters);

  // Modals for Customer Management
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Add/Edit Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const customerViewMode = "list";

  // Calculations for a customer
  const getCustomerMetrics = (custId: string) => {
    const custInvoices = invoices.filter((inv) => inv.customerId === custId && !inv.isDeleted);
    const custPayments = payments.filter((p) => p.customerId === custId && !p.isDeleted);

    const customerRecord = customers.find((c) => c.id === custId);
    const sheetRows = (customerRecord?.accountingSheetRows || []).filter(row => !row.isSeparator);
    const sheetPayments = (customerRecord?.accountingSheetPayments || []).filter(payment => !(payment as typeof payment & { isDeleted?: boolean }).isDeleted);
    const sheetDebt = sheetRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    const sheetPaid = sheetPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const totalDebts = custInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0) + sheetDebt;
    const totalPaid = custPayments.reduce((acc, p) => acc + p.amount, 0) + sheetPaid;
    const totalRemaining = custInvoices.reduce((acc, inv) => acc + inv.remainingAmount, 0) + Math.max(0, sheetDebt - sheetPaid);

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
    }
  };

  // Filter customers using the saved customer, invoice, accounting-sheet, and payment records.
  const distinctOptions = (values: (string | undefined)[]) => [...new Set(values.map(value => (value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ar"));
  const addressOptions = distinctOptions(customers.map(customer => customer.address));
  const occupationOptions = distinctOptions(customers.map(customer => customer.profile?.occupation || customer.profile?.profession));
  const salaryTypeOptions = distinctOptions(customers.map(customer => customer.salaryType));
  const sellerOptions = distinctOptions(invoices.filter(invoice => !invoice.isDeleted).flatMap(invoice => [
    invoice.employeeName,
    ...invoice.items.map(item => (item as typeof item & { sellerName?: string }).sellerName),
  ]).concat(customers.flatMap(customer => (customer.accountingSheetRows || []).map(row => (row as typeof row & { sellerName?: string }).sellerName))));
  const recipientOptions = distinctOptions([
    ...payments.filter(payment => !payment.isDeleted).flatMap(payment => {
      const extra = payment as Payment & { recipient?: string; recipientName?: string; receivedBy?: string; sellerName?: string };
      return [extra.recipient, extra.recipientName, extra.receivedBy, extra.sellerName];
    }),
    ...customers.flatMap(customer => [
      ...(customer.accountingSheetPayments || []).flatMap(payment => {
        const extra = payment as typeof payment & { recipient?: string; recipientName?: string; receivedBy?: string; sellerName?: string };
        return [extra.recipient, extra.recipientName, extra.receivedBy, extra.sellerName];
      }),
    ]),
    ...invoices.filter(invoice => !invoice.isDeleted).flatMap(invoice => invoice.items
      .filter(item => item.isSeparator && Number(item.paidAmount) > 0)
      .map(item => (item as typeof item & { sellerName?: string }).sellerName)),
  ]);
  const activeFilterCount = Object.entries(customerFilters).filter(([key, value]) => {
    if (key === "relationshipUnit") return Boolean(customerFilters.relationshipExact || customerFilters.relationshipMin || customerFilters.relationshipMax);
    return typeof value === "boolean" ? value : value !== "" && value !== "all";
  }).length;
  const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
  const dateKey = (value?: string) => {
    if (!value) return "";
    const raw = value.trim();
    const dateOnly = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
    if (dateOnly) return dateOnly[1] + "-" + dateOnly[2].padStart(2, "0") + "-" + dateOnly[3].padStart(2, "0");
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" }) : "";
  };
  const parsedDate = (value?: string) => {
    const key = dateKey(value);
    if (!key) return null;
    const [year, month, day] = key.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };
  const durationValue = (firstDate: Date, unit: CustomerFilterState["relationshipUnit"]) => {
    const today = parsedDate(todayDate)!;
    if (unit === "days") return Math.max(0, Math.floor((today.getTime() - firstDate.getTime()) / 86400000));
    let months = (today.getUTCFullYear() - firstDate.getUTCFullYear()) * 12 + today.getUTCMonth() - firstDate.getUTCMonth();
    if (today.getUTCDate() < firstDate.getUTCDate()) months -= 1;
    return unit === "months" ? Math.max(0, months) : Math.max(0, Math.floor(months / 12));
  };
  const parseFilterNumber = (input: string) => {
    const normalized = input.trim()
      .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
      .replace(/[٬،,]/g, "")
      .replace(/٫/g, ".")
      .replace(/\s/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const inNumberRange = (value: number | null, exact: string, min: string, max: string) => {
    if (!exact && !min && !max) return true;
    if (value === null || !Number.isFinite(value)) return false;
    const exactValue = exact ? parseFilterNumber(exact) : null;
    const minValue = min ? parseFilterNumber(min) : null;
    const maxValue = max ? parseFilterNumber(max) : null;
    if (exact && (exactValue === null || Math.abs(value - exactValue) > 0.01)) return false;
    if (min && (minValue === null || value < minValue)) return false;
    if (max && (maxValue === null || value > maxValue)) return false;
    return true;
  };
  const savedStatisticsSource = window.localStorage.getItem("customer-statistics-account-source");
  const statisticsSource = savedStatisticsSource === "vertical" || savedStatisticsSource === "accounting" ? savedStatisticsSource : "all";
  const filteredCustomers = customers.filter(customer => {
    const q = searchQuery.trim().toLocaleLowerCase();
    const matchesSearch = !q || [customer.name, customer.phone, customer.address || ""].some(value => value.toLocaleLowerCase().includes(q));
    const filters = customerFilters;
    if (!matchesSearch || (filters.folderId !== "all" && (customer.folderId || "") !== filters.folderId)) return false;
    if (filters.address !== "all" && (customer.address || "").trim() !== filters.address) return false;
    const occupation = (customer.profile?.occupation || customer.profile?.profession || "").trim();
    if (filters.occupation !== "all" && occupation !== filters.occupation) return false;
    if (filters.salaryStatus === "yes" && customer.hasSalary !== true) return false;
    if (filters.salaryStatus === "no" && customer.hasSalary !== false) return false;
    if (filters.salaryType !== "all" && (customer.salaryType || "").trim() !== filters.salaryType) return false;

    const metrics = getCustomerMetrics(customer.id);
    const includeVertical = statisticsSource !== "accounting";
    const includeAccounting = statisticsSource !== "vertical";
    const verticalRemaining = metrics.invoices.reduce((sum, invoice) => sum + (Number(invoice.remainingAmount) || 0), 0);
    const accountingRowsForBalance = (customer.accountingSheetRows || []).filter(row =>
      !row.isSeparator && (String(row.details || "").trim() || Number(row.total) !== 0)
    );
    const accountingSalesForBalance = accountingRowsForBalance.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    const accountingPaidForBalance = (customer.accountingSheetPayments || [])
      .filter(payment => !(payment as typeof payment & { isDeleted?: boolean }).isDeleted)
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const accountingRemaining = Math.max(0, accountingSalesForBalance - accountingPaidForBalance);
    const balance = includeVertical && includeAccounting
      ? verticalRemaining + accountingRemaining
      : includeVertical ? verticalRemaining : accountingRemaining;
    if (filters.balanceStatus === "owing" && balance <= 0) return false;
    if (filters.balanceStatus === "settled" && balance > 0) return false;
    if (!inNumberRange(balance, "", filters.minBalance, filters.maxBalance)) return false;
    if (filters.overdueOnly && (!includeVertical || !metrics.invoices.some(invoice => !invoice.isDeleted && Number(invoice.remainingAmount) > 0 && invoice.dueDate && invoice.dueDate < todayDate))) return false;
    const activityDates = [
      ...(includeVertical ? metrics.ledger.map(entry => entry.date) : []),
      ...(includeAccounting ? [
        ...(customer.accountingSheetRows || []).map(row => row.createdAt || customer.accountingSheetDate || ""),
        ...(customer.accountingSheetPayments || []).filter(payment => !(payment as typeof payment & { isDeleted?: boolean }).isDeleted).map(payment => payment.date),
      ] : []),
    ].map(value => dateKey(value)).filter(Boolean).sort();
    const latestActivity = activityDates[activityDates.length - 1] || "";
    if (filters.activityFrom && (!latestActivity || latestActivity < filters.activityFrom)) return false;
    if (filters.activityTo && (!latestActivity || latestActivity > filters.activityTo)) return false;

    const customerInvoices = includeVertical ? invoices.filter(invoice => invoice.customerId === customer.id && !invoice.isDeleted) : [];
    const invoiceItems = customerInvoices.flatMap(invoice => invoice.items.filter(item =>
      !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow && (String(item.details || "").trim() || Number(item.total) !== 0)
    ));
    const accountingRows = includeAccounting ? (customer.accountingSheetRows || []).filter(row =>
      !row.isSeparator && (String(row.details || "").trim() || Number(row.total) !== 0)
    ) : [];
    const purchaseDates = [
      ...customerInvoices.map(invoice => invoice.date || invoice.createdAt),
      ...accountingRows.map(row => row.createdAt || customer.accountingSheetDate || ""),
    ].map(value => dateKey(value)).filter(Boolean).sort();
    if (filters.purchaseOn && !purchaseDates.includes(filters.purchaseOn)) return false;
    if (filters.purchaseFrom && !purchaseDates.some(value => value >= filters.purchaseFrom)) return false;
    if (filters.purchaseTo && !purchaseDates.some(value => value <= filters.purchaseTo)) return false;
    if (filters.purchaseFrom && filters.purchaseTo && !purchaseDates.some(value => value >= filters.purchaseFrom && value <= filters.purchaseTo)) return false;

    const purchaseRows = [
      ...invoiceItems.map(item => ({ quantity: Number(item.quantity) || 0, total: Number(item.total) || 0, unitCost: item.unitCost })),
      ...accountingRows.map(row => ({ quantity: Number(row.quantity) || 0, total: Number(row.total) || 0, unitCost: row.unitCost })),
    ];
    const totalQuantity = purchaseRows.reduce((sum, row) => sum + row.quantity, 0);
    if (!inNumberRange(totalQuantity, filters.quantityExact, filters.quantityMin, filters.quantityMax)) return false;
    const purchaseCost = purchaseRows.length && purchaseRows.every(row => typeof row.unitCost === "number" && Number.isFinite(row.unitCost) && row.unitCost >= 0)
      ? purchaseRows.reduce((sum, row) => sum + row.quantity * (row.unitCost as number), 0)
      : null;
    if (!inNumberRange(purchaseCost, filters.costExact, filters.costMin, filters.costMax)) return false;
    const salesTotal = customerInvoices.reduce((sum, invoice) => sum + (Number(invoice.grandTotal) || 0), 0)
      + accountingRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    if (!inNumberRange(salesTotal, filters.salesExact, filters.salesMin, filters.salesMax)) return false;
    const invoiceRowsTotal = customerInvoices.reduce((sum, invoice) => sum + invoice.items
      .filter(item => !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow)
      .reduce((itemSum, item) => itemSum + (Number(item.total) || 0), 0), 0);
    const accountingRowsTotal = accountingRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    const costsComplete = purchaseRows.length > 0 && purchaseRows.every(row => typeof row.unitCost === "number" && Number.isFinite(row.unitCost) && row.unitCost >= 0);
    const salesConsistent = Math.abs(invoiceRowsTotal - customerInvoices.reduce((sum, invoice) => sum + (Number(invoice.grandTotal) || 0), 0)) < 0.01
      && Math.abs(accountingRowsTotal - accountingRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0)) < 0.01;
    const profit = costsComplete && salesConsistent ? salesTotal - (purchaseCost || 0) : null;
    if (!inNumberRange(profit, filters.profitExact, filters.profitMin, filters.profitMax)) return false;

    // Invoice paidAmount already includes its recorded receipts; do not add Payment rows again.
    const paidTotal = customerInvoices.reduce((sum, invoice) => sum + (Number(invoice.paidAmount) || 0), 0)
      + (includeAccounting ? (customer.accountingSheetPayments || []).filter(payment => !(payment as typeof payment & { isDeleted?: boolean }).isDeleted)
        .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0) : 0);
    if (!inNumberRange(paidTotal, filters.paidExact, filters.paidMin, filters.paidMax)) return false;
    if (!inNumberRange(balance, filters.remainingExact, filters.remainingMin, filters.remainingMax)) return false;

    const sellers = distinctOptions([
      ...customerInvoices.flatMap(invoice => [
        invoice.employeeName,
        ...invoice.items.map(item => (item as typeof item & { sellerName?: string }).sellerName),
      ]),
      ...accountingRows.map(row => (row as typeof row & { sellerName?: string }).sellerName),
    ]);
    if (filters.sellerName !== "all" && !sellers.includes(filters.sellerName)) return false;
    const recipients = distinctOptions([
      ...customerInvoices.flatMap(invoice => invoice.items
        .filter(item => item.isSeparator && Number(item.paidAmount) > 0)
        .map(item => {
          const extra = item as typeof item & { recipient?: string; recipientName?: string; receivedBy?: string; sellerName?: string };
          return extra.recipient || extra.recipientName || extra.receivedBy || extra.sellerName;
        })),
      ...(includeAccounting ? (customer.accountingSheetPayments || []).filter(payment => !(payment as typeof payment & { isDeleted?: boolean }).isDeleted)
        .flatMap(payment => {
          const extra = payment as typeof payment & { recipient?: string; recipientName?: string; receivedBy?: string; sellerName?: string };
          return [extra.recipient, extra.recipientName, extra.receivedBy, extra.sellerName];
        }) : []),
      ...(includeVertical ? payments.filter(payment => payment.customerId === customer.id && !payment.isDeleted) : []).flatMap(payment => {
        const extra = payment as Payment & { recipient?: string; recipientName?: string; receivedBy?: string; sellerName?: string };
        return [extra.recipient, extra.recipientName, extra.receivedBy, extra.sellerName];
      }),
    ]);
    if (filters.paymentRecipient !== "all" && !recipients.includes(filters.paymentRecipient)) return false;

    const firstPurchase = purchaseDates.length ? parsedDate(purchaseDates[0]) : null;
    const duration = firstPurchase ? durationValue(firstPurchase, filters.relationshipUnit) : null;
    if (!inNumberRange(duration, filters.relationshipExact, filters.relationshipMin, filters.relationshipMax)) return false;
    return true;
  });

  const updateDraftFilter = <K extends keyof CustomerFilterState,>(key: K, value: CustomerFilterState[K]) => {
    setDraftFilters(previous => ({ ...previous, [key]: value }));
  };

  const customerSearchControl = (
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
  );
  const customerDataFilterControls = (
      <FilterPanel
      open={filtersOpen}
      title="تصفية العملاء"
      activeCount={activeFilterCount}
      onClose={() => { setDraftFilters(customerFilters); setFiltersOpen(false); }}
      onApply={() => { setCustomerFilters(draftFilters); setFiltersOpen(false); }}
      onClear={() => { const empty = emptyCustomerFilters(); setDraftFilters(empty); setCustomerFilters(empty); setFiltersOpen(false); }}
      clearLabel="إعادة تعيين التصفية"
      applyLabel="تطبيق التصفية"
                >
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
        التصفية المالية والشرائية تعتمد على مصدر الإحصائيات المحدد: {statisticsSource === "all" ? "الكل — سجل الحساب العمودي والقائمة الحسابية معاً" : statisticsSource === "vertical" ? "سجل الحساب العمودي / كشوف الديون" : "القائمة الحسابية المستقلة"}.
      </p>
      <section className="space-y-3 rounded-xl border border-slate-200 p-3">
        <h4 className="font-bold text-blue-900">أولاً: التصفية حسب المعلومات الشخصية وتاريخ التعامل</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><h5 className="mb-1 text-sm font-semibold text-slate-700">1. حسب المجلد</h5><FilterSelect ariaLabel="1. حسب المجلد" value={draftFilters.folderId} placeholder="اختر المجلد" placeholderValue="all" onChange={value => updateDraftFilter("folderId", value)} options={[{ value: "all", label: "كل المجلدات" }, ...folders.map(folder => ({ value: folder.id, label: folder.name }))]} /></div>
          <div><h5 className="mb-1 text-sm font-semibold text-slate-700">2. حسب عنوان السكن</h5><FilterSelect ariaLabel="2. حسب عنوان السكن" value={draftFilters.address} placeholder="اختر العنوان" placeholderValue="all" onChange={value => updateDraftFilter("address", value)} options={[{ value: "all", label: "كل العناوين" }, ...addressOptions.map(option => ({ value: option, label: option }))]} /></div>
          <div><h5 className="mb-1 text-sm font-semibold text-slate-700">3. حسب المهنة أو الوظيفة</h5><FilterSelect ariaLabel="3. حسب المهنة أو الوظيفة" value={draftFilters.occupation} placeholder="اختر المهنة" placeholderValue="all" onChange={value => updateDraftFilter("occupation", value)} options={[{ value: "all", label: "كل المهن" }, ...occupationOptions.map(option => ({ value: option, label: option }))]} /></div>
          <div><h5 className="mb-1 text-sm font-semibold text-slate-700">4. هل لديه راتب؟</h5><FilterSelect ariaLabel="4. هل لديه راتب؟" value={draftFilters.salaryStatus} placeholder="الكل" onChange={value => updateDraftFilter("salaryStatus", value as CustomerFilterState["salaryStatus"])} options={[{ value: "all", label: "الكل" }, { value: "yes", label: "نعم" }, { value: "no", label: "لا" }]} /></div>
          <div><h5 className="mb-1 text-sm font-semibold text-slate-700">5. حسب نوع الراتب</h5><FilterSelect ariaLabel="5. حسب نوع الراتب" value={draftFilters.salaryType} placeholder="اختر نوع الراتب" placeholderValue="all" onChange={value => updateDraftFilter("salaryType", value)} options={[{ value: "all", label: "كل الأنواع" }, ...salaryTypeOptions.map(option => ({ value: option, label: option }))]} /></div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-slate-700">6. حسب مدة التعامل مع العميل</h5>
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
            <label className="text-sm text-slate-700">مدة التعامل تساوي<input type="number" value={draftFilters.relationshipExact} onChange={e => updateDraftFilter("relationshipExact", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            <label className="text-sm text-slate-700">الوحدة<FilterSelect ariaLabel="وحدة مدة التعامل" value={draftFilters.relationshipUnit} placeholder="الوحدة" onChange={value => updateDraftFilter("relationshipUnit", value as CustomerFilterState["relationshipUnit"])} options={[{ value: "days", label: "أيام" }, { value: "months", label: "أشهر" }, { value: "years", label: "سنوات" }]} /></label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm text-slate-700">من<input type="number" value={draftFilters.relationshipMin} onChange={e => updateDraftFilter("relationshipMin", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            <label className="text-sm text-slate-700">إلى<input type="number" value={draftFilters.relationshipMax} onChange={e => updateDraftFilter("relationshipMax", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
          </div>
          <p className="mt-2 text-xs text-slate-500">تُحسب من تاريخ أول عملية شراء مسجلة إلى اليوم.</p>
        </div>
      </section>
      
      <section className="space-y-3 rounded-xl border border-slate-200 p-3">
        <h4 className="font-bold text-blue-900">ثانياً: التصفية حسب المشتريات</h4>
        <div className="rounded-lg bg-slate-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-slate-700">7. حسب تاريخ الشراء</h5>
          <div>
            <label className="text-sm text-slate-700">اشترى في تاريخ<input type="date" value={draftFilters.purchaseOn} onChange={e => updateDraftFilter("purchaseOn", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-700">من تاريخ<input type="date" value={draftFilters.purchaseFrom} onChange={e => updateDraftFilter("purchaseFrom", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
              <label className="text-sm text-slate-700">إلى تاريخ<input type="date" value={draftFilters.purchaseTo} onChange={e => updateDraftFilter("purchaseTo", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-slate-700">8. حسب إجمالي عدد البضائع المشتراة</h5>
          <div>
            <label className="text-sm text-slate-700">عدد البضائع يساوي<input type="number" min="0" step="any" value={draftFilters.quantityExact} onChange={e => updateDraftFilter("quantityExact", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-700">من<input type="number" min="0" step="any" value={draftFilters.quantityMin} onChange={e => updateDraftFilter("quantityMin", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
              <label className="text-sm text-slate-700">إلى<input type="number" min="0" step="any" value={draftFilters.quantityMax} onChange={e => updateDraftFilter("quantityMax", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">يُحسب العدد من مجموع كميات البنود الفعلية، دون صفوف التسديد والفواصل.</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-slate-700">9. حسب إجمالي تكلفة شراء البضائع (رأس المال)</h5>
          <div>
            <label className="text-sm text-slate-700">التكلفة تساوي ({settings.currency})<input type="number" min="0" value={draftFilters.costExact} onChange={e => updateDraftFilter("costExact", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-700">التكلفة من ({settings.currency})<input type="number" min="0" value={draftFilters.costMin} onChange={e => updateDraftFilter("costMin", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
              <label className="text-sm text-slate-700">إلى ({settings.currency})<input type="number" min="0" value={draftFilters.costMax} onChange={e => updateDraftFilter("costMax", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-slate-700">10. حسب إجمالي قيمة مشتريات العميل</h5>
          <div>
            <label className="text-sm text-slate-700">الإجمالي يساوي ({settings.currency})<input type="number" min="0" value={draftFilters.salesExact} onChange={e => updateDraftFilter("salesExact", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-700">الإجمالي من ({settings.currency})<input type="number" min="0" value={draftFilters.salesMin} onChange={e => updateDraftFilter("salesMin", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
              <label className="text-sm text-slate-700">إلى ({settings.currency})<input type="number" min="0" value={draftFilters.salesMax} onChange={e => updateDraftFilter("salesMax", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            </div>
          </div>
        </div>
      </section>
      
      <section className="space-y-3 rounded-xl border border-slate-200 p-3">
        <h4 className="font-bold text-blue-900">ثالثاً: التصفية حسب الأرباح والتسديدات والديون</h4>
        <div className="rounded-lg bg-slate-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-slate-700">11. حسب إجمالي الربح من العميل</h5>
          <div>
            <label className="text-sm text-slate-700">الربح يساوي ({settings.currency})<input type="number" value={draftFilters.profitExact} onChange={e => updateDraftFilter("profitExact", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-700">الربح من ({settings.currency})<input type="number" value={draftFilters.profitMin} onChange={e => updateDraftFilter("profitMin", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
              <label className="text-sm text-slate-700">إلى ({settings.currency})<input type="number" value={draftFilters.profitMax} onChange={e => updateDraftFilter("profitMax", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">لا يدخل في نتيجة الربح من كانت كلفة شراء أي بند لديه غير مسجلة.</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-slate-700">12. حسب إجمالي المبالغ المسددة من العميل</h5>
          <div>
            <label className="text-sm text-slate-700">المسدد يساوي ({settings.currency})<input type="number" min="0" value={draftFilters.paidExact} onChange={e => updateDraftFilter("paidExact", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-700">المسدد من ({settings.currency})<input type="number" min="0" value={draftFilters.paidMin} onChange={e => updateDraftFilter("paidMin", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
              <label className="text-sm text-slate-700">إلى ({settings.currency})<input type="number" min="0" value={draftFilters.paidMax} onChange={e => updateDraftFilter("paidMax", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-slate-700">13. حسب إجمالي المبلغ المتبقي على العميل</h5>
          <div>
            <label className="text-sm text-slate-700">المتبقي يساوي ({settings.currency})<input type="number" min="0" value={draftFilters.remainingExact} onChange={e => updateDraftFilter("remainingExact", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-700">المتبقي من ({settings.currency})<input type="number" min="0" value={draftFilters.remainingMin} onChange={e => updateDraftFilter("remainingMin", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
              <label className="text-sm text-slate-700">إلى ({settings.currency})<input type="number" min="0" value={draftFilters.remainingMax} onChange={e => updateDraftFilter("remainingMax", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
            </div>
          </div>
        </div>
      </section>
      
      <section className="space-y-3 rounded-xl border border-slate-200 p-3">
        <h4 className="font-bold text-blue-900">رابعاً: التصفية حسب الموظفين والعمليات</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><h5 className="mb-1 text-sm font-semibold text-slate-700">14. حسب اسم البائع</h5><select aria-label="14. حسب اسم البائع" value={draftFilters.sellerName} onChange={e => updateDraftFilter("sellerName", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2"><option value="all">اختر البائع — كل البائعين</option>{sellerOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></div>
          <div><h5 className="mb-1 text-sm font-semibold text-slate-700">15. حسب اسم مستلم التسديد</h5><select aria-label="15. حسب اسم مستلم التسديد" value={draftFilters.paymentRecipient} onChange={e => updateDraftFilter("paymentRecipient", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2"><option value="all">اختر المستلم — كل المستلمين</option>{recipientOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></div>
        </div>
      </section>
      
      <section className="space-y-3 rounded-xl border border-dashed border-slate-300 p-3">
        <h4 className="font-semibold text-slate-700">خيارات تصفية إضافية</h4>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={draftFilters.overdueOnly} onChange={e => updateDraftFilter("overdueOnly", e.target.checked)} className="h-4 w-4 accent-blue-600" />عليه مستحقات متأخرة</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-sm text-slate-700">حالة الحساب<FilterSelect ariaLabel="حالة الحساب" value={draftFilters.balanceStatus} placeholder="كل الحالات" onChange={value => updateDraftFilter("balanceStatus", value as CustomerFilterState["balanceStatus"])} options={[{ value: "all", label: "كل الحالات" }, { value: "owing", label: "عليه مبلغ" }, { value: "settled", label: "مسدد بالكامل" }]} /></label>
          <label className="text-sm text-slate-700">آخر تعامل من<input type="date" value={draftFilters.activityFrom} onChange={e => updateDraftFilter("activityFrom", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
          <label className="text-sm text-slate-700">إلى تاريخ آخر تعامل<input type="date" value={draftFilters.activityTo} onChange={e => updateDraftFilter("activityTo", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
          <label className="text-sm text-slate-700">أقل متبقي<input type="number" min="0" value={draftFilters.minBalance} onChange={e => updateDraftFilter("minBalance", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
          <label className="text-sm text-slate-700">أعلى متبقي<input type="number" min="0" value={draftFilters.maxBalance} onChange={e => updateDraftFilter("maxBalance", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
        </div>
      </section>
                </FilterPanel>
  );

  if (showCustomerData) return <CustomerDataTable customers={filteredCustomers} invoices={invoices} payments={payments} folders={folders} onBack={() => setShowCustomerData(false)} filterControls={customerDataFilterControls} searchControl={customerSearchControl} onOpenFilters={() => { setDraftFilters(customerFilters); setFiltersOpen(true); }} activeFilterCount={activeFilterCount} totalCustomerCount={customers.filter(customer => !customer.isDeleted).length} />

  return (
    <div className="customers-view space-y-6 min-w-0">
      {/* Search & Actions Top Header */}
      {(
        <div className="space-y-4">
          <div className="customers-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
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
              className="customers-add-button flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              إضافة عميل جديد
            </button>
          </div>

          <button type="button" onClick={() => setShowCustomerData(true)} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">بيانات العملاء</button>

          {/* Search and filtering controls are available in Customer Data. */}
                    {/* Customers Table/Grid */}
          {filteredCustomers.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 py-12 text-center text-slate-400 text-xs shadow-sm">
              لم يتم العثور على أي عملاء مسجلين.
            </div>
          ) : (
            <>
              {/* 1. GRID VIEW — عرض شبكي، المجلدات تظهر كمربعات/بطاقات */}
              {customerViewMode === "grid" && (
                <div className="customers-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCustomers.map((c) => {
                    const metrics = getCustomerMetrics(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => onOpenLedger(c.id)}
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
                          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-50/80 p-2 rounded-xl text-center font-mono border border-slate-100 min-w-0">
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
                              onClick={(event) => { event.stopPropagation(); onOpenLedger(c.id); }}
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
                <div className="customers-list-panel bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="customers-list-table w-full text-right text-xs">
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
                              onClick={() => onOpenLedger(c.id)}
                              className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                            >
                              {/* الاسم فقط مع أيقونة الزبون / الشخص */}
                              <td data-label="الاسم" className="p-3.5 pr-5">
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
                              <td data-label="الموقع" className="p-3.5">
                                <div className="flex items-center gap-1.5 text-slate-700">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="font-medium text-xs">
                                    {c.address && c.address.trim() ? c.address : "غير محدد"}
                                  </span>
                                </div>
                              </td>

                              {/* فتح الدفتر فقط */}
                              <td data-label="فتح الدفتر" className="p-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenLedger(c.id);
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
                        onClick={() => onOpenLedger(c.id)}
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
                        onClick={() => onOpenLedger(c.id)}
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
