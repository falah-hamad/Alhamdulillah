import React from "react";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  FileText,
  Package,
  Award,
  AlertCircle
} from "lucide-react";
import { Customer, Product, Invoice, Payment, SystemSettings } from "../types";

interface StatsViewProps {
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  settings: SystemSettings;
}

export default function StatsView({
  customers,
  products,
  invoices,
  payments,
  settings,
}: StatsViewProps) {
  // Calculations
  const totalSales = invoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
  const totalPaid = payments.reduce((acc, pay) => acc + pay.amount, 0);
  const totalRemaining = invoices.reduce((acc, inv) => acc + inv.remainingAmount, 0);
  const totalCustomers = customers.length;
  const totalInvoicesCount = invoices.length;
  const potentialProfit = products.reduce(
    (acc, p) => acc + (p.salePrice - p.purchasePrice) * p.quantity,
    0
  );

  // 1. Calculate Top Debtors (Most indebted customers)
  const customerDebts = customers.map((c) => {
    const custInvoices = invoices.filter((inv) => inv.customerId === c.id);
    const totalDebt = custInvoices.reduce((acc, inv) => acc + inv.remainingAmount, 0);
    return {
      name: c.name,
      amount: totalDebt,
    };
  })
  .filter((c) => c.amount > 0)
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 5); // Take top 5

  // 2. Calculate Best Selling Goods (Product quantities sold across invoices)
  const productSalesMap: { [key: string]: number } = {};
  invoices.forEach((inv) => {
    inv.items.forEach((item) => {
      const name = item.details;
      productSalesMap[name] = (productSalesMap[name] || 0) + item.quantity;
    });
  });

  const bestSellingProducts = Object.keys(productSalesMap)
    .map((name) => ({
      name,
      quantity: productSalesMap[name],
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5); // Take top 5

  // Safe division helper
  const getPercentage = (val: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((val / total) * 100);
  };

  const collectionRate = getPercentage(totalPaid, totalSales);

  return (
    <div className="space-y-6">
      {/* Overview Grid */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          الإحصائيات المحاسبية والمؤشرات العامة
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100/60 text-center space-y-1">
            <Users className="w-5 h-5 mx-auto text-blue-500" />
            <span className="block text-[10px] text-slate-400 font-medium font-sans">عدد العملاء</span>
            <span className="block text-lg font-bold font-mono text-slate-800">{totalCustomers}</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100/60 text-center space-y-1">
            <FileText className="w-5 h-5 mx-auto text-blue-500" />
            <span className="block text-[10px] text-slate-400 font-medium font-sans">عدد الفواتير</span>
            <span className="block text-lg font-bold font-mono text-slate-800">{totalInvoicesCount}</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100/60 text-center space-y-1">
            <DollarSign className="w-5 h-5 mx-auto text-blue-500" />
            <span className="block text-[10px] text-slate-400 font-medium font-sans">إجمالي الديون المسجلة</span>
            <span className="block text-sm font-extrabold font-mono text-slate-800">{totalSales.toLocaleString()}</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100/60 text-center space-y-1">
            <DollarSign className="w-5 h-5 mx-auto text-teal-500" />
            <span className="block text-[10px] text-slate-400 font-medium font-sans">إجمالي التحصيلات</span>
            <span className="block text-sm font-extrabold font-mono text-blue-600">{totalPaid.toLocaleString()}</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100/60 text-center space-y-1">
            <AlertCircle className="w-5 h-5 mx-auto text-rose-500" />
            <span className="block text-[10px] text-slate-400 font-medium font-sans">الديون المتبقية للتحصيل</span>
            <span className="block text-sm font-extrabold font-mono text-rose-600">{totalRemaining.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Top Debtors (أكثر العملاء مديونية) */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-slate-500 uppercase">العملاء الخمسة الأكثر مديونية</h3>
            <p className="text-[10px] text-slate-400">مراقبة العملاء الأكثر ذمماً مالية في الدفتر دقةً.</p>
          </div>

          {customerDebts.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-xs">لا توجد ديون معلقة بذمة أي عميل حالياً!</div>
          ) : (
            <div className="space-y-4">
              {customerDebts.map((debtor, idx) => {
                // Get percentage relative to the highest debt in the list
                const highestDebt = customerDebts[0].amount;
                const widthPercent = highestDebt > 0 ? (debtor.amount / highestDebt) * 100 : 0;
                return (
                  <div key={idx} className="space-y-1.5 text-xs">
                    <div className="flex justify-between font-bold text-slate-700">
                      <span className="line-clamp-1">{debtor.name}</span>
                      <span className="font-mono text-rose-600">{debtor.amount.toLocaleString()} {settings.currency}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 2: Best Selling Goods (أكثر البضائع مبيعًا) */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-slate-500 uppercase">البضائع الأكثر حركة ومبيعاً</h3>
            <p className="text-[10px] text-slate-400">مراقبة المواد الغذائية أو السلع الأكثر حركة من فواتير المبيعات.</p>
          </div>

          {bestSellingProducts.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-xs">لا توجد أي مبيعات مسجلة للبضائع حتى الآن.</div>
          ) : (
            <div className="space-y-4">
              {bestSellingProducts.map((p, idx) => {
                const highestSale = bestSellingProducts[0].quantity;
                const widthPercent = highestSale > 0 ? (p.quantity / highestSale) * 100 : 0;
                return (
                  <div key={idx} className="space-y-1.5 text-xs">
                    <div className="flex justify-between font-bold text-slate-700">
                      <span className="line-clamp-1 flex items-center gap-1">
                        <span className="w-5 h-5 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center text-[10px] font-mono shrink-0">
                          {idx + 1}
                        </span>
                        {p.name}
                      </span>
                      <span className="font-mono text-blue-600 font-extrabold">{p.quantity} وحدة</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Bottom Health indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="text-center md:border-l border-slate-100 p-2 space-y-2 last:border-0">
          <Award className="w-8 h-8 text-blue-500 mx-auto" />
          <h4 className="text-xs font-bold text-slate-800">معدل التحصيل المالي</h4>
          <p className="text-[11px] text-slate-400">نسبة المبالغ المحصلة من إجمالي الديون المسجلة.</p>
          <div className="flex items-center justify-center gap-1 mt-1 font-mono">
            <span className="text-xl font-extrabold text-blue-600">{collectionRate}%</span>
            <span className="text-[10px] text-slate-400">المعدل العام</span>
          </div>
        </div>

        <div className="text-center md:border-l border-slate-100 p-2 space-y-2 last:border-0">
          <TrendingUp className="w-8 h-8 text-blue-500 mx-auto" />
          <h4 className="text-xs font-bold text-slate-800">متوسط قيمة الفاتورة</h4>
          <p className="text-[11px] text-slate-400">متوسط قيمة المعاملة المالية وقوائم الحساب.</p>
          <div className="flex items-center justify-center gap-1 mt-1 font-mono">
            <span className="text-xl font-extrabold text-blue-600">
              {totalInvoicesCount > 0 ? Math.round(totalSales / totalInvoicesCount).toLocaleString() : 0}
            </span>
            <span className="text-[10px] text-slate-400">{settings.currency}</span>
          </div>
        </div>

        <div className="text-center p-2 space-y-2">
          <Package className="w-8 h-8 text-blue-500 mx-auto" />
          <h4 className="text-xs font-bold text-slate-800">إجمالي الأرباح الكامنة بالمستودع</h4>
          <p className="text-[11px] text-slate-400">هامش الربح المتوقع عند تسييل وبيع كامل البضائع المتوفرة.</p>
          <div className="flex items-center justify-center gap-1 mt-1 font-mono">
            <span className="text-xl font-extrabold text-blue-600">
              {potentialProfit.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400">{settings.currency}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
