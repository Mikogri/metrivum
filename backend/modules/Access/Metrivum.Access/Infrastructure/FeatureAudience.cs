using Metrivum.Access.Contracts;
using Metrivum.Access.Domain;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Access.Infrastructure;

/// <summary>Defines which business roles can use each feature; evaluates audience rules without granting administrative roles.</summary>
public sealed class FeatureAudience(
    AccessDbContext db,
    FeatureCatalog catalog,
    IAccountDirectory directory
) : IFeatureAudience
{
    public async Task<IReadOnlySet<Guid>> GetAllowedUsersAsync(
        IReadOnlyCollection<Guid> userIds,
        string key,
        CancellationToken ct
    )
    {
        if (userIds.Count > 10000)
            throw ApiException.Invalid("Recipient batch exceeds the supported limit.");
        var ids = userIds.Distinct().ToArray();
        var people = await directory.GetAccountsAsync(ids, ct);
        var assignments = await db
            .Assignments.AsNoTracking()
            .Where(x => ids.Contains(x.UserId))
            .ToDictionaryAsync(x => x.UserId, ct);
        var configurationIds = assignments
            .Values.Select(x => x.ConfigurationId)
            .Append("v1-default")
            .Distinct()
            .ToArray();
        var configurations = await db
            .Configurations.AsNoTracking()
            .Where(x => configurationIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var overrides = await db
            .Overrides.AsNoTracking()
            .Where(x => ids.Contains(x.UserId))
            .ToArrayAsync(ct);
        var disabled = await db
            .Flags.AsNoTracking()
            .Where(x => !x.Enabled)
            .Select(x => x.Key)
            .ToArrayAsync(ct);
        return ids.Where(id =>
            {
                if (
                    !people.TryGetValue(id, out var person)
                    || !FeatureAccessService.RoleAllows(key, person.Roles)
                )
                    return false;
                var configuration = configurations.GetValueOrDefault(
                    assignments.GetValueOrDefault(id)?.ConfigurationId ?? "v1-default"
                );
                var own = overrides.Where(x => x.UserId == id).ToArray();
                var grants = (configuration?.GrantedFeatures ?? [])
                    .Concat(own.Where(x => x.Granted).Select(x => x.Key))
                    .ToHashSet(StringComparer.Ordinal);
                return catalog
                    .Decide(
                        key,
                        grants,
                        own.Where(x => !x.Granted).Select(x => x.Key).ToArray(),
                        disabled
                    )
                    .Available;
            })
            .ToHashSet();
    }
}
