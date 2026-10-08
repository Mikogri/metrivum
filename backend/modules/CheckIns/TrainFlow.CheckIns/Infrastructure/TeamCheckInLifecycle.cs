using Microsoft.EntityFrameworkCore;
using TrainFlow.CheckIns.Domain;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Notifications.Contracts;
namespace TrainFlow.CheckIns.Infrastructure;

public sealed class TeamCheckInLifecycle(CheckInsDbContext db, INotificationPublisher notifications) : ITeamRelationshipLifecycle
{
    public async Task CloseAsync(Guid teamId, Guid[] relationshipIds, Guid actorId, DateTimeOffset effectiveAt, CancellationToken ct)
    {
        if (relationshipIds.Length == 0)
            return;
        var scheduleIds = await db.Targets.Where(x => !x.IsGroup && relationshipIds.Contains(x.TargetId)).Select(x => x.ScheduleId)
            .Union(db.Requests.Where(x => relationshipIds.Contains(x.RelationshipId)).Select(x => x.ScheduleId)).Distinct().Order().ToArrayAsync(ct);
        foreach (var id in scheduleIds)
        {
            var schedule = (await db.Schedules.FromSqlInterpolated($"SELECT * FROM checkins.\"Schedules\" WHERE \"Id\"={id} FOR UPDATE").ToArrayAsync(ct)).Single();
            await db.Entry(schedule).ReloadAsync(ct);
            var targets = await db.Targets.AsNoTracking().Where(x => x.ScheduleId == id).ToArrayAsync(ct);
            // Mixed or group schedules retain their other clients; recipient resolution excludes ended relationships.
            if (targets.Length > 0 && targets.All(x => !x.IsGroup && relationshipIds.Contains(x.TargetId)) && schedule.Status != ScheduleStatus.Ended)
            {
                schedule.Status = ScheduleStatus.Ended;
                schedule.NextAvailableAtUtc = null;
                schedule.RetryAtUtc = null;
                schedule.Version++;
                schedule.UpdatedAt = effectiveAt;
            }
        }
        var requests = await db.Requests.Where(x => relationshipIds.Contains(x.RelationshipId) && x.Status == RequestStatus.Scheduled).OrderBy(x => x.Id).ToArrayAsync(ct);
        foreach (var request in requests)
        {
            // The row lock serializes closure with submission and preserves completed responses.
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM checkins.\"Requests\" WHERE \"Id\"={request.Id} FOR UPDATE", ct);
            await db.Entry(request).ReloadAsync(ct);
            if (request.Status != RequestStatus.Scheduled)
                continue;
            request.Status = RequestStatus.Cancelled;
            request.CancelledAt = effectiveAt;
            request.CancelledBy = actorId;
            request.Version++;
            await notifications.CancelScheduledAsync("CheckIns", request.Id, ct);
        }
        await db.SaveChangesAsync(ct);
    }
}
