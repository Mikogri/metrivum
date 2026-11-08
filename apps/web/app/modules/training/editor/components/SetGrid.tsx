import { GripVertical, Lock, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import type { ExerciseListItemDto, Prescription, SetKind, TrainingSet, Workout } from "@metrivum/api-client-web";
import { SET_KINDS } from "@metrivum/api-client-web";
import { Badge, Button, toast } from "@metrivum/ui-web";
import { ExercisePicker, rememberPickedExercise, type ExerciseLabel } from "~/modules/exercises";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import {
  addExercise,
  addSet,
  changeSetKind,
  duplicateNode,
  groupOf,
  moveNode,
  removeNode,
  SEGMENTED,
  setIsAdvanced,
  setPrescription,
  updateNode,
  updateSegments,
} from "../model/document";
import { copySet, readCopiedSet } from "../model/clipboard";
import { editText, formatDuration, formatEffort, formatLoad, formatReps, parseDuration, parseEffort, parseLoad, parseReps, parseTempo } from "../model/notation";
import { moveExerciseTo } from "../model/reorder";
import type { EditorApi } from "../useEditor";
import styles from "./SetGrid.module.css";
import { InlinePrescriptionCell } from "./InlinePrescriptionCell";
import { InlineLoadCell } from "./InlineLoadCell";
import { formulaText } from "../model/inline-formula";

const COLUMNS = ["exercise", "set", "kind", "reps", "load", "effort", "rest", "tempo", "notes"] as const;
type Column = (typeof COLUMNS)[number];
const TEXT_COLUMNS = new Set<Column>(["reps", "load", "effort", "rest", "tempo", "notes"]);

interface Row {
  key: string;
  instanceId: string;
  exerciseId: string;
  exerciseIndex: number;
  set: TrainingSet | null;
  setIndex: number;
  first: boolean;
  last: boolean;
}

export interface GridSelection {
  instanceId: string | null;
  setId: string | null;
}

interface Props {
  editor: EditorApi;
  workout: Workout;
  names: Map<string, ExerciseLabel>;
  advancedAllowed: boolean;
  customFormulas?: boolean;
  readOnly: boolean;
  onSelectionChange: (selection: GridSelection) => void;
}

/**
 * Spreadsheet-style set grid for one workout. Keyboard handling is scoped to the grid:
 * while a cell input is focused, keys belong to the input, never to sheet commands.
 */
export function SetGrid({ editor, workout, names, advancedAllowed, customFormulas = false, readOnly, onSelectionChange }: Props) {
  const m = useT();
  const locale = useLocale();
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState({ r: 0, c: 3 });
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ text: string; invalid: boolean } | null>(null);
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "replace"; instanceId: string } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  // Set while a keyboard commit/cancel moves focus back to the grid, so the input's blur doesn't commit twice.
  const skipBlur = useRef(false);

  const rows: Row[] = useMemo(
    () =>
      workout.exercises.flatMap((instance, exerciseIndex): Row[] => {
        if (!instance.sets.length) {
          return [{ key: instance.id, instanceId: instance.id, exerciseId: instance.exerciseId, exerciseIndex, set: null, setIndex: -1, first: true, last: true }];
        }
        return instance.sets.map((set, setIndex) => ({
          key: set.id,
          instanceId: instance.id,
          exerciseId: instance.exerciseId,
          exerciseIndex,
          set,
          setIndex,
          first: setIndex === 0,
          last: setIndex === instance.sets.length - 1,
        }));
      }),
    [workout],
  );

  // Keep the active cell inside the grid when rows change (undo, delete).
  useEffect(() => {
    setActive((a) => ({ r: Math.min(a.r, Math.max(0, rows.length - 1)), c: a.c }));
  }, [rows.length]);

  const activeRow = rows[active.r];
  useEffect(() => {
    onSelectionChange({ instanceId: activeRow?.instanceId ?? null, setId: activeRow?.set?.id ?? null });
  }, [activeRow?.instanceId, activeRow?.set?.id, onSelectionChange]);

  // Focus stays on the grid itself (aria-activedescendant), so no keystroke is lost between cells.
  const focusCell = (r: number, c: number) => {
    gridRef.current?.focus({ preventScroll: true });
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const move = (r: number, c: number, extend = false) => {
    const next = { r: Math.max(0, Math.min(rows.length - 1, r)), c: Math.max(0, Math.min(COLUMNS.length - 1, c)) };
    if (extend) setAnchor((current) => current ?? active);
    else setAnchor(null);
    setActive(next);
    focusCell(next.r, next.c);
  };

  const range = useMemo(() => {
    if (!anchor) return null;
    return { r1: Math.min(anchor.r, active.r), r2: Math.max(anchor.r, active.r), c1: Math.min(anchor.c, active.c), c2: Math.max(anchor.c, active.c) };
  }, [anchor, active]);

  const isAdvancedLocked = (set: TrainingSet | null) => Boolean(set && setIsAdvanced(set) && !advancedAllowed);

  function display(row: Row, column: Column): string {
    const set = row.set;
    if (column === "exercise") return row.first ? (names.get(row.exerciseId)?.name ?? "…") : "";
    if (!set) return "";
    const p = set.prescription;
    switch (column) {
      case "set":
        return String(row.setIndex + 1);
      case "kind":
        return m.editor.setKinds[set.kind] ?? set.kind;
      case "reps":
        return set.kind === "Amrap" ? "AMRAP" : formatReps(p.reps);
      case "load":
        return formatLoad(locale, p, (key) => m.training.formulas.builtInNames[key] ?? key);
      case "effort":
        return formatEffort(locale, p);
      case "rest":
        return formatDuration(locale, p.rest);
      case "tempo":
        return p.tempo ?? "";
      case "notes":
        return p.comment ?? "";
    }
  }

  /** Applies typed text to one cell. Returns false when the text can't be parsed. */
  function applyText(row: Row, column: Column, text: string): boolean {
    const set = row.set;
    if (!set || !TEXT_COLUMNS.has(column) || isAdvancedLocked(set)) return true;
    const p: Prescription = { ...set.prescription };
    switch (column) {
      case "reps": {
        if (text.trim().toUpperCase() === "AMRAP") { editor.apply(doc => changeSetKind(doc, set.id, "Amrap")); return true; }
        const parsed = parseReps(text);
        if (!parsed.ok) return false;

        p.reps = parsed.value;
        p.fieldFormulas = { ...p.fieldFormulas }; delete p.fieldFormulas.Reps;
        break;
      }
      case "load": {
        const unit = p.load?.minimum.unit ?? "Kg";
        const parsed = parseLoad(locale, text, unit);
        if (!parsed.ok) return false;
        if (parsed.value.kind === "none") {
          delete p.load;
          delete p.loadPercent;
          delete p.baseValue;
          if (text.trim() === "") delete p.loadFormula;
        } else if (parsed.value.kind === "absolute") {
          p.load = parsed.value.load;
          delete p.loadPercent;
          delete p.baseValue;
          delete p.loadFormula;
        } else {
          p.loadPercent = parsed.value.percent;
          delete p.load;
          delete p.loadFormula;
        }
        break;
      }
      case "effort": {
        const parsed = parseEffort(locale, text);
        if (!parsed.ok) return false;
        p.rpe = parsed.value.rpe;
        p.rir = parsed.value.rir;
        break;
      }
      case "rest": {
        const parsed = parseDuration(locale, text);
        if (!parsed.ok) return false;
        p.rest = parsed.value;
        break;
      }
      case "tempo": {
        const parsed = parseTempo(text);
        if (!parsed.ok) return false;
        p.tempo = parsed.value;
        break;
      }
      case "notes":
        if (text.length > 2000) return false;
        p.comment = text.trim() || null;
        break;
    }
    editor.apply((doc) => setPrescription(column === "reps" && set.kind === "Amrap" ? changeSetKind(doc, set.id, "Standard") : doc, set.id, p));
    return true;
  }

  function startEditing(initial?: string) {
    if (readOnly || !activeRow) return;
    const column = COLUMNS[active.c]!;
    if (column === "exercise") {
      setPicker({ mode: "replace", instanceId: activeRow.instanceId });
      return;
    }
    if (!activeRow.set || isAdvancedLocked(activeRow.set)) return;
    if (column === "kind") {
      setEditing({ text: activeRow.set.kind, invalid: false });
      return;
    }
    if (!TEXT_COLUMNS.has(column)) return;
    setEditing({ text: initial ?? (column === "load" ? formulaText(activeRow.set.prescription.loadFormula) || editText(locale, column, activeRow.set.prescription) : editText(locale, column, activeRow.set.prescription)), invalid: false });
  }

  function commitEditing(nextRow: number, nextCol: number) {
    if (!editing || !activeRow) return;
    skipBlur.current = true;
    const column = COLUMNS[active.c]!;
    if (column !== "kind") {
      const initial = activeRow.set ? editText(locale, column, activeRow.set.prescription) : "";
      if (editing.text !== initial && !applyText(activeRow, column, editing.text)) {
        skipBlur.current = false;
        setEditing({ ...editing, invalid: true });
        setMessage(column === "reps" && activeRow.set?.kind === "Amrap" ? m.editor.panel.amrapNote : column === "tempo" ? m.editor.panel.tempoInvalid : m.errors.byCode.VALIDATION_FAILED!);
        return;
      }
    }
    setEditing(null);
    setMessage("");
    move(nextRow, nextCol);
  }

  function clearRange() {
    const cells = range ?? { r1: active.r, r2: active.r, c1: active.c, c2: active.c };
    for (let r = cells.r1; r <= cells.r2; r++) for (let c = cells.c1; c <= cells.c2; c++) {
      const column = COLUMNS[c]!;
      const row = rows[r];
      if (row && TEXT_COLUMNS.has(column)) applyText(row, column, "");
    }
  }

  function copyRange() {
    const cells = range ?? { r1: active.r, r2: active.r, c1: active.c, c2: active.c };
    const lines: string[] = [];
    for (let r = cells.r1; r <= cells.r2; r++) {
      const values: string[] = [];
      for (let c = cells.c1; c <= cells.c2; c++) values.push(display(rows[r]!, COLUMNS[c]!));
      lines.push(values.join("\t"));
    }
    const single = !range && activeRow?.set;
    if (single && activeRow.set) {
      // A single cell copies the whole set prescription so it can be pasted onto another set.
      copySet({ type: "trainflow/set", kind: activeRow.set.kind, prescription: activeRow.set.prescription, segments: activeRow.set.segments });
    } else {
      void navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
    }
    toast({ tone: "neutral", title: m.editor.copied, duration: 1500 });
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    if (editing || readOnly || !activeRow) return;
    const text = event.clipboardData.getData("text/plain");
    const copied = readCopiedSet(text) ?? (text ? null : readCopiedSet());
    event.preventDefault();
    if (copied && activeRow.set) {
      const set = activeRow.set;
      const kindAllowed = copied.kind === "Standard" || advancedAllowed;
      if (!kindAllowed) {
        toast({ tone: "warning", title: m.editor.panel.advancedLocked });
        return;
      }
      editor.apply((doc) => {
        let next = setPrescription(doc, set.id, copied.prescription);
        if (copied.kind !== set.kind) next = changeSetKind(next, set.id, copied.kind);
        if (SEGMENTED.has(copied.kind) && copied.segments) next = updateSegments(next, set.id, copied.segments.map((s) => ({ ...s, id: crypto.randomUUID() })));
        return next;
      });
      toast({ tone: "neutral", title: m.editor.pasted, duration: 1500 });
      return;
    }
    // Tab/newline separated text fills cells from the active one; decimals follow the UI locale.
    const lines = text.replace(/\r/g, "").split("\n").filter((line, index, all) => line !== "" || index < all.length - 1);
    let failed = false;
    lines.forEach((line, dr) => {
      line.split("\t").forEach((value, dc) => {
        const row = rows[active.r + dr];
        const column = COLUMNS[active.c + dc];
        if (row && column && TEXT_COLUMNS.has(column) && !applyText(row, column, value)) failed = true;
      });
    });
    if (failed) toast({ tone: "danger", title: m.editor.pasteInvalid, duration: 6000 });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    const mod = event.metaKey || event.ctrlKey;
    const row = activeRow;
    const column = COLUMNS[active.c]!;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (event.altKey && row && !readOnly) {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          if (column === "exercise" || !row.set) editor.apply((doc) => moveNode(doc, row.instanceId, delta));
          else editor.apply((doc) => moveNode(doc, row.set!.id, delta));
          move(active.r + delta, active.c);
          return;
        }
        event.preventDefault();
        move(active.r + (event.key === "ArrowDown" ? 1 : -1), active.c, event.shiftKey);
        return;
      }
      case "ArrowLeft":
      case "ArrowRight":
        event.preventDefault();
        move(active.r, active.c + (event.key === "ArrowRight" ? 1 : -1), event.shiftKey);
        return;
      case "Home":
        event.preventDefault();
        move(mod ? 0 : active.r, 0);
        return;
      case "End":
        event.preventDefault();
        move(mod ? rows.length - 1 : active.r, COLUMNS.length - 1);
        return;
      case "Tab":
        if (active.c < COLUMNS.length - 1 && !event.shiftKey) {
          event.preventDefault();
          move(active.r, active.c + 1);
        } else if (active.c > 0 && event.shiftKey) {
          event.preventDefault();
          move(active.r, active.c - 1);
        }
        return;
      case "Enter":
      case "F2":
        event.preventDefault();
        if (mod && row && !readOnly) {
          const result = addSet(editor.doc, row.instanceId, row.set?.id);
          if (result.id) editor.apply(() => result.doc);
          move(active.r + 1, active.c);
          return;
        }
        startEditing();
        return;
      case "Delete":
      case "Backspace":
        if (readOnly) return;
        event.preventDefault();
        clearRange();
        return;
      case "Escape":
        setAnchor(null);
        return;
    }
    if (mod && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copyRange();
      return;
    }
    if (mod && event.key.toLowerCase() === "d" && row && !readOnly) {
      event.preventDefault();
      const target = column === "exercise" || !row.set ? row.instanceId : row.set.id;
      const result = duplicateNode(editor.doc, target);
      if (result.id) editor.apply(() => result.doc);
      return;
    }
    // Typing a character starts editing that cell with the character, like a spreadsheet.
    if (!mod && !event.altKey && event.key.length === 1 && TEXT_COLUMNS.has(column) && !readOnly) {
      event.preventDefault();
      startEditing(event.key);
    }
  }

  // Drag and drop of whole exercises (Alt+↑/↓ and the menu are the keyboard alternative).
  function onDragStart(event: DragEvent, instanceId: string) {
    event.dataTransfer.setData("application/x-trainflow-exercise", instanceId);
    event.dataTransfer.effectAllowed = "move";
  }
  function onDrop(event: DragEvent) {
    const instanceId = event.dataTransfer.getData("application/x-trainflow-exercise");
    if (instanceId && dropIndex !== null) editor.apply((doc) => moveExerciseTo(doc, workout.id, instanceId, dropIndex));
    setDropIndex(null);
  }

  const kindOptions = SET_KINDS.filter((kind) => ["Standard", "Warmup", "BackOff"].includes(kind) || advancedAllowed);

  return (
    <div className={styles.wrap}>
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        aria-activedescendant={rows.length ? `${workout.id}-cell-${active.r}-${active.c}` : undefined}
        aria-label={`${m.editor.grid}: ${workout.name}`}
        aria-rowcount={rows.length + 1}
        aria-colcount={COLUMNS.length}
        aria-readonly={readOnly || undefined}
        className={styles.grid}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <div role="row" className={styles.headRow} aria-rowindex={1}>
          {COLUMNS.map((column) => (
            <div key={column} role="columnheader" className={styles.head} data-col={column}>
              {m.editor.columns[column]}
            </div>
          ))}
        </div>
        {rows.length === 0 ? (
          <div role="row" className={styles.emptyRow}>
            <div role="gridcell" className={styles.emptyCell}>
              {m.editor.emptyWorkout}
            </div>
          </div>
        ) : null}
        {rows.map((row, r) => {
          const group = groupOf(workout, row.instanceId);
          const locked = isAdvancedLocked(row.set);
          const label = names.get(row.exerciseId);
          return (
            <div
              key={row.key}
              role="row"
              aria-rowindex={r + 2}
              className={styles.row}
              data-first={row.first || undefined}
              data-group={group?.kind}
              data-drop={dropIndex === row.exerciseIndex && row.first ? true : undefined}
              onDragOver={(event) => {
                if (!row.first) return;
                event.preventDefault();
                setDropIndex(row.exerciseIndex);
              }}
            >
              {COLUMNS.map((column, c) => {
                const isActive = active.r === r && active.c === c;
                const inRange = range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
                const editingHere = isActive && editing;
                return (
                  <div
                    key={column}
                    role="gridcell"
                    id={`${workout.id}-cell-${r}-${c}`}
                    data-cell={`${r}:${c}`}
                    data-col={column}
                    data-active={isActive || undefined}
                    data-range={inRange || undefined}
                    data-invalid={editingHere && editing.invalid ? true : undefined}
                    aria-selected={isActive || Boolean(inRange)}
                    aria-readonly={readOnly || locked || column === "set" || undefined}
                    className={styles.cell}
                    onMouseDown={(event) => {
                      if (editingHere) return;
                      event.preventDefault();
                      move(r, c, event.shiftKey);
                    }}
                    onDoubleClick={() => startEditing()}
                  >
                    {column === "load" && row.set && advancedAllowed ? (
                      <InlineLoadCell exerciseId={row.exerciseId} customAllowed={customFormulas} prescription={row.set.prescription} readOnly={readOnly || locked} label={m.editor.columns.load} initialText={editingHere ? editing.text : undefined} onDone={() => setEditing(null)} onChange={(p) => editor.apply((doc) => setPrescription(doc, row.set!.id, p))} />
                    ) : (column === "reps" || column === "rest") && row.set && advancedAllowed ? (
                      <InlinePrescriptionCell field={column === "reps" ? "Reps" : "Rest"} prescription={row.set.prescription} maximum={column === "reps" && row.set.kind === "Amrap"}
                        onMaximumChange={column === "reps" ? () => editor.apply(doc => changeSetKind(doc, row.set!.id, "Amrap")) : undefined}
                        exerciseId={row.exerciseId} customAllowed={customFormulas} readOnly={readOnly || locked} label={m.editor.columns[column]} initialText={editingHere ? editing.text : undefined} onDone={() => setEditing(null)}
                        onChange={(formula, value, maximum) => editor.apply(doc => setPrescription(column === "reps" && row.set!.kind === "Amrap" ? changeSetKind(doc, row.set!.id, "Standard") : doc, row.set!.id, { ...row.set!.prescription,
                          fieldFormulas: Object.fromEntries([...Object.entries(row.set!.prescription.fieldFormulas ?? {}).filter(([key]) => key !== (column === "reps" ? "Reps" : "Rest")), ...(formula ? [[column === "reps" ? "Reps" : "Rest", formula] as const] : [])]),
                          ...(column === "reps" ? { reps: formula || !value ? null : { minimum: value.value, maximum: maximum ?? value.value } } : { rest: formula ? null : value })
                        }))} />
                    ) : editingHere && column === "kind" && row.set ? (
                      <select
                        autoFocus
                        className={styles.select}
                        aria-label={m.editor.panel.kind}
                        value={editing.text}
                        onChange={(event) => {
                          const kind = event.target.value as SetKind;
                          const set = row.set!;
                          editor.apply((doc) => changeSetKind(doc, set.id, kind));
                          setEditing(null);
                          focusCell(r, c);
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Escape") {
                            setEditing(null);
                            focusCell(r, c);
                          }
                        }}
                        onBlur={() => setEditing(null)}
                      >
                        {[...new Set([row.set.kind, ...kindOptions])].map((kind) => (
                          <option key={kind} value={kind} disabled={kind !== "Standard" && !advancedAllowed && kind !== row.set!.kind}>
                            {m.editor.setKinds[kind]}
                          </option>
                        ))}
                      </select>
                    ) : editingHere ? (
                      <input
                        autoFocus
                        className={styles.input}
                        aria-label={`${m.editor.columns[column]} — ${label?.name ?? ""} ${m.editor.panel.set(row.setIndex + 1)}`}
                        aria-invalid={editing.invalid || undefined}
                        value={editing.text}
                        onChange={(event) => setEditing({ text: event.target.value, invalid: false })}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitEditing(r + 1, c);
                          } else if (event.key === "Tab") {
                            event.preventDefault();
                            commitEditing(r, c + (event.shiftKey ? -1 : 1));
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            skipBlur.current = true;
                            setEditing(null);
                            setMessage("");
                            focusCell(r, c);
                          }
                        }}
                        onBlur={() => {
                          if (skipBlur.current) {
                            skipBlur.current = false;
                            return;
                          }
                          // Clicking elsewhere commits a valid edit and leaves the grid where the user clicked.
                          if (editing && !editing.invalid) {
                            const initial = row.set ? editText(locale, column, row.set.prescription) : "";
                            if (editing.text === initial || applyText(row, column, editing.text)) setEditing(null);
                          }
                        }}
                      />
                    ) : column === "exercise" ? (
                      row.first ? (
                        <span className={styles.exercise}>
                          {readOnly ? null : (
                            <span
                              className={styles.handle}
                              draggable
                              onDragStart={(event) => onDragStart(event, row.instanceId)}
                              aria-hidden="true"
                            >
                              <GripVertical />
                            </span>
                          )}
                          <span className={styles.exerciseName} data-missing={label?.missing || undefined}>
                            {label?.name ?? (label?.missing ? "—" : "…")}
                          </span>
                          {label?.isArchived ? <Badge size="sm" tone="warning">{m.exercises.detail.archivedBadge}</Badge> : null}
                          {group ? (
                            <Badge size="sm" tone={group.kind === "Superset" ? "violet" : "info"}>
                              {m.editor.panel.groupKind[group.kind]}
                            </Badge>
                          ) : null}
                        </span>
                      ) : null
                    ) : column === "kind" && row.set ? (
                      <span className={styles.kind} data-kind={row.set.kind}>
                        {locked ? <Lock aria-hidden="true" className={styles.lock} /> : null}
                        {display(row, column)}
                        {row.set.segments?.length ? <span className={styles.segments}>×{row.set.segments.length}</span> : null}
                      </span>
                    ) : (
                      <span className={styles.value}>{display(row, column)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className={styles.message} role="status" aria-live="polite">
        {message}
      </p>
      {readOnly ? null : (
        <div className={styles.actions}>
          <Button size="sm" iconStart={<Plus />} onPress={() => setPicker({ mode: "add" })}>
            {m.editor.addExercise}
          </Button>
          {activeRow ? (
            <Button
              size="sm"
              variant="ghost"
              iconStart={<Plus />}
              onPress={() => {
                const result = addSet(editor.doc, activeRow.instanceId, activeRow.set?.id);
                if (result.id) editor.apply(() => result.doc);
              }}
            >
              {m.editor.addSet}
            </Button>
          ) : null}
          {activeRow?.set ? (
            <Button size="sm" variant="ghost" onPress={() => editor.apply((doc) => removeNode(doc, activeRow.set!.id))}>
              {m.editor.remove}
            </Button>
          ) : null}
        </div>
      )}
      <ExercisePicker
        isOpen={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        selectedId={picker?.mode === "replace" ? workout.exercises.find((e) => e.id === picker.instanceId)?.exerciseId : undefined}
        onPick={(exercise: ExerciseListItemDto) => {
          if (!picker) return;
          rememberPickedExercise(exercise);
          if (picker.mode === "add") {
            const result = addExercise(editor.doc, workout.id, exercise.id);
            editor.apply(() => result.doc);
            setTimeout(() => move(rows.length, 3), 0);
          } else {
            const target = picker.instanceId;
            editor.apply((doc) => updateNode(doc, target, { exerciseId: exercise.id }));
            focusCell(active.r, active.c);
          }
        }}
      />
    </div>
  );
}
