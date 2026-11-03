import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { ChevronRight, Unlink, Trash2 } from "lucide-react";
import { SheetMenuButton } from "./SheetMenuButton";
import sheetStyles from "./SheetCanvas.module.css";
import { CELL_H } from "../model/layout";
import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { BlockExerciseMax, TrainingDocument } from "@metrivum/api-client-web";
import { ContextMenu } from "@metrivum/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { InlineDurationCell } from "./InlineDurationCell";
import { InlineLoadCell } from "./InlineLoadCell";
import { ExerciseCell, TextCell } from "./ExerciseCells";
import { maxesTables, withMaxesTables, type MaxesTable } from "../model/maxes";
import styles from "./BlockMaxesTable.module.css";

type Apply = (fn: (document: TrainingDocument) => TrainingDocument) => void;
export function BlockMaxesTable({ table, apply, names, style, handle, renderColumnResize, dragging, selected, collapsed = false, onToggle, ...events }: {
  collapsed?: boolean; onToggle?: () => void;
  table: MaxesTable; apply?: Apply; names: Map<string, ExerciseLabel>; style: CSSProperties; handle?: ReactNode; renderColumnResize?: (col: number, label: string) => ReactNode; dragging?: boolean; selected?: boolean;
  onPointerEnter?: () => void; onPointerLeave?: () => void;
  onPointerDown: (event: PointerEvent) => void; onPointerMove: (event: PointerEvent) => void; onPointerUp: (event: PointerEvent) => void;
}) {
  const uiCopy = useUiCopy();

  const pl = useLocale() === "pl";
  const [menu, setMenu] = useState<{ x: number; y: number; row?: number } | null>(null);
  const update = (fn: (table: MaxesTable) => MaxesTable | null) => apply?.(document => withMaxesTables(document, maxesTables(document).flatMap(t => t.id === table.id ? [fn(t)].filter((t): t is MaxesTable => t !== null) : [t])));
  const change = (index: number, patch: Partial<BlockExerciseMax>) => update(t => ({ ...t, rows: t.rows.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  return <div className={`${sheetStyles.card} ${styles.card}`} style={{ ...style, width: Number(style.width) + (collapsed ? -8 : 2), minHeight: collapsed ? CELL_H + 2 : (table.rows.length + (apply ? 3 : 2)) * CELL_H + 2 }} data-dragging={dragging || undefined} data-selected={selected || undefined} tabIndex={0} data-node data-node-id={table.id} data-kind="maxes" data-collapsed={collapsed || undefined} aria-label={pl ? "Maksy ćwiczeń" : uiCopy["ui"]["Exercise maxes"]} {...events}>
    <header className={styles.header}>{onToggle ? <button type="button" className={sheetStyles.toggle} aria-label={collapsed ? uiCopy["ui"]["Expand table"] : uiCopy["ui"]["Collapse table"]} data-no-drag onClick={onToggle}><ChevronRight aria-hidden="true" data-open={!collapsed || undefined} /></button> : null}<strong>{pl ? "Maksy ćwiczeń" : uiCopy["ui"]["Exercise maxes"]}</strong><SheetMenuButton label={pl ? "Maksy ćwiczeń" : uiCopy["ui"]["Exercise maxes"]} onOpen={(x, y) => setMenu({ x, y })} /></header>
    <div className={styles.grid} style={{ display: collapsed ? "none" : undefined }} data-no-drag>
      <span className={styles.heading} style={{ gridColumn: "1 / 3" }}>{pl ? "Ćwiczenie" : uiCopy["editor"]["panel"]["exercise"]}{renderColumnResize?.(1, "Exercise")}</span><span className={styles.heading}>{pl ? "Powt." : uiCopy["editor"]["columns"]["reps"]}{renderColumnResize?.(2, "Reps")}</span><span className={styles.heading}>{pl ? "Ciężar" : uiCopy["editor"]["panel"]["loadMode"]}{renderColumnResize?.(3, "Load")}</span>
      <span className={styles.heading}>{uiCopy["editor"]["sheet"]["columns"]["time"]}{renderColumnResize?.(4, "Time")}</span>
      {table.rows.map((row, index) => <div key={index} role="row" className={styles.row} onContextMenu={event => { if (!apply) return; event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY, row: index }); }}>
        <ExerciseCell name={row.exerciseId ? names.get(row.exerciseId)?.name ?? "Exercise" : ""} mode="replace" required readOnly={!apply} excludedIds={table.rows.filter((_, i) => i !== index).flatMap(r => r.exerciseId ? [r.exerciseId] : [])} style={{ gridColumn: "1 / 3" }} onPick={exerciseId => { if (!table.rows.some((r, i) => i !== index && r.exerciseId === exerciseId)) change(index, { exerciseId }); }} />
        <TextCell label={formatInterfaceText(uiCopy["ui"]["Max reps {0}"], [index + 1])} value={String(row.reps)} readOnly={!apply} style={{ gridColumn: 3 }} inputMode="numeric" onCommit={text => { const reps = Number(text); if (!Number.isInteger(reps) || reps < 1 || reps > 100) return false; change(index, { reps }); return true; }} />
        <InlineLoadCell className={sheetStyles.cell} maxReps={row.reps} label={formatInterfaceText(uiCopy["ui"]["Max load {0}"], [index + 1])} required={!row.time && !row.timeFormula} exerciseId={row.exerciseId ?? undefined} readOnly={!apply} style={{ gridColumn: 4 }} customAllowed prescription={{ load: row.load ? { minimum: row.load, maximum: row.load } : null, loadFormula: row.loadFormula, loadUnit: row.loadUnit }} onChange={value => change(index, { load: value.load?.minimum ?? null, loadFormula: value.loadFormula ?? null, loadUnit: value.loadUnit ?? value.load?.minimum.unit ?? row.loadUnit ?? "Kg" })} />
        <InlineDurationCell className={sheetStyles.cell} maxReps={row.reps} label={formatInterfaceText(uiCopy["ui"]["Max time {0}"], [index + 1])} exerciseId={row.exerciseId ?? undefined} readOnly={!apply} style={{ gridColumn: 5 }} customAllowed
          value={row.time} formula={row.timeFormula} onChange={(timeFormula, time) => change(index, { time, timeFormula })} />
      </div>)}
      {apply && table.rows.length < 64 ? <ExerciseCell name="" mode="add" readOnly={false} style={{ gridColumn: "1 / 3" }} idleStyle={{ gridColumn: 1 }} excludedIds={table.rows.flatMap(r => r.exerciseId ? [r.exerciseId] : [])} onPick={exerciseId => update(t => ({ ...t, rows: [...t.rows, { exerciseId, reps: 1, load: null }] }))} /> : null}
    </div>
    {handle}
    {menu ? <ContextMenu {...menu} label={uiCopy["ui"]["Exercise maxes"]} items={menu.row === undefined ? [{ id: "disconnect", icon: <Unlink />, label: pl ? "Rozłącz" : "Disconnect", isDisabled: !table.blockId || !apply }, { id: "delete", icon: <Trash2 />, tone: "danger", label: pl ? "Usuń tabelę" : "Remove table", isDisabled: !apply }] : [{ id: "row", icon: <Trash2 />, tone: "danger", label: pl ? "Usuń wiersz" : "Remove row" }]} onClose={() => setMenu(null)} onAction={id => {
      if (!apply) return;
      if (id === "delete") update(() => null);
      if (id === "disconnect") update(t => ({ ...t, blockId: null }));
      if (id === "row") update(t => ({ ...t, rows: t.rows.filter((_, i) => i !== menu.row) }));
    }} /> : null}
  </div>;
}
