import { describe, expect, it } from "vitest";
import {
  AUTH_ATTEMPT_LIFETIME,
  assertCallbackIdentity,
  createAuthAttempts,
  parseAuthCallback,
  type AuthAttempt,
} from "./auth-callback";
const nonce = "12345678-1234-4234-8234-123456789abc";
const callback = `trainflow://auth/callback?slot=1&nonce=${nonce}&code=valid-code`;
function setup() {
  const entries = new Map<string, string>();
  let now = 1000000;
  const store = {
    getItem: async (key: string) => entries.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: async (key: string) => {
      entries.delete(key);
    },
  };
  return {
    attempts: createAuthAttempts(
      store,
      () => nonce,
      () => now,
    ),
    setNow: (value: number) => {
      now = value;
    },
  };
}
describe("native auth callback", () => {
  it("accepts exactly the configured PKCE route", () => {
    expect(parseAuthCallback(callback)).toMatchObject({
      slot: 1,
      nonce,
      code: "valid-code",
    });
    for (const value of [
      "https://auth/callback",
      "trainflow://other/callback",
      "trainflow://auth/other",
      "not a url",
    ])
      expect(parseAuthCallback(value)).toBeNull();
  });
  it("rejects fragment tokens, duplicate fields, extra return URLs, invalid slot and mixed errors", () => {
    for (const value of [
      `${callback}#access_token=token`,
      `${callback}&slot=2`,
      `${callback}&returnTo=https://evil.test`,
      callback.replace("slot=1", "slot=3"),
      `${callback}&error=denied`,
      callback.replace(`nonce=${nonce}`, "nonce=bad"),
    ])
      expect(() => parseAuthCallback(value)).toThrow();
  });
  it("consumes matching attempts once, even with duplicate concurrent events", async () => {
    const { attempts } = setup();
    await attempts.begin(1, "User@Example.com", "recovery", "user");
    const results = await Promise.allSettled([
      attempts.consume(callback),
      attempts.consume(callback),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
  it("rejects foreign nonce without consuming the real attempt", async () => {
    const { attempts } = setup();
    await attempts.begin(1, "user@example.com", "confirmation");
    await expect(
      attempts.consume(
        callback.replace(nonce, "22345678-1234-4234-8234-123456789abc"),
      ),
    ).rejects.toThrow();
    expect(await attempts.consume(callback)).not.toBeNull();
  });
  it("rejects wrong slot and expiry boundary", async () => {
    const { attempts, setNow } = setup();
    await attempts.begin(1, "user@example.com", "recovery");
    await expect(
      attempts.consume(callback.replace("slot=1", "slot=0")),
    ).rejects.toThrow();
    setNow(1000000 + AUTH_ATTEMPT_LIFETIME);
    await expect(attempts.consume(callback)).rejects.toThrow();
  });
  it("cancellation invalidates an emailed link", async () => {
    const { attempts } = setup();
    await attempts.begin(1, "user@example.com", "recovery");
    await attempts.cancel(1);
    await expect(attempts.consume(callback)).rejects.toThrow();
  });
  it("binds returned identity to email and existing account", () => {
    const attempt = {
      email: "user@example.com",
      accountId: "one",
    } as AuthAttempt;
    expect(() =>
      assertCallbackIdentity(attempt, {
        id: "one",
        email: "USER@example.com",
      }),
    ).not.toThrow();
    expect(() =>
      assertCallbackIdentity(attempt, {
        id: "two",
        email: "user@example.com",
      }),
    ).toThrow();
    expect(() =>
      assertCallbackIdentity(attempt, {
        id: "one",
        email: "other@example.com",
      }),
    ).toThrow();
  });
});
