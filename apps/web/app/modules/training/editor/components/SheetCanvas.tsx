import { useColumnWidths } from "../useColumnWidths";
import { elementColumnWidths, sanitizeElementWidths, type ElementWidths } from "../model/layout";
import { AnnotationCard } from "./AnnotationCard";
import { connectBounds, cablePath, handleStyle, plugRotation, type Bounds } from "../model/connections";
import { SheetMenuButton as MenuButton } from "./SheetMenuButton";
import { maxesTables, withMaxesTables, effectiveBlock } from "../model/maxes";
import {
  ArrowDown,
  BarChart3,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  Copy,
  Dumbbell,
  Hand,
  LayoutGrid,
  Link2,
  ListTree,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RotateCcw,
  Repeat,
  Sigma,
  SquareDashedMousePointer,
  Trash2,
  TrendingUp,
  Unlink,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Block, Cycle, ExerciseInstance, FormulaUse, TrainingDocument, Workout } from "@metrivum/api-client-web";
import { AlertDialog, Button, ContextMenu, IconButton, InfoTip, Segment, SegmentedControl, Tooltip, TooltipTrigger, type ContextMenuEntry } from "@metrivum/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useAccountContext } from "~/shared/session/AccountScope";
import { useT } from "~/shared/i18n/AppLocale";
import { useBuiltInFormulas, useFormulaList } from "../../queries";
import { setExerciseFormula } from "../model/cells";
import { REPEAT_CHOICES, WORKOUT_COLS, cycleCalendar, cycleRuns, cycleWorkouts, nextWorkoutLetter, setDayNote, withDayNote, withWorkout, withoutWorkout, workoutCardRows } from "../model/workouts";
import { addBlock, addCycle, cloneWithNewIds, duplicateNode, findWorkout, locate, moveNode, newCycle, newWorkout, removeNode, updateNode } from "../model/document";
import { BLOCK_COLS, CELL_H, CELL_W, CYCLE_COLS, autoLayout, cycleRows, mergeLayout, resolveLayout, snap, columnAt, columnLeft, columnSpan, columnWidth, clampColumnWidth, resizedColumnWidth, sanitizeColumnWidths, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH, MAX_SAVED_COLUMNS, type ColumnWidths, type Cell, type Layout, type Size } from "../model/layout";
import { attachCycle, detachCycle } from "../model/structure";
import type { EditorApi } from "../useEditor";
import { ProgressionDialog } from "./ProgressionDialog";
import { VolumePanel } from "./VolumePanel";
import { SheetMinimap, type MinimapNode } from "./SheetMinimap";
import { BlockFormulaScope } from "../block-maxes";
import { BlockMaxesTable } from "./BlockMaxesTable";
import { WorkoutEditor } from "./WorkoutEditor";
import { LooseFlag, WorkoutCard } from "./WorkoutCard";
import styles from "./SheetCanvas.module.css";

export interface SheetState {
  layout: Layout;
  columnWidths?: ColumnWidths;
  elementWidths?: ElementWidths;
  collapsedCards?: string[];
  /** Cycles taken out of every block. They exist only here until connected again. */
  loose: Cycle[];
  /** Workouts not plugged into any cycle (new or unplugged). Like loose cycles, they exist only here. */
  looseWorkouts?: Workout[];
  /** Cycles shown as cells. */
  expanded: string[];
  /** Workouts folded inside an expanded cycle. */
  collapsedWorkouts: string[];
}

export const emptySheet: SheetState = { layout: {}, loose: [], looseWorkouts: [], expanded: [], collapsedWorkouts: [] };

const isCell = (v: unknown): v is Cell =>
  typeof v === "object" && v !== null && Number.isInteger((v as Cell).col) && Number.isInteger((v as Cell).row) && (v as Cell).col >= 0 && (v as Cell).row >= 0;
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * The sheet's arrangement (positions, column widths and folded cards) for one account and plan, kept in
 * this browser so the editor and the program preview reopen the way they were left. Disconnected
 * cycles are plan content, not arrangement, so they are not stored. Without storage it starts from
 * the default layout.
 */
export function usePersistentSheet(planId: string): [SheetState, (next: SheetState | ((current: SheetState) => SheetState)) => void] {
  const { accountKey, lifecycle } = useAccountContext();
  const key = `tf.sheet.${accountKey}.${planId}`;
  const activeKey = useRef(key);
  activeKey.current = key;
  const read = (): SheetState => {
    try {
      const raw = typeof window === "undefined" ? null : window.localStorage.getItem(key);
      if (!raw) return emptySheet;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      const layout = Object.fromEntries(Object.entries((saved.layout as Record<string, unknown>) ?? {}).filter(([, cell]) => isCell(cell))) as Layout;
      return { ...emptySheet, layout, expanded: ids(saved.expanded), collapsedCards: ids(saved.collapsedCards), collapsedWorkouts: ids(saved.collapsedWorkouts), elementWidths: sanitizeElementWidths(saved.elementWidths), columnWidths: sanitizeColumnWidths(saved.columnWidths) };
    } catch {
      return emptySheet;
    }
  };
  const [state, setState] = useState(() => ({ key, sheet: read() }));
  // Replace the state before children render when the plan changes; never write the old plan under a new key.
  const sheet = state.key === key ? state.sheet : read();
  if (state.key !== key) setState({ key, sheet });
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeKey.current !== key || !lifecycle.isCurrent()) return;
      try {
        window.localStorage.setItem(key, JSON.stringify({ layout: sheet.layout, expanded: sheet.expanded, collapsedWorkouts: sheet.collapsedWorkouts, columnWidths: sheet.columnWidths, elementWidths: sheet.elementWidths, collapsedCards: sheet.collapsedCards }));
      } catch {
        // Storage blocked or full: the arrangement just isn't remembered.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [key, sheet.layout, sheet.expanded, sheet.collapsedWorkouts, sheet.columnWidths, sheet.elementWidths, sheet.collapsedCards, lifecycle]);
  return [sheet, (next) => {
    if (activeKey.current !== key || !lifecycle.isCurrent()) return;
    setState((current) => ({ key, sheet: typeof next === "function" ? next(current.key === key ? current.sheet : sheet) : next }));
  }];
}

type Apply = (fn: (doc: TrainingDocument) => TrainingDocument) => void;

const BLOCK_ROWS = 3;
const HEADER = 24; // column-letter strip and row-number gutter
/** Zoomed out to 40% at most; the sheet always has enough cells to fill the screen at that zoom. */
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.8;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

function columnName(index: number): string {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

type Drag = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  origin: Cell;
  dx: number;
  dy: number;
  moved: boolean;
  renameKey?: string;
  /** Selected cards that move with this one (their starting cells). */
  group: Record<string, Cell>;
};
type Marquee = { pointerId: number; x0: number; y0: number; x1: number; y1: number };
type Link = { kind: "cycle" | "maxes" | "annotation" | "workout"; targetId?: string; hoveredId?: string; blockId: string; pointerId: number; x: number; y: number;
  /** Set when an attached plug is picked up: the edge it came from, so dropping elsewhere moves it and dropping on nothing unplugs it. */
  rewire?: { edgeId: string; target: string } };
type Menu =
  | { kind: "column"; x: number; y: number; col: number; owner?: string }
  | { kind: "canvas"; x: number; y: number; cell: Cell }
  | { kind: "block"; x: number; y: number; id: string }
  | { kind: "cycle"; x: number; y: number; id: string }
  | { kind: "edge"; x: number; y: number; cycleId: string; workoutId?: string }
  | { kind: "workout"; x: number; y: number; id: string }
  | { kind: "exercise"; x: number; y: number; instance: ExerciseInstance; workout: Workout }
  | { kind: "dayNote"; x: number; y: number; cycleId: string; dayNumber: number; note: string };

/**
 * Advanced mode: a spreadsheet-like sheet. Blocks and cycles are cards placed anywhere on the
 * cells. Dragging from a block's handle onto a cycle connects them; right click opens context
 * menus everywhere (sheet, cards, connections, exercise cells). Clicking a cycle expands it into
 * cells: one column group per day, workouts and exercises edited in place. Ctrl + scroll zooms;
 * the minimap moves the view. Arrangement and column widths are remembered per account and plan.
 *
 * Without `apply` the sheet is a read-only preview (pan, zoom, expand only).
 */
const DRAG_MODE_KEY = "tf.sheet.dragMode";

