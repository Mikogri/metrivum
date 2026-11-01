namespace Metrivum.Coaching.Contracts;

public enum RelationshipStatus
{
    Active, Suspended, Completed
}
public enum ActivationSource
{
    DevFixture, AcceptedApplication, TeamConsent
}
public enum RelationshipOperation
{
    OrganizationalRead, ProtectedRead, ProtectedWrite, Manage, HistoricalSharedRead
}
public sealed record RelationshipAccessDecision(bool Allowed, string Reason, RelationshipStatus? Status);
public interface IRelationshipAccessPolicy
{
    Task<RelationshipAccessDecision> DecideAsync(Guid relationshipId, RelationshipOperation operation, CancellationToken ct);
    Task<IReadOnlyDictionary<Guid, RelationshipAccessDecision>> DecideManyAsync(IReadOnlyCollection<Guid> relationshipIds, RelationshipOperation operation, CancellationToken ct);
}
public interface IRelationshipActivation
{
    // Trusted intake services must establish accepted application ownership before invoking this.
    Task<Guid> ActivateAcceptedApplicationAsync(Guid coachId, Guid clientId, CancellationToken ct);
    Task<Guid> ActivateDevFixtureAsync(Guid coachId, Guid clientId, CancellationToken ct);
}
