import {
  ArrowDown,
  BarChart3,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Copy,
  LayoutGrid,
  Link2,
  ListTree,
  MoreVertical,
  Pencil,
  Plus,
  Repeat,
  Sigma,
  Trash2,
  TrendingUp,
  Unlink,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Block, Cycle, ExerciseInstance, FormulaUse, TrainingDocument, Workout } from "@trainflow/api-client-web";
import { Button, ContextMenu, IconButton, Tooltip, TooltipTrigger, type ContextMenuEntry } from "@trainflow/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useT } from "~/shared/i18n/AppLocale";
import { useBuiltInFormulas, useFormulaList } from "../../queries";
import { setExerciseFormula } from "../model/cells";
import { EXPANDED_TOP_ROWS, WORKOUT_COLS, cycleCalendar, cycleWorkouts, setDayNote, withDayNote, workoutRows } from "../model/workouts";
import { addBlock, addCycle, duplicateNode, findWorkout, locate, moveNode, newCycle, removeNode, updateNode } from "../model/document";
import { BLOCK_COLS, CELL_H, CELL_W, CYCLE_COLS, autoLayout, cycleRows, mergeLayout, resolveLayout, snap, type Cell, type Layout, type Size } from "../model/layout";
import { attachCycle, detachCycle } from "../model/structure";
import type { EditorApi } from "../useEditor";
import { CycleCells } from "./CycleCells";
import { ProgressionDialog } from "./ProgressionDialog";
import { VolumePanel } from "./VolumePanel";
import { SheetMinimap, type MinimapNode } from "./SheetMinimap";
import { WorkoutEditor } from "./WorkoutEditor";
import styles from "./SheetCanvas.module.css";

export interface SheetState {
  layout: Layout;
  /** Cycles taken out of every block. They exist only here until connected again. */
  loose: Cycle[];
  /** Cycles shown as cells. */
  expanded: string[];
  /** Workouts folded inside an expanded cycle. */
  collapsedWorkouts: string[];
}

export const emptySheet: SheetState = { layout: {}, loose: [], expanded: [], collapsedWorkouts: [] };

const isCell = (v: unknown): v is Cell =>
  typeof v === "object" && v !== null && Number.isInteger((v as Cell).col) && Number.isInteger((v as Cell).row) && (v as Cell).col >= 0 && (v as Cell).row >= 0;
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * The sheet's arrangement (card positions, expanded cycles, folded workouts) for one plan, kept in
 * this browser so the editor and the program preview reopen the way they were left. Disconnected
 * cycles are plan content, not arrangement, so they are not stored. Without storage it starts from
 * the default layout.
 */