export function SheetCanvas({
  doc,
  apply,
  sheet,
  onSheetChange,
  names,
  advancedAllowed = false,
  customFormulas = false,
  onEditNode,
  editor,
  className,
  initialZoom = 1,
}: {
  doc: TrainingDocument;
  apply?: Apply;
  sheet: SheetState;
  onSheetChange: (next: SheetState | ((current: SheetState) => SheetState)) => void;
  names: Map<string, ExerciseLabel>;
  advancedAllowed?: boolean;
  customFormulas?: boolean;
  onEditNode?: (id: string) => void;
  /** Enables the detailed set editor panel (editor only). */
  editor?: EditorApi;
  className?: string;
  /** Starting zoom (e.g. smaller cards in a preview). */
  initialZoom?: number;
}) {
  const m = useT();
  const t = m.editor.sheet;
  const readOnly = !apply;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pointerCapture = useRef<{ element: Element; pointerId: number } | null>(null);
  const resizing = useRef<{ col: number; pointerId: number; x: number; width: number; resize: (col: number, width: number) => void } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [maxesMenu, setMaxesMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  // Each card's real box on the sheet (offset from its cell and size), so cables meet the card edges exactly.
  const [nodeBoxes, setNodeBoxes] = useState<Record<string, { dx: number; dy: number; w: number; h: number }>>({});
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [openWorkout, setOpenWorkout] = useState<string | null>(null);
  const [progressionBlock, setProgressionBlock] = useState<string | null>(null);
  const [zoom, setZoom] = useState(initialZoom);
  // Zoom glides: each change sets a goal and the sheet eases towards it over a few frames.
  const zoomNow = useRef(initialZoom);
  zoomNow.current = zoom;
  const zoomGoal = useRef<number | null>(null);
  const zoomFrame = useRef(0);
  const glideZoom = (goal: number, anchor: { bx: number; by: number; px: number; py: number } | null) => {
    zoomGoal.current = goal;
    if (anchor) zoomAnchor.current = anchor;
    if (zoomFrame.current) return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = () => {
      const target = zoomGoal.current;
      if (target == null) { zoomFrame.current = 0; return; }
      const current = zoomNow.current;
      const next = reduce || Math.abs(target - current) < 0.004 ? target : current + (target - current) * 0.28;
      zoomNow.current = next;
      if (next === target) { zoomGoal.current = null; zoomFrame.current = 0; }
      else zoomFrame.current = requestAnimationFrame(step);
      setZoom(next);
    };
    zoomFrame.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(zoomFrame.current), []);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const zoomAnchor = useRef<{ bx: number; by: number; px: number; py: number } | null>(null);

  const cancelPointer = useCallback(() => {
    const captured = pointerCapture.current;
    pointerCapture.current = null;
    resizing.current = null;
    document.body.removeAttribute("data-training-column-resize");
    setDrag(null);
    setMarquee(null);
    setLink(null);
    if (captured?.element.hasPointerCapture?.(captured.pointerId)) captured.element.releasePointerCapture(captured.pointerId);
  }, []);
  const capturePointer = (event: ReactPointerEvent) => {
    pointerCapture.current = { element: event.currentTarget, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  useEffect(() => { if (menu) cancelPointer(); }, [menu, cancelPointer]);
  useEffect(() => () => { document.body.removeAttribute("data-training-column-resize"); }, []);

  // A cycle back in the document (connect, undo) is no longer loose.
  const loose = useMemo(() => sheet.loose.filter((cycle) => !locate(doc, cycle.id)), [sheet.loose, doc]);
  // A workout back in the document or in a loose cycle (connect, undo) is no longer free-standing.
  const looseWorkouts = useMemo(
    () => (sheet.looseWorkouts ?? []).filter((w) => !locate(doc, w.id) && !loose.some((c) => c.days.some((d) => d.workouts.some((x) => x.id === w.id)))),
    [sheet.looseWorkouts, doc, loose],
  );
  const stored = useMemo(() => mergeLayout(sheet.layout, doc, loose, looseWorkouts), [sheet.layout, doc, loose, looseWorkouts]);
  const workout = openWorkout ? findWorkout(doc, openWorkout) : null;

  useEffect(() => {
    if (openWorkout && !workout) setOpenWorkout(null);
  }, [openWorkout, workout]);

  const update = (fn: (s: SheetState) => SheetState) => onSheetChange(fn);
  const place = (id: string, cell: Cell) => update((s) => ({ ...s, layout: { ...mergeLayout(s.layout, doc, loose, looseWorkouts), [id]: cell } }));
  const setLoose = (fn: (cycles: Cycle[]) => Cycle[]) => update((s) => ({ ...s, loose: fn(s.loose.filter((c) => !locate(doc, c.id))) }));
  const setLooseWorkouts = (fn: (workouts: Workout[]) => Workout[]) => update((s) => ({ ...s, looseWorkouts: fn((s.looseWorkouts ?? []).filter((w) => !locate(doc, w.id))) }));

  // Sizes in cells; expanded cycles take one column group per day.
  const allCycles = useMemo(
    () => [...doc.blocks.flatMap((block) => block.cycles.map((cycle) => ({ cycle, blockId: block.id as string | null }))), ...loose.map((cycle) => ({ cycle, blockId: null }))],
    [doc, loose],
  );
  const collapsedCards = useMemo(() => new Set(sheet.collapsedCards ?? []), [sheet.collapsedCards]);
  const toggleCard = (id: string) => update(s => ({ ...s, collapsedCards: collapsedCards.has(id) ? [...collapsedCards].filter(value => value !== id) : [...collapsedCards, id] }));
  // Every workout card: the ones plugged into a cycle (with their day) and the free-standing ones.
  const allWorkouts = useMemo(
    () => [
      ...allCycles.flatMap(({ cycle }) => cycleWorkouts(cycle).map(({ workout, dayNumber }) => ({ workout, cycle: cycle as Cycle | null, dayNumber: dayNumber as number | null }))),
      ...looseWorkouts.map((workout) => ({ workout, cycle: null as Cycle | null, dayNumber: null as number | null })),
    ],
    [allCycles, looseWorkouts],
  );
  const sizes = useMemo(() => {
    const result: Record<string, Size> = {};
    for (const block of doc.blocks) {
      result[block.id] = { cols: BLOCK_COLS, rows: BLOCK_ROWS };

    }
    // A minimised cycle is the size of a block without its description: its header and name.
    for (const { cycle } of allCycles) result[cycle.id] = collapsedCards.has(cycle.id) ? { cols: BLOCK_COLS, rows: 2 } : { cols: CYCLE_COLS, rows: cycleRows(cycle) };
    // A folded workout shrinks to a narrow header; open, it spans the exercise columns.
    for (const { workout } of allWorkouts) result[workout.id] = collapsedCards.has(workout.id) ? { cols: CYCLE_COLS, rows: 1 } : { cols: WORKOUT_COLS, rows: workoutCardRows(workout, false, !readOnly) };
    for (const table of maxesTables(doc)) result[table.id] = { cols: collapsedCards.has(table.id) ? 2 : 5, rows: collapsedCards.has(table.id) ? 2 : table.rows.length + 3 };
    for (const note of doc.annotations ?? []) result[note.id] = { cols: 3, rows: collapsedCards.has(note.id) ? 2 : 5 };
    return result;
  }, [doc, allCycles, allWorkouts, readOnly, collapsedCards]);
  // Where cards are drawn: no overlaps; a card that would land on another moves down.
  const layout = useMemo(() => resolveLayout(stored, sizes), [stored, sizes]);

  const targetWidths = useMemo(() => elementColumnWidths(sheet.columnWidths, stored, sheet.elementWidths, new Set([...allWorkouts.filter(w => !collapsedCards.has(w.workout.id)).map(w => w.workout.id), ...maxesTables(doc).filter(t => !collapsedCards.has(t.id)).map(t => t.id)])), [sheet.columnWidths, sheet.elementWidths, stored, allWorkouts, doc, collapsedCards]);
  const widths = useColumnWidths(targetWidths, Boolean(resizing.current));
  const xAt = (col: number) => columnLeft(widths, col);
  const span = (col: number, count: number) => columnSpan(widths, col, count);
  const resizeColumn = (col: number, width: number) => update(s => ({ ...s, columnWidths: { ...s.columnWidths, [col]: clampColumnWidth(width) }, elementWidths: Object.fromEntries(Object.entries(s.elementWidths ?? {}).map(([id, values]) => [id, Object.fromEntries(Object.entries(values).filter(([relative]) => (stored[id]?.col ?? -100) + Number(relative) !== col))])) }));
  const resizeElementColumn = (id: string, col: number, width: number) => update(s => ({ ...s, elementWidths: { ...s.elementWidths, [id]: { ...s.elementWidths?.[id], [col]: clampColumnWidth(width) } } }));

  const resizeHandle = (col: number, width: number, resize: (col: number, width: number) => void, label: string, owner?: string) => (<button
                    type="button"
                    className={styles.columnResize}
                    title="Drag to resize. Double-click or right-click to reset."
                    aria-label={label}
                    aria-valuemin={MIN_COLUMN_WIDTH}
                    aria-valuemax={MAX_COLUMN_WIDTH}
                    aria-valuenow={width}
                    role="separator"
                    aria-orientation="vertical"
                    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ kind: "column", col, owner, x: event.clientX, y: event.clientY }); }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || menu) return;
                      event.stopPropagation();
                      capturePointer(event);
                      document.body.setAttribute("data-training-column-resize", "");
                      resizing.current = { col, pointerId: event.pointerId, x: event.clientX, width: width, resize };
                    }}
                    onPointerMove={(event) => {
                      const start = resizing.current;
                      if (!start || start.pointerId !== event.pointerId) return;
                      event.stopPropagation();
                      start.resize(start.col, resizedColumnWidth(start.width, event.clientX - start.x, zoom));
                    }}
                    onPointerUp={(event) => { event.stopPropagation(); cancelPointer(); }}
                    onPointerCancel={cancelPointer}
                    onLostPointerCapture={cancelPointer}
                    onDoubleClick={(event) => { event.stopPropagation(); resize(col, CELL_W); }}
                    onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                      event.preventDefault();
                      event.stopPropagation();
                      resize(col, event.key === "Home" ? MIN_COLUMN_WIDTH : event.key === "End" ? MAX_COLUMN_WIDTH : width + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 32 : 8));
                    }}
                  />);
  const columnMenu = (owner: string, col: number, event: React.MouseEvent) => { event.preventDefault(); event.stopPropagation(); setMenu({ kind: "column", owner, col, x: event.clientX, y: event.clientY }); };
  const elementResizeHandle = (id: string, relative: number, label: string) => resizeHandle(relative, columnWidth(targetWidths, (stored[id]?.col ?? 0) + relative), (col, width) => resizeElementColumn(id, col, width), `Resize ${label} column in element`, id);

  // Enough cells, letters and row numbers to fill the screen even fully zoomed out.
  const fillCols = columnAt(widths, Math.max(0, viewport.w / MIN_ZOOM - HEADER)) + 2;
  const fillRows = Math.ceil((viewport.h / MIN_ZOOM - HEADER) / CELL_H) + 1;
  const cols = Math.max(26, fillCols, ...Object.entries(sizes).map(([id, s]) => (layout[id]?.col ?? 0) + s.cols + 6));
  const rows = Math.max(40, fillRows, ...Object.entries(sizes).map(([id, s]) => (layout[id]?.row ?? 0) + s.rows + 10));
  const boardW = HEADER + xAt(cols);
  const boardH = HEADER + rows * CELL_H;

  // Viewport tracking for the minimap ---------------------------------------------------------
  const syncView = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setView({ x: el.scrollLeft / zoom, y: el.scrollTop / zoom, w: el.clientWidth / zoom, h: el.clientHeight / zoom });
    setViewport((v) => (v.w === el.clientWidth && v.h === el.clientHeight ? v : { w: el.clientWidth, h: el.clientHeight }));
  }, [zoom]);
  useEffect(() => {
    syncView();
    const el = scrollerRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncView);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(syncView);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [syncView]);

  // Ctrl + wheel zooms around the pointer (a non-passive listener so the browser doesn't zoom the page).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      // Proportional to the scroll (≈ ×1.2 per wheel notch, finer on trackpads), from where the zoom is heading.
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const base = zoomGoal.current ?? zoomNow.current;
      glideZoom(clampZoom(base * Math.exp(-delta * 0.0018)), { bx: (el.scrollLeft + px) / zoomNow.current, by: (el.scrollTop + py) / zoomNow.current, px, py });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const anchor = zoomAnchor.current;
    if (el && anchor) {
      el.scrollLeft = anchor.bx * zoom - anchor.px;
      el.scrollTop = anchor.by * zoom - anchor.py;
      // The anchor holds while a glide is under way, so the point under the pointer stays put throughout.
      if (zoomGoal.current == null) zoomAnchor.current = null;
    }
    syncView();
  }, [zoom, syncView]);

  const zoomTo = (next: number | "reset") => {
    const el = scrollerRef.current;
    const target = next === "reset" ? 1 : clampZoom(next);
    glideZoom(target, el ? { bx: (el.scrollLeft + el.clientWidth / 2) / zoom, by: (el.scrollTop + el.clientHeight / 2) / zoom, px: el.clientWidth / 2, py: el.clientHeight / 2 } : null);
  };
  const navigate = (cx: number, cy: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: cx * zoom - el.clientWidth / 2, top: cy * zoom - el.clientHeight / 2 });
  };

  /** Pointer position in board (cell area) coordinates, independent of zoom and scroll. */
  const toBoard = (clientX: number, clientY: number) => {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom - HEADER, y: (clientY - rect.top) / zoom - HEADER };
  };

  // Moving cards ---------------------------------------------------------------------------
  const startDrag = (event: ReactPointerEvent, id: string) => {
    if (event.button !== 0 || menu) return;
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(target) || target.closest("input, textarea, button, a, select, [contenteditable=true], [role=textbox], [role=menu], [role=dialog], [data-no-drag]")) return;
    capturePointer(event);
    const renameKey = readOnly ? undefined : target.closest<HTMLElement>("[data-rename]")?.dataset.rename;
    // Shift adds or removes a card from the selection; pressing a selected card drags the whole selection.
    let members = selected.includes(id) ? selected : [id];
    if (event.shiftKey && !readOnly) {
      members = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
      setSelected(members);
    } else if (!selected.includes(id)) setSelected([]);
    const group = Object.fromEntries(members.filter((x) => layout[x]).map((x) => [x, layout[x]!]));
    setDrag({ id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: layout[id]!, dx: 0, dy: 0, moved: false, renameKey: event.shiftKey ? undefined : renameKey, group });
  };
  const moveDrag = (event: ReactPointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    if (readOnly) return;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3 });
  };
  const endDrag = (event: ReactPointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      // Everything in the group moves by the same number of cells.
      const dc = columnAt(widths, xAt(drag.origin.col) + drag.dx, true) - drag.origin.col;
      const dr = snap(drag.origin.row * CELL_H + drag.dy, CELL_H) - drag.origin.row;
      if (dc || dr) {
        const moves = Object.fromEntries(Object.entries(drag.group).map(([id, at]) => [id, { col: Math.max(0, at.col + dc), row: Math.max(0, at.row + dr) }]));
        update((s) => ({ ...s, layout: { ...mergeLayout(s.layout, doc, loose, looseWorkouts), ...moves } }));
      }
    } else if (drag.renameKey) {
      // A click (no drag) on a name edits it; pressing and dragging still moves the card.
      setRenaming(drag.renameKey);
    }
    // Cycles open only from their arrow or a training day, never from a click on the card.
    cancelPointer();
  };
  const cardKeys = (event: React.KeyboardEvent, id: string, kind: "block" | "cycle" | "workout") => {
    if (event.target !== event.currentTarget) return;
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ kind, x: rect.left + 12, y: rect.top + 24, id } as Menu);
      return;
    }
    if (readOnly) return;
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const at = layout[id]!;
    place(id, { col: Math.max(0, at.col + delta[0]!), row: Math.max(0, at.row + delta[1]!) });
  };

  // Empty cells: dragging moves the view around the sheet; with Ctrl (⌘ on a Mac) held it selects every card the
  // rectangle touches. -------------------------------------------------------------------------
  const pan = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  // What a plain drag on the empty sheet does; Ctrl / ⌘ always does the other one. Remembered in this browser.
  const [dragMode, setDragModeState] = useState<"pan" | "select">(() => {
    try { return typeof window !== "undefined" && window.localStorage.getItem(DRAG_MODE_KEY) === "select" ? "select" : "pan"; } catch { return "pan"; }
  });
  const setDragMode = (mode: "pan" | "select") => {
    setDragModeState(mode);
    try { window.localStorage.setItem(DRAG_MODE_KEY, mode); } catch { /* storage unavailable */ }
  };
  // Holding Ctrl / ⌘ switches the cursor to the selection crosshair.
  const [selectKey, setSelectKey] = useState(false);
  useEffect(() => {
    const sync = (event: KeyboardEvent) => setSelectKey(event.ctrlKey || event.metaKey);
    const clear = () => setSelectKey(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", sync); window.removeEventListener("keyup", sync); window.removeEventListener("blur", clear); };
  }, []);
  const startMarquee = (event: ReactPointerEvent) => {
    if (menu || event.button !== 0 || !event.currentTarget.contains(event.target as Node) || (event.target as HTMLElement).closest("[data-node], [data-edge], [data-no-drag], [role=menu], [role=dialog], button, input, textarea")) return;
    const select = (event.ctrlKey || event.metaKey) !== (dragMode === "select");
    if (!select || readOnly) {
      const el = scrollerRef.current;
      if (!el) return;
      event.preventDefault();
      capturePointer(event);
      pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
      setPanning(true);
      return;
    }
    capturePointer(event);
    const p = toBoard(event.clientX, event.clientY);
    setMarquee({ pointerId: event.pointerId, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const endPan = (event: ReactPointerEvent) => {
    const grab = pan.current;
    if (!grab || event.pointerId !== grab.pointerId) return false;
    // A click on the empty sheet, without moving it, clears the selection as before.
    if (Math.abs(event.clientX - grab.x) < 4 && Math.abs(event.clientY - grab.y) < 4 && selected.length) setSelected([]);
    pan.current = null;
    setPanning(false);
    cancelPointer();
    return true;
  };
  const moveMarquee = (event: ReactPointerEvent) => {
    const grab = pan.current;
    if (grab && event.pointerId === grab.pointerId) {
      const el = scrollerRef.current;
      if (el) {
        el.scrollLeft = grab.left - (event.clientX - grab.x);
        el.scrollTop = grab.top - (event.clientY - grab.y);
      }
      return;
    }
    if (!marquee || event.pointerId !== marquee.pointerId) return;
    const p = toBoard(event.clientX, event.clientY);
    setMarquee({ ...marquee, x1: p.x, y1: p.y });
  };
  const endMarquee = (event: ReactPointerEvent) => {
    if (endPan(event)) return;
    if (!marquee || event.pointerId !== marquee.pointerId) return;
    const left = Math.min(marquee.x0, marquee.x1);
    const right = Math.max(marquee.x0, marquee.x1);
    const top = Math.min(marquee.y0, marquee.y1);
    const bottom = Math.max(marquee.y0, marquee.y1);
    const tiny = right - left < 4 && bottom - top < 4;
    const hit = tiny
      ? []
      : Object.entries(sizes)
          .filter(([id, size]) => {
            const at = layout[id];
            if (!at) return false;
            const x = xAt(at.col);
            const y = at.row * CELL_H;
            return x < right && x + span(at.col, size.cols) > left && y < bottom && y + size.rows * CELL_H > top;
          })
          .map(([id]) => id);
    setSelected(event.shiftKey ? [...new Set([...selected, ...hit])] : hit);
    cancelPointer();
  };

  // Connecting -------------------------------------------------------------------------------
  const connect = (blockId: string, cycleId: string) => {
    const inDoc = locate(doc, cycleId);
    const cycle = inDoc?.kind === "cycle" ? doc.blocks[inDoc.blockIndex]!.cycles[inDoc.cycleIndex!]! : loose.find((c) => c.id === cycleId);
    if (!cycle) return;
    apply?.((current) => attachCycle(current, cycle, blockId));
  };
  const disconnect = (cycleId: string) => {
    const result = detachCycle(doc, cycleId);
    if (!result.cycle || !apply) return;
    const cycle = result.cycle;
    apply(() => result.doc);
    setLoose((cycles) => [...cycles.filter((c) => c.id !== cycle.id), cycle]);
  };

  // Workouts: a cable from a cycle's handle to a workout card puts the workout on that cycle (on its old day when it
  // fits, else the first free day). Pulling the plug out leaves the workout on the sheet, unsaved, until plugged in.
  const cycleIn = (d: TrainingDocument, id: string) => {
    const at = locate(d, id);
    return at?.kind === "cycle" ? d.blocks[at.blockIndex]!.cycles[at.cycleIndex!]! : null;
  };
  const homeOf = (workoutId: string) => allWorkouts.find((w) => w.workout.id === workoutId);
  /** Takes the workout off whatever holds it now (a cycle in the plan, a loose cycle or the free list). */
  const takeOut = (workoutId: string, d: TrainingDocument): TrainingDocument => {
    const home = homeOf(workoutId);
    if (home?.cycle && locate(d, home.cycle.id)) {
      const cycle = cycleIn(d, home.cycle.id);
      return cycle ? updateNode(d, cycle.id, { days: withoutWorkout(cycle, workoutId).cycle.days }) : d;
    }
    if (home?.cycle) setLoose((cycles) => cycles.map((c) => (c.id === home.cycle!.id ? withoutWorkout(c, workoutId).cycle : c)));
    else setLooseWorkouts((list) => list.filter((w) => w.id !== workoutId));
    return d;
  };
  const connectWorkout = (cycleId: string, workoutId: string) => {
    const home = homeOf(workoutId);
    if (!home || !apply || home.cycle?.id === cycleId) return;
    const { workout, dayNumber } = home;
    if (locate(doc, cycleId)) {
      apply((d) => {
        const next = takeOut(workoutId, d);
        const cycle = cycleIn(next, cycleId);
        return cycle ? updateNode(next, cycleId, { days: withWorkout(cycle, workout, dayNumber).days }) : next;
      });
    } else {
      if (home.cycle && locate(doc, home.cycle.id)) apply((d) => takeOut(workoutId, d));
      else takeOut(workoutId, doc);
      setLoose((cycles) => cycles.map((c) => (c.id === cycleId ? withWorkout(c, workout, dayNumber) : c)));
    }
  };
  const disconnectWorkout = (workoutId: string) => {
    const home = homeOf(workoutId);
    if (!home?.cycle || !apply) return;
    if (locate(doc, home.cycle.id)) apply((d) => takeOut(workoutId, d));
    else takeOut(workoutId, doc);
    setLooseWorkouts((list) => [...list.filter((w) => w.id !== workoutId), home.workout]);
  };
  /**
   * Edits to a workout outside the plan (free-standing or in a loose cycle) go to the sheet: the same document
   * operations run on a small document holding just that cycle or workout.
   */
  const applyFor = (workoutId: string): Apply | undefined => {
    if (!apply) return undefined;
    const home = homeOf(workoutId);
    if (!home || locate(doc, workoutId)) return apply;
    const wrap = (cycle: Cycle) => ({ schemaVersion: 1, blocks: [{ id: "sheet-block", name: "", description: "", cycles: [cycle] }] }) as unknown as TrainingDocument;
    if (home.cycle) {
      const cycleId = home.cycle.id;
      return (fn) => setLoose((cycles) => cycles.map((c) => (c.id === cycleId ? (fn(wrap(c)).blocks[0]?.cycles[0] ?? c) : c)));
    }
    return (fn) => setLooseWorkouts((list) => list.map((w) => {
      if (w.id !== workoutId) return w;
      const holder = { ...newCycle("", 1), days: [{ id: "sheet-day", dayNumber: 1, note: "", workouts: [w] }] } as unknown as Cycle;
      return fn(wrap(holder)).blocks[0]?.cycles[0]?.days[0]?.workouts.find((x) => x.id === workoutId) ?? w;
    }));
  };
  const addWorkoutAt = (cell: Cell | null) => {
    const workout = newWorkout(t.workoutName(String.fromCharCode(65 + (allWorkouts.length % 26))));
    setLooseWorkouts((list) => [...list, workout]);
    if (cell) update((s) => ({ ...s, layout: { ...s.layout, [workout.id]: cell } }));
  };
  const addWorkoutToCycle = (cycleId: string) => {
    const cycle = allCycles.find((c) => c.cycle.id === cycleId)?.cycle;
    if (!cycle) return;
    const workout = newWorkout(t.workoutName(nextWorkoutLetter(cycle)));
    if (locate(doc, cycleId)) apply?.((d) => { const c = cycleIn(d, cycleId); return c ? updateNode(d, cycleId, { days: withWorkout(c, workout).days }) : d; });
    else setLoose((cycles) => cycles.map((c) => (c.id === cycleId ? withWorkout(c, workout) : c)));
  };
  // A cycle is as long as its days: add one at the end, or drop the last one while it's empty.
  const canRemoveDay = (cycleId: string) => {
    const cycle = allCycles.find((c) => c.cycle.id === cycleId)?.cycle;
    const last = cycle?.days.find((d) => Number(d.dayNumber) === Number(cycle.dayCount));
    return Boolean(cycle && Number(cycle.dayCount) > 1 && !last?.workouts.length && !last?.note);
  };
  const changeDays = (cycleId: string, delta: 1 | -1) => {
    const cycle = allCycles.find((c) => c.cycle.id === cycleId)?.cycle;
    if (!cycle || (delta < 0 && !canRemoveDay(cycleId)) || (delta > 0 && Number(cycle.dayCount) >= 366)) return;
    const length = Number(cycle.dayCount) + delta;
    const next = { dayCount: length, days: cycle.days.filter((d) => Number(d.dayNumber) <= length) };
    if (locate(doc, cycleId)) apply?.((d) => updateNode(d, cycleId, next));
    else setLoose((cycles) => cycles.map((c) => (c.id === cycleId ? { ...c, ...next } : c)));
  };
  const [removingWorkout, setRemovingWorkout] = useState<Workout | null>(null);
  const removeWorkout = (workout: Workout) => {
    if (locate(doc, workout.id)) apply?.((d) => removeNode(d, workout.id));
    else takeOut(workout.id, doc);
  };
  const startLink = (event: ReactPointerEvent, blockId: string, kind: Link["kind"] = "cycle", rewire?: Link["rewire"]) => {
    if (readOnly || menu || event.button !== 0) return;
    event.stopPropagation();
    capturePointer(event);
    setLink({ kind, blockId, pointerId: event.pointerId, rewire, ...toBoard(event.clientX, event.clientY) });
  };
  const eligibleTarget = (kind: Link["kind"], source: string, target: string) => {
    if (source === target) return false;
    if (kind === "cycle") return allCycles.some(c => c.cycle.id === target);
    if (kind === "workout") return allWorkouts.some(w => w.workout.id === target && w.cycle?.id !== source);
    if (kind === "annotation") return doc.blocks.some(b => b.id === target || b.cycles.some(c => c.id === target));
    return doc.blocks.some(b => b.id === target) && !maxesTables(doc).some(t => t.id !== source && t.blockId === target);
  };
  const linkHit = (event: ReactPointerEvent, current: Link) => {
    const point = toBoard(event.clientX, event.clientY);
    const hoveredId = Object.keys(sizes).reverse().find(id => { const b = bounds(id); return id !== current.blockId && point.x >= b.left && point.x <= b.left + b.width && point.y >= b.top && point.y <= b.top + b.height; });
    return { ...current, ...point, hoveredId, targetId: hoveredId && eligibleTarget(current.kind, current.blockId, hoveredId) ? hoveredId : undefined };
  };
  const moveLink = (event: ReactPointerEvent) => {
    if (!link || event.pointerId !== link.pointerId) return;
    setLink(linkHit(event, link));
  };
  const endLink = (event: ReactPointerEvent) => {
    if (!link || event.pointerId !== link.pointerId) return;
    const { targetId, hoveredId } = linkHit(event, link);
    const old = link.rewire?.target;
    if (targetId && targetId !== old) {
      if (link.kind === "cycle") {
        // Moving the plug to another cycle: the old one comes off the block, the new one goes on.
        if (old) disconnect(old);
        connect(link.blockId, targetId);
      } else if (link.kind === "workout") {
        if (old) disconnectWorkout(old);
        connectWorkout(link.blockId, targetId);
      } else if (link.kind === "annotation") apply?.(current => ({ ...current, annotations: (current.annotations ?? []).map(n => n.id === link.blockId ? { ...n, targetId } : n) }));
      else apply?.(current => withMaxesTables(current, maxesTables(current).map(t => t.id === link.blockId ? { ...t, blockId: targetId } : t)));
    } else if (old && !targetId && !hoveredId) {
      // A plug pulled out and dropped on the empty sheet is unplugged.
      if (link.kind === "cycle") disconnect(old);
      else if (link.kind === "workout") disconnectWorkout(old);
      else if (link.kind === "annotation") apply?.(current => ({ ...current, annotations: (current.annotations ?? []).map(n => n.id === link.blockId ? { ...n, targetId: null } : n) }));
      else apply?.(current => withMaxesTables(current, maxesTables(current).map(t => t.id === link.blockId ? { ...t, blockId: null } : t)));
    }
    cancelPointer();
  };

  // Adding -----------------------------------------------------------------------------------
  const addBlockAt = (cell: Cell | null) => {
    if (!apply) return;
    const result = addBlock(doc, m.editor.blockName(doc.blocks.length + 1));
    apply(() => result.doc);
    if (cell) place(result.id, cell);
  };
  const addCycleAt = (cell: Cell | null) => {
    const total = doc.blocks.reduce((n, b) => n + b.cycles.length, 0) + loose.length;
    const cycle = newCycle(m.editor.cycleName(total + 1));
    setLoose((cycles) => [...cycles, cycle]);
    if (cell) update((s) => ({ ...s, layout: { ...s.layout, [cycle.id]: cell } }));
  };
  const onBoardContextMenu = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest("[data-node], [data-edge]")) return;
    event.preventDefault();
    const p = toBoard(event.clientX, event.clientY);
    setMenu({ kind: "canvas", x: event.clientX, y: event.clientY, cell: { col: columnAt(widths, p.x), row: Math.max(0, Math.floor(p.y / CELL_H)) } });
  };

  const pos = (id: string) => {
    const cell = layout[id] ?? { col: 0, row: 0 };
    const moving = Boolean(drag?.moved && (drag.id === id || drag.group[id]));
    return { left: xAt(cell.col) + (moving ? drag!.dx : 0), top: cell.row * CELL_H + (moving ? drag!.dy : 0), width: span(cell.col, sizes[id]!.cols), "--sheet-columns": Array.from({ length: sizes[id]!.cols }, (_, i) => `${columnWidth(widths, cell.col + i)}px`).join(" ") } as React.CSSProperties & { left: number; top: number; width: number };
  };

  useLayoutEffect(() => {
    const nodes = [...(boardRef.current?.querySelectorAll<HTMLElement>("[data-node-id]") ?? [])];
    const measure = () => {
      const next = Object.fromEntries(nodes.map(node => {
        // The card sits in its cell inset by its own margin. Read the margin, not the live position: right after a drop
        // the card is still gliding to its cell, and measuring it mid-way would leave the cable short of the card.
        const style = getComputedStyle(node);
        return [node.dataset.nodeId!, { dx: parseFloat(style.marginLeft) || 0, dy: parseFloat(style.marginTop) || 0, w: node.offsetWidth, h: node.offsetHeight }];
      }));
      const same = (a: { dx: number; dy: number; w: number; h: number } | undefined, b: { dx: number; dy: number; w: number; h: number }) => !!a && a.dx === b.dx && a.dy === b.dy && a.w === b.w && a.h === b.h;
      setNodeBoxes(current => Object.keys(current).length === Object.keys(next).length && Object.entries(next).every(([id, box]) => same(current[id], box)) ? current : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [doc, loose, looseWorkouts, layout, widths, collapsedCards]);

  // While cards glide to their new cells (after a drop or a reflow), the cables follow the cards frame by frame
  // instead of jumping straight to where the cards will end up.
  const [glide, setGlide] = useState<Record<string, { left: number; top: number }> | null>(null);
  const dragging = Boolean(drag?.moved);
  useEffect(() => {
    if (dragging) return;
    const nodes = [...(boardRef.current?.querySelectorAll<HTMLElement>("[data-node-id]") ?? [])];
    let frame = 0;
    const end = performance.now() + 380;
    const tick = () => {
      setGlide(Object.fromEntries(nodes.map(node => [node.dataset.nodeId!, { left: node.offsetLeft, top: node.offsetTop }])));
      if (performance.now() < end) frame = requestAnimationFrame(tick);
      else setGlide(null);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); setGlide(null); };
  }, [layout, widths, dragging]);

  const bounds = (id: string): Bounds => {
    const p = pos(id); const cellSize = sizes[id]!;
    const box = nodeBoxes[id];
    const live = glide?.[id];
    if (box && live) return { left: live.left, top: live.top, width: box.w, height: box.h };
    if (box) return { left: p.left + box.dx, top: p.top + box.dy, width: box.w, height: box.h };
    const isTable = maxesTables(doc).some(t => t.id === id);
    const open = isTable || (doc.annotations ?? []).some(n => n.id === id) || allWorkouts.some(w => w.workout.id === id);
    return { left: p.left + (open ? -1 : 4), top: p.top + (open ? -1 : 4), width: p.width + (open ? 2 : -8), height: cellSize.rows * CELL_H + (open ? 2 : -8) };
  };
  const rawEdges = [
    ...doc.blocks.flatMap(block => block.cycles.map(cycle => ({ id: `${block.id}-${cycle.id}`, sourceId: block.id, targetId: cycle.id, cycleId: cycle.id, tableId: undefined as string | undefined, annotationId: undefined as string | undefined, workoutId: undefined as string | undefined }))),
    ...allWorkouts.filter(w => w.cycle).map(w => ({ id: `${w.cycle!.id}-${w.workout.id}`, sourceId: w.cycle!.id, targetId: w.workout.id, cycleId: w.cycle!.id, tableId: undefined as string | undefined, annotationId: undefined as string | undefined, workoutId: w.workout.id as string | undefined })),
    ...maxesTables(doc).filter(t => t.blockId).map(t => ({ id: t.id, sourceId: t.id, targetId: t.blockId!, cycleId: "", tableId: t.id, annotationId: undefined as string | undefined, workoutId: undefined as string | undefined })),
    ...(doc.annotations ?? []).filter(n => n.targetId).map(n => ({ id: n.id, sourceId: n.id, targetId: n.targetId!, cycleId: "", tableId: undefined as string | undefined, annotationId: n.id, workoutId: undefined as string | undefined })),
  ];
  // Every card has one socket: all of its cables leave from the same point, on the side facing the middle of
  // what it connects to. Each cable then meets its target on the target's side facing that socket.
  const point = (p: { x: number; y: number }): Bounds => ({ left: p.x, top: p.y, width: 0, height: 0 });
  const sockets = new Map<string, ReturnType<typeof connectBounds>["from"]>();
  for (const sourceId of new Set(rawEdges.map((edge) => edge.sourceId))) {
    const targets = rawEdges.filter((edge) => edge.sourceId === sourceId).map((edge) => bounds(edge.targetId));
    const middle = { x: targets.reduce((n, b) => n + b.left + b.width / 2, 0) / targets.length, y: targets.reduce((n, b) => n + b.top + b.height / 2, 0) / targets.length };
    sockets.set(sourceId, connectBounds(bounds(sourceId), point(middle)).from);
  }
  const edges = rawEdges.map(edge => {
    const from = sockets.get(edge.sourceId)!;
    return { ...edge, from, to: connectBounds(point(from), bounds(edge.targetId)).to, live: hoverEdge === edge.id || hoverNode === edge.sourceId || hoverNode === edge.targetId };
  });
  // While dragging a new cable, it leaves from the card's socket when the card already has one.
  const draftCable = link ? (() => {
    const target = link.hoveredId ? bounds(link.hoveredId) : point(link);
    const from = sockets.get(link.blockId) ?? connectBounds(bounds(link.blockId), target).from;
    return { from, to: connectBounds(point(from), target).to };
  })() : null;
  const sourceHandleStyle = (id: string) => {
    const port = link?.blockId === id ? draftCable?.from : sockets.get(id);
    return port ? handleStyle(port, bounds(id)) : undefined;
  };

  // Context menus ----------------------------------------------------------------------------
  const builtIns = useBuiltInFormulas();
  const customList = useFormulaList("", 1);
  const menuItems = (current: Menu): ContextMenuEntry[] => {
    switch (current.kind) {
      case "column":
        return [{ id: "reset-column", icon: <RotateCcw />, label: t.resetColumnWidth }];
      case "canvas":
        return [
          ...(readOnly
            ? []
            : ([
                { id: "add-block", label: t.addBlock, icon: <Plus /> },
                { id: "add-cycle", label: t.addCycle, icon: <Plus /> },
                { id: "add-workout", label: t.addWorkoutCard, icon: <Plus /> },
                { type: "separator", id: "s1" },
              ] as ContextMenuEntry[])),
          { id: "arrange", label: t.arrange, icon: <LayoutGrid /> },
          { id: "zoom-reset", icon: <RotateCcw />, label: t.zoomReset, shortcut: `${Math.round(zoom * 100)}%` },
        ];
      case "block":
        return readOnly
          ? []
          : [
              { id: "add-cycle", label: m.editor.addCycle, icon: <Plus /> },
              { id: "progression", label: t.progression.menu, icon: <TrendingUp /> },
              doc.blocks.find((b) => b.id === current.id)?.inactive
                ? { id: "activate", label: t.activateBlock, icon: <Power /> }
                : { id: "deactivate", label: t.deactivateBlock, icon: <PowerOff /> },
              { type: "separator", id: "s1" },
              { id: "rename", label: m.editor.rename, icon: <Pencil /> },
              { id: "duplicate", label: m.editor.duplicate, icon: <Copy /> },
              { type: "separator", id: "s2" },
              { id: "remove", label: m.editor.remove, icon: <Trash2 />, tone: "danger" },
            ];
      case "cycle": {
        const parent = allCycles.find((c) => c.cycle.id === current.id)?.blockId ?? null;
        const targets = doc.blocks.filter((b) => b.id !== parent);
        return [
          ...(readOnly
            ? []
            : ([
                { id: "add-workout", label: t.addWorkoutCard, icon: <Dumbbell /> },
                { id: "add-day", label: t.addCycleDay, icon: <Plus /> },
                { id: "remove-day", label: t.removeLastDay, icon: <Trash2 />, isDisabled: !canRemoveDay(current.id) },
                { type: "separator", id: "s0" },
                ...(targets.length ? [{ type: "label", id: "l1", label: t.connectTo } as ContextMenuEntry] : []),
                ...targets.map((b) => ({ id: `connect:${b.id}`, label: b.name || m.editor.untitled, icon: <Link2 /> })),
                ...(parent ? [{ id: "disconnect", label: t.disconnect, icon: <Unlink /> }] : []),
                { type: "separator", id: "s1" },
                ...(parent
                  ? [
                      { id: "rename", label: m.editor.rename, icon: <Pencil /> },
                      { id: "duplicate", label: t.duplicateCycle, icon: <Copy /> },
                    ]
                  : []),
                { id: "remove", label: m.editor.remove, icon: <Trash2 />, tone: "danger" },
              ] as ContextMenuEntry[])),
        ];
      }
      case "edge":
        return readOnly ? [] : [{ id: "disconnect", label: t.removeConnection, icon: <Unlink />, tone: "danger" }];
      case "workout": {
        if (readOnly) return [];
        const home = homeOf(current.id);
        return [
          { id: "rename", label: t.renameWorkout, icon: <Pencil /> },
          ...(editor && locate(doc, current.id) ? [{ id: "details", label: t.editSets, icon: <ListTree /> } as ContextMenuEntry] : []),
          { id: "collapse", label: collapsedCards.has(current.id) ? t.expandWorkout : t.collapseWorkout, icon: <ChevronRight /> },
          { id: "duplicate", label: t.duplicateWorkout, icon: <Copy /> },
          ...(home?.cycle ? [{ id: "disconnect", label: t.disconnectWorkout, icon: <Unlink /> } as ContextMenuEntry] : []),
          { type: "separator", id: "s1" },
          { id: "remove", label: t.removeWorkout, icon: <Trash2 />, tone: "danger" },
        ];
      }
      case "dayNote":
        return [];
      case "exercise":
        return readOnly
          ? []
          : [
              { id: "duplicate", label: t.duplicateExercise, icon: <Copy /> },
              ...(editor && menu?.kind === "exercise" && locate(doc, menu.workout.id) ? [{ id: "details", label: t.editSets, icon: <ListTree /> } as ContextMenuEntry] : []),
              { id: "up", label: m.editor.moveUp, icon: <ArrowUp /> },
              { id: "down", label: m.editor.moveDown, icon: <ArrowDown /> },
              { type: "separator", id: "s1" },
              { id: "remove", label: t.removeExercise, icon: <Trash2 />, tone: "danger" },
            ];
    }
  };
  const onMenuAction = (current: Menu, id: string) => {
    if (current.kind === "column") {
      if (id === "reset-column") {
        if (current.owner) resizeElementColumn(current.owner, current.col, CELL_W);
        else resizeColumn(current.col, CELL_W);
      }
    } else if (current.kind === "canvas") {
      if (id === "add-block") addBlockAt(current.cell);
      else if (id === "add-cycle") addCycleAt(current.cell);
      else if (id === "add-workout") addWorkoutAt(current.cell);
      else if (id === "arrange") update((s) => ({ ...s, layout: autoLayout(doc, loose, looseWorkouts) }));
      else if (id === "zoom-reset") zoomTo("reset");
    } else if (current.kind === "block") {
      const block = doc.blocks.find((b) => b.id === current.id);
      if (!block) return;
      if (id === "add-cycle") apply?.((d) => addCycle(d, block.id, m.editor.cycleName(block.cycles.length + 1)).doc);
      else if (id === "progression") setProgressionBlock(block.id);
      else if (id === "activate" || id === "deactivate") apply?.((d) => updateNode(d, block.id, { inactive: id === "deactivate" ? true : null }));
      else if (id === "rename") setRenaming(block.id);
      else if (id === "duplicate") apply?.((d) => duplicateNode(d, block.id).doc);
      else if (id === "remove") apply?.((d) => removeNode(d, block.id));
    } else if (current.kind === "cycle") {
      const isLoose = !locate(doc, current.id);
      if (id === "add-workout") addWorkoutToCycle(current.id);
      else if (id === "add-day") changeDays(current.id, 1);
      else if (id === "remove-day") changeDays(current.id, -1);
      else if (id.startsWith("connect:")) connect(id.slice(8), current.id);
      else if (id === "disconnect") disconnect(current.id);
      else if (id === "rename") setRenaming(current.id);
      else if (id === "edit") onEditNode?.(current.id);
      else if (id === "duplicate") apply?.((d) => duplicateNode(d, current.id).doc);
      else if (id === "remove") {
        if (isLoose) setLoose((cycles) => cycles.filter((c) => c.id !== current.id));
        else apply?.((d) => removeNode(d, current.id));
      }
    } else if (current.kind === "edge") {
      if (id === "disconnect") {
        if (current.workoutId) disconnectWorkout(current.workoutId);
        else disconnect(current.cycleId);
      }
    } else if (current.kind === "workout") {
      const home = homeOf(current.id);
      if (!home) return;
      if (id === "rename") setRenaming(current.id);
      else if (id === "details") setOpenWorkout(current.id);
      else if (id === "collapse") toggleCard(current.id);
      else if (id === "disconnect") disconnectWorkout(current.id);
      else if (id === "remove") setRemovingWorkout(home.workout);
      else if (id === "duplicate") {
        if (locate(doc, current.id)) apply?.((d) => duplicateNode(d, current.id).doc);
        else setLooseWorkouts((list) => [...list, { ...cloneWithNewIds(home.workout), name: `${home.workout.name} (2)` }]);
      }
    } else if (current.kind === "exercise") {
      const { instance, workout: w } = current;
      const edit = applyFor(w.id);
      if (id === "details") setOpenWorkout(w.id);
      else if (id === "duplicate") edit?.((d) => duplicateNode(d, instance.id).doc);
      else if (id === "up") edit?.((d) => moveNode(d, instance.id, -1));
      else if (id === "down") edit?.((d) => moveNode(d, instance.id, 1));
      else if (id === "remove") edit?.((d) => removeNode(d, instance.id));
    }
  };

  const formulaOptions = [
    ...(builtIns.data ?? []).map((f) => ({ id: `builtin:${f.key}`, label: m.training.formulas.builtInNames[f.key ?? ""] ?? f.key ?? "", builtIn: f })),
    ...(customFormulas ? (customList.data?.items ?? []).filter((f) => !f.archived).map((f) => ({ id: `custom:${f.id}`, label: `${f.name} · v${f.version}`, custom: f })) : []),
  ];

  const exerciseExtra = (instance: ExerciseInstance) => {
    const live = locate(doc, instance.id) ? (findWorkout(doc, (menu as Extract<Menu, { kind: "exercise" }>).workout.id)?.exercises.find((e) => e.id === instance.id) ?? instance) : instance;
    const first = live.sets[0]?.prescription.loadFormula;
    const selected = first ? (first.builtIn ? `builtin:${first.builtIn}` : `custom:${first.formulaId}`) : "";
    return (
      <div className={styles.menuForm}>
        <label className={styles.menuLabel}>
          <span>
            <Sigma aria-hidden="true" /> {t.formula}
          </span>
          <select
            className={styles.menuSelect}
            value={selected}
            onChange={(event) => {
              const value = event.target.value;
              const option = formulaOptions.find((o) => o.id === value);
              let use: FormulaUse | null = null;
              if (option && "builtIn" in option && option.builtIn) {
                const inputs = Object.fromEntries(Object.entries(option.builtIn.definition.inputs ?? {}).map(([name, unit]) => [name, { value: 0, unit }]));
                use = { formulaId: null, builtIn: option.builtIn.key ?? null, version: option.builtIn.version ?? 1, inputs } as FormulaUse;
              } else if (option && "custom" in option && option.custom) {
                use = { formulaId: option.custom.id, builtIn: null, version: option.custom.version, inputs: {} } as FormulaUse;
              }
              applyFor((menu as Extract<Menu, { kind: "exercise" }>).workout.id)?.((d) => setExerciseFormula(d, instance.id, use));
            }}
          >
            <option value="">{t.noFormula}</option>
            {formulaOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };

  // How many times a cycle runs, picked in its menu. Loose cycles keep it until they are connected.
  const repeatsExtra = (cycleId: string) => {
    const cycle = allCycles.find((c) => c.cycle.id === cycleId)?.cycle;
    if (!cycle) return null;
    const runs = locate(doc, cycleId) ? cycleRuns(doc, cycle) : cycle.repeats != null ? Number(cycle.repeats) : 1;
    const single = doc.blocks.reduce((n, b) => n + b.cycles.length, 0) === 1 && Boolean(locate(doc, cycleId));
    return (
      <div className={styles.menuForm}>
        <label className={styles.menuLabel}>
          <span><Repeat aria-hidden="true" /> {t.repeats}</span>
          <select className={styles.menuSelect} value={runs === null ? "open" : String(runs)}
            onChange={(event) => {
              const repeats = event.target.value === "open" ? null : Number(event.target.value);
              if (locate(doc, cycleId)) apply?.((d) => updateNode(d, cycleId, { repeats }));
              else setLoose((cycles) => cycles.map((c) => (c.id === cycleId ? { ...c, repeats } : c)));
            }}>
            {single ? <option value="open">{t.repeatOpen}</option> : null}
            {REPEAT_CHOICES.map((n) => <option key={n} value={String(n)}>{t.repeatTimes(n)}</option>)}
          </select>
        </label>
      </div>
    );
  };

  const nodesForMinimap: MinimapNode[] = Object.entries(sizes).map(([id, s]) => ({
    id,
    kind: doc.blocks.some((b) => b.id === id) ? "block" : allWorkouts.some((w) => w.workout.id === id) ? "workout" : "cycle",
    x: HEADER + pos(id).left,
    y: HEADER + pos(id).top,
    w: span(layout[id]?.col ?? 0, s.cols),
    h: s.rows * CELL_H,
  }));

  return (
    <div className={`${styles.sheet} ${className ?? ""}`} data-width-animating={JSON.stringify(widths) !== JSON.stringify(targetWidths) || undefined}
      onContextMenuCapture={cancelPointer}
      // Pressing anywhere outside the field being edited (a name, a cell, a note) ends the edit, even on empty
      // cells, where dragging the sheet would otherwise keep the field focused.
      onPointerDownCapture={(event) => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || !event.currentTarget.contains(active) || active.contains(event.target as Node)) return;
        if (active.matches("input, textarea, select, [contenteditable=true], [role=textbox]")) active.blur();
      }}
      onPointerCancel={cancelPointer}
      onLostPointerCapture={(event) => { if (pointerCapture.current?.element === event.target) cancelPointer(); }}
    >
      {maxesMenu ? <ContextMenu x={maxesMenu.x} y={maxesMenu.y} label="Table connection" onClose={() => setMaxesMenu(null)} items={[{ id: "disconnect", label: "Disconnect" }]} onAction={ () => { apply?.(current => withMaxesTables(current, maxesTables(current).map(t => t.id === maxesMenu.id ? { ...t, blockId: null } : t))); setMaxesMenu(null); }} /> : null}
      <div className={styles.tools}>
        <div className={styles.toolsMain}>
        {!readOnly ? (
          <>
            <Button size="sm" iconStart={<Plus />} onPress={() => addBlockAt(null)}>
              {t.addBlock}
            </Button>
            <Button size="sm" iconStart={<Plus />} onPress={() => addCycleAt(null)}>
              {t.addCycle}
            </Button>
            <Button size="sm" iconStart={<Plus />} onPress={() => addWorkoutAt(null)}>
              {t.addWorkoutCard}
            </Button>
            <Button size="sm" iconStart={<Plus />} onPress={() => apply?.(current => withMaxesTables(current, [...maxesTables(current), { id: crypto.randomUUID(), blockId: null, rows: [] }]))}>Add maxes table</Button>
            {(["Comment", "Goal"] as const).map(kind => <Button key={kind} size="sm" iconStart={<Plus />} onPress={() => apply?.(current => ({ ...current, annotations: [...(current.annotations ?? []), { id: crypto.randomUUID(), kind, title: kind, content: "", targetId: null, visibility: "Coach" }] }))}>Add {kind.toLowerCase()}</Button>)}
          </>
        ) : null}
        <TooltipTrigger delay={300}>
          <Button size="sm" variant="ghost" iconStart={<LayoutGrid />} onPress={() => update((s) => ({ ...s, layout: autoLayout(doc, loose, looseWorkouts) }))}>
            {t.arrange}
          </Button>
          <Tooltip>{t.arrangeHint}</Tooltip>
        </TooltipTrigger>
        <Button size="sm" variant={volumeOpen ? "secondary" : "ghost"} iconStart={<BarChart3 />} onPress={() => setVolumeOpen((v) => !v)} aria-pressed={volumeOpen}>
          {t.volume.open}
        </Button>
        {!readOnly ? <InfoTip label="Sheet help" className={styles.help}>{doc.blocks.length || loose.length ? `${t.openCycle} · ${t.zoomHint}` : t.empty}</InfoTip> : null}
        </div>
        <div className={styles.toolsEnd}>
          {!readOnly ? (
            <SegmentedControl size="sm" aria-label={t.dragMode} className={styles.dragMode} selectedKeys={[dragMode]} onSelectionChange={keys => setDragMode([...keys][0] === "select" ? "select" : "pan")}>
              <TooltipTrigger delay={300}>
                <Segment id="pan"><span className={styles.dragModeItem}><Hand aria-hidden="true" />{t.dragPan}</span></Segment>
                <Tooltip>{t.dragPanHint}</Tooltip>
              </TooltipTrigger>
              <TooltipTrigger delay={300}>
                <Segment id="select"><span className={styles.dragModeItem}><SquareDashedMousePointer aria-hidden="true" />{t.dragSelect}</span></Segment>
                <Tooltip>{t.dragSelectHint}</Tooltip>
              </TooltipTrigger>
            </SegmentedControl>
          ) : null}
          <IconButton label={t.resetWidths} icon={<RotateCcw />} size="sm" variant="ghost" onPress={() => update(s => ({ ...s, columnWidths: {}, elementWidths: {} }))} />
        </div>
      </div>

      <div ref={scrollerRef} className={styles.scroller}>
        <div style={{ width: boardW * zoom, height: boardH * zoom }}>
          <div
            ref={boardRef}
            className={styles.board}
            role="group"
            aria-label={t.label}
            data-dragging={drag?.moved || undefined}
            data-panning={panning || undefined}
            data-select-key={(selectKey !== (dragMode === "select") && !readOnly) || undefined}
            style={
              {
                width: boardW,
                height: boardH,
                transform: `scale(${zoom})`,
                "--cell-w": `${CELL_W}px`,
                "--cell-h": `${CELL_H}px`,
                "--gutter": `${HEADER}px`,
              } as React.CSSProperties
            }
            onContextMenu={onBoardContextMenu}
            onPointerDown={startMarquee}
            onPointerMove={moveMarquee}
            onPointerUp={endMarquee}
            onKeyDown={(event) => {
              if (event.key === "Escape" && selected.length) setSelected([]);
            }}
            onDoubleClick={(event) => {
              if (readOnly || (event.target as HTMLElement).closest("[data-node]")) return;
              const p = toBoard(event.clientX, event.clientY);
              setMenu({ kind: "canvas", x: event.clientX, y: event.clientY, cell: { col: columnAt(widths, p.x), row: Math.max(0, Math.floor(p.y / CELL_H)) } });
            }}
          >
            <div className={styles.colHeads}>
              {Array.from({ length: cols }, (_, i) => (
                <span key={i} data-sheet-column={i} style={{ width: columnWidth(widths, i) }} data-no-drag
                  onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ kind: "column", col: i, x: event.clientX, y: event.clientY }); }}
                  onDoubleClick={event => event.stopPropagation()}>
                  {columnName(i)}
                  {i < MAX_SAVED_COLUMNS ? resizeHandle(i, columnWidth(targetWidths, i), resizeColumn, `Resize column ${columnName(i)}`) : null}
                </span>
              ))}
            </div>
            <div className={styles.rowHeads} aria-hidden="true">
              {Array.from({ length: rows }, (_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>

            <div className={styles.cells}>
              <div className={styles.columnLines} aria-hidden="true">
                {Array.from({ length: cols }, (_, i) => <i key={i} style={{ left: xAt(i) }} />)}
              </div>
              <svg className={styles.edges} width={xAt(cols)} height={rows * CELL_H} aria-hidden="true">
                {edges.map((edge) => {
                  // The cable ends in a plug pressed against the card; grab the plug to move or pull it out.
                  const d = cablePath(edge.from, edge.to);
                  const kind: Link["kind"] = edge.annotationId ? "annotation" : edge.tableId ? "maxes" : edge.workoutId ? "workout" : "cycle";
                  return (
                    <g key={edge.id} data-edge data-maxes-connection={edge.tableId} data-annotation-connection={edge.annotationId} data-live={edge.live || undefined} data-rewiring={edge.id === link?.rewire?.edgeId || undefined} className={styles.edgeGroup}>
                      <path d={d} className={styles.edgeHit} onPointerEnter={() => setHoverEdge(edge.id)} onPointerLeave={() => setHoverEdge(null)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (edge.annotationId) return;
                          if (edge.tableId) { if (!readOnly) setMaxesMenu({ id: edge.tableId, x: event.clientX, y: event.clientY }); }
                          else setMenu({ kind: "edge", x: event.clientX, y: event.clientY, cycleId: edge.cycleId, workoutId: edge.workoutId });
                        }}
                      />
                      <path d={d} className={styles.edge} />
                      {edge.live ? <path d={d} className={styles.edgeCurrent} /> : null}
                      <g data-plug-side={edge.to.side} data-plug-grab={!readOnly || undefined} className={styles.plugGroup} transform={`translate(${edge.to.x} ${edge.to.y}) rotate(${plugRotation(edge.to.side)})`}
                        onPointerDown={readOnly ? undefined : (event) => startLink(event, edge.sourceId, kind, { edgeId: edge.id, target: edge.targetId })}
                        onPointerMove={moveLink} onPointerUp={endLink}>
                        <title>{t.plugHint}</title>
                        <rect x={-14} y={-9} width={14} height={18} className={styles.plugHit} />
                        <rect x={-9} y={-4.5} width={9} height={9} rx={2} className={styles.plug} />
                      </g>
                    </g>
                  );
                })}
                {draftCable ? <g data-link-preview data-target-id={link?.targetId}><path d={cablePath(draftCable.from, draftCable.to, true)} className={styles.edgeDraft} /><g data-preview-side={draftCable.to.side} transform={`translate(${draftCable.to.x} ${draftCable.to.y}) rotate(${plugRotation(draftCable.to.side)})`}><rect x={-9} y={-4.5} width={9} height={9} rx={2} className={styles.plug} /></g></g> : null}
              </svg>

              {marquee ? (
                <div
                  className={styles.marquee}
                  aria-hidden="true"
                  style={{
                    left: Math.min(marquee.x0, marquee.x1),
                    top: Math.min(marquee.y0, marquee.y1),
                    width: Math.abs(marquee.x1 - marquee.x0),
                    height: Math.abs(marquee.y1 - marquee.y0),
                  }}
                />
              ) : null}

              {(doc.annotations ?? []).map(note => <AnnotationCard key={note.id} collapsed={collapsedCards.has(note.id)} onToggle={() => toggleCard(note.id)} note={note} scope={note.targetId ? doc.blocks.find(b => b.id === note.targetId)?.name ?? allCycles.find(c => c.cycle.id === note.targetId)?.cycle.name ?? "Linked" : "Global · plan"} apply={apply} style={pos(note.id)} dragging={Boolean(drag?.moved && (drag.id === note.id || drag.group[note.id]))} onPointerDown={event => startDrag(event, note.id)} onPointerMove={moveDrag} onPointerUp={endDrag} handle={!readOnly ? <span className={styles.handle} style={sourceHandleStyle(note.id)} title="Connect annotation" data-no-drag onPointerDown={event => startLink(event, note.id, "annotation")} onPointerMove={moveLink} onPointerUp={endLink} /> : null} />)}
              {maxesTables(doc).map(table => <BlockMaxesTable key={table.id} collapsed={collapsedCards.has(table.id)} onToggle={() => toggleCard(table.id)} table={table} renderColumnResize={(col, label) => elementResizeHandle(table.id, col, label)} dragging={Boolean(drag?.moved && (drag.id === table.id || drag.group[table.id]))} selected={selected.includes(table.id)} apply={apply} names={names} style={pos(table.id)} onPointerDown={event => startDrag(event, table.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerEnter={() => setHoverNode(table.id)} onPointerLeave={() => setHoverNode(null)} handle={<span className={styles.handle} style={sourceHandleStyle(table.id)} role="presentation" title="Connect to block" data-no-drag onPointerDown={event => startLink(event, table.id, "maxes")} onPointerMove={moveLink} onPointerUp={endLink}></span>} />)}
              {doc.blocks.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  inactive={Boolean(block.inactive)}
                  linkTarget={link?.targetId === block.id}
                  style={pos(block.id)}
                  dragging={Boolean(drag?.moved && drag.group[block.id])}
                  selected={selected.includes(block.id)}
                  apply={apply}
                  onPointerEnter={() => setHoverNode(block.id)}
                  onPointerLeave={() => setHoverNode((h) => (h === block.id ? null : h))}
                  onPointerDown={(e) => startDrag(e, block.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onKeyDown={(e) => cardKeys(e, block.id, "block")}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ kind: "block", x: e.clientX, y: e.clientY, id: block.id });
                  }}
                  onMenuButton={(x, y) => setMenu({ kind: "block", x, y, id: block.id })}
                  renaming={renaming}
                  onRename={setRenaming}
                  handle={
                    readOnly ? (
                      <span className={styles.handle} data-readonly aria-hidden="true" />
                    ) : (
                      <span
                        className={styles.handle}
                        style={sourceHandleStyle(block.id)}
                        data-no-drag
                        role="presentation"
                        title={t.connectHandle(block.name)}
                        onPointerDown={(e) => startLink(e, block.id)}
                        onPointerMove={moveLink}
                        onPointerUp={endLink}
                      />
                    )
                  }
                />
              ))}

              {allCycles.map(({ cycle, blockId }) => (
                <BlockFormulaScope key={cycle.id} block={effectiveBlock(doc, doc.blocks.find(b => b.id === blockId))}>
                <CycleCard
                  key={cycle.id}
                  cycle={cycle}
                  runs={blockId ? cycleRuns(doc, cycle) : cycle.repeats != null ? Number(cycle.repeats) : 1}
                  collapsed={collapsedCards.has(cycle.id)}
                  onToggleCollapse={() => toggleCard(cycle.id)}
                  inactive={Boolean(doc.blocks.find((b) => b.id === blockId)?.inactive)}
                  onAddDay={readOnly ? undefined : () => changeDays(cycle.id, 1)}
                  loose={blockId === null}
                  style={pos(cycle.id)}
                  dragging={Boolean(drag?.moved && drag.group[cycle.id])}
                  selected={selected.includes(cycle.id)}
                  linkTarget={link?.targetId === cycle.id}
                  apply={apply}
                  onRenameLoose={(name) => setLoose((cycles) => cycles.map((c) => (c.id === cycle.id ? { ...c, name } : c)))}
                  onPointerEnter={() => setHoverNode(cycle.id)}
                  onPointerLeave={() => setHoverNode((h) => (h === cycle.id ? null : h))}
                  onPointerDown={(e) => startDrag(e, cycle.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onKeyDown={(e) => cardKeys(e, cycle.id, "cycle")}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ kind: "cycle", x: e.clientX, y: e.clientY, id: cycle.id });
                  }}
                  onMenuButton={(x, y) => setMenu({ kind: "cycle", x, y, id: cycle.id })}
                  renaming={renaming}
                  onRename={setRenaming}
                  onSelectDay={(dayNumber) => setSelected(cycle.days.filter((d) => Number(d.dayNumber) === dayNumber).flatMap((d) => d.workouts.map((w) => w.id)))}
                  onDayNote={(x, y, dayNumber, note) => setMenu({ kind: "dayNote", x, y, cycleId: cycle.id, dayNumber, note })}
                  handle={
                    readOnly ? null : (
                      <span
                        className={styles.handle}
                        data-kind="cycle"
                        style={sourceHandleStyle(cycle.id)}
                        data-no-drag
                        role="presentation"
                        title={t.connectWorkoutHandle(cycle.name)}
                        onPointerDown={(e) => startLink(e, cycle.id, "workout")}
                        onPointerMove={moveLink}
                        onPointerUp={endLink}
                      />
                    )
                  }
                /></BlockFormulaScope>
              ))}

              {allWorkouts.map(({ workout: w, cycle, dayNumber }) => (
                <BlockFormulaScope key={w.id} block={effectiveBlock(doc, doc.blocks.find((b) => cycle && b.cycles.some((c) => c.id === cycle.id)))}>
                  <WorkoutCard
                    workout={w}
                    inactive={Boolean(cycle && doc.blocks.find((b) => b.cycles.some((c) => c.id === cycle.id))?.inactive)}
                    dayNumber={dayNumber}
                    dayCount={cycle ? Number(cycle.dayCount) : null}
                    size={sizes[w.id]!}
                    style={pos(w.id)}
                    dragging={Boolean(drag?.moved && drag.group[w.id])}
                    selected={selected.includes(w.id)}
                    linkTarget={link?.targetId === w.id}
                    collapsed={collapsedCards.has(w.id)}
                    renaming={renaming === w.id}
                    apply={applyFor(w.id)}
                    names={names}
                    advancedAllowed={advancedAllowed}
                    customFormulas={customFormulas}
                    onToggleCollapse={() => toggleCard(w.id)}
                    onMenuButton={(x, y) => setMenu({ kind: "workout", x, y, id: w.id })}
                    onRenameDone={() => setRenaming((r) => (r === w.id ? null : r))}
                    onExerciseMenu={(event, instance, owner) => setMenu({ kind: "exercise", x: event.clientX, y: event.clientY, instance, workout: owner })}
                    onColumnContextMenu={(col, event) => columnMenu(w.id, col, event)}
                    renderColumnResize={(col, label) => elementResizeHandle(w.id, col, label)}
                    onPointerEnter={() => setHoverNode(w.id)}
                    onPointerLeave={() => setHoverNode((h) => (h === w.id ? null : h))}
                    onPointerDown={(e) => startDrag(e, w.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onKeyDown={(e) => cardKeys(e, w.id, "workout")}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenu({ kind: "workout", x: e.clientX, y: e.clientY, id: w.id });
                    }}
                  />
                </BlockFormulaScope>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SheetMinimap boardWidth={boardW} boardHeight={boardH} nodes={nodesForMinimap} view={view} zoom={zoom} onNavigate={navigate} onZoom={zoomTo} />

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.kind === "edge" ? t.connection : menu.kind === "dayNote" ? t.restDayNote(menu.dayNumber) : menu.kind === "workout" ? t.workoutActions(homeOf(menu.id)?.workout.name ?? "") : t.contextLabel}
          items={menuItems(menu)}
          onAction={(id) => onMenuAction(menu, id)}
          onClose={() => setMenu(null)}
        >
          {menu.kind === "exercise" && !readOnly ? exerciseExtra(menu.instance) : null}
          {menu.kind === "cycle" && !readOnly ? repeatsExtra(menu.id) : null}
          {menu.kind === "dayNote" ? (
            <textarea
              className={styles.menuTextarea}
              rows={4}
              maxLength={2000}
              autoFocus
              aria-label={t.restDayNote(menu.dayNumber)}
              placeholder={t.restDayNotePlaceholder}
              defaultValue={menu.note}
              onChange={(event) => {
                const { cycleId, dayNumber } = menu;
                const text = event.target.value;
                if (locate(doc, cycleId)) apply?.((d) => setDayNote(d, cycleId, dayNumber, text));
                else setLoose((cycles) => cycles.map((c) => (c.id === cycleId ? withDayNote(c, dayNumber, text) : c)));
              }}
            />
          ) : null}
        </ContextMenu>
      ) : null}


      <AlertDialog
        isOpen={removingWorkout !== null}
        onOpenChange={(open) => { if (!open) setRemovingWorkout(null); }}
        tone="danger"
        title={m.editor.week.removeWorkoutTitle}
        confirmLabel={t.removeWorkout}
        cancelLabel={m.common.cancel}
        onConfirm={() => {
          if (removingWorkout) removeWorkout(removingWorkout);
          setRemovingWorkout(null);
        }}
      >
        <p>{removingWorkout ? m.editor.week.removeWorkoutBody(removingWorkout.name || m.editor.untitled) : null}</p>
      </AlertDialog>

      {apply ? <ProgressionDialog blockId={progressionBlock} doc={doc} names={names} apply={apply} onClose={() => setProgressionBlock(null)} /> : null}

      {volumeOpen ? <VolumePanel doc={doc} names={names} onClose={() => setVolumeOpen(false)} /> : null}

      {workout && editor ? (
        <BlockFormulaScope block={effectiveBlock(doc, doc.blocks.find(b => b.cycles.some(c => c.days.some(d => d.workouts.some(w => w.id === workout.id)))))}>
        <WorkoutPanel
          workout={workout}
          editor={editor}
          names={names}
          advancedAllowed={advancedAllowed}
          customFormulas={customFormulas}
          readOnly={readOnly}
          onClose={() => setOpenWorkout(null)}
        /></BlockFormulaScope>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------------------------------
// Cards

interface CardEvents {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

/**
 * A card's name or description. It reads as text, so pressing on it grabs the card; double-click
 * (or "Rename" in the menu) turns it into an input. Enter or leaving saves, Escape restores.
 */
function InlineName({
  value,
  onChange,
  readOnly,
  label,
  className,
  renameKey,
  editing,
  onDone,
  multiline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  label: string;
  className?: string;
  /** Several lines (descriptions): Enter adds a line, Ctrl/Cmd+Enter or leaving the field finishes. */
  multiline?: boolean;
  /** Pressing the text without dragging the card starts renaming with this key. */
  renameKey: string;
  editing: boolean;
  onDone: () => void;
}) {
  const m = useT();
  const original = useRef(value);
  if (editing && !readOnly && multiline) {
    return (
      <textarea
        className={`${className ?? styles.name} ${styles.nameEditing} ${styles.multiline}`}
        value={value}
        aria-label={label}
        maxLength={4000}
        placeholder={label}
        rows={Math.min(Math.max(value.split("\n").length, 3), 12)}
        autoFocus
        data-no-drag
        onFocus={(event) => {
          original.current = value;
          event.currentTarget.select();
        }}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onDone}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) onDone();
          else if (event.key === "Escape") {
            onChange(original.current);
            onDone();
          }
        }}
      />
    );
  }
  if (editing && !readOnly) {
    return (
      <input
        className={`${className ?? styles.name} ${styles.nameEditing}`}
        value={value}
        aria-label={label}
        maxLength={200}
        placeholder={label}
        autoFocus
        data-no-drag
        onFocus={(event) => {
          original.current = value;
          event.currentTarget.select();
        }}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onDone}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") onDone();
          else if (event.key === "Escape") {
            onChange(original.current);
            onDone();
          }
        }}
      />
    );
  }
  return (
    <span className={`${className ?? styles.name} ${multiline ? styles.multiline : ""}`} data-rename={readOnly ? undefined : renameKey} title={readOnly ? undefined : m.editor.sheet.renameHint}>
      {value || <span className={styles.cellPlaceholder}>{label}</span>}
    </span>
  );
}


