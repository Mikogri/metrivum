import { CalendarDays, Copy, MessageSquare, MoreHorizontal, Pencil, Plus, Power, PowerOff, Table2, Target, Trash2, TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Block, PlanAnnotation, TrainingDocument, Workout } from "@metrivum/api-client-web";
import { Button, ContextMenu, Dialog, IconButton, Option, Select, type ContextMenuEntry } from "@metrivum/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useT } from "~/shared/i18n/AppLocale";
import { addBlock, addCycle, duplicateNode, removeNode, updateNode } from "../model/document";
import { maxesTables, withMaxesTables } from "../model/maxes";
import { REPEAT_CHOICES, countedCycles, cycleRuns } from "../model/workouts";
import { isImplicit, nodeLabel } from "../model/structure";
import type { EditorApi } from "../useEditor";
import { BlockMaxesTable } from "./BlockMaxesTable";
import { ProgressionDialog } from "./ProgressionDialog";
import { WorkoutEditor } from "./WorkoutEditor";
import styles from "./WeekView.module.css";

type Apply = (fn: (doc: TrainingDocument) => TrainingDocument) => void;

/**
 * Table mode's way to shape the plan, the same structure the sheet edits: pick a block and cycle, add cycles and
 * blocks, and a menu for cycle settings (custom length), progression, maxes, duplicates, removal and plan notes.
 */
