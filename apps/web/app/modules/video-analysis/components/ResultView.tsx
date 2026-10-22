import { useMutation } from "@tanstack/react-query";
import { Info, Play, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Button as AriaButton, ToggleButton } from "react-aria-components";
import type { AnalysisRepetition, AnalysisResult, TrajectoryPoint } from "@trainflow/api-client-web";
import { Button, Card, Switch, Tooltip, TooltipTrigger } from "@trainflow/ui-web";
import { RepSelect } from "./RepSelect";
import { RepTable } from "./RepTable";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { formatNumber } from "~/shared/i18n/format";
import { errorText } from "~/shared/lib/errorText";
import { useApi } from "~/shared/session/AccountScope";
import { readUrl } from "../api";
import { BarPathPlot, PHASE_KINDS, PhaseTimeline, TimeSeriesChart, phaseAt, type PhaseKind } from "./charts";
import styles from "./ResultView.module.css";

const positionOf = (p: TrajectoryPoint) => p.y;
const velocityOf = (p: TrajectoryPoint) => p.velocity ?? null;

/** How much of the path trails behind the point on the video. */
const TRAIL_SECONDS = 1;

/**
 * The tracked point drawn over the video in source pixels: the SVG shares the video's intrinsic size, so
 * "meet" scaling letterboxes it exactly like the video itself. The trail is coloured by phase.
 */
function TrackOverlay({ trajectory, repetitions, time, width, height, visible }: { trajectory: TrajectoryPoint[]; repetitions: AnalysisRepetition[]; time: number; width: number; height: number; visible: ReadonlySet<PhaseKind> }) {
  const trail = trajectory.filter((p) => !p.occluded && p.seconds <= time && p.seconds >= time - TRAIL_SECONDS);
  const current = trail[trail.length - 1];
  const fresh = current && time - current.seconds < 0.25;
  const segments: Array<{ kind: PhaseKind; d: string }> = [];
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!, b = trail[i]!;
    if (a.segment !== b.segment) continue;
    const kind = phaseAt(repetitions, b.seconds);
    segments.push({ kind, d: `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}` });
  }
  const r = Math.max(width, height) / 90;
  return (
    <svg className={styles.overlay} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {segments.map((s, i) => (
        <path key={i} d={s.d} className={styles.trail} data-kind={s.kind} data-hidden={visible.has(s.kind) ? undefined : ""} style={{ strokeWidth: r * 0.55, opacity: 0.25 + (0.75 * i) / Math.max(1, segments.length) }} />
      ))}
      {fresh ? <>
        <circle cx={current.x} cy={current.y} r={r * 1.9} className={styles.halo} data-kind={phaseAt(repetitions, current.seconds)} />
        <circle cx={current.x} cy={current.y} r={r} className={styles.point} data-kind={phaseAt(repetitions, current.seconds)} />
      </> : null}
    </svg>
  );
}

