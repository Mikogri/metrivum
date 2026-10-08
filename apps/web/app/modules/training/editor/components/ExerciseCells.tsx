import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ExerciseInstance, TrainingDocument } from "@trainflow/api-client-web";
import { ContextMenu } from "@trainflow/ui-web";
import { useDictionaryLabel, useExerciseList } from "~/modules/exercises";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { useDebounced } from "~/shared/lib/useDebounced";
import { updateNode } from "../model/document";
import { LOAD_UNITS, exerciseRow, loadOf, seconds, setExerciseDuration, setExerciseLoad, setExerciseReps, setExerciseSets, type LoadUnit } from "../model/workouts";
import styles from "./SheetCanvas.module.css";

/**
 * Exercise cells shared by the sheet's expanded cycle and the simple editor: one row per exercise
 * with the exercise (typed, with suggestions), sets, reps, load, time, rest and comment. A single
 * click starts typing; Enter or leaving saves, Escape cancels. Every value is optional.
 */

export type Apply = (fn: (doc: TrainingDocument) => TrainingDocument) => void;

/** Runs a document update that may be rejected (invalid text) and reports whether it applied. */
export function tryApply(apply: Apply | undefined, fn: (doc: TrainingDocument) => TrainingDocument | null): boolean {
  let ok = false;
  apply?.((doc) => {
    const next = fn(doc);
    ok = next !== null;
    return next ?? doc;
  });
  return ok;
}

/**
 * A text cell: shows the value, becomes an input on click, Enter or F2 (or when you start typing).
 * Invalid text stays in edit mode, marked. `allowed` limits which characters can be typed.
 */
export function TextCell({
  value,
  label,
  placeholder,
  title,
  readOnly,
  onCommit,
  style,
  className,
  allowed,
  inputMode,
}: {
  value: string;
  label: string;
  placeholder?: string;
  title?: string;
  readOnly: boolean;
  onCommit: (text: string) => boolean;
  style: React.CSSProperties;
  className?: string;
  allowed?: RegExp;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing !== null) input.current?.focus();
  }, [editing !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    if (editing === null) return;
    if (editing === value || onCommit(editing)) {
      setEditing(null);
      setInvalid(false);
    } else setInvalid(true);
  };
  const start = (text: string) => {
    // Typing a disallowed key does nothing; existing values always open (they were valid when saved).
    if (allowed && text.length === 1 && !allowed.test(text)) return;
    setEditing(text);
  };

  if (editing !== null) {
    return (
      <input
        ref={input}
        className={`${styles.cell} ${styles.cellInput} ${className ?? ""}`}
        style={style}
        value={editing}
        inputMode={inputMode}
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        data-no-drag
        onChange={(event) => {
          const next = event.target.value;
          if (allowed && [...next].some((ch) => !allowed.test(ch))) return;
          setEditing(next);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setEditing(null);
            setInvalid(false);
          }
        }}
      />
    );
  }
  return (
    <div
      role="gridcell"
      tabIndex={readOnly ? -1 : 0}
      className={`${styles.cell} ${readOnly ? "" : styles.editable} ${className ?? ""}`}
      style={style}
      title={title}
      aria-label={`${label}: ${value || "—"}`}
      aria-readonly={readOnly || undefined}
      data-no-drag
      onClick={() => !readOnly && start(value)}
      onKeyDown={(event) => {
        if (readOnly) return;
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          event.stopPropagation();
          start(value);
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          start(event.key);
        }
      }}
    >
      {value || <span className={styles.cellPlaceholder}>{placeholder}</span>}
    </div>
  );
}

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

