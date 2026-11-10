import { commentKeyDown } from "./comment-keydown";
import { useCellValidation } from "../cell-validation";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  ExerciseInstance,
  TrainingDocument,
  Workout,
} from "@metrivum/api-client-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { ExerciseTools } from "./ExerciseTools";
import { ContextMenu } from "@metrivum/ui-web";
import {
  rememberPickedExercise,
  useDictionaryLabel,
  useExerciseList,
} from "~/modules/exercises";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { useDebounced } from "~/shared/lib/useDebounced";
import {
  addSet,
  changeSetKind,
  findExercise,
  setPrescription,
  updateNode,
} from "../model/document";
import { requiredSets, exerciseRow, setExerciseSets } from "../model/workouts";
import styles from "./SheetCanvas.module.css";
import {
  InlinePrescriptionCell,
  type FormulaField,
} from "./InlinePrescriptionCell";
import { InlineLoadCell } from "./InlineLoadCell";

/**
 * Exercise cells shared by the sheet's expanded cycle and the simple editor: one row per exercise
 * with the exercise (typed, with suggestions), sets, reps, load, time, rest and comment. A single
 * click starts typing; Enter or leaving saves, Escape cancels. Every value is optional.
 */

export type Apply = (fn: (doc: TrainingDocument) => TrainingDocument) => void;

/** Runs a document update that may be rejected (invalid text) and reports whether it applied. */
export function tryApply(
  apply: Apply | undefined,
  fn: (doc: TrainingDocument) => TrainingDocument | null,
): boolean {
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
  const validationId = useCellValidation(
    invalid,
    label,
    inputMode === "numeric"
      ? "Enter a whole number within the allowed range."
      : "Use a valid value or range for this column (for example 5 or 5–8 for repetitions).",
  );
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
        data-validation-id={validationId}
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
        } else if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
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

