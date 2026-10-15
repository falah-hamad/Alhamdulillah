import { Capacitor, registerPlugin } from "@capacitor/core";
import { recordDownloadedFile } from "../lib/downloads";

interface NativePrintPlugin {
  printHtml(options: { html: string; title: string }): Promise<void>;
  downloadHtmlPdf(options: { html: string; title: string }): Promise<{ uri?: string; fileName?: string; base64?: string }>;
}


const NativePrint = registerPlugin<NativePrintPlugin>("NativePrint");

/** Small non-blocking confirmation for direct PDF downloads in the browser. */
function showPdfSavedToast(message = "تم تنزيل ملف PDF بنجاح"): void {
  if (typeof document === "undefined") return;
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:24px",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "max-width:calc(100vw - 32px)",
    "padding:12px 18px",
    "border-radius:12px",
    "background:#166534",
    "color:#ffffff",
    "font:600 14px/1.5 system-ui,sans-serif",
    "text-align:center",
    "box-shadow:0 8px 24px rgba(0,0,0,.2)",
  ].join(";");
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

/**
 * Comprehensive Print & PDF Export Utilities for Debt Receipts & Accounting Sheets
 * Ensures zero blank pages, seamless multi-page printing, complete data rendering,
 * and eliminates content cutoff across all browsers.
 */

/**
 * Mathematical conversion from OKLCH to sRGB [0-255].
 * Guarantees true color fidelity and eliminates dependencies on browser canvas parsers.
 */
function oklchToRgb(l: number, c: number, h: number, a: number = 1): [number, number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a_ = c * Math.cos(hRad);
  const b_ = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a_ + 0.2158037573 * b_;
  const m_ = l - 0.1055613458 * a_ - 0.0638541728 * b_;
  const s_ = l - 0.0894841775 * a_ - 1.291485548 * b_;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  let r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let b = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(Math.max(0, r), 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(Math.max(0, g), 1 / 2.4) - 0.055;
  b = b <= 0.0031308 ? 12.92 * b : 1.055 * Math.pow(Math.max(0, b), 1 / 2.4) - 0.055;

  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return [clamp(r), clamp(g), clamp(b), a];
}

/**
 * Mathematical conversion from OKLAB to sRGB [0-255].
 */
function oklabToRgb(l: number, aVal: number, bVal: number, alpha: number = 1): [number, number, number, number] {
  const l_ = l + 0.3963377774 * aVal + 0.2158037573 * bVal;
  const m_ = l - 0.1055613458 * aVal - 0.0638541728 * bVal;
  const s_ = l - 0.0894841775 * aVal - 1.291485548 * bVal;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  let r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(Math.max(0, r), 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(Math.max(0, g), 1 / 2.4) - 0.055;
  bl = bl <= 0.0031308 ? 12.92 * bl : 1.055 * Math.pow(Math.max(0, bl), 1 / 2.4) - 0.055;

  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return [clamp(r), clamp(g), clamp(bl), alpha];
}

const _colorCache = new Map<string, string>();

/**
 * Robustly converts any modern CSS color string (oklch, oklab) into standard rgb()/rgba().
 * html2canvas only supports rgb, rgba, hsl, hsla, and hex tokens.
 */
export function sanitizeColorString(val: string): string {
  if (!val || typeof val !== "string") return val;
  if (!val.includes("oklch") && !val.includes("oklab")) return val;

  if (_colorCache.has(val)) return _colorCache.get(val)!;

  let res = val.replace(/oklch\(\s*([^\s)]+)\s+([^\s)]+)\s+([^\s)/]+)(?:\s*\/\s*([^\s)]+))?\s*\)/gi, (_full, lStr, cStr, hStr, aStr) => {
    let l = parseFloat(lStr);
    if (lStr.endsWith("%")) l = l / 100;
    let c = parseFloat(cStr);
    if (cStr.endsWith("%")) c = (c / 100) * 0.4;
    let h = parseFloat(hStr);
    if (hStr.endsWith("rad")) h = (h * 180) / Math.PI;
    else if (hStr.endsWith("turn")) h = h * 360;
    let a = 1;
    if (aStr) {
      a = parseFloat(aStr);
      if (aStr.endsWith("%")) a = a / 100;
    }
    if (isNaN(l)) l = 0.5;
    if (isNaN(c)) c = 0;
    if (isNaN(h)) h = 0;
    if (isNaN(a)) a = 1;
    const [r, g, b, alpha] = oklchToRgb(l, c, h, a);
    return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
  });

  if (res.includes("oklab")) {
    res = res.replace(/oklab\(\s*([^\s)]+)\s+([^\s)]+)\s+([^\s)/]+)(?:\s*\/\s*([^\s)]+))?\s*\)/gi, (_full, lStr, aStr, bStr, alphaStr) => {
      let l = parseFloat(lStr);
      if (lStr.endsWith("%")) l = l / 100;
      let aVal = parseFloat(aStr);
      let bVal = parseFloat(bStr);
      let a = 1;
      if (alphaStr) {
        a = parseFloat(alphaStr);
        if (alphaStr.endsWith("%")) a = a / 100;
      }
      if (isNaN(l)) l = 0.5;
      if (isNaN(aVal)) aVal = 0;
      if (isNaN(bVal)) bVal = 0;
      if (isNaN(a)) a = 1;
      const [r, g, b, alpha] = oklabToRgb(l, aVal, bVal, a);
      return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
    });
  }

  // Safety net: if any oklch/oklab token could not be parsed, replace with safe neutral
  if (res.includes("oklch") || res.includes("oklab")) {
    res = res.replace(/(oklch|oklab)\([^)]+\)/gi, "#1e293b");
  }

  _colorCache.set(val, res);
  return res;
}

