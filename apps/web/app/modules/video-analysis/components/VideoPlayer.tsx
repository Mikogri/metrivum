import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Maximize,
  Minimize,
  Pause,
  Play,
  StepBack,
  StepForward,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Button as AriaButton } from "react-aria-components";
import { Button, Tooltip, TooltipTrigger } from "@portable-ui/react";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useApi } from "~/shared/session/AccountScope";
import { readUrl } from "../api";
import styles from "./VideoPlayer.module.css";

/** Speeds the speed button cycles through. */
const SPEEDS = [1, 0.5, 0.25] as const;
/** Phones record at 30 fps or more; one step is one such frame. */
export const FRAME = 1 / 30;
/** In full screen the bar hides after this long without mouse movement while the video plays. */
const IDLE_MS = 2500;

/** 0:03.4: tenths are enough to find a moment in a lift. */
export function clock(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(safe);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${Math.floor((safe - whole) * 10)}`;
}

/** Length of the video; some files report Infinity until read, so fall back to what is seekable. */
function lengthOf(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration)) return video.duration;
  return video.seekable.length
    ? video.seekable.end(video.seekable.length - 1)
    : 0;
}

/** A time span drawn on the scrub bar, e.g. one repetition. */
export interface PlayerMarker {
  start: number;
  end: number;
  label: string;
}

/** The scrub bar: played part, marked spans and a handle. Arrow keys step one frame, Shift+arrow one second. */
export function Scrubber({
  time,
  duration,
  markers = [],
  onSeek,
  disabled = false,
}: {
  time: number;
  duration: number;
  markers?: PlayerMarker[];
  onSeek: (seconds: number) => void;
  disabled?: boolean;
}) {
  const uiCopy = useUiCopy();

  const track = useRef<HTMLDivElement>(null);
  const at = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    return (
      Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * duration
    );
  };
  const ratio = duration > 0 ? Math.min(1, time / duration) : 0;
  return (
    <div
      ref={track}
      className={styles.scrub}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={uiCopy["ui"]["Seek"]}
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 100) / 100}
      aria-valuenow={Math.round(time * 100) / 100}
      aria-valuetext={`${clock(time)} of ${clock(duration)}`}
      onPointerDown={(event) => {
        if (!duration || disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSeek(at(event.clientX));
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          onSeek(at(event.clientX));
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        const step = event.shiftKey ? 1 : FRAME;
        const next = {
          ArrowRight: time + step,
          ArrowLeft: time - step,
          Home: 0,
          End: duration,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        onSeek(Math.min(duration, Math.max(0, next)));
      }}
    >
      <span className={styles.track}>
        {duration > 0
          ? markers.map((marker) => (
              <span
                key={`${marker.start}-${marker.end}`}
                className={styles.marker}
                title={marker.label}
                style={{
                  left: `${(marker.start / duration) * 100}%`,
                  width: `${(Math.max(0, marker.end - marker.start) / duration) * 100}%`,
                }}
              />
            ))
          : null}
        <span
          className={styles.played}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </span>
      <span className={styles.handle} style={{ left: `${ratio * 100}%` }} />
    </div>
  );
}

/** An icon button of the player bar, with its name as a tooltip. `pressed` makes it a toggle. */
export function PlayerButton({
  label,
  onPress,
  pressed,
  children,
}: {
  label: string;
  onPress: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <TooltipTrigger delay={400}>
      <AriaButton
        className={styles.control}
        aria-label={label}
        aria-pressed={pressed}
        onPress={onPress}
      >
        {children}
      </AriaButton>
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  );
}

/**
 * The lift video with its own bar: play, frame steps, a scrub bar with marked repetitions, speed, full screen and
 * (optionally) hiding the video. Loaded on demand: signed URLs expire, so on error a fresh one is asked for.
 *
 * `frame` fixes the proportions of the video area (e.g. 16 / 9); the video fits inside with black bars.
 * The parent can cap the video area's height with the `--player-max-height` custom property.
 */
export function VideoPlayer({
  mediaId,
  videoRef,
  cursor = null,
  onTime,
  source,
  overlay,
  autoLoad = false,
  onSize,
  markers = [],
  tools,
  frame,
  collapsed = false,
  onCollapse,
  inset = false,
}: {
  mediaId: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  cursor?: number | null;
  onTime?: (seconds: number) => void;
  /** Where the signed URL comes from; defaults to the owner's media read URL. */
  source?: () => Promise<{ url: string; expiresAt: string }>;
  /** Drawn over the video, synchronised with its current frame. */
  overlay?: (time: number, width: number, height: number) => ReactNode;
  autoLoad?: boolean;
  onSize?: (width: number, height: number) => void;
  /** Spans shown on the scrub bar (repetitions). */
  markers?: PlayerMarker[];
  /** Extra buttons at the end of the bar (e.g. the tracked-point toggle). */
  tools?: ReactNode;
  /** Fixed width / height of the video area. */
  frame?: number;
  /** Hidden video: only the bar stays, still driving everything that follows the time. */
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  /** Inside a card that already draws the frame: no border or radius of its own. */
  inset?: boolean;
}) {
  const m = useT();
  const api = useApi();
  const own = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? own;
  const root = useRef<HTMLDivElement>(null);
  const [ticket, setTicket] = useState<{
    url: string;
    expiresAt: string;
  } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [rate, setRate] = useState<number>(SPEEDS[0]);
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const load = useMutation({
    mutationFn: () => (source ? source() : readUrl(api, mediaId)),
    onSuccess: setTicket,
  });
  const loadRef = useRef(load.mutate);
  loadRef.current = load.mutate;
  useEffect(() => {
    if (autoLoad) loadRef.current();
  }, [autoLoad, mediaId]);

  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === root.current;
      setFull(on);
      // Keyboard control works right away in full screen.
      if (on) {
        root.current?.focus();
        wake();
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Follow the video frame by frame (not only the ~4 Hz timeupdate), so charts and overlay move smoothly.
  // A hidden video presents no frames, so it is followed with animation frames instead.
  useEffect(() => {
    const video = ref.current;
    if (!video || !ticket) return;
    const frames = (collapsed ? {} : video) as {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };
    let handle = 0;
    const next = (tick: () => void) =>
      frames.requestVideoFrameCallback
        ? frames.requestVideoFrameCallback.call(video, tick)
        : requestAnimationFrame(tick);
    const tick = () => {
      setTime(video.currentTime);
      onTime?.(video.currentTime);
      handle = next(tick);
    };
    handle = next(tick);
    return () => {
      if (frames.cancelVideoFrameCallback)
        frames.cancelVideoFrameCallback.call(video, handle);
      else cancelAnimationFrame(handle);
    };
  }, [ticket, ref, onTime, collapsed]);

  const seek = (seconds: number) => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = seconds;
    setTime(seconds);
    onTime?.(seconds);
  };
  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };
  const step = (delta: number) => {
    const video = ref.current;
    if (!video) return;
    video.pause();
    seek(Math.min(duration, Math.max(0, video.currentTime + delta)));
  };
  const nextSpeed = () => {
    const next =
      SPEEDS[
        (SPEEDS.indexOf(rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length
      ]!;
    if (ref.current) ref.current.playbackRate = next;
    setRate(next);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.();
  };
  // Space or K plays and pauses, arrows step one frame (Shift: one second), F toggles full screen.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const target = event.target as HTMLElement;
    if (
      target !== event.currentTarget &&
      target.matches("button") &&
      (event.key === " " || event.key === "Enter")
    )
      return;
    const key = event.key.toLowerCase();
    if (key === " " || key === "k") {
      event.preventDefault();
      toggle();
    } else if (key === "arrowleft") {
      event.preventDefault();
      step(event.shiftKey ? -1 : -FRAME);
    } else if (key === "arrowright") {
      event.preventDefault();
      step(event.shiftKey ? 1 : FRAME);
    } else if (key === "f") {
      event.preventDefault();
      fullscreen();
    }
  };
  const syncLength = (video: HTMLVideoElement) => {
    const length = lengthOf(video);
    setDuration((current) => Math.max(current, length));
  };

  if (!ticket) {
    return (
      <div
        className={styles.placeholder}
        style={frame ? ({ "--frame": frame } as CSSProperties) : undefined}
        data-framed={frame ? "" : undefined}
        data-inset={inset || undefined}
      >
        {load.error ? (
          <p className={styles.error}>{errorText(m, load.error)}</p>
        ) : null}
        <Button
          iconStart={<Play />}
          loading={load.isPending}
          onPress={() => load.mutate()}
        >
          {m.video.detail.loadVideo}
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={root}
      className={styles.player}
      tabIndex={-1}
      onKeyDown={onKey}
      style={frame ? ({ "--frame": frame } as CSSProperties) : undefined}
      data-framed={frame ? "" : undefined}
      data-inset={inset || undefined}
      data-full={full || undefined}
      data-collapsed={(collapsed && !full) || undefined}
      data-idle={(full && idle && !paused) || undefined}
      onPointerMove={full ? wake : undefined}
      onPointerDown={full ? wake : undefined}
    >
      <div className={styles.screen}>
        <video
          ref={ref}
          src={ticket.url}
          playsInline
          preload="auto"
          className={styles.video}
          onClick={toggle}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onDurationChange={(event) => syncLength(event.currentTarget)}
          onProgress={(event) => syncLength(event.currentTarget)}
          onTimeUpdate={(event) => syncLength(event.currentTarget)}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setSize({ w: video.videoWidth, h: video.videoHeight });
            syncLength(video);
            video.playbackRate = rate;
            onSize?.(video.videoWidth, video.videoHeight);
            if (cursor !== null) video.currentTime = cursor;
          }}
          onSeeked={(event) => {
            setTime(event.currentTarget.currentTime);
            onTime?.(event.currentTarget.currentTime);
          }}
          onError={() => setTicket(null)}
        />
        {overlay && size ? overlay(time, size.w, size.h) : null}
      </div>
      <div className={styles.bar}>
        <Scrubber
          time={time}
          duration={duration}
          markers={markers}
          onSeek={seek}
        />
        <div className={styles.row}>
          <span
            className={styles.steps}
            role="group"
            aria-label={m["ui"]["Playback"]}
          >
            <PlayerButton
              label={m["ui"]["Previous frame"]}
              onPress={() => step(-FRAME)}
            >
              <StepBack />
            </PlayerButton>
            <PlayerButton
              label={paused ? m["ui"]["Play"] : m["ui"]["Pause"]}
              onPress={toggle}
            >
              {paused ? <Play /> : <Pause />}
            </PlayerButton>
            <PlayerButton
              label={m["ui"]["Next frame"]}
              onPress={() => step(FRAME)}
            >
              <StepForward />
            </PlayerButton>
          </span>
          <span className={styles.clock}>
            {clock(time)}
            <span className={styles.total}> / {clock(duration)}</span>
          </span>
          <span className={styles.spacer} />
          <TooltipTrigger delay={400}>
            <AriaButton
              className={styles.speed}
              aria-label={formatInterfaceText(m["ui"]["Playback speed {0}×"], [
                rate,
              ])}
              onPress={nextSpeed}
            >
              {rate}×
            </AriaButton>
            <Tooltip>{m["ui"]["Playback speed"]}</Tooltip>
          </TooltipTrigger>
          {tools}
          {onCollapse && !full ? (
            <PlayerButton
              label={collapsed ? m["ui"]["Show video"] : m["ui"]["Hide video"]}
              onPress={() => onCollapse(!collapsed)}
            >
              {collapsed ? <ChevronDown /> : <ChevronUp />}
            </PlayerButton>
          ) : null}
          <PlayerButton
            label={full ? m["ui"]["Exit full screen"] : m["ui"]["Full screen"]}
            onPress={fullscreen}
          >
            {full ? <Minimize /> : <Maximize />}
          </PlayerButton>
        </div>
      </div>
    </div>
  );
}
