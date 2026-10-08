using TrainFlow.BuildingBlocks;
using TrainFlow.CheckIns.Domain;

namespace TrainFlow.UnitTests;

public sealed class CheckInRulesTests
{
    [Fact]
    public void Spring_gap_moves_to_first_valid_minute_and_fall_overlap_chooses_earlier_instant()
    {
        var zone = CheckInRules.Zone("Europe/Warsaw");
        Assert.Equal(DateTimeOffset.Parse("2026-03-29T01:00:00Z"), CheckInRules.ToUtc(new(2026, 3, 29), new(2, 30), zone));
        Assert.Equal(DateTimeOffset.Parse("2026-10-25T00:30:00Z"), CheckInRules.ToUtc(new(2026, 10, 25), new(2, 30), zone));
        var r = new Recurrence(RecurrenceKind.EveryNDays, 1, new(2026, 10, 24), new(2, 30));
        var first = CheckInRules.Next(r, "Europe/Warsaw")!.Value;
        var second = CheckInRules.Next(r, "Europe/Warsaw", first)!.Value;
        Assert.Equal(DateTimeOffset.Parse("2026-10-25T00:30:00Z"), second);
        Assert.Equal(DateTimeOffset.Parse("2026-10-26T01:30:00Z"), CheckInRules.Next(r, "Europe/Warsaw", second));
    }
    [Fact]
    public void Monthly_clamps_end_of_month_without_drifting_and_preserves_interval()
    {
        var r = new Recurrence(RecurrenceKind.Monthly, 1, new(2026, 1, 31), new(9, 0), DayOfMonth: 31);
        var jan = CheckInRules.Next(r, "UTC")!.Value;
        var feb = CheckInRules.Next(r, "UTC", jan)!.Value;
        Assert.Equal(DateTimeOffset.Parse("2026-02-28T09:00:00Z"), feb);
        Assert.Equal(DateTimeOffset.Parse("2026-03-31T09:00:00Z"), CheckInRules.Next(r, "UTC", feb));
        Assert.Equal(DateTimeOffset.Parse("2026-03-31T09:00:00Z"), CheckInRules.Next(r with
        {
            Interval = 2
        }, "UTC", jan));
    }
    [Fact]
    public void Weekly_multiple_days_use_start_date_anchored_seven_day_periods()
    {
        var r = new Recurrence(RecurrenceKind.EveryNWeeks, 2, new(2026, 10, 5), new(9, 0), [1, 4]);
        var mon = CheckInRules.Next(r, "UTC")!.Value;
        var thu = CheckInRules.Next(r, "UTC", mon)!.Value;
        Assert.Equal(DateTimeOffset.Parse("2026-10-08T09:00:00Z"), thu);
        Assert.Equal(DateTimeOffset.Parse("2026-10-19T09:00:00Z"), CheckInRules.Next(r, "UTC", thu));
    }
    [Fact]
    public void One_time_is_exhausted_after_release_and_invalid_inputs_are_controlled()
    {
        var r = new Recurrence(RecurrenceKind.OneTime, 1, new(2026, 10, 5), new(9, 0));
        var release = CheckInRules.Next(r, "UTC")!.Value;
        Assert.Null(CheckInRules.Next(r, "UTC", release));
        Assert.Throws<ApiException>(() => CheckInRules.Validate(r, "Central European Standard Time", 24));
        Assert.Throws<ApiException>(() => CheckInRules.Validate(r, "UTC", 0));
        Assert.Throws<ApiException>(() => CheckInRules.Validate(r with { Interval = 0 }, "UTC", 24));
        Assert.Throws<ApiException>(() => CheckInRules.Validate(r with { Kind = RecurrenceKind.EveryNWeeks, WeekDays = [1, 1] }, "UTC", 24));
        Assert.Throws<ApiException>(() => CheckInRules.Validate(r with { Kind = RecurrenceKind.Monthly, DayOfMonth = 32 }, "UTC", 24));
        Assert.Throws<ApiException>(() => CheckInRules.Pagination(0, 25));
    }
}