/**
 * Creates a proxy over getComputedStyle to intercept modern CSS colors
 * (e.g. oklch from Tailwind v4) and supply safe RGB/Hex to html2canvas.
 */
function createComputedStyleProxy(originalGetComputedStyle: typeof window.getComputedStyle) {
  return function (elt: Element, pseudoElt?: string | null) {
    const win = elt.ownerDocument?.defaultView || window;
    const style = originalGetComputedStyle.call(win, elt, pseudoElt);
    return new Proxy(style, {
      get(target, prop: string | symbol) {
        if (prop === "getPropertyValue") {
          return (propName: string) => {
            const raw = target.getPropertyValue(propName);
            return typeof raw === "string" ? sanitizeColorString(raw) : raw;
          };
        }
        const val = (target as any)[prop];
        if (typeof val === "function") {
          return val.bind(target);
        }
        if (typeof val === "string") {
          return sanitizeColorString(val);
        }
        return val;
      },
    });
  };
}

/**
 * Sanitizes a cloned DOM element for PDF export:
 * - Converts input/textarea values to vector text
 * - Removes .no-print interactive controls
 * - Normalizes letter spacing for Arabic text
 * - Ensures visibility and un-transforms 3D rotations
 */
export function sanitizeClonedPage(clonedEl: HTMLElement): void {
  // 1. Sync all input and textarea values into styled vector spans
  const inputs = clonedEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  inputs.forEach((target) => {
    const span = document.createElement("span");
    span.className = target.className;
    let text = target.value || "";
    if (!text.trim() && target.placeholder && target.placeholder !== "0" && !target.placeholder.includes("...")) {
      text = target.placeholder;
    }
    span.textContent = text || (target.placeholder === "0" ? "0" : "—");
    span.style.cssText = target.style.cssText;
    span.style.display = "inline-block";
    span.style.width = target.style.width || "100%";
    span.style.background = "transparent";
    span.style.border = "none";
    span.style.outline = "none";
    span.style.letterSpacing = "normal";
    span.style.textAlign = target.className.includes("text-center") ? "center" : "right";
    span.style.fontWeight = "700";
    span.style.fontSize = target.style.fontSize || "13px";
    target.parentNode?.replaceChild(span, target);
  });

  // 2. Remove purely interactive elements and controls marked with no-print
  clonedEl.querySelectorAll(".no-print, [data-no-print='true'], .active-row-controls").forEach((node) => {
    node.remove();
  });

  // Remove action buttons (add row, move row, delete row, edit mode toggle)
  clonedEl.querySelectorAll("button.no-print, [id^='btn-toolbar-'], [id^='btn-insert-'], [id^='btn-move-'], [id^='btn-delete-'], [id^='btn-clear-']").forEach((node) => {
    node.remove();
  });

  // 3. Neutralize any tracking or letter-spacing to prevent Arabic letter disconnection and sanitize inline styles
  clonedEl.querySelectorAll("*").forEach((el) => {
    if (el instanceof HTMLElement) {
      el.style.letterSpacing = "normal";
      const inlineStyle = el.getAttribute("style");
      if (inlineStyle && (inlineStyle.includes("oklch") || inlineStyle.includes("oklab"))) {
        el.setAttribute("style", sanitizeColorString(inlineStyle));
      }
    }
  });

  // 4. Ensure cloned page is visible, without 3D rotation
  clonedEl.style.display = "block";
  clonedEl.style.visibility = "visible";
  clonedEl.style.opacity = "1";
  clonedEl.style.transform = "none";
}

