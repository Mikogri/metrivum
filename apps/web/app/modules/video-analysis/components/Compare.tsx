import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import type { AnalysisResult } from '@metrivum/api-client-web';
import { Alert, Button, Card, Dialog, Chip, ChipGroup, IconButton, SearchInput, Skeleton } from '@metrivum/ui-web';
import { formatNumber, formatRelative } from '~/shared/i18n/format';
import type { Locale } from '~/shared/i18n/locale';
import { useLocale } from '~/shared/i18n/LocaleContext';
import { useT } from '~/shared/i18n/AppLocale';
import { useDebounced } from '~/shared/lib/useDebounced';
import { useAccountKey, useApi } from '~/shared/session/AccountScope';
import { getResult, getSharedResult, listSaved, sharedVideoUrl } from '../api';
import { useAnalysisList } from '../queries';
import { isLift, LIFTS, movementLabel, type AnalysisLabel } from '../movement';
import { normalizePhase, OverlayChart, movementSpeed, type OverlayLine } from './charts';

const PHASE_NAMES = { eccentric: 'Lowering', pause: 'Pause', concentric: 'Lifting' } as const;
import { VideoPlayer } from './VideoPlayer';
import { RepTable } from './RepTable';
import styles from './Compare.module.css';

/** An analysis to compare: one of yours, or one shared with you (read through its link). */
export type CompareSource =
  | { kind: 'own'; id: string; name: string; mediaId?: string | null }
  | { kind: 'shared'; token: string; name: string; hasVideo: boolean };

export const sourceKey = (source: CompareSource) => (source.kind === 'own' ? `own:${source.id}` : `shared:${source.token}`);

/** One colour per video (the number badge over the video uses it too); at most four videos are compared. */
const MAX_COMPARED = 4;
const VIDEO_COLORS = ['#3b6fe0', '#d6456f', '#1f9d82', '#c9741f'];

/** The same hue for every rep of one video, lighter for each further rep. */
function shade(hex: string, step: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = Math.min(0.6, step * 0.22);
  const channel = (shift: number) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * mix);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/** Loads every source's result (cached per analysis, so adding one more does not reload the others). */
export function useCompareResults(sources: CompareSource[]) {
  const api = useApi();
  const account = useAccountKey();
  return useQueries({
    queries: sources.map(source => ({
      queryKey: source.kind === 'own' ? [account, 'video', 'result', source.id, 'all'] : [account, 'video', 'shared', source.token, 'result'],
      queryFn: ({ signal }: { signal: AbortSignal }) => (source.kind === 'own' ? getResult(api, source.id, { maxPoints: 1000 }, signal) : getSharedResult(api, source.token, signal)),
      staleTime: 5 * 60_000,
    })),
  });
}

interface RepRow { id: string; source: CompareSource; sourceIndex: number; result: AnalysisResult; rep: AnalysisResult['repetitions'][number]; color: string }

/**
 * Up to four analyses side by side: their videos in a row, every repetition in one sortable table (marked with
 * its video), and the ticked repetitions drawn over each other, each measured from its own start.
 */
