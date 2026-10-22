import { useEffect, useRef, useState } from "react";
import { useT } from "~/shared/i18n/AppLocale";
import { seconds } from "../model/workouts";
import styles from "./SheetCanvas.module.css";

type Part = "h" | "m" | "s";

/**
 * Segmented duration input with a fixed structure, like the birth date field: digits fill the
 * focused part and jump to the next one when it is complete. `parts` is "hms" (time) or "ms"
 * (rest; minutes then go up to 99). Arrows move or step, Backspace clears, ":" jumps forward.
 */
function DurationInput({
  parts,
  initial,
  label,
  onDone,
}: {
  parts: Part[];
  initial: number | null;
  label: string;
  onDone: (save: boolean, seconds: number) => void;
}) {
  const m = useT();
  const t = m.editor.sheet;
  const max: Record<Part, number> = { h: 23, m: parts.includes("h") ? 59 : 99, s: 59 };
  const split = (total: number): Record<Part, number> =>
    parts.includes("h") ? { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 } : { h: 0, m: Math.min(99, Math.floor(total / 60)), s: total % 60 };
  const [values, setValues] = useState<Record<Part, number>>(() => split(Math.round(initial ?? 0)));
  const latest = useRef(values);
  const [active, setActive] = useState(parts.indexOf("m"));
  const typed = useRef("");
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    refs.current[active]?.focus();
  }, [active]);

  const set = (part: Part, value: number) => {
    const next = { ...latest.current, [part]: value };
    latest.current = next;
    setValues(next);
  };
  const go = (index: number) => {
    typed.current = "";
    setActive(Math.max(0, Math.min(parts.length - 1, index)));
  };
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const v = latest.current;
    onDone(save, v.h * 3600 + v.m * 60 + v.s);
  };
  const names: Record<Part, string> = { h: t.hours, m: t.minutes, s: t.seconds };

  return (
    <div
      ref={box}
      role="group"
      aria-label={label}
      className={styles.duration}
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget as Node)) finish(true);
      }}
    >
      {parts.map((part, index) => (
        <span key={part} className={styles.durationPart}>
          {index > 0 ? <span className={styles.durationSep}>:</span> : null}
          <span
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="spinbutton"
            tabIndex={index === active ? 0 : -1}
            aria-label={names[part]}
            aria-valuemin={0}
            aria-valuemax={max[part]}
            aria-valuenow={values[part]}
            className={styles.durationSegment}
            data-focused={index === active || undefined}
            onFocus={() => {
              if (index !== active) go(index);
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              go(index);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              const key = event.key;
              if (/^\d$/.test(key)) {
                event.preventDefault();
                const digit = Number(key);
                if (typed.current === "") {
                  set(part, digit);
                  // A first digit that can't start a two-digit value completes the part.
                  if (digit * 10 > max[part]) go(index + 1);
                  else typed.current = key;
                } else {
                  const value = Number(typed.current + key);
                  set(part, value > max[part] ? digit : value);
                  go(index + 1);
                }
              } else if (key === "Backspace" || key === "Delete") {
                event.preventDefault();
                if (values[part] === 0 && typed.current === "" && key === "Backspace") go(index - 1);
                else {
                  set(part, 0);
                  typed.current = "";
                }
              } else if (key === "ArrowLeft") {
                event.preventDefault();
                go(index - 1);
              } else if (key === "ArrowRight" || key === ":" || key === "." || key === " ") {
                event.preventDefault();
                go(index + 1);
              } else if (key === "ArrowUp" || key === "ArrowDown") {
                event.preventDefault();
                const step = key === "ArrowUp" ? 1 : -1;
                set(part, (values[part] + step + max[part] + 1) % (max[part] + 1));
                typed.current = "";
              } else if (key === "Tab" && !event.shiftKey && index < parts.length - 1) {
                event.preventDefault();
                go(index + 1);
              } else if (key === "Tab" && event.shiftKey && index > 0) {
                event.preventDefault();
                go(index - 1);
              } else if (key === "Enter") {
                event.preventDefault();
                finish(true);
              } else if (key === "Escape") {
                event.preventDefault();
                finish(false);
              }
            }}
          >
            {String(values[part]).padStart(2, "0")}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Time (h:mm:ss) or rest (m:ss) cell: shows "1:30", edits with the segmented input. */
export function DurationCell({
  value,
  stored,
  parts,
  label,
  placeholder,
  title,
  readOnly,
  style,
  className,
  onCommit,
}: {
  value: string;
  stored: { value: number | string; unit: string } | null | undefined;
  parts: "hms" | "ms";
  label: string;
  placeholder?: string;
  title?: string;
  readOnly: boolean;
  style: React.CSSProperties;
  className?: string;
  onCommit: (text: string) => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const cell = useRef<HTMLDivElement>(null);

  if (editing) {
    return (
      <div className={`${styles.cell} ${styles.cellInput} ${styles.clockEdit}`} style={style} data-no-drag onKeyDown={(event) => event.stopPropagation()}>
        <DurationInput
          parts={[...parts] as Part[]}
          initial={seconds(stored)}
          label={label}
          onDone={(save, total) => {
            if (save) {
              const pad = (n: number) => String(n).padStart(2, "0");
              const h = Math.floor(total / 3600);
              const mm = Math.floor((total % 3600) / 60);
              const text = total === 0 ? "" : h ? `${h}:${pad(mm)}:${pad(total % 60)}` : `${Math.floor(total / 60)}:${pad(total % 60)}`;
              if (text !== value) onCommit(text);
            }
            setEditing(false);
            requestAnimationFrame(() => cell.current?.focus({ preventScroll: true }));
          }}
        />
      </div>
    );
  }
  return (
    <div
      ref={cell}
      role="gridcell"
      tabIndex={readOnly ? -1 : 0}
      className={`${styles.cell} ${readOnly ? "" : styles.editable} ${className ?? ""}`}
      style={style}
      title={title}
      aria-label={`${label}: ${value || "—"}`}
      aria-readonly={readOnly || undefined}
      data-no-drag
      onClick={() => !readOnly && setEditing(true)}
      onKeyDown={(event) => {
        if (readOnly) return;
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          event.stopPropagation();
          setEditing(true);
        }
      }}
    >
      {value || <span className={styles.cellPlaceholder}>{placeholder}</span>}
    </div>
  );
}

