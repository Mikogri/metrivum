using TrainFlow.Analytics.Contracts;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Analytics;

public static class AnalysisDates
{
    public static DateOnly Today(string zone, DateTimeOffset now)
    {
        try
        {
            return DateOnly.FromDateTime(
                TimeZoneInfo.ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById(zone)).DateTime
            );
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            throw ApiException.Invalid("Unknown time zone.");
        }
    }

    public static AnalysisWindow Create(DateOnly from, DateOnly to, string zone)
    {
        // PostgreSQL accepts IANA identifiers, even when the API runs on Windows.
        if (TimeZoneInfo.TryConvertWindowsIdToIanaId(zone, out var ianaZone))
            zone = ianaZone;
        if (from.Year < 1901 || to.Year > 9998 || to < from || to.DayNumber - from.DayNumber > 365)
            throw ApiException.Invalid("Choose a range of 1 to 366 calendar days.");
        TimeZoneInfo tz;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(zone);
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            throw ApiException.Invalid("Unknown time zone.");
        }
        DateTimeOffset Midnight(DateOnly date)
        {
            var local = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
            if (tz.IsInvalidTime(local))
                throw ApiException.Invalid(
                    "This time zone has no midnight on a selected date; select a different date range."
                );
            return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, tz), TimeSpan.Zero);
        }
        return new(from, to, zone, Midnight(from), Midnight(to.AddDays(1)));
    }

    public static AnalysisWindow Previous(AnalysisWindow w)
    {
        var days = w.To.DayNumber - w.From.DayNumber + 1;
        return Create(w.From.AddDays(-days), w.From.AddDays(-1), w.TimeZone);
    }
}
