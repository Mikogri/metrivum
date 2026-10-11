import { expect, it } from "vitest";
import { calendarWeek } from "./model";
it("anchors the calendar window to local midnights for seven calendar dates", () => {
    const now = new Date(2026, 9, 24, 17, 30);
    const range = calendarWeek(now);
    const from = new Date(range.from);
    const to = new Date(range.to);
    expect(from.getDate()).toBe(24);
    expect(from.getHours()).toBe(0);
    expect(to.getDate()).toBe(31);
    expect(to.getHours()).toBe(0);
    expect(now.getHours()).toBe(17);
});
