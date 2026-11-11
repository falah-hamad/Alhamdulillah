import React, { useEffect, useRef, useState } from "react";
import { formatNumericInput } from "../utils/numberFormatting";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type?: string;
  value?: string | number | readonly string[];
  defaultValue?: string | number;
};

/** A text-backed numeric field that displays grouping but emits an unformatted value. */
export default function FormattedNumberInput({
  type: _type,
  value,
  defaultValue,
  onChange,
  onBlur,
  inputMode,
  ...props
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const externalValue = value !== undefined ? String(value) : defaultValue === undefined ? "" : String(defaultValue);
  const [displayValue, setDisplayValue] = useState(() => formatNumericInput(externalValue));

  useEffect(() => {
    if (!focusedRef.current) setDisplayValue(formatNumericInput(externalValue));
  }, [externalValue]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const oldValue = input.value;
    const caret = input.selectionStart ?? oldValue.length;
    const digitsBeforeCaret = oldValue.slice(0, caret).replace(/[^\d]/g, "").length;
    const rawValue = oldValue.replace(/,/g, "");
    const formatted = formatNumericInput(rawValue);
    setDisplayValue(formatted);
    input.value = rawValue;
    onChange?.(event);
    input.value = formatted;
    requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      let nextCaret = 0;
      let digitsSeen = 0;
      while (nextCaret < formatted.length && digitsSeen < digitsBeforeCaret) {
        if (/\d/.test(formatted[nextCaret])) digitsSeen++;
        nextCaret++;
      }
      input.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false;
    const input = event.currentTarget;
    const rawValue = input.value.replace(/,/g, "");
    input.value = rawValue;
    onBlur?.(event);
    const formatted = formatNumericInput(rawValue);
    input.value = formatted;
    setDisplayValue(formatted);
  };

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode={inputMode ?? "decimal"}
      value={displayValue}
      onFocus={(event) => {
        focusedRef.current = true;
        props.onFocus?.(event);
      }}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
