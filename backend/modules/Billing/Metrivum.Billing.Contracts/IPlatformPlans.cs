namespace Metrivum.Billing.Contracts;

/// <summary>Whether an account currently has the paid platform plan (its own Pro or Team, or an active Team seat).</summary>
public interface IPlatformPlans
{
    Task<bool> HasProAsync(Guid userId, CancellationToken ct);
    Task<IReadOnlySet<Guid>> GetPriorityCoachIdsAsync(IReadOnlyCollection<Guid> userIds, CancellationToken ct)
        => Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());
}
