namespace TrainFlow.Coaching.Contracts;

public sealed record RelationshipRecipient(Guid Id, Guid CoachId, Guid WorkspaceId, Guid ClientId, RelationshipStatus Status, Guid? TeamId = null, Guid? TeamClientCaseId = null);

// Trusted workflow contract: callers authorize the coach/recipient operation before calling.
public interface IRelationshipRecipients
{
    Task<IReadOnlyList<RelationshipRecipient>> GetForTeamAsync(Guid teamId, Guid? memberId, CancellationToken ct) => Task.FromResult<IReadOnlyList<RelationshipRecipient>>([]);
    Task<IReadOnlyList<RelationshipRecipient>> ResolveActiveAsync(Guid coachId, Guid workspaceId, IReadOnlyCollection<Guid> relationshipIds, IReadOnlyCollection<Guid> groupIds, CancellationToken ct);
    Task<IReadOnlyList<RelationshipRecipient>> GetForUserAsync(Guid userId, bool coach, CancellationToken ct);
    Task<RelationshipRecipient?> GetAsync(Guid relationshipId, CancellationToken ct);
}
