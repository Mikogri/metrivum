import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@trainflow/ui-web';
import { useFeatureAccess } from '~/shared/access';
import { useAccountContext } from '~/shared/session/AccountScope';
import { AnalyzerError, jobResult, jobVideo, listJobs, rememberJobMedia, removeJob, retryJob, storedPairing, type AnalyzerJob } from './local-analysis';
import { persistLocalAnalysis, type LocalAnalysisReceipt } from './save-local-analysis';
import { videoKeys } from './queries';
import { notifyInBackground } from './notify';
import { forgetJobExercise, jobExercise } from './movement';

export interface SavingState { stage: 'uploading' | 'saving'; ratio: number }
export interface SavedJob { id: string; name: string; analysisId: string; savedAt: number }

interface AnalyzerJobs {
  /** This user's videos in the local analyzer, oldest first. */
  jobs: AnalyzerJob[];
  /** null: never paired in this browser (nothing to watch); false: analyzer not running right now. */
  reachable: boolean | null;
  saving: Record<string, SavingState>;
  /** Why saving a finished video failed; it is retried automatically. */
  saveErrors: Record<string, string>;
  /** Saved in this browser session, newest first. */
  saved: SavedJob[];
  /** Checks the analyzer now (after queuing, pairing or starting it). */
  refresh: () => void;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  dismissSaved: (id: string) => void;
  /** Finished since the analyses menu was last opened (the app bar shows a dot). */
  unseen: number;
  markSeen: () => void;
}

// Errors already shown on this device, so a reload or another tab does not repeat them.
const ANNOUNCED = 'trainflow.analyzer.announced';
function announceOnce(key: string, show: () => void) {
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(ANNOUNCED) ?? '[]') as string[]; } catch { /* private browsing: show it */ }
  if (seen.includes(key)) return;
  try { localStorage.setItem(ANNOUNCED, JSON.stringify([...seen, key].slice(-100))); } catch { /* still shown */ }
  show();
}

const EMPTY: AnalyzerJobs = { jobs: [], reachable: null, saving: {}, saveErrors: {}, saved: [], refresh: () => {}, retry: async () => {}, remove: async () => {}, dismissSaved: () => {}, unseen: 0, markSeen: () => {} };
const Context = createContext<AnalyzerJobs>(EMPTY);
export const useAnalyzerJobs = () => useContext(Context);

const FAST = 1500;
/** Idle or not running: still checked often, so a just-started analyzer and its queue show up within seconds. */
const SLOW = 5000;
const UNPAIRED = 15000;
/** Fired when the analyzer was started, paired or given a video: every open view checks it at once. */
export const ANALYZER_CHANGED = 'trainflow:analyzer-changed';
const RETRY_SAVE = 60000;
const savedKey = (account: string) => `trainflow.analyzer.saved:${account}`;
function readSaved(account: string): SavedJob[] {
  try { return JSON.parse(sessionStorage.getItem(savedKey(account)) ?? '[]') as SavedJob[]; } catch { return []; }
}
function without<T>(record: Record<string, T>, id: string) {
  if (!(id in record)) return record;
  const next = { ...record }; delete next[id]; return next;
}

/**
 * Watches the local analyzer's queue for the signed-in user while TrainFlow is open (on any page) and saves each
 * finished video and result to the library. The analyzer keeps finished work on disk, so anything that finished
 * while the browser was closed is saved the next time TrainFlow opens. One tab saves a given video at a time.
 */