/**
 * Prepares and sanitizes a DOM element for printing or PDF export:
 * - Clones the DOM tree.
 * - Replaces interactive <input> and <textarea> elements with high-contrast text spans containing their current values.
 * - Removes interactive buttons, hover controls, and .no-print elements.
 * - Resets fixed min-heights, shadows, and overflow constraints so the layout flows naturally.
 */
export function preparePrintableClone(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;

  // 1. Sync all input and textarea values into styled vector spans
  const origInputs = element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  const cloneInputs = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");

  origInputs.forEach((orig, idx) => {
    const target = cloneInputs[idx];
    if (target) {
      const computed = window.getComputedStyle(orig);
      const span = document.createElement("span");
      span.className = target.className;

      // Extract current active value
      let text = orig.value || "";
      if (!text.trim() && target.placeholder && target.placeholder !== "0" && !target.placeholder.includes("...")) {
        text = target.placeholder;
      }

      span.textContent = text || (target.placeholder === "0" ? "0" : "—");
      span.style.cssText = target.style.cssText;
      span.style.display = "inline-block";
      span.style.width = target.style.width || "100%";
      span.style.background = "transparent";
      span.style.border = "none";
      span.style.outline = "none";
      span.style.letterSpacing = "normal";
      span.style.textAlign = target.className.includes("text-center")
        ? "center"
        : (computed.textAlign || "right");
      // Preserve original text color (e.g., emerald-800 for paid, slate-900 for amount)
      span.style.color = computed.color || "#0f172a";
      span.style.fontWeight = computed.fontWeight || "700";
      span.style.fontSize = orig.style.fontSize || computed.fontSize || "13px";
      span.style.fontFamily = computed.fontFamily || "inherit";

      target.parentNode?.replaceChild(span, target);
    }
  });

  // Neutralize any tracking or letter-spacing on all cloned elements to prevent Arabic letter disconnection
  clone.querySelectorAll("*").forEach((el) => {
    if (el instanceof HTMLElement) {
      el.style.letterSpacing = "normal";
    }
  });

  // 2. Remove purely interactive elements and controls marked with no-print
  clone.querySelectorAll(".no-print, [data-no-print='true'], .active-row-controls").forEach((node) => {
    node.remove();
  });

  // Remove action buttons (add row, move row, delete row, edit mode toggle) but keep non-interactive badges
  clone.querySelectorAll("button.no-print, [id^='btn-toolbar-'], [id^='btn-insert-'], [id^='btn-move-'], [id^='btn-delete-'], [id^='btn-clear-']").forEach((node) => {
    node.remove();
  });

  // 3. Keep authentic card styling from preview: amber border, rounded corners, authentic background, and dynamic height
  const origComputed = window.getComputedStyle(element);
  if (element.style.backgroundColor) {
    clone.style.backgroundColor = element.style.backgroundColor;
  } else if (origComputed.backgroundColor && origComputed.backgroundColor !== "rgba(0, 0, 0, 0)") {
    clone.style.backgroundColor = origComputed.backgroundColor;
  }

  clone.style.minHeight = "0";
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.boxShadow = "none";
  if (element.id === "vertical-ledger-sheet") {
    clone.style.border = "1.5px solid rgba(120, 53, 15, 0.25)";
    clone.style.borderRadius = "16px";
    clone.style.padding = "24px 28px";
  }
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  clone.style.margin = "0 auto";

  return clone;
}

