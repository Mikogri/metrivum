namespace Metrivum.Access.Contracts;

public interface ILimitUsageProvider
{
    Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken);
    Task<IReadOnlyList<LimitDecision>> GetScopedUsageAsync(Guid ownerId, Guid? teamId, CancellationToken ct) =>
        teamId == null ? GetUsageAsync(ownerId, ct) : Task.FromResult<IReadOnlyList<LimitDecision>>([]);
}
