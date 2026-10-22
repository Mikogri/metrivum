import type { SavingState } from './analyzer-jobs';
import type { AnalyzerJob } from './local-analysis';
import { overallPercent } from './progress';

export type JobDisplayState = 'queued' | 'analyzing' | 'done' | 'failed' | 'saving' | 'save_failed';

/** One video in the analyzer as every surface shows it: the queue panel, the app bar menu and the draft chips. */
export function jobStatus(job: AnalyzerJob, saving?: SavingState, saveError?: string): { state: JobDisplayState; percent: number; text: string } {
  const state: JobDisplayState = saving ? 'saving' : saveError ? 'save_failed' : job.state;
  const percent = saving ? overallPercent(saving.stage, 1, saving.ratio)
    : job.state === 'analyzing' ? overallPercent('analyzing', job.progress, 0)
    : job.state === 'done' ? overallPercent('uploading', 1, 0)
    : 0;
  const text = saving ? (saving.stage === 'uploading' ? 'Uploading the video to your library…' : 'Saving the analysis…')
    : saveError ? `Saving failed: ${saveError} It is tried again automatically.`
    : job.state === 'queued' ? (job.position === 1 ? 'Next in line' : job.position ? `Waiting · ${job.position} in line` : 'Waiting')
    : job.state === 'analyzing' ? (job.stage ? `${job.stage}…` : 'Analyzing on this computer…')
    : job.state === 'done' ? 'Analyzed · saving to your library'
    : job.error ?? 'Analysis failed.';
  return { state, percent, text };
}
