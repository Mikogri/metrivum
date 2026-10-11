using Microsoft.EntityFrameworkCore;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Training.Contracts;
using TrainFlow.Training.Infrastructure;

namespace TrainFlow.Training.Delivery;

internal static class AssignmentRevisionUpdater
{
    public static async Task ApplyAsync(TrainingDbContext db, TrainingRevision revision, IRelationshipAccessPolicy policy, TimeProvider clock, IEnumerable<IAssignedProgramScheduleObserver> observers, CancellationToken ct)
    {
        var assignments = await db.Set<ProgramAssignment>().Where(x => x.ProgramId == revision.PlanId &&
            (x.Status == AssignmentStatus.Active || x.Status == AssignmentStatus.Paused)).OrderBy(x => x.Id).ToArrayAsync(ct);
        if (assignments.Length == 0) return;
        var decisions = new Dictionary<Guid, RelationshipAccessDecision>();
        foreach (var batch in assignments.Select(x => x.RelationshipId).Distinct().Chunk(1000))
            foreach (var decision in await policy.DecideManyAsync(batch, RelationshipOperation.Manage, ct)) decisions.Add(decision.Key, decision.Value);
        foreach (var assignment in assignments)
        {
            if (!decisions.TryGetValue(assignment.RelationshipId, out var decision) || !decision.Allowed || decision.Status != RelationshipStatus.Active) continue;
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({assignment.Id.ToString()}, 507))", ct);
            await db.Entry(assignment).ReloadAsync(ct);
            if (assignment.Status is AssignmentStatus.Active or AssignmentStatus.Paused)
                await RefreshAsync(db, assignment, revision, clock, observers, ct);
        }
    }

    public static async Task RefreshAsync(TrainingDbContext db, ProgramAssignment assignment, TrainingRevision revision, TimeProvider clock, IEnumerable<IAssignedProgramScheduleObserver> observers, CancellationToken ct)
    {
        if (assignment.EffectiveRevisionId == revision.Id) return;
        var today = DeliveryRules.LocalDate(clock.GetUtcNow(), assignment.TimeZone);
        var existing = await db.Set<WorkoutOccurrence>().Where(x => x.AssignmentId == assignment.Id && !x.Superseded).ToArrayAsync(ct);
        var started = await db.Set<WorkoutExecution>().Where(e => db.Set<WorkoutOccurrence>().Any(o => o.Id == e.OccurrenceId && o.AssignmentId == assignment.Id)).Select(e => e.OccurrenceId).ToArrayAsync(ct);
        foreach (var occurrence in existing.Where(x => x.ScheduledDate >= today && !started.Contains(x.Id))) occurrence.Superseded = true;
        // An execution reserves its original workout identity even when structural edits move it.
        var retained = existing.Where(x => !x.Superseded).Select(x => x.WorkoutId).ToHashSet();
        db.AddRange(DeliveryRules.Resolve(assignment, revision).Where(x => x.ScheduledDate >= today && !retained.Contains(x.WorkoutId)));
        assignment.EffectiveRevisionId = revision.Id;
        assignment.ProgramName = revision.Snapshot.Name;
        assignment.Version++;
        assignment.UpdatedAt = clock.GetUtcNow();
        foreach (var observer in observers)
            await observer.ChangedAsync(assignment.CoachId, AssignedProgramCyclesReader.Describe(assignment, revision), ct);
    }
}