export function CompareView({ sources, results, onRemove }: { sources: CompareSource[]; results: Array<AnalysisResult | undefined>; onRemove?: (source: CompareSource) => void }) {
  const uiCopy = useUiCopy();

  // Width / height of each loaded video, by source.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const setRatio = (key: string, ratio: number) => setRatios(current => (current[key] === ratio ? current : { ...current, [key]: ratio }));
  const locale = useLocale();
  const api = useApi();
  const rows = useMemo(() => {
    const out: RepRow[] = [];
    sources.forEach((source, sourceIndex) => {
      const result = results[sourceIndex];
      if (!result) return;
      result.repetitions.forEach((rep, step) => out.push({ id: `${sourceKey(source)}#${rep.number}`, source, sourceIndex, result, rep, color: shade(VIDEO_COLORS[sourceIndex % VIDEO_COLORS.length]!, step) }));
    });
    return out;
  }, [sources, results]);
  // By default the first rep of every video is compared; tick more in the table.
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const defaults = useMemo(() => new Set(sources.map(source => rows.find(row => row.source === source)?.id).filter((id): id is string => Boolean(id))), [rows, sources]);
  const selected = picked ?? defaults;
  const chosen = rows.filter(row => selected.has(row.id));
  const toggle = (id: string, on: boolean) => setPicked(() => { const next = new Set(selected); if (on) next.add(id); else next.delete(id); return next; });
  const units = new Set(chosen.map(row => row.result.positionUnit));

  const position: OverlayLine[] = [];
  const path: OverlayLine[] = [];
  for (const row of chosen) {
    const samples = row.result.trajectory.filter(p => !p.occluded && p.seconds >= row.rep.startSeconds && p.seconds <= row.rep.endSeconds);
    if (!samples.length) continue;
    // Chest contact is not tracked: use the lifting start, or the lowest tracked position as a fallback.
    const lifting = row.rep.phases.find(p => normalizePhase(p.kind) === 'concentric');
    const zero = lifting
      ? samples.reduce((best, p) => Math.abs(p.seconds - lifting.startSeconds) < Math.abs(best.seconds - lifting.startSeconds) ? p : best)
      : samples.reduce((lowest, p) => p.y > lowest.y ? p : lowest);
    const first = samples[0]!;
    const common = { id: row.id, label: `Vid ${row.sourceIndex + 1} / Rep ${row.rep.number}`, color: row.color };
    position.push({ ...common, x: samples.map(p => p.seconds - row.rep.startSeconds), y: samples.map(p => zero.y - p.y) });
    path.push({ ...common, x: samples.map(p => p.x - first.x), y: samples.map(p => p.y - first.y) });
  }
  const unit = units.size === 1 ? [...units][0]! : 'px';

  // Compare corresponding occurrences, never silently discard repeated phases of the same kind.
  const phases = (['eccentric', 'pause', 'concentric'] as const).flatMap(kind => {
    const count = Math.max(0, ...chosen.map(row => row.rep.phases.filter(p => normalizePhase(p.kind) === kind).length));
    return Array.from({ length: count }, (_, occurrence) => ({ kind, occurrence, count, lines: chosen.flatMap(row => {
      const phase = row.rep.phases.filter(p => normalizePhase(p.kind) === kind)[occurrence];
      if (!phase) return [];
      const part = row.result.trajectory.filter(p => p.seconds >= phase.startSeconds && p.seconds <= phase.endSeconds);
      if (part.length < 2 || !part.some(p => !p.occluded && p.velocity != null)) return [];
      return [{ id: `${row.id}:${kind}:${occurrence}`, label: `Vid ${row.sourceIndex + 1} / Rep ${row.rep.number}`, color: row.color,
        x: part.map(p => p.seconds - phase.startSeconds), y: part.map(p => p.occluded ? null : movementSpeed(p)) }];
    }) })).filter(phase => phase.lines.length);
  });

  const speedUnit = (result: AnalysisResult) => (result.metersPerPixel ? 'm/s' : `${result.positionUnit}/s`);
  const loading = results.some(result => !result);

  // Every video gets the same frame: 9:16 while any video is portrait (or not loaded yet), 16:9 when all are landscape.
  // A video in the other proportions gets black bars; the cards never change size.
  const frame = sources.length > 0 && sources.every(source => (ratios[sourceKey(source)] ?? 0) >= 1) ? 16 / 9 : 9 / 16;

  return <div className={styles.compare}>
    <div className={styles.videos} style={{ '--count': Math.min(sources.length, MAX_COMPARED), '--frame': frame } as React.CSSProperties}>
      {sources.map((source, index) => <Card key={sourceKey(source)} as="section" padding="none" className={styles.videoCard} aria-label={source.name}>
        <header className={styles.videoHead}>
          <span className={styles.videoIndex} style={{ background: VIDEO_COLORS[index % VIDEO_COLORS.length] }}>{index + 1}</span>
          <span className={styles.videoName} title={source.name}>{uiCopy["ui"]["Vid"]} {index + 1}<small>{source.name}</small></span>
          {source.kind === 'shared' ? <span className={styles.videoTag}>{uiCopy["ui"]["Shared"]}</span> : null}
          {onRemove && sources.length > 1 ? <IconButton size="sm" variant="ghost" icon={<X />} label={formatInterfaceText(uiCopy["ui"]["Remove {0}"], [source.name])} onPress={() => onRemove(source)} /> : null}
        </header>
        <div className={styles.videoBody}>
          {source.kind === 'own' && source.mediaId ? <VideoPlayer mediaId={source.mediaId} inset frame={frame} onSize={(w, h) => setRatio(sourceKey(source), w / h)} />
            : source.kind === 'shared' && source.hasVideo ? <VideoPlayer mediaId={source.token} inset frame={frame} onSize={(w, h) => setRatio(sourceKey(source), w / h)} source={() => sharedVideoUrl(api, source.token)} />
            : <p className={styles.noVideo}>{uiCopy["ui"]["No video"]}</p>}
        </div>
      </Card>)}
    </div>

    {loading ? <Skeleton height="10rem" radius="lg" /> : null}
    {units.size > 1 ? <Alert tone="warning" title={uiCopy["ui"]["These videos use different units, so positions are not on the same scale."]} /> : null}

    {rows.length ? <RepTable label={uiCopy["ui"]["Repetitions of the compared videos"]} locale={locale} showSource
      rows={rows.map(row => ({ id: row.id, rep: row.rep, speedUnit: speedUnit(row.result), checked: selected.has(row.id), onCheck: (on: boolean) => toggle(row.id, on), color: row.color,
        source: { index: row.sourceIndex, name: row.source.name, color: VIDEO_COLORS[row.sourceIndex % VIDEO_COLORS.length]! } }))} />
      : !loading ? <p className={styles.hint}>{uiCopy["ui"]["The analyzer found no repetitions in these videos."]}</p> : null}

    {chosen.length ? <Card padding="md" className={styles.charts}>
      <OverlayChart lines={position} label={uiCopy["ui"]["Bar height"]} unit={unit} locale={locale}
        description={uiCopy["ui"]["Vertical bar displacement relative to the start of lifting (an approximation of the bar at the chest). Without a lifting phase, the lowest tracked position is zero. Positive values are above zero; negative values are below it. Time starts at the beginning of each repetition."]} />
      {phases.map(phase => <OverlayChart key={`${phase.kind}:${phase.occurrence}`} lines={phase.lines} label={formatInterfaceText(uiCopy["ui"]["{0}{1} from the start of the phase"], [PHASE_NAMES[phase.kind],phase.count > 1 ? ` ${phase.occurrence + 1}` : ''])} description={formatInterfaceText(uiCopy["ui"]["Bar speed during {0} only. Time starts at the beginning of that phase for each repetition. Speed is nonnegative; missing measurements appear as gaps. Patterns from different repetitions are overlaid."], [PHASE_NAMES[phase.kind].toLowerCase()])}
        unit={chosen[0] ? speedUnit(chosen[0].result) : 'px/s'} locale={locale} height={253} timeOrigin="phase" />)}
      <div className={styles.pathRow}>
        <div className={styles.path}><OverlayChart lines={path} label={uiCopy["video"]["detail"]["trajectory"]} unit={unit} xUnit={unit} locale={locale} square invertY
          description={uiCopy["ui"]["The tracked bar path over the full repetition. Each path starts at zero; horizontal and vertical axes use the same scale. Down on the plot means down in the video."]} /></div>
        <PhaseBars rows={chosen} locale={locale} />
      </div>
    </Card> : rows.length ? <p className={styles.hint}>{uiCopy["ui"]["Tick repetitions in the table to draw them."]}</p> : null}
  </div>;
}

