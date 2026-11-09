using Microsoft.EntityFrameworkCore;
using Metrivum.Coaching.Contracts;
using Metrivum.Notifications.Contracts;
using Metrivum.Training.Infrastructure;
namespace Metrivum.Training.Delivery;

/// <summary>Synchronizes Training state when team membership or client assignments change through module contracts.</summary>
public sealed class TeamTrainingLifecycle(TrainingDbContext db, INotificationPublisher notifications) : ITeamRelationshipLifecycle
{
    public async Task CloseAsync(Guid teamId, Guid[] relationshipIds, Guid actorId, DateTimeOffset effectiveAt, CancellationToken ct)
    {
        var assignments = await db.Set<ProgramAssignment>().Where(x => relationshipIds.Contains(x.RelationshipId) && (x.Status == AssignmentStatus.Active || x.Status == AssignmentStatus.Paused)).OrderBy(x => x.Id).ToArrayAsync(ct);
        foreach (var assignment in assignments)
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({assignment.Id.ToString()}, 507))", ct);
            await db.Entry(assignment).ReloadAsync(ct);
            if (assignment.Status is not (AssignmentStatus.Active or AssignmentStatus.Paused))
                continue;
            var today = DeliveryRules.LocalDate(effectiveAt, assignment.TimeZone);
            await db.Set<WorkoutOccurrence>().Where(x => x.AssignmentId == assignment.Id && !x.Superseded && x.ScheduledDate >= today && !db.Set<WorkoutExecution>().Any(e => e.OccurrenceId == x.Id))
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.Superseded, true), ct);
            assignment.Status = AssignmentStatus.Cancelled;
            assignment.Version++;
            assignment.UpdatedAt = effectiveAt;
            await notifications.CancelScheduledAsync("Training", assignment.Id, ct);
        }
        await db.SaveChangesAsync(ct);
    }
}
