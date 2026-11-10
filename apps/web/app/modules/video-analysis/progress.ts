/**
 * One bar per video. The analysis share is the analyzer's own estimate (it reports no real progress, so it moves
 * fast at the start, slows near the end and never claims 100 % before the result exists; see Jobs.cs).
 */

export type ProgressStage =
  "starting" | "analyzing" | "uploading" | "saving" | "saved";

/** One bar for the whole run: analysis 0–85 %, video upload 85–97 %, saving the result 97–100 %. */
export function overallPercent(
  stage: ProgressStage,
  analysis: number,
  upload: number,
): number {
  const value =
    stage === "starting"
      ? 0.02
      : stage === "analyzing"
        ? 0.02 + 0.83 * analysis
        : stage === "uploading"
          ? 0.85 + 0.12 * upload
          : stage === "saving"
            ? 0.98
            : 1;
  return Math.round(value * 100);
}
