export function dateInZone(date: Date, zone: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    return ["year", "month", "day"]
        .map((type) => parts.find((part) => part.type === type)?.value)
        .join("-");
}
export function eventTimes(
    start: Date,
    end: Date,
    allDay: boolean,
    zone: string,
) {
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
        throw new Error("Choose valid start and end dates.");
    if (allDay) {
        const startDate = dateInZone(start, zone);
        const lastDay = dateInZone(end, zone);
        if (lastDay < startDate)
            throw new Error("The last day cannot precede the first day.");
        const until = new Date(`${lastDay}T12:00:00Z`);
        until.setUTCDate(until.getUTCDate() + 1);
        return {
            startsAtUtc: null,
            endsAtUtc: null,
            startDate,
            endDateExclusive: until.toISOString().slice(0, 10),
        };
    }
    if (end <= start) throw new Error("The end must be after the start.");
    return {
        startsAtUtc: start.toISOString(),
        endsAtUtc: end.toISOString(),
        startDate: null,
        endDateExclusive: null,
    };
}
