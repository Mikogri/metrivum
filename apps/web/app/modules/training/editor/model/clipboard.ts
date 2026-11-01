import type { Prescription, SetKind, SetSegment } from "@metrivum/api-client-web";

/** Structured clipboard for set prescriptions; mirrored to the system clipboard as JSON. */
export interface CopiedSet {
  type: "trainflow/set";
  kind: SetKind;
  prescription: Prescription;
  segments?: SetSegment[] | null;
}

let internal: CopiedSet | null = null;

export function copySet(value: CopiedSet) {
  internal = value;
  try {
    void navigator.clipboard?.writeText(JSON.stringify(value));
  } catch {
    // The internal clipboard still works without system clipboard permission.
  }
}

export function readCopiedSet(text?: string | null): CopiedSet | null {
  if (text) {
    try {
      const parsed = JSON.parse(text) as Partial<CopiedSet>;
      if (parsed && parsed.type === "trainflow/set" && parsed.prescription && parsed.kind) return parsed as CopiedSet;
    } catch {
      return null;
    }
    return null;
  }
  return internal;
}
