import { Minus, Plus } from "lucide-react";
import { useRef } from "react";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./SheetCanvas.module.css";

export interface MinimapNode {
  id: string;
  kind: "block" | "cycle";
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
  view,
  zoom,
  onNavigate,
  onZoom,
}: {
  boardWidth: number;
  boardHeight: number;
  nodes: MinimapNode[];
  view: { x: number; y: number; w: number; h: number };
  zoom: number;
  onNavigate: (centerX: number, centerY: number) => void;
  onZoom: (next: number | "reset") => void;
}) {
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
        {nodes.map((node) => (
          <rect key={node.id} x={node.x * scale} y={node.y * scale} width={Math.max(2, node.w * scale)} height={Math.max(2, node.h * scale)} rx={1} data-kind={node.kind} />
        ))}
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
