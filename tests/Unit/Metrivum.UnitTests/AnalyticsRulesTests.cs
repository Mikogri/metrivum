using Metrivum.Analytics;
using Metrivum.Analytics.Contracts;
using Metrivum.BuildingBlocks;

namespace Metrivum.UnitTests;

public sealed class AnalyticsRulesTests
{
    [Fact]
    public void Windows_time_zone_is_normalized_before_postgres_aggregation()
    {
        var window = AnalysisDates.Create(
            new(2026, 10, 8),
            new(2026, 10, 8),
            "Pacific Standard Time"
        );
        Assert.Equal("America/Los_Angeles", window.TimeZone);
        Assert.Equal(TimeSpan.FromHours(24), window.End - window.Start);
    }

    [Fact]
    public void Default_calendar_date_uses_requested_time_zone()
    {
        var now = new DateTimeOffset(2026, 10, 8, 22, 30, 0, TimeSpan.Zero);
        Assert.Equal(new DateOnly(2026, 10, 9), AnalysisDates.Today("Pacific/Auckland", now));
        Assert.Equal(new DateOnly(2026, 10, 8), AnalysisDates.Today("UTC", now));
    }

    [Fact]
    public void Warsaw_calendar_day_observes_DST_and_equal_calendar_comparison()
    {
        var w = AnalysisDates.Create(new(2026, 3, 29), new(2026, 3, 29), "Europe/Warsaw");
        Assert.Equal(23, (w.End - w.Start).TotalHours);
        var p = AnalysisDates.Previous(w);
        Assert.Equal(new DateOnly(2026, 3, 28), p.From);
        Assert.Equal(24, (p.End - p.Start).TotalHours);
    }

    [Theory]
    [InlineData(1, 1, 9999, 12)]
    [InlineData(2026, 1, 2025, 12)]
    public void Rejects_unsupported_calendar_bounds(int y1, int m1, int y2, int m2) =>
        Assert.Throws<ApiException>(() =>
            AnalysisDates.Create(new(y1, m1, 1), new(y2, m2, 1), "UTC")
        );

    [Fact]
    public void Rejects_unknown_zone_and_ranges_over_one_year()
    {
        Assert.Throws<ApiException>(() =>
            AnalysisDates.Create(new(2026, 1, 1), new(2026, 1, 2), "Invalid/Zone")
        );
        Assert.Throws<ApiException>(() =>
            AnalysisDates.Create(new(2025, 1, 1), new(2026, 12, 31), "UTC")
        );
    }

    [Fact]
    public void Zero_baseline_is_not_infinity()
    {
        Assert.Null(MetricMath.Percent(0, 0));
        Assert.Null(MetricMath.Change(100, 0));
        Assert.Equal(50, MetricMath.Percent(2, 4));
        Assert.Equal(-50, MetricMath.Change(2, 4));
    }

    [Fact]
    public void Mrr_normalizes_periods_without_currency_conversion()
    {
        Assert.Equal(130, MetricMath.Monthly(30, 1, "Week"));
        Assert.Equal(50, MetricMath.Monthly(100, 2, "Month"));
        Assert.Equal(100, MetricMath.Monthly(1200, 1, "Year"));
    }

    [Fact]
    public void Weekly_bucket_keeps_currencies_separate_and_client_snapshot_uses_last_day()
    {
        var d = new DateOnly(2026, 10, 5);
        var f = AnalysisBuckets.Finance(
            [
                new(d, "EUR", 100, 10, 90, 1),
                new(d.AddDays(1), "EUR", 200, 20, 180, 2),
                new(d, "PLN", 500, 50, 450, 1),
            ],
            "week"
        );
        Assert.Equal(2, f.Length);
        Assert.Equal(300, f.Single(x => x.Currency == "EUR").Gross);
        var c = AnalysisBuckets.Clients(
            [new(d, 3, 1, 0, 0), new(d.AddDays(1), 2, 0, 0, 1)],
            "week"
        );
        Assert.Equal(2, c.Single().Active);
        Assert.Equal(1, c.Single().NewClients);
    }
}
