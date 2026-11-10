using Metrivum.Accounts.Contracts;
using Metrivum.Coaching.Contracts;
using Metrivum.Notifications.Contracts;
using Metrivum.Training.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Training.Delivery;

/// <summary>Resolves permitted recipients and visibility of Training notifications before delivery.</summary>
public sealed class TrainingNotificationPolicy(
    TrainingDbContext db,
    IRelationshipRecipients relationships,
    ITeamContext? teams = null
) : INotificationDeliveryPolicy
{
    public string SourceModule => "Training";

    public async Task<bool> CanDeliverAsync(NotificationEvent notification, CancellationToken ct)
    {
        var assignment = await db.Set<ProgramAssignment>()
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == notification.SourceId, ct);
        if (assignment == null)
            return false;
        var relationship = await relationships.GetAsync(assignment.RelationshipId, ct);
        if (relationship?.TeamId is { } teamId)
        {
            var team = teams == null ? null : await teams.GetForUserAsync(relationship.CoachId, ct);
            if (
                team is not { IsActive: true }
                || team.TeamId != teamId
                || relationship.Status != RelationshipStatus.Active
                || assignment.Status != AssignmentStatus.Active
            )
                return false;
            var assigned = await relationships.GetForUserAsync(relationship.CoachId, true, ct);
            if (!assigned.Any(x => x.Id == relationship.Id))
                return false;
        }
        return relationship != null
            && (
                notification.RecipientUserId == relationship.CoachId
                || notification.RecipientUserId == relationship.ClientId
                    && relationship.Status == RelationshipStatus.Active
                    && assignment.Status == AssignmentStatus.Active
            );
    }
}
