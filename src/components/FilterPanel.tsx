import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, RotateCcw, SlidersHorizontal, X } from "lucide-react";

export function FilterSelect({ value, options, placeholder, placeholderValue, onChange, ariaLabel }: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  placeholderValue?: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState<{ top: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 0, maxHeight: 240 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);
  const showPlaceholder = placeholderValue !== undefined && value === placeholderValue;
  const label = showPlaceholder ? placeholder : selected?.label || placeholder;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const desiredHeight = Math.min(280, Math.max(52, options.length * 48 + 8), viewportHeight * 0.6);
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 12);
      const spaceAbove = Math.max(0, rect.top - 12);
      const openAbove = spaceBelow < Math.min(desiredHeight, 160) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(desiredHeight, openAbove ? spaceAbove : spaceBelow));
      const top = openAbove
        ? Math.max(8, rect.top - maxHeight - 6)
        : Math.min(rect.bottom + 6, viewportHeight - maxHeight - 8);
      const width = Math.min(rect.width, viewportWidth - 16);
      const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
      setPopup({ top, left, width, maxHeight });
    };
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) setOpen(false);
    };
    updatePosition();
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

  return <>
    <button
      ref={triggerRef}
      type="button"
      role="combobox"
      aria-label={ariaLabel}
      aria-expanded={open}
      onClick={() => setOpen(current => !current)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm text-slate-800 shadow-sm transition hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
    >
      <span className={showPlaceholder || !selected ? "truncate text-slate-500" : "truncate"}>{label}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && typeof document !== "undefined" && createPortal(
      <div
        ref={popupRef}
        role="listbox"
        aria-label={ariaLabel}
        onPointerDown={event => event.stopPropagation()}
        style={{ position: "fixed", top: popup.top, left: popup.left, width: popup.width, maxHeight: popup.maxHeight }}
        className="z-[300] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
      >
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            onClick={() => { onChange(option.value); setOpen(false); }}
            className={`block min-h-12 w-full px-4 py-3 text-right text-sm transition-colors ${option.value === value ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}
          >
            {option.label}
          </button>
        ))}
      </div>,
      document.body
    )}
  </>;
}

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

export function FilterPanel({ open, title, activeCount, onClose, onClear, onApply, children, clearLabel = "إعادة تعيين التصفية", applyLabel = "تطبيق التصفية" }: {
  open: boolean;
  title: string;
  activeCount: number;
  onClose: () => void;
  onClear: () => void;
  onApply: () => void;
  children: React.ReactNode;
  clearLabel?: string;
  applyLabel?: string;
}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" dir="rtl" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
        <div><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-0.5 text-xs text-slate-500">{activeCount ? `هناك ${activeCount} شروط مفعّلة` : "اختر الشروط التي تريد تطبيقها"}</p></div>
        <button type="button" aria-label="إغلاق التصفية" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><X className="h-5 w-5" /></button>
      </header>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4">{children}</div>
      <footer className="flex items-center justify-between gap-2 border-t bg-white p-3">
        <button type="button" onClick={onClear} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"><RotateCcw className="h-4 w-4" />{clearLabel}</button>
        <button type="button" onClick={onApply} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700">{applyLabel}</button>
      </footer>
    </section>
  </div>;
}
