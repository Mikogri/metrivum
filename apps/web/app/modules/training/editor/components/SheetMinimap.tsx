import type { ZoomState } from "../zoom-state";
import { Minus, Plus } from "lucide-react";
import { memo, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./SheetCanvas.module.css";

export interface MinimapNode {
  id: string;
  kind: "block" | "cycle" | "workout";
  x: number;
  y: number;
  w: number;
  h: number;
}

const WIDTH = 184;
const MAX_HEIGHT = 120;

/**
 * Overview in the corner: every card as a small rectangle and the visible area as a frame.
 * Clicking or dragging on it moves the view there; the zoom controls sit next to it.
 */
export function SheetMinimap({
  boardWidth,
  boardHeight,
  nodes,
  scroller,
  zoomSource,
  onNavigate,
  onZoom,
}: {
  boardWidth: number;
  boardHeight: number;
  nodes: MinimapNode[];
  scroller: RefObject<HTMLDivElement | null>;
  zoomSource: ZoomState;
  onNavigate: (centerX: number, centerY: number) => void;
  onZoom: (next: number | "reset") => void;
}) {
  const zoom = useSyncExternalStore(zoomSource.subscribe, zoomSource.getSnapshot, zoomSource.getSnapshot);
  const view = useSheetViewport(scroller, zoom);
  const m = useT();
  const t = m.editor.sheet;
  const ref = useRef<SVGSVGElement>(null);
  const scale = Math.min(WIDTH / boardWidth, MAX_HEIGHT / boardHeight);
  const width = boardWidth * scale;
  const height = boardHeight * scale;

  const go = (event: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    onNavigate((event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale);
  };

  return (
    <div className={styles.minimap}>
      <svg
        ref={ref}
        width={width}
        height={height}
        role="img"
        aria-label={t.minimap}
        className={styles.minimapSvg}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          go(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) go(event);
        }}
      >
        <NodeRects nodes={nodes} scale={scale} />
        <rect className={styles.minimapView} x={view.x * scale} y={view.y * scale} width={view.w * scale} height={view.h * scale} rx={2} />
      </svg>
      <div className={styles.zoom}>
        <button type="button" aria-label={t.zoomOut} onClick={() => onZoom(zoom / 1.2)}>
          <Minus aria-hidden="true" />
        </button>
        <button type="button" className={styles.zoomValue} aria-label={t.zoomReset} title={t.zoomHint} onClick={() => onZoom("reset")}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label={t.zoomIn} onClick={() => onZoom(zoom * 1.2)}>
          <Plus aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Scroll position belongs to the minimap, never to the editable card tree. */
export function useSheetViewport(scroller: RefObject<HTMLDivElement | null>, zoom: number) {
  const [view, setView] = useState({ x: 0, y: 0, w: 1, h: 1 });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const next = { x: el.scrollLeft / zoom, y: el.scrollTop / zoom, w: el.clientWidth / zoom, h: el.clientHeight / zoom };
      setView(current => current.x === next.x && current.y === next.y && current.w === next.w && current.h === next.h ? current : next);
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(sync); };
    sync();
    el.addEventListener("scroll", scroll, { passive: true });
    const observer = new ResizeObserver(scroll);
    observer.observe(el);
    return () => { el.removeEventListener("scroll", scroll); observer.disconnect(); cancelAnimationFrame(frame); };
  }, [scroller, zoom]);
  return view;
}

const NodeRects = memo(function NodeRects({ nodes, scale }: { nodes: MinimapNode[]; scale: number }) {
  return <>{nodes.map(node => <rect key={node.id} x={node.x * scale} y={node.y * scale} width={Math.max(2, node.w * scale)} height={Math.max(2, node.h * scale)} rx={1} data-kind={node.kind} />)}</>;
});
