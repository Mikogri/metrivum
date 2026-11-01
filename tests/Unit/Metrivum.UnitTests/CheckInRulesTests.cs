using Metrivum.BuildingBlocks;
using Metrivum.CheckIns.Domain;
using Metrivum.Training.Contracts;

namespace Metrivum.UnitTests;

public sealed class CheckInRulesTests
{
    [Fact]
    public void Cycle_days_follow_finite_ten_day_cycles_and_preserve_dst_local_time()
    {
        var assignment = new AssignedProgramCycles(Guid.NewGuid(), Guid.NewGuid(), "Ten days", "Europe/Warsaw", true,
            [new(Guid.NewGuid(), new(2026, 10, 16), 10), new(Guid.NewGuid(), new(2026, 10, 26), 10)]);
        var recurrence = new Recurrence(RecurrenceKind.AssignedProgramCycle, 1, new(2026, 1, 1), new(2, 30), AssignmentId: assignment.AssignmentId, CycleDays: [1, 10]);
        CheckInRules.ValidateCycles(recurrence, assignment);
        var first = CheckInRules.NextCycle(recurrence, assignment);
        Assert.Equal(DateTimeOffset.Parse("2026-10-16T00:30:00Z"), first);
        var second = CheckInRules.NextCycle(recurrence, assignment, first);
        Assert.Equal(DateTimeOffset.Parse("2026-10-25T00:30:00Z"), second);
        var third = CheckInRules.NextCycle(recurrence, assignment, second);
        Assert.Equal(DateTimeOffset.Parse("2026-10-26T01:30:00Z"), third);
        var last = CheckInRules.NextCycle(recurrence, assignment, third);
        Assert.Equal(DateTimeOffset.Parse("2026-11-04T01:30:00Z"), last);
        Assert.Null(CheckInRules.NextCycle(recurrence, assignment, last));
        Assert.Null(CheckInRules.NextCycle(recurrence, assignment with { Active = false }));
        Assert.Throws<ApiException>(() => CheckInRules.ValidateCycles(recurrence with { CycleDays = [11] }, assignment));
        Assert.Throws<ApiException>(() => CheckInRules.Validate(recurrence with { CycleDays = [1, 1] }, "UTC", 48));
        Assert.Throws<ApiException>(() => CheckInRules.Validate(recurrence with { AssignmentId = null }, "UTC", 48));
    }

    [Fact]
    public void Assigned_program_cycle_is_an_accepted_recurrence_contract()
    {
        var recurrence = System.Text.Json.JsonSerializer.Deserialize<Recurrence>("""
            {"Kind":"AssignedProgramCycle","Interval":1,"StartDate":"2026-10-01","ReleaseTime":"09:00:00","AssignmentId":"df245b1c-6b7e-4e48-8d56-cdf85759e614","CycleDays":[1,10]}
            """)!;
        CheckInRules.Validate(recurrence, "Europe/Warsaw", 48);
    }
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