export function StructureBar({ doc, apply, cycleId, onSelectCycle, onEditNode, names }: {
  doc: TrainingDocument;
  apply: Apply;
  cycleId: string | null;
  onSelectCycle: (id: string) => void;
  onEditNode: (id: string) => void;
  names: Map<string, ExerciseLabel>;
}) {
  const m = useT();
  const t = m.editor.week;
  const s = m.editor.sheet;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [progression, setProgression] = useState<string | null>(null);
  const cycles = doc.blocks.flatMap((block) => block.cycles.map((cycle) => ({ block, cycle })));
  const current = cycles.find((item) => item.cycle.id === cycleId) ?? cycles[0];
  const block = current?.block;
  const ownBlock = block && !isImplicit(block) ? block : undefined;
  const blockLabels = { untitled: m.editor.untitled, implicit: m.editor.noBlock };
  const hasMaxes = block ? maxesTables(doc).some((table) => table.blockId === block.id) : false;
  // Changes land through the editor's state, so a cycle made here is opened once it shows up in the plan.
  const [known, setKnown] = useState<Set<string> | null>(null);
  const expectNew = () => setKnown(new Set(cycles.map((item) => item.cycle.id)));
  useEffect(() => {
    if (!known) return;
    const fresh = doc.blocks.flatMap((b) => b.cycles).find((c) => !known.has(c.id));
    if (!fresh) return;
    setKnown(null);
    onSelectCycle(fresh.id);
  }, [doc, known, onSelectCycle]);

  const addCycleHere = () => {
    expectNew();
    apply((d) => {
      const target = d.blocks.find((b) => b.id === ownBlock?.id) ?? d.blocks.find((b) => !isImplicit(b));
      if (!target) {
        const made = addBlock(d, m.editor.blockName(1));
        return addCycle(made.doc, made.id, m.editor.cycleName(1)).doc;
      }
      return addCycle(d, target.id, m.editor.cycleName(target.cycles.length + 1)).doc;
    });
  };
  const addBlockHere = () => {
    expectNew();
    apply((d) => {
      const made = addBlock(d, m.editor.blockName(d.blocks.length + 1));
      return addCycle(made.doc, made.id, m.editor.cycleName(1)).doc;
    });
  };
  // Opening a block shows its first cycle; a block without cycles gets its first one, since workouts live in cycles.
  const openBlock = (blockId: string) => {
    const target = doc.blocks.find((b) => b.id === blockId);
    if (!target || target.id === block?.id) return;
    const first = target.cycles[0];
    if (first) return onSelectCycle(first.id);
    expectNew();
    apply((d) => addCycle(d, target.id, m.editor.cycleName(1)).doc);
  };
  const addNote = (kind: "Comment" | "Goal") => apply((d) => ({
    ...d,
    annotations: [...(d.annotations ?? []), { id: crypto.randomUUID(), kind, title: kind, content: "", targetId: current?.cycle.id ?? null, visibility: "Coach" } as PlanAnnotation],
  }));

  const items: ContextMenuEntry[] = [
    { type: "label", id: "cycle-label", label: `${t.cycle}: ${current?.cycle.name || m.editor.untitled}` },
    { id: "cycle-settings", label: t.renameCycle, icon: <Pencil />, isDisabled: !current },
    { id: "cycle-duplicate", label: s.duplicateCycle, icon: <Copy />, isDisabled: !current },
    { id: "cycle-remove", label: t.removeCycle, icon: <Trash2 />, tone: "danger", isDisabled: !current || cycles.length < 2 },
    { type: "separator", id: "s1" },
    { type: "label", id: "block-label", label: `${t.block}: ${block ? nodeLabel(block, blockLabels) : m.editor.untitled}` },
    // Cycles outside every block have no block to set up: only the coach's own blocks do.
    { id: "block-settings", label: t.blockSettings, icon: <CalendarDays />, isDisabled: !ownBlock },
    { id: "block-active", label: block?.inactive ? t.activateBlock : t.deactivateBlock, icon: block?.inactive ? <Power /> : <PowerOff />, isDisabled: !ownBlock },
    { id: "progression", label: s.progression.menu, icon: <TrendingUp />, isDisabled: !ownBlock },
    { id: "maxes", label: t.addMaxes, icon: <Table2 />, isDisabled: !ownBlock || hasMaxes },
    { id: "block-duplicate", label: t.duplicateBlock, icon: <Copy />, isDisabled: !ownBlock },
    { id: "block-remove", label: t.removeBlock, icon: <Trash2 />, tone: "danger", isDisabled: !ownBlock || doc.blocks.length < 2 },
    { type: "separator", id: "s2" },
    { id: "comment", label: t.addComment, icon: <MessageSquare /> },
    { id: "goal", label: t.addGoal, icon: <Target /> },
  ];
  const onAction = (id: string) => {
    if (id === "cycle-settings" && current) onEditNode(current.cycle.id);
    else if (id === "cycle-duplicate" && current) {
      expectNew();
      apply((d) => duplicateNode(d, current.cycle.id).doc);
    } else if (id === "cycle-remove" && current) {
      const next = cycles.find((item) => item.cycle.id !== current.cycle.id);
      apply((d) => removeNode(d, current.cycle.id));
      if (next) onSelectCycle(next.cycle.id);
    } else if (id === "block-settings" && block) onEditNode(block.id);
    else if (id === "block-active" && block) apply((d) => updateNode(d, block.id, { inactive: block.inactive ? null : true }));
    else if (id === "progression" && block) setProgression(block.id);
    else if (id === "maxes" && block) apply((d) => withMaxesTables(d, [...maxesTables(d), { id: crypto.randomUUID(), blockId: block.id, rows: [] }]));
    else if (id === "block-duplicate" && block) apply((d) => duplicateNode(d, block.id).doc);
    else if (id === "block-remove" && block) {
      const next = cycles.find((item) => item.block.id !== block.id);
      apply((d) => removeNode(d, block.id));
      if (next) onSelectCycle(next.cycle.id);
    } else if (id === "comment") addNote("Comment");
    else if (id === "goal") addNote("Goal");
  };

  return (
    <div data-tip="table-structure" className={styles.structure}>
      {/* Block and cycle are picked apart: first the block, then one of its cycles. */}
      {block ? (
        <Select label={t.block} size="sm" selectedKey={block.id} onSelectionChange={(key) => key && openBlock(String(key))} className={styles.blockSelect}>
          {doc.blocks.map((b) => (
            <Option key={b.id} id={b.id}>{`${nodeLabel(b, blockLabels)}${b.inactive ? ` (${t.inactiveShort})` : ""}`}</Option>
          ))}
        </Select>
      ) : null}
      {block && current ? (
        <Select label={t.cycle} size="sm" selectedKey={current.cycle.id} onSelectionChange={(key) => key && onSelectCycle(String(key))} className={styles.cycleSelect}>
          {block.cycles.map((cycle) => (
            <Option key={cycle.id} id={cycle.id}>{cycle.implicit ? `${cycle.days[0]?.workouts[0]?.name || m.editor.untitled} · ${m.editor.noCycle}` : `${cycle.name || m.editor.untitled} · ${s.cycleLength(Number(cycle.dayCount))}`}</Option>
          ))}
        </Select>
      ) : null}
      {current ? (
        <Select label={t.repeats} size="sm" className={styles.repeatSelect}
          selectedKey={cycleRuns(doc, current.cycle) === null ? "open" : String(cycleRuns(doc, current.cycle))}
          onSelectionChange={(key) => {
            if (!key) return;
            const repeats = key === "open" ? null : Number(key);
            apply((d) => updateNode(d, current.cycle.id, { repeats }));
          }}>
          {[
            ...(countedCycles(doc) === 1 && !current.cycle.implicit ? [<Option key="open" id="open">{t.repeatOpen}</Option>] : []),
            ...REPEAT_CHOICES.map((n) => <Option key={n} id={String(n)}>{t.repeatTimes(n)}</Option>),
          ]}
        </Select>
      ) : null}
      <div className={styles.structureActions}>
        <Button size="sm" variant="secondary" iconStart={<Plus />} onPress={addCycleHere}>{t.addCycle}</Button>
        <Button size="sm" variant="ghost" iconStart={<Plus />} onPress={addBlockHere}>{t.addBlock}</Button>
        <IconButton label={t.planActions} icon={<MoreHorizontal />} size="sm" variant="ghost"
          onPress={(event) => {
            const rect = (event.target as HTMLElement).getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom + 4 });
          }} />
      </div>
      {block?.inactive ? (
        <p className={styles.inactiveNote}>
          <PowerOff aria-hidden="true" />
          <span>{t.blockInactiveNote}</span>
          <button type="button" className={styles.copyCancel} onClick={() => apply((d) => updateNode(d, block.id, { inactive: null }))}>{t.activateBlock}</button>
        </p>
      ) : null}
      {menu ? <ContextMenu x={menu.x} y={menu.y} label={t.planActions} items={items} onAction={onAction} onClose={() => setMenu(null)} /> : null}
      <ProgressionDialog blockId={progression} doc={doc} names={names} apply={apply} onClose={() => setProgression(null)} />
    </div>
  );
}

