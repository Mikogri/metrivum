import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { Check, CircleAlert, Clock, FileVideo, LoaderCircle, Plus, ShieldAlert, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDialog, Breadcrumbs, Button, Card, Disclosure, IconButton, LinkButton, PageHeader, Switch, TextField, toast } from '@metrivum/ui-web';
import { AccessNotice, NEAR_LIMIT, QuotaContextField, RequireFeature, useFeatureAccess, useLimit, useQuotaContext } from '~/shared/access';
import { formatBytes, formatDateTime } from '~/shared/i18n/format';
import { useLocale } from '~/shared/i18n/LocaleContext';
import { useT } from '~/shared/i18n/AppLocale';
import { privateMeta } from '~/shared/i18n/site';
import { useAccountContext } from '~/shared/session/AccountScope';
import { TrackingPicker, type TrackingSelection } from '../components/TrackingPicker';
import { MovementField } from '../components/MovementField';
import { engineMovement, rememberJobExercise } from '../movement';
import { AnalyzerConnection } from '../components/AnalyzerConnection';
import { AnalysisQueue } from '../components/AnalysisQueue';
import { ACCEPTED_TYPES, DEFAULT_MAX_BYTES, videoContentType } from '../upload';
import { enqueueJob, launchLocalAnalyzer, pairLocalAnalyzer, QUEUE_LIMIT, storedPairing, storePairing, waitForLocalAnalyzer, type CompanionState, type VideoTrim } from '../local-analysis';
import { measureStability, type Stability } from '../stability';
import { useAnalyzerJobs } from '../analyzer-jobs';
import { jobStatus } from '../job-status';
import { askForNotifications } from '../notify';
import { authorizeLocalJob } from '../local-authorizations';
import styles from './new-analysis.module.css';
export const meta = () => privateMeta('New analysis — Metrivum');

/** A chosen video: its own name, movement and two marked points. */
interface Draft {
  key: string;
  file: File;
  src: string;
  name: string;
  /** The exercise from the catalog (any exercise); the engine gets the closest of its three lifts. */
  movement: string;
  tracking: TrackingSelection | null;
  info?: { durationSeconds: number; width: number; height: number };
  /** Set once it is in the analyzer: the video stays on the page, read-only, while it is analyzed. */
  jobId?: string;
  /** Only this part is analyzed (and saved). */
  trim: VideoTrim | null;
  /** The coach's choice; a moving camera makes it required (see stability). */
  stabilize: boolean;
  stability: Stability;
}

/** Stabilization is on when the coach asks for it or the camera moved. */
const stabilizes = (draft: Draft) => draft.stabilize || draft.stability.state === 'unstable';

const isReady = (draft: Draft) => !draft.jobId && Boolean(draft.movement) && draft.tracking?.points.length === 2 && Boolean(draft.info);

/**
 * Choose up to ten videos, mark the bar on each, and hand them to the analyzer on this computer. It analyzes them
 * one after another in the background; the browser may close, and results are saved to the library when Metrivum
 * is open again (see AnalyzerJobsProvider). A sent video stays visible here until it is closed or replaced.
 */
