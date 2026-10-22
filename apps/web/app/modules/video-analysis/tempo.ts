import type { AnalysisResult } from '@trainflow/api-client-web';
import { normalizePhase, type PhaseKind } from './phases';

export interface LiftTempo {
  /** Mean seconds per rep: lowering (eccentric), pause at the bottom, lifting (concentric), and the rest between reps. */
  lowering: number;
  pause: number;
  lifting: number;
  between: number | null;
  /** Classic notation, whole seconds: lowering-pause-lifting-between ("3-1-1-0"). */
  notation: string;
  reps: number;
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** The lift's tempo from the phases of every repetition that has them, or null when no rep has phases. */
export function liftTempo(result: Pick<AnalysisResult, 'repetitions'>): LiftTempo | null {
  const reps = result.repetitions.filter(rep => rep.phases.length > 0);
  if (!reps.length) return null;
  const time = (rep: (typeof reps)[number], kind: PhaseKind) =>
    rep.phases.filter(phase => normalizePhase(phase.kind) === kind).reduce((sum, phase) => sum + Math.max(0, Number(phase.endSeconds) - Number(phase.startSeconds)), 0);
  const lowering = mean(reps.map(rep => time(rep, 'eccentric')));
  const pause = mean(reps.map(rep => time(rep, 'pause')));
  const lifting = mean(reps.map(rep => time(rep, 'concentric')));
  const ordered = [...result.repetitions].sort((a, b) => Number(a.startSeconds) - Number(b.startSeconds));
  const gaps = ordered.slice(1).map((rep, i) => Math.max(0, Number(rep.startSeconds) - Number(ordered[i]!.endSeconds)));
  const between = gaps.length ? mean(gaps) : null;
  const whole = (value: number) => String(Math.round(value));
  return { lowering, pause, lifting, between, reps: reps.length, notation: [lowering, pause, lifting].map(whole).join('-') + (between == null ? '' : `-${whole(between)}`) };
}
