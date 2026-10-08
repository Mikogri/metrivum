using TrainFlow.Billing.Domain;
using TrainFlow.BuildingBlocks;
namespace TrainFlow.UnitTests;

public sealed class TeamBillingRulesTests
{
    [Fact]
    public void Half_paid_period_credit_is_fifty_and_due_is_two_fifty()
    {
        var start = DateTimeOffset.Parse("2026-02-01T00:00:00Z");
        var end = start.AddMonths(1);
        Assert.Equal(50m, TeamBillingRules.UnusedValue(100m, start, end, start.AddDays(14)));
        Assert.Equal(250m, TeamBillingRules.AmountDue(300m, 50m));
    }
    [Fact]
    public void Actual_calendar_period_and_boundaries_are_used()
    {
        var start = DateTimeOffset.Parse("2026-01-15T12:00:00Z");
        var end = start.AddMonths(1);
        Assert.Equal(50m, TeamBillingRules.UnusedValue(100m, start, end, start.AddTicks((end - start).Ticks / 2)));
        Assert.Equal(100m, TeamBillingRules.UnusedValue(100m, start, end, start.AddSeconds(-1)));
        Assert.Equal(0m, TeamBillingRules.UnusedValue(100m, start, end, end));
        Assert.Equal(0m, TeamBillingRules.UnusedValue(100m, start, start, start));
        Assert.Equal(0m, TeamBillingRules.UnusedValue(0m, start, end, start));
    }
    [Fact]
    public void Excess_credit_requires_explicit_policy()
    {
        Assert.Throws<ApiException>(() => TeamBillingRules.AmountDue(30m, 50m));
        Assert.Equal(0m, TeamBillingRules.AmountDue(50m, 50m));
    }
    [Fact]
    public void Seat_increase_prorates_without_changing_period()
    {
        var start = DateTimeOffset.Parse("2026-02-01T00:00:00Z");
        var end = start.AddMonths(1);
        Assert.Equal(150m, TeamBillingRules.UnusedValue(100m * 3, start, end, start.AddDays(14)));
    }
}
