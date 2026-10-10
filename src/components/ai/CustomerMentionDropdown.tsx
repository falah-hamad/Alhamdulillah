import React, { useMemo } from "react";
import { User, Phone, DollarSign, AlertCircle } from "lucide-react";
import { Customer, Invoice, Payment } from "../../types";

interface CustomerMentionDropdownProps {
  query: string;
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  currency?: string;
  onSelectCustomer: (customer: Customer) => void;
  onClose: () => void;
}

export default function CustomerMentionDropdown({
  query,
  customers,
  invoices,
  payments,
  currency = "د.ع",
  onSelectCustomer,
  onClose,
}: CustomerMentionDropdownProps) {
  // Pre-calculate debt for active customers
  const debtorList = useMemo(() => {
    const activeCustomers = customers.filter((c) => !c.isDeleted);
    const activeInvoices = invoices.filter((i) => !i.isDeleted);
    const activePayments = payments.filter((p) => !p.isDeleted);

    return activeCustomers.map((c) => {
      const custInvoices = activeInvoices.filter((inv) => inv.customerId === c.id);
      const custPayments = activePayments.filter((p) => p.customerId === c.id);
      const totalInv = custInvoices.reduce((acc, inv) => acc + (Number(inv.grandTotal) || 0), 0);
      const paidInv = custInvoices.reduce((acc, inv) => acc + (Number(inv.paidAmount) || 0), 0);
      const sepPay = custPayments.reduce((acc, pay) => acc + (Number(pay.amount) || 0), 0);
      const rem = Math.max(0, totalInv - (paidInv + sepPay));

      return {
        customer: c,
        remainingDebt: rem,
        invoiceCount: custInvoices.length,
      };
    });
  }, [customers, invoices, payments]);

  // Filter based on mention query (after @)
  const filtered = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      // Prioritize customers with remaining debt
      return [...debtorList].sort((a, b) => b.remainingDebt - a.remainingDebt).slice(0, 10);
    }
    return debtorList
      .filter((item) => {
        const nameMatch = item.customer.name?.toLowerCase().includes(cleanQuery);
        const phoneMatch = item.customer.phone?.includes(cleanQuery);
        return nameMatch || phoneMatch;
      })
      .slice(0, 10);
  }, [debtorList, query]);

  return (
    <div className="absolute bottom-full mb-2 right-0 left-0 sm:left-auto sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-blue-600" />
          <span>اختر عميلاً للإشارة إليه في السؤال</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1"
        >
          إغلاق
        </button>
      </div>

      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
            لا يوجد عميل يطابق هذا الاسم
          </div>
        ) : (
          filtered.map(({ customer, remainingDebt, invoiceCount }) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => onSelectCustomer(customer)}
              className="w-full text-right p-2.5 rounded-xl hover:bg-blue-50/80 dark:hover:bg-slate-800 flex items-center justify-between transition-colors group cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                  {customer.name}
                </div>
                {customer.phone && (
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                    <Phone className="w-2.5 h-2.5" />
                    <span>{customer.phone}</span>
                  </div>
                )}
              </div>

              <div className="text-left shrink-0 pr-2">
                <div
                  className={`text-xs font-black ${
                    remainingDebt > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {remainingDebt > 0 ? `${remainingDebt.toLocaleString()} ${currency}` : "مسدد ✅"}
                </div>
                <div className="text-[10px] text-slate-400">
                  {invoiceCount} فواتير
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