/**
 * Prints a receipt voucher or ledger sheet reliably via a dedicated layout-aware iframe.
 * Uses real HTML/CSS Print Layout (Vector DOM) matching the in-app preview identically.
 * Adapts dynamically to content height without bottom clipping or blank pages.
 */
export async function printElement(
  elementOrId: HTMLElement | string,
  options: { title?: string; onComplete?: () => void; download?: boolean } = {}
): Promise<void> {
  const element =
    typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;

  if (!element) {
    console.warn("Print target element not found, falling back to window.print()");
    window.print();
    if (options.onComplete) options.onComplete();
    return;
  }

  const title = options.title || "طباعة وصل الدين";

  const preparedClone = preparePrintableClone(element);

  // Collect active style tags and stylesheets.
  // A standalone Android WebView cannot rely on the app WebView's asset interceptor,
  // so inline same-origin stylesheet rules as a fallback for native printing.
  const styles: string[] = [];
  document.querySelectorAll("style, link[rel='stylesheet']").forEach((node) => {
    styles.push(node.outerHTML);

    if (Capacitor.isNativePlatform() && node instanceof HTMLLinkElement && node.sheet) {
      try {
        const rules = Array.from((node.sheet as CSSStyleSheet).cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
        if (rules) styles.push("<style>" + rules + "</style>");
      } catch {
        // Cross-origin stylesheets (for example Google Fonts) remain linked above.
      }
    }
  });

  // Create an iframe with real layout dimensions (A4 width 210mm) and opacity 0
  const iframeId = "print-frame-" + Date.now();
  const iframe = document.createElement("iframe");
  iframe.id = iframeId;
  iframe.style.position = "fixed";
  iframe.style.top = "0";
  iframe.style.left = "0";
  iframe.style.width = "210mm";
  iframe.style.minHeight = "297mm";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.zIndex = "-99999";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    window.print();
    iframe.remove();
    if (options.onComplete) options.onComplete();
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet">
      ${styles.join("\n")}
      <style>
        ${element.id === "vertical-ledger-sheet" ? "@page { size: A4 portrait; margin: 0; }" : "@page { size: A4 portrait; margin: 8mm; }"}
        *, *::before, *::after {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          letter-spacing: 0 !important;
          word-spacing: normal !important;
          font-feature-settings: "liga" 1, "calt" 1, "rlig" 1, "clig" 1 !important;
          text-rendering: optimizeLegibility !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #0f172a !important;
          font-family: 'Cairo', 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif !important;
          direction: rtl !important;
          text-align: right !important;
          letter-spacing: 0 !important;
          word-spacing: normal !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
        }
        .print-voucher-wrapper {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: transparent !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
        }

        /* Typography & Numbers - Complete Arabic Script Preservation */
        .font-mono {
          font-family: 'JetBrains Mono', monospace !important;
        }
        .font-sans,
        h1, h2, h3, h4, h5, h6,
        p, span, div, th, td, label {
          font-family: 'Cairo', 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif !important;
          letter-spacing: normal !important;
        }
        /* Neutralize all tracking classes from breaking Arabic cursive script */
        [class*="tracking-"] {
          letter-spacing: normal !important;
        }

        /* Authentic Vertical Ledger Sheet Layout & Fidelity */
        #vertical-ledger-sheet {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          border: 1.5px solid rgba(120, 53, 15, 0.25) !important;
          border-radius: 16px !important;
          padding: 24px 28px !important;
          box-shadow: none !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
          page-break-inside: auto !important;
          break-inside: auto !important;
          display: block !important;
          position: static !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* Header Layout: logo, store name, customer info */
        #ledger-sheet-brand-header {
          border-bottom: 2px solid rgba(120, 53, 15, 0.25) !important;
          padding-bottom: 14px !important;
          margin-bottom: 16px !important;
        }

        #ledger-sheet-brand-header .flex-col,
        #ledger-sheet-brand-header .sm\\:flex-row {
          flex-direction: row !important;
          align-items: center !important;
          justify-content: space-between !important;
        }

        /* CSS Grid 12-column preservation */
        .grid {
          display: grid !important;
        }
        .grid-cols-12 {
          display: grid !important;
          grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
        }
        .col-span-1 { grid-column: span 1 / span 1 !important; width: auto !important; }
        .col-span-2 { grid-column: span 2 / span 2 !important; width: auto !important; }
        .col-span-3 { grid-column: span 3 / span 3 !important; width: auto !important; }
        .col-span-4 { grid-column: span 4 / span 4 !important; width: auto !important; }
        .col-span-5 { grid-column: span 5 / span 5 !important; width: auto !important; }
        .col-span-6 { grid-column: span 6 / span 6 !important; width: auto !important; }
        .col-span-7 { grid-column: span 7 / span 7 !important; width: auto !important; }
        .col-span-8 { grid-column: span 8 / span 8 !important; width: auto !important; }
        .col-span-9 { grid-column: span 9 / span 9 !important; width: auto !important; }
        .col-span-10 { grid-column: span 10 / span 10 !important; width: auto !important; }
        .col-span-11 { grid-column: span 11 / span 11 !important; width: auto !important; }
        .col-span-12 { grid-column: span 12 / span 12 !important; width: auto !important; }

        /* Row and Separator Borders */
        .border-b {
          border-bottom-width: 1px !important;
        }
        .border-b-2 {
          border-bottom-width: 2px !important;
        }

        /* Specific border colors matching preview */
        .border-amber-900\\\/30 {
          border-color: rgba(120, 53, 15, 0.3) !important;
        }
        .border-amber-900\\\/25 {
          border-color: rgba(120, 53, 15, 0.25) !important;
        }
        .border-amber-900\\\/20 {
          border-color: rgba(120, 53, 15, 0.2) !important;
        }
        .border-amber-900\\\/15 {
          border-color: rgba(120, 53, 15, 0.15) !important;
        }
        .border-amber-900\\\/10 {
          border-color: rgba(120, 53, 15, 0.12) !important;
        }

        /* Cumulative separator styling */
        .separator-line {
          height: 1.5px !important;
          background-color: rgba(51, 65, 85, 0.85) !important;
          border-radius: 9999px !important;
          margin: 6px 0 !important;
        }

        /* Prevent individual rows from splitting mid-page */
        [id^="row-"],
        [id^="sep-"],
        tr,
        .ledger-row {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        /* Hide interactive non-printable elements */
        .no-print,
        [data-no-print="true"],
        .active-row-controls {
          display: none !important;
        }

        #vertical-ledger-sheet .a4-page {
          /* Keep the full sheet inside the printer's reliable printable area.
             Center it on A4 so neither side is clipped by browser/printer margins. */
          width: 194mm !important;
          max-width: 194mm !important;
          height: 274.2mm !important;
          min-height: 274.2mm !important;
          max-height: 274.2mm !important;
          padding: 5.87mm 7.82mm !important;
          margin: 0 auto !important;
          box-sizing: border-box !important;
          page-break-after: always !important;
          break-after: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        #vertical-ledger-sheet .a4-page:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
      </style>
    </head>
    <body>
      <div class="print-voucher-wrapper">
        ${preparedClone.outerHTML}
      </div>
    </body>
    </html>
  `;

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // Android prints the prepared HTML directly through the native print framework.
  // Do not wait for the hidden iframe's fonts/paint: the native WebView has its own
  // page-finished callback and this avoids a stalled export on Android.
  if (Capacitor.isNativePlatform()) {
    iframe.remove();

    // The standalone native print WebView does not have Capacitor's asset
    // interceptor. Remove stylesheet links and rely on the CSS rules embedded
    // above, so printing does not silently lose its layout when /assets URLs
    // cannot be resolved from the separate WebView.
    const nativeHtmlContent = htmlContent
      .replace(/<link\b[^>]*>/gi, "")
      .replace(/@import\s+(?:url\([^)]*\)|[^;]+);?/gi, "");

    try {
      if (options.download) {
        // A native bridge that never resolves must not leave the UI in
        // "downloading" forever. The native side may still finish later, but
        // this timeout releases the caller and exposes a useful error.
        let timeoutId: number | undefined;
        let result: Awaited<ReturnType<typeof NativePrint.downloadHtmlPdf>>;
        try {
          result = await Promise.race([
            NativePrint.downloadHtmlPdf({ html: nativeHtmlContent, title }),
            new Promise<never>((_, reject) => {
              timeoutId = window.setTimeout(
                () => reject(new Error("انتهت مهلة إنشاء PDF على أندرويد بعد 45 ثانية. لم يستجب مكوّن التنزيل؛ أعد المحاولة، وإذا تكرر الخطأ أرسل سجل البناء والتشغيل.")),
                45_000
              );
            }),
          ]);
        } finally {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        }

        if (!result.base64) {
          throw new Error(
            `مكوّن أندرويد لم يُرجع بيانات PDF. الملف: ${result.fileName || title}; المسار: ${result.uri || "غير متوفر"}`
          );
        }
        // Accept either a raw Base64 payload or a data URL, then pass only
        // the raw payload to Blob decoding.
        const cleanBase64 = result.base64.replace(/^data:application\/pdf;base64,/i, "").replace(/\\s/g, "");
        let binary: string;
        try {
          binary = atob(cleanBase64);
        } catch (decodeError) {
          throw new Error("وصلت بيانات PDF من أندرويد لكنها ليست Base64 صالحاً: " +
            (decodeError instanceof Error ? decodeError.message : String(decodeError)));
        }
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
          throw new Error("البيانات المستلمة لا تحتوي على ترويسة PDF صالحة.");
        }
        const fileName = result.fileName || `${title.replace(/\.pdf$/i, "")}.pdf`;
        const pdfBlob = new Blob([bytes], { type: "application/pdf" });
        try {
          await recordDownloadedFile(fileName, pdfBlob, "تقرير");
        } catch (storageError) {
          console.warn("PDF saved by Android, but in-app download history failed:", storageError);
        }
      } else {
        await NativePrint.printHtml({ html: nativeHtmlContent, title });
      }
      options.onComplete?.();
      return;
    } catch (error) {
      console.error("Android native print failed:", error);
      const detail = error instanceof Error ? error.message : String(error || error);
      const message = detail || "سبب الخطأ غير معروف. تحقق من نسخة التطبيق وسجل التشغيل.";
      window.alert("تعذر إنشاء ملف PDF على Android. السبب: " + message);
      throw new Error(message);
    }
  }

  try {
    // 1. Wait for web fonts in the iframe
    if (doc.fonts && doc.fonts.ready) {
      await doc.fonts.ready;
    }
  } catch (_e) {
    // Continue even if fonts API is unavailable
  }

  // 2. Wait for all image assets in the iframe
  const imgs = Array.from(doc.images);
  if (imgs.length > 0) {
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 800); // Safety fallback
          })
      )
    );
  }

  // 3. Double requestAnimationFrame to ensure browser layout and paint cycles are fully executed
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 200));

  // 4. Trigger browser print. Android has already returned through its native path above.
  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch (err) {
    console.error("Iframe print invocation failed, using window.print()", err);
    window.print();
  } finally {
    // Remove iframe after print dialog completes
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (_e) {
        // ignore
      }
      if (options.onComplete) options.onComplete();
    }, 1200);
  }
}

/**
 * Creates a downloadable PDF without opening the print dialog.
 * Android uses the native WebView vector PDF adapter; web uses a high-resolution
 * DOM capture so the document is saved immediately and also stored in Downloads.
 */
export async function exportElementToPDF(
  elementOrId: HTMLElement | string,
  options: { filename: string; title?: string }
): Promise<void> {
  const element = typeof elementOrId === "string"
    ? document.getElementById(elementOrId)
    : elementOrId;
  if (!element) throw new Error("العنصر المطلوب تصديره غير موجود");

  const requestedName = (options.filename || options.title || "Alhamdulillah")
    .trim()
    .replace(/\.pdf$/i, "");
  const title = requestedName || "Alhamdulillah";
  const fileName = `${title}.pdf`;

  if (Capacitor.isNativePlatform()) {
    await printElement(element, { title, download: true });
    return;
  }

  // Web browsers do not expose the native print pipeline as a downloadable PDF
  // byte stream. Render the prepared DOM at high resolution and paginate it
  // directly with jsPDF instead of opening the print dialog.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const clone = preparePrintableClone(element);
  clone.id = `pdf-export-clone-${Date.now()}`;
  const computed = window.getComputedStyle(element);
  const renderHost = document.createElement("div");
  renderHost.setAttribute("aria-hidden", "true");
  renderHost.style.cssText = [
    "position:fixed",
    "left:-100000px",
    "top:0",
    `width:${Math.max(element.getBoundingClientRect().width, 794)}px`,
    "background:#ffffff",
    "z-index:-1",
    "pointer-events:none",
  ].join(";");
  clone.style.width = "100%";
  clone.style.maxWidth = "none";
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.backgroundColor = computed.backgroundColor === "rgba(0, 0, 0, 0)"
    ? "#ffffff"
    : computed.backgroundColor;
  renderHost.appendChild(clone);
  document.body.appendChild(renderHost);

  let pdfBlob: Blob;
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(Array.from(clone.querySelectorAll("img")).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        window.setTimeout(resolve, 2500);
      })
    ));

    // Tailwind v4 emits OKLCH colors, which html2canvas 1.x cannot parse.
    // Temporarily normalize computed colors while html2canvas reads the DOM.
    const originalGetComputedStyle = window.getComputedStyle;
    let canvas: HTMLCanvasElement;
    try {
      window.getComputedStyle = createComputedStyleProxy(originalGetComputedStyle) as typeof window.getComputedStyle;
      canvas = await html2canvas(clone, {
        scale: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)),
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        width: clone.scrollWidth,
        height: clone.scrollHeight,
        windowWidth: Math.max(clone.scrollWidth, 794),
        onclone: (clonedDocument) => {
          const clonedTarget = clonedDocument.getElementById(clone.id);
          if (clonedTarget instanceof HTMLElement) sanitizeClonedPage(clonedTarget);
        },
      });
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }

    if (!canvas.width || !canvas.height) throw new Error("المستند فارغ ولا يمكن تحويله إلى PDF");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = element.id === "vertical-ledger-sheet" ? 0 : 8;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const renderedHeight = (canvas.height * usableWidth) / canvas.width;
    const pageCanvasHeight = Math.max(1, Math.floor((usableHeight / renderedHeight) * canvas.height));
    let sourceY = 0;
    let pageIndex = 0;

    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext("2d");
      if (!context) throw new Error("تعذر تجهيز صفحة PDF");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (pageIndex > 0) pdf.addPage("a4", "portrait");
      const sliceMmHeight = (sliceHeight * usableWidth) / canvas.width;
      pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.96), "JPEG", margin, margin, usableWidth, sliceMmHeight, undefined, "FAST");
      sourceY += sliceHeight;
      pageIndex += 1;
    }

    pdfBlob = pdf.output("blob");
  } finally {
    renderHost.remove();
  }

  if (!pdfBlob.size || pdfBlob.type !== "application/pdf") {
    throw new Error("لم يتم إنشاء ملف PDF صالح");
  }

  // Trigger the real browser download even if optional in-app IndexedDB tracking is blocked.
  // Some browser privacy/storage settings can reject IndexedDB without preventing downloads.
  try {
    await recordDownloadedFile(fileName, pdfBlob, "تقرير");
  } catch (storageError) {
    console.warn("PDF created, but could not save it to the in-app downloads list:", storageError);
  }
  const url = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  showPdfSavedToast();
}