export function usePersistentSheet(planId: string): [SheetState, (next: SheetState | ((current: SheetState) => SheetState)) => void] {
  const key = `tf.sheet.${planId}`;
  const [sheet, setSheet] = useState<SheetState>(() => {
    try {
      const raw = typeof window === "undefined" ? null : window.localStorage.getItem(key);
      if (!raw) return emptySheet;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      const layout = Object.fromEntries(Object.entries((saved.layout as Record<string, unknown>) ?? {}).filter(([, cell]) => isCell(cell))) as Layout;
      return { ...emptySheet, layout, expanded: ids(saved.expanded), collapsedWorkouts: ids(saved.collapsedWorkouts) };
    } catch {
      return emptySheet;
    }
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify({ layout: sheet.layout, expanded: sheet.expanded, collapsedWorkouts: sheet.collapsedWorkouts }));
      } catch {
        // Storage blocked or full: the arrangement just isn't remembered.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [key, sheet.layout, sheet.expanded, sheet.collapsedWorkouts]);
  return [sheet, setSheet];
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
type Link = { blockId: string; pointerId: number; x: number; y: number };
type Menu =
  | { kind: "canvas"; x: number; y: number; cell: Cell }
  | { kind: "block"; x: number; y: number; id: string }
  | { kind: "cycle"; x: number; y: number; id: string }
  | { kind: "edge"; x: number; y: number; cycleId: string }
  | { kind: "exercise"; x: number; y: number; instance: ExerciseInstance; workout: Workout }
  | { kind: "dayNote"; x: number; y: number; cycleId: string; dayNumber: number; note: string };

/**
 * Advanced mode: a spreadsheet-like sheet. Blocks and cycles are cards placed anywhere on the
 * cells. Dragging from a block's handle onto a cycle connects them; right click opens context
 * menus everywhere (sheet, cards, connections, exercise cells). Clicking a cycle expands it into
 * cells: one column group per day, workouts and exercises edited in place. Ctrl + scroll zooms;
 * the minimap moves the view. Positions, zoom and expanded cycles live only in memory.
 *
 * Without `apply` the sheet is a read-only preview (pan, zoom, expand only).
 */
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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [openWorkout, setOpenWorkout] = useState<string | null>(null);
  const [progressionBlock, setProgressionBlock] = useState<string | null>(null);
  const [zoom, setZoom] = useState(initialZoom);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const zoomAnchor = useRef<{ bx: number; by: number; px: number; py: number } | null>(null);

  // A cycle back in the document (connect, undo) is no longer loose.
  const loose = useMemo(() => sheet.loose.filter((cycle) => !locate(doc, cycle.id)), [sheet.loose, doc]);
  const stored = useMemo(() => mergeLayout(sheet.layout, doc, loose), [sheet.layout, doc, loose]);
  const expanded = useMemo(() => new Set(sheet.expanded), [sheet.expanded]);
  const collapsedWorkouts = useMemo(() => new Set(sheet.collapsedWorkouts ?? []), [sheet.collapsedWorkouts]);
  const workout = openWorkout ? findWorkout(doc, openWorkout) : null;

  useEffect(() => {
    if (openWorkout && !workout) setOpenWorkout(null);
  }, [openWorkout, workout]);

  const update = (fn: (s: SheetState) => SheetState) => onSheetChange(fn);
  const place = (id: string, cell: Cell) => update((s) => ({ ...s, layout: { ...mergeLayout(s.layout, doc, loose), [id]: cell } }));
  const setLoose = (fn: (cycles: Cycle[]) => Cycle[]) => update((s) => ({ ...s, loose: fn(s.loose.filter((c) => !locate(doc, c.id))) }));
  const toggleWorkout = (id: string) =>
    update((s) => {
      const list = s.collapsedWorkouts ?? [];
      return { ...s, collapsedWorkouts: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
    });
  const toggleExpanded = (id: string) =>
    update((s) => ({ ...s, expanded: s.expanded.includes(id) ? s.expanded.filter((x) => x !== id) : [...s.expanded, id] }));

  // Sizes in cells; expanded cycles take one column group per day.
  const allCycles = useMemo(
    () => [...doc.blocks.flatMap((block) => block.cycles.map((cycle) => ({ cycle, blockId: block.id as string | null }))), ...loose.map((cycle) => ({ cycle, blockId: null }))],
    [doc, loose],
  );
  const sizes = useMemo(() => {
    const result: Record<string, Size> = {};
    for (const block of doc.blocks) result[block.id] = { cols: BLOCK_COLS, rows: BLOCK_ROWS };
    for (const { cycle, blockId } of allCycles) {
      if (expanded.has(cycle.id) && blockId) {
        // Header + column headings + one row per workout heading / exercise / add row.
        result[cycle.id] = { cols: WORKOUT_COLS, rows: EXPANDED_TOP_ROWS + workoutRows(cycle, collapsedWorkouts, !readOnly).length };
      } else result[cycle.id] = { cols: CYCLE_COLS, rows: cycleRows(cycle) };
    }
    return result;
  }, [doc, allCycles, expanded, collapsedWorkouts, readOnly]);
  // Where cards are drawn: no overlaps, expanded cycles keep their place and push neighbours.
  const layout = useMemo(() => resolveLayout(stored, sizes, [...expanded]), [stored, sizes, expanded]);

  // Enough cells, letters and row numbers to fill the screen even fully zoomed out.
  const fillCols = Math.ceil((viewport.w / MIN_ZOOM - HEADER) / CELL_W) + 1;
  const fillRows = Math.ceil((viewport.h / MIN_ZOOM - HEADER) / CELL_H) + 1;
  const cols = Math.max(26, fillCols, ...Object.entries(sizes).map(([id, s]) => (layout[id]?.col ?? 0) + s.cols + 6));
  const rows = Math.max(40, fillRows, ...Object.entries(sizes).map(([id, s]) => (layout[id]?.row ?? 0) + s.rows + 10));
  const boardW = HEADER + cols * CELL_W;
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
      setZoom((z) => {
        const next = clampZoom(z * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
        zoomAnchor.current = { bx: (el.scrollLeft + px) / z, by: (el.scrollTop + py) / z, px, py };
        return next;
      });
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
      zoomAnchor.current = null;
    }
    syncView();
  }, [zoom, syncView]);

  const zoomTo = (next: number | "reset") => {
    const el = scrollerRef.current;
    const target = next === "reset" ? 1 : clampZoom(next);
    if (el) zoomAnchor.current = { bx: (el.scrollLeft + el.clientWidth / 2) / zoom, by: (el.scrollTop + el.clientHeight / 2) / zoom, px: el.clientWidth / 2, py: el.clientHeight / 2 };
    setZoom(target);
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
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, button, a, select, [data-no-drag]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
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
      const dc = snap(drag.origin.col * CELL_W + drag.dx, CELL_W) - drag.origin.col;
      const dr = snap(drag.origin.row * CELL_H + drag.dy, CELL_H) - drag.origin.row;
      if (dc || dr) {
        const moves = Object.fromEntries(Object.entries(drag.group).map(([id, at]) => [id, { col: Math.max(0, at.col + dc), row: Math.max(0, at.row + dr) }]));
        update((s) => ({ ...s, layout: { ...mergeLayout(s.layout, doc, loose), ...moves } }));
      }
    } else if (drag.renameKey) {
      // A click (no drag) on a name edits it; pressing and dragging still moves the card.
      setRenaming(drag.renameKey);
    }
    // Cycles open only from their arrow or a training day, never from a click on the card.
    setDrag(null);
  };
  const cardKeys = (event: React.KeyboardEvent, id: string, kind: "block" | "cycle") => {
    if (event.target !== event.currentTarget) return;
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ kind, x: rect.left + 12, y: rect.top + 24, id } as Menu);
      return;
    }
    if (kind === "cycle" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (allCycles.some((c) => c.cycle.id === id && c.blockId)) toggleExpanded(id);
      return;
    }
    if (readOnly) return;
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const at = layout[id]!;
    place(id, { col: Math.max(0, at.col + delta[0]!), row: Math.max(0, at.row + delta[1]!) });
  };

  // Selecting an area: drag on empty cells to select every card the rectangle touches. ---------
  const startMarquee = (event: ReactPointerEvent) => {
    if (readOnly || event.button !== 0 || (event.target as HTMLElement).closest("[data-node], [data-edge], button, input, textarea")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = toBoard(event.clientX, event.clientY);
    setMarquee({ pointerId: event.pointerId, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const moveMarquee = (event: ReactPointerEvent) => {
    if (!marquee || event.pointerId !== marquee.pointerId) return;
    const p = toBoard(event.clientX, event.clientY);
    setMarquee({ ...marquee, x1: p.x, y1: p.y });
  };
  const endMarquee = (event: ReactPointerEvent) => {
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
            const x = at.col * CELL_W;
            const y = at.row * CELL_H;
            return x < right && x + size.cols * CELL_W > left && y < bottom && y + size.rows * CELL_H > top;
          })
          .map(([id]) => id);
    setSelected(event.shiftKey ? [...new Set([...selected, ...hit])] : hit);
    setMarquee(null);
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
    update((s) => ({ ...s, expanded: s.expanded.filter((x) => x !== cycle.id) }));
  };
  const startLink = (event: ReactPointerEvent, blockId: string) => {
    if (readOnly || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setLink({ blockId, pointerId: event.pointerId, ...toBoard(event.clientX, event.clientY) });
  };
  const moveLink = (event: ReactPointerEvent) => {
    if (!link || event.pointerId !== link.pointerId) return;
    setLink({ ...link, ...toBoard(event.clientX, event.clientY) });
  };
  const endLink = (event: ReactPointerEvent) => {
    if (!link || event.pointerId !== link.pointerId) return;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-cycle-id]");
    if (under?.dataset.cycleId) connect(link.blockId, under.dataset.cycleId);
    setLink(null);
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
    setMenu({ kind: "canvas", x: event.clientX, y: event.clientY, cell: { col: Math.max(0, Math.floor(p.x / CELL_W)), row: Math.max(0, Math.floor(p.y / CELL_H)) } });
  };

  const pos = (id: string) => {
    const cell = layout[id] ?? { col: 0, row: 0 };
    const moving = Boolean(drag?.moved && (drag.id === id || drag.group[id]));
    return { left: cell.col * CELL_W + (moving ? drag!.dx : 0), top: cell.row * CELL_H + (moving ? drag!.dy : 0) };
  };

  // Cable geometry: from the socket on the block's edge to a plug at the cycle's header.
  const socketAt = (blockId: string) => {
    const a = pos(blockId);
    return { x: a.left + BLOCK_COLS * CELL_W - 4, y: a.top + CELL_H };
  };
  const edges = doc.blocks.flatMap((block) =>
    block.cycles.map((cycle) => {
      const from = socketAt(block.id);
      const b = pos(cycle.id);
      const open = expanded.has(cycle.id);
      const x2 = b.left + (open ? 0 : 4);
      const y2 = b.top + (open ? CELL_H / 2 : 24);
      const live = hoverEdge === `${block.id}-${cycle.id}` || hoverNode === block.id || hoverNode === cycle.id;
      return { id: `${block.id}-${cycle.id}`, cycleId: cycle.id, x1: from.x + 5, y1: from.y, x2, y2, live };
    }),
  );
  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const bend = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  };
  const linkFrom = link ? socketAt(link.blockId) : null;

  // Context menus ----------------------------------------------------------------------------
  const builtIns = useBuiltInFormulas();
  const customList = useFormulaList("", 1);
  const menuItems = (current: Menu): ContextMenuEntry[] => {
    switch (current.kind) {
      case "canvas":
        return [
          ...(readOnly
            ? []
            : ([
                { id: "add-block", label: t.addBlock, icon: <Plus /> },
                { id: "add-cycle", label: t.addCycle, icon: <Plus /> },
                { type: "separator", id: "s1" },
              ] as ContextMenuEntry[])),
          { id: "arrange", label: t.arrange, icon: <LayoutGrid /> },
          { id: "zoom-reset", label: t.zoomReset, shortcut: `${Math.round(zoom * 100)}%` },
        ];
      case "block":
        return readOnly
          ? []
          : [
              { id: "add-cycle", label: m.editor.addCycle, icon: <Plus /> },
              { id: "progression", label: t.progression.menu, icon: <TrendingUp /> },
              { type: "separator", id: "s1" },
              { id: "rename", label: m.editor.rename, icon: <Pencil /> },
              { id: "duplicate", label: m.editor.duplicate, icon: <Copy /> },
              { type: "separator", id: "s2" },
              { id: "remove", label: m.editor.remove, icon: <Trash2 />, tone: "danger" },
            ];
      case "cycle": {
        const parent = allCycles.find((c) => c.cycle.id === current.id)?.blockId ?? null;
        const isOpen = expanded.has(current.id);
        const targets = doc.blocks.filter((b) => b.id !== parent);
        return [
          ...(parent ? [{ id: "toggle", label: isOpen ? t.collapse : t.expand, icon: isOpen ? <ChevronDown /> : <ChevronRight /> } as ContextMenuEntry] : []),
          ...(readOnly
            ? []
            : ([
                ...(targets.length ? [{ type: "label", id: "l1", label: t.connectTo } as ContextMenuEntry] : []),
                ...targets.map((b) => ({ id: `connect:${b.id}`, label: b.name || m.editor.untitled, icon: <Link2 /> })),
                ...(parent ? [{ id: "disconnect", label: t.disconnect, icon: <Unlink /> }] : []),
                { type: "separator", id: "s1" },
                ...(parent
                  ? [
                      { id: "rename", label: m.editor.rename, icon: <Pencil /> },
                      { id: "edit", label: t.cycleSettings, icon: <CalendarDays /> },
                      { id: "duplicate", label: t.duplicateCycle, icon: <Copy /> },
                    ]
                  : []),
                { id: "remove", label: m.editor.remove, icon: <Trash2 />, tone: "danger" },
              ] as ContextMenuEntry[])),
        ];
      }
      case "edge":
        return readOnly ? [] : [{ id: "disconnect", label: t.removeConnection, icon: <Unlink />, tone: "danger" }];
      case "dayNote":
        return [];
      case "exercise":
        return readOnly
          ? []
          : [
              { id: "duplicate", label: t.duplicateExercise, icon: <Copy /> },
              ...(editor ? [{ id: "details", label: t.editSets, icon: <ListTree /> } as ContextMenuEntry] : []),
              { id: "up", label: m.editor.moveUp, icon: <ArrowUp /> },
              { id: "down", label: m.editor.moveDown, icon: <ArrowDown /> },
              { type: "separator", id: "s1" },
              { id: "remove", label: t.removeExercise, icon: <Trash2 />, tone: "danger" },
            ];
    }
  };
  const onMenuAction = (current: Menu, id: string) => {
    if (current.kind === "canvas") {
      if (id === "add-block") addBlockAt(current.cell);
      else if (id === "add-cycle") addCycleAt(current.cell);
      else if (id === "arrange") update((s) => ({ ...s, layout: autoLayout(doc, loose) }));
      else if (id === "zoom-reset") zoomTo("reset");
    } else if (current.kind === "block") {
      const block = doc.blocks.find((b) => b.id === current.id);
      if (!block) return;
      if (id === "add-cycle") apply?.((d) => addCycle(d, block.id, m.editor.cycleName(block.cycles.length + 1)).doc);
      else if (id === "progression") setProgressionBlock(block.id);
      else if (id === "rename") setRenaming(block.id);
      else if (id === "duplicate") apply?.((d) => duplicateNode(d, block.id).doc);
      else if (id === "remove") apply?.((d) => removeNode(d, block.id));
    } else if (current.kind === "cycle") {
      const isLoose = !locate(doc, current.id);
      if (id === "toggle") toggleExpanded(current.id);
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
      if (id === "disconnect") disconnect(current.cycleId);
    } else if (current.kind === "exercise") {
      const { instance, workout: w } = current;
      if (id === "details") setOpenWorkout(w.id);
      else if (id === "duplicate") apply?.((d) => duplicateNode(d, instance.id).doc);
      else if (id === "up") apply?.((d) => moveNode(d, instance.id, -1));
      else if (id === "down") apply?.((d) => moveNode(d, instance.id, 1));
      else if (id === "remove") apply?.((d) => removeNode(d, instance.id));
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
              apply?.((d) => setExerciseFormula(d, instance.id, use));
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

  const nodesForMinimap: MinimapNode[] = Object.entries(sizes).map(([id, s]) => ({
    id,
    kind: doc.blocks.some((b) => b.id === id) ? "block" : "cycle",
    x: HEADER + (layout[id]?.col ?? 0) * CELL_W,
    y: HEADER + (layout[id]?.row ?? 0) * CELL_H,
    w: s.cols * CELL_W,
    h: s.rows * CELL_H,
  }));

  return (
    <div className={`${styles.sheet} ${className ?? ""}`}>
      <div className={styles.tools}>
        {!readOnly ? (
          <>
            <Button size="sm" iconStart={<Plus />} onPress={() => addBlockAt(null)}>
              {t.addBlock}
            </Button>
            <Button size="sm" iconStart={<Plus />} onPress={() => addCycleAt(null)}>
              {t.addCycle}
            </Button>
          </>
        ) : null}
        <TooltipTrigger delay={300}>
          <Button size="sm" variant="ghost" iconStart={<LayoutGrid />} onPress={() => update((s) => ({ ...s, layout: autoLayout(doc, loose) }))}>
            {t.arrange}
          </Button>
          <Tooltip>{t.arrangeHint}</Tooltip>
        </TooltipTrigger>
        <Button size="sm" variant={volumeOpen ? "secondary" : "ghost"} iconStart={<BarChart3 />} onPress={() => setVolumeOpen((v) => !v)} aria-pressed={volumeOpen}>
          {t.volume.open}
        </Button>
        {!readOnly ? <span className={styles.hint}>{doc.blocks.length || loose.length ? `${t.openCycle} · ${t.zoomHint}` : t.empty}</span> : null}
      </div>

      <div ref={scrollerRef} className={styles.scroller}>
        <div style={{ width: boardW * zoom, height: boardH * zoom }}>
          <div
            ref={boardRef}
            className={styles.board}
            role="group"
            aria-label={t.label}
            data-dragging={drag?.moved || undefined}
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
              setMenu({ kind: "canvas", x: event.clientX, y: event.clientY, cell: { col: Math.max(0, Math.floor(p.x / CELL_W)), row: Math.max(0, Math.floor(p.y / CELL_H)) } });
            }}
          >
            <div className={styles.colHeads} aria-hidden="true">
              {Array.from({ length: cols }, (_, i) => (
                <span key={i}>{columnName(i)}</span>
              ))}
            </div>
            <div className={styles.rowHeads} aria-hidden="true">
              {Array.from({ length: rows }, (_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>

            <div className={styles.cells}>
              <svg className={styles.edges} width={cols * CELL_W} height={rows * CELL_H} aria-hidden="true">
                {edges.map((edge) => {
                  // The cable stops at the plug; the plug's pins disappear under the cycle card.
                  const d = curve(edge.x1, edge.y1, edge.x2 - 9, edge.y2);
                  return (
                    <g key={edge.id} data-edge data-live={edge.live || undefined} className={styles.edgeGroup}>
                      <path d={d} className={styles.edgeHit} onPointerEnter={() => setHoverEdge(edge.id)} onPointerLeave={() => setHoverEdge(null)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setMenu({ kind: "edge", x: event.clientX, y: event.clientY, cycleId: edge.cycleId });
                        }}
                      />
                      <path d={d} className={styles.edge} />
                      {edge.live ? <path d={d} className={styles.edgeCurrent} /> : null}
                      <rect x={edge.x2 - 10} y={edge.y2 - 4.5} width={7} height={9} rx={2} className={styles.plug} />
                      <path d={`M ${edge.x2 - 3} ${edge.y2 - 2} h 4 M ${edge.x2 - 3} ${edge.y2 + 2} h 4`} className={styles.plugPins} />
                    </g>
                  );
                })}
                {link && linkFrom ? <path d={curve(linkFrom.x + 5, linkFrom.y, link.x, link.y)} className={styles.edgeDraft} /> : null}
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

              {doc.blocks.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
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
                <CycleCard
                  key={cycle.id}
                  cycle={cycle}
                  loose={blockId === null}
                  expanded={expanded.has(cycle.id) && blockId !== null}
                  size={sizes[cycle.id]!}
                  style={pos(cycle.id)}
                  dragging={Boolean(drag?.moved && drag.group[cycle.id])}
                  selected={selected.includes(cycle.id)}
                  linkTarget={Boolean(link)}
                  apply={apply}
                  names={names}
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
                  onToggle={() => toggleExpanded(cycle.id)}
                  onDayNote={(x, y, dayNumber, note) => setMenu({ kind: "dayNote", x, y, cycleId: cycle.id, dayNumber, note })}
                  collapsedWorkouts={collapsedWorkouts}
                  onToggleWorkout={toggleWorkout}
                  onExerciseMenu={(event, instance, w) => setMenu({ kind: "exercise", x: event.clientX, y: event.clientY, instance, workout: w })}
                />
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
          label={menu.kind === "edge" ? t.connection : menu.kind === "dayNote" ? t.restDayNote(menu.dayNumber) : t.contextLabel}
          items={menuItems(menu)}
          onAction={(id) => onMenuAction(menu, id)}
          onClose={() => setMenu(null)}
        >
          {menu.kind === "exercise" && !readOnly ? exerciseExtra(menu.instance) : null}
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


      {apply ? <ProgressionDialog blockId={progressionBlock} doc={doc} names={names} apply={apply} onClose={() => setProgressionBlock(null)} /> : null}

      {volumeOpen ? <VolumePanel doc={doc} names={names} onClose={() => setVolumeOpen(false)} /> : null}

      {workout && editor ? (
        <WorkoutPanel
          workout={workout}
          editor={editor}
          names={names}
          advancedAllowed={advancedAllowed}
          customFormulas={customFormulas}
          readOnly={readOnly}
          onClose={() => setOpenWorkout(null)}
        />
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
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  label: string;
  className?: string;
  /** Pressing the text without dragging the card starts renaming with this key. */
  renameKey: string;
  editing: boolean;
  onDone: () => void;
}) {
  const m = useT();
  const original = useRef(value);
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
    <span className={className ?? styles.name} data-rename={readOnly ? undefined : renameKey} title={readOnly ? undefined : m.editor.sheet.renameHint}>
      {value || <span className={styles.cellPlaceholder}>{label}</span>}
    </span>
  );
}

function MenuButton({ label, onOpen }: { label: string; onOpen: (x: number, y: number) => void }) {
  const m = useT();
  return (
    <button
      type="button"
      className={styles.menu}
      aria-label={m.common.moreActions(label)}
      data-no-drag
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onOpen(rect.left, rect.bottom + 4);
      }}
    >
      <MoreVertical aria-hidden="true" />
    </button>
  );
}

function BlockCard({
  block,
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
      data-dragging={dragging || undefined}
      data-selected={selected || undefined}
      tabIndex={0}
      aria-label={`${t.blockLabel}: ${block.name}`}
      style={{ ...style, width: BLOCK_COLS * CELL_W - 8, minHeight: BLOCK_ROWS * CELL_H - 8 }}
      {...events}
    >
      <div className={styles.cardHead}>
        <span className={styles.chip} data-kind="block" aria-hidden="true">
          <Repeat />
        </span>
        <span className={styles.kind}>{t.blockLabel}</span>
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
  loose,
  expanded,
  size,
  style,
  dragging,
  selected,
  linkTarget,
  apply,
  names,
  onRenameLoose,
  onMenuButton,
  onToggle,
  onDayNote,
  collapsedWorkouts,
  onToggleWorkout,
  onExerciseMenu,
  renaming,
  onRename,
  ...events
}: {
  cycle: Cycle;
  loose: boolean;
  expanded: boolean;
  size: Size;
  style: React.CSSProperties;
  dragging: boolean;
  selected: boolean;
  linkTarget: boolean;
  apply?: Apply;
  names: Map<string, ExerciseLabel>;
  onRenameLoose: (name: string) => void;
  onMenuButton: (x: number, y: number) => void;
  onToggle: () => void;
  onDayNote: (x: number, y: number, dayNumber: number, note: string) => void;
  collapsedWorkouts: ReadonlySet<string>;
  onToggleWorkout: (workoutId: string) => void;
  onExerciseMenu: (event: React.MouseEvent | { clientX: number; clientY: number }, instance: ExerciseInstance, workout: Workout) => void;
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
      data-kind="cycle"
      data-cycle-id={cycle.id}
      data-loose={loose || undefined}
      data-expanded={expanded || undefined}
      data-link-target={linkTarget || undefined}
      data-dragging={dragging || undefined}
      data-selected={selected || undefined}
      tabIndex={0}
      aria-label={`${t.cycleLabel}: ${cycle.name}`}
      aria-expanded={loose ? undefined : expanded}
      title={loose || expanded ? undefined : t.openCycle}
      style={expanded ? { ...style, width: size.cols * CELL_W + 2, minHeight: size.rows * CELL_H + 2 } : { ...style, width: CYCLE_COLS * CELL_W - 8, minHeight: cycleRows(cycle) * CELL_H - 8 }}
      {...events}
    >
      <div className={styles.cardHead}>
        <div className={styles.headMain}>
          {!loose ? (
            <button type="button" className={styles.toggle} aria-label={expanded ? t.collapse : t.expand} data-no-drag onClick={onToggle}>
              <ChevronRight aria-hidden="true" data-open={expanded || undefined} />
            </button>
          ) : null}
          <span className={styles.chip} data-kind="cycle" aria-hidden="true">
            <CalendarDays />
          </span>
          {expanded ? (
            <InlineName
              value={cycle.name}
              readOnly={readOnly}
              label={m.common.col.name}
              className={styles.headName}
              editing={renaming === cycle.id}
              renameKey={cycle.id}
              onDone={() => onRename(null)}
              onChange={(name) => apply?.((doc) => updateNode(doc, cycle.id, { name }))}
            />
          ) : null}
        </div>
        <span className={styles.kind}>{t.cycleLength(Number(cycle.dayCount))}</span>
        {!readOnly ? <MenuButton label={cycle.name} onOpen={onMenuButton} /> : null}
      </div>
      {expanded ? (
        <CycleCells cycle={cycle} apply={apply} names={names} collapsed={collapsedWorkouts} onToggleWorkout={onToggleWorkout} onExerciseMenu={onExerciseMenu} />
      ) : (
        <>
          <InlineName
            value={cycle.name}
            readOnly={readOnly}
            label={m.common.col.name}
            editing={renaming === cycle.id}
            renameKey={cycle.id}
            onDone={() => onRename(null)}
            onChange={(name) => (loose ? onRenameLoose(name) : apply?.((doc) => updateNode(doc, cycle.id, { name })))}
          />
          {loose ? <p className={styles.loose}>{t.loose}</p> : null}
          <div className={styles.tiles} style={{ gridTemplateColumns: `repeat(${Math.min(7, Number(cycle.dayCount))}, minmax(0, 1fr))` }} role="list" aria-label={t.cycleLength(Number(cycle.dayCount))}>
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
                  title={training ? `${label} · ${t.expand}` : day.note ? label : `${label} · ${t.restDayAddNote}`}
                  aria-label={training ? `${label}. ${t.expand}` : `${label}. ${t.restDayAddNote}`}
                  onClick={(event) => {
                    if (training) {
                      if (!loose) onToggle();
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
          </div>
          {cycleWorkouts(cycle).length ? (
            <ul className={styles.legend}>
              {cycleWorkouts(cycle).map(({ workout, dayNumber }) => (
                <li key={workout.id}>
                  <span className={styles.legendDot} aria-hidden="true" />
                  <span className={styles.legendName}>{workout.name || m.editor.untitled}</span>
                  <span className={styles.legendDay}>{t.dayShort(dayNumber)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
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
