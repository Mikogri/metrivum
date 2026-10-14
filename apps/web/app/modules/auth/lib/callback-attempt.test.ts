import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginCallbackAttempt, consumeCallbackAttempt } from "./callback-attempt";

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T10:00:00Z")); });
afterEach(() => vi.useRealTimers());
describe("callback attempt lifetime", () => {
  it("binds email and slot and consumes once", () => {
    const nonce = beginCallbackAttempt(0, " MEMBER@example.test ");
    expect(() => consumeCallbackAttempt(1, nonce)).toThrow();
    expect(() => consumeCallbackAttempt(0, "guessed")).toThrow();
    expect(consumeCallbackAttempt(0, nonce).email).toBe("member@example.test");
    expect(() => consumeCallbackAttempt(0, nonce)).toThrow();
  });
  it("expires links after one hour", () => {
    const nonce = beginCallbackAttempt(0, "member@example.test");
    vi.advanceTimersByTime(3600000);
    expect(() => consumeCallbackAttempt(0, nonce)).toThrow();
  });
  it("invalidates an earlier link when requesting a replacement", () => {
    const old = beginCallbackAttempt(0, "member@example.test");
    const current = beginCallbackAttempt(0, "member@example.test");
    expect(() => consumeCallbackAttempt(0, old)).toThrow();
    expect(consumeCallbackAttempt(0, current).email).toBe("member@example.test");
  });
  it("fails closed for missing or corrupt browser state", () => {
    expect(() => consumeCallbackAttempt(0, "unsolicited")).toThrow();
    localStorage.setItem("tf.auth.callback.0", "{bad");
    expect(() => consumeCallbackAttempt(0, "unsolicited")).toThrow();
  });
});
