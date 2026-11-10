import { describe, expect, it } from "vitest";
import {
  parseDuration,
  parseEffort,
  parseLoad,
  parseReps,
  parseTempo,
} from "./notation";

describe("cell notation", () => {
  it("parses reps", () => {
    expect(parseReps("5")).toEqual({
      ok: true,
      value: { minimum: 5, maximum: 5 },
    });
    expect(parseReps("8-10")).toEqual({
      ok: true,
      value: { minimum: 8, maximum: 10 },
    });
    expect(parseReps("8–10")).toEqual({
      ok: true,
      value: { minimum: 8, maximum: 10 },
    });
    expect(parseReps("")).toEqual({ ok: true, value: null });
    expect(parseReps("10-8").ok).toBe(false);
    expect(parseReps("0").ok).toBe(false);
    expect(parseReps("five").ok).toBe(false);
  });

  it("parses loads with units, ranges and percentages", () => {
    expect(parseLoad("en", "80")).toEqual({
      ok: true,
      value: {
        kind: "absolute",
        load: {
          minimum: { value: 80, unit: "Kg" },
          maximum: { value: 80, unit: "Kg" },
        },
      },
    });
    expect(parseLoad("en", "175 lb")).toMatchObject({
      ok: true,
      value: {
        kind: "absolute",
        load: { minimum: { value: 175, unit: "Lb" } },
      },
    });
    expect(parseLoad("pl", "82,5-85")).toMatchObject({
      ok: true,
      value: { load: { minimum: { value: 82.5 }, maximum: { value: 85 } } },
    });
    expect(parseLoad("en", "85%")).toEqual({
      ok: true,
      value: { kind: "percent", percent: 85 },
    });
    expect(parseLoad("en", "-5").ok).toBe(false);
    expect(parseLoad("en", "90-80").ok).toBe(false);
    expect(parseLoad("en", "2,5").ok).toBe(true);
  });

  it("parses RPE and RIR without mixing them", () => {
    expect(parseEffort("en", "8")).toEqual({
      ok: true,
      value: { rpe: 8, rir: null },
    });
    expect(parseEffort("pl", "RPE 7,5")).toEqual({
      ok: true,
      value: { rpe: 7.5, rir: null },
    });
    expect(parseEffort("en", "@9")).toEqual({
      ok: true,
      value: { rpe: 9, rir: null },
    });
    expect(parseEffort("en", "RIR 2")).toEqual({
      ok: true,
      value: { rpe: null, rir: 2 },
    });
    expect(parseEffort("en", "2 rir")).toEqual({
      ok: true,
      value: { rpe: null, rir: 2 },
    });
    expect(parseEffort("en", "11").ok).toBe(false);
  });

  it("parses rest durations", () => {
    expect(parseDuration("en", "90")).toEqual({
      ok: true,
      value: { value: 90, unit: "Seconds" },
    });
    expect(parseDuration("en", "2 min")).toEqual({
      ok: true,
      value: { value: 2, unit: "Minutes" },
    });
    expect(parseDuration("en", "1:30")).toEqual({
      ok: true,
      value: { value: 90, unit: "Seconds" },
    });
    expect(parseDuration("en", "soon").ok).toBe(false);
  });

  it("validates tempo like the API", () => {
    expect(parseTempo("3-1-x-0")).toEqual({ ok: true, value: "3-1-X-0" });
    expect(parseTempo("3-1-0").ok).toBe(false);
    expect(parseTempo("100-1-1-1").ok).toBe(false);
  });
});

it("accepts at most 999 repetitions and rejects reversed or fractional ranges", () => {
  expect(parseReps("999").ok).toBe(true);
  expect(parseReps("1-999").ok).toBe(true);
  for (const text of ["1000", "1-1000", "9-2", "1.5"])
    expect(parseReps(text).ok).toBe(false);
});

it("accepts decimal commas and points up to two digits in load and effort in either language", () => {
  for (const locale of ["en", "pl"] as const) {
    for (const input of ["82,25", "82.25"]) {
      expect(parseLoad(locale, input)).toMatchObject({
        ok: true,
        value: { load: { minimum: { value: 82.25 } } },
      });
    }
    expect(parseEffort(locale, "RPE 8,25")).toEqual({
      ok: true,
      value: { rpe: 8.25, rir: null },
    });
    expect(parseLoad(locale, "82,255").ok).toBe(false);
    expect(parseEffort(locale, "8.255").ok).toBe(false);
    expect(parseLoad(locale, "82,25-85,75").ok).toBe(true);
    expect(parseLoad(locale, "1,234.56").ok).toBe(false);
  }
});
