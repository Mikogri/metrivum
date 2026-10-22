/**
 * Email addresses typed into the sign-in forms. Supabase Auth is the authority (it lowercases and verifies
 * by sending mail); this check only stops obviously broken input early with a clear message. It follows the
 * RFC 5321 length limits and rejects whitespace and control characters, but does not try to encode the full
 * RFC 5322 grammar: unusual valid addresses (plus tags, IDN domains, apostrophes) must pass.
 */
export const EMAIL_MAX_LENGTH = 254;
const LOCAL_MAX_LENGTH = 64;
const LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u;
// Whitespace, control, zero-width and text-direction characters, and the RFC 5322 specials outside quotes.
// eslint-disable-next-line no-control-regex -- finding control characters is the point.
const FORBIDDEN = /[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff<>(),;:\\"[\]]/u;

/** The value sent to Supabase: surrounding whitespace removed. Case is left to the server. */
export function normalizeEmail(value: string): string {
  return value.trim();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (!email || email.length > EMAIL_MAX_LENGTH || FORBIDDEN.test(email)) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || email.indexOf("@") !== at) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > LOCAL_MAX_LENGTH || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => LABEL.test(label)) && !/^\d+$/.test(labels.at(-1)!);
}
