import type { SlotId } from "~/shared/session/storage-keys";

/**
 * Callback URL registered in Supabase (exact allowlist per environment). The slot travels in the
 * URL so the client that holds the PKCE verifier is the one that exchanges the code.
 */
export function callbackUrl(slot: SlotId, next?: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("slot", String(slot));
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

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
