using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;

namespace Metrivum.VideoAnalysis;

public sealed record LocalAnalysisPermitRequest(
    Guid LocalAnalysisId,
    double DurationSeconds,
    Guid? TeamId = null
);

/// <summary>Reserves and releases authorization for local analysis jobs and result synchronization.</summary>
public sealed class LocalAnalysisAuthorization(
    IUsageReservations usage,
    IFeatureAccessService features,
    IAccountContext account
)
{
    public async Task<UsageReceipt> AuthorizeAsync(
        LocalAnalysisPermitRequest input,
        CancellationToken ct
    )
    {
        await account.GetRolesAsync(ct);
        await features.RequireAsync("video.analysis.local", ct);
        if (
            input.LocalAnalysisId == Guid.Empty
            || !double.IsFinite(input.DurationSeconds)
            || input.DurationSeconds is <= 0 or > 60
        )
            throw ApiException.Invalid("A local analysis requires a video of at most 60 seconds.");
        return await usage.ReserveAsync(
            account.UserId,
            "video.local_analyses_per_period",
            input.LocalAnalysisId.ToString(),
            1,
            TimeSpan.FromHours(2),
            ct,
            input.TeamId
        );
    }

    public async Task ReleaseAsync(Guid id, CancellationToken ct)
    {
        await account.GetRolesAsync(ct);
        await usage.ReleaseAsync(
            account.UserId,
            "video.local_analyses_per_period",
            id.ToString(),
            ct
        );
    }
}

/// <summary>Only a trusted worker adapter may register this after implementing measured GPU billing.
/// Source video duration and client reports are never a GPU meter.</summary>
public interface ICloudGpuMeter
{
    bool IsConfigured { get; }
    Task<CloudVideoMetadata> InspectVideoAsync(Stream source, CancellationToken ct);

    // Measure actual device execution (synchronized GPU work), not source duration or queue/wall time.
    // The adapter must stop device work before this cap is exceeded.
    Task<CloudGpuExecution> ExecuteAsync(
        Stream source,
        AnalysisConfiguration configuration,
        long maximumGpuSeconds,
        CancellationToken ct
    );
}

public sealed record CloudVideoMetadata(double DurationSeconds);

public sealed record CloudGpuExecution(AnalysisResult Result, long GpuSeconds);