function BlockCard({
  block,
  inactive,
  linkTarget,
  style,
  dragging,
  selected,
  apply,
  handle,
  onMenuButton,
  renaming,
  onRename,
  ...events
}: {
  block: Block;
  /** Left out when changes are applied; shown dimmed. */
  inactive: boolean;
  linkTarget: boolean;
  style: React.CSSProperties;
  dragging: boolean;
  selected: boolean;
  apply?: Apply;
  handle: React.ReactNode;
  onMenuButton: (x: number, y: number) => void;
  renaming: string | null;
  onRename: (key: string | null) => void;
} & CardEvents) {
  const m = useT();
  const t = m.editor.sheet;
  const readOnly = !apply;
  return (
    <div
      className={styles.card}
      data-node
      data-kind="block"
      data-node-id={block.id}
      data-block-id={block.id}
      data-inactive={inactive || undefined}
      data-link-target={linkTarget || undefined}
      data-dragging={dragging || undefined}
      data-selected={selected || undefined}
      tabIndex={0}
      aria-label={`${t.blockLabel}: ${block.name}`}
      style={{ ...style, width: Number(style.width) - 8, minHeight: BLOCK_ROWS * CELL_H - 8 }}
      {...events}
    >
      <div className={styles.cardHead}>
        <span className={styles.chip} data-kind="block" aria-hidden="true">
          <Repeat />
        </span>
        <span className={styles.kind}>{inactive ? `${t.blockLabel} · ${t.inactive}` : t.blockLabel}</span>
        {!readOnly ? <MenuButton label={block.name} onOpen={onMenuButton} /> : null}
      </div>
      <InlineName
        value={block.name}
        readOnly={readOnly}
        label={m.common.col.name}
        editing={renaming === block.id}
        renameKey={block.id}
        onDone={() => onRename(null)}
        onChange={(name) => apply?.((doc) => updateNode(doc, block.id, { name }))}
      />
      <InlineName
        value={block.description}
        readOnly={readOnly}
        label={m.common.col.description}
        className={styles.description}
        multiline
        editing={renaming === `${block.id}:description`}
        renameKey={`${block.id}:description`}
        onDone={() => onRename(null)}
        onChange={(description) => apply?.((doc) => updateNode(doc, block.id, { description }))}
      />
      {handle}
    </div>
  );
}