/** Each compared rep's phases as one bar on a common time scale, with every phase's time. */
function PhaseBars({ rows, locale }: { rows: RepRow[]; locale: Locale }) {
  const uiCopy = useUiCopy();

  const longest = Math.max(...rows.map(row => row.rep.endSeconds - row.rep.startSeconds), 0.001);
  return <section className={styles.phaseBars} aria-label={uiCopy["ui"]["Phase times"]}>
    <h3>{uiCopy["ui"]["Phase times"]}</h3>
    <ul className={styles.phaseRows}>
      {rows.map(row => <li key={row.id}>
        <span className={styles.phaseLabel}><i style={{ background: row.color }} aria-hidden="true" />{uiCopy["ui"]["Vid"]} {row.sourceIndex + 1}  {uiCopy["ui"]["· Rep"]} {row.rep.number}<b>{formatNumber(locale, row.rep.endSeconds - row.rep.startSeconds, 2)} s</b></span>
        <span className={styles.phaseTrack} style={{ width: `${((row.rep.endSeconds - row.rep.startSeconds) / longest) * 100}%` }}>
          {row.rep.phases.map((phase, i) => {
            const kind = normalizePhase(phase.kind);
            const time = phase.endSeconds - phase.startSeconds;
            const same = row.rep.phases.filter(p => normalizePhase(p.kind) === kind);
            const ordinal = same.length > 1 ? ` ${same.indexOf(phase) + 1}` : '';
            return <span key={i} className={styles.phaseSegment} data-kind={kind} style={{ flexGrow: time }} title={`${PHASE_NAMES[kind as keyof typeof PHASE_NAMES] ?? "Other"}${ordinal}: ${formatNumber(locale, time, 2)} s`}>
              <span>{formatNumber(locale, time, 1)}</span>
            </span>;
          })}
        </span>
      </li>)}
    </ul>
    <ul className={styles.phaseKey} aria-label={uiCopy["video"]["detail"]["phases"]}>
      <li data-kind="eccentric">{uiCopy["video"]["detail"]["phaseNames"]["eccentric"]}</li><li data-kind="pause">{uiCopy["video"]["detail"]["phaseNames"]["pause"]}</li><li data-kind="concentric">{uiCopy["video"]["detail"]["phaseNames"]["concentric"]}</li>
    </ul>
  </section>;
}

