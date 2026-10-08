using Microsoft.EntityFrameworkCore;
using TrainFlow.Calendar.Domain;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Notifications.Contracts;
namespace TrainFlow.Calendar.Infrastructure;

public sealed class TeamCalendarLifecycle(CalendarDbContext db, INotificationPublisher notifications) : ITeamRelationshipLifecycle
{
    public async Task CloseAsync(Guid teamId, Guid[] relationshipIds, Guid actorId, DateTimeOffset effectiveAt, CancellationToken ct)
    {
        var ids = await db.Events.Where(x => x.TeamId == teamId && !x.Cancelled && x.StartsAtUtc >= effectiveAt
            && db.Attendees.Any(a => a.EventId == x.Id && relationshipIds.Contains(a.RelationshipId))).Select(x => x.Id).Order().ToArrayAsync(ct);
        foreach (var id in ids)
        {
            var item = (await db.Events.FromSqlInterpolated($"SELECT * FROM calendar.\"Events\" WHERE \"Id\"={id} FOR UPDATE").ToArrayAsync(ct)).Single();
            await db.Entry(item).ReloadAsync(ct);
            if (item.Cancelled || item.StartsAtUtc < effectiveAt)
                continue;
            item.Cancelled = true;
            item.Version++;
            db.Audit.Add(new CalendarAudit { EventId = id, ActorId = actorId, Action = "TeamRelationshipEnded", At = effectiveAt });
            await notifications.CancelScheduledAsync("Calendar", id, ct);
            foreach (var client in await db.Attendees.Where(x => x.EventId == id).Select(x => x.ClientId).Distinct().ToArrayAsync(ct))
                await notifications.PublishAsync(new(client, $"team-calendar-ended:{id}:{item.Version}", "CalendarCancelled", "System", "Calendar", id, "/app/calendar"), ct);
        }
        await db.SaveChangesAsync(ct);
    }
}
