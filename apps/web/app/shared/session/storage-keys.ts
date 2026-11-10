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

export type StoredAccountHint = {
  slot: SlotId;
  email: string;
  active: boolean;
};

/**
 * The accounts with a stored session, for display on public pages (email only, read from the stored session).
 * A hint like hasStoredSessionHint: the session itself is checked by Supabase Auth inside the app.
 */
export function storedAccountsHint(): StoredAccountHint[] {
  if (typeof window === "undefined") return [];
  try {
    const preferred = Number(
      window.sessionStorage.getItem(ACTIVE_SLOT_STORAGE_KEY) ??
        window.localStorage.getItem(ACTIVE_SLOT_STORAGE_KEY),
    );
    const accounts = SLOT_IDS.flatMap((slot) => {
      const raw = window.localStorage.getItem(slotStorageKey(slot));
      if (!raw || !raw.includes("refresh_token")) return [];
      try {
        const email = (JSON.parse(raw) as { user?: { email?: unknown } }).user
          ?.email;
        return [
          {
            slot,
            email: typeof email === "string" ? email : "",
            active: false,
          },
        ];
      } catch {
        return [];
      }
    });
    // Public hints never authorize or merge identities; suppress duplicate saved email labels only.
    const unique = accounts.filter(
      (account) =>
        !accounts.some(
          (other) =>
            account.email &&
            other.slot !== account.slot &&
            other.email.trim().toLowerCase() ===
              account.email.trim().toLowerCase() &&
            (other.slot === preferred ||
              (account.slot !== preferred && other.slot < account.slot)),
        ),
    );
    const active = unique.find((a) => a.slot === preferred) ?? unique[0];
    if (active) active.active = true;
    return unique;
  } catch {
    return [];
  }
}

/** After a slot is signed out on a public page: the app opens the next remaining account. */
export function forgetSlot(slot: SlotId) {
  try {
    window.localStorage.removeItem(slotStorageKey(slot));
    for (const storage of [window.sessionStorage, window.localStorage]) {
      if (
        Number(storage.getItem(ACTIVE_SLOT_STORAGE_KEY)) === slot &&
        storage.getItem(ACTIVE_SLOT_STORAGE_KEY) !== null
      ) {
        const next = SLOT_IDS.find(
          (other) =>
            other !== slot &&
            window.localStorage.getItem(slotStorageKey(other)) !== null,
        );
        if (next === undefined) storage.removeItem(ACTIVE_SLOT_STORAGE_KEY);
        else storage.setItem(ACTIVE_SLOT_STORAGE_KEY, String(next));
      }
    }
  } catch {
    // Storage unavailable: nothing was stored either.
  }
}

/**
 * True when any slot has persisted Supabase session data. Only a hint for choosing between
 * "Sign in" and "Open Metrivum"; it is never used to authorise anything.
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
