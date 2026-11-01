namespace Metrivum.Access.Contracts;

// Trusted delivery services recheck recipient entitlements without impersonating their HTTP identity.
public interface IFeatureAudience
{
    Task<IReadOnlySet<Guid>> GetAllowedUsersAsync(IReadOnlyCollection<Guid> userIds, string key, CancellationToken ct);
}