/** Choose analyses to compare with: yours (completed) and the ones shared with you. Several at once. */
export function CompareDialog({ exclude, initial, onClose, onConfirm }: { exclude: string[]; initial: CompareSource[]; onClose: () => void; onConfirm: (sources: CompareSource[]) => void }) {
  const uiCopy = useUiCopy();

  const m = useT();
  const api = useApi();
  const account = useAccountKey();
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const query = useDebounced(search, 250);
  // One search box: it matches the analysis name or its exercise, so the lists are filtered here.
  const own = useAnalysisList({ status: 'Completed', sort: 'newest', pageSize: 100 });
  const saved = useQuery({ queryKey: [account, 'video', 'saved'] as const, queryFn: ({ signal }) => listSaved(api, signal) });
  const [lift, setLift] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, CompareSource>>(() => new Map(initial.map(source => [sourceKey(source), source])));
  const all: Array<{ source: CompareSource; meta: string; movement: string; configuration: AnalysisLabel }> = [
    ...(own.data ?? []).map(item => ({ source: { kind: 'own' as const, id: item.id, name: item.name, mediaId: item.mediaId }, meta: formatRelative(locale as Locale, item.completedAt ?? item.createdAt), movement: movementLabel(item.configuration), configuration: item.configuration })),
    ...(saved.data ?? []).map(item => ({ source: { kind: 'shared' as const, token: item.token, name: item.name, hasVideo: item.hasVideo }, meta: `Shared by ${item.ownerName}`, movement: movementLabel(item.configuration), configuration: item.configuration ?? null })),
  ].filter(option => !exclude.includes(sourceKey(option.source)));
  const text = query.trim().toLowerCase();
  const options = all.filter(option => (!text || option.source.name.toLowerCase().includes(text) || option.movement.toLowerCase().includes(text))
    && (!lift || isLift(lift, option.configuration)));
  // Four videos at most, counting the ones already on the page.
  const room = MAX_COMPARED - exclude.length;
  const flip = (source: CompareSource) => setChosen(current => {
    const next = new Map(current); const key = sourceKey(source);
    if (next.has(key)) next.delete(key); else if (next.size < room) next.set(key, source);
    return next;
  });

  return <Dialog isOpen title={uiCopy["ui"]["Compare with"]} description={uiCopy["ui"]["Choose one or more analyses. Their repetitions join the table and the charts."]} onOpenChange={open => { if (!open) onClose(); }}
    size="lg" placement="right" closeLabel={m.common.close}
    footer={close => <>
      <Button variant="secondary" onPress={close}>{m.common.cancel}</Button>
      <Button variant="primary" isDisabled={!chosen.size} onPress={() => { onConfirm([...chosen.values()]); close(); }}>{chosen.size > 1 ? `Compare ${chosen.size} analyses` : uiCopy["video"]["compare"]["submit"]}</Button>
    </>}>
    <div className={styles.dialog}>
      <SearchInput aria-label={uiCopy["video"]["list"]["searchLabel"]} placeholder={uiCopy["ui"]["Search by name or exercise"]} value={search} onChange={setSearch} />
      <ChipGroup aria-label={uiCopy["ui"]["Filter by lift"]} selectedKeys={lift ? [lift] : []} onSelectionChange={keys => { const key = [...keys][0]; setLift(key == null ? null : String(key)); }}>
        {LIFTS.map(name => <Chip key={name} id={name}>{name}</Chip>)}
      </ChipGroup>
      <p className={styles.hint}>Up to {MAX_COMPARED}  {uiCopy["ui"]["videos at once"]}{exclude.length ? `, including this one` : ''}: {chosen.size} of {room}  {uiCopy["ui"]["chosen."]}</p>
      {own.isPending ? <Skeleton height="12rem" radius="lg" /> : !options.length ? <p className={styles.hint}><Search aria-hidden="true" />{text || lift ? uiCopy["ui"]["No matching analyses."] : uiCopy["ui"]["No other completed analyses."]}</p>
        : <ul className={styles.options}>
          {options.map(({ source, meta, movement }) => {
            const on = chosen.has(sourceKey(source));
            return <li key={sourceKey(source)}>
              <button type="button" className={styles.option} aria-pressed={on} disabled={!on && chosen.size >= room} onClick={() => flip(source)}>
                <span className={styles.box} aria-hidden="true">{on ? <Check /> : null}</span>
                <span className={styles.optionName}>{source.name}</span>
                <span className={styles.optionMeta}>{movement} · {meta}</span>
              </button>
            </li>;
          })}
        </ul>}
    </div>
  </Dialog>;
}