/** Plan comments and goals for the cycle in view, edited in place: text, who sees it, and removal. */
export function NotesEditor({ notes, apply }: { notes: PlanAnnotation[]; apply: Apply }) {
  const m = useT();
  const t = m.editor.week;
  const patch = (id: string, change: Partial<PlanAnnotation>) => apply((d) => ({ ...d, annotations: (d.annotations ?? []).map((note) => (note.id === id ? { ...note, ...change } : note)) }));
  const remove = (id: string) => apply((d) => ({ ...d, annotations: (d.annotations ?? []).filter((note) => note.id !== id) }));
  if (!notes.length) return null;
  return (
    <ul className={styles.planNotes} aria-label={t.notes}>
      {notes.map((note) => (
        <li key={note.id} className={styles.planNote} data-kind={note.kind} data-editable>
          <span className={styles.planNoteIcon} aria-hidden="true">{note.kind === "Goal" ? <Target /> : <MessageSquare />}</span>
          <span className={styles.planNoteText}>
            <span className={styles.planNoteMeta}>
              {note.kind === "Goal" ? t.goal : t.comment}
              <select className={styles.planNoteVisibility} aria-label={t.whoSees} value={note.visibility} onChange={(event) => patch(note.id, { visibility: event.target.value as PlanAnnotation["visibility"] })}>
                <option value="Coach">{t.coachOnly}</option>
                <option value="Client">{t.visibleToClient}</option>
              </select>
            </span>
            <textarea className={styles.planNoteInput} aria-label={note.kind === "Goal" ? t.goal : t.comment} value={note.content} maxLength={4000} rows={2}
              placeholder={note.kind === "Goal" ? t.goalPlaceholder : t.commentPlaceholder} onChange={(event) => patch(note.id, { content: event.target.value })} />
          </span>
          <button type="button" className={styles.planNoteRemove} aria-label={t.removeNote} title={t.removeNote} onClick={() => remove(note.id)}><X aria-hidden="true" /></button>
        </li>
      ))}
    </ul>
  );
}

/** The block's exercise maxes (for %1RM and formulas), shown under the day in table mode. */
export function BlockMaxes({ doc, block, apply, names }: { doc: TrainingDocument; block: Block | undefined; apply?: Apply; names: Map<string, ExerciseLabel> }) {
  const tables = block ? maxesTables(doc).filter((table) => table.blockId === block.id) : [];
  const none = () => undefined;
  if (!tables.length) return null;
  return (
    <div className={styles.maxes}>
      {tables.map((table) => (
        <BlockMaxesTable key={table.id} table={table} apply={apply} names={names} style={{ position: "relative", left: 0, top: 0, width: 520 }}
          onPointerDown={none} onPointerMove={none} onPointerUp={none} />
      ))}
    </div>
  );
}

/** Every set of one workout, one by one (set types, per-set load, formulas): the sheet's set editor in a dialog. */
export function SetsDialog({ editor, workout, names, advancedAllowed, customFormulas, onClose }: {
  editor: EditorApi; workout: Workout | null; names: Map<string, ExerciseLabel>; advancedAllowed: boolean; customFormulas: boolean; onClose: () => void;
}) {
  const t = useT().editor.week;
  return (
    <Dialog isOpen={Boolean(workout)} onOpenChange={(open) => { if (!open) onClose(); }} title={workout ? t.setsTitle(workout.name || "") : ""} size="xl">
      {workout ? <WorkoutEditor editor={editor} workout={workout} names={names} advancedAllowed={advancedAllowed} customFormulas={customFormulas} readOnly={false} /> : null}
    </Dialog>
  );
}
