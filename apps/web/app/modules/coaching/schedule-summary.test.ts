import { describe, expect, it } from "vitest";
import { describeRecurrence, describeWindow, nextReleases } from "./schedule-summary";

describe("schedule preview", () => {
  it("lists upcoming releases for each kind", () => {
    expect(nextReleases({ kind: "OneTime", interval: 1, startDate: "2026-11-02" }, "2026-10-24")).toEqual(["2026-11-02"]);
    expect(nextReleases({ kind: "OneTime", interval: 1, startDate: "2026-10-01" }, "2026-10-24")).toEqual([]);
    expect(nextReleases({ kind: "EveryNDays", interval: 3, startDate: "2026-10-20" }, "2026-10-24")).toEqual(["2026-10-26", "2026-10-29", "2026-11-01"]);
    // Every second week on Monday and Thursday, counted from the week of 19 Oct (a Monday).
    expect(nextReleases({ kind: "EveryNWeeks", interval: 2, startDate: "2026-10-19", weekDays: [1, 4] }, "2026-10-24")).toEqual(["2026-11-02", "2026-11-05", "2026-11-16"]);
    // Day 31 falls back to the last day of shorter months.
    expect(nextReleases({ kind: "Monthly", interval: 1, startDate: "2026-10-31", dayOfMonth: 31 }, "2026-10-24")).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
  });

  it("describes the schedule and the response window in words", () => {
    expect(describeRecurrence({ kind: "EveryNWeeks", interval: 1, startDate: "2026-10-19", weekDays: [4, 1] })).toBe("Every week on Mon and Thu");
    expect(describeRecurrence({ kind: "EveryNDays", interval: 1, startDate: "2026-10-19" })).toBe("Every day");
    expect(describeRecurrence({ kind: "Monthly", interval: 2, startDate: "2026-10-19", dayOfMonth: 15 })).toBe("Every 2 months on day 15");
    expect(describeWindow(48)).toBe("2 days");
    expect(describeWindow(168)).toBe("1 week");
    expect(describeWindow(36)).toBe("36 hours");
  });
});