function LocalAnalysis() {
  const uiCopy = useUiCopy();

  const m = useT();
  const t = m.video.new;
  const locale = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const { lifecycle, account, accountKey, api } = useAccountContext();
  const queryClient = useQueryClient();
  const localAccess = useFeatureAccess('video.analysis.local');
  const quotaContext = useQuotaContext();
  const quota = quotaContext.usage.data?.usage?.find(limit => limit.key === 'video.local_analyses_per_period');
  const maxDuration = useLimit('video.max_duration_seconds');
  const canRun = localAccess.allowed || (!!quotaContext.teamId && localAccess.state === 'limit_reached');
  const queue = useAnalyzerJobs();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<string>();
  // No movement is assumed: the coach picks it for each video (the last choice is offered for the next one).
  const [movement, setMovement] = useState('');
  const [error, setError] = useState('');
  // Set by pressing Start while a video still misses its movement or points: those fields then show what is missing.
  const [checked, setChecked] = useState(false);
  // Removing a video always asks first.
  const [removing, setRemoving] = useState<Draft | null>(null);
  const [dragging, setDragging] = useState(false);
  // Paired once per browser and computer: the token is remembered (see AnalyzerConnection).
  const [pairing, setPairing] = useState(() => (typeof window === 'undefined' ? '' : storedPairing()));
  const [connection, setConnection] = useState<CompanionState>('unreachable');
  const [sending, setSending] = useState<{ done: number; total: number; starting: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  useEffect(() => () => { controller.current?.abort(); for (const draft of draftsRef.current) URL.revokeObjectURL(draft.src); }, []);

  const current = drafts.find(draft => draft.key === selected) ?? drafts[0];
  const inAnalyzer = queue.jobs.length;
  // Sent videos are counted by the analyzer itself, not twice.
  const unsent = drafts.filter(draft => !draft.jobId);
  const room = Math.max(0, QUEUE_LIMIT - inAnalyzer - unsent.length);
  const ready = drafts.filter(isReady);
  const busy = sending !== null;
  // The video is always in the middle; portrait videos are as tall as the window, landscape ones as wide as the column.
  const portrait = Boolean(current?.info && current.info.height > current.info.width * 1.05);
  const ratio = current?.info ? current.info.width / current.info.height : 16 / 9;

  const update = (key: string, patch: Partial<Draft>) => setDrafts(list => list.map(draft => (draft.key === key ? { ...draft, ...patch } : draft)));
  // A new trim outside the marked frame clears the points: they must be marked inside the analyzed part.
  const changeTrim = (draft: Draft, trim: VideoTrim | null) => {
    const at = draft.tracking?.timestampSeconds;
    const outside = trim && at != null && (at < trim.startSeconds || at > trim.endSeconds);
    update(draft.key, outside ? { trim, tracking: null } : { trim });
  };

  // Check whether the camera moved in the part that will be analyzed (shortly after the trim stops changing).
  const stabilityKey = current && current.info && !current.jobId ? `${current.key}:${current.trim?.startSeconds ?? 0}:${current.trim?.endSeconds ?? 'end'}` : null;
  useEffect(() => {
    if (!stabilityKey || !current?.info) return;
    const draft = current;
    const info = current.info;
    const controller = new AbortController();
    update(draft.key, { stability: { state: 'checking' } });
    const timer = setTimeout(() => {
      measureStability(draft.src, { start: draft.trim?.startSeconds ?? 0, end: draft.trim?.endSeconds ?? info.durationSeconds }, controller.signal)
        .then(stability => { if (!controller.signal.aborted) update(draft.key, { stability }); })
        .catch(() => {});
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stabilityKey]);
  const drop = (key: string) => setDrafts(list => {
    const gone = list.find(draft => draft.key === key);
    if (gone) URL.revokeObjectURL(gone.src);
    return list.filter(draft => draft.key !== key);
  });

  const pick = (files: FileList | File[] | null | undefined) => {
    if (!files?.length || busy) return;
    const accepted: Draft[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      if (accepted.length >= room) { problems.push(`Up to ${QUEUE_LIMIT} videos at a time${inAnalyzer ? `, including ${inAnalyzer} already in the analyzer` : ''}.`); break; }
      if (!ACCEPTED_TYPES.includes(videoContentType(file))) { problems.push(`${file.name}: ${t.wrongType}`); continue; }
      if (file.size > DEFAULT_MAX_BYTES) { problems.push(`${file.name}: ${t.tooLarge(formatBytes(locale, DEFAULT_MAX_BYTES))}`); continue; }
      // Named by when it was recorded (the file's date); renamed freely in the details.
      const recorded = formatDateTime(locale, new Date(file.lastModified || Date.now()).toISOString());
      accepted.push({ key: crypto.randomUUID(), file, src: URL.createObjectURL(file), name: recorded, movement, tracking: null, trim: null, stabilize: false, stability: { state: 'checking' } });
    }
    setError(problems.join(' '));
    if (accepted.length) { setDrafts(list => [...list, ...accepted]); setSelected(accepted[0]!.key); }
  };

  const start = async () => {
    if (busy || !canRun) return;
    if (!ready.length) {
      // Nothing can be sent yet: show what is missing on the first video that needs it.
      setChecked(true);
      const first = unsent.find(draft => !isReady(draft));
      if (first) setSelected(first.key);
      // After the render that marks the field, bring it into view (it can be below the fold beside the video).
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        field?.focus({ preventScroll: true });
      });
      return;
    }
    const operation = new AbortController(); controller.current = operation;
    const abort = () => operation.abort();
    const accountSignal = lifecycle.signal(); accountSignal.addEventListener('abort', abort, { once: true });
    if (accountSignal.aborted) operation.abort();
    const batch = [...ready];
    askForNotifications();
    setError(''); setSending({ done: 0, total: batch.length, starting: false });
    let queued = 0;
    try {
      // Start the installed analyzer if it is not running yet, and pair with it if this browser has not.
      let token = pairing;
      if (connection === 'unreachable' || connection === 'pairing_required') {
        setSending({ done: 0, total: batch.length, starting: true });
        if (connection === 'unreachable') launchLocalAnalyzer();
        const state = await waitForLocalAnalyzer(token, operation.signal, 60000);
        if (state === 'unreachable') throw new Error('The local analyzer did not start. Allow the browser to open Metrivum Analyzer, or install it first.');
        if (state === 'incompatible') throw new Error('This analyzer version cannot queue videos. Install the current version.');
        if (state !== 'ready' && state !== 'analyzing') {
          const paired = await pairLocalAnalyzer(operation.signal);
          if (!paired) throw new Error('Pairing with the local analyzer failed. Open “Pair manually” and paste the token from its window.');
          token = paired; storePairing(paired); setPairing(paired);
        }
      }
      for (const draft of batch) {
        setSending({ done: queued, total: batch.length, starting: false });
        const duration = draft.trim ? draft.trim.endSeconds - draft.trim.startSeconds : draft.info!.durationSeconds;
        const maximumDuration = Number(maxDuration?.maximum ?? 60);
        if (duration > maximumDuration) throw new Error(t.maxDuration(maximumDuration));
        const job = await authorizeLocalJob(api, account.userId, duration, () => enqueueJob(draft.file, { name: draft.name.trim() || draft.file.name, account: account.userId, movement: engineMovement(draft.movement),
          tracking: draft.tracking!, sourceVideo: draft.info!, trim: draft.trim, stabilize: stabilizes(draft) }, token, operation.signal), operation.signal, lifecycle.isCurrent, quotaContext.teamId);
        if (!lifecycle.isCurrent()) return;
        void queryClient.invalidateQueries({ queryKey: [accountKey, 'access'] });
        void queryClient.invalidateQueries({ queryKey: [accountKey, 'usage'] });
        rememberJobExercise(job.id, draft.movement);
        queued++;
        update(draft.key, { jobId: job.id });
        queue.refresh();
      }
      toast({ tone: 'success', title: queued === 1 ? 'Video sent to the analyzer' : `${queued} videos sent to the analyzer`,
        description: uiCopy["ui"]["You can add other videos, leave this page or close the browser. Results are saved to your library when they are ready."] });
    } catch (failure) {
      if (lifecycle.isCurrent() && !operation.signal.aborted) {
        const reason = failure instanceof TypeError ? 'Connection to the local analyzer failed.' : failure instanceof Error ? failure.message : 'Sending videos failed.';
        setError(queued ? `${queued} of ${batch.length} videos were sent. ${reason}` : reason);
      }
    } finally {
      accountSignal.removeEventListener('abort', abort);
      if (lifecycle.isCurrent()) setSending(null);
      queue.refresh();
    }
  };

  const points = current?.tracking?.points.length ?? 0;
  const waiting = unsent.length - ready.length;
  const sentJob = current?.jobId ? queue.jobs.find(job => job.id === current.jobId) : undefined;
  const sentSaved = current?.jobId ? queue.saved.find(item => item.id === current.jobId) : undefined;
  const sentStatus = sentJob ? jobStatus(sentJob, queue.saving[sentJob.id], queue.saveErrors[sentJob.id]) : null;

  const chips = drafts.length ? <div className={styles.drafts} role="tablist" aria-label={uiCopy["ui"]["Chosen videos"]} aria-orientation="vertical">
    {drafts.map((draft, index) => {
      const job = draft.jobId ? queue.jobs.find(item => item.id === draft.jobId) : undefined;
      const saved = draft.jobId ? queue.saved.some(item => item.id === draft.jobId) : false;
      const status = job ? jobStatus(job, queue.saving[job.id], queue.saveErrors[job.id]) : null;
      const mark = saved ? <Check />
        : status ? (status.state === 'queued' ? <Clock /> : status.state === 'failed' || status.state === 'save_failed' ? <CircleAlert /> : <LoaderCircle className={styles.spin} />)
        : draft.jobId ? <Clock /> : isReady(draft) ? <Check /> : index + 1;
      return <div key={draft.key} className={styles.draftItem}>
      <button type="button" role="tab" aria-selected={draft.key === current?.key} className={styles.draft}
        data-ready={isReady(draft) || saved || undefined} data-sent={draft.jobId ? (saved ? 'saved' : status?.state ?? 'sent') : undefined} onClick={() => setSelected(draft.key)}>
        <span className={styles.draftMark} aria-hidden="true">{mark}</span>
        <span className={styles.draftName}>{draft.name || draft.file.name}</span>
        {status && status.state !== 'queued' && status.state !== 'failed' && !saved ? <span className={styles.draftPercent}>{status.percent}%</span> : null}
        <span className="tf-visually-hidden">{draft.jobId ? ` — ${saved ? "saved" : status?.text ?? "in the analyzer"}` : isReady(draft) ? uiCopy["ui"][" — points marked"] : uiCopy["ui"][" — mark points"]}</span>
      </button>
      {draft.jobId ? null : <IconButton size="sm" variant="ghost" icon={<Trash2 />} label={formatInterfaceText(uiCopy["ui"]["Remove {0}"], [draft.name || draft.file.name])} isDisabled={busy}
        className={styles.draftRemove} onPress={() => setRemoving(draft)} />}
      </div>;
    })}
    <div className={styles.draftActions}>
      {room > 0 ? <button type="button" className={styles.draftAdd} onClick={() => input.current?.click()} disabled={busy}><Plus aria-hidden="true" />{drafts.some(draft => draft.jobId) ? uiCopy["ui"]["Another video"] : uiCopy["ui"]["Add videos"]}</button> : null}
      {current && !current.jobId ? <button type="button" className={styles.draftAdd} data-tone="danger" onClick={() => setRemoving(current)} disabled={busy}><Trash2 aria-hidden="true" />{uiCopy["editor"]["remove"]}</button> : null}
    </div>
  </div> : null;

  const details = current ? <Card as="section" padding="md" aria-labelledby="details-title" className={styles.card}>
    <div className={styles.cardHead}>
      <h2 id="details-title" className={styles.cardTitle}>{drafts.length > 1 ? `Video ${drafts.indexOf(current) + 1} of ${drafts.length}` : t.step.details}</h2>
      {current.jobId ? null : <IconButton size="sm" variant="ghost" icon={<Trash2 />} label={uiCopy["ui"]["Remove this video"]} isDisabled={busy} onPress={() => setRemoving(current)} />}
    </div>
    {current.jobId ? <div className={styles.sent} data-state={sentSaved ? 'saved' : sentStatus?.state ?? 'sent'} role="status">
      <span className={styles.sentHead}>
        <strong>{current.name || current.file.name}</strong>
        {sentStatus && sentStatus.state !== 'queued' && sentStatus.state !== 'failed' ? <span className={styles.sentPercent}>{sentStatus.percent}%</span> : null}
      </span>
      <span className={styles.sentText}>{sentSaved ? uiCopy["ui"]["Saved in your library."] : sentStatus?.text ?? uiCopy["ui"]["In the analyzer."]}</span>
      {sentStatus && sentStatus.state !== 'queued' && sentStatus.state !== 'failed' ? <span className={styles.runBar} aria-hidden="true"><span style={{ transform: `scaleX(${sentStatus.percent / 100})` }} /></span> : null}
      <span className={styles.sentActions}>
        {sentSaved ? <LinkButton size="sm" variant="secondary" href={`/app/video-analyses/${sentSaved.analysisId}`}>{uiCopy["ui"]["Open analysis"]}</LinkButton> : null}
        {room > 0 ? <Button size="sm" variant="secondary" iconStart={<Plus />} isDisabled={busy} onPress={() => input.current?.click()}>{uiCopy["video"]["new"]["changeVideo"]}</Button> : null}
        <Button size="sm" variant="ghost" iconStart={<X />} onPress={() => drop(current.key)}>{uiCopy["common"]["close"]}</Button>
      </span>
      {sentSaved ? null : <span className={styles.hint}>{uiCopy["ui"]["Closing it here does not stop the analysis."]}</span>}
    </div> : <>
      <TextField placeholder={m.common.ph.analysisName} label={t.name} value={current.name} onChange={name => update(current.key, { name })} maxLength={200} isDisabled={busy} />
      <MovementField isRequired value={current.movement || null} isDisabled={busy} errorMessage={checked && !current.movement ? 'Choose the exercise to analyze.' : undefined}
        onChange={exercise => { update(current.key, { movement: exercise }); setMovement(exercise); }} />
      {unsent.length > 1 && current.movement ? <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => setDrafts(list => list.map(draft => (draft.jobId ? draft : { ...draft, movement: current.movement })))}>{uiCopy["ui"]["Same movement for all"]}</Button> : null}
      <StabilityControl draft={current} disabled={busy} onChange={stabilize => update(current.key, { stabilize })} />
      <ol className={styles.checklist}>
        <li data-done="" title={current.file.name}><span aria-hidden="true">✓</span><small>{current.file.name} · {formatBytes(locale, current.file.size)}</small></li>
        <li data-done={current.movement ? '' : undefined} data-error={(checked && !current.movement) || undefined}><span aria-hidden="true">{current.movement ? '✓' : '!'}</span><small>{current.movement ? uiCopy["ui"]["Movement chosen"] : uiCopy["ui"]["Choose the movement"]}</small></li>
        <li data-done={points === 2 ? '' : undefined} data-error={(checked && points < 2) || undefined}><span aria-hidden="true">{points === 2 ? '✓' : '2'}</span><small>{points === 2 ? uiCopy["ui"]["Points marked"] : `Mark ${2 - points} more ${2 - points === 1 ? "point" : "points"}`}</small></li>
      </ol>
      <Disclosure className={styles.howTo} title={uiCopy["ui"]["How to mark the points"]}>
        <ol className={styles.howToSteps}>
          <li>{uiCopy["ui"]["Play to a moment where the end of the bar is sharp, then"]} <strong>{uiCopy["ui"]["Freeze"]}</strong>.</li>
          <li>{uiCopy["ui"]["Zoom in and mark"]} <strong>{uiCopy["ui"]["two points very close together"]}</strong>  {uiCopy["ui"]["on one small, contrasting spot — the end of the sleeve or the edge of a plate."]}</li>
          <li>{uiCopy["ui"]["Pick a spot that"]} <strong>{uiCopy["ui"]["stays visible for the whole lift"]}</strong>{uiCopy["ui"][": not covered by hands, plates or the body. The analyzer follows these two points frame by frame."]}</li>
          <li>{uiCopy["ui"]["Wheel or + / − zooms, dragging moves the frame, arrows and Enter mark points. Speed is in px/s."]}</li>
        </ol>
      </Disclosure>
    </>}

  </Card> : null;

  const startBar = <section aria-label={t.start} className={styles.startBar}>
    {sending ? <div className={styles.run}>
      <div className={styles.runHead}>
        <span className={styles.runLabel}>{sending.starting ? uiCopy["ui"]["Starting the local analyzer…"] : `Sending videos to the analyzer… ${sending.done + 1} of ${sending.total}`}</span>
      </div>
      <div className={styles.runBar} role="progressbar" aria-label={uiCopy["ui"]["Sending videos"]} aria-valuemin={0} aria-valuemax={sending.total} aria-valuenow={sending.done}>
        <span style={{ transform: `scaleX(${sending.starting ? 0.03 : Math.max(0.05, sending.done / sending.total)})` }} />
      </div>
    </div> : null}
    {!canRun && <AccessNotice access={localAccess} />}
    <Button variant="primary" block loading={busy} isDisabled={!canRun || !unsent.length || connection === 'runtime_missing' || connection === 'incompatible'} onPress={() => void start()}>
      {ready.length > 1 ? `Analyze ${ready.length} videos` : t.start}
    </Button>
    {!busy && unsent.length > 0 && waiting > 0 ? <p className={styles.hint} data-error={checked || undefined} role={checked ? 'alert' : undefined}>{waiting === 1 ? uiCopy["ui"]["1 video needs"] : `${waiting} videos need`}  {uiCopy["ui"]["a movement and two points."]}</p> : null}
    {busy ? <Button onPress={() => controller.current?.abort()}>{uiCopy["ui"]["Stop sending"]}</Button> : null}
  </section>;

  return <>
    <PageHeader
      context={<Breadcrumbs items={[{ id: 'list', label: m.video.list.title, href: '/app/video-analyses' }, { id: 'new', label: t.title }]} />}
      title={t.title}
      description={formatInterfaceText(uiCopy["ui"]["Up to {0} videos, analyzed on this computer and saved privately."], [QUEUE_LIMIT])}
    />
    <div className={styles.intro}>
    <QuotaContextField context={quotaContext} disabled={busy} />
    {/* Limits live on the usage page; here only a warning once the period's analyses are nearly used up. */}
    {quota && quota.maximum != null && Number(quota.maximum) > 0 && Number(quota.used) / Number(quota.maximum) >= NEAR_LIMIT ? (
      <Alert tone={Number(quota.used) >= Number(quota.maximum) ? 'danger' : 'warning'} title={t.limits.nearTitle(Number(quota.used), Number(quota.maximum))}
        actions={<LinkButton size="sm" href="/app/usage">{t.limits.seeUsage}</LinkButton>}>{t.limits.nearBody}</Alert>
    ) : null}
    </div>
    <input ref={input} id="local-analysis-video" type="file" multiple accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" className="tf-visually-hidden" tabIndex={-1} aria-label={t.file}
      onChange={event => { pick(event.target.files); event.target.value = ''; }} />
    <div className={styles.layout} data-portrait={portrait || undefined} data-empty={!current || undefined} style={{ '--ratio': ratio } as CSSProperties}>
      <Card as="section" padding="sm" aria-labelledby="video-title" className={styles.videoCard} data-dragging={dragging || undefined}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files); }}>
        <h2 id="video-title" className="tf-visually-hidden">{t.step.file}</h2>
        {current ? <div className={styles.pickerArea}>
          <TrackingPicker key={current.key} src={current.src} value={current.tracking} disabled={busy || Boolean(current.jobId)} compact={portrait}
            trim={current.trim} onTrimChange={current.jobId ? undefined : trim => changeTrim(current, trim)}
            onChange={tracking => { if (!current.jobId) update(current.key, { tracking }); }} onMetadata={info => update(current.key, { info })} />
        </div> : <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true"><FileVideo /></span>
          <p className={styles.emptyTitle}>{t.dropTitle}</p>
          <Button variant="primary" iconStart={<Upload />} isDisabled={room === 0} onPress={() => input.current?.click()}>{uiCopy["ui"]["Choose videos"]}</Button>
          <p className={styles.hint}>{room === 0 ? `The analyzer already holds ${QUEUE_LIMIT} videos. Wait until some are saved.` : `Up to ${room} ${room === 1 ? "video" : "videos"} · ${t.fileHint}`}</p>
        </div>}
        {error ? <Alert tone="danger" title={error} /> : null}
      </Card>

      <div className={styles.left}>
        {chips ? <Card padding="sm" className={styles.chipsCard}>{chips}</Card> : null}
        {details}
      </div>
      <div className={styles.right}>
        <AnalyzerConnection token={pairing} onTokenChange={setPairing} onStateChange={setConnection} />
        {startBar}
        <div className={styles.queueSlot}><AnalysisQueue fill /></div>
      </div>
    </div>
    <AlertDialog isOpen={removing !== null} onOpenChange={open => { if (!open) setRemoving(null); }} title={uiCopy["ui"]["Remove this video?"]} tone="danger"
      confirmLabel={uiCopy["editor"]["remove"]} cancelLabel={uiCopy["ui"]["Keep it"]} onConfirm={() => { if (removing) drop(removing.key); setRemoving(null); }}>
      <p>{removing ? `${removing.name || removing.file.name} and its marked points are removed from this list. The file on your computer stays.` : null}</p>
    </AlertDialog>
  </>;
}

