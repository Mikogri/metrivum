namespace TrainFlow.Coaching.Contracts;

// Trusted closure workflow only. IDs identify organizational relationships, never personal ones.
public interface ITeamRelationshipLifecycle
{
    Task CloseAsync(Guid teamId, Guid[] relationshipIds, Guid actorId, DateTimeOffset effectiveAt, CancellationToken ct);
}
