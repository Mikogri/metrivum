import { describe, expect, it } from "vitest";
import { displayNameValid, normalizeDisplayName, usernameProblem } from "./identity";

describe("usernameProblem", () => {
  it.each(["abc", "Coach_Anna", "anna_2026", "coach", "client", "a".repeat(32)])("accepts %s", (name) => expect(usernameProblem(name)).toBeNull());
  it.each(["ab", "a".repeat(33), "1anna", "_anna", "anna_", "an__na", "anna.k", "anna k", "ánna", "\u0430dmin"])("rejects %j", (name) =>
    expect(usernameProblem(name)).toBe("invalid"));
  it.each(["admin", "ADMIN", "Support", "trainflow", "TrainFlow_Team"])("reserves %s", (name) => expect(usernameProblem(name)).toBe("reserved"));
});

describe("display names", () => {
  it("normalises like the server", () => {
    expect(normalizeDisplayName("  Anna 	  Kowalska ")).toBe("Anna Kowalska");
    expect(normalizeDisplayName("Rene\u0301")).toBe("Ren\u00e9");
  });
  it.each(["Anna Kowalska", "Łukasz Żółć", "Coach 💪", "Family 👨\u200d👩\u200d👧"])("accepts %s", (name) => expect(displayNameValid(name)).toBe(true));
  it.each(["", "   ", "Anna\nKowalska", "Anna\u202eakswolwoK", "Anna\u200bKowalska", "Anna\u0000", "a".repeat(101)])("rejects %j", (name) =>
    expect(displayNameValid(name)).toBe(false));
});
