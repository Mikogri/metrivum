import { useState } from 'react';
import { CircleAlert, CirclePower, RotateCcw, SquareTerminal, X } from 'lucide-react';
import { AlertDialog, Button, Card, IconButton, LinkButton } from '@trainflow/ui-web';
import { useAnalyzerJobs } from '../analyzer-jobs';
import { launchLocalAnalyzer, showAnalyzerWindow, storedPairing } from '../local-analysis';
import type { AnalyzerJob } from '../local-analysis';
import { JobRow, SavedRow } from './JobRow';
import styles from './AnalysisQueue.module.css';

/**
 * Videos the local analyzer is working through for this user. It keeps going with this page (or the browser)
 * closed; finished videos are saved to the library from whichever Metrivum page is open next.
 * With `fill`, the card takes the height it is given and only the list scrolls.
 */
export function AnalysisQueue({ hideWhenEmpty = false, fill = false }: { hideWhenEmpty?: boolean; fill?: boolean }) {
  const { jobs, reachable, saving, saveErrors, saved, refresh, retry, remove, dismissSaved } = useAnalyzerJobs();
  const [pending, setPending] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Removing a video from the analyzer deletes it there (and stops it while analyzing), so it is confirmed first.
  const [removing, setRemoving] = useState<AnalyzerJob | null>(null);
  const done = saved.filter(item => !jobs.some(job => job.id === item.id));
  if (!jobs.length && !done.length && hideWhenEmpty) return null;
  const active = jobs.filter(job => job.state === 'queued' || job.state === 'analyzing').length;

  async function act(id: string, action: () => Promise<void>) {
    setPending(id);
    try { await action(); } catch { refresh(); } finally { setPending(null); }
  }

  return <Card as="section" padding="none" className={styles.queue} data-fill={fill || undefined} aria-labelledby="queue-title">
    <div className={styles.head}>
      <h2 id="queue-title">Queue</h2>
      {active ? <span className={styles.count}>{active} working</span> : null}
      {reachable ? <IconButton size="sm" variant="ghost" icon={<SquareTerminal />} label="Show analyzer window"
        onPress={() => void showAnalyzerWindow(storedPairing(), new AbortController().signal).catch(() => launchLocalAnalyzer())} /> : null}
    </div>

    {reachable === false && jobs.length ? <div className={styles.offline}>
      <CircleAlert aria-hidden="true" />
      <span>Analyzer is not running; waiting videos continue when it starts.</span>
      <Button size="sm" variant="secondary" iconStart={<CirclePower />} loading={starting}
        onPress={() => { setStarting(true); launchLocalAnalyzer(); setTimeout(() => { setStarting(false); refresh(); }, 6000); }}>Start</Button>
    </div> : null}

    {jobs.length || done.length ? <ol className={styles.list}>
      {jobs.map(job => {
        const failed = job.state === 'failed' || Boolean(saveErrors[job.id]);
        return <JobRow key={job.id} job={job} saving={saving[job.id]} saveError={saveErrors[job.id]} actions={<>
          {failed ? <IconButton size="sm" variant="ghost" label="Retry" icon={<RotateCcw />} isPending={pending === job.id} onPress={() => void act(job.id, () => retry(job.id))} /> : null}
          {!saving[job.id] ? <IconButton size="sm" variant="ghost" label={job.state === 'analyzing' ? 'Stop and remove' : 'Remove'} icon={<X />} isDisabled={pending === job.id}
            onPress={() => setRemoving(job)} /> : null}
        </>} />;
      })}
      {done.map(item => <SavedRow key={item.id} name={item.name} status="Saved in your library" actions={<>
        <LinkButton size="sm" variant="ghost" href={`/app/video-analyses/${item.analysisId}`}>Open</LinkButton>
        <IconButton size="sm" variant="ghost" label="Hide" icon={<X />} onPress={() => dismissSaved(item.id)} />
      </>} />)}
    </ol> : <p className={styles.empty}>Nothing in progress yet.</p>}
    <AlertDialog isOpen={removing !== null} onOpenChange={open => { if (!open) setRemoving(null); }} tone="danger"
      title={removing?.state === 'analyzing' ? 'Stop and remove this video?' : 'Remove this video?'} confirmLabel="Remove" cancelLabel="Keep it"
      onConfirm={() => { const job = removing; setRemoving(null); if (job) void act(job.id, () => remove(job.id)); }}>
      <p>{removing ? `${removing.name} is deleted from the analyzer on this computer${removing.state === 'analyzing' ? ' and its analysis stops' : ''}. Nothing is saved to your library.` : null}</p>
    </AlertDialog>

  </Card>;
}
