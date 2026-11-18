using System.Text.Json;
using Metrivum.CheckIns.Domain;
using Metrivum.Training.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.CheckIns.Infrastructure;

/// <summary>Updates plan-relative check-in scheduling after Training publishes assignment-cycle changes.</summary>
public sealed class AssignedProgramScheduleObserver(CheckInsDbContext db, TimeProvider clock)
    : IAssignedProgramScheduleObserver
{
    public async Task ChangedAsync(
        Guid coachId,
        AssignedProgramCycles assignment,
        CancellationToken ct
    )
    {
        // Assignment writers hold the assignment lock before taking schedule locks, as does generation.
        var schedules = await db
            .Schedules.FromSqlInterpolated(
                $"""
                SELECT * FROM checkins."Schedules"
                WHERE "CoachId" = {coachId} AND "Status" <> 'Ended'
                  AND "RecurrenceJson"->>'AssignmentId' = {assignment.AssignmentId.ToString()}
                ORDER BY "Id" FOR UPDATE
                """
            )
            .ToArrayAsync(ct);
        if (schedules.Length == 0)
            return;
        var ids = schedules.Select(s => s.Id).ToArray();
        var lastIssues = await db
            .Requests.AsNoTracking()
            .Where(r => ids.Contains(r.ScheduleId))
            .GroupBy(r => r.ScheduleId)
            .Select(g => new { ScheduleId = g.Key, Latest = g.Max(r => r.AvailableAtUtc) })
            .ToDictionaryAsync(x => x.ScheduleId, x => x.Latest, ct);
        var zone = CheckInRules.Zone(assignment.TimeZone);
        var today = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime
        );
        foreach (var schedule in schedules)
        {
            var recurrence = JsonSerializer.Deserialize<Recurrence>(schedule.RecurrenceJson)!;
            var after = CheckInRules.ToUtc(today, TimeOnly.MinValue, zone).AddTicks(-1);
            if (lastIssues.TryGetValue(schedule.Id, out var latest))
            {
                var lastDate = DateOnly.FromDateTime(
                    TimeZoneInfo.ConvertTime(latest, zone).DateTime
                );
                var end = CheckInRules
                    .ToUtc(lastDate.AddDays(1), TimeOnly.MinValue, zone)
                    .AddTicks(-1);
                if (end > after)
                    after = end;
            }
            schedule.TimeZone = assignment.TimeZone;
            schedule.NextAvailableAtUtc = null;
            schedule.RetryAtUtc = null;
            schedule.LastFailure = null;
            schedule.FailureCount = 0;
            if (assignment.Ended)
                schedule.Status = ScheduleStatus.Ended;
            else if (
                assignment.Cycles.Count == 0
                || recurrence.CycleDays!.Any(day => assignment.Cycles.Any(c => day > c.DayCount))
            )
                schedule.LastFailure =
                    "CYCLE_DAYS_CHANGED: The assigned cycle lengths changed. Edit this schedule to select valid days.";
            else if (assignment.Active)
                schedule.NextAvailableAtUtc = CheckInRules.NextCycle(recurrence, assignment, after);
            schedule.Version++;
            schedule.UpdatedAt = clock.GetUtcNow();
        }
        await db.SaveChangesAsync(ct);
    }
}
