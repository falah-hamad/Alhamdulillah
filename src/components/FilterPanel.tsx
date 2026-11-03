import React from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";

export function FilterButton({ activeCount, onClick, className = "" }: {
  activeCount: number;
  onClick: () => void;
  className?: string;
}) {
  return <button type="button" onClick={onClick} aria-label="فتح التصفية" title="تصفية" className={"relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 " + className}>
    <SlidersHorizontal className="h-5 w-5" />
    {activeCount > 0 && <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">{activeCount}</span>}
  </button>;
}

export function FilterPanel({ open, title, activeCount, onClose, onClear, onApply, children }: {
  open: boolean;
  title: string;
  activeCount: number;
  onClose: () => void;
  onClear: () => void;
  onApply: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" dir="rtl" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
        <div><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-0.5 text-xs text-slate-500">{activeCount ? `هناك ${activeCount} شروط مفعّلة` : "اختر الشروط التي تريد تطبيقها"}</p></div>
        <button type="button" aria-label="إغلاق التصفية" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><X className="h-5 w-5" /></button>
      </header>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4">{children}</div>
      <footer className="flex items-center justify-between gap-2 border-t bg-white p-3">
        <button type="button" onClick={onClear} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"><RotateCcw className="h-4 w-4" />مسح الكل</button>
        <button type="button" onClick={onApply} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700">عرض النتائج</button>
      </footer>
    </section>
  </div>;
}