export function AnalyzerJobsProvider({ children }: { children: ReactNode }) {
  const { api, lifecycle, account, accountKey } = useAccountContext();
  const allowed = useFeatureAccess('video.library.manage').allowed;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Kept in a ref: the polling effect must not restart (and abort an upload) when navigation changes.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const [jobs, setJobs] = useState<AnalyzerJob[]>([]);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState<Record<string, SavingState>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<SavedJob[]>(() => (typeof window === 'undefined' ? [] : readSaved(accountKey)));
  const pollNow = useRef<() => void>(() => {});
  const signalRef = useRef<AbortSignal | null>(null);
  // When a failed save may be tried again (kept across polls; cleared by Retry).
  const retryAt = useRef(new Map<string, number>());
  const [unseen, setUnseen] = useState(0);
  // Last known state per job, so a failure is announced once, when it happens.
  const lastState = useRef(new Map<string, AnalyzerJob['state']>());

  useEffect(() => {
    try { sessionStorage.setItem(savedKey(accountKey), JSON.stringify(saved.slice(0, 10))); } catch { /* private mode */ }
  }, [saved, accountKey]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const signal = controller.signal;
    signalRef.current = signal;
    const account$ = lifecycle.signal();
    const abort = () => controller.abort();
    account$.addEventListener('abort', abort, { once: true });
    if (account$.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let collecting = false;

    // The exercise label is sent only when one was chosen (older analyses have none).
    const exerciseOf = (id: string) => { const exercise = jobExercise(id); return exercise ? { exercise } : {}; };
    const collect = async (job: AnalyzerJob, token: string) => {
      const run = async () => {
        setSaving(state => ({ ...state, [job.id]: { stage: 'uploading', ratio: 0 } }));
        try {
          const [file, result] = await Promise.all([
            job.mediaId ? Promise.resolve(new File([], job.fileName)) : jobVideo(token, job, signal),
            jobResult(token, job.id, signal),
          ]);
          const receipt: LocalAnalysisReceipt = {
            id: job.id, uploadedMediaId: job.mediaId ?? undefined,
            body: { name: job.name, note: null, tags: [], sourceVideo: { ...job.sourceVideo, origin: 'cloud' },
              configuration: { movement: job.configuration.movement, ...exerciseOf(job.id), tracking: job.configuration.tracking, metersPerPixel: null }, result },
          };
          const analysis = await persistLocalAnalysis(api, file, receipt, signal,
            stage => { if (stage !== 'saved') setSaving(state => ({ ...state, [job.id]: { stage, ratio: state[job.id]?.ratio ?? 0 } })); },
            undefined,
            ratio => setSaving(state => ({ ...state, [job.id]: { stage: 'uploading', ratio } })),
            mediaId => rememberJobMedia(token, job.id, mediaId, signal));
          if (signal.aborted || !lifecycle.isCurrent()) return;
          // Saved under this job's id (idempotent), so removing it can safely fail and be repeated later.
          await removeJob(token, job.id, signal).catch(() => {});
          retryAt.current.delete(job.id);
          forgetJobExercise(job.id);
          setSaveErrors(state => without(state, job.id));
          setJobs(state => state.filter(item => item.id !== job.id));
          setSaved(state => [{ id: job.id, name: job.name, analysisId: analysis.id, savedAt: Date.now() }, ...state.filter(item => item.id !== job.id)].slice(0, 10));
          void queryClient.invalidateQueries({ queryKey: videoKeys.all(accountKey) });
          const open = () => navigateRef.current(`/app/video-analyses/${analysis.id}`);
          setUnseen(count => count + 1);
          toast({ tone: 'success', title: `Analysis ready: ${job.name}`, description: 'The video and results are saved in your library.',
            action: { label: 'Open', onAction: open } });
          notifyInBackground(`Analysis ready: ${job.name}`, 'The video and results are saved in your TrainFlow library.', open);
        } catch (failure) {
          if (signal.aborted) return;
          retryAt.current.set(job.id, Date.now() + RETRY_SAVE);
          const reason = failure instanceof TypeError ? 'Connection failed.' : failure instanceof Error ? failure.message : 'Saving failed.';
          setSaveErrors(state => ({ ...state, [job.id]: reason }));
          // Shown once per video and reason; the row in the queue keeps it while saving is retried.
          announceOnce(`save:${job.id}:${reason}`, () => {
            toast({ tone: 'danger', title: `Saving failed: ${job.name}`, description: `${reason} It is tried again automatically.` });
            notifyInBackground(`Saving failed: ${job.name}`, reason);
          });
        } finally {
          setSaving(state => without(state, job.id));
        }
      };
      // Several open tabs: only one of them saves a given video.
      if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(`trainflow-analyzer-job:${job.id}`, { ifAvailable: true }, async lock => { if (lock) await run(); });
      else await run();
    };

    const poll = async () => {
      clearTimeout(timer);
      if (signal.aborted) return;
      const token = storedPairing();
      if (!token) { setReachable(null); setJobs([]); timer = setTimeout(() => void poll(), UNPAIRED); return; }
      try {
        const list = await listJobs(token, account.userId, signal);
        if (signal.aborted || !lifecycle.isCurrent()) return;
        setReachable(true); setJobs(list);
        for (const job of list) {
          const before = lastState.current.get(job.id);
          // Every failure is announced once, also one that happened while TrainFlow was closed.
          if (job.state === 'failed' && before !== 'failed') announceOnce(`failed:${job.id}:${job.error ?? ''}`, () => {
            setUnseen(count => count + 1);
            toast({ tone: 'danger', title: `Analysis failed: ${job.name}`, description: job.error ?? 'You can retry it from the analyses menu.' });
            notifyInBackground(`Analysis failed: ${job.name}`, job.error ?? 'Open TrainFlow to retry it.');
          });
          lastState.current.set(job.id, job.state);
        }
        const next = list.find(job => job.state === 'done' && (retryAt.current.get(job.id) ?? 0) <= Date.now());
        if (next && !collecting) {
          collecting = true;
          void collect(next, token).finally(() => { collecting = false; if (!signal.aborted) void poll(); });
        }
        const active = list.some(job => job.state === 'queued' || job.state === 'analyzing') || collecting;
        timer = setTimeout(() => void poll(), active ? FAST : SLOW);
      } catch (failure) {
        if (signal.aborted) return;
        setReachable(failure instanceof AnalyzerError && failure.status === 401 ? null : false);
        timer = setTimeout(() => void poll(), SLOW);
      }
    };
    pollNow.current = () => void poll();
    const changed = () => void poll();
    window.addEventListener(ANALYZER_CHANGED, changed);
    window.addEventListener('focus', changed);
    void poll();
    return () => {
      controller.abort(); clearTimeout(timer); account$.removeEventListener('abort', abort); pollNow.current = () => {};
      window.removeEventListener(ANALYZER_CHANGED, changed); window.removeEventListener('focus', changed);
    };
  }, [allowed, api, lifecycle, account.userId, accountKey, queryClient]);

  const refresh = useCallback(() => pollNow.current(), []);
  const retry = useCallback(async (id: string) => {
    if (saveErrors[id]) { retryAt.current.delete(id); setSaveErrors(state => without(state, id)); refresh(); return; }
    await retryJob(storedPairing(), id, signalRef.current ?? new AbortController().signal);
    refresh();
  }, [saveErrors, refresh]);
  const remove = useCallback(async (id: string) => {
    await removeJob(storedPairing(), id, signalRef.current ?? new AbortController().signal);
    setJobs(state => state.filter(job => job.id !== id));
    refresh();
  }, [refresh]);
  const dismissSaved = useCallback((id: string) => setSaved(state => state.filter(item => item.id !== id)), []);
  const markSeen = useCallback(() => setUnseen(0), []);

  const value = useMemo(() => ({ jobs, reachable, saving, saveErrors, saved, refresh, retry, remove, dismissSaved, unseen, markSeen }),
    [jobs, reachable, saving, saveErrors, saved, refresh, retry, remove, dismissSaved, unseen, markSeen]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
