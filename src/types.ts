export interface CustomerFolder {
  id: string;
  userId?: string;
  name: string;
  color?: string;
  createdAt: string;
  parentId?: string | null; // ID of parent folder, or null/undefined if root
  isFavorite?: boolean; // المفضلة للوصول السريع
  isDeleted?: boolean; // هل تم نقل المجلد لسلة المهملات
  deletedAt?: string; // تاريخ ووقت النقل للمهملات
  originalParentId?: string | null; // المسار الأصلي قبل الحذف للاستعادة الدقيقة
}

export interface Customer {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  address?: string;
  createdAt: string;
  folderId?: string; // Optional folder/group reference
  sequence?: number; // التسلسل المستقل للمدين داخل الحافظة
  isDeleted?: boolean; // هل تم نقل الزبون لسلة المهملات
  deletedAt?: string; // تاريخ ووقت النقل للمهملات
  originalFolderId?: string | null; // المجلد الأصلي للزبون للاستعادة الدقيقة
}

export interface Product {
  id: string;
  userId?: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  category: string;
  barcode?: string;
}

export interface InvoiceItem {
  id: string;
  details: string; // Product name or custom detail
  productId?: string; // Optional reference to standard product
  quantity: number;
  unitPrice: number;
  total: number;
  isSeparator?: boolean; // When true, represents a separator/calculation block
  paidAmount?: number; // Amount paid/received for this separator block
  subtotal?: number; // Auto-calculated subtotal of items before this separator
  remainingAmount?: number; // Auto-calculated remaining (subtotal - paidAmount)
  paidDate?: string; // تاريخ السداد / الاستلام (مثال: 2026-09-09)
  paidTime?: string; // وقت وساعة السداد (مثال: 11:30 صباحاً)
  paidDay?: string; // يوم السداد (مثال: الأربعاء)
  paidNote?: string; // ملاحظات الواصل / طريقة الدفع
  deliveryDate?: string; // تاريخ التوصيل
  deliveryTime?: string; // وقت وساعة التوصيل
  deliveryNotes?: string; // تفاصيل التسليم والتوصيل
  isPaymentRow?: boolean;
  isRemainingRow?: boolean;
  pageNumber?: number; // رقم الصفحة في دفتر وكشف الديون (A4 Page 1, Page 2...)
  isLoggedDebt?: boolean; // هل تم تسجيل إضافة هذا البند في سجل التغييرات
  isLoggedPaid?: boolean; // هل تم تسجيل إضافة هذا الواصل في سجل التغييرات
  [key: string]: any; // To support custom columns!
}

export interface Invoice {
  id: string;
  userId?: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  items: InvoiceItem[];
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate?: string; // تاريخ استحقاق السداد (مثال: 2026-07-15)
  notes?: string;
  employeeName?: string;
  signature?: string;
  createdAt: string;
  columns?: { id: string; label: string; type: string; width?: string }[];
  pageCount?: number; // عدد صفحات وصل الدين (A4 Pages Count)
  isDeleted?: boolean;
  deletedAt?: string;
}

export interface Payment {
  id: string;
  userId?: string;
  customerId: string;
  customerName: string;
  amount: number;
  date: string;
  method: string; // نقدي, تحويل بنكي, شيك, مدى, إلخ
  notes?: string;
  invoiceId?: string; // Optional link to an invoice
  createdAt: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

export type Folder = CustomerFolder;

export interface SystemSettings {
  userId?: string;
  companyName: string;
  companyPhone: string;
  companyAddress: string;
  currency: string;
  logoUrl?: string;
  signaturePlaceholder?: string;
}

export type ChangeLogActionType =
  | "إضافة دين"
  | "حذف دين"
  | "إضافة واصل"
  | "حذف واصل"
  | "استرجاع عملية";

export interface CustomerChangeLogItem {
  id: string;
  userId?: string;
  customerId: string;
  invoiceId?: string;
  actionType: ChangeLogActionType;
  details: string; // مثال: "نايلون — 25,000 د.ع" أو "55,000 د.ع"
  rawAmount?: number;
  itemName?: string;
  timestamp: string; // ISO string
  formattedDateTime: string; // مثال: "15/09/2026 — 10:30"
  targetItemId?: string; // معرف الصف أو الفاصلة لتسهيل الاسترجاع
  previousState?: any; // البيانات السابقة لإتاحة الاسترجاع الدقيق
}

export interface CloudBackupItem {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  stats: string;
  payloadJson: string;
}

export type NotificationCategory =
  | "debts"          // الديون
  | "payments"       // الدفعات
  | "due_debts"      // المستحقات والمتأخرات
  | "backup"         // النسخ الاحتياطي
  | "account"        // الحساب والأمان
  | "system_updates" // تحديثات التطبيق
  | "general";       // عامة

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: NotificationCategory;
  isRead: boolean;
  createdAt: string; // ISO string
  data?: Record<string, any>;
}


