using System.Collections.Frozen;

namespace TrainFlow.Billing.Contracts;

public sealed record PlanDefinition(string Id, decimal MonthlyPriceEur, int CoachSeats, int ActiveClients,
    int GeneratorRunsPerPeriod, long? LocalAnalysesPerPeriod, long CloudGpuSecondsPerPeriod)
{
    public string Name => Id;
    public bool IsWorkspace => Id is "Team" or "Studio";
    public bool IsProfessional => Id is "Pro" or "Team" or "Studio";
    /// <summary>
    /// Rank within the plan's own kind (personal account or workspace), from 1 upwards in catalog order; the highest
    /// tier of a kind has nothing to upgrade to. Personal and workspace tiers are separate ladders.
    /// </summary>
    public int Tier => PlanCatalog.All.Where(p => p.IsWorkspace == IsWorkspace).Select(p => p.Id).ToList().IndexOf(Id) + 1;
    /// <summary>The highest tier of this plan's kind.</summary>
    public int TopTier => PlanCatalog.All.Count(p => p.IsWorkspace == IsWorkspace);
    public IReadOnlySet<string> PremiumFeatures => IsProfessional
        ? (IsWorkspace ? PlanCatalog.WorkspaceFeatures : PlanCatalog.ProfessionalFeatures) : FrozenSet<string>.Empty;
    public IReadOnlyDictionary<string, long?> Limits => new Dictionary<string, long?>
    {
        ["coaching.active_clients"] = ActiveClients,
        ["organization.coach_seats"] = CoachSeats,
        ["training.generator.runs_per_period"] = GeneratorRunsPerPeriod,
        ["video.local_analyses_per_period"] = LocalAnalysesPerPeriod,
        ["video.cloud_gpu_seconds_per_period"] = CloudGpuSecondsPerPeriod,
        ["training.programs_and_templates.max"] = 1000,
        ["training.folders.max"] = 1000,
        ["training.custom_formulas.max"] = IsProfessional ? 500 : 0,
        ["video.max_duration_seconds"] = 60,
        ["video.max_upload_bytes"] = 50 * 1024 * 1024,
        ["video.max_concurrent_uploads"] = 3,
        ["video.max_concurrent_analyses"] = 2
    }.ToFrozenDictionary();
}

/// <summary>Server-owned monthly EUR prices and business allowances. Null is an unlimited business allowance.</summary>
public static class PlanCatalog
{
    /// <summary>Plans are always priced and charged in euro.</summary>
    public const string Currency = "EUR";
    public const decimal ServiceCommissionRate = 0.10m;
    public const string TermsVersion = "simulated-plans-v2";
    public static string PriceVersion(string planId) => "eur-monthly-v3-" + Get(planId).Id;
    public static readonly IReadOnlySet<string> ProfessionalFeatures = new[]
    {
        "training.builder.advanced", "training.export.pdf", "training.export.csv", "training.import.csv",
        "training.formulas.custom", "training.sets.advanced", "exercises.custom.create", "video.analysis.cloud",
        "analytics.advanced", "automation.advanced", "discovery.ranking.priority",
        "integrations.mcp.manage-checkins", "integrations.mcp.prepare-message",
        "integrations.mcp.send-approved-message", "integrations.mcp.write-training-drafts"
    }.ToFrozenSet(StringComparer.Ordinal);
    public static readonly IReadOnlySet<string> WorkspaceFeatures = ProfessionalFeatures
        .Append("organization.workspace.manage").ToFrozenSet(StringComparer.Ordinal);
    public static readonly IReadOnlyList<PlanDefinition> All = Array.AsReadOnly(new[]
    {
        new PlanDefinition("Free", 0, 1, 3, 3, 2, 0),
        new PlanDefinition("Starter", 9, 1, 8, 15, 5, 0),
        new PlanDefinition("Pro", 24, 1, 60, 500, null, 7200),
        new PlanDefinition("Team", 69, 3, 200, 2000, null, 30000),
        new PlanDefinition("Studio", 159, 10, 600, 5000, null, 90000)
    });
    public static PlanDefinition Get(string id) => All.Single(p => p.Id == id);
    public static bool Contains(string id) => All.Any(p => p.Id == id);
    public static (DateTimeOffset Start, DateTimeOffset End) FreePeriod(DateTimeOffset now)
    {
        var utc = now.ToUniversalTime();
        var start = new DateTimeOffset(utc.Year, utc.Month, 1, 0, 0, 0, TimeSpan.Zero);
        return (start, start.AddMonths(1));
    }
}
