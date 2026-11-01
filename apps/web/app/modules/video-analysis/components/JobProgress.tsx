import { CircleAlert, Clock } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components';
import { Tooltip, TooltipTrigger } from '@metrivum/ui-web';
import { useAnalyzerJobs } from '../analyzer-jobs';
import type { AnalyzerJob } from '../local-analysis';
import { jobStatus } from '../job-status';
import styles from './JobProgress.module.css';

/** A video still in the local analyzer, as a list cell: its stage, a progress bar and the percentage. */
export function JobProgress({ job }: { job: AnalyzerJob }) {
  const { saving, saveErrors } = useAnalyzerJobs();
  const { state, percent, text } = jobStatus(job, saving[job.id], saveErrors[job.id]);
  if (state === 'failed' || state === 'save_failed') return <TooltipTrigger delay={100}>
    <AriaButton className={styles.failed}><CircleAlert aria-hidden="true" />{state === 'save_failed' ? 'Saving failed' : 'Failed'}</AriaButton>
    <Tooltip placement="bottom start" className={styles.reason}>{text}</Tooltip>
  </TooltipTrigger>;
  if (state === 'queued') return <span className={styles.waiting}><Clock aria-hidden="true" />{text}</span>;
  return <span className={styles.progress}>
    <span className={styles.top}><span className={styles.stage}>{text}</span><b>{percent}%</b></span>
    <span className={styles.bar} role="progressbar" aria-label={`${job.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{ transform: `scaleX(${Math.max(0.02, percent / 100)})` }} />
    </span>
  </span>;
}
