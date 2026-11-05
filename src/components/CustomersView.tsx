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
  const [filterRows, setFilterRows] = useState<Array<{ id: string; category: string; field: string; mode: "exact" | "range" }>>([]);

  // Modals for Customer Management
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Add/Edit Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const customerViewMode: "list" | "grid" | "large_icons" | "small_icons" = "list";

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
      <div className="relative w-full min-w-0 flex-1 sm:w-64">
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
  const filterCategories = [
    { value: "personal", label: "أولاً: المعلومات الشخصية وتاريخ التعامل", fields: [
      { value: "folderId", label: "حسب المجلد" }, { value: "address", label: "حسب عنوان السكن" },
      { value: "occupation", label: "حسب المهنة أو الوظيفة" }, { value: "salaryStatus", label: "هل لديه راتب؟" },
      { value: "salaryType", label: "حسب نوع الراتب" }, { value: "relationship", label: "حسب مدة التعامل" },
    ]},
    { value: "purchases", label: "ثانياً: المشتريات", fields: [
      { value: "purchaseDate", label: "حسب تاريخ الشراء" }, { value: "quantity", label: "حسب إجمالي عدد البضائع" },
      { value: "cost", label: "حسب تكلفة الشراء (رأس المال)" }, { value: "sales", label: "حسب إجمالي المشتريات" },
    ]},
    { value: "financial", label: "ثالثاً: الأرباح والتسديدات والديون", fields: [
      { value: "profit", label: "حسب إجمالي الربح" }, { value: "paid", label: "حسب إجمالي التسديد" },
      { value: "remaining", label: "حسب المبلغ المتبقي" }, { value: "balanceStatus", label: "حسب حالة الحساب" },
      { value: "overdueOnly", label: "عليه مستحقات متأخرة" }, { value: "activityDate", label: "حسب تاريخ آخر تعامل" },
    ]},
    { value: "staff", label: "رابعاً: الموظفون والعمليات", fields: [
      { value: "sellerName", label: "حسب اسم البائع" }, { value: "paymentRecipient", label: "حسب مستلم التسديد" },
    ]},
  ];
  const updateFilterRow = (id: string, patch: Partial<{ category: string; field: string; mode: "exact" | "range" }>) =>
    setFilterRows(old => old.map(row => row.id === id ? { ...row, ...patch } : row));
  const clearFilterField = (field: string) => {
    switch (field) {
      case "folderId": updateDraftFilter("folderId", "all"); break;
      case "address": updateDraftFilter("address", "all"); break;
      case "occupation": updateDraftFilter("occupation", "all"); break;
      case "salaryStatus": updateDraftFilter("salaryStatus", "all"); break;
      case "salaryType": updateDraftFilter("salaryType", "all"); break;
      case "relationship": updateDraftFilter("relationshipExact", ""); updateDraftFilter("relationshipMin", ""); updateDraftFilter("relationshipMax", ""); break;
      case "purchaseDate": updateDraftFilter("purchaseOn", ""); updateDraftFilter("purchaseFrom", ""); updateDraftFilter("purchaseTo", ""); break;
      case "quantity": updateDraftFilter("quantityExact", ""); updateDraftFilter("quantityMin", ""); updateDraftFilter("quantityMax", ""); break;
      case "cost": updateDraftFilter("costExact", ""); updateDraftFilter("costMin", ""); updateDraftFilter("costMax", ""); break;
      case "sales": updateDraftFilter("salesExact", ""); updateDraftFilter("salesMin", ""); updateDraftFilter("salesMax", ""); break;
      case "profit": updateDraftFilter("profitExact", ""); updateDraftFilter("profitMin", ""); updateDraftFilter("profitMax", ""); break;
      case "paid": updateDraftFilter("paidExact", ""); updateDraftFilter("paidMin", ""); updateDraftFilter("paidMax", ""); break;
      case "remaining": updateDraftFilter("remainingExact", ""); updateDraftFilter("remainingMin", ""); updateDraftFilter("remainingMax", ""); break;
      case "balanceStatus": updateDraftFilter("balanceStatus", "all"); break;
      case "overdueOnly": updateDraftFilter("overdueOnly", false); break;
      case "activityDate": updateDraftFilter("activityFrom", ""); updateDraftFilter("activityTo", ""); break;
      case "sellerName": updateDraftFilter("sellerName", "all"); break;
      case "paymentRecipient": updateDraftFilter("paymentRecipient", "all"); break;
    }
  };
  const filterNumberInput = (label: string, value: string, onChange: (value: string) => void, min = false) => (
    <label className="min-w-0 text-sm text-slate-700">{label}<input type="number" min={min ? "0" : undefined} step="any" value={value} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>
  );
  const numericFilterEditor = (_row: typeof filterRows[number], title: string, exact: string, min: string, max: string, setters: { exact: (value: string) => void; min: (value: string) => void; max: (value: string) => void }, currency = "") => (
    <div className="space-y-3">
      {filterNumberInput(`${title} يساوي ${currency}`, exact, setters.exact, true)}
      <div className="grid grid-cols-2 gap-2">
        {filterNumberInput(`من ${currency}`, min, setters.min, true)}
        {filterNumberInput(`إلى ${currency}`, max, setters.max, true)}
      </div>
    </div>
  );
  const renderFilterEditor = (row: typeof filterRows[number]) => {
    const currency = settings.currency;
    switch (row.field) {
      case "folderId": return <FilterSelect ariaLabel="اختر المجلد" value={draftFilters.folderId} placeholder="اختر المجلد" placeholderValue="all" onChange={value => updateDraftFilter("folderId", value)} options={[{ value: "all", label: "كل المجلدات" }, ...folders.map(folder => ({ value: folder.id, label: folder.name }))]} />;
      case "address": return <FilterSelect ariaLabel="اختر العنوان" value={draftFilters.address} placeholder="اختر العنوان" placeholderValue="all" onChange={value => updateDraftFilter("address", value)} options={[{ value: "all", label: "كل العناوين" }, ...addressOptions.map(value => ({ value, label: value }))]} />;
      case "occupation": return <FilterSelect ariaLabel="اختر المهنة" value={draftFilters.occupation} placeholder="اختر المهنة" placeholderValue="all" onChange={value => updateDraftFilter("occupation", value)} options={[{ value: "all", label: "كل المهن" }, ...occupationOptions.map(value => ({ value, label: value }))]} />;
      case "salaryStatus": return <FilterSelect ariaLabel="هل لديه راتب؟" value={draftFilters.salaryStatus} placeholder="الكل" onChange={value => updateDraftFilter("salaryStatus", value as CustomerFilterState["salaryStatus"])} options={[{ value: "all", label: "الكل" }, { value: "yes", label: "نعم" }, { value: "no", label: "لا" }]} />;
      case "salaryType": return <FilterSelect ariaLabel="اختر نوع الراتب" value={draftFilters.salaryType} placeholder="اختر نوع الراتب" placeholderValue="all" onChange={value => updateDraftFilter("salaryType", value)} options={[{ value: "all", label: "كل الأنواع" }, ...salaryTypeOptions.map(value => ({ value, label: value }))]} />;
      case "relationship": return <div className="space-y-3">
        <FilterSelect ariaLabel="وحدة مدة التعامل" value={draftFilters.relationshipUnit} placeholder="الوحدة" onChange={value => updateDraftFilter("relationshipUnit", value as CustomerFilterState["relationshipUnit"])} options={[{ value: "days", label: "أيام" }, { value: "months", label: "أشهر" }, { value: "years", label: "سنوات" }]} />
        {filterNumberInput("مدة التعامل تساوي", draftFilters.relationshipExact, value => updateDraftFilter("relationshipExact", value), true)}
        <div className="grid grid-cols-2 gap-2">{filterNumberInput("من", draftFilters.relationshipMin, value => updateDraftFilter("relationshipMin", value), true)}{filterNumberInput("إلى", draftFilters.relationshipMax, value => updateDraftFilter("relationshipMax", value), true)}</div>
        <p className="text-xs text-slate-500">تُحسب من أول عملية شراء مسجلة إلى اليوم.</p>
      </div>;
      case "purchaseDate": return <div className="space-y-2">
        <FilterSelect ariaLabel="طريقة تاريخ الشراء" value={row.mode} placeholder="طريقة التصفية" onChange={value => { updateFilterRow(row.id, { mode: value as "exact" | "range" }); updateDraftFilter("purchaseOn", ""); updateDraftFilter("purchaseFrom", ""); updateDraftFilter("purchaseTo", ""); }} options={[{ value: "exact", label: "في تاريخ محدد" }, { value: "range", label: "خلال فترة زمنية" }]} />
        {row.mode === "range"
          ? <div className="grid grid-cols-2 gap-2"><label className="text-sm text-slate-700">من تاريخ<input type="date" value={draftFilters.purchaseFrom} onChange={event => updateDraftFilter("purchaseFrom", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label><label className="text-sm text-slate-700">إلى تاريخ<input type="date" value={draftFilters.purchaseTo} onChange={event => updateDraftFilter("purchaseTo", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label></div>
          : <label className="text-sm text-slate-700">تاريخ الشراء<input type="date" value={draftFilters.purchaseOn} onChange={event => updateDraftFilter("purchaseOn", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label>}
      </div>;
      case "quantity": return numericFilterEditor(row,"عدد البضائع",draftFilters.quantityExact,draftFilters.quantityMin,draftFilters.quantityMax,{exact:value=>updateDraftFilter("quantityExact",value),min:value=>updateDraftFilter("quantityMin",value),max:value=>updateDraftFilter("quantityMax",value)});
      case "cost": return numericFilterEditor(row,"التكلفة",draftFilters.costExact,draftFilters.costMin,draftFilters.costMax,{exact:value=>updateDraftFilter("costExact",value),min:value=>updateDraftFilter("costMin",value),max:value=>updateDraftFilter("costMax",value)},currency);
      case "sales": return numericFilterEditor(row,"المشتريات",draftFilters.salesExact,draftFilters.salesMin,draftFilters.salesMax,{exact:value=>updateDraftFilter("salesExact",value),min:value=>updateDraftFilter("salesMin",value),max:value=>updateDraftFilter("salesMax",value)},currency);
      case "profit": return numericFilterEditor(row,"الربح",draftFilters.profitExact,draftFilters.profitMin,draftFilters.profitMax,{exact:value=>updateDraftFilter("profitExact",value),min:value=>updateDraftFilter("profitMin",value),max:value=>updateDraftFilter("profitMax",value)},currency);
      case "paid": return numericFilterEditor(row,"المسدد",draftFilters.paidExact,draftFilters.paidMin,draftFilters.paidMax,{exact:value=>updateDraftFilter("paidExact",value),min:value=>updateDraftFilter("paidMin",value),max:value=>updateDraftFilter("paidMax",value)},currency);
      case "remaining": return numericFilterEditor(row,"المتبقي",draftFilters.remainingExact,draftFilters.remainingMin,draftFilters.remainingMax,{exact:value=>updateDraftFilter("remainingExact",value),min:value=>updateDraftFilter("remainingMin",value),max:value=>updateDraftFilter("remainingMax",value)},currency);
      case "balanceStatus": return <FilterSelect ariaLabel="حالة الحساب" value={draftFilters.balanceStatus} placeholder="كل الحالات" onChange={value => updateDraftFilter("balanceStatus", value as CustomerFilterState["balanceStatus"])} options={[{ value: "all", label: "كل الحالات" }, { value: "owing", label: "عليه مبلغ" }, { value: "settled", label: "مسدد بالكامل" }]} />;
      case "overdueOnly": return <label className="flex items-center gap-2 rounded-lg bg-white p-3 text-sm"><input type="checkbox" checked={draftFilters.overdueOnly} onChange={event => updateDraftFilter("overdueOnly", event.target.checked)} className="h-4 w-4 accent-blue-600"/>عليه مستحقات متأخرة</label>;
      case "activityDate": return <div className="grid grid-cols-2 gap-2"><label className="text-sm text-slate-700">من تاريخ<input type="date" value={draftFilters.activityFrom} onChange={event => updateDraftFilter("activityFrom", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label><label className="text-sm text-slate-700">إلى تاريخ<input type="date" value={draftFilters.activityTo} onChange={event => updateDraftFilter("activityTo", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" /></label></div>;
      case "sellerName": return <FilterSelect ariaLabel="اختر البائع" value={draftFilters.sellerName} placeholder="اختر البائع" placeholderValue="all" onChange={value => updateDraftFilter("sellerName", value)} options={[{ value: "all", label: "كل البائعين" }, ...sellerOptions.map(value => ({ value, label: value }))]} />;
      case "paymentRecipient": return <FilterSelect ariaLabel="اختر مستلم التسديد" value={draftFilters.paymentRecipient} placeholder="اختر المستلم" placeholderValue="all" onChange={value => updateDraftFilter("paymentRecipient", value)} options={[{ value: "all", label: "كل المستلمين" }, ...recipientOptions.map(value => ({ value, label: value }))]} />;
      default: return null;
    }
  };
  const customerDataFilterControls = (
    <FilterPanel
      open={filtersOpen}
      title="تصفية العملاء"
      activeCount={activeFilterCount}
      onClose={() => { setDraftFilters(customerFilters); setFiltersOpen(false); }}
      onApply={() => { setCustomerFilters(draftFilters); setFiltersOpen(false); }}
      onClear={() => { const empty = emptyCustomerFilters(); setDraftFilters(empty); setCustomerFilters(empty); setFilterRows([]); setFiltersOpen(false); }}
      clearLabel="إعادة تعيين التصفية"
      applyLabel="تطبيق التصفية"
    >
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
        التصفية المالية والشرائية تعتمد على مصدر الإحصائيات المحدد: {statisticsSource === "all" ? "الكل — سجل الحساب العمودي والقائمة الحسابية معاً" : statisticsSource === "vertical" ? "سجل الحساب العمودي / كشوف الديون" : "القائمة الحسابية المستقلة"}.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
        <div><p className="text-sm font-bold text-slate-800">شروط التصفية</p><p className="text-xs text-slate-500">{filterRows.filter(row => row.field).length} شروط مضافة</p></div>
        <button type="button" onClick={() => setFilterRows(old => [...old, { id: `${Date.now()}-${Math.random()}`, category: "", field: "", mode: "exact" }])} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white"><PlusCircle size={16}/> إضافة تصفية</button>
      </div>
      {filterRows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">اضغط «إضافة تصفية»، ثم اختر العنوان الرئيسي ونوع التصفية لتظهر حقوله.</p>}
      <div className="space-y-3">
        {filterRows.map((row,index) => {
          const category = filterCategories.find(option => option.value === row.category);
          return <section key={row.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span>
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">العنوان الرئيسي
                  <FilterSelect ariaLabel="العنوان الرئيسي للتصفية" value={row.category} placeholder="اختر القسم الرئيسي" onChange={value => { clearFilterField(row.field); updateFilterRow(row.id,{category:value,field:""}) }} options={filterCategories.map(option=>({value:option.value,label:option.label}))}/>
                </label>
                <label className="text-sm font-semibold text-slate-700">نوع التصفية
                  <FilterSelect ariaLabel="نوع التصفية" value={row.field} placeholder="اختر نوع التصفية" disabled={!category} onChange={value=>{ if (filterRows.some(item=>item.id!==row.id&&item.field===value)) { alert("هذا الشرط مضاف بالفعل."); return; } clearFilterField(row.field); updateFilterRow(row.id,{field:value,mode:"exact"}) }} options={category?.fields||[]}/>
                </label>
              </div>
              <button type="button" aria-label={`حذف شرط التصفية ${index+1}`} onClick={()=>{ clearFilterField(row.field); setFilterRows(old=>old.filter(item=>item.id!==row.id)); }} className="mt-1 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><X size={16}/></button>
            </div>
            {row.field && <div className="mr-9 space-y-2 border-t border-slate-100 pt-3"><p className="text-sm font-bold text-slate-700">{category?.fields.find(field=>field.value===row.field)?.label}</p>{renderFilterEditor(row)}</div>}
          </section>;
        })}
      </div>
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
