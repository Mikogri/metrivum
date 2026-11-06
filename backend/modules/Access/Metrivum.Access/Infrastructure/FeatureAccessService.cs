using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Diagnostics.Metrics;
using Microsoft.EntityFrameworkCore;
using Metrivum.Access.Contracts;
using Metrivum.Access.Domain;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;

namespace Metrivum.Access.Infrastructure;

public sealed class FeatureAccessService : IFeatureAccessService
{
    private static readonly Counter<long> Denials = new Meter("Metrivum.Access").CreateCounter<long>("metrivum.feature.denied");
    private readonly AccessDbContext db;
    private readonly FeatureCatalog catalog;
    private readonly IAccountContext account;
    private readonly IEnumerable<ILimitUsageProvider> usageProviders;
    private readonly IPlanEntitlementsProvider? plans;
    private Policy? policy;
    private Guid? policyTransactionId;

    public FeatureAccessService(AccessDbContext db, FeatureCatalog catalog, IAccountContext account,
        IEnumerable<ILimitUsageProvider> usageProviders, IPlanEntitlementsProvider? plans = null)
    {
        this.db = db;
        this.catalog = catalog;
        this.account = account;
        this.usageProviders = usageProviders;
        this.plans = plans;
        // Policy snapshots are scoped to the request/transaction boundary; local writes invalidate them.
        db.SavedChanges += (_, _) => policy = null;
    }

    public async Task RequireAsync(string key, CancellationToken cancellationToken)
    {
        var snapshot = await EvaluateAsync(false, cancellationToken);
        var decision = snapshot.Features.SingleOrDefault(x => x.Key == key);
        if (decision is not { Available: true })
        {
            Denials.Add(1, new KeyValuePair<string, object?>("feature", catalog.Definitions.ContainsKey(key) ? key : "unknown"),
                new KeyValuePair<string, object?>("reason", decision?.Reason ?? "unknown_feature"));
            throw new ApiException(403, decision?.Reason == "feature_not_in_plan" ? "FEATURE_NOT_IN_PLAN" : "FEATURE_UNAVAILABLE", $"Feature '{key}' is unavailable: {decision?.Reason ?? "unknown_feature"}.",
                decision?.Reason == "feature_not_in_plan" ? new Dictionary<string, string[]> { ["feature"] = [key], ["requiredPlan"] = [key == "organization.workspace.manage" ? "Team" : "Pro"], ["currentPlan"] = [snapshot.PlanId ?? "Free"] } : null);
        }
        // Resource reservations enforce quotas under their own DB transaction, not in this advisory snapshot.
    }

    public Task<AccessSnapshot> GetAsync(CancellationToken cancellationToken) => EvaluateAsync(true, cancellationToken);

    internal static bool RoleAllows(string key, IReadOnlyList<AccountRole> roles) => key switch
    {
        // Training content operations still require owner-scoped resource authorization.
        "training.programs.read" or "training.programs.manage" or "training.sets.advanced" or "training.export.csv" or "training.export.pdf" or
        "exercises.browse" or "messaging.direct" or "messaging.groups" or "messaging.attachments" or "messaging.voice" or "messaging.report" or "messaging.group.manage" or "offers.view-public" or "discovery.coaches.search" or "video.analysis.local" => roles.Contains(AccountRole.Client) || roles.Contains(AccountRole.Coach),
        "coaching.relationships.read-own" or "coaching.applications.submit-own" or
        "coaching.invitations.respond-own" or "coaching.services.read-own" or
        "calendar.events.read-own" or "calendar.invitations.respond-own" or "checkins.respond-own" or "billing.read-own" or "billing.pay-own" or
        "training.executions.log-own" or "training.progress.view-own" or "coaching.documentation.view-shared" => roles.Contains(AccountRole.Client),
        _ => roles.Contains(AccountRole.Coach)
    };

