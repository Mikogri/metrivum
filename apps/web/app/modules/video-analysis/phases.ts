import "./phases.css";

/** Phase kinds as the charts colour them; "none" is time outside any reported phase. */
export type PhaseKind = "eccentric" | "pause" | "concentric" | "none";
export const PHASE_KINDS: PhaseKind[] = [
  "eccentric",
  "pause",
  "concentric",
  "none",
];

/** Engines name phases differently ("Eccentric", "lowering"…); this maps them to one set. */
export function normalizePhase(kind: string): PhaseKind {
  const k = kind.toLowerCase();
  if (k.includes("ecc") || k.includes("lower")) return "eccentric";
  if (k.includes("con") || k.includes("lift")) return "concentric";
  if (k.includes("pause")) return "pause";
  return "none";
}
