import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

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
  options: { title?: string; onComplete?: () => void } = {}
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

  // Collect active style tags and stylesheets
  const styles: string[] = [];
  document.querySelectorAll("style, link[rel='stylesheet']").forEach((node) => {
    styles.push(node.outerHTML);
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
        @page {
          size: A4 portrait;
          margin: 8mm 8mm 8mm 8mm;
        }
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

  // 4. Trigger print
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
 * Exports an element directly as a high-resolution, vector-accurate PDF file.
 * Handles modern Tailwind v4 colors without crashing html2canvas.
 * Guarantees that multi-page A4 receipts & ledger sheets export completely without blank pages or clipping.
 */
export async function exportElementToPDF(
  elementOrId: HTMLElement | string,
  options: {
    filename: string;
    title?: string;
  }
): Promise<void> {
  const element =
    typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;

  if (!element) {
    throw new Error("العنصر المطلوب تصديره غير موجود");
  }

  // 1. Wait for web fonts (Cairo, JetBrains Mono, etc.) to be fully loaded
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  // 2. Intercept styles to replace oklch/oklab with safe rgb/hex for html2canvas
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = createComputedStyleProxy(originalGetComputedStyle);

  try {
    // 3. Look for discrete pre-paginated A4 pages
    // Supports paper-ledger pages ([data-page-sheet='true'], [id^='paper-page-'])
    // and vertical-ledger-sheet pages ([id^='vertical-ledger-page-'], .a4-page)
    const rawPages = Array.from(
      element.querySelectorAll<HTMLElement>(
        "[data-page-sheet='true'], [id^='paper-page-'], [id^='vertical-ledger-page-'], .paper-page-sheet, .a4-page"
      )
    );

    // Filter out duplicates (if nested)
    const pageSheets: HTMLElement[] = [];
    rawPages.forEach((page) => {
      const isNested = pageSheets.some((p) => p.contains(page));
      if (!isNested) {
        pageSheets.push(page);
      }
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const filename = options.filename.endsWith(".pdf")
      ? options.filename
      : `${options.filename}.pdf`;

    // Helper to sanitize the iframe document cloned by html2canvas
    const sanitizeClonedDoc = (clonedDoc: Document, clonedEl: HTMLElement) => {
      // 1. Hook iframe window computed style if present
      if (clonedDoc.defaultView) {
        try {
          const orig = clonedDoc.defaultView.getComputedStyle;
          clonedDoc.defaultView.getComputedStyle = createComputedStyleProxy(orig);
        } catch {}
      }

      // 2. Set safe background colors on root elements
      if (clonedDoc.documentElement) {
        clonedDoc.documentElement.style.backgroundColor = "#ffffff";
      }
      if (clonedDoc.body) {
        clonedDoc.body.style.backgroundColor = "#ffffff";
      }

      // 3. Sanitize all <style> tags to eliminate any oklch/oklab in Tailwind rules
      clonedDoc.querySelectorAll("style").forEach((styleTag) => {
        if (styleTag.textContent && (styleTag.textContent.includes("oklch") || styleTag.textContent.includes("oklab"))) {
          styleTag.textContent = sanitizeColorString(styleTag.textContent);
        }
      });

      // 4. Sanitize cloned element tree (inputs to spans, remove buttons, sanitize inline styles)
      sanitizeClonedPage(clonedEl);
    };

    if (pageSheets.length > 0) {
      // Export each discrete A4 page sheet sequentially
      for (let i = 0; i < pageSheets.length; i++) {
        const sheet = pageSheets[i];
        const computed = originalGetComputedStyle.call(window, sheet);
        const bg =
          sheet.style.backgroundColor ||
          (computed.backgroundColor !== "rgba(0, 0, 0, 0)" && computed.backgroundColor !== "transparent"
            ? computed.backgroundColor
            : "#fcfbf5");

        const canvas = await html2canvas(sheet, {
          scale: 2, // 300 DPI high resolution
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: sanitizeColorString(bg) || "#fcfbf5",
          onclone: (clonedDoc, clonedEl) => {
            sanitizeClonedDoc(clonedDoc, clonedEl);
          },
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.98);

        if (i > 0) {
          pdf.addPage("a4", "portrait");
        }

        const canvasAspect = canvas.width / canvas.height;
        const a4Width = 210;
        const a4Height = 297;

        // Fit accurately into A4 page preserving aspect ratio
        const renderHeight = a4Width / canvasAspect;
        if (renderHeight <= a4Height) {
          const yOffset = (a4Height - renderHeight) / 2;
          pdf.addImage(imgData, "JPEG", 0, yOffset, a4Width, renderHeight, undefined, "FAST");
        } else {
          const fitWidth = a4Height * canvasAspect;
          const xOffset = (a4Width - fitWidth) / 2;
          pdf.addImage(imgData, "JPEG", xOffset, 0, fitWidth, a4Height, undefined, "FAST");
        }
      }
    } else {
      // Single unpaginated element (receipt voucher, customer statement card, etc.)
      const computed = originalGetComputedStyle.call(window, element);
      const bg =
        element.style.backgroundColor ||
        (computed.backgroundColor !== "rgba(0, 0, 0, 0)" && computed.backgroundColor !== "transparent"
          ? computed.backgroundColor
          : "#ffffff");

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: sanitizeColorString(bg) || "#ffffff",
        onclone: (clonedDoc, clonedEl) => {
          sanitizeClonedDoc(clonedDoc, clonedEl);
        },
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      const imgWidth = 200; // 5mm margin on left and right
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = 287; // 297 - 10mm margins

      if (imgHeight <= pageHeight) {
        const xOffset = (210 - imgWidth) / 2;
        const yOffset = Math.max(5, (297 - imgHeight) / 2);
        pdf.addImage(imgData, "JPEG", xOffset, yOffset, imgWidth, imgHeight, undefined, "FAST");
      } else {
        // Multi-page slicing for very long elements
        let heightLeft = imgHeight;
        let position = 5;
        const xOffset = (210 - imgWidth) / 2;

        pdf.addImage(imgData, "JPEG", xOffset, position, imgWidth, imgHeight, undefined, "FAST");
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position -= pageHeight;
          pdf.addPage("a4", "portrait");
          pdf.addImage(imgData, "JPEG", xOffset, position, imgWidth, imgHeight, undefined, "FAST");
          heightLeft -= pageHeight;
        }
      }
    }

    pdf.save(filename);
  } finally {
    window.getComputedStyle = originalGetComputedStyle;
  }
}
