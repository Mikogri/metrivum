using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Contracts;
using TrainFlow.Access.Domain;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Access.Infrastructure;

public sealed class FeatureAccessService(AccessDbContext db, FeatureCatalog catalog, IAccountContext account,
    IEnumerable<ILimitUsageProvider> usageProviders) : IFeatureAccessService
{
    public async Task RequireAsync(string key, CancellationToken cancellationToken)
    {
        var snapshot = await EvaluateAsync(false, cancellationToken);
        var decision = snapshot.Features.SingleOrDefault(x => x.Key == key);
        if (decision is not { Available: true })
            throw new ApiException(403, "FEATURE_UNAVAILABLE", $"Feature '{key}' is unavailable: {decision?.Reason ?? "unknown_feature"}.");
        // Resource reservations enforce quotas under their own DB transaction, not in this advisory snapshot.
    }

    public Task<AccessSnapshot> GetAsync(CancellationToken cancellationToken) => EvaluateAsync(true, cancellationToken);

    private async Task<AccessSnapshot> EvaluateAsync(bool includeUsage, CancellationToken cancellationToken)
    {
        var identity = await account.RequireCoachAsync(cancellationToken);
        var assignment = await db.Assignments.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == identity.UserId, cancellationToken);
        var configuration = await db.Configurations.AsNoTracking().SingleOrDefaultAsync(x => x.Id == (assignment == null ? "v1-default" : assignment.ConfigurationId), cancellationToken);
        var overrides = await db.Overrides.AsNoTracking().Where(x => x.UserId == identity.UserId).OrderBy(x => x.Key).ToArrayAsync(cancellationToken);
        var flags = await db.Flags.AsNoTracking().OrderBy(x => x.Key).ToArrayAsync(cancellationToken);
        var grants = (configuration?.GrantedFeatures ?? []).Concat(overrides.Where(x => x.Granted).Select(x => x.Key)).ToHashSet(StringComparer.Ordinal);
        var denies = overrides.Where(x => !x.Granted).Select(x => x.Key).ToArray();
        var disabled = flags.Where(x => !x.Enabled).Select(x => x.Key).ToArray();
        var features = catalog.Definitions.Keys.Order(StringComparer.Ordinal).Select(key => catalog.Decide(key, grants, denies, disabled)).ToArray();
        var limits = new List<LimitDecision>();
        if (includeUsage)
        {
            foreach (var provider in usageProviders)
                limits.AddRange(await provider.GetUsageAsync(identity.UserId, cancellationToken));
            features = features.Select(decision => decision.Available && catalog.Definitions[decision.Key].Limits.Any(key =>
                limits.Any(limit => limit.Key == key && limit.Used >= limit.Maximum))
                ? new FeatureDecision(decision.Key, false, "limit_reached") : decision).ToArray();
        }
        var versionInput = JsonSerializer.Serialize(new
        {
            identity.UserId,
            identity.WorkspaceId,
            configuration,
            assignment,
            overrides,
            flags,
            catalog = catalog.Definitions.Values.OrderBy(x => x.Key),
            features,
            limits
        });
        return new(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(versionInput))), features, limits);
    }
}
