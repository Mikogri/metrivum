import { describe, expect, it } from "vitest";
import { eventTimes } from "./model";

describe("calendar timestamps", () => {
    it("uses exclusive all-day end across the daylight-saving boundary", () => {
        expect(
            eventTimes(
                new Date("2026-03-28T23:00:00Z"),
                new Date("2026-03-29T22:00:00Z"),
                true,
                "Europe/Warsaw",
            ),
        ).toEqual({
            startsAtUtc: null,
            endsAtUtc: null,
            startDate: "2026-03-29",
            endDateExclusive: "2026-03-31",
        });
    });
    it("rejects invalid or reversed times instead of sending fabricated dates", () => {
        expect(() =>
            eventTimes(new Date("invalid"), new Date(), false, "UTC"),
        ).toThrow();
        expect(() =>
            eventTimes(
                new Date("2026-01-02"),
                new Date("2026-01-01"),
                false,
                "UTC",
            ),
        ).toThrow();
    });
});
