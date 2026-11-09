using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Contracts;
using Metrivum.CheckIns.Domain;
using Metrivum.CheckIns.Infrastructure;
using Metrivum.Coaching.Contracts;
using Metrivum.Notifications.Contracts;
namespace Metrivum.CheckIns.Features;

/// <summary>Resolves permitted recipients and visibility of CheckIns notifications before delivery.</summary>
public sealed class CheckInNotificationPolicy(CheckInsDbContext db, IRelationshipRecipients recipients, ITeamContext? teams = null) : INotificationDeliveryPolicy
{
    public string SourceModule => "CheckIns";
    public async Task<bool> CanDeliverAsync(NotificationEvent notification, CancellationToken ct)
    {
        var request = await db.Requests.AsNoTracking().SingleOrDefaultAsync(x => x.Id == notification.SourceId, ct);
        if (request == null || notification.RecipientUserId != request.ClientId && notification.RecipientUserId != request.CoachId)
            return false;
        var relationship = await recipients.GetAsync(request.RelationshipId, ct);
        if (relationship?.TeamId is { } teamId)
        {
            var team = teams == null ? null : await teams.GetForUserAsync(relationship.CoachId, ct);
            if (team is not { IsActive: true } || team.TeamId != teamId || relationship.Status != RelationshipStatus.Active)
                return false;
            if (!(await recipients.GetForUserAsync(relationship.CoachId, true, ct)).Any(x => x.Id == relationship.Id))
                return false;
        }
        if (notification.Type is not ("CheckInAvailable" or "CheckInDueSoon" or "CheckInOverdue"))
            return true;
        return notification.RecipientUserId == request.ClientId && request.Status == RequestStatus.Scheduled && relationship?.Status == RelationshipStatus.Active;
    }
}
