import {
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./FormulaExpressionInput.module.css";

export const FORMULA_FUNCTIONS = [
  "MIN",
  "MAX",
  "AVG",
  "ROUND_TO_STEP_LOWER",
  "ROUND_TO_STEP_UPPER",
] as const;
/** Compact labels keep the canonical function names in stored expressions. */
export const functionLabel = (name: string) =>
  name === "ROUND_TO_STEP_LOWER"
    ? "ROUND↓"
    : name === "ROUND_TO_STEP_UPPER"
      ? "ROUND↑"
      : name;
export const FORMULA_UNITS = ["kg", "lb", "s", "min", "m", "km", "%"] as const;
type Suggestion = {
  kind: "function" | "input" | "unit";
  insert: string;
  label: string;
  detail: string;
};
type Control = HTMLInputElement | HTMLTextAreaElement;

export function tokenAt(
  text: string,
  caret: number,
): {
  start: number;
  prefix: string;
  kind: "name" | "unit" | "variable";
} | null {
  const before = text.slice(0, caret);
  const variable = /(?:^|[=(,*+\s])\/([A-Za-z_][A-Za-z0-9_]*|)$/.exec(before);
  if (variable)
    return {
      start: caret - variable[1]!.length - 1,
      prefix: variable[1]!,
      kind: "variable",
    };
  if (before.trim() === "=") return { start: caret, prefix: "", kind: "name" };
  const unit = /(?<![A-Za-z_\d.])(\d+(?:\.\d*)?)\s*([a-z%]*)$/.exec(before);
  if (unit && /\d/.test(unit[1]!)) {
    const prefix = unit[2]!;
    return { start: caret - prefix.length, prefix, kind: "unit" };
  }
  const name = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before);
  return name
    ? { start: caret - name[0].length, prefix: name[0], kind: "name" }
    : null;
}

/** Suggestions edit text only; the server owns parsing, validation and evaluation. */
export function FormulaExpressionInput({
  label,
  value,
  onChange,
  inputNames,
  placeholder,
  description,
  isRequired,
  isDisabled,
  compact = false,
  autoFocus,
  onKeyDown,
  onFocus,
  suppressSuggestions = false,
  renderSuggestions,
  externalSuggestions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputNames: string[];
  placeholder?: string;
  description?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  compact?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (event: KeyboardEvent<Control>) => void;
  onFocus?: () => void;
  suppressSuggestions?: boolean;
  renderSuggestions?: (list: ReactNode) => ReactNode;
  externalSuggestions?: { listId: string; activeId?: string; open: boolean };
}) {
  const m = useT();
  const help = m.training.formulas.help;
  const id = useId();
  const ref = useRef<Control | null>(null);
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const token = open && !suppressSuggestions ? tokenAt(value, caret) : null;
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!token) return [];
    const p = token.prefix.toLowerCase();
    if (token.kind === "unit" && compact && !p) return [];
    if (token.kind === "unit")
      return FORMULA_UNITS.filter((u) => u.startsWith(p) && u !== p).map(
        (u) => ({
          kind: "unit",
          insert: u,
          label: u,
          detail: help.units[u] ?? "",
        }),
      );
    const functions: Suggestion[] = (
      token.kind === "variable" ? [] : FORMULA_FUNCTIONS
    )
      .filter((f) => f.toLowerCase().startsWith(p))
      .map((f) => ({
        kind: "function",
        insert: `${f}(`,
        label: (help.signatures[f] ?? f).replace(f, functionLabel(f)),
        detail: help.functions[f] ?? "",
      }));
    const inputs: Suggestion[] = inputNames
      .filter((n) => n && n.toLowerCase().startsWith(p) && n !== token.prefix)
      .map((n) => ({
        kind: "input",
        insert: n,
        label: n,
        detail: help.inputDetail,
      }));
    return [...inputs, ...functions].slice(0, 8);
  }, [token, inputNames, help, compact]);
  const showList = open && suggestions.length > 0 && !isDisabled;
  const listId = `${id}-list`;
  const accept = (suggestion: Suggestion) => {
    if (!token) return;
    const next =
      value.slice(0, token.start) + suggestion.insert + value.slice(caret);
    const position = token.start + suggestion.insert.length;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      ref.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  };
  const controlProps = {
    id,
    className: styles.input,
    value,
    autoFocus,
    spellCheck: false,
    autoComplete: "off",
    placeholder,
    required: isRequired,
    disabled: isDisabled,
    role: "combobox" as const,
    "aria-autocomplete": "list" as const,
    "aria-expanded": showList || Boolean(externalSuggestions?.open),
    "aria-controls": externalSuggestions?.open
      ? externalSuggestions.listId
      : listId,
    "aria-activedescendant": externalSuggestions?.open
      ? externalSuggestions.activeId
      : showList
        ? `${listId}-${active}`
        : undefined,
    "aria-describedby": description ? `${id}-desc` : undefined,
    onFocus,
    onChange: (event: ChangeEvent<Control>) => {
      onChange(event.target.value);
      setCaret(event.target.selectionStart ?? 0);
      setActive(0);
      setOpen(true);
    },
    onSelect: (event: React.SyntheticEvent<Control>) =>
      setCaret(event.currentTarget.selectionStart ?? 0),
    onBlur: () => setOpen(false),
    onKeyDown: (event: KeyboardEvent<Control>) => {
      if (!showList) {
        if (event.key === " " && event.ctrlKey) {
          event.preventDefault();
          setOpen(true);
        }
        onKeyDown?.(event);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        accept(suggestions[Math.min(active, suggestions.length - 1)]!);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        onKeyDown?.(event);
      } else onKeyDown?.(event);
    },
  };
  const list = showList ? (
    <ul
      id={listId}
      role="listbox"
      aria-label={help.suggestions}
      className={styles.list}
    >
      {suggestions.map((suggestion, i) => (
        <li
          key={`${suggestion.kind}-${suggestion.insert}`}
          id={`${listId}-${i}`}
          role="option"
          aria-label={suggestion.label}
          aria-selected={i === active}
          className={styles.option}
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onPointerMove={() => setActive(i)}
          onClick={() => accept(suggestion)}
        >
          <span className={styles.kind} data-kind={suggestion.kind}>
            {help.kinds[suggestion.kind]}
          </span>
          <span className={styles.optionLabel}>{suggestion.label}</span>
          <span className={styles.detail}>{suggestion.detail}</span>
        </li>
      ))}
    </ul>
  ) : null;
  return (
    <div className={styles.field} data-compact={compact || undefined}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {isRequired ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className={styles.control}>
        {compact ? (
          <input
            {...controlProps}
            ref={(element) => {
              ref.current = element;
            }}
          />
        ) : (
          <textarea
            {...controlProps}
            rows={3}
            ref={(element) => {
              ref.current = element;
            }}
          />
        )}
        {list ? (renderSuggestions ? renderSuggestions(list) : list) : null}
      </div>
      {description ? (
        <p id={`${id}-desc`} className={styles.description}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
