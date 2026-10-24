import { afterEach, describe, expect, it } from "vitest";
import { ACTIVE_SLOT_STORAGE_KEY, forgetSlot, slotStorageKey, storedAccountsHint } from "./storage-keys";

const session = (email: string) => JSON.stringify({ access_token: "a", refresh_token: "r", user: { email } });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("stored account hints for public pages", () => {
  it("shows a reused email once, preferring the active slot without merging stored sessions", () => {
    localStorage.setItem(slotStorageKey(0), session("a@example.test"));
    localStorage.setItem(slotStorageKey(1), session(" A@example.test "));
    localStorage.setItem(ACTIVE_SLOT_STORAGE_KEY, "1");
    expect(storedAccountsHint()).toEqual([{ slot: 1, email: " A@example.test ", active: true }]);
    expect(localStorage.getItem(slotStorageKey(0))).not.toBeNull();
    expect(localStorage.getItem(slotStorageKey(1))).not.toBeNull();
  });

  it("lists stored accounts with the preferred one active and skips broken entries", () => {
    localStorage.setItem(slotStorageKey(0), session("a@example.test"));
    localStorage.setItem(slotStorageKey(1), "{not json refresh_token");
    localStorage.setItem(slotStorageKey(2), session("c@example.test"));
    localStorage.setItem(ACTIVE_SLOT_STORAGE_KEY, "2");
    expect(storedAccountsHint()).toEqual([
      { slot: 0, email: "a@example.test", active: false },
      { slot: 2, email: "c@example.test", active: true },
    ]);
  });

  it("forgetting the active account makes the next remaining one active", () => {
    localStorage.setItem(slotStorageKey(0), session("a@example.test"));
    localStorage.setItem(slotStorageKey(1), session("b@example.test"));
    localStorage.setItem(ACTIVE_SLOT_STORAGE_KEY, "0");
    sessionStorage.setItem(ACTIVE_SLOT_STORAGE_KEY, "0");
    forgetSlot(0);
    expect(localStorage.getItem(slotStorageKey(0))).toBeNull();
    expect(localStorage.getItem(ACTIVE_SLOT_STORAGE_KEY)).toBe("1");
    expect(sessionStorage.getItem(ACTIVE_SLOT_STORAGE_KEY)).toBe("1");
    forgetSlot(1);
    expect(localStorage.getItem(ACTIVE_SLOT_STORAGE_KEY)).toBeNull();
    expect(storedAccountsHint()).toEqual([]);
  });
});