/** The lift itself, loaded on demand: signed URLs expire, so on error we ask for a fresh one instead of reusing it. */
export function VideoPlayer({
  mediaId,
  videoRef,
  cursor = null,
  onTime,
  source,
  overlay,
  autoLoad = false,
  onSize,
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
}) {
  const m = useT();
  const t = m.video.detail;
  const api = useApi();
  const own = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? own;
  const [ticket, setTicket] = useState<{ url: string; expiresAt: string } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [time, setTime] = useState(0);
  const load = useMutation({ mutationFn: () => (source ? source() : readUrl(api, mediaId)), onSuccess: setTicket });
  const loadRef = useRef(load.mutate);
  loadRef.current = load.mutate;
  useEffect(() => { if (autoLoad) loadRef.current(); }, [autoLoad, mediaId]);

  // Follow the video frame by frame (not only the ~4 Hz timeupdate), so charts and overlay move smoothly.
  useEffect(() => {
    const video = ref.current;
    if (!video || !ticket) return;
    let handle = 0;
    const frame = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number; cancelVideoFrameCallback?: (id: number) => void };
    const tick = () => {
      setTime(video.currentTime);
      onTime?.(video.currentTime);
      handle = frame.requestVideoFrameCallback ? frame.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    handle = frame.requestVideoFrameCallback ? frame.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    return () => { if (frame.cancelVideoFrameCallback) frame.cancelVideoFrameCallback(handle); else cancelAnimationFrame(handle); };
  }, [ticket, ref, onTime]);

  return (
    <Card padding="none" className={styles.player}>
      {ticket ? (
        <div className={styles.videoBox}>
          <video
            ref={ref}
            src={ticket.url}
            controls
            playsInline
            preload="auto"
            className={styles.video}
            onLoadedMetadata={(event) => {
              setSize({ w: event.currentTarget.videoWidth, h: event.currentTarget.videoHeight });
              onSize?.(event.currentTarget.videoWidth, event.currentTarget.videoHeight);
              if (cursor !== null) event.currentTarget.currentTime = cursor;
            }}
            onSeeked={(event) => { setTime(event.currentTarget.currentTime); onTime?.(event.currentTarget.currentTime); }}
            onError={() => setTicket(null)}
          />
          {overlay && size ? overlay(time, size.w, size.h) : null}
        </div>
      ) : (
        <div className={styles.placeholder}>
          {load.error ? <p className={styles.error}>{errorText(m, load.error)}</p> : null}
          <Button iconStart={<Play />} loading={load.isPending} onPress={() => load.mutate()}>
            {t.loadVideo}
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * Renders only what the analyzer delivered: no derived speed, no invented phases.
 * Video, charts and the phase timeline share one time cursor: play or scrub the video and the line follows;
 * drag the line on a chart and the video follows.
 */
export function ResultView({ result, mediaId, compact = false, aside, videoSource, aspect = 9 / 16 }: { result: AnalysisResult; mediaId?: string; compact?: boolean; aside?: ReactNode; videoSource?: () => Promise<{ url: string; expiresAt: string }>; /** Width / height of the video, known before it loads. */ aspect?: number }) {
  const m = useT();
  const t = m.video.detail;
  const locale = useLocale();
  const video = useRef<HTMLVideoElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  // null: every repetition (and the time around them); otherwise only the chosen ones.
  const [selected, setSelected] = useState<ReadonlySet<number> | null>(null);
  const [visible, setVisible] = useState<ReadonlySet<PhaseKind>>(new Set(PHASE_KINDS));
  const [showOverlay, setShowOverlay] = useState(true);
  const [ratio, setRatio] = useState(aspect);

  // Stable between video frames, so the charts are not rebuilt while the cursor moves.
  const shownReps = useMemo(() => (selected ? result.repetitions.filter((r) => selected.has(r.number)) : result.repetitions), [selected, result.repetitions]);
  const repetition = shownReps.length === 1 ? shownReps[0]! : null;
  // Only the chosen repetitions; each one is its own segment, so lines break between non-adjacent reps.
  const points = useMemo(() => (selected
    ? shownReps.flatMap((r, index) => result.trajectory.filter((p) => p.seconds >= r.startSeconds && p.seconds <= r.endSeconds).map((p) => ({ ...p, segment: (p.segment ?? 0) * 1000 + index })))
    : result.trajectory), [selected, shownReps, result.trajectory]);
  const choose = (next: ReadonlySet<number> | null) => {
    const all = !next || next.size === result.repetitions.length;
    setSelected(all ? null : next);
    if (next && next.size === 1) { const only = result.repetitions.find((r) => next.has(r.number)); if (only) seek(only.startSeconds); }
  };
  const toggleRep = (number: number, on: boolean) => {
    const next = new Set(selected ?? result.repetitions.map((r) => r.number));
    if (on) next.add(number); else next.delete(number);
    if (next.size) choose(next);
  };
  const kinds = useMemo(() => {
    const present = new Set<PhaseKind>(["none"]);
    for (const r of result.repetitions) for (const p of r.phases) present.add(phaseAt([{ ...r, phases: [p] }], (p.startSeconds + p.endSeconds) / 2));
    return PHASE_KINDS.filter((k) => present.has(k));
  }, [result.repetitions]);
  // With one phase kind shown in one repetition, its own numbers are shown too.
  const onlyKind = kinds.filter((k) => visible.has(k) && k !== "none");
  const phase = repetition && onlyKind.length === 1 ? repetition.phases.find((p) => phaseAt([{ ...repetition, phases: [p] }], (p.startSeconds + p.endSeconds) / 2) === onlyKind[0]) ?? null : null;
  const hasVelocity = points.some((p) => p.velocity !== null && p.velocity !== undefined);
  const unit = result.positionUnit;
  const velocityUnit = result.metersPerPixel ? "m/s" : `${unit}/s`;
  const meanQuality = points.length ? points.reduce((sum, p) => sum + p.quality, 0) / points.length : null;
  const occluded = points.filter((p) => p.occluded).length;
  const withPlayer = Boolean(mediaId) && !compact;

  const phaseNames = t.phaseNames;
  const phaseLabel = useCallback((kind: string) => phaseNames[kind.toLowerCase() as keyof typeof phaseNames] ?? kind, [phaseNames]);
  const speed = (value: number | null | undefined) => (value == null ? "—" : `${formatNumber(locale, value, 2)} ${velocityUnit}`);
  function seek(seconds: number) {
    setCursor(seconds);
    if (video.current) video.current.currentTime = seconds;
  }
  const toggle = (kind: PhaseKind, on: boolean) => setVisible((current) => {
    const next = new Set(current);
    if (on) next.add(kind); else next.delete(kind);
    if (!next.size) return current;
    return next;
  });

  // Everything the coach should be careful about sits behind one warning icon instead of a wall of alerts.
  const cautions = [
    ...(result.metersPerPixel ? [] : [t.uncalibrated]),
    ...(occluded ? [`${t.occluded}: ${occluded} ${occluded === 1 ? "sample" : "samples"}`] : []),
    ...result.warnings,
  ];
  const meta = (
    <div className={styles.meta}>
      <span className={styles.metaItem}>{result.metersPerPixel ? t.calibrated(result.metersPerPixel) : t.units(unit)}</span>
      {meanQuality !== null ? <span className={styles.metaItem}>{t.quality} <b>{Math.round(meanQuality * 100)}%</b></span> : null}
      <span className={styles.metaIcons}>
        {cautions.length ? (
          <TooltipTrigger delay={150}>
            <AriaButton className={styles.caution} aria-label={`${t.warnings}: ${cautions.length}`}>
              <TriangleAlert aria-hidden="true" />
            </AriaButton>
            <Tooltip placement="bottom end" className={styles.cautionTip}>
              <strong>{t.warnings}</strong>
              <ul>{cautions.map((caution) => <li key={caution}>{caution}</li>)}</ul>
            </Tooltip>
          </TooltipTrigger>
        ) : null}
        <TooltipTrigger delay={150}>
          <AriaButton className={styles.infoIcon} aria-label={t.engine(result.engineVersion, result.modelVersion)}>
            <Info aria-hidden="true" />
          </AriaButton>
          <Tooltip placement="bottom end">{t.engine(result.engineVersion, result.modelVersion)}</Tooltip>
        </TooltipTrigger>
      </span>
    </div>
  );

  const pickers = (
    <>
      {result.repetitions.length > 1 ? (
        <RepSelect repetitions={result.repetitions} selected={selected} onChange={choose} label={t.repetitions} allLabel={t.allReps} repLabel={t.rep} />
      ) : null}
      {kinds.length > 1 ? (
        <div className={styles.phaseFilter} role="group" aria-label={t.showPhases}>
          {kinds.map((kind) => (
            <ToggleButton key={kind} className={styles.phaseChip} data-kind={kind} isSelected={visible.has(kind)} onChange={(on) => toggle(kind, on)}>
              <span className={styles.phaseSwatch} aria-hidden="true" />
              {phaseLabel(kind)}
            </ToggleButton>
          ))}
        </div>
      ) : null}
    </>
  );

  const metrics = (
    <>
      {phase ? (
        <dl className={styles.phaseStats}>
          <div>
            <dt>{t.meanSpeed}</dt>
            <dd>{speed(phase.meanSpeed)}</dd>
          </div>
          <div>
            <dt>{t.peakSpeed}</dt>
            <dd>{speed(phase.peakSpeed)}</dd>
          </div>
          <div>
            <dt>{t.duration}</dt>
            <dd>{formatNumber(locale, phase.endSeconds - phase.startSeconds, 2)} s</dd>
          </div>
        </dl>
      ) : null}
      {result.repetitions.length ? (
        <RepTable label={t.repetitions} locale={locale}
          rows={result.repetitions.map((r) => {
            const on = !selected || selected.has(r.number);
            return {
              id: String(r.number), rep: r, speedUnit: velocityUnit, checked: on,
              onCheck: (next: boolean) => toggleRep(r.number, next),
              lockCheck: on && (selected ? selected.size === 1 : result.repetitions.length === 1),
              current: cursor != null && cursor >= r.startSeconds && cursor <= r.endSeconds,
              onJump: withPlayer ? () => seek(r.startSeconds) : undefined,
            };
          })} />
      ) : null}
      {result.repetitions.some((r) => r.meanSpeed == null || r.peakSpeed == null) ? <p className={styles.note}>{t.metricsMissing}</p> : null}
    </>
  );

  const charts = (
    <>
      <TimeSeriesChart
        points={points}
        value={positionOf}
        invert
        unit={unit}
        label={t.position}
        cursor={cursor}
        onSeek={withPlayer ? seek : undefined}
        repetitions={shownReps}
        visible={visible}
        timeLabel={t.time}
        locale={locale}
        phaseLabel={phaseLabel}
      />
      {hasVelocity ? (
        <TimeSeriesChart points={points} value={velocityOf} unit={velocityUnit} label={phase ? `${phaseLabel(phase.kind)} · ${t.velocity}` : t.velocity} cursor={cursor} onSeek={withPlayer ? seek : undefined} repetitions={shownReps} visible={visible} timeLabel={t.time} locale={locale} phaseLabel={phaseLabel} />
      ) : (
        <p className={styles.note}>{t.noVelocity}</p>
      )}
      {result.repetitions.length ? (
        <section aria-label={t.phases}>
          <h3 className={styles.subTitle}>{t.phases}</h3>
          <PhaseTimeline repetitions={shownReps} phaseLabel={phaseLabel} repLabel={t.rep} locale={locale} cursor={cursor} onSeek={withPlayer ? seek : undefined} />
        </section>
      ) : null}
    </>
  );

  const overlay = showOverlay
    ? (time: number, width: number, height: number) => <TrackOverlay trajectory={result.trajectory} repetitions={result.repetitions} time={time} width={width} height={height} visible={visible} />
    : undefined;
  const player = mediaId ? (
    <div className={styles.playerStack}>
      <VideoPlayer mediaId={mediaId} source={videoSource} videoRef={video} cursor={cursor} onTime={setCursor} overlay={overlay} autoLoad={aside !== undefined} onSize={(w, h) => setRatio(w / h)} />
      <Switch isSelected={showOverlay} onChange={setShowOverlay} className={styles.overlaySwitch}>
        {t.overlay}
      </Switch>
    </div>
  ) : null;

  if (aside !== undefined && !compact) {
    return (
      <div className={styles.detail} style={{ "--ratio": ratio } as CSSProperties} data-portrait={ratio < 1 || undefined}>
        <div className={styles.videoCol}>{player}</div>
        <Card padding="none" className={styles.sheet}>
          <div className={styles.sheetSection}>{meta}</div>
          {result.repetitions.length ? (
            <div className={styles.sheetSection}>
              <div className={styles.pickers}>{pickers}</div>
              {metrics}
            </div>
          ) : null}
          <div className={styles.sheetSection}>{charts}</div>
          <div className={`${styles.sheetSection} ${styles.sheetPath}`}>
            <BarPathPlot points={points} unit={unit} label={t.trajectory} cursor={cursor} repetitions={shownReps} visible={visible} locale={locale} phaseLabel={phaseLabel} />
            <div className={styles.sheetAside}>{aside}</div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.result}>
      {meta}
      <div className={styles.pickers}>{pickers}</div>
      {metrics}
      <div className={compact ? styles.stack : styles.grid}>
        {withPlayer ? player : null}
        <BarPathPlot points={points} unit={unit} label={t.trajectory} cursor={cursor} repetitions={shownReps} visible={visible} locale={locale} phaseLabel={phaseLabel} />
      </div>
      {charts}
    </div>
  );
}

/** The detail page without a result yet: the video large, details and status beside it. */
export function AnalysisStage({ aside, mediaId, aspect = 9 / 16, children }: { aside: ReactNode; mediaId?: string; aspect?: number; children: ReactNode }) {
  const [ratio, setRatio] = useState(aspect);
  return (
    <div className={styles.detail} style={{ "--ratio": ratio } as CSSProperties} data-portrait={ratio < 1 || undefined}>
      <div className={styles.videoCol}>{mediaId ? <VideoPlayer mediaId={mediaId} autoLoad onSize={(w, h) => setRatio(w / h)} /> : null}</div>
      <Card padding="none" className={styles.sheet}>
        <div className={styles.sheetSection}>{children}</div>
        <div className={styles.sheetSection}>{aside}</div>
      </Card>
    </div>
  );
}
