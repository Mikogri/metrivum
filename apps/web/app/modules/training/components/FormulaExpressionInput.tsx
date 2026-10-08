import { useId, useMemo, useRef, useState } from "react";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./FormulaExpressionInput.module.css";

/** What the server's formula language accepts (FormulaEngine): functions and literal units. */
export const FORMULA_FUNCTIONS = ["MIN", "MAX", "AVG", "IF", "ROUND_TO_STEP"] as const;
export const FORMULA_UNITS = ["kg", "lb", "s", "min", "m", "km", "%"] as const;

type Suggestion = { kind: "function" | "input" | "unit"; insert: string; label: string; detail: string };

/** The token being typed just before the caret, and what kind of suggestion fits it. */
export function tokenAt(text: string, caret: number): { start: number; prefix: string; kind: "name" | "unit" } | null {
  const before = text.slice(0, caret);
  // A number literal (not digits inside a name like e1rm) followed by an optional unit prefix.
  const unit = /(?<![A-Za-z_\d.])(\d+(?:\.\d*)?)\s*([a-z%]*)$/.exec(before);
  if (unit && /\d/.test(unit[1]!)) {
    const prefix = unit[2]!;
    return { start: caret - prefix.length, prefix, kind: "unit" };
  }
  const name = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before);
  if (name) return { start: caret - name[0].length, prefix: name[0], kind: "name" };
  return null;
}

/**
 * Formula editor with suggestions while typing: function names (with their signature), the
 * formula's own input names after letters, and units after a number. Validation and results
 * stay on the server.
 */
export function FormulaExpressionInput({
  label,
  value,
  onChange,
  inputNames,
  placeholder,
  description,
  isRequired,
  isDisabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputNames: string[];
  placeholder?: string;
  description?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
}) {
  const m = useT();
  const help = m.training.formulas.help;
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const token = open ? tokenAt(value, caret) : null;

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!token) return [];
    const p = token.prefix.toLowerCase();
    if (token.kind === "unit") {
      return FORMULA_UNITS.filter((u) => u.startsWith(p) && u !== p).map((u) => ({ kind: "unit", insert: u, label: u, detail: help.units[u] ?? "" }));
    }
    const functions: Suggestion[] = FORMULA_FUNCTIONS.filter((f) => f.toLowerCase().startsWith(p)).map((f) => ({
      kind: "function",
      insert: `${f}(`,
      label: help.signatures[f] ?? f,
      detail: help.functions[f] ?? "",
    }));
    const inputs: Suggestion[] = inputNames
      .filter((n) => n && n.toLowerCase().startsWith(p) && n !== token.prefix)
      .map((n) => ({ kind: "input", insert: n, label: n, detail: help.inputDetail }));
    return [...inputs, ...functions].slice(0, 8);
  }, [token, inputNames, help]);

  const showList = open && suggestions.length > 0 && !isDisabled;
  const listId = `${id}-list`;

  const accept = (suggestion: Suggestion) => {
    if (!token) return;
    const next = value.slice(0, token.start) + suggestion.insert + value.slice(caret);
    const position = token.start + suggestion.insert.length;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      ref.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {isRequired ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className={styles.control}>
        <textarea
          ref={ref}
          id={id}
          className={styles.input}
          value={value}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          placeholder={placeholder}
          required={isRequired}
          disabled={isDisabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-describedby={description ? `${id}-desc` : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart);
            setActive(0);
            setOpen(true);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (!showList) {
              if (event.key === " " && event.ctrlKey) {
                event.preventDefault();
                setOpen(true);
              }
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (event.key === "Enter") {
              // Not Tab: dialogs keep Tab for moving focus between fields.
              event.preventDefault();
              accept(suggestions[active]!);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        {showList ? (
          <ul id={listId} role="listbox" aria-label={help.suggestions} className={styles.list}>
            {suggestions.map((s, i) => (
              <li
                key={`${s.kind}-${s.insert}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={styles.option}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => setActive(i)}
                onClick={() => accept(s)}
              >
                <span className={styles.kind} data-kind={s.kind}>
                  {help.kinds[s.kind]}
                </span>
                <span className={styles.optionLabel}>{s.label}</span>
                <span className={styles.detail}>{s.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {description ? (
        <p id={`${id}-desc`} className={styles.description}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