export { DurationCell } from "./DurationCell";

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
      {value ? (
        <span className={styles.cellText}>{value}</span>
      ) : (
        <span className={styles.cellPlaceholder}>{placeholder}</span>
      )}
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
  required = false,
  excludedIds = [],
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
  required?: boolean;
  excludedIds?: string[];
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
  const list = useExerciseList(
    { search: search.trim() || undefined, sort: "name", page: 1, pageSize: 12 },
    text !== null && open,
  );
  const items = (list.data?.items ?? []).filter(
    (item) => !excludedIds.includes(item.id),
  );
  // Loading, or still waiting for the typing to settle: a thin running bar on top of the list.
  const loading = list.isFetching || search !== (text ?? "");
  const invalid =
    (required && !name) || (text !== null && !open && text.trim() !== "");
  const validationId = useCellValidation(
    invalid,
    t.columns.exercise,
    !name
      ? "Choose an exercise from the suggestions."
      : "Select a matching exercise or clear the text.",
  );
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
    const item = items.find((x) => x.id === id);
    if (item) rememberPickedExercise(item);
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
        data-validation-id={validationId}
        aria-label={add ? t.addExercise : `${t.columns.exercise}: ${name}`}
        aria-invalid={invalid || undefined}
        disabled={readOnly}
        data-no-drag
        onClick={() => begin(add ? "" : name)}
        onKeyDown={(event) => {
          if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
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
        data-validation-id={validationId}
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={
          open && items[active] ? `${listId}-${active}` : undefined
        }
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
          if ((text ?? "").trim() === "" || (!add && text === name))
            setText(null);
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
        <ul
          id={listId}
          role="listbox"
          aria-label={t.searchExercise}
          aria-busy={loading || undefined}
          className={styles.suggest}
        >
          {loading ? (
            <li className={styles.suggestLoading} role="presentation">
              <span role="progressbar" aria-label={m.common.loading} />
            </li>
          ) : null}
          {items.length === 0 && !loading ? (
            <li className={styles.popEmpty}>{t.noExercises}</li>
          ) : null}
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
                <span className={styles.suggestMeta}>
                  {exercise.primaryMuscleKeys
                    .map((key) => dictionaryLabel("muscles", key))
                    .join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type ExerciseColumn =
  "exercise" | "sets" | "reps" | "load" | "time" | "rest" | "comment";

/**
 * One exercise as a row of cells. `cells` gives each column's grid placement; the row keeps its own
 * load and comment popups. Right click on the row (outside inputs) calls `onContextMenu`.
 */
export function ExerciseRow({
  instance,
  workout,
  names,
  name,
  cells,
  readOnly,
  apply,
  onContextMenu,
  entering = false,
  formulaAllowed = false,
  customFormulas = false,
  children,
  lead,
  rowProps,
}: {
  instance: ExerciseInstance;
  workout: Workout;
  names: Map<string, ExerciseLabel>;
  name: string;
  cells: Record<ExerciseColumn, React.CSSProperties>;
  readOnly: boolean;
  apply?: Apply;
  onContextMenu?: (event: React.MouseEvent) => void;
  /** Just revealed (its workout was unfolded): the cells fade in. */
  entering?: boolean;
  formulaAllowed?: boolean;
  customFormulas?: boolean;
  /** Extra cells after the comment (e.g. the row's ⋮ menu in the simple editor). */
  children?: React.ReactNode;
  /** Cells before the exercise (e.g. the drag handle in the simple editor). */
  lead?: React.ReactNode;
  /** Extra attributes and handlers on the row (e.g. drop target for reordering). */
  rowProps?: React.HTMLAttributes<HTMLDivElement> & {
    [key: `data-${string}`]: string | boolean | undefined;
  };
}) {
  const m = useT();
  const t = m.editor.sheet;
  const locale = useLocale();
  const [popup, setPopup] = useState<{ kind: "comment"; rect: DOMRect } | null>(
    null,
  );
  const values = exerciseRow(
    locale,
    instance,
    (key) => m.training.formulas.builtInNames[key] ?? key,
  );
  const mixed = values.mixed ? styles.mixedCell : undefined;
  const p = instance.sets[0]?.prescription;
  const formulaCell = (
    field: FormulaField,
    column: ExerciseColumn,
    extra?: React.CSSProperties,
  ) => (
    <InlinePrescriptionCell
      field={field}
      prescription={p ?? {}}
      count={requiredSets(instance)}
      countMax={instance.sets.length}
      exerciseId={instance.exerciseId}
      maximum={field === "Reps" && instance.sets[0]?.kind === "Amrap"}
      onMaximumChange={
        field === "Reps" || field === "WorkTime"
          ? () =>
              apply?.((doc) => {
                let next = doc;
                if (!instance.sets.length) next = addSet(next, instance.id).doc;
                return (
                  findExercise(next, instance.id)?.exercise.sets.reduce(
                    (document, set) => {
                      if (field === "Reps")
                        return changeSetKind(document, set.id, "Amrap");
                      const fieldFormulas = {
                        ...set.prescription.fieldFormulas,
                      };
                      delete fieldFormulas.WorkTime;
                      return setPrescription(document, set.id, {
                        ...set.prescription,
                        workTimeMax: true,
                        workTime: null,
                        fieldFormulas,
                      });
                    },
                    next,
                  ) ?? next
                );
              })
          : undefined
      }
      label={t.columns[column]}
      style={extra ? { ...cells[column], ...extra } : cells[column]}
      className={`${styles.cell} ${mixed ?? ""}`}
      readOnly={readOnly}
      formulaAllowed={formulaAllowed}
      customAllowed={customFormulas}
      onChange={(formula, value, maximum) =>
        apply?.((doc) => {
          let next = doc;
          if (!instance.sets.length) next = addSet(next, instance.id).doc;
          if (field === "Sets" && !formula && value)
            next =
              setExerciseSets(
                next,
                instance.id,
                maximum != null && maximum > Number(value.value)
                  ? `${value.value}-${maximum}`
                  : String(value.value),
              ) ?? next;
          const current = findExercise(next, instance.id)?.exercise;
          return (
            current?.sets.reduce((document, set, index) => {
              if (field === "Sets" && index !== 0) {
                const fieldFormulas = { ...set.prescription.fieldFormulas };
                delete fieldFormulas.Sets;
                return setPrescription(document, set.id, {
                  ...set.prescription,
                  fieldFormulas,
                });
              }
              const fieldFormulas = { ...set.prescription.fieldFormulas };
              if (formula) fieldFormulas[field] = formula;
              else delete fieldFormulas[field];
              if (field === "Reps" && set.kind === "Amrap")
                document = changeSetKind(document, set.id, "Standard");
              return setPrescription(document, set.id, {
                ...set.prescription,
                fieldFormulas,
                ...(field === "Reps"
                  ? {
                      reps:
                        !formula && value
                          ? {
                              minimum: value.value,
                              maximum: maximum ?? value.value,
                            }
                          : null,
                    }
                  : {}),
                ...(field === "WorkTime"
                  ? { workTime: formula ? null : value, workTimeMax: null }
                  : {}),
                ...(field === "Rest" ? { rest: formula ? null : value } : {}),
              });
            }, next) ?? next
          );
        })
      }
    />
  );

  return (
    <div
      {...rowProps}
      role="row"
      style={{ display: "contents" }}
      data-enter={entering || undefined}
      onContextMenu={(event) => {
        if (
          readOnly ||
          !onContextMenu ||
          (event.target as HTMLElement).closest("input")
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(event);
      }}
    >
      {lead}
      <ExerciseCell
        name={name}
        mode="replace"
        readOnly={readOnly}
        style={cells.exercise}
        onPick={(exerciseId) =>
          apply?.((doc) => updateNode(doc, instance.id, { exerciseId }))
        }
      />
      {/* Set types and supersets live in the Sets column, at its right edge. */}
      {formulaCell("Sets", "sets", { paddingRight: 44 })}
      <ExerciseTools
        workout={workout}
        instance={instance}
        names={names}
        apply={apply}
        advancedAllowed={formulaAllowed}
        style={cells.sets}
      />
      {formulaCell("Reps", "reps")}
      <InlineLoadCell
        exerciseId={instance.exerciseId}
        effortAsLoad
        prescription={p ?? {}}
        formulaAllowed={formulaAllowed}
        customAllowed={customFormulas}
        fallbackValue={values.load}
        label={t.columns.load}
        style={cells.load}
        className={`${styles.cell} ${mixed ?? ""}`}
        readOnly={readOnly}
        onChange={(value) =>
          apply?.((doc) => {
            const current = findExercise(doc, instance.id)?.exercise;
            if (!current) return doc;
            if (!current.sets.length) {
              const added = addSet(doc, instance.id);
              return added.id
                ? setPrescription(added.doc, added.id, value)
                : doc;
            }
            return current.sets.reduce(
              (next, set) =>
                setPrescription(next, set.id, {
                  ...set.prescription,
                  load: value.load,
                  loadPercent: value.loadPercent,
                  baseValue: value.baseValue,
                  loadFormula: value.loadFormula,
                  loadUnit: value.loadUnit,
                  rpe: value.rpe !== p?.rpe ? value.rpe : set.prescription.rpe,
                  rir: value.rir !== p?.rir ? value.rir : set.prescription.rir,
                }),
              doc,
            );
          })
        }
      />
      {formulaCell("WorkTime", "time")}
      {formulaCell("Rest", "rest")}
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
        <ContextMenu
          x={popup.rect.left}
          y={popup.rect.bottom + 2}
          items={[]}
          label={t.columns.comment}
          onAction={() => undefined}
          onClose={() => setPopup(null)}
        >
          <textarea
            autoFocus
            className={styles.menuTextarea}
            rows={5}
            maxLength={2000}
            aria-label={t.columns.comment}
            placeholder={t.commentPlaceholder}
            onKeyDown={(event) =>
              commentKeyDown(
                event,
                () => setPopup(null),
                (text) =>
                  apply?.((doc) =>
                    updateNode(doc, instance.id, { comment: text }),
                  ),
              )
            }
            defaultValue={instance.comment}
            onChange={(event) =>
              apply?.((doc) =>
                updateNode(doc, instance.id, { comment: event.target.value }),
              )
            }
          />
        </ContextMenu>
      ) : null}
    </div>
  );
}
