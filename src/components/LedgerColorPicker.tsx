import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Palette, X } from "lucide-react";

const COLOR_GROUPS = [
  { name: "ألوان هادئة", colors: ["#ffffff", "#f8fafc", "#e2e8f0", "#fdf6e3", "#fef3c7", "#ffedd5", "#ffe4e6", "#fce7f3", "#f3e8ff", "#ede9fe", "#e0e7ff", "#dbeafe", "#e0f2fe", "#cffafe", "#ccfbf1", "#d1fae5", "#dcfce7", "#ecfccb"] },
  { name: "ألوان زاهية", colors: ["#f59e0b", "#f97316", "#ef4444", "#f43f5e", "#ec4899", "#d946ef", "#a855f7", "#8b5cf6", "#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6", "#10b981", "#22c55e", "#84cc16", "#eab308", "#64748b"] },
  { name: "ألوان داكنة", colors: ["#111827", "#000000", "#334155", "#475569", "#78350f", "#9a3412", "#991b1b", "#9f1239", "#9d174d", "#86198f", "#6b21a8", "#5b21b6", "#3730a3", "#1e40af", "#075985", "#155e75", "#115e59", "#065f46"] },
];

export function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (/^[a-f\d]{3}$/i.test(hex)) return "#" + [...hex].map(char => char + char).join("").toLowerCase();
  return /^[a-f\d]{6}$/i.test(hex) ? "#" + hex.toLowerCase() : null;
}

interface Props {
  label: string;
  value: string;
  onChange: (color: string) => void;
  textColors?: boolean;
}

export default function LedgerColorPicker({ label, value, onChange, textColors = false }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:border-blue-400">
      <span>{label}</span><span className="h-6 w-7 rounded-md border border-black/15" style={{ backgroundColor: value }} aria-hidden="true" /><Palette className="h-3.5 w-3.5" />
    </button>
    {open && createPortal(<ColorDialog label={label} value={value} textColors={textColors} onApply={color => { onChange(color); setOpen(false); }}
      onClose={() => setOpen(false)} restoreFocus={() => triggerRef.current?.focus()} />, document.body)}
  </>;
}

function ColorDialog({ label, value, textColors, onApply, onClose, restoreFocus }: {
  label: string; value: string; textColors: boolean; onApply: (color: string) => void; onClose: () => void; restoreFocus: () => void;
}) {
  const [draft, setDraft] = useState(normalizeHex(value) || "#ffffff");
  const [hexInput, setHexInput] = useState(draft);
  const [custom, setCustom] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hexId = useId();
  const validHex = normalizeHex(hexInput);
  const rgb = [1, 3, 5].map(index => parseInt(draft.slice(index, index + 2), 16));
  const previewBackground = textColors && (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) > 170 ? "#1e293b" : "#f8fafc";
  const selectColor = (color: string) => { setDraft(color); setHexInput(color); };
  const updateChannel = (index: number, value: number) => {
    const next = [...rgb]; next[index] = value;
    selectColor("#" + next.map(channel => channel.toString(16).padStart(2, "0")).join(""));
  };
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.focus();
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')) as HTMLElement[];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyDown);
    return () => { document.removeEventListener("keydown", keyDown); document.body.style.overflow = previousOverflow; restoreFocus(); };
    // The dialog is mounted for one picker session; callbacks belong to its trigger.
  }, []);
  const groups = textColors ? [COLOR_GROUPS[2], COLOR_GROUPS[1], COLOR_GROUPS[0]] : COLOR_GROUPS;
  return <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/50 p-3 no-print" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} dir="rtl"
      className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 id={titleId} className="flex items-center gap-2 text-sm font-bold text-slate-800"><Palette className="h-5 w-5 text-violet-600" />{label}</h3>
        <button type="button" onClick={onClose} aria-label="إغلاق لوحة الألوان" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3" style={{ backgroundColor: textColors ? previewBackground : draft }}>
          <span className="rounded-md bg-white px-2 py-1 text-sm font-bold" style={{ color: textColors ? draft : "#334155", backgroundColor: textColors ? previewBackground : "#ffffff" }}>معاينة اللون</span>
          <span dir="ltr" className="rounded-md bg-white px-2 py-1 font-mono text-xs text-slate-700">{draft.toUpperCase()}</span>
        </div>
        {groups.map(group => <section key={group.name}>
          <h4 className="mb-2 text-xs font-bold text-slate-600">{group.name}</h4>
          <div className="grid grid-cols-9 gap-2">{group.colors.map(color => <button key={color} type="button" aria-label={`اختيار اللون ${color}`} aria-pressed={draft === color} title={color}
            onClick={() => selectColor(color)} className={`flex aspect-square min-h-6 items-center justify-center rounded-lg border border-black/10 ${draft === color ? "ring-2 ring-blue-600 ring-offset-2" : "hover:ring-2 hover:ring-slate-300"}`} style={{ backgroundColor: color }}>
            {draft === color && <Check className="h-4 w-4 rounded-full bg-white text-blue-700" />}
          </button>)}</div>
        </section>)}
        <button type="button" aria-expanded={custom} aria-controls={`${hexId}-custom`} onClick={() => setCustom(previous => !previous)} className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800">لون مخصص</button>
        {custom && <div id={`${hexId}-custom`} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">حرّك المؤشرات أو اكتب رمز اللون.</p>
          {['الأحمر R', 'الأخضر G', 'الأزرق B'].map((name, index) => <label key={name} className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-16 shrink-0">{name}</span><input type="range" min={0} max={255} value={rgb[index]} onChange={event => updateChannel(index, Number(event.target.value))} className="min-w-0 flex-1 accent-violet-600" />
            <span className="w-7 text-center tabular-nums" dir="ltr">{rgb[index]}</span>
          </label>)}
          <label htmlFor={hexId} className="block text-xs font-bold text-slate-700">رمز اللون HEX</label>
          <input id={hexId} type="text" value={hexInput} dir="ltr" autoComplete="off" spellCheck={false} maxLength={7} aria-invalid={!validHex}
            onChange={event => { const next = event.target.value; setHexInput(next); const color = normalizeHex(next); if (color) setDraft(color); }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center font-mono text-base text-slate-800 outline-none focus:border-violet-500" placeholder="#14b8a6" />
          {!validHex && <p role="alert" className="text-xs text-rose-700">أدخل رمزًا صحيحًا مثل #14B8A6 أو #ABC.</p>}
        </div>}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50 p-3">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">إلغاء</button>
        <button type="button" disabled={!validHex} onClick={() => { if (validHex) onApply(validHex); }} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">تطبيق اللون</button>
      </div>
    </div>
  </div>;
}