function CycleCard({
  cycle,
  runs,
  collapsed,
  onToggleCollapse,
  inactive,
  onAddDay,
  loose,
  style,
  dragging,
  selected,
  linkTarget,
  apply,
  onRenameLoose,
  onMenuButton,
  onSelectDay,
  onDayNote,
  renaming,
  onRename,
  handle,
  ...events
}: {
  cycle: Cycle;
  /** How many times it runs in a row; null until the plan is stopped. */
  runs: number | null;
  /** Minimised to its header and name. */
  collapsed: boolean;
  onToggleCollapse: () => void;
  inactive: boolean;
  /** Adds a day at the end of the cycle (the "+" tile). */
  onAddDay?: () => void;
  loose: boolean;
  style: React.CSSProperties;
  dragging: boolean;
  selected: boolean;
  linkTarget: boolean;
  apply?: Apply;
  onRenameLoose: (name: string) => void;
  onMenuButton: (x: number, y: number) => void;
  /** A training day was clicked: its workout cards get selected. */
  onSelectDay: (dayNumber: number) => void;
  onDayNote: (x: number, y: number, dayNumber: number, note: string) => void;
  renaming: string | null;
  onRename: (key: string | null) => void;
  /** Drag from it onto a workout card to put that workout on this cycle. */
  handle: React.ReactNode;
} & CardEvents) {
  const m = useT();
  const t = m.editor.sheet;
  const readOnly = !apply;
  return (
    <div
      className={styles.card}
      data-node
      data-kind="cycle"
      data-node-id={cycle.id}
      data-cycle-id={cycle.id}
      data-inactive={inactive || undefined}
      data-loose={loose || undefined}
      data-link-target={linkTarget || undefined}
      data-dragging={dragging || undefined}
      data-selected={selected || undefined}
      tabIndex={0}
      aria-label={`${t.cycleLabel}: ${cycle.name}`}
      data-collapsed={collapsed || undefined}
      style={{ ...style, width: Number(style.width) - 8, minHeight: (collapsed ? 2 : cycleRows(cycle)) * CELL_H - 8 }}
      {...events}
    >
      <div className={styles.cardHead}>
        <div className={styles.headMain}>
          <button type="button" className={styles.toggle} aria-label={collapsed ? t.expandCycle : t.minimiseCycle} aria-expanded={!collapsed} data-no-drag onClick={onToggleCollapse}>
            <ChevronRight aria-hidden="true" data-open={!collapsed || undefined} />
          </button>
          <span className={styles.chip} data-kind="cycle" aria-hidden="true">
            <CalendarDays />
          </span>
          <InlineName
            value={cycle.name}
            readOnly={readOnly}
            label={m.common.col.name}
            className={styles.cycleName}
            editing={renaming === cycle.id}
            renameKey={cycle.id}
            onDone={() => onRename(null)}
            onChange={(name) => (loose ? onRenameLoose(name) : apply?.((doc) => updateNode(doc, cycle.id, { name })))}
          />
        </div>
        {loose ? <LooseFlag text={t.loose} label={t.notConnected} compact={collapsed} /> : null}
        {!readOnly ? <MenuButton label={cycle.name} onOpen={onMenuButton} /> : null}
      </div>
      {/* Length, how many times it runs and its workouts, in one quiet line. */}
      <p className={styles.cycleMeta}>
        <span>{t.cycleLength(Number(cycle.dayCount))}</span>
        <span className={styles.cycleRuns} data-open={runs === null || undefined}>{runs === null ? `∞ ${t.repeatOpen}` : `×${runs}`}</span>
        <span>{m.editor.week.workouts(cycleWorkouts(cycle).length)}</span>
      </p>
      {collapsed ? null : <>
      <div className={styles.tiles} style={{ gridTemplateColumns: `repeat(${Math.min(7, Number(cycle.dayCount) + (onAddDay ? 1 : 0))}, minmax(0, 1fr))` }} role="list" aria-label={t.cycleLength(Number(cycle.dayCount))}>
        {cycleCalendar(cycle).map((day) => {
          const names = day.workouts.map((w) => w.name || m.editor.untitled);
          const label = `${m.editor.dayLabel(day.dayNumber)}: ${names.length ? names.join(", ") : t.restDay}${day.note ? ` — ${day.note}` : ""}`;
          const training = day.workouts.length > 0;
          const content = (
            <>
              {day.dayNumber}
              {day.note ? <i className={styles.tileDot} aria-hidden="true" /> : null}
            </>
          );
          if (readOnly && !training) {
            return (
              <span key={day.dayNumber} role="listitem" className={styles.tile} data-kind="rest" title={label} aria-label={label}>
                {content}
              </span>
            );
          }
          return (
            <button
              key={day.dayNumber}
              type="button"
              role="listitem"
              className={styles.tile}
              data-kind={training ? "workout" : "rest"}
              data-no-drag
              title={training ? `${label} · ${t.showWorkouts}` : day.note ? label : `${label} · ${t.restDayAddNote}`}
              aria-label={training ? `${label}. ${t.showWorkouts}` : `${label}. ${t.restDayAddNote}`}
              onClick={(event) => {
                if (training) {
                  onSelectDay(day.dayNumber);
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                onDayNote(rect.left, rect.bottom + 4, day.dayNumber, day.note);
              }}
            >
              {content}
            </button>
          );
        })}
        {onAddDay ? (
          <button type="button" className={styles.tile} data-kind="add" data-no-drag aria-label={t.addCycleDay} title={t.addCycleDay} onClick={onAddDay}>
            <Plus aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {cycleWorkouts(cycle).length ? (
        <ul className={styles.legend}>
          {cycleWorkouts(cycle).map(({ workout, dayNumber }) => (
            <li key={workout.id}>
              <span className={styles.legendDay}>{dayNumber}</span>
              <span className={styles.legendName}>{workout.name || m.editor.untitled}</span>
            </li>
          ))}
        </ul>
      ) : null}
      </>}
      {handle}
    </div>
  );
}

// -------------------------------------------------------------------------------------------
// Detailed set editor (per-set kinds, segments, groups): reachable from an exercise's menu.

function WorkoutPanel({
  workout,
  editor,
  names,
  advancedAllowed,
  customFormulas,
  readOnly,
  onClose,
}: {
  workout: Workout;
  editor: EditorApi;
  names: Map<string, ExerciseLabel>;
  advancedAllowed: boolean;
  customFormulas: boolean;
  readOnly: boolean;
  onClose: () => void;
}) {
  const m = useT();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [workout.id]);
  return (
    <aside
      ref={ref}
      className={styles.panel}
      aria-label={workout.name}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !(event.target as HTMLElement).closest("input, textarea, [role=grid]")) onClose();
      }}
    >
      <header className={styles.panelHead}>
        <span className={styles.panelTitle}>{workout.name}</span>
        <IconButton label={m.editor.workoutPanel.close} icon={<X />} size="sm" variant="ghost" onPress={onClose} showTooltip={false} />
      </header>
      <div className={styles.panelBody}>
        <WorkoutEditor editor={editor} workout={workout} names={names} advancedAllowed={advancedAllowed} customFormulas={customFormulas} readOnly={readOnly} />
      </div>
    </aside>
  );
}
