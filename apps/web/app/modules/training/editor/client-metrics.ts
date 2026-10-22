import type { Quantity } from "@trainflow/api-client-web";

export interface ExerciseMax {
  id: string;
  exerciseId: string;
  reps: number;
  load: Quantity;
  recordedOn: string;
  alias: string;
  version: number;
}

export interface ClientVariables {
  variables: Record<string, Quantity>;
  sourceVersions: Record<string, string>;
  exerciseMaxes: ExerciseMax[];
}

export interface FormulaSnapshot {
  variables: Record<string, Quantity>;
  sourceVersions: Record<string, string>;
  stale: boolean;
}

/** Only inputs actually frozen for this plan can make its results outdated. */
export function sourcesChanged(frozen: Record<string, string>, current: Record<string, string>): boolean {
  return Object.entries(frozen).some(([name, version]) => current[name] !== version);
}

export function validMax(reps: number, load: number, alias: string): boolean {
  return Number.isInteger(reps) && reps >= 1 && reps <= 100 && Number.isFinite(load) && load > 0 && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(alias);
}
