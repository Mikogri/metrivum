import type { SlotId } from "~/shared/session/storage-keys";

const lifetime = 60 * 60 * 1000;
type Purpose = "sign-in" | "email-change";
const key = (slot: SlotId, purpose: Purpose) =>
  purpose === "sign-in"
    ? `tf.auth.callback.${slot}`
    : `tf.auth.callback.email-change.${slot}`;
type Attempt = {
  nonce: string;
  email: string;
  createdAt: number;
  userId?: string;
};

export function beginCallbackAttempt(
  slot: SlotId,
  email: string,
  purpose: Purpose = "sign-in",
  userId?: string,
): string {
  const attempt: Attempt = {
    nonce: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    createdAt: Date.now(),
    userId,
  };
  if (!attempt.email) throw new Error("Request a new sign-in link.");
  // Shared across tabs so an email link can open a new tab in the same browser.
  localStorage.setItem(key(slot, purpose), JSON.stringify(attempt));
  return attempt.nonce;
}

export function readCallbackAttempt(
  slot: SlotId,
  nonce: string | null,
  purpose: Purpose = "sign-in",
): Attempt {
  const invalid = () =>
    new Error(
      "Invalid or expired sign-in link. Request a new link in this browser.",
    );
  const raw = localStorage.getItem(key(slot, purpose));
  if (!raw || !nonce) throw invalid();
  let attempt: Attempt;
  try {
    attempt = JSON.parse(raw) as Attempt;
  } catch {
    throw invalid();
  }
  if (
    attempt.nonce !== nonce ||
    typeof attempt.email !== "string" ||
    !attempt.email ||
    !Number.isFinite(attempt.createdAt) ||
    Date.now() < attempt.createdAt ||
    Date.now() - attempt.createdAt >= lifetime
  )
    throw invalid();
  return attempt;
}

export function consumeCallbackAttempt(
  slot: SlotId,
  nonce: string | null,
  purpose: Purpose = "sign-in",
): Attempt {
  const attempt = readCallbackAttempt(slot, nonce, purpose);
  // A two-link email change reads first and consumes only after final confirmation.
  localStorage.removeItem(key(slot, purpose));
  return attempt;
}
