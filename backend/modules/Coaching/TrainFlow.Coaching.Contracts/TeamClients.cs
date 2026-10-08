namespace TrainFlow.Coaching.Contracts;

// Trusted Team lifecycle calls run within the caller's existing module transaction.
public interface ITeamLifecycle
{
    Task CheckDissolutionAsync(Guid teamId, CancellationToken ct);
    Task EndAsync(Guid teamId, CancellationToken ct);
    Task RemoveCoachAsync(Guid teamId, Guid userId, CancellationToken ct);
}

public sealed record TeamCaseAccessDecision(bool Allowed, bool Administrative, bool Assigned, string Status);
public interface ITeamCaseAccess
{
    Task<TeamCaseAccessDecision> DecideAsync(Guid teamClientCaseId, Guid actorId, bool write, CancellationToken ct);
}

public sealed record TeamClientCaseDto(Guid Id, Guid TeamId, Guid ClientId, string ClientName,
    string Status, DateTimeOffset CreatedAt, long Version, Guid[] AssignedCoachIds, string[] AllowedActions, Guid? RelationshipId = null);
public sealed record TeamClientTransferDto(Guid Id, Guid TeamId, string TeamName, Guid RelationshipId,
    Guid ClientId, Guid ProposedBy, string ProposerName, string Status, string ConsentVersion, string ConsentText,
    DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, long Version, string[] AllowedActions);
public sealed record RequestTeamTransfer(Guid RelationshipId);
public sealed record TeamConsentDecision(long Version);
public sealed record AssignTeamCoach(Guid CoachId, long Version);
