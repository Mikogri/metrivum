import { describe, expect, it } from "vitest";
import { parseLocaleNumber } from "./format";

describe("parseLocaleNumber", () => {
  it("reads the Polish decimal comma as a decimal, never as grouping", () => {
    expect(parseLocaleNumber("pl", "2,5")).toBe(2.5);
    expect(parseLocaleNumber("pl", "1 234,5")).toBe(1234.5);
    expect(parseLocaleNumber("pl", "2.5")).toBe(2.5);
  });

  it("refuses ambiguous English input instead of turning 2,5 into 25", () => {
    expect(parseLocaleNumber("en", "2,5")).toBeNull();
    expect(parseLocaleNumber("en", "1,234.5")).toBe(1234.5);
    expect(parseLocaleNumber("en", "2.5")).toBe(2.5);
  });

  it("rejects garbage and empty input", () => {
    expect(parseLocaleNumber("en", "")).toBeNull();
    expect(parseLocaleNumber("en", "12kg")).toBeNull();
    expect(parseLocaleNumber("pl", "1,2,3")).toBeNull();
  });
});
