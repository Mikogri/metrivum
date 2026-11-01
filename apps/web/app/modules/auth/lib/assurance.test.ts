import type { Factor, Session, User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPasswordRecovery, hasPassword, hasPasswordRecovery, isSixDigitCode, markPasswordRecovery, needsSecondFactor, sessionAal, verifiedFactors } from "./assurance";

const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = (claims: object) => `${encode({ alg: "ES256" })}.${encode(claims)}.signature`;
const factor = (status: "verified" | "unverified", type: Factor["factor_type"] = "totp") =>
  ({ id: `${type}-${status}`, factor_type: type, status, created_at: "", updated_at: "" }) as Factor;
const session = (aal: string, factors: Factor[] = []) => ({ access_token: token({ aal, sub: "user" }), user: { id: "user", factors } as unknown as User }) as Session;

afterEach(() => { sessionStorage.clear(); vi.useRealTimers(); });

describe("authentication level", () => {
  it("reads the level from the signed token", () => {
    expect(sessionAal(session("aal1"))).toBe("aal1");
    expect(sessionAal(session("aal2"))).toBe("aal2");
    expect(sessionAal({ ...session("aal2"), access_token: "not-a-jwt" })).toBeNull();
  });

  it("asks for the second step only when a verified factor exists and the session is below aal2", () => {
    expect(needsSecondFactor(session("aal1"))).toBe(false);
    expect(needsSecondFactor(session("aal1", [factor("unverified")]))).toBe(false);
    expect(needsSecondFactor(session("aal1", [factor("verified")]))).toBe(true);
    expect(needsSecondFactor(session("aal2", [factor("verified")]))).toBe(false);
    // A token that cannot be read never counts as having passed the second step.
    expect(needsSecondFactor({ ...session("aal2", [factor("verified")]), access_token: "broken" })).toBe(true);
  });

  it("does not count unfinished setups or backup codes as sign-in factors", () => {
    expect(verifiedFactors({ factors: [factor("unverified"), factor("verified", "recovery_code"), factor("verified")] } as unknown as User)).toHaveLength(1);
  });

  it("accepts exactly six digits", () => {
    expect(isSixDigitCode("123 456")).toBe(true);
    expect(isSixDigitCode("12345")).toBe(false);
    expect(isSixDigitCode("12345a")).toBe(false);
  });

  it("knows accounts that sign in with codes only have no password", () => {
    expect(hasPassword({ identities: [{ provider: "email" }], app_metadata: {} } as unknown as User)).toBe(true);
    expect(hasPassword({ identities: [{ provider: "google" }], app_metadata: {} } as unknown as User)).toBe(false);
  });
});

describe("password recovery marker", () => {
  it("unlocks the reset form only for the account the link signed in, within an hour", () => {
    vi.useFakeTimers();
    markPasswordRecovery(0, "user-a");
    expect(hasPasswordRecovery(0, "user-a")).toBe(true);
    expect(hasPasswordRecovery(0, "user-b")).toBe(false);
    expect(hasPasswordRecovery(1, "user-a")).toBe(false);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(hasPasswordRecovery(0, "user-a")).toBe(false);
  });

  it("is gone once used", () => {
    markPasswordRecovery(0, "user-a");
    clearPasswordRecovery(0);
    expect(hasPasswordRecovery(0, "user-a")).toBe(false);
  });

  it("ignores a tampered marker", () => {
    sessionStorage.setItem("tf.auth.recovery.0", "{not json");
    expect(hasPasswordRecovery(0, "user-a")).toBe(false);
    sessionStorage.setItem("tf.auth.recovery.0", JSON.stringify({ userId: "user-a", at: Date.now() + 60_000 }));
    expect(hasPasswordRecovery(0, "user-a")).toBe(false);
  });
});
