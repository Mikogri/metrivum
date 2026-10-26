using TrainFlow.Access.Contracts;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.VideoAnalysis;

public sealed class CloudAnalysisBudget(IUsageReservations usage, IPlanEntitlementsProvider plans)
{
    public const string Key = "video.cloud_gpu_seconds_per_period";

    public async Task ReserveAsync(Guid owner, Guid? teamId, string operation, long seconds, CancellationToken ct)
    {
        var plan = teamId is { } team ? await plans.GetForTeamAsync(owner, team, ct) : await plans.GetAsync(owner, ct);
        if (!PlanFeaturePolicy.Allows(plan, "video.analysis.cloud"))
            throw new ApiException(403, "feature_not_in_plan", "Cloud analysis requires an active Pro, Team or Studio subscription.");
        await usage.ReserveAsync(owner, Key, operation, seconds, TimeSpan.FromHours(2), ct, teamId);
    }

    public Task SettleAsync(Guid owner, string operation, long seconds, long reserved, Guid jobId, CancellationToken ct)
    {
        if (seconds < 0 || seconds > reserved)
            throw new ApiException(422, "GPU_METER_INVALID", "Measured GPU usage exceeds the authorized budget.");
        return usage.SettleAsync(owner, Key, operation, seconds, ct, "cloud:" + jobId);
    }

    public Task ReleaseAsync(Guid owner, string? operation, CancellationToken ct) =>
        operation == null ? Task.CompletedTask : usage.ReleaseAsync(owner, Key, operation, ct);

    public static void ValidateVideo(long size, CloudVideoMetadata metadata)
    {
        if (size is <= 0 or > 52428800)
            throw new ApiException(422, "MEDIA_SIZE_INVALID", "A video can be at most 50 MB.");
        if (!double.IsFinite(metadata.DurationSeconds) || metadata.DurationSeconds is <= 0 or > 60)
            throw new ApiException(422, "MEDIA_DURATION_INVALID", "A video can be at most 60 seconds.");
    }
}