    private async Task<AccessSnapshot> EvaluateAsync(bool includeUsage, CancellationToken cancellationToken)
    {
        var roles = await account.GetRolesAsync(cancellationToken);
        var userId = account.UserId;
        var current = await GetPolicyAsync(userId, cancellationToken);
        var assignment = current.Assignment;
        var configuration = current.Configuration;
        var overrides = current.Overrides;
        var flags = current.Flags;
        var grants = (configuration?.GrantedFeatures ?? []).Concat(overrides.Where(x => x.Granted).Select(x => x.Key)).ToHashSet(StringComparer.Ordinal);
        var denies = overrides.Where(x => !x.Granted).Select(x => x.Key).ToArray();
        var disabled = flags.Where(x => !x.Enabled).Select(x => x.Key).ToArray();
        var features = catalog.Definitions.Keys.Order(StringComparer.Ordinal).Select(key => RoleAllows(key, roles) ? catalog.Decide(key, grants, denies, disabled) : new FeatureDecision(key, false, "role_required")).ToArray();
        var entitlements = plans == null ? null : await plans.GetForFeaturesAsync(userId, cancellationToken);
        if (entitlements != null)
            features = features.Select(x => x.Available && !PlanFeaturePolicy.Allows(entitlements, x.Key)
                ? x with { Available = false, Reason = "feature_not_in_plan" } : x).ToArray();
        var limits = new List<LimitDecision>();
        if (includeUsage && roles.Contains(AccountRole.Coach))
        {
            foreach (var provider in usageProviders)
                limits.AddRange(await provider.GetUsageAsync(userId, cancellationToken));
            features = features.Select(decision => decision.Available && catalog.Definitions[decision.Key].Limits.Any(key =>
                limits.Any(limit => limit.Key == key && limit.Maximum is {} maximum && limit.Used >= maximum))
                ? new FeatureDecision(decision.Key, false, "limit_reached") : decision).ToArray();
        }
        if (!includeUsage)
            return new("", features, limits, entitlements?.PlanId);
        var versionInput = JsonSerializer.Serialize(new
        {
            userId,
            roles,
            configuration,
            assignment,
            overrides,
            flags,
            plan = entitlements == null ? null : new { entitlements.PlanId, entitlements.ScopeId, entitlements.PeriodStart, entitlements.PeriodEnd },
            catalog = catalog.Definitions.Values.OrderBy(x => x.Key),
            features,
            limits
        });
        return new(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(versionInput))), features, limits, entitlements?.PlanId);
    }

    private async Task<Policy> GetPolicyAsync(Guid userId, CancellationToken cancellationToken)
    {
        var transactionId = db.Database.CurrentTransaction?.TransactionId;
        if (policy is not null && policyTransactionId == transactionId)
            return policy;
        // A mutation's inner check must not reuse preflight permissions after waiting for its lock.
        var json = await db.Database.SqlQuery<string>($"""
            SELECT jsonb_build_object(
                'Configuration', (SELECT to_jsonb(c) FROM access.configurations c WHERE c."Id" =
                    COALESCE((SELECT a."ConfigurationId" FROM access.assignments a WHERE a."UserId" = {userId}), 'v1-default')),
                'Assignment', (SELECT to_jsonb(a) FROM access.assignments a WHERE a."UserId" = {userId}),
                'Overrides', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o."Key") FROM access.overrides o WHERE o."UserId" = {userId}), '[]'::jsonb),
                'Flags', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f."Key") FROM access.flags f), '[]'::jsonb)
            )::text AS "Value"
            """).SingleAsync(cancellationToken);
        policyTransactionId = transactionId;
        return policy = JsonSerializer.Deserialize<Policy>(json)
            ?? throw new InvalidOperationException("Access policy query returned no policy.");
    }

    private sealed record Policy(AccessConfiguration? Configuration, AccessAssignment? Assignment,
        FeatureOverride[] Overrides, FeatureFlag[] Flags);
}
