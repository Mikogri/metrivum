import type { KeyStorage } from "./chunk-storage";

export type AuthPurpose = "confirmation" | "recovery";
export type AuthAttempt = {
  nonce: string;
  slot: number;
  email: string;
  purpose: AuthPurpose;
  accountId: string | null;
  createdAt: number;
  expiresAt: number;
};
type Callback = {
  nonce: string;
  slot: number;
  code: string | null;
  failed: boolean;
};
export const AUTH_ATTEMPT_LIFETIME = 60 * 60 * 1000;
const noncePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () =>
  new Error(
    "This sign-in link is invalid, expired or already used. Request a new link on this device.",
  );

/** Only our exact PKCE callback is accepted; token fragments and return URLs never reach Auth. */
export function parseAuthCallback(raw: string): Callback | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== "trainflow:" ||
    url.hostname !== "auth" ||
    url.pathname !== "/callback"
  )
    return null;
  if (raw.length > 4096 || url.hash || url.username || url.password || url.port)
    throw invalid();
  const allowed = new Set([
    "nonce",
    "slot",
    "code",
    "error",
    "error_code",
    "error_description",
  ]);
  for (const key of url.searchParams.keys())
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1)
      throw invalid();
  const nonce = url.searchParams.get("nonce") || "";
  const slot = url.searchParams.get("slot");
  const code = url.searchParams.get("code");
  const failed =
    url.searchParams.has("error") || url.searchParams.has("error_code");
  if (
    !noncePattern.test(nonce) ||
    !/^[012]$/.test(slot || "") ||
    (failed && code !== null) ||
    (!failed && (!code || !/^[A-Za-z0-9._~-]{1,2048}$/.test(code)))
  )
    throw invalid();
  return { nonce, slot: Number(slot), code, failed };
}
function readAttempt(raw: string | null): AuthAttempt | null {
  if (!raw) return null;
  try {
    const item = JSON.parse(raw) as AuthAttempt;
    if (
      !noncePattern.test(item.nonce) ||
      !Number.isInteger(item.slot) ||
      item.slot < 0 ||
      item.slot > 2 ||
      typeof item.email !== "string" ||
      !["confirmation", "recovery"].includes(item.purpose) ||
      !(item.accountId === null || typeof item.accountId === "string") ||
      !Number.isFinite(item.createdAt) ||
      item.expiresAt !== item.createdAt + AUTH_ATTEMPT_LIFETIME
    )
      return null;
    return item;
  } catch {
    return null;
  }
}

export function createAuthAttempts(
  storage: KeyStorage,
  nonce: () => string,
  now = Date.now,
) {
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(action: () => Promise<T>): Promise<T> => {
    const task = tail.catch(() => {}).then(action);
    tail = task;
    return task;
  };
  const key = (slot: number) => `trainflow.auth-attempt.${slot}`;
  return {
    begin: (
      slot: number,
      email: string,
      purpose: AuthPurpose,
      accountId: string | null = null,
    ) =>
      exclusive(async () => {
        if (!Number.isInteger(slot) || slot < 0 || slot > 2 || !email.trim())
          throw invalid();
        const createdAt = now();
        const attempt: AuthAttempt = {
          nonce: nonce(),
          slot,
          email: email.trim().toLowerCase(),
          purpose,
          accountId,
          createdAt,
          expiresAt: createdAt + AUTH_ATTEMPT_LIFETIME,
        };
        if (!noncePattern.test(attempt.nonce)) throw invalid();
        await storage.setItem(key(slot), JSON.stringify(attempt));
        return {
          attempt,
          redirectTo: `trainflow://auth/callback?slot=${slot}&nonce=${attempt.nonce}`,
        };
      }),
    cancel: (slot: number) => exclusive(() => storage.removeItem(key(slot))),
    consume: (raw: string) =>
      exclusive(async () => {
        const callback = parseAuthCallback(raw);
        if (!callback) return null;
        const attempt = readAttempt(await storage.getItem(key(callback.slot)));
        if (
          !attempt ||
          callback.nonce !== attempt.nonce ||
          callback.slot !== attempt.slot ||
          now() >= attempt.expiresAt ||
          now() < attempt.createdAt - 300000
        )
          throw invalid();
        // Consume before network I/O. Duplicate initial-URL/events can never exchange twice.
        await storage.removeItem(key(callback.slot));
        if (callback.failed || !callback.code) throw invalid();
        return { attempt, code: callback.code };
      }),
  };
}
export function assertCallbackIdentity(
  attempt: AuthAttempt,
  user: { id: string; email?: string },
) {
  if (
    user.email?.trim().toLowerCase() !== attempt.email ||
    (attempt.accountId !== null && user.id !== attempt.accountId)
  )
    throw new Error("This link belongs to a different account. Sign in again.");
}
