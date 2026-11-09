using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Contracts;
using Metrivum.Coaching.Contracts;
using Metrivum.Notifications.Contracts;
namespace Metrivum.Calendar.Infrastructure;

/// <summary>Resolves permitted recipients and visibility of Calendar notifications before delivery.</summary>
public sealed class CalendarNotificationPolicy(CalendarDbContext db, IRelationshipRecipients relationships, ITeamContext? teams = null) : INotificationDeliveryPolicy
{
    public string SourceModule => "Calendar";
    public async Task<bool> CanDeliverAsync(NotificationEvent notification, CancellationToken ct)
    {
        var item = await db.Events.AsNoTracking().SingleOrDefaultAsync(x => x.Id == notification.SourceId, ct);
        if (item == null)
            return false;
        var attendee = await db.Attendees.AsNoTracking().SingleOrDefaultAsync(x => x.EventId == item.Id && x.ClientId == notification.RecipientUserId, ct);
        if (item.CoachId != notification.RecipientUserId && attendee == null)
            return false;
        if (item.TeamId == null)
            return true;
        if (notification.Type == "CalendarCancelled" && attendee != null)
            return true;
        if (item.Cancelled || teams == null)
            return false;
        var team = await teams.GetForUserAsync(item.CoachId, ct);
        if (team is not { IsActive: true } || team.TeamId != item.TeamId)
            return false;
        if (attendee == null)
            return true;
        var relationship = await relationships.GetAsync(attendee.RelationshipId, ct);
        return relationship?.TeamId == item.TeamId && relationship.Status == RelationshipStatus.Active;
    }
}
