using Metrivum.Notifications.Contracts;

namespace Metrivum.Training.Delivery;

/// <summary>One planned workout of an assignment, reduced to what the ending alerts need.</summary>
public sealed record PlannedSlot(DateOnly Date, Guid BlockId, Guid CycleId, int Repetition);

/// <summary>
/// When each "the client's program is ending" alert is due, from the assignment's planned workouts:
/// the last block or cycle starts, the last seven days begin, or the last workout day arrives.
/// </summary>
public static class ProgramEndingRules
{
    public static DateOnly? Trigger(IReadOnlyList<PlannedSlot> slots, string kind)
    {
        if (slots.Count == 0)
            return null;
        var last = slots.MaxBy(x => x.Date)!;
        return kind switch
        {
            ProgramEndingAlerts.LastWorkout => last.Date,
            ProgramEndingAlerts.LastWeek => last.Date.AddDays(-6),
            ProgramEndingAlerts.LastBlock => slots
                .Where(x => x.BlockId == last.BlockId)
                .Min(x => x.Date),
            // A cycle can run several times in a row: the last run is the last cycle.
            ProgramEndingAlerts.LastCycle => slots
                .Where(x => x.CycleId == last.CycleId && x.Repetition == last.Repetition)
                .Min(x => x.Date),
            _ => null,
        };
    }

    /// <summary>
    /// The alerts to send today. Nothing after the program's last workout day, and nothing whose moment was already
    /// there on the day the program was assigned (a one-block program does not announce its "last block").
    /// </summary>
    public static string[] Due(
        IReadOnlyList<PlannedSlot> slots,
        IEnumerable<string> kinds,
        DateOnly today,
        DateOnly assignedOn
    )
    {
        if (slots.Count == 0 || today > slots.Max(x => x.Date))
            return [];
        return kinds
            .Where(kind => Trigger(slots, kind) is { } at && at <= today && at > assignedOn)
            .ToArray();
    }

    public static string NotificationType(string kind) =>
        kind switch
        {
            ProgramEndingAlerts.LastBlock => "training.ending.last-block",
            ProgramEndingAlerts.LastCycle => "training.ending.last-cycle",
            ProgramEndingAlerts.LastWeek => "training.ending.last-week",
            _ => "training.ending.last-workout",
        };
}
