using Metrivum.BuildingBlocks;
using Metrivum.Calendar.Features;

namespace Metrivum.Calendar.Domain;

/// <summary>Validates event ranges, time zones and versions and resolves local dates without database writes.</summary>
public static class CalendarRules
{
    public static TimeZoneInfo Zone(string id)
    {
        if (string.IsNullOrWhiteSpace(id) || (id != "UTC" && !TimeZoneInfo.TryConvertIanaIdToWindowsId(id, out _)))
            throw ApiException.Invalid("Use an IANA timezone.");
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (TimeZoneNotFoundException) { throw ApiException.Invalid("Unknown timezone."); }
    }
    public static void Range(DateTimeOffset from, DateTimeOffset to, int page, int size)
    {
        if (from >= to || to - from > TimeSpan.FromDays(370) || from.Year < 2000 || to.Year > 2101 || page is < 1 or > 1000000 || size is < 1 or > 100)
            throw ApiException.Invalid("Use a range of up to 370 days, page 1–1000000 and pageSize 1–100.");
    }
    public static (DateTimeOffset Start, DateTimeOffset End) Validate(EventWrite r)
    {
        var zone = Zone(r.TimeZone);
        if (r.Kind is not ("Meeting" or "Event") || string.IsNullOrWhiteSpace(r.Title) || r.Title.Length > 200 || r.Title.Any(char.IsControl) || r.Description?.Length > 10000 || r.Location?.Length > 500 || r.MeetingUrl?.Length > 2048)
            throw ApiException.Invalid("Invalid event kind or text length.");
        if (!string.IsNullOrEmpty(r.MeetingUrl) && (!Uri.TryCreate(r.MeetingUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http")))
            throw ApiException.Invalid("Meeting URL must use HTTPS or HTTP.");
        if (r.RelationshipIds == null || r.GroupIds == null || r.RelationshipIds.Count > 10000 || r.GroupIds.Count > 100 || r.RelationshipIds.Contains(Guid.Empty) || r.GroupIds.Contains(Guid.Empty) || r.RelationshipIds.Distinct().Count() != r.RelationshipIds.Count || r.GroupIds.Distinct().Count() != r.GroupIds.Count)
            throw ApiException.Invalid("Use at most 100 groups and 10000 distinct clients.");
        DateTimeOffset start, end;
        if (r.StartDate is DateOnly date && r.EndDateExclusive is DateOnly until)
        {
            if (r.Kind != "Event" || r.StartsAtUtc != null || r.EndsAtUtc != null || date >= until || date.Year < 2000 || until.Year > 2100)
                throw ApiException.Invalid("All-day events require an exclusive end date after the start.");
            start = Midnight(date, zone);
            end = Midnight(until, zone);
        }
        else
        {
            if (r.StartDate != null || r.EndDateExclusive != null || r.StartsAtUtc == null || r.EndsAtUtc == null)
                throw ApiException.Invalid("Provide a timed interval or all-day dates.");
            start = r.StartsAtUtc.Value.ToUniversalTime();
            end = r.EndsAtUtc.Value.ToUniversalTime();
        }
        if (start >= end || start.Year < 2000 || end.Year > 2101)
            throw ApiException.Invalid("Event end must follow its start, in years 2000–2100.");
        return (start, end);
    }
    private static DateTimeOffset Midnight(DateOnly date, TimeZoneInfo zone)
    {
        var local = date.ToDateTime(TimeOnly.MinValue);
        while (zone.IsInvalidTime(local))
            local = local.AddMinutes(1);
        return zone.IsAmbiguousTime(local) ? new DateTimeOffset(local, zone.GetAmbiguousTimeOffsets(local).Max()).ToUniversalTime() : new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, zone));
    }
    public static void Version(long actual, long expected)
    {
        if (actual != expected)
            throw new ApiException(412, "VERSION_CONFLICT", "The event or invitation changed. Reload before retrying.");
    }
}
