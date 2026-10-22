import { ArrowLeftToLine, ArrowRightToLine, Check, Crosshair, Eraser, Pause, Play, RotateCcw, Scan, Scissors, StepBack, StepForward, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AnalysisTracking } from "@trainflow/api-client-web";
import { Alert, Button, IconButton } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import type { VideoTrim } from "../local-analysis";
import { FRAME, PlayerButton, Scrubber, clock as playClock } from "./VideoPlayer";
import styles from "./TrackingPicker.module.css";

export type TrackingSelection = AnalysisTracking;

const MAX_ZOOM = 6;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The video and overlay share its intrinsic aspect ratio: no letterbox offsets. While a frame is
 * frozen it can be zoomed (wheel, buttons, + / −) and panned by dragging, so points land precisely;
 * clicks map back through the zoom because the overlay is scaled together with the video.
 */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

export function TrackingPicker({ src, value, onChange, disabled = false, onMetadata, compact = false, trim = null, onTrimChange }: {
  src: string; value: TrackingSelection | null; onChange: (value: TrackingSelection | null) => void; disabled?: boolean;
  onMetadata?: (metadata: { durationSeconds: number; width: number; height: number }) => void;
  /** Tall (portrait) layout: only the video and its tools, the explanations live beside it. */
  compact?: boolean;
  /** Only this part is analyzed; playback stays inside it. Null: the whole video. */
  trim?: VideoTrim | null;
  onTrimChange?: (trim: VideoTrim | null) => void;
}) {
  const t = useT().video.new.tracking;
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [keyboard, setKeyboard] = useState({ x: 50, y: 50 });
  const [duration, setDuration] = useState(0);
  const [now, setNow] = useState(0);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [playing, setPlaying] = useState(false);
  // While playing, the time follows every frame so the scrub bar moves smoothly.
  useEffect(() => {
    const player = video.current;
    if (!playing || !player) return;
    let handle = 0;
    const tick = () => { setNow(player.currentTime); handle = requestAnimationFrame(tick); };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing]);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  // Coming back to a video that already has points: seek to their frame instead of clearing them.
  const restoring = useRef(false);
  const invalidate = () => { if (value && !restoring.current) onChange(null); };

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
  const togglePlay = () => { const player = video.current; if (!player || value || disabled) return; if (player.paused) void player.play(); else player.pause(); };
  const seekTo = (seconds: number) => { const player = video.current; if (!player || value) return; player.currentTime = seconds; setNow(seconds); };
  const step = (delta: number) => { const player = video.current; if (!player || value) return; player.pause(); seekTo(Math.min(duration, Math.max(0, player.currentTime + delta))); };
  const freeze = () => {
    const player = video.current;
    if (!player || player.seeking || !player.videoWidth || !player.videoHeight) return;
    player.pause();
    onChange(value ? null : { timestampSeconds: player.currentTime, videoWidth: player.videoWidth, videoHeight: player.videoHeight, points: [] });
  };

  // One column: a header with the live status, the video as large as the panel allows, one toolbar under it.
  return <section className={styles.picker} aria-label={t.title} data-compact={compact || undefined}>
    <div className={styles.head}>
      <h3>{t.title}</h3>
      <p role="status" className={styles.status} data-missing={(value && needed > 0) || undefined} data-done={(value && needed === 0) || undefined}>
        {value ? (needed > 0 ? t.missing(needed) : t.selected(2)) : t.chooseFrame}
      </p>
    </div>

    <div ref={frame} className={styles.frame} data-zoomed={view.z > 1 || undefined}>
      <div ref={stage} className={styles.stage} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, "--z": view.z } as React.CSSProperties}>
        <video ref={video} src={src} playsInline preload="auto" onClick={togglePlay} onPause={() => setPlaying(false)}
          onLoadedData={event => {
            setReady(true); setFailed(false);
            const video = event.currentTarget;
            if (Number.isFinite(video.duration)) setDuration(video.duration);
            if (value && value.videoWidth === video.videoWidth && value.videoHeight === video.videoHeight) {
              restoring.current = true;
              video.currentTime = value.timestampSeconds;
            } else onChange(null);
            if (Number.isFinite(video.duration) && video.duration > 0)
              onMetadata?.({ durationSeconds: video.duration, width: video.videoWidth, height: video.videoHeight });
          }}
          onSeeking={invalidate}
          onSeeked={() => { restoring.current = false; }}
          onTimeUpdate={(event) => {
            const player = event.currentTarget;
            setNow(player.currentTime);
            if (value && Math.abs(player.currentTime - value.timestampSeconds) > 0.001) invalidate();
            // Playback stays inside the trimmed part.
            if (trim && !value && !player.paused && player.currentTime >= trim.endSeconds) { player.pause(); player.currentTime = trim.endSeconds; }
          }}
          onPlay={(event) => { setPlaying(true); invalidate(); const player = event.currentTarget; if (trim && (player.currentTime < trim.startSeconds || player.currentTime >= trim.endSeconds - 0.05)) player.currentTime = trim.startSeconds; }}
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
          {value.points.map((point, index) => <span key={index} className={styles.marker} style={{ left: `${point.x / value.videoWidth * 100}%`, top: `${point.y / value.videoHeight * 100}%` }}><span className={styles.markerNo}>{index + 1}</span></span>)}
        </div> : null}
      </div>
      {/* On the video itself: the one next step, as small as the marking guide that follows it. */}
      {ready && !value && !disabled ? <button type="button" className={styles.freezeChip} onClick={freeze}>
        <Crosshair aria-hidden="true" />Freeze frame<span className={styles.freezeHint}>where the bar is clearly visible</span>
      </button> : null}
      {value && !disabled ? <div className={styles.onVideo}>
        <p className={styles.guide} data-done={needed === 0 || undefined} aria-hidden="true">
          {needed === 0 ? <><Check />{t.guideDone}</> : <><span className={styles.guideStep}>{3 - needed}</span>{t.guide(3 - needed)}</>}
        </p>
        <button type="button" className={styles.cancelChip} onClick={freeze}><X aria-hidden="true" />Cancel</button>
      </div> : null}
    </div>

    {/* Playback (the same bar as the analysis player), then one control bar: frame and point tools, zoom. */}
    <div className={styles.playback}>
      <Scrubber time={now} duration={duration} onSeek={seekTo} disabled={!ready || frozen || disabled}
        markers={trim ? [{ start: trim.startSeconds, end: trim.endSeconds, label: "Analyzed part" }] : []} />
    </div>
    <div className={styles.controls}>
      <div className={styles.group} role="group" aria-label="Playback">
        <PlayerButton label={playing ? "Pause" : "Play"} onPress={togglePlay}>{playing ? <Pause /> : <Play />}</PlayerButton>
        <PlayerButton label="Previous frame" onPress={() => step(-FRAME)}><StepBack /></PlayerButton>
        <PlayerButton label="Next frame" onPress={() => step(FRAME)}><StepForward /></PlayerButton>
        <span className={styles.clock}>{playClock(now)}<span> / {playClock(duration)}</span></span>
      </div>
      <div className={styles.group} role="group" aria-label={t.frameTools}>
        <Button size="sm" variant={value ? "ghost" : "secondary"} iconStart={value ? <X /> : <Crosshair />} isDisabled={disabled || !ready} onPress={freeze}>
          {value ? "Cancel" : compact ? "Freeze" : t.freeze}
        </Button>
        <span className={styles.divider} aria-hidden="true" />
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
    {onTrimChange && duration > 0 ? <div className={styles.trim} role="group" aria-label="Trim video" data-trimmed={trim ? "" : undefined}>
      <div className={styles.trimHead}>
        <span className={styles.trimLabel}><Scissors aria-hidden="true" />{trim ? "Trimmed" : "Trim"}</span>
        <span className={styles.trimTimes}>
          <span>{clock(trim?.startSeconds ?? 0)}</span><span aria-hidden="true">→</span><span>{clock(trim?.endSeconds ?? duration)}</span>
          <small>{((trim?.endSeconds ?? duration) - (trim?.startSeconds ?? 0)).toFixed(1)} s</small>
        </span>
        <span className={styles.trimActions}>
          <IconButton size="sm" variant="ghost" icon={<ArrowLeftToLine />} label="Start at the playhead" isDisabled={disabled || now >= (trim?.endSeconds ?? duration) - 0.5}
            onPress={() => onTrimChange({ startSeconds: Math.round(now * 100) / 100, endSeconds: trim?.endSeconds ?? duration })} />
          <IconButton size="sm" variant="ghost" icon={<ArrowRightToLine />} label="End at the playhead" isDisabled={disabled || now <= (trim?.startSeconds ?? 0) + 0.5}
            onPress={() => onTrimChange({ startSeconds: trim?.startSeconds ?? 0, endSeconds: Math.round(now * 100) / 100 })} />
          <IconButton size="sm" variant="ghost" icon={<RotateCcw />} label="Whole video" isDisabled={disabled || !trim} onPress={() => onTrimChange(null)} />
        </span>
      </div>
      <Slider aria-label="Part of the video to analyze" className={styles.trimSlider} minValue={0} maxValue={duration} step={0.05} isDisabled={disabled}
        value={[trim?.startSeconds ?? 0, trim?.endSeconds ?? duration]}
        onChange={(range) => {
          const [start, end] = range as number[];
          if (end! - start! < 0.5) return;
          const whole = start! <= 0.01 && end! >= duration - 0.01;
          onTrimChange(whole ? null : { startSeconds: Math.round(start! * 100) / 100, endSeconds: Math.round(end! * 100) / 100 });
          const player = video.current;
          if (player && !value) player.currentTime = range[0] !== (trim?.startSeconds ?? 0) ? start! : end!;
        }}>
        <SliderTrack className={styles.trimTrack}>
          {({ state }) => <>
            <span className={styles.trimShade} style={{ left: 0, width: `${state.getThumbPercent(0) * 100}%` }} />
            <span className={styles.trimRange} style={{ left: `${state.getThumbPercent(0) * 100}%`, width: `${(state.getThumbPercent(1) - state.getThumbPercent(0)) * 100}%` }} />
            <span className={styles.trimShade} style={{ left: `${state.getThumbPercent(1) * 100}%`, right: 0 }} />
            <span className={styles.trimNow} style={{ left: `${(now / duration) * 100}%` }} />
            <SliderThumb index={0} className={styles.trimThumb} aria-label="Start" />
            <SliderThumb index={1} className={styles.trimThumb} aria-label="End" />
          </>}
        </SliderTrack>
      </Slider>
    </div> : null}
    {failed ? <Alert tone="danger" title={t.loadError} /> : null}
  </section>;
}
