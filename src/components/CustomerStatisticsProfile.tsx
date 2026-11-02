import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, ContactRound } from "lucide-react";
import { Customer, CustomerProfile, CustomerFolder, Invoice, Payment } from "../types";
import { MonthlyFinanceChart, RankingChart } from "./AnalyticsCharts";

import { customerFolderPath, customerPurchaseStats, purchaseDate, purchaseDuration } from "../utils/customerPurchaseStats";

const groups: [string, [string,string,string?][]][] = [
["1. البيانات الأساسية",[["name","اسم العميل الرباعي"],["photo","صورة العميل","image"],["phone","رقم الهاتف","tel"],["address","عنوان السكن"],["occupation","المهنة أو الوظيفة"]]],
["2. المعلومات المالية والوظيفية",[["hasSalary","هل لديه راتب؟","yesNo"],["salaryType","نوع الراتب"]]],
["3. معلومات الكفيل أو الضامن",[["guarantorName","اسم الكفيل"],["guarantorPhone","رقم هاتف الكفيل","tel"],["guarantorAddress","عنوان سكن الكفيل"]]],
["4. معلومات الأرشفة",[["folderId","المجلد التابع له العميل","readonly"],["sequence","التسلسل داخل المجلد","readonly"]]]
];
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const validDate = (value: string) => Number.isFinite(Date.parse(value));
const formatLedgerTimestamp = (value: string) => {
  const raw = value?.trim();
  if (!raw) return { weekday: "", time: "غير محدد", date: "غير محدد" };
  const dateOnly = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
  const parsed = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12))
    : new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return { weekday: "", time: "غير محدد", date: raw };
  const dateParts = new Intl.DateTimeFormat("ar-IQ-u-nu-latn", {
    timeZone: dateOnly ? "UTC" : "Asia/Baghdad",
    weekday: "long", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(parsed);
  const part = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    parts.find(entry => entry.type === type)?.value || "";
  const date = part(dateParts, "year") + "/" + part(dateParts, "month") + "/" + part(dateParts, "day");
  const weekday = part(dateParts, "weekday");
  if (dateOnly) return { weekday, time: "غير محدد", date };
  const timeParts = new Intl.DateTimeFormat("ar-IQ-u-nu-latn", {
    timeZone: "Asia/Baghdad", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(parsed);
  const time = part(timeParts, "hour") + ":" + part(timeParts, "minute") + " " + part(timeParts, "dayPeriod");
  return { weekday, time, date };
};
const formatShortLedgerTime = (value: string) => value
  .replace(/صباحاً|صباحًا|صباحا/g, "ص")
  .replace(/مساءً|مساءًا|مساءا/g, "م")
  .replace(/\s*(AM|PM)\s*/gi, (_match, period: string) => period.toUpperCase() === "AM" ? " ص " : " م ")
  .replace(/\s+/g, " ")
  .trim();
const paymentOrdinalLabel = (index: number) => {
  const ordinals = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
  return "التسديد " + (ordinals[index] || number(index + 1));
};

export default function CustomerStatisticsProfile({ customer, invoices, payments, currency, folders = [], onSave, onClose }: {
  folders?: CustomerFolder[]; customer: Customer; invoices: Invoice[]; payments: Payment[]; currency: string;
  onSave?: (customer: Customer) => Promise<void> | void; onClose: () => void;
}) {
  const [tab, setTab] = useState<"personal" | "paper" | "business" | "financial" | "due" | "analytics" | "summary">("personal");
  const [source, setSource] = useState<"vertical" | "accounting">("vertical");
  const [draft, setDraft] = useState<CustomerProfile>(() => ({ ...customer.profile, name: customer.name, phone: customer.phone, address: customer.address || "", salaryType: customer.salaryType || "" }));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selectedAnalysisKeys, setSelectedAnalysisKeys] = useState<string[]>([]);
  const selectionPressTimer = useRef<number | null>(null);
  const pageTitle = useRef<HTMLHeadingElement>(null);
  const requestClose = () => { if (!saving && (!editing || window.confirm("الرجوع إلى العملاء وإلغاء التعديلات غير المحفوظة؟"))) onClose(); };
  useEffect(() => { pageTitle.current?.focus(); }, []);
  const purchases = customerPurchaseStats(customer, invoices);
  const folderPath = customerFolderPath(customer.folderId, folders);
  const customerInvoices = invoices.filter(inv => inv.customerId === customer.id && !inv.isDeleted);
  const customerPayments = payments.filter(pay => pay.customerId === customer.id && !pay.isDeleted);
  const saleItems = source === "vertical"
    ? customerInvoices.flatMap(inv => inv.items.filter(item => !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow && (item.details.trim() || item.total !== 0)))
    : (customer.accountingSheetRows || []).filter(row => !row.isSeparator && (row.details.trim() || row.total !== 0));
  const sales = source === "vertical" ? customerInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0) : saleItems.reduce((sum, row) => sum + row.total, 0);
  const paymentRows = source === "vertical"
    ? customerInvoices.flatMap(invoice => {
      let carriedBalance = 0;
      let currentSectionTotal = 0;
      const rows: {
        id: string; total: number; payment: number; remaining: number;
        weekday: string; time: string; date: string; recipient: string;
      }[] = [];
      const orderedItems = invoice.items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => (a.item.pageNumber || 1) - (b.item.pageNumber || 1) || a.index - b.index);
      orderedItems.forEach(({ item }) => {
        if (item.isSeparator) {
          const paidAmount = Number(item.paidAmount) || 0;
          const totalAmount = carriedBalance + currentSectionTotal;
          const remainingAmount = Math.max(0, totalAmount - paidAmount);
          if (paidAmount > 0) {
            const stamp = formatLedgerTimestamp(item.paidDate || invoice.date || invoice.createdAt || "");
            rows.push({
              id: invoice.id + ":" + item.id,
              total: totalAmount,
              payment: paidAmount,
              remaining: remainingAmount,
              weekday: item.paidDay || stamp.weekday,
              time: item.paidTime || stamp.time,
              date: stamp.date,
              recipient: item.sellerName || "غير مسجل",
            });
          }
          carriedBalance = remainingAmount;
          currentSectionTotal = 0;
        } else if (!item.isPaymentRow && !item.isRemainingRow) {
          currentSectionTotal += Number(item.total || item.unitPrice || 0);
        }
      });
      return rows;
    })    : (() => {
      let cumulativePayments = 0;
      return [...(customer.accountingSheetPayments || [])]
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        .map(payment => {
          const amount = Number(payment.amount) || 0;
          cumulativePayments += amount;
          const stamp = formatLedgerTimestamp(payment.date || "");
          return {
            id: payment.id,
            total: sales,
            payment: amount,
            remaining: Math.max(0, sales - cumulativePayments),
            weekday: stamp.weekday,
            time: stamp.time,
            date: stamp.date,
            recipient: ("sellerName" in payment ? String(payment.sellerName || "") : "") || "غير مسجل",
          };
        });
    })();
  // Payment records already update invoice.paidAmount; adding both would count receipts twice.
  const paid = source === "vertical" ? customerInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0) : (customer.accountingSheetPayments || []).reduce((sum, pay) => sum + pay.amount, 0);
  const remaining = source === "vertical" ? customerInvoices.reduce((sum, inv) => sum + inv.remainingAmount, 0) : Math.max(0, sales - paid);
  const chartSales = source === "vertical"
    ? customerInvoices.map(inv => ({ date: inv.date, amount: Number(inv.grandTotal) || 0 }))
    : (customer.accountingSheetRows || []).filter(row => !row.isSeparator && (row.details.trim() || row.total !== 0))
      .map(row => ({ date: row.createdAt || "", amount: Number(row.total) || 0 }));
  const chartCollections = source === "vertical"
    ? customerPayments.map(pay => ({ date: pay.date, amount: Number(pay.amount) || 0 }))
    : (customer.accountingSheetPayments || []).map(pay => ({ date: pay.date, amount: Number(pay.amount) || 0 }));
  const topCustomerItems = [...saleItems.reduce((map, item) => {
    const name = item.details?.trim() || item.productId || "صنف غير مسمى";
    map.set(name, (map.get(name) || 0) + (Number(item.total) || 0));
    return map;
  }, new Map<string, number>()).entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  const costsComplete = saleItems.length > 0 && saleItems.every(item => typeof item.unitCost === "number" && Number.isFinite(item.unitCost) && item.unitCost >= 0);
  const itemSales = saleItems.reduce((sum, item) => sum + item.total, 0);
  const cost = costsComplete ? saleItems.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0) : null;
  const profit = cost !== null && Math.abs(itemSales - sales) < 0.01 ? sales - cost : null;
  const dates = customerInvoices.map(inv => inv.date).filter(validDate).sort((a,b) => Date.parse(a)-Date.parse(b));
  const overdue = customerInvoices.filter(inv => inv.remainingAmount > 0 && inv.dueDate && validDate(inv.dueDate) && inv.dueDate < new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" }));
  const stats: [string, string][] = [
    ["إجمالي المبيعات المسجلة", `${number(sales)} ${currency}`], ["إجمالي التسديدات", `${number(paid)} ${currency}`],
    ["المبلغ المتبقي", `${number(remaining)} ${currency}`], ["الربح الإجمالي المسجل", profit === null ? "غير متاح" : `${number(profit)} ${currency}`],
    ["تكلفة البضاعة وقت البيع", cost === null ? "غير متاحة بالكامل" : `${number(cost)} ${currency}`], ["هامش الربح", profit !== null && sales > 0 ? `${number(profit / sales * 100)}٪` : "غير متاح"],
    ["القطع المسجلة", number(saleItems.reduce((sum,item) => sum + item.quantity, 0))],
  ];
  if (source === "vertical") stats.push(
    ["أول / آخر تاريخ سجل", dates.length ? `${dates[0]} / ${dates[dates.length - 1]}` : "لا توجد سجلات"],
    ["مدة التعامل المسجلة", dates.length ? `${number(Math.max(0, Math.floor((Date.now()-Date.parse(dates[0]))/86400000)))} يوم` : "غير متاحة"],
    ["كشوف مفتوحة / مغلقة", `${customerInvoices.filter(inv => inv.remainingAmount > 0).length} / ${customerInvoices.filter(inv => inv.grandTotal > 0 && inv.remainingAmount <= 0).length}`],
    ["المبالغ المتأخرة حسب استحقاق الكشف", `${number(overdue.reduce((sum, inv) => sum + inv.remainingAmount, 0))} ${currency}`],
    ["حالة الاستحقاق", overdue.length ? "توجد مبالغ متأخرة" : "لا توجد مبالغ متأخرة بتاريخ استحقاق مسجل"],
  );
  const itemQuantities = new Map<string, number>();
  saleItems.forEach(item => itemQuantities.set(item.details, (itemQuantities.get(item.details) || 0) + item.quantity));
  const topItem = [...itemQuantities.entries()].sort((a,b) => b[1]-a[1])[0];
  if (topItem) stats.push(["أكثر بند مسجل بالكمية", `${topItem[0]} · ${number(topItem[1])}`]);
  if (source === "vertical" && customerInvoices.length) {
    const values = customerInvoices.map(inv => inv.grandTotal);
    stats.push(["أكبر / أصغر كشف", `${number(Math.max(...values))} / ${number(Math.min(...values))} ${currency}`], ["متوسط قيمة الكشف", `${number(sales/customerInvoices.length)} ${currency}`]);
    const lastPayment = [...customerPayments].filter(pay => validDate(pay.date)).sort((a,b) => Date.parse(b.date)-Date.parse(a.date))[0];
    stats.push(["عدد سندات القبض المستقلة", number(customerPayments.length)]);
    if (lastPayment) stats.push(["آخر سند قبض مستقل", `${lastPayment.date} · ${number(lastPayment.amount)} ${currency}`]);
    const nextDue = customerInvoices.filter(inv => inv.remainingAmount > 0 && inv.dueDate && validDate(inv.dueDate)).map(inv => inv.dueDate!).sort()[0];
    stats.push(["أقرب استحقاق كشف مفتوح", nextDue || "غير محدد"]);
  }
  const salesType = (inv: Invoice) => (inv as Invoice & { saleType?: string }).saleType;
  const classified = customerInvoices.filter(inv => ["cash", "credit", "installment"].includes(salesType(inv) || ""));
  const saleTypeKnown = classified.length === customerInvoices.length && customerInvoices.length > 0;
  const countType = (type: string) => classified.filter(inv => salesType(inv) === type).length;
  const amountType = (type: string) => classified.filter(inv => salesType(inv) === type).reduce((sum, inv) => sum + inv.grandTotal, 0);
  const unknown = "غير متوفر — البيانات غير مسجلة";
  const sourceRows = source === "vertical" ? customerInvoices : [];
  const dueKnown = source === "vertical" && sourceRows.length > 0 && sourceRows.every(inv => inv.remainingAmount <= 0 || (inv.dueDate && validDate(inv.dueDate)));
  const currentDay = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
  const dueOpen = dueKnown ? sourceRows.filter(inv => inv.remainingAmount > 0 && inv.dueDate && inv.dueDate < currentDay) : [];
  const oldestDue = dueOpen.map(inv => inv.dueDate!).sort()[0];
  const nextDueDate = dueKnown ? sourceRows.filter(inv => inv.remainingAmount > 0 && inv.dueDate && inv.dueDate >= currentDay).map(inv => inv.dueDate!).sort()[0] : undefined;
  const daysBetween = (start: string, end: string) => Math.max(0, Math.floor((Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000));
  const topProfit = costsComplete ? [...saleItems.reduce((map, item) => {
    const name = item.details || item.productId || "صنف غير مسمى";
    map.set(name, (map.get(name) || 0) + item.total - item.quantity * (item.unitCost || 0));
    return map;
  }, new Map<string, number>()).entries()].sort((a,b) => b[1] - a[1])[0] : undefined;
  const lastAccountingPayment = [...(customer.accountingSheetPayments || [])].filter(p => validDate(p.date)).sort((a,b) => Date.parse(b.date)-Date.parse(a.date))[0];
  const lastVerticalPayment = [...customerPayments].filter(p => validDate(p.date)).sort((a,b) => Date.parse(b.date)-Date.parse(a.date))[0];
  const lastPaid = source === "vertical" ? lastVerticalPayment : lastAccountingPayment;
  const extraStats: Record<string, string> = {
    "نوع التعامل": draft.transactionType || "غير محدد",
    "عدد عمليات الشراء النقدية": source === "vertical" && saleTypeKnown ? number(countType("cash")) : unknown,
    "عدد عمليات الشراء بالأقساط": source === "vertical" && saleTypeKnown ? number(countType("installment")) : unknown,
    "عدد عمليات الشراء الآجلة": source === "vertical" && saleTypeKnown ? number(countType("credit")) : unknown,
    "إجمالي المبيعات النقدية": source === "vertical" && saleTypeKnown ? `${number(amountType("cash"))} ${currency}` : unknown,
    "إجمالي المبيعات بالأقساط": source === "vertical" && saleTypeKnown ? `${number(amountType("installment"))} ${currency}` : unknown,
    "إجمالي المبيعات الآجلة": source === "vertical" && saleTypeKnown ? `${number(amountType("credit"))} ${currency}` : unknown,
    "عدد الأصناف المختلفة": saleItems.length && saleItems.every(i => !!i.productId) ? number(new Set(saleItems.map(i => i.productId)).size) : unknown,
    "أكثر صنف ربحاً": topProfit ? `${topProfit[0]} · ${number(topProfit[1])} ${currency}` : unknown,
    "تاريخ آخر تسديد وقيمته": lastPaid ? `${lastPaid.date} · ${number(lastPaid.amount)} ${currency}` : unknown,
    "أعلى رصيد دين تاريخي": unknown,
    "متوسط مدة تسديد الدين": unknown,
    "إجمالي المبالغ المتأخرة": dueKnown ? `${number(dueOpen.reduce((sum, inv) => sum + inv.remainingAmount, 0))} ${currency}` : unknown,
    "عدد الكشوف المتأخرة": dueKnown ? number(dueOpen.length) : unknown,
    "أقدم استحقاق متأخر": dueKnown ? (oldestDue || "لا يوجد") : unknown,
    "أيام تأخير أقدم استحقاق": dueKnown ? (oldestDue ? `${number(daysBetween(oldestDue, currentDay))} يوم` : "0 يوم") : unknown,
    "أقرب استحقاق قادم": dueKnown ? (nextDueDate || "لا يوجد") : unknown,
    "إجمالي الأقساط المستحقة": unknown,
    "عدد الأقساط غير المسددة": unknown,
    "انتظام التسديد": unknown,
    "متوسط أيام التأخير": unknown,
    "نسبة سداد المستحقات": unknown,
    "معدل تكرار الشراء": unknown,
    "المقارنة مع الشهر السابق": unknown,
    "حالة نشاط العميل": unknown,
    "حالة الالتزام": dueKnown ? (dueOpen.length ? "متأخر حسب مواعيد الكشوف" : "لا توجد كشوف متأخرة") : unknown,
    "التنبيهات التلقائية": "تتطلب جدول أقساط وتنبيهات موثقة؛ غير مفعّلة من هذه النافذة",
  };
  const financialGroups: [string,[string,string[]][]][] = [["تفاصيل التعامل التجاري",[["1. تاريخ التعامل",["تاريخ أول عملية شراء","تاريخ آخر عملية شراء","مدة التعامل بالأيام والأشهر والسنوات"]],["2. إحصائيات المشتريات",["أكثر الأصناف التي يشتريها","إجمالي عدد البضائع المشتراة"]]]],["الملخص الحسابي",[["1. إجمالي المبيعات",["إجمالي المبيعات النقدية","إجمالي المبيعات الآجلة وبالأقساط","إجمالي المبيعات الكلي"]],["2. الديون والتسديدات",["إجمالي المبلغ المسدد","إجمالي المبلغ المتبقي","تاريخ آخر تسديد وقيمته","أكبر مبلغ دين وصل إليه العميل"]],["3. الأرباح",["إجمالي الربح من العميل","أكثر بضاعة حققت ربحاً من التعامل مع العميل","نسبة هامش الربح"]]]],["المستحقات والتأخير",[["1. المستحقات المالية",["إجمالي المبالغ المستحقة","إجمالي المبالغ المتأخرة","عدد الأقساط غير المسددة"]],["2. تفاصيل التأخير",["عدد أيام التأخير"]]]],["تحليل سلوك العميل (Customer Analytics)",[["1. سلوك التسديد",["انتظام العميل بالتسديد","متوسط التأخير بالأيام","نسبة تسديد الديون المستحقة"]],["2. سلوك الشراء",["معدل تكرار الشراء","مقارنة مشترياته بالشهر السابق"]],["3. تقييم العميل",["تصنيف العميل: منتظم / متأخر / متوقف عن التعامل","تنبيهات تلقائية عند التأخر عن التسديد"]]]]];
  const metricAliases: Record<string,string> = {"تاريخ أول عملية شراء":"أول / آخر تاريخ سجل","تاريخ آخر عملية شراء":"أول / آخر تاريخ سجل","مدة التعامل بالأيام والأشهر والسنوات":"مدة التعامل المسجلة","أكثر الأصناف التي يشتريها":"أكثر بند مسجل بالكمية","إجمالي عدد البضائع المشتراة":"القطع المسجلة","إجمالي المبيعات النقدية":"إجمالي المبيعات النقدية","إجمالي المبيعات الكلي":"إجمالي المبيعات المسجلة","إجمالي المبلغ المسدد":"إجمالي التسديدات","إجمالي المبلغ المتبقي":"المبلغ المتبقي","تاريخ آخر تسديد وقيمته":"تاريخ آخر تسديد وقيمته","أكبر مبلغ دين وصل إليه العميل":"أعلى رصيد دين تاريخي","إجمالي الربح من العميل":"الربح الإجمالي المسجل","أكثر بضاعة حققت ربحاً من التعامل مع العميل":"أكثر صنف ربحاً","نسبة هامش الربح":"هامش الربح","إجمالي المبالغ المستحقة":"إجمالي الأقساط المستحقة","إجمالي المبالغ المتأخرة":"إجمالي المبالغ المتأخرة","عدد الأقساط غير المسددة":"عدد الأقساط غير المسددة","عدد أيام التأخير":"أيام تأخير أقدم استحقاق","انتظام العميل بالتسديد":"انتظام التسديد","متوسط التأخير بالأيام":"متوسط أيام التأخير","نسبة تسديد الديون المستحقة":"نسبة سداد المستحقات","معدل تكرار الشراء":"معدل تكرار الشراء","مقارنة مشترياته بالشهر السابق":"المقارنة مع الشهر السابق","تصنيف العميل: منتظم / متأخر / متوقف عن التعامل":"حالة الالتزام","تنبيهات تلقائية عند التأخر عن التسديد":"التنبيهات التلقائية"};
  const metricValues: Record<string,string> = Object.fromEntries(Object.entries(metricAliases).map(([label,key])=>[label,stats.find(([name])=>name===key)?.[1] ?? extraStats[key] ?? "غير متوفر"]));
  metricValues["إجمالي المبيعات الآجلة وبالأقساط"] = source==="vertical"&&saleTypeKnown ? number(amountType("credit")+amountType("installment"))+" "+currency : "غير متوفر";
  metricValues["تاريخ أول عملية شراء"] = purchaseDate(purchases.first);
  metricValues["تاريخ آخر عملية شراء"] = purchaseDate(purchases.last);
  metricValues["مدة التعامل بالأيام والأشهر والسنوات"] = purchaseDuration(purchases.first, purchases.last);
  metricValues["أكثر الأصناف التي يشتريها"] = purchases.topThree.length ? purchases.topThree.map(([name, count]) => `${name} (${number(count)})`).join("، ") : "لا توجد أصناف مسجلة";
  metricValues["إجمالي عدد البضائع المشتراة"] = number(purchases.totalQuantity);
  const analysisRowKey = (item: (typeof saleItems)[number]) => source + ":" + item.id;
  const selectedAnalysisItems = saleItems.filter(item => selectedAnalysisKeys.includes(analysisRowKey(item)));
  const startAnalysisRowLongPress = (item: (typeof saleItems)[number]) => {
    if (selectionPressTimer.current !== null) window.clearTimeout(selectionPressTimer.current);
    const key = analysisRowKey(item);
    selectionPressTimer.current = window.setTimeout(() => {
      setSelectedAnalysisKeys(current => current.includes(key) ? current : [...current, key]);
      selectionPressTimer.current = null;
    }, 500);
  };
  const cancelAnalysisRowLongPress = () => {
    if (selectionPressTimer.current !== null) {
      window.clearTimeout(selectionPressTimer.current);
      selectionPressTimer.current = null;
    }
  };
  const formatAnalysisQuantityTotals = (rows: typeof saleItems) =>
    number(rows.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0));
  const toggleAllAnalysisRows = () => setSelectedAnalysisKeys(
    selectedAnalysisItems.length === saleItems.length && saleItems.length > 0
      ? []
      : saleItems.map(analysisRowKey)
  );
  const renderAnalysisTable = (rows: typeof saleItems, selectable = false) => {
    const rowsSale = rows.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const rowsCostsComplete = rows.length > 0 && rows.every(item =>
      typeof item.unitCost === "number" && Number.isFinite(item.unitCost) && item.unitCost >= 0
    );
    const rowsCost = rowsCostsComplete
      ? rows.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (item.unitCost || 0), 0)
      : null;
    const rowsProfit = rowsCost === null ? null : rowsSale - rowsCost;
    return <table className={"customer-analysis-table w-full border-collapse text-xs [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_th]:text-center [&_td]:text-center " + (selectable ? "min-w-[1692px]" : "min-w-[1650px]")}>
      <thead className="bg-violet-50 text-violet-950"><tr>
        {selectable && <th rowSpan={2} className="w-[42px] border p-2">تحديد</th>}
        <th rowSpan={2} className="border p-2">ت</th><th rowSpan={2} className="border p-2">البضاعة</th>
        <th rowSpan={2} className="border p-2">العدد</th>
        <th colSpan={2} className="border p-2">سعر الشراء</th><th colSpan={2} className="border p-2">الربح</th>
        <th colSpan={2} className="border p-2">سعر البيع</th><th rowSpan={2} className="border p-2">الطابع الزمني</th>
        <th rowSpan={2} className="border p-2">اسم البائع</th>
      </tr><tr className="bg-emerald-100">
        <th className="border p-2">للمفرد</th><th className="border p-2">للجمع</th>
        <th className="border p-2">للمفرد</th><th className="border p-2">للجمع</th>
        <th className="border p-2">للمفرد</th><th className="border p-2">للجمع</th>
      </tr></thead>
      <tbody>{rows.map((item, index) => {
        const quantity = Number(item.quantity) || 0;
        const saleUnit = Number(item.unitPrice) || (quantity ? (Number(item.total) || 0) / quantity : 0);
        const saleTotal = Number(item.total) || 0;
        const unitCost = typeof item.unitCost === "number" && Number.isFinite(item.unitCost) ? item.unitCost : null;
        const profitUnit = unitCost === null ? null : saleUnit - unitCost;
        const profitTotal = unitCost === null ? null : saleTotal - unitCost * quantity;
        const relatedInvoice = customerInvoices.find(inv => inv.items.some(invoiceItem => invoiceItem.id === item.id));
        const stampValue = ("createdAt" in item ? item.createdAt : undefined) || relatedInvoice?.createdAt || relatedInvoice?.date || customer.accountingSheetDate || "";
        const stamp = formatLedgerTimestamp(stampValue);
        const key = analysisRowKey(item);
        const originalIndex = saleItems.findIndex(candidate => analysisRowKey(candidate) === key);
        return <tr key={key} className={selectedAnalysisKeys.includes(key) ? "bg-blue-100" : index % 2 ? "bg-slate-50" : "bg-white"}>
          {selectable && <td className="w-[42px] border p-2"><input type="checkbox" aria-label={"تحديد صف " + (originalIndex + 1)} checked={selectedAnalysisKeys.includes(key)} onChange={() => setSelectedAnalysisKeys(current => current.includes(key) ? current.filter(rowKey => rowKey !== key) : [...current, key])} className="h-5 w-5 accent-blue-600" /></td>}
          <td className="border p-2 select-none" onPointerDown={event => { if (event.pointerType === "mouse" && event.button !== 0) return; startAnalysisRowLongPress(item); }} onPointerUp={cancelAnalysisRowLongPress} onPointerLeave={cancelAnalysisRowLongPress} onPointerCancel={cancelAnalysisRowLongPress} onContextMenu={event => event.preventDefault()}>{originalIndex + 1}</td><td className="border p-2">{item.details || "بضاعة غير مسماة"}</td>
          <td className="border p-2">{number(quantity)} {("unit" in item && item.unit) || ("unitName" in item && item.unitName) || ""}</td>
          <td className="analysis-pair-divider border p-2">{unitCost === null ? "غير مسجل" : number(unitCost)}</td>
          <td className="analysis-pair-join border p-2">{unitCost === null ? "غير مسجل" : number(unitCost * quantity)}</td>
          <td className="analysis-pair-divider border p-2">{profitUnit === null ? "غير متاح" : number(profitUnit)}</td>
          <td className="analysis-pair-join border p-2">{profitTotal === null ? "غير متاح" : number(profitTotal)}</td>
          <td className="analysis-pair-divider border p-2">{number(saleUnit)}</td><td className="analysis-pair-join border p-2">{number(saleTotal)}</td>
          <td className="border p-2"><div dir="ltr" className="inline-flex items-center justify-center gap-1"><span dir="rtl">{stamp.weekday}</span><span>—</span><span dir="ltr">{formatShortLedgerTime(stamp.time)}</span><span>—</span><span dir="ltr">{stamp.date}</span></div></td>
          <td className="border p-2">{("sellerName" in item ? item.sellerName : undefined) || relatedInvoice?.employeeName || "غير مسجل"}</td>
        </tr>;
      })}</tbody>
      <tfoot className="bg-amber-50 font-bold"><tr>
        {selectable && <td className="border p-2">—</td>}
        <td className="border p-2">—</td><td className="border p-2">المجموع</td>
        <td className="border p-2">مجموع العدد: {formatAnalysisQuantityTotals(rows)}</td>
        <td className="border p-2" colSpan={2}>مجموع سعر الشراء: {rowsCost === null ? "غير مكتمل" : number(rowsCost)}</td>
        <td className="border p-2" colSpan={2}>مجموع الربح: {rowsProfit === null ? "غير متاح بالكامل" : number(rowsProfit)}</td>
        <td className="border p-2" colSpan={2}>مجموع سعر البيع: {number(rowsSale)}</td>
        <td className="border p-2">—</td><td className="border p-2">—</td>
      </tr></tfoot>
    </table>;
  };
  const save = async () => {
    if (!onSave || saving) return;
    if (!draft.name?.trim()) { setError("اسم العميل مطلوب."); return; }
    if (draft.salary && (!Number.isFinite(Number(draft.salary)) || Number(draft.salary) < 0)) { setError("الراتب يجب أن يكون رقماً موجباً أو صفراً."); return; }
    setSaving(true); setError("");
    try { await onSave({ ...customer, name: draft.name.trim(), phone: draft.phone || "", address: draft.address || "", salaryType: draft.salaryType || "", profile: draft }); setEditing(false); }
    catch { setError("تعذر حفظ البيانات. حاول مرة أخرى."); }
    finally { setSaving(false); }
  };
  return (
    <section aria-labelledby="customer-profile-title" dir="rtl" className="min-w-0 w-full space-y-4 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50 p-3 sm:p-4"><div className="min-w-0"><h2 ref={pageTitle} tabIndex={-1} id="customer-profile-title" className="flex items-center gap-2 font-bold text-slate-900"><ContactRound className="h-5 w-5 shrink-0" />إحصائيات العميل</h2><p className="break-words text-sm text-slate-600">{customer.name}</p></div><button type="button" disabled={saving} aria-label="الرجوع إلى قائمة العملاء" onClick={requestClose} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-800 disabled:opacity-50"><ArrowRight className="h-4 w-4" />الرجوع إلى العملاء</button></header>
      <div className="flex gap-2 overflow-x-auto border-b p-2" role="tablist" aria-label="أقسام ملف العميل">{([['personal','المعلومات الشخصية'],['paper','تحليل الورقة'],['business','التعامل التجاري'],['financial','الملخص الحسابي'],['due','المستحقات والتأخير'],['analytics','تحليل سلوك العميل'],['summary','ملخص الحساب والمخططات']] as const).map(([value,label]) => <button type="button" key={value} role="tab" aria-selected={tab === value} aria-controls="customer-profile-panel" onClick={() => { setTab(value); setExpanded(false); }} className={`shrink-0 rounded-lg p-2 text-xs sm:text-sm font-bold ${tab === value ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>)}</div>
      <div id="customer-profile-panel" role="tabpanel" className="min-w-0 space-y-4">
        {tab === "personal" ? <>
          {groups.map(([title,fields]) => <section key={title}><h3 className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-right text-sm font-bold text-violet-900">{title}</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(([field,label,type]) => <label key={field} className="block min-w-0 text-xs text-slate-600"><span>{label}</span>{editing ? (type === 'image' ? <div className="mt-2 space-y-2">{draft.photo && <img src={draft.photo} alt="صورة العميل" className="h-24 w-24 rounded-xl object-cover" />}<input type="file" accept="image/*" disabled={saving} onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>250000){setError('الصورة يجب أن تكون أقل من 250 كيلوبايت');return;}const reader=new FileReader();reader.onload=()=>{if(typeof reader.result==='string')setDraft(old=>({...old,photo:reader.result as string}));};reader.readAsDataURL(f);}} className="w-full text-xs" /></div> : type === 'readonly' ? <span className="mt-1 block">{field==='folderId' ? folderPath : String(customer.sequence??'غير محدد')}</span> : type === 'saleType' || type === 'yesNo' ? <select value={draft[field]||''} onChange={e=>setDraft(old=>({...old,[field]:e.target.value}))} className="mt-1 w-full rounded-lg border p-2">{(type==='saleType'?['','نقدي','آجل','أقساط']:['','نعم','لا']).map(v=><option key={v} value={v}>{v||'غير محدد'}</option>)}</select> : field === 'notes' || field === 'documents' ? <textarea value={draft[field] || ''} onChange={e => setDraft({...draft,[field]:e.target.value})} disabled={saving} className="mt-1 w-full rounded-lg border p-2 text-sm" /> : <input type={type === 'image' || type === 'saleType' || type === 'yesNo' || type === 'readonly' ? 'text' : (type || 'text')} min={type === 'number' ? 0 : undefined} value={draft[field] || ''} onChange={e => setDraft({...draft,[field]:e.target.value})} disabled={saving} className="mt-1 w-full rounded-lg border p-2 text-sm" />) : type === 'image' ? (draft.photo ? <img src={draft.photo} alt="صورة العميل" className="mt-2 h-24 w-24 rounded-xl object-cover" /> : <span>غير مضاف</span>) : <span className="mt-1 block whitespace-pre-wrap break-words text-sm font-medium text-slate-900">{(field === 'folderId' ? folderPath : field === 'sequence' ? String(customer.sequence ?? '') : draft[field]) || 'غير مضاف'}</span>}</label>)}</div></section>)}
        </> : <>
          {tab !== "business" && <><label className="block text-sm font-bold">مصدر الحسابات<select value={source} onChange={e => { setSource(e.target.value as typeof source); setExpanded(false); setSelectedAnalysisKeys([]); }} className="mt-2 w-full rounded-lg border p-2"><option value="vertical">سجل الحساب العمودي / كشوف الديون</option><option value="accounting">القائمة الحسابية المستقلة</option></select></label>
          <p className="text-xs text-slate-500">كل سجل يُحسب بصورة مستقلة لمنع تكرار المبالغ. الأرقام من البيانات المحفوظة فقط.</p></>}
          {tab === "paper" && <section className="space-y-3 rounded-xl border border-violet-100 bg-white p-3 sm:p-4">
            <div><h3 className="text-base font-bold text-violet-900">تحليل بنود الورقة الحسابية</h3><p className="mt-1 text-xs leading-5 text-slate-500">عرض موسّع للبضاعة والكميات وسعر الشراء والبيع والربح. تكلفة الشراء والربح تظهر فقط للبنود التي سُجلت لها كلفة شراء وقت البيع.</p></div>
            {saleItems.length ? <><div className="overflow-x-auto rounded-lg border">
              {renderAnalysisTable(saleItems, selectedAnalysisKeys.length > 0)}
                <style>{`
                  .customer-analysis-table thead tr:nth-child(2) th:nth-child(odd) {
                    border-left: 0.5px solid rgba(148, 163, 184, 0.45) !important;
                  }
                  .customer-analysis-table thead tr:nth-child(2) th:nth-child(even) {
                    border-right: 0 !important;
                  }
                  .customer-analysis-table .analysis-pair-divider {
                    border-left: 0.5px solid rgba(148, 163, 184, 0.45) !important;
                  }
                  .customer-analysis-table .analysis-pair-join {
                    border-right: 0 !important;
                  }
                  .customer-analysis-table tbody tr,
                  .customer-analysis-table tbody td {
                    height: 42px !important;
                    box-sizing: border-box;
                  }
                  .customer-analysis-table tbody td {
                    padding-top: 6px !important;
                    padding-bottom: 6px !important;
                    line-height: 20px !important;
                  }
                  .customer-analysis-table tbody td input[type="checkbox"] {
                    display: block;
                    width: 20px;
                    height: 20px;
                    margin: 0 auto;
                  }
                `}</style>
            </div>
              {selectedAnalysisItems.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
                <strong className="text-blue-900">تم تحديد {number(selectedAnalysisItems.length)} صفوف</strong>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={toggleAllAnalysisRows} className="rounded-lg border border-blue-200 bg-white px-3 py-2 font-bold text-blue-800">{selectedAnalysisItems.length === saleItems.length ? "إلغاء تحديد الكل" : "تحديد الكل"}</button>
                  <button type="button" aria-label="إلغاء تحديد الصفوف" onClick={() => setSelectedAnalysisKeys([])} className="rounded-lg px-3 py-2 text-slate-600">×</button>
                </div>
              </div>}
              {selectedAnalysisItems.length > 0 && <section className="mt-4 space-y-3 rounded-xl border border-violet-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-violet-50 p-3">
                  <div><h4 className="font-bold text-violet-900">إحصائية صفوف محددة</h4><p className="mt-1 text-xs text-slate-600">تم تحديد {number(selectedAnalysisItems.length)} صفوف — المجاميع تخص هذه الصفوف فقط.</p></div>
                  
                </div>
                <div className="overflow-x-auto rounded-lg border">{renderAnalysisTable(selectedAnalysisItems)}</div>
              </section>}
            </> : <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">لا توجد بنود محفوظة في مصدر الحساب المحدد.</p>}
          </section>}
          {tab === "paper" && <section className="space-y-3 rounded-xl border border-violet-100 bg-white p-3 sm:p-4">
            <div><h3 className="text-base font-bold text-violet-900">سجل التسديدات</h3><p className="mt-1 text-xs text-slate-500">التسديدات المعروضة مأخوذة من سجل ديون العميل، مع المجموع والمتبقي المسجلين لكل حركة.</p></div>
            <div className="overflow-x-auto rounded-lg border">
              {paymentRows.length ? <table className="min-w-[1000px] w-full border-collapse text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_th]:text-center [&_td]:text-center">
                <thead className="bg-[#91abd5] text-slate-950"><tr>
                  <th className="border border-slate-400 p-2">ت</th><th className="border border-slate-400 p-2">المجموع الكلي</th><th className="border border-slate-400 p-2">مبلغ التسديد</th><th className="border border-slate-400 p-2">المبلغ المتبقي</th><th className="border border-slate-400 p-2">الطابع الزمني</th><th className="border border-slate-400 p-2">المستلم</th>
                </tr></thead>
                <tbody>{paymentRows.map((payment, index) => <tr key={payment.id} className="bg-white">
                  <td className="border border-slate-300 p-2">{paymentOrdinalLabel(index)}</td><td className="border border-slate-300 p-2">{number(payment.total)}</td><td className="border border-slate-300 p-2">{number(payment.payment)}</td><td className="border border-slate-300 p-2">{number(payment.remaining)}</td>
                  <td className="border border-slate-300 p-2"><div dir="ltr" className="inline-flex items-center justify-center gap-1"><span dir="rtl">{payment.weekday}</span><span>—</span><span dir="ltr">{formatShortLedgerTime(payment.time)}</span><span>—</span><span dir="ltr">{payment.date}</span></div></td>
                  <td className="border border-slate-300 p-2">{payment.recipient}</td>
                </tr>)}</tbody>
              </table> : <p className="p-4 text-center text-sm text-slate-600">لا توجد تسديدات مسجلة في مصدر الحساب المحدد.</p>}
            </div>
          </section>}
          {tab === "business" && <p className="text-xs text-slate-500">تُحسب المشتريات من صفوف الورقة العمودية والقائمة الحسابية المحفوظة معاً، دون صفوف التسديد والفواصل والصفوف الفارغة. ترتيب أكثر الأصناف حسب مجموع عدد القطع المشتراة، والعدد بجمع الكميات مهما اختلفت وحداتها.{purchases.missingDates > 0 && ` يوجد ${number(purchases.missingDates)} صف بلا طابع زمني؛ تواريخ البداية والنهاية والمدة تخص الصفوف المؤرخة فقط.`}</p>}
          {financialGroups.filter(([title])=>(tab==="business"&&title === "تفاصيل التعامل التجاري")||(tab==="financial"&&title === "الملخص الحسابي")||(tab==="due"&&title === "المستحقات والتأخير")||(tab==="analytics"&&title === "تحليل سلوك العميل (Customer Analytics)")).map(([title,subgroups])=><section key={title} className="space-y-3 rounded-xl border p-3"><h3 className="rounded-lg bg-violet-100 px-3 py-2 text-sm font-bold text-violet-900">{title}</h3>{subgroups.map(([subtitle,labels])=><div key={subtitle}><h4 className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold">{subtitle}</h4><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{labels.map(label=><div key={label} className={`min-w-0 rounded-lg border border-violet-100 p-3 ${label === "أكثر الأصناف التي يشتريها" || label === "إجمالي عدد البضائع المشتراة" ? "sm:col-span-2" : ""}`}><span className="block text-xs text-slate-600">{label}</span>{label === "أكثر الأصناف التي يشتريها" && purchases.topThree.length > 0 ? <div className="mt-2 overflow-hidden rounded-lg border border-violet-100"><table className="w-full table-fixed border-collapse text-sm text-violet-900"><thead className="bg-violet-50"><tr><th scope="col" className="w-10 border-b border-violet-100 p-2 text-center">ت</th><th scope="col" className="border-b border-violet-100 p-2 text-right">البضاعة</th><th scope="col" className="w-24 border-b border-violet-100 p-2 text-center">العدد</th></tr></thead><tbody>{purchases.topThree.map(([name, count], index) => <tr key={name} className="border-b border-violet-100 last:border-b-0"><td className="p-2 text-center">{index + 1}</td><td className="break-words p-2 font-medium">{name}</td><td className="break-words p-2 text-center font-bold">{number(count)}</td></tr>)}</tbody></table></div> : <strong className="mt-2 block text-sm text-violet-900">{metricValues[label]||"غير متوفر — بيانات غير مسجلة"}</strong>}</div>)}</div></div>)}</section>)}
          {tab === "summary" && <>
            <p className="text-xs leading-5 text-slate-500">هذه الإحصائيات تخص {source === "vertical" ? "سجل الحساب العمودي" : "القائمة الحسابية المستقلة"} فقط. التسديدات في المخطط تُعرض من سنداتها المسجلة، ولا تُضاف مرة ثانية إلى إجمالي الحساب.</p>
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["المبالغ المسجلة", sales], ["التسديدات", paid], ["المتبقي", remaining], [source === "vertical" ? "عدد الكشوف" : "عدد البنود", source === "vertical" ? customerInvoices.length : saleItems.length]].map(([label, value]) => <article key={String(label)} className="min-w-0 rounded-xl border border-violet-100 bg-white p-3"><span className="block text-[10px] text-slate-500">{label}</span><strong className="mt-1 block break-words text-sm font-extrabold text-violet-900">{typeof value === "number" ? number(value) : value}{label !== "عدد الكشوف" && label !== "عدد البنود" ? ` ${currency}` : ""}</strong></article>)}
            </section>
            <MonthlyFinanceChart sales={chartSales} collections={chartCollections} title="حركة حساب العميل" currency={currency} description="المبالغ حسب تاريخ الكشف أو البند، والتسديدات حسب تاريخ سند القبض." />
            <RankingChart title="أعلى البنود قيمةً لهذا العميل" description="ترتيب حسب مجموع قيمة البنود المسجلة، دون خلط الكميات ووحداتها." items={topCustomerItems} currency={currency} color="indigo" />
            {chartSales.every(record => !validDate(record.date)) && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">لا تظهر أعمدة المبالغ الشهرية لأن سجلات هذا المصدر لا تحتوي على تواريخ صالحة. أضف تواريخ للعمليات حتى يمكن ترتيبها زمنياً.</p>}
          </>}
          {tab !== "analytics" && <button type="button" onClick={() => setExpanded(!expanded)} className="rounded-lg border px-3 py-2 text-sm font-bold">{expanded ? 'إخفاء' : 'عرض'} العمليات المكوّنة للأرقام</button>}
          {tab !== "analytics" && expanded && <div className="space-y-2 text-sm">{tab === 'business' ? <>{purchases.rows.map((row, index) => <p key={index} className="rounded-lg border p-2">{row.details || 'بضاعة غير مسماة'} · {purchaseDate(row.createdAt)}</p>)}</> : source === 'vertical' ? <>{customerInvoices.map(inv => <div key={inv.id} className="rounded-lg border p-3"><b>{inv.invoiceNumber}</b> · {inv.date}<p>المبيعات: {number(inv.grandTotal)} · المسدد: {number(inv.paidAmount)} · المتبقي: {number(inv.remainingAmount)} {currency}</p></div>)}<p className="text-xs text-slate-500">سندات القبض التالية للتدقيق؛ مبالغها مدرجة في مسدد الكشوف ولا تضاف إليه مرة ثانية.</p>{customerPayments.map(pay => <p key={pay.id}>{pay.date} · {number(pay.amount)} {currency} · {pay.method}</p>)}</> : <>{saleItems.map(row => <p key={row.id} className="rounded-lg border p-2">{row.details} · {number(row.quantity)} × {number(row.unitPrice)} = {number(row.total)} {currency}</p>)}{(customer.accountingSheetPayments || []).map(pay => <p key={pay.id}>{pay.date} · تسديد {number(pay.amount)} {currency}</p>)}</>}{saleItems.length === 0 && <p>لا توجد بنود بيع محفوظة.</p>}</div>}
        </>}
      </div>
      <footer className="border-t p-3">{error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}{editing ? <div className="flex gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'جاري الحفظ...' : 'حفظ'}</button><button type="button" disabled={saving} onClick={() => { setDraft({...customer.profile,name:customer.name,phone:customer.phone,address:customer.address || '',salaryType:customer.salaryType || ''}); setEditing(false); setError(''); }} className="rounded-lg border px-4 py-2 text-sm">إلغاء</button></div> : <button type="button" disabled={!onSave} onClick={() => {setEditing(true);setTab('personal');}} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تعديل المعلومات الشخصية</button>}</footer>
    </section>
  );
}

