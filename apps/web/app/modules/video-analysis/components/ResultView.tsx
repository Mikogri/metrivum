import { useMutation } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import type { AnalysisResult } from "@trainflow/api-client-web";
import { Alert, Badge, Button, Card, Segment, SegmentedControl } from "@trainflow/ui-web";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { formatNumber } from "~/shared/i18n/format";
import { errorText } from "~/shared/lib/errorText";
import { useApi } from "~/shared/session/AccountScope";
import { readUrl } from "../api";
import { BarPathPlot, PhaseTimeline, TimeSeriesChart } from "./charts";
import styles from "./ResultView.module.css";

/** The lift itself, loaded on demand: signed URLs expire, so on error we ask for a fresh one instead of reusing it. */
export function VideoPlayer({
  mediaId,
  videoRef,
  cursor = null,
  onTime,
}: {
  mediaId: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  cursor?: number | null;
  onTime?: (seconds: number) => void;
}) {
  const m = useT();
  const t = m.video.detail;
  const api = useApi();
  const [ticket, setTicket] = useState<{ url: string; expiresAt: string } | null>(null);
  const load = useMutation({ mutationFn: () => readUrl(api, mediaId), onSuccess: setTicket });
  return (
    <Card padding="sm" className={styles.player}>
      {ticket ? (
        <video
          ref={videoRef}
          src={ticket.url}
          controls
          playsInline
          preload="metadata"
          className={styles.video}
          onLoadedMetadata={(event) => {
            if (cursor !== null) event.currentTarget.currentTime = cursor;
          }}
          onTimeUpdate={(event) => onTime?.(event.currentTarget.currentTime)}
          onError={() => setTicket(null)}
        />
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
 * On the detail page (`aside` given) everything about the analysis sits in one sheet, in sections,
 * and the video has its own container beside it.
 */
export function ResultView({ result, mediaId, compact = false, aside }: { result: AnalysisResult; mediaId?: string; compact?: boolean; aside?: ReactNode }) {
  const m = useT();
  const t = m.video.detail;
  const locale = useLocale();
  const video = useRef<HTMLVideoElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [rep, setRep] = useState<string>("all");
  const [phaseIndex, setPhaseIndex] = useState("all");

  const repetition = rep === "all" ? null : result.repetitions.find((r) => String(r.number) === rep) ?? null;
  const phase = repetition && phaseIndex !== "all" ? repetition.phases[Number(phaseIndex)] : null;
  const repPoints = repetition ? result.trajectory.filter((p) => p.seconds >= repetition.startSeconds && p.seconds <= repetition.endSeconds) : result.trajectory;
  const points = phase ? repPoints.filter((p) => p.seconds >= phase.startSeconds && p.seconds <= phase.endSeconds) : repPoints;
  const hasVelocity = points.some((p) => p.velocity !== null && p.velocity !== undefined);
  const unit = result.positionUnit;
  const velocityUnit = result.metersPerPixel ? "m/s" : `${unit}/s`;
  const meanQuality = points.length ? points.reduce((sum, p) => sum + p.quality, 0) / points.length : null;
  const occluded = points.filter((p) => p.occluded).length;
  const shownReps = repetition ? [repetition] : result.repetitions;
  const withPlayer = Boolean(mediaId) && !compact;

  const phaseLabel = (kind: string) => t.phaseNames[kind.toLowerCase() as keyof typeof t.phaseNames] ?? kind;
  const speed = (value: number | null | undefined) => (value == null ? "—" : `${formatNumber(locale, value, 2)} ${velocityUnit}`);
  const seek = (seconds: number) => {
    setCursor(seconds);
    if (video.current) video.current.currentTime = seconds;
  };

  const meta = (
    <div className={styles.meta}>
      <Badge size="sm">{t.units(unit)}</Badge>
      {result.metersPerPixel ? <Badge size="sm" tone="success">{t.calibrated(result.metersPerPixel)}</Badge> : <Badge size="sm" tone="warning">{t.uncalibrated}</Badge>}
      {meanQuality !== null ? <Badge size="sm">{`${t.quality}: ${Math.round(meanQuality * 100)}%`}</Badge> : null}
      {occluded ? <Badge size="sm" tone="warning">{`${t.occluded}: ${occluded}`}</Badge> : null}
      <span className={styles.engine}>{t.engine(result.engineVersion, result.modelVersion)}</span>
    </div>
  );

  const warnings = result.warnings.length ? (
    <Alert tone="warning" title={t.warnings}>
      <ul className={styles.warnings}>
        {result.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </Alert>
  ) : null;

  const pickers = (
    <>
      {result.repetitions.length > 0 ? (
        <SegmentedControl
          size="sm"
          aria-label={t.repetitions}
          selectedKeys={[rep]}
          onSelectionChange={(keys) => {
            const next = String([...keys][0] ?? "all");
            setRep(next);
            setPhaseIndex("all");
            const selected = result.repetitions.find((r) => String(r.number) === next);
            if (selected) seek(selected.startSeconds);
          }}
        >
          <Segment id="all">{t.allReps}</Segment>
          {result.repetitions.map((r) => (
            <Segment key={r.number} id={String(r.number)}>
              {t.rep(r.number)}
            </Segment>
          ))}
        </SegmentedControl>
      ) : null}
      {repetition?.phases.length ? (
        <SegmentedControl
          size="sm"
          aria-label={t.phases}
          selectedKeys={[phaseIndex]}
          onSelectionChange={(keys) => {
            const next = String([...keys][0] ?? "all");
            setPhaseIndex(next);
            const selected = next === "all" ? repetition : repetition.phases[Number(next)];
            if (selected) seek(selected.startSeconds);
          }}
        >
          <Segment id="all">{t.allPhases}</Segment>
          {repetition.phases.map((p, index) => (
            <Segment key={index} id={String(index)}>
              {phaseLabel(p.kind)}
            </Segment>
          ))}
        </SegmentedControl>
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
        <div className={styles.metrics}>
          <table>
            <thead>
              <tr>
                <th>{t.repetitions}</th>
                <th>{t.meanLiftingSpeed}</th>
                <th>{t.peakLiftingSpeed}</th>
                <th>{t.duration}</th>
              </tr>
            </thead>
            <tbody>
              {shownReps.map((r) => (
                <tr key={r.number}>
                  <th>{t.rep(r.number)}</th>
                  <td>{speed(r.meanSpeed)}</td>
                  <td>{speed(r.peakSpeed)}</td>
                  <td>{formatNumber(locale, r.endSeconds - r.startSeconds, 2)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shownReps.some((r) => r.meanSpeed == null || r.peakSpeed == null) ? <p className={styles.note}>{t.metricsMissing}</p> : null}
        </div>
      ) : null}
    </>
  );

  const charts = (
    <>
      <TimeSeriesChart
        points={points}
        value={(p) => p.y}
        unit={unit}
        label={t.position}
        cursor={cursor}
        onSeek={withPlayer ? seek : undefined}
        repetitions={shownReps}
        timeLabel={t.time}
        locale={locale}
      />
      {hasVelocity ? (
        <TimeSeriesChart points={points} value={(p) => p.velocity ?? null} unit={velocityUnit} label={phase ? `${phaseLabel(phase.kind)} · ${t.velocity}` : t.velocity} cursor={cursor} onSeek={withPlayer ? seek : undefined} timeLabel={t.time} locale={locale} />
      ) : (
        <p className={styles.note}>{t.noVelocity}</p>
      )}
      {result.repetitions.length ? (
        <section aria-label={t.phases}>
          <h3 className={styles.subTitle}>{t.phases}</h3>
          <PhaseTimeline repetitions={shownReps} phaseLabel={phaseLabel} repLabel={t.rep} locale={locale} />
        </section>
      ) : null}
    </>
  );

  if (aside !== undefined && !compact) {
    return (
      <div className={styles.duo}>
        <Card padding="none" className={styles.sheet}>
          <div className={styles.sheetSection}>{aside}</div>
          <div className={styles.sheetSection}>
            {meta}
            {warnings}
          </div>
          {result.repetitions.length ? (
            <div className={styles.sheetSection}>
              <div className={styles.pickers}>{pickers}</div>
              {metrics}
            </div>
          ) : null}
          <div className={`${styles.sheetSection} ${styles.sheetCharts}`}>
            <BarPathPlot points={points} unit={unit} label={t.trajectory} cursor={cursor} />
            <div className={styles.stack}>{charts}</div>
          </div>
        </Card>
        <div className={styles.videoCol}>{mediaId ? <VideoPlayer mediaId={mediaId} videoRef={video} cursor={cursor} onTime={setCursor} /> : null}</div>
      </div>
    );
  }

  return (
    <div className={styles.result}>
      {meta}
      {warnings}
      {pickers}
      {metrics}
      <div className={compact ? styles.stack : styles.grid}>
        {withPlayer ? <VideoPlayer mediaId={mediaId!} videoRef={video} cursor={cursor} onTime={setCursor} /> : null}
        <BarPathPlot points={points} unit={unit} label={t.trajectory} cursor={cursor} />
      </div>
      {charts}
    </div>
  );
}

/** The detail page without a result yet: details and status in one sheet, the video beside it. */
export function AnalysisStage({ aside, mediaId, children }: { aside: ReactNode; mediaId?: string; children: ReactNode }) {
  return (
    <div className={styles.duo}>
      <Card padding="none" className={styles.sheet}>
        <div className={styles.sheetSection}>{aside}</div>
        <div className={styles.sheetSection}>{children}</div>
      </Card>
      <div className={styles.videoCol}>{mediaId ? <VideoPlayer mediaId={mediaId} /> : null}</div>
    </div>
  );
}
