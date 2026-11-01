namespace Metrivum.Access.Contracts;

public sealed record PlanEntitlements(string PlanId, Guid ScopeId, DateTimeOffset PeriodStart, DateTimeOffset PeriodEnd,
    IReadOnlySet<string> PremiumFeatures, IReadOnlyDictionary<string, long?> Limits);

public interface IPlanEntitlementsProvider
{
    Task<PlanEntitlements> GetAsync(Guid userId, CancellationToken ct);
    Task<PlanEntitlements> GetForTeamAsync(Guid userId, Guid teamId, CancellationToken ct);
    Task<PlanEntitlements> GetForFeaturesAsync(Guid userId, CancellationToken ct) => GetAsync(userId, ct);
}

public static class PlanFeaturePolicy
{
    public static readonly IReadOnlySet<string> PremiumKeys = new HashSet<string>(StringComparer.Ordinal)
    {
        "training.builder.advanced", "training.export.pdf", "training.export.csv", "training.import.csv",
        "training.formulas.custom", "training.sets.advanced", "exercises.custom.create",
        "exercises.create", "video.analysis.cloud", "analytics.advanced", "automation.advanced",
        "integrations.mcp.manage-checkins", "integrations.mcp.prepare-message", "integrations.mcp.send-approved-message",
        "integrations.mcp.write-training-drafts", "discovery.ranking.priority", "organization.workspace.manage"
    };

    public static string Canonical(string key) => key switch
    {
        "exercises.create" => "exercises.custom.create",
        _ => key
    };
    public static bool Allows(PlanEntitlements plan, string key) => !PremiumKeys.Contains(key)
        || (key == "organization.workspace.manage" ? plan.PlanId is "Team" or "Studio" : plan.PremiumFeatures.Contains(Canonical(key)));
}

public sealed record UsageReceipt(Guid Id, string Key, string Status, long Reserved, long? Maximum, DateTimeOffset ResetAt);
public interface IUsageReservations
{
    Task<UsageReceipt> ReserveAsync(Guid owner, string key, string operation, long amount, TimeSpan lifetime, CancellationToken ct, Guid? teamId = null);
    Task SettleAsync(Guid owner, string key, string operation, long amount, CancellationToken ct, string? consumer = null);
    Task ReleaseAsync(Guid owner, string key, string operation, CancellationToken ct);
}
