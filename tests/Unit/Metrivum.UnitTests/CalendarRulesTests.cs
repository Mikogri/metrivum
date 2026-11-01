using Metrivum.BuildingBlocks;
using Metrivum.Calendar.Domain;
using Metrivum.Calendar.Features;

namespace Metrivum.UnitTests;

public sealed class CalendarRulesTests
{
    private static EventWrite Meeting => new("Meeting", "Review", "", "UTC",
        DateTimeOffset.Parse("2026-11-04T09:00:00Z"), DateTimeOffset.Parse("2026-11-04T10:00:00Z"),
        null, null, null, null, [], []);

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("file:///local/file")]
    [InlineData("not a URL")]
    public void Meeting_links_allow_only_absolute_http_urls(string url) =>
        Assert.Throws<ApiException>(() => CalendarRules.Validate(Meeting with { MeetingUrl = url }));

    [Fact]
    public void Timing_requires_one_valid_representation()
    {
        Assert.Throws<ApiException>(() => CalendarRules.Validate(Meeting with { EndsAtUtc = Meeting.StartsAtUtc }));
        Assert.Throws<ApiException>(() => CalendarRules.Validate(Meeting with { StartDate = new(2026, 11, 4) }));
        Assert.Throws<ApiException>(() => CalendarRules.Validate(Meeting with { TimeZone = "Unknown/Nowhere" }));
    }

    [Fact]
    public void Expanded_group_snapshots_over_one_hundred_remain_editable()
    {
        var snapshot = Enumerable.Range(0, 150).Select(_ => Guid.NewGuid()).ToArray();
        Assert.Equal(Meeting.StartsAtUtc, CalendarRules.Validate(Meeting with
        {
            RelationshipIds = snapshot
        }).Start);
        Assert.Throws<ApiException>(() => CalendarRules.Validate(Meeting with { RelationshipIds = [snapshot[0], snapshot[0]] }));
    }

    [Fact]
    public void Range_and_pagination_are_bounded()
    {
        var start = Meeting.StartsAtUtc!.Value;
        Assert.Throws<ApiException>(() => CalendarRules.Range(start, start.AddDays(371), 1, 100));
        Assert.Throws<ApiException>(() => CalendarRules.Range(start, start.AddDays(1), 0, 100));
        Assert.Throws<ApiException>(() => CalendarRules.Range(start, start.AddDays(1), 1, 101));
    }
}
