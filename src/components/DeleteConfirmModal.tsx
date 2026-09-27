import React from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export type DeleteConfirmType =
  | "folder"
  | "customer"
  | "bulk"
  | "permanent_folder"
  | "permanent_customer"
  | "permanent_bulk"
  | "empty_trash";

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  type: DeleteConfirmType;
  title?: string;
  itemName?: string;
  itemDetails?: string;
  warningMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isPermanent?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({
  isOpen,
  type,
  title,
  itemName,
  itemDetails,
  warningMessage,
  confirmLabel,
  cancelLabel = "إلغاء",
  isPermanent = false,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  // Derive default text based on type if not explicitly provided
  let defaultTitle = "تأكيد الحذف";
  let defaultQuestion = "هل أنت متأكد من حذف هذا العنصر؟";
  let defaultDetails = "";
  let defaultConfirm = isPermanent ? "حذف نهائي" : "حذف";

  if (type === "folder") {
    defaultTitle = "حذف المجلد";
    defaultQuestion = itemName
      ? `هل أنت متأكد من حذف المجلد "${itemName}"؟`
      : "هل أنت متأكد من حذف هذا المجلد؟";
    defaultDetails =
      itemDetails ||
      "سيتم نقل المجلد ومحتوياته إلى سلة المهملات، ويمكنك استعادتها في أي وقت.";
    defaultConfirm = "حذف";
  } else if (type === "customer") {
    defaultTitle = "حذف الزبون";
    defaultQuestion = itemName
      ? `هل أنت متأكد من حذف الزبون "${itemName}"؟`
      : "هل أنت متأكد من حذف هذا الزبون؟";
    defaultDetails =
      itemDetails ||
      "سيتم نقل الزبون وسجل ديونه وقوائمه إلى سلة المهملات مع الحفاظ على كامل بياناته للرجوع إليها أو استعادتها.";
    defaultConfirm = "حذف";
  } else if (type === "bulk") {
    defaultTitle = "حذف العناصر المحددة";
    defaultQuestion = itemName
      ? `هل أنت متأكد من حذف ${itemName}؟`
      : "هل أنت متأكد من حذف العناصر المحددة؟";
    defaultDetails =
      itemDetails || "سيتم نقل كافة العناصر المحددة إلى سلة المهملات.";
    defaultConfirm = "حذف";
  } else if (type === "permanent_folder") {
    defaultTitle = "حذف المجلد نهائيًا";
    defaultQuestion =
      "هل أنت متأكد من حذف هذا العنصر نهائيًا؟ لا يمكن استعادته بعد ذلك.";
    defaultDetails = itemName
      ? `سيتم حذف المجلد "${itemName}" نهائياً ولن تتمكن من استعادته.`
      : "سيتم حذف المجلد نهائياً ولن تتمكن من استعادته.";
    defaultConfirm = "حذف نهائي";
  } else if (type === "permanent_customer") {
    defaultTitle = "حذف الزبون نهائيًا";
    defaultQuestion =
      "هل أنت متأكد من حذف هذا العنصر نهائيًا؟ لا يمكن استعادته بعد ذلك.";
    defaultDetails = itemName
      ? `سيتم حذف الزبون "${itemName}" وكافة فواتيره وسجلاته نهائياً.`
      : "سيتم حذف الزبون وكافة سجلاته المالية نهائياً.";
    defaultConfirm = "حذف نهائي";
  } else if (type === "permanent_bulk") {
    defaultTitle = "حذف نهائي للمحددة";
    defaultQuestion =
      "هل أنت متأكد من حذف هذه العناصر نهائيًا؟ لا يمكن استعادتها بعد ذلك.";
    defaultDetails =
      itemDetails || "سيتم حذف العناصر المحددة نهائياً من قاعدة البيانات.";
    defaultConfirm = "حذف نهائي";
  } else if (type === "empty_trash") {
    defaultTitle = "إفراغ سلة المهملات";
    defaultQuestion =
      "هل أنت متأكد من إفراغ سلة المهملات نهائيًا؟ لا يمكن استعادتها بعد ذلك.";
    defaultDetails =
      "سيتم حذف جميع المجلدات والزبائن الموجودة في سلة المهملات نهائياً.";
    defaultConfirm = "إفراغ سلة المهملات";
  }

  const finalTitle = title || defaultTitle;
  const finalQuestion = warningMessage || defaultQuestion;
  const finalDetails = itemDetails || defaultDetails;
  const finalConfirm = confirmLabel || defaultConfirm;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.16 }}
          className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden text-right"
          dir="rtl"
          role="dialog"
          aria-modal="true"
        >
          {/* Top Bar */}
          <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl flex items-center justify-center ${
                  isPermanent
                    ? "bg-rose-100 text-rose-600"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {isPermanent ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <Trash2 className="w-5 h-5 text-rose-600" />
                )}
              </div>
              <h3 className="text-base font-black text-slate-800">
                {finalTitle}
              </h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Body */}
          <div className="p-5 space-y-3">
            <p className="text-sm font-bold text-slate-900 leading-relaxed">
              {finalQuestion}
            </p>

            {finalDetails && (
              <div
                className={`p-3 rounded-xl text-xs leading-relaxed ${
                  isPermanent
                    ? "bg-rose-50/80 border border-rose-100 text-rose-800"
                    : "bg-slate-50 border border-slate-100 text-slate-600"
                }`}
              >
                {finalDetails}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              {cancelLabel}
            </button>

            <button
              type="button"
              onClick={onConfirm}
              className={`px-5 py-2 text-xs font-black text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                isPermanent
                  ? "bg-rose-600 hover:bg-rose-700 active:bg-rose-800"
                  : "bg-rose-600 hover:bg-rose-700 active:bg-rose-800"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{finalConfirm}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
