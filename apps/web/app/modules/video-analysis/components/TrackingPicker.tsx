import { Eraser, Pause, RefreshCcw, Scan, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AnalysisTracking } from "@trainflow/api-client-web";
import { Alert, Button, IconButton } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./TrackingPicker.module.css";

export type TrackingSelection = AnalysisTracking;

const MAX_ZOOM = 6;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The video and overlay share its intrinsic aspect ratio: no letterbox offsets. While a frame is
 * frozen it can be zoomed (wheel, buttons, + / −) and panned by dragging, so points land precisely;
 * clicks map back through the zoom because the overlay is scaled together with the video.
 */
export function TrackingPicker({ src, value, onChange, disabled = false }: {
  src: string; value: TrackingSelection | null; onChange: (value: TrackingSelection | null) => void; disabled?: boolean;
}) {
  const t = useT().video.new.tracking;
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [keyboard, setKeyboard] = useState({ x: 50, y: 50 });
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const invalidate = () => { if (value) onChange(null); };

  // Zoom only applies to a frozen frame; playing the video always shows all of it.
  useEffect(() => { if (!value) setView({ z: 1, x: 0, y: 0 }); }, [value]);

  /** Zoom to `z`, keeping the stage point (sx, sy) still under the pointer. */
  function zoomTo(z: number, sx?: number, sy?: number) {
    const el = stage.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setView((v) => {
      const next = clamp(z, 1, MAX_ZOOM);
      const px = sx ?? w / 2;
      const py = sy ?? h / 2;
      const x = px - ((px - v.x) * next) / v.z;
      const y = py - ((py - v.y) * next) / v.z;
      return { z: next, x: clamp(x, w - w * next, 0), y: clamp(y, h - h * next, 0) };
    });
  }

  function add(x: number, y: number) {
    if (!value || disabled || value.points.length >= 2 || video.current?.seeking) return;
    const point = { x: Math.min(value.videoWidth - 1, Math.max(0, Math.round(x))), y: Math.min(value.videoHeight - 1, Math.max(0, Math.round(y))) };
    if (value.points.some((p) => p.x === point.x && p.y === point.y)) return;
    onChange({ ...value, points: [...value.points, point] });
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (view.z <= 1) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = stage.current;
    if (!d || !el) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    d.x = event.clientX;
    d.y = event.clientY;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setView((v) => ({ ...v, x: clamp(v.x + dx, w - w * v.z, 0), y: clamp(v.y + dy, h - h * v.z, 0) }));
  };

  const frozen = Boolean(value);

  // Wheel zoom around the pointer; a native listener so the page doesn't scroll at the same time.
  const frame = useRef<HTMLDivElement>(null);
  const wheel = useRef<(event: WheelEvent) => void>(() => undefined);
  wheel.current = (event) => {
    const el = stage.current;
    if (!frozen || !el) return;
    event.preventDefault();
    const rect = el.getBoundingClientRect();
    // rect includes the pan (scale origin is 0 0), so this is the pointer in the stage's own box.
    zoomTo(view.z * (event.deltaY < 0 ? 1.25 : 0.8), event.clientX - rect.left + view.x, event.clientY - rect.top + view.y);
  };
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const listener = (event: WheelEvent) => wheel.current(event);
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, []);
  const needed = value ? 2 - value.points.length : 2;
  const freeze = () => {
    const player = video.current;
    if (!player || player.seeking || !player.videoWidth || !player.videoHeight) return;
    player.pause();
    onChange(value ? null : { timestampSeconds: player.currentTime, videoWidth: player.videoWidth, videoHeight: player.videoHeight, points: [] });
  };

  // One column: a header with the live status, the video as large as the panel allows, one toolbar under it.
  return <section className={styles.picker} aria-label={t.title}>
    <div className={styles.head}>
      <h3>{t.title}</h3>
      <p role="status" className={styles.status} data-missing={(value && needed > 0) || undefined} data-done={(value && needed === 0) || undefined}>
        {value ? (needed > 0 ? t.missing(needed) : t.selected(2)) : t.chooseFrame}
      </p>
    </div>

    <div ref={frame} className={styles.frame} data-zoomed={view.z > 1 || undefined}>
      <div ref={stage} className={styles.stage} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, "--z": view.z } as React.CSSProperties}>
        <video ref={video} src={src} controls={!value && !disabled} playsInline preload="auto"
          onLoadedData={() => { setReady(true); setFailed(false); onChange(null); }}
          onSeeking={invalidate} onPlay={invalidate}
          onTimeUpdate={(event) => { if (value && Math.abs(event.currentTarget.currentTime - value.timestampSeconds) > 0.001) invalidate(); }}
          onError={() => { setReady(false); setFailed(true); onChange(null); }} />
        {value ? <div role="button" tabIndex={disabled ? -1 : 0} aria-label={t.canvas} aria-disabled={disabled || value.points.length === 2}
          className={styles.overlay} data-full={value.points.length === 2 || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
          onClick={(event) => {
            if (drag.current?.moved) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width && rect.height) add((event.clientX - rect.left) / rect.width * value.videoWidth, (event.clientY - rect.top) / rect.height * value.videoHeight);
          }}
          onKeyDown={(event) => {
            if (disabled) return;
            const delta = event.shiftKey ? 5 : 1;
            if (event.key.startsWith("Arrow")) {
              event.preventDefault();
              setKeyboard((p) => ({ x: Math.min(100, Math.max(0, p.x + (event.key === "ArrowRight" ? delta : event.key === "ArrowLeft" ? -delta : 0))), y: Math.min(100, Math.max(0, p.y + (event.key === "ArrowDown" ? delta : event.key === "ArrowUp" ? -delta : 0))) }));
            } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); add(keyboard.x / 100 * value.videoWidth, keyboard.y / 100 * value.videoHeight); }
            else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(view.z * 1.25); }
            else if (event.key === "-") { event.preventDefault(); zoomTo(view.z * 0.8); }
          }}>
          <span className={styles.crosshair} style={{ left: `${keyboard.x}%`, top: `${keyboard.y}%` }}>+</span>
          {value.points.map((point, index) => <span key={index} className={styles.marker} style={{ left: `${point.x / value.videoWidth * 100}%`, top: `${point.y / value.videoHeight * 100}%` }} />)}
        </div> : null}
      </div>
    </div>

    <div className={styles.toolbar}>
      <div className={styles.group} role="group" aria-label={t.frameTools}>
        <Button size="sm" variant={value ? "secondary" : "primary"} iconStart={value ? <RefreshCcw /> : <Pause />} isDisabled={disabled || !ready} onPress={freeze}>
          {value ? t.changeFrame : t.freeze}
        </Button>
        <IconButton size="sm" variant="ghost" icon={<Undo2 />} label={t.undo} isDisabled={disabled || !value?.points.length} onPress={() => value && onChange({ ...value, points: value.points.slice(0, -1) })} />
        <IconButton size="sm" variant="ghost" icon={<Eraser />} label={t.clear} isDisabled={disabled || !value?.points.length} onPress={() => value && onChange({ ...value, points: [] })} />
      </div>
      <div className={styles.group} role="group" aria-label={t.zoomTools}>
        <IconButton size="sm" variant="ghost" icon={<ZoomOut />} label={t.zoomOut} isDisabled={!frozen || view.z <= 1} onPress={() => zoomTo(view.z / 1.5)} />
        <span className={styles.zoomLevel} aria-live="polite">{Math.round(view.z * 100)}%</span>
        <IconButton size="sm" variant="ghost" icon={<ZoomIn />} label={t.zoomIn} isDisabled={!frozen || view.z >= MAX_ZOOM} onPress={() => zoomTo(view.z * 1.5)} />
        <IconButton size="sm" variant="ghost" icon={<Scan />} label={t.zoomFit} isDisabled={!frozen || view.z <= 1} onPress={() => setView({ z: 1, x: 0, y: 0 })} />
      </div>
    </div>
    {failed ? <Alert tone="danger" title={t.loadError} /> : null}
    <p className={styles.note}>
      {t.hint} {t.pixels}
      {value ? <span className={styles.meta}>{` ${value.timestampSeconds.toFixed(3)} s · ${value.videoWidth} × ${value.videoHeight} px`}</span> : null}
    </p>
  </section>;
}
