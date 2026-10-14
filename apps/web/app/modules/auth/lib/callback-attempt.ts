import type { SlotId } from "~/shared/session/storage-keys";

const lifetime = 60 * 60 * 1000;
const key = (slot: SlotId) => `tf.auth.callback.${slot}`;
type Attempt = { nonce: string; email: string; createdAt: number };

export function beginCallbackAttempt(slot: SlotId, email: string): string {
  const attempt: Attempt = { nonce: crypto.randomUUID(), email: email.trim().toLowerCase(), createdAt: Date.now() };
  if (!attempt.email) throw new Error("Request a new sign-in link.");
  // Shared across tabs so an email link can open a new tab in the same browser.
  localStorage.setItem(key(slot), JSON.stringify(attempt));
  return attempt.nonce;
}

export function consumeCallbackAttempt(slot: SlotId, nonce: string | null): Attempt {
  const invalid = () => new Error("Invalid or expired sign-in link. Request a new link in this browser.");
  const raw = localStorage.getItem(key(slot));
  if (!raw || !nonce) throw invalid();
  let attempt: Attempt;
  try { attempt = JSON.parse(raw) as Attempt; } catch { throw invalid(); }
  if (attempt.nonce !== nonce || typeof attempt.email !== "string" || !attempt.email || !Number.isFinite(attempt.createdAt) || Date.now() < attempt.createdAt || Date.now() - attempt.createdAt >= lifetime) throw invalid();
  // Consume before Auth can change a session; failed and duplicate callbacks require a new link.
  localStorage.removeItem(key(slot));
  return attempt;
}
