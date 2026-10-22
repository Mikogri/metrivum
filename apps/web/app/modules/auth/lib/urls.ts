import type { SlotId } from "~/shared/session/storage-keys";
import { beginCallbackAttempt } from "./callback-attempt";

/**
 * The slot selects the PKCE client; the browser-held nonce also binds token-hash links
 * to the request that initiated them. Preserve both in Supabase email redirects.
 */
export function callbackUrl(slot: SlotId, next: string | undefined, email: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("slot", String(slot));
  url.searchParams.set("nonce", beginCallbackAttempt(slot, email));
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

export function slotParam(value: string | null): number | null {
  if (value === null) return null;
  const slot = Number(value);
  return Number.isInteger(slot) ? slot : null;
}

export type RegistrationRole = "Coach" | "Client";

/** This is an onboarding preference, never an authorization claim. */
export function registrationRole(value: string | null): RegistrationRole {
  return value === "Coach" ? "Coach" : "Client";
}

export function onboardingUrl(role: string | null): string {
  return `/onboarding?role=${registrationRole(role)}`;
}

