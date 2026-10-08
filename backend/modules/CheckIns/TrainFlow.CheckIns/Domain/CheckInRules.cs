using TrainFlow.BuildingBlocks;

namespace TrainFlow.CheckIns.Domain;

public static class CheckInRules
{
    public static TimeZoneInfo Zone(string id)
    {
        if (string.IsNullOrWhiteSpace(id) || (id != "UTC" && !TimeZoneInfo.TryConvertIanaIdToWindowsId(id, out _)))
            throw ApiException.Invalid("Use an IANA timezone identifier.");
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (TimeZoneNotFoundException) { throw ApiException.Invalid("Unknown timezone."); }
    }
    public static void Validate(Recurrence recurrence, string zone, int window)
    {
        _ = Zone(zone);
        if (!Enum.IsDefined(recurrence.Kind) || recurrence.Interval is < 1 or > 365 || window is < 1 or > 8760)
            throw ApiException.Invalid("Invalid recurrence interval or response window.");
        if (recurrence.StartDate.Year is < 2000 or > 2100 || recurrence.ReleaseTime.Ticks % TimeSpan.TicksPerMinute != 0)
            throw ApiException.Invalid("Use a start date in 2000–2100 and release time at minute precision.");
        if (recurrence.Kind == RecurrenceKind.EveryNWeeks && (recurrence.WeekDays is not { Count: > 0 and <= 7 } || recurrence.WeekDays.Any(x => x is < 0 or > 6) || recurrence.WeekDays.Distinct().Count() != recurrence.WeekDays.Count))
            throw ApiException.Invalid("Weekly recurrence needs distinct weekdays (Sunday=0, Saturday=6).");
        if (recurrence.Kind == RecurrenceKind.Monthly && recurrence.DayOfMonth is not (>= 1 and <= 31))
            throw ApiException.Invalid("Monthly recurrence needs dayOfMonth in 1–31.");
        if (recurrence.Kind != RecurrenceKind.EveryNWeeks && recurrence.WeekDays is { Count: > 0 })
            throw ApiException.Invalid("Weekdays only apply to weekly recurrence.");
        if (recurrence.Kind != RecurrenceKind.Monthly && recurrence.DayOfMonth != null)
            throw ApiException.Invalid("Day of month only applies to monthly recurrence.");
    }
    // Spring gaps move to the first valid local minute. Fall overlaps choose the earlier UTC occurrence.
    public static DateTimeOffset ToUtc(DateOnly date, TimeOnly time, TimeZoneInfo zone)
    {
        var local = date.ToDateTime(time, DateTimeKind.Unspecified);
        while (zone.IsInvalidTime(local))
            local = local.AddMinutes(1);
        if (zone.IsAmbiguousTime(local))
            return new DateTimeOffset(local, zone.GetAmbiguousTimeOffsets(local).Max()).ToUniversalTime();
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, zone), TimeSpan.Zero);
    }
    public static DateTimeOffset? Next(Recurrence recurrence, string zoneId, DateTimeOffset? after = null)
    {
        var zone = Zone(zoneId);
        if (recurrence.Kind == RecurrenceKind.OneTime)
        {
            var once = ToUtc(recurrence.StartDate, recurrence.ReleaseTime, zone);
            return after == null || once > after ? once : null;
        }
        var localAfter = after == null ? recurrence.StartDate : DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(after.Value, zone).DateTime);
        var date = localAfter < recurrence.StartDate ? recurrence.StartDate : localAfter;
        for (var i = 0; i < 150000; i++, date = date.AddDays(1))
        {
            var days = date.DayNumber - recurrence.StartDate.DayNumber;
            var matches = recurrence.Kind switch
            {
                RecurrenceKind.EveryNDays => days % recurrence.Interval == 0,
                RecurrenceKind.EveryNWeeks => days / 7 % recurrence.Interval == 0 && recurrence.WeekDays!.Contains((int)date.DayOfWeek),
                RecurrenceKind.Monthly => ((date.Year - recurrence.StartDate.Year) * 12 + date.Month - recurrence.StartDate.Month) % recurrence.Interval == 0 && date.Day == Math.Min(recurrence.DayOfMonth!.Value, DateTime.DaysInMonth(date.Year, date.Month)),
                _ => false
            };
            if (!matches)
                continue;
            var result = ToUtc(date, recurrence.ReleaseTime, zone);
            if (after == null || result > after)
                return result;
        }
        throw ApiException.Invalid("Recurrence exceeds the supported date range.");
    }
    public static void CheckVersion(long actual, long expected)
    {
        if (actual != expected)
            throw new ApiException(412, "VERSION_CONFLICT", "The resource changed. Reload it before retrying.");
    }
    public static void Pagination(int page, int size)
    {
        if (page is < 1 or > 1000000 || size is < 1 or > 100)
            throw ApiException.Invalid("Page must be 1–1000000 and pageSize 1–100.");
    }
    public static void Text(string? value, int max, bool required = false)
    {
        if (required && string.IsNullOrWhiteSpace(value) || value?.Length > max || value?.Any(char.IsControl) == true)
            throw ApiException.Invalid($"Text must be at most {max} characters without control characters.");
    }
}