/** A cell that opens a small menu at itself (load, comment). */
export function MenuCell({
  value,
  label,
  placeholder,
  readOnly,
  style,
  className,
  onOpen,
}: {
  value: string;
  label: string;
  placeholder?: string;
  readOnly: boolean;
  style: React.CSSProperties;
  className?: string;
  onOpen: (rect: DOMRect) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.cell} ${readOnly ? "" : styles.editable} ${className ?? ""}`}
      style={style}
      aria-label={`${label}: ${value || "—"}`}
      aria-haspopup="menu"
      title={value || undefined}
      disabled={readOnly}
      data-no-drag
      onClick={(event) => onOpen(event.currentTarget.getBoundingClientRect())}
    >
      {value || <span className={styles.cellPlaceholder}>{placeholder}</span>}
    </button>
  );
}

/**
 * Exercise cell with suggestions: type in the cell (name or muscle), pick from the list under it.
 * Text that was typed but not picked keeps the cell red until an exercise is chosen or it is cleared.
 */
export function ExerciseCell({
  name,
  mode,
  readOnly,
  style,
  idleStyle,
  startOpen = false,
  onPick,
}: {
  name: string;
  mode: "replace" | "add";
  readOnly: boolean;
  /** Grid area while typing. */
  style: React.CSSProperties;
  /** Grid area while idle, if different (the "+ Exercise" button takes one cell). */
  idleStyle?: React.CSSProperties;
  /** Opens typing right away (e.g. "Add exercise" from a menu). */
  startOpen?: boolean;
  onPick: (exerciseId: string) => void;
}) {
  const m = useT();
  const t = m.editor.sheet;
  const dictionaryLabel = useDictionaryLabel();
  const [text, setText] = useState<string | null>(startOpen ? "" : null);
  const [open, setOpen] = useState(startOpen);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const search = useDebounced(text ?? "", 180);
  const list = useExerciseList({ search: search.trim() || undefined, sort: "name", page: 1, pageSize: 12 }, text !== null && open);
  const items = list.data?.items ?? [];
  const invalid = text !== null && !open && text.trim() !== "";
  const listId = useRef(`ex-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (text !== null && open) input.current?.focus();
  }, [text !== null, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (initial: string) => {
    setText(initial);
    setOpen(true);
    setActive(0);
  };
  const pick = (id: string) => {
    onPick(id);
    setText(null);
    setOpen(false);
  };
  const add = mode === "add";

  if (text === null) {
    return (
      <button
        type="button"
        className={`${styles.cell} ${add ? styles.addExercise : `${styles.exerciseCell} ${readOnly ? "" : styles.editable}`}`}
        style={idleStyle ?? style}
        aria-label={add ? t.addExercise : `${t.columns.exercise}: ${name}`}
        disabled={readOnly}
        data-no-drag
        onClick={() => begin(add ? "" : name)}
        onKeyDown={(event) => {
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            begin(event.key);
          }
        }}
      >
        {add ? (
          <>
            <Plus aria-hidden="true" />
            {t.addExercise}
          </>
        ) : (
          name
        )}
      </button>
    );
  }

  return (
    <div className={styles.exerciseEdit} style={style} data-no-drag>
      <input
        ref={input}
        className={`${styles.cell} ${styles.cellInput}`}
        value={text}
        role="combobox"
        aria-label={t.columns.exercise}
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        title={invalid ? t.exerciseNotChosen : undefined}
        placeholder={t.searchExercise}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          if ((text ?? "").trim() === "" || (!add && text === name)) setText(null);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(items.length - 1, i + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (items[active]) pick(items[active].id);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setText(null);
            setOpen(false);
          }
        }}
      />
      {open ? (
        <ul id={listId} role="listbox" aria-label={t.searchExercise} className={styles.suggest}>
          {items.length === 0 && !list.isPending ? <li className={styles.popEmpty}>{t.noExercises}</li> : null}
          {items.map((exercise, i) => (
            <li
              key={exercise.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={styles.popOption}
              onPointerMove={() => setActive(i)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pick(exercise.id)}
            >
              <span className={styles.suggestName}>{exercise.name}</span>
              {exercise.primaryMuscleKeys?.length ? (
                <span className={styles.suggestMeta}>{exercise.primaryMuscleKeys.map((key) => dictionaryLabel("muscles", key)).join(", ")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LoadEditor({ instance, onApply }: { instance: ExerciseInstance; onApply: (unit: LoadUnit, text: string) => boolean }) {
  const m = useT();
  const t = m.editor.sheet;
  const locale = useLocale();
  const current = loadOf(instance.sets[0]?.prescription ?? {});
  const [unit, setUnit] = useState<LoadUnit>(current.unit);
  const [text, setText] = useState(current.value === null ? "" : new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(current.value));
  const [invalid, setInvalid] = useState(false);
  const submit = () => (onApply(unit, text) ? undefined : setInvalid(true));
  return (
    <div className={styles.popForm}>
      <div className={styles.unitRow} role="radiogroup" aria-label={t.columns.load}>
        {LOAD_UNITS.map((u) => (
          <button key={u} type="button" role="radio" aria-checked={unit === u} className={styles.unit} onClick={() => setUnit(u)}>
            {t.loadUnits[u]}
          </button>
        ))}
      </div>
      <input
        className={styles.popInput}
        inputMode="decimal"
        aria-label={t.loadValue}
        aria-invalid={invalid || undefined}
        placeholder={unit === "rir" ? "2" : unit === "rpe" ? "8" : "60"}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className={styles.popActions}>
        <button type="button" className={styles.popGhost} onClick={() => onApply(unit, "")}>
          {t.clear}
        </button>
        <button type="button" className={styles.popPrimary} onClick={submit}>
          {t.apply}
        </button>
      </div>
    </div>
  );
}

export type ExerciseColumn = "exercise" | "sets" | "reps" | "load" | "time" | "rest" | "comment";

/**
 * One exercise as a row of cells. `cells` gives each column's grid placement; the row keeps its own
 * load and comment popups. Right click on the row (outside inputs) calls `onContextMenu`.
 */
export function ExerciseRow({
  instance,
  name,
  cells,
  readOnly,
  apply,
  onContextMenu,
  entering = false,
  children,
}: {
  instance: ExerciseInstance;
  name: string;
  cells: Record<ExerciseColumn, React.CSSProperties>;
  readOnly: boolean;
  apply?: Apply;
  onContextMenu?: (event: React.MouseEvent) => void;
  /** Just revealed (its workout was unfolded): the cells fade in. */
  entering?: boolean;
  /** Extra cells after the comment (e.g. the row's ⋮ menu in the simple editor). */
  children?: React.ReactNode;
}) {
  const m = useT();
  const t = m.editor.sheet;
  const locale = useLocale();
  const [popup, setPopup] = useState<{ kind: "load" | "comment"; rect: DOMRect } | null>(null);
  const values = exerciseRow(locale, instance, (key) => m.training.formulas.builtInNames[key] ?? key);
  const mixed = values.mixed ? styles.mixedCell : undefined;
  const p = instance.sets[0]?.prescription;

  return (
    <div
      role="row"
      style={{ display: "contents" }}
      data-enter={entering || undefined}
      onContextMenu={(event) => {
        if (readOnly || !onContextMenu || (event.target as HTMLElement).closest("input")) return;
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(event);
      }}
    >
      <ExerciseCell name={name} mode="replace" readOnly={readOnly} style={cells.exercise} onPick={(exerciseId) => apply?.((doc) => updateNode(doc, instance.id, { exerciseId }))} />
      <TextCell
        style={cells.sets}
        value={values.sets}
        label={t.columns.sets}
        placeholder={t.setsHint}
        readOnly={readOnly}
        allowed={/^\d$/}
        inputMode="numeric"
        onCommit={(text) => tryApply(apply, (doc) => setExerciseSets(doc, instance.id, text))}
      />
      <TextCell
        style={cells.reps}
        className={mixed}
        value={values.reps}
        label={t.columns.reps}
        placeholder={t.repsHint}
        title={values.mixed ? t.mixed : undefined}
        readOnly={readOnly}
        allowed={/^[\d\-–]$/}
        onCommit={(text) => tryApply(apply, (doc) => setExerciseReps(doc, instance.id, text))}
      />
      <MenuCell
        style={cells.load}
        className={mixed}
        value={values.load}
        label={t.columns.load}
        placeholder={t.loadHint}
        readOnly={readOnly}
        onOpen={(rect) => setPopup({ kind: "load", rect })}
      />
      <DurationCell
        style={cells.time}
        className={mixed}
        value={values.time}
        stored={p?.workTime}
        parts="hms"
        label={t.columns.time}
        placeholder={t.timeHintShort}
        title={t.timeHint}
        readOnly={readOnly}
        onCommit={(text) => tryApply(apply, (doc) => setExerciseDuration(locale, doc, instance.id, "workTime", text))}
      />
      <DurationCell
        style={cells.rest}
        className={mixed}
        value={values.rest}
        stored={p?.rest}
        parts="ms"
        label={t.columns.rest}
        placeholder={t.restHintShort}
        title={t.restHint}
        readOnly={readOnly}
        onCommit={(text) => tryApply(apply, (doc) => setExerciseDuration(locale, doc, instance.id, "rest", text))}
      />
      <MenuCell
        style={cells.comment}
        className={styles.commentCell}
        value={instance.comment}
        label={t.columns.comment}
        placeholder={t.commentHint}
        readOnly={readOnly}
        onOpen={(rect) => setPopup({ kind: "comment", rect })}
      />
      {children}
      {popup ? (
        <ContextMenu x={popup.rect.left} y={popup.rect.bottom + 2} items={[]} label={popup.kind === "load" ? t.columns.load : t.columns.comment} onAction={() => undefined} onClose={() => setPopup(null)}>
          {popup.kind === "load" ? (
            <LoadEditor
              instance={instance}
              onApply={(unit, text) => {
                const ok = tryApply(apply, (doc) => setExerciseLoad(locale, doc, instance.id, unit, text));
                if (ok) setPopup(null);
                return ok;
              }}
            />
          ) : (
            <textarea
              className={styles.menuTextarea}
              rows={5}
              maxLength={2000}
              aria-label={t.columns.comment}
              placeholder={t.commentPlaceholder}
              defaultValue={instance.comment}
              onChange={(event) => apply?.((doc) => updateNode(doc, instance.id, { comment: event.target.value }))}
            />
          )}
        </ContextMenu>
      ) : null}
    </div>
  );
}
