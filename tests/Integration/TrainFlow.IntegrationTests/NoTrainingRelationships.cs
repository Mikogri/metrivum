using TrainFlow.Coaching.Contracts;
namespace TrainFlow.IntegrationTests;
internal sealed class NoTrainingRelationships : IRelationshipAccessPolicy
{
    public Task<RelationshipAccessDecision> DecideAsync(Guid id, RelationshipOperation operation, CancellationToken ct) => Task.FromResult(new RelationshipAccessDecision(false, "NO_RELATIONSHIP", null));
    public Task<IReadOnlyDictionary<Guid, RelationshipAccessDecision>> DecideManyAsync(IReadOnlyCollection<Guid> ids, RelationshipOperation operation, CancellationToken ct) => Task.FromResult<IReadOnlyDictionary<Guid, RelationshipAccessDecision>>(ids.ToDictionary(id => id, _ => new RelationshipAccessDecision(false, "NO_RELATIONSHIP", null)));
}
