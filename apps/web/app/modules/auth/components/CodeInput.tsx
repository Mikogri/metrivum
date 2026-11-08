import { useId, useRef, useState } from "react";
import styles from "./CodeInput.module.css";

/**
 * A one-time code as six boxes, one per digit. Underneath it is one real input spanning the boxes, so typing,
 * pasting a whole code, the phone's code suggestion and password managers all work as in a plain field.
 */
export function CodeInput({
  label,
  value,
  onChange,
  length = 6,
  autoFocus = false,
  isInvalid = false,
  errorMessage,
  description,
  placeholder = "000000",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  isInvalid?: boolean;
  errorMessage?: string;
  description?: string;
  placeholder?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, "").slice(0, length);
  // The box the next digit goes into; with all six filled, the last one stays marked.
  const active = Math.min(digits.length, length - 1);
  const describedBy = [description ? `${id}-description` : null, isInvalid && errorMessage ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={styles.field} data-invalid={isInvalid || undefined}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      {description ? <p id={`${id}-description`} className={styles.description}>{description}</p> : null}
      <div className={styles.boxes} style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} onMouseDown={(event) => { event.preventDefault(); input.current?.focus(); }}>
        {Array.from({ length }, (_, index) => (
          <span key={index} className={styles.box} data-filled={index < digits.length || undefined} data-active={(focused && index === active) || undefined} aria-hidden="true">
            {digits[index] ?? ""}
            {focused && index === active && index >= digits.length ? <i className={styles.caret} /> : null}
          </span>
        ))}
        <input
          ref={input}
          id={id}
          className={styles.input}
          value={digits}
          placeholder={placeholder}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length}
          autoFocus={autoFocus}
          required
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedBy}
          onFocus={(event) => { setFocused(true); const end = event.currentTarget.value.length; event.currentTarget.setSelectionRange(end, end); }}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, length))}
          onSelect={(event) => { const end = event.currentTarget.value.length; if (event.currentTarget.selectionStart !== end) event.currentTarget.setSelectionRange(end, end); }}
        />
      </div>
      {isInvalid && errorMessage ? <p id={`${id}-error`} className={styles.error} role="alert">{errorMessage}</p> : null}
    </div>
  );
}
