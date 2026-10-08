// Storage namespace shared by the session layer and the public header.
// Kept dependency-free so public pages can check for a session without loading the Supabase SDK.

export const MAX_ACCOUNTS = 3;
export const SLOT_IDS = [0, 1, 2] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const AUTH_STORAGE_PREFIX = "tf.auth.slot";

/** Supabase storageKey for one independent account slot. */
export function slotStorageKey(slot: SlotId): string {
  return `${AUTH_STORAGE_PREFIX}.${slot}`;
}

export const ACTIVE_SLOT_STORAGE_KEY = "tf.auth.active-slot";

/**
 * True when any slot has persisted Supabase session data. Only a hint for choosing between
 * "Sign in" and "Open TrainFlow"; it is never used to authorise anything.
 */
export function hasStoredSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return SLOT_IDS.some((slot) => {
      const raw = window.localStorage.getItem(slotStorageKey(slot));
      return raw !== null && raw.includes("refresh_token");
    });
  } catch {
    return false;
  }
}
