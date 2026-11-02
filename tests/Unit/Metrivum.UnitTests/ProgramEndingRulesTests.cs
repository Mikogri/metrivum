using Metrivum.Notifications.Contracts;
using Metrivum.Training.Delivery;

namespace Metrivum.UnitTests;

public sealed class ProgramEndingRulesTests
{
    private static readonly Guid BlockA = Guid.NewGuid(), BlockB = Guid.NewGuid(), CycleA = Guid.NewGuid(), CycleB = Guid.NewGuid();

    // Block A: cycle A (Mar 2, 5). Block B: cycle B twice (Mar 9, 12, then Mar 16, 19).
    private static readonly PlannedSlot[] Program =
    [
        new(new(2026, 3, 2), BlockA, CycleA, 0), new(new(2026, 3, 5), BlockA, CycleA, 0),
        new(new(2026, 3, 9), BlockB, CycleB, 0), new(new(2026, 3, 12), BlockB, CycleB, 0),
        new(new(2026, 3, 16), BlockB, CycleB, 1), new(new(2026, 3, 19), BlockB, CycleB, 1),
    ];

    [Fact]
    public void Each_alert_falls_on_its_moment()
    {
        Assert.Equal(new DateOnly(2026, 3, 9), ProgramEndingRules.Trigger(Program, ProgramEndingAlerts.LastBlock));
        Assert.Equal(new DateOnly(2026, 3, 16), ProgramEndingRules.Trigger(Program, ProgramEndingAlerts.LastCycle));
        Assert.Equal(new DateOnly(2026, 3, 13), ProgramEndingRules.Trigger(Program, ProgramEndingAlerts.LastWeek));
        Assert.Equal(new DateOnly(2026, 3, 19), ProgramEndingRules.Trigger(Program, ProgramEndingAlerts.LastWorkout));
    }

    [Fact]
    public void Several_alerts_can_be_due_and_none_after_the_end()
    {
        var all = ProgramEndingAlerts.All;
        Assert.Empty(ProgramEndingRules.Due(Program, all, new(2026, 3, 8), new(2026, 3, 1)));
        Assert.Equal([ProgramEndingAlerts.LastBlock, ProgramEndingAlerts.LastCycle, ProgramEndingAlerts.LastWeek],
            ProgramEndingRules.Due(Program, all, new(2026, 3, 16), new(2026, 3, 1)));
        Assert.Equal(all, ProgramEndingRules.Due(Program, all, new(2026, 3, 19), new(2026, 3, 1)));
        Assert.Empty(ProgramEndingRules.Due(Program, all, new(2026, 3, 20), new(2026, 3, 1)));
    }

    [Fact]
    public void Only_chosen_alerts_and_none_that_had_passed_when_assigned()
    {
        Assert.Equal([ProgramEndingAlerts.LastWeek], ProgramEndingRules.Due(Program, [ProgramEndingAlerts.LastWeek], new(2026, 3, 16), new(2026, 3, 1)));
        // Assigned when the last block had already begun: only what is still ahead counts.
        Assert.Equal([ProgramEndingAlerts.LastCycle, ProgramEndingAlerts.LastWeek],
            ProgramEndingRules.Due(Program, ProgramEndingAlerts.All, new(2026, 3, 16), new(2026, 3, 10)));
        Assert.Empty(ProgramEndingRules.Due([], ProgramEndingAlerts.All, new(2026, 3, 16), new(2026, 3, 1)));
    }
}