/**
 * Stabilization: required when the quick check sees the camera move (the switch is then locked on), optional
 * otherwise. When the check cannot run, the requirement is stated so the coach can decide.
 */
function StabilityControl({ draft, disabled, onChange }: { draft: Draft; disabled: boolean; onChange: (stabilize: boolean) => void }) {
  const uiCopy = useUiCopy();

  const { stability } = draft;
  const required = stability.state === 'unstable';
  return <div className={styles.stability} data-state={stability.state}>
    <Switch isSelected={stabilizes(draft)} isDisabled={disabled || required} onChange={onChange}>{uiCopy["ui"]["Stabilize video"]}</Switch>
    {required ? <p className={styles.stabilityNote} role="status"><ShieldAlert aria-hidden="true" />{uiCopy["ui"]["Camera moves: required."]}</p>
      : stability.state === 'checking' ? <p className={styles.stabilityHint} role="status"><LoaderCircle aria-hidden="true" className={styles.spin} />{uiCopy["ui"]["Checking the camera…"]}</p>
      : stability.state === 'stable' ? <p className={styles.stabilityHint}>{uiCopy["ui"]["Camera looks still."]}</p>
      : <p className={styles.stabilityNote}><ShieldAlert aria-hidden="true" />{uiCopy["ui"]["Needs a still camera; turn on if handheld."]}</p>}
  </div>;
}
export default function NewAnalysisRoute() { return <RequireFeature feature="video.library.manage"><LocalAnalysis /></RequireFeature>; }
