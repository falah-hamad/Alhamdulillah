import React, { useMemo } from "react";
import { ExternalLink, Check, Copy, User } from "lucide-react";
import { Customer } from "../../types";

interface FormattedMessageContentProps {
  content: string;
  customers?: Customer[];
  onSelectCustomerForLedger?: (customerId: string) => void;
  fontFamily?: string;
  fontSize?: string;
}

export default function FormattedMessageContent({
  content,
  customers = [],
  onSelectCustomerForLedger,
}: FormattedMessageContentProps) {
  // Normalize customers map for quick lookup
  const customersByName = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => {
      if (c.name) {
        map.set(c.name.trim().toLowerCase(), c);
      }
    });
    return map;
  }, [customers]);

  // Parse markdown-like content into structured elements
  const renderedElements = useMemo(() => {
    if (!content) return null;

    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let tableRows: string[][] = [];
    let inTable = false;

    const flushTable = (keyPrefix: number) => {
      if (tableRows.length === 0) return null;
      const [header, ...body] = tableRows;
      const tableElem = (
        <div key={`table-${keyPrefix}`} className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xs">
          <table className="w-full text-right text-xs sm:text-sm">
            {header && (
              <thead className="bg-slate-100 dark:bg-slate-700/70 border-b border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold">
                <tr>
                  {header.map((col, idx) => (
                    <th key={`th-${idx}`} className="py-2.5 px-3">
                      {col.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {body.map((row, rIdx) => (
                <tr
                  key={`tr-${rIdx}`}
                  className={rIdx % 2 === 0 ? "bg-white dark:bg-slate-800" : "bg-slate-50/50 dark:bg-slate-800/40"}
                >
                  {row.map((cell, cIdx) => (
                    <td key={`td-${rIdx}-${cIdx}`} className="py-2 px-3 text-slate-700 dark:text-slate-300">
                      {formatInlineText(cell.trim(), customersByName, onSelectCustomerForLedger)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
      return tableElem;
    };

    lines.forEach((rawLine, idx) => {
      const line = rawLine.trim();

      // Table line detection
      if (line.startsWith("|") && line.endsWith("|")) {
        const parts = line.split("|").slice(1, -1);
        // Skip separator row like |---|---|
        if (parts.every((p) => /^[\s-:]+$/.test(p))) {
          return;
        }
        tableRows.push(parts);
        inTable = true;
        return;
      } else if (inTable) {
        const tbl = flushTable(idx);
        if (tbl) elements.push(tbl);
      }

      // Empty line
      if (!line) {
        elements.push(<div key={`spacer-${idx}`} className="h-2" />);
        return;
      }

      // Headers
      if (line.startsWith("### ")) {
        elements.push(
          <h3
            key={`h3-${idx}`}
            className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-3 mb-1.5 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-700/60 pb-1"
          >
            {formatInlineText(line.replace("### ", ""), customersByName, onSelectCustomerForLedger)}
          </h3>
        );
        return;
      }

      if (line.startsWith("## ")) {
        elements.push(
          <h2
            key={`h2-${idx}`}
            className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-4 mb-2 pb-1 border-b border-slate-300 dark:border-slate-700"
          >
            {formatInlineText(line.replace("## ", ""), customersByName, onSelectCustomerForLedger)}
          </h2>
        );
        return;
      }

      // Bullet lists
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const text = line.substring(2);
        elements.push(
          <div key={`li-${idx}`} className="flex items-start gap-2 my-1 text-slate-800 dark:text-slate-200 leading-relaxed pr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 mt-2 shrink-0" />
            <div className="flex-1">
              {formatInlineText(text, customersByName, onSelectCustomerForLedger)}
            </div>
          </div>
        );
        return;
      }

      // Numbered lists
      const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        elements.push(
          <div key={`nli-${idx}`} className="flex items-start gap-2 my-1 text-slate-800 dark:text-slate-200 leading-relaxed pr-1">
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0 mt-0.5">
              {numberedMatch[1]}
            </span>
            <div className="flex-1">
              {formatInlineText(numberedMatch[2], customersByName, onSelectCustomerForLedger)}
            </div>
          </div>
        );
        return;
      }

      // Regular paragraph
      elements.push(
        <p key={`p-${idx}`} className="my-1 text-slate-800 dark:text-slate-200 leading-relaxed">
          {formatInlineText(line, customersByName, onSelectCustomerForLedger)}
        </p>
      );
    });

    if (inTable) {
      const tbl = flushTable(lines.length);
      if (tbl) elements.push(tbl);
    }

    return elements;
  }, [content, customersByName, onSelectCustomerForLedger]);

  return <div className="space-y-0.5 text-inherit leading-relaxed">{renderedElements}</div>;
}

/**
 * Format inline text: bold, mentions (@Customer), currencies, and numbers
 */
function formatInlineText(
  text: string,
  customersByName: Map<string, Customer>,
  onSelectCustomerForLedger?: (customerId: string) => void
): React.ReactNode[] {
  if (!text) return [];

  // Match bold **text** or @mentions
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|@[^\s,،.:;!?()]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      const inner = token.slice(2, -2);
      // Check if inner is customer name
      const foundCustomer = customersByName.get(inner.trim().toLowerCase());
      if (foundCustomer && onSelectCustomerForLedger) {
        parts.push(
          <button
            key={`cust-btn-${match.index}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectCustomerForLedger(foundCustomer.id);
            }}
            title="انتقل إلى كشف حساب العميل في دفتر الديون"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:hover:bg-blue-800 text-blue-800 dark:text-blue-200 font-bold text-xs sm:text-sm transition-colors border border-blue-300 dark:border-blue-700 cursor-pointer"
          >
            <User className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <span>{inner}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </button>
        );
      } else {
        parts.push(
          <strong key={`b-${match.index}`} className="font-bold text-slate-950 dark:text-white">
            {inner}
          </strong>
        );
      }
    } else if (token.startsWith("@")) {
      const name = token.slice(1);
      const foundCustomer = customersByName.get(name.trim().toLowerCase());
      if (foundCustomer && onSelectCustomerForLedger) {
        parts.push(
          <button
            key={`mention-${match.index}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectCustomerForLedger(foundCustomer.id);
            }}
            title="فتح دفتر ديون هذا العميل"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-full bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:hover:bg-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold text-xs transition-colors border border-emerald-300 dark:border-emerald-700 cursor-pointer"
          >
            <span>@{name}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </button>
        );
      } else {
        parts.push(
          <span key={`mention-raw-${match.index}`} className="font-semibold text-blue-600 dark:text-blue-400">
            {token}
          </span>
        );
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}
