/**
 * Client-side copy of the account identity rules (backend: AccountIdentityPolicy). It only gives early, specific
 * feedback; the API is authoritative and may reject a name for reasons listed only there.
 */
export const USERNAME_MAX = 32;
export const DISPLAY_NAME_MAX = 100;
const USERNAME = /^[A-Za-z][A-Za-z0-9_]{1,30}[A-Za-z0-9]$/;
const RESERVED = new Set([
  "admin", "administrator", "root", "system", "sysadmin", "superuser", "support", "help", "helpdesk",
  "staff", "team", "official", "moderator", "mod", "security", "abuse", "privacy", "legal", "billing",
  "payments", "noreply", "no_reply", "postmaster", "webmaster", "hostmaster", "mailer", "info", "contact",
  "api", "www", "app", "auth", "login", "logout", "signin", "signup", "register", "onboarding",
  "settings", "account", "accounts", "profile", "me", "null", "undefined", "anonymous", "unknown",
  "everyone", "all", "here", "owner", "coaches", "clients", "status", "test", "demo",
]);
// Controls, line/paragraph separators, bidi and zero-width characters (the emoji joiner U+200D is allowed).
// eslint-disable-next-line no-control-regex -- finding control characters is the point.
const HIDDEN = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b\u200c\u200e\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb\ue000-\uf8ff]/u;

export type UsernameProblem = "invalid" | "reserved" | null;

export function usernameProblem(value: string): UsernameProblem {
  if (!USERNAME.test(value) || value.includes("__")) return "invalid";
  const lower = value.toLowerCase();
  return RESERVED.has(lower) || lower.startsWith("trainflow") ? "reserved" : null;
}

/** Trimmed, NFC, whitespace runs collapsed: what the server will store. */
export function normalizeDisplayName(value: string): string {
  return value.normalize("NFC").replace(/[ \t\p{Zs}]+/gu, " ").trim();
}

export function displayNameValid(value: string): boolean {
  const normalized = normalizeDisplayName(value);
  return normalized.length > 0 && normalized.length <= DISPLAY_NAME_MAX && !HIDDEN.test(normalized);
}
