import { expect, it } from "vitest";
import { nativeIntentPath } from "./native-intent";
it("never forwards untrusted system URLs or query data to the router parser", () => {
  const callback =
    "trainflow://auth/callback?slot=0&nonce=aa123456-1234-4123-8123-123456789abc&code=test-code";
  expect(nativeIntentPath(callback)).toBe("/auth/callback");
  for (const path of [
    "https://other.test",
    "trainflow://payments",
    "trainflow://auth/callback?code=%FF%FF%FF",
    "%FF".repeat(10000),
    callback + "&returnTo=https://other.test",
  ])
    expect(nativeIntentPath(path)).toBe("/");
});
