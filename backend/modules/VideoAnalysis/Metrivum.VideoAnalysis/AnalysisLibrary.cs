using System.Linq.Expressions;
using System.Security.Cryptography;
using System.Text.Json;
using System.Transactions;
using Metrivum.BuildingBlocks;
using Metrivum.Media.Contracts;
using Metrivum.VideoAnalysis.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Metrivum.VideoAnalysis;

/// <summary>Reads and changes authorized saved video analyses, including result metadata and retention state.</summary>
public sealed class AnalysisLibrary(
    VideoAnalysisDbContext db,
    IMediaLibrary media,
    IVideoAnalyzer analyzer,
    IOptions<AnalysisOptions> configured,
    ICloudGpuMeter? gpuMeter = null,
    ModuleTransaction? transaction = null,
    CloudAnalysisBudget? cloudBudget = null
)
{
    private readonly AnalysisOptions options = configured.Value;
    private static readonly Expression<Func<AnalysisJob, AnalysisJob>> Metadata =
        x => new AnalysisJob
        {
            Id = x.Id,
            Name = x.Name,
            Note = x.Note,
            Tags = x.Tags,
            MediaId = x.MediaId,
            Configuration = x.Configuration,
            Status = x.Status,
            CreatedAt = x.CreatedAt,
            CompletedAt = x.CompletedAt,
            FailureCode = x.FailureCode,
            Attempts = x.Attempts,
            Version = x.Version,
            RequestHash = x.RequestHash,
            ExecutionLocation = x.ExecutionLocation,
            LocalAnalysisId = x.LocalAnalysisId,
            SourceVideo = x.SourceVideo,
            WorkoutExecutionId = x.WorkoutExecutionId,
            SetId = x.SetId,
            TeamId = x.TeamId,
            CloudBudgetOperation = x.CloudBudgetOperation,
            CloudBudgetSeconds = x.CloudBudgetSeconds,
        };

    internal static AnalysisDto Dto(AnalysisJob job) =>
        new(
            job.Id,
            job.Name,
            job.Note,
            job.Tags,
            job.MediaId,
            JsonSerializer.Deserialize<AnalysisConfiguration>(
                job.Configuration,
                AnalysisResults.Json
            )!,
            job.Status,
            job.CreatedAt,
            job.CompletedAt,
            job.FailureCode,
            job.Attempts,
            job.Version,
            job.ExecutionLocation,
            job.LocalAnalysisId,
            job.SourceVideo == null
                ? null
                : JsonSerializer.Deserialize<AnalysisSourceVideo>(
                    job.SourceVideo,
                    AnalysisResults.Json
                ),
            job.WorkoutExecutionId,
            job.SetId
        );

    public static bool ValidMovement(string? movement, string? exercise) =>
        movement is "unspecified" or "squat" or "deadlift" or "bench-press"
        && (exercise == null || exercise.Trim().Length is > 0 and <= 200);

    public static string[] ValidateMetadata(string name, string? note, string[]? tags)
    {
        if (
            string.IsNullOrWhiteSpace(name)
            || name.Length > 200
            || note?.Length > 10000
            || tags == null
            || tags.Length > 20
            || tags.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 50)
        )
            throw ApiException.Invalid("Name, note or analysis tags are invalid.");
        return tags.Select(x => x.Normalize().Trim().ToLowerInvariant())
            .Distinct()
            .Order()
            .ToArray();
    }

    public async Task<AnalysisDto> CreateAsync(
        Guid owner,
        string idempotencyKey,
        CreateAnalysisRequest input,
        CancellationToken ct
    )
    {
        var tags = ValidateMetadata(input.Name, input.Note, input.Tags);
        if (string.IsNullOrWhiteSpace(idempotencyKey) || idempotencyKey.Length > 100)
            throw ApiException.Invalid("Supply an Idempotency-Key of 1 to 100 characters.");
        if (
            input.Configuration == null
            || !ValidMovement(input.Configuration.Movement, input.Configuration.Exercise)
            || (
                input.Configuration.MetersPerPixel.HasValue
                && (
                    !double.IsFinite(input.Configuration.MetersPerPixel.Value)
                    || input.Configuration.MetersPerPixel is <= 0 or > 100
                )
            )
        )
            throw ApiException.Invalid("Invalid analysis configuration.");
        if (
            input.Configuration.Tracking is { } tracking
            && (
                !double.IsFinite(tracking.TimestampSeconds)
                || tracking.TimestampSeconds < 0
                || tracking.VideoWidth is < 1 or > 16384
                || tracking.VideoHeight is < 1 or > 16384
                || tracking.Points is not { Length: 2 }
                || tracking.Points.Any(p =>
                    p is null
                    || !double.IsFinite(p.X)
                    || !double.IsFinite(p.Y)
                    || p.X < 0
                    || p.Y < 0
                    || p.X >= tracking.VideoWidth
                    || p.Y >= tracking.VideoHeight
                )
                || tracking.Points[0] == tracking.Points[1]
            )
        )
            throw ApiException.Invalid("Select two distinct points on one video frame.");
        var hash = Convert.ToHexString(
            SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(input, AnalysisResults.Json))
        );

        return await InTransaction(
            async () =>
            {
                var lockKey = "analysis-create:" + owner;
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))",
                    ct
                );
                var previous = await db
                    .Jobs.AsNoTracking()
                    .Where(x => x.OwnerId == owner && x.IdempotencyKey == idempotencyKey)
                    .Select(Metadata)
                    .SingleOrDefaultAsync(ct);
                if (previous != null)
                {
                    if (previous.RequestHash != hash)
                        throw new ApiException(
                            409,
                            "IDEMPOTENCY_CONFLICT",
                            "This key was already used for different content."
                        );
                    return Dto(previous);
                }
                if (
                    gpuMeter is not { IsConfigured: true }
                    || cloudBudget == null
                    || transaction == null
                )
                    throw new ApiException(
                        503,
                        "CLOUD_ANALYSIS_UNAVAILABLE",
                        "Cloud analysis is unavailable until a trusted GPU-metered worker is configured. Use local analysis."
                    );
                if (!analyzer.IsConfigured)
                    throw new ApiException(
                        503,
                        "ANALYZER_NOT_CONFIGURED",
                        "No video analysis engine is configured."
                    );
                analyzer.ValidateConfiguration(input.Configuration);
                // Queue admission is serialized across owners; workers consume existing jobs without an interactive budget.
                await db.Database.ExecuteSqlRawAsync(
                    "SELECT pg_advisory_xact_lock(743165208915)",
                    ct
                );
                if (
                    await db.Jobs.CountAsync(
                        x => x.Status == "Queued" || x.Status == "Processing",
                        ct
                    ) >= options.MaxQueuedJobs
                )
                    throw new ApiException(
                        429,
                        "RATE_LIMIT_EXCEEDED",
                        "The analysis queue is full. Try again later.",
                        retryAfter: TimeSpan.FromSeconds(30)
                    );
                if (
                    options.MaxConcurrentPerOwner > 0
                    && await db.Jobs.CountAsync(
                        x =>
                            x.OwnerId == owner
                            && (x.Status == "Queued" || x.Status == "Processing"),
                        ct
                    ) >= options.MaxConcurrentPerOwner
                )
                    throw new ApiException(
                        429,
                        "RATE_LIMIT_EXCEEDED",
                        "Two analyses are already queued or running. Try again when one finishes.",
                        retryAfter: TimeSpan.FromSeconds(30)
                    );
                var source = await media.RequireReadyAsync(input.MediaId, owner, ct);
                if (source.ContentType is not ("video/mp4" or "video/webm" or "video/quicktime"))
                    throw ApiException.Invalid(
                        "Video analysis requires an MP4, WebM or MOV video."
                    );
                // A trusted probe inspects the actual video; uploaded/client duration is not an admission authority.
                await using (var stream = await media.OpenReadAsync(input.MediaId, owner, ct))
                {
                    CloudAnalysisBudget.ValidateVideo(
                        source.Size,
                        await gpuMeter.InspectVideoAsync(stream, ct)
                    );
                }
                await media.PinAsync(input.MediaId, owner, ct);
                var now = DateTimeOffset.UtcNow;
                var job = new AnalysisJob
                {
                    Id = Guid.NewGuid(),
                    OwnerId = owner,
                    MediaId = input.MediaId,
                    Name = input.Name.Trim(),
                    Note = input.Note,
                    Tags = tags,
                    Configuration = JsonSerializer.Serialize(
                        input.Configuration,
                        AnalysisResults.Json
                    ),
                    IdempotencyKey = idempotencyKey,
                    RequestHash = hash,
                    CreatedAt = now,
                    AvailableAt = now,
                    TeamId = input.TeamId,
                    CloudBudgetSeconds = Math.Min(options.MaxRunSeconds, 3600),
                };
                job.CloudBudgetOperation = job.Id + ":admission";
                await cloudBudget.ReserveAsync(
                    owner,
                    job.TeamId,
                    job.CloudBudgetOperation,
                    job.CloudBudgetSeconds.Value,
                    ct
                );
                db.Jobs.Add(job);
                await db.SaveChangesAsync(ct);
                return Dto(job);
            },
            ct
        );
    }

    public async Task<AnalysisDto> GetAsync(Guid id, Guid owner, CancellationToken ct) =>
        Dto(await OwnedAsync(id, owner, ct));

    private async Task<AnalysisJob> OwnedAsync(Guid id, Guid owner, CancellationToken ct) =>
        await db
            .Jobs.AsNoTracking()
            .Where(x => x.Id == id && x.OwnerId == owner)
            .Select(Metadata)
            .SingleOrDefaultAsync(ct)
        ?? throw ApiException.NotFound();

    public async Task<IReadOnlyList<AnalysisDto>> ListAsync(
        Guid owner,
        string? search,
        string? status,
        string? tag,
        string? sort,
        int page,
        int pageSize,
        CancellationToken ct,
        bool clientOnly = false
    )
    {
        if (
            page is < 1 or > 100000
            || pageSize is < 1 or > 100
            || search?.Length > 200
            || tag?.Length > 50
            || status
                is not (null or "Queued" or "Processing" or "Completed" or "Failed" or "Cancelled")
        )
            throw ApiException.Invalid("Invalid list filters or pagination.");
        var query = db
            .Jobs.AsNoTracking()
            .Where(x => x.OwnerId == owner && (!clientOnly || x.ExecutionLocation == "client"));
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(x => x.Name.ToLower().Contains(search.ToLower()));
        if (status != null)
            query = query.Where(x => x.Status == status);
        if (tag != null)
        {
            var normalized = tag.Normalize().Trim().ToLowerInvariant();
            query = query.Where(x => x.Tags.Contains(normalized));
        }
        var ordered = sort switch
        {
            null or "newest" => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
            "oldest" => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id),
            "name" => query.OrderBy(x => x.Name).ThenBy(x => x.Id),
            _ => throw ApiException.Invalid("Unknown sort order."),
        };
        // The projection deliberately excludes the potentially large Result column.
        var jobs = await ordered
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(Metadata)
            .ToListAsync(ct);
        return jobs.Select(Dto).ToArray();
    }

    public async Task UpdateAsync(
        Guid id,
        Guid owner,
        long version,
        UpdateAnalysisRequest input,
        CancellationToken ct
    )
    {
        var tags = ValidateMetadata(input.Name, input.Note, input.Tags);
        var job = await OwnedAsync(id, owner, ct);
        if (job.Version != version)
            throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
        if (input.Movement != null && !ValidMovement(input.Movement, input.Exercise))
            throw ApiException.Invalid("Choose a valid movement and exercise.");
        var configuration = job.Configuration;
        string? result = null;
        if (input.RepetitionReviews != null)
        {
            if (job.Status != "Completed")
                throw new ApiException(
                    409,
                    "ANALYSIS_NOT_COMPLETED",
                    "Repetitions can only be reviewed after analysis completes."
                );
            result = await db
                .Jobs.AsNoTracking()
                .Where(x => x.Id == id && x.OwnerId == owner)
                .Select(x => x.Result)
                .SingleOrDefaultAsync(ct);
            if (result == null)
                throw new ApiException(
                    409,
                    "ANALYSIS_NOT_COMPLETED",
                    "The completed result is unavailable."
                );
            result = JsonSerializer.Serialize(
                AnalysisResults.Review(
                    JsonSerializer.Deserialize<AnalysisResult>(result, AnalysisResults.Json)!,
                    input.RepetitionReviews
                ),
                AnalysisResults.Json
            );
        }
        if (input.Movement != null)
            configuration = JsonSerializer.Serialize(
                JsonSerializer.Deserialize<AnalysisConfiguration>(
                    job.Configuration,
                    AnalysisResults.Json
                )! with
                {
                    Movement = input.Movement,
                    Exercise = input.Exercise?.Trim(),
                },
                AnalysisResults.Json
            );
        if (
            await db
                .Jobs.Where(x => x.Id == id && x.OwnerId == owner && x.Version == version)
                .ExecuteUpdateAsync(
                    update =>
                        update
                            .SetProperty(x => x.Name, input.Name.Trim())
                            .SetProperty(x => x.Note, input.Note)
                            .SetProperty(x => x.Tags, tags)
                            .SetProperty(x => x.Configuration, configuration)
                            .SetProperty(x => x.Result, x => result ?? x.Result)
                            .SetProperty(x => x.Version, x => x.Version + 1),
                    ct
                ) != 1
        )
            throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
    }

    /// <summary>
    /// Deletes an analysis in any state with its share links (database cascade). Its video is deleted too unless another
    /// of the owner's analyses uses it. A worker still processing it loses its lease and stops without writing a result.
    /// </summary>
    public async Task DeleteAsync(Guid id, Guid owner, long version, CancellationToken ct)
    {
        var mediaId = await InTransaction(
            async () =>
            {
                var job = await OwnedAsync(id, owner, ct);
                if (job.Version != version)
                    throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
                if (
                    await db
                        .Jobs.Where(x => x.Id == id && x.OwnerId == owner && x.Version == version)
                        .ExecuteDeleteAsync(ct) != 1
                )
                    throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
                if (cloudBudget != null)
                    await cloudBudget.ReleaseAsync(owner, job.CloudBudgetOperation, ct);
                return job.MediaId;
            },
            ct
        );
        // A separate module owns the file: if releasing it fails, the analysis is still gone and the file is only kept.
        if (
            mediaId is { } sourceId
            && !await db.Jobs.AnyAsync(x => x.OwnerId == owner && x.MediaId == sourceId, ct)
        )
            await media.ReleaseVideoAsync(sourceId, owner, ct);
    }

    /// <summary>
    /// Queues a failed or cancelled server analysis again with a fresh attempt budget. The same queue limits as a new
    /// analysis apply; analyses run on the coach's computer are retried there instead.
    /// </summary>
    public async Task RetryAsync(Guid id, Guid owner, long version, CancellationToken ct)
    {
        var job = await OwnedAsync(id, owner, ct);
        if (gpuMeter is not { IsConfigured: true } || cloudBudget == null || transaction == null)
            throw new ApiException(
                503,
                "CLOUD_ANALYSIS_UNAVAILABLE",
                "Cloud analysis requires a trusted GPU-metered worker."
            );
        if (job.Version != version)
            throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
        if (
            job.Status is not ("Failed" or "Cancelled")
            || job.ExecutionLocation != "server"
            || job.MediaId is null
        )
            throw ApiException.Conflict(
                "Only a failed or cancelled analysis run on the server can be retried."
            );
        if (!analyzer.IsConfigured)
            throw new ApiException(
                503,
                "ANALYZER_NOT_CONFIGURED",
                "No video analysis engine is configured."
            );
        await InTransaction(
            async () =>
            {
                await db.Database.ExecuteSqlRawAsync(
                    "SELECT pg_advisory_xact_lock(743165208915)",
                    ct
                );
                if (
                    await db.Jobs.CountAsync(
                        x => x.Status == "Queued" || x.Status == "Processing",
                        ct
                    ) >= options.MaxQueuedJobs
                )
                    throw new ApiException(
                        429,
                        "RATE_LIMIT_EXCEEDED",
                        "The analysis queue is full. Try again later.",
                        retryAfter: TimeSpan.FromSeconds(30)
                    );
                if (
                    options.MaxConcurrentPerOwner > 0
                    && await db.Jobs.CountAsync(
                        x =>
                            x.OwnerId == owner
                            && (x.Status == "Queued" || x.Status == "Processing"),
                        ct
                    ) >= options.MaxConcurrentPerOwner
                )
                    throw new ApiException(
                        429,
                        "RATE_LIMIT_EXCEEDED",
                        "Two analyses are already queued or running. Try again when one finishes.",
                        retryAfter: TimeSpan.FromSeconds(30)
                    );
                var now = DateTimeOffset.UtcNow;
                var operation = id + ":retry:" + Guid.NewGuid().ToString("N");
                await cloudBudget.ReleaseAsync(owner, job.CloudBudgetOperation, ct);
                var seconds = Math.Min(options.MaxRunSeconds, 3600);
                await cloudBudget.ReserveAsync(owner, job.TeamId, operation, seconds, ct);
                if (
                    await db
                        .Jobs.Where(x =>
                            x.Id == id
                            && x.OwnerId == owner
                            && x.Version == version
                            && (x.Status == "Failed" || x.Status == "Cancelled")
                        )
                        .ExecuteUpdateAsync(
                            update =>
                                update
                                    .SetProperty(x => x.Status, "Queued")
                                    .SetProperty(x => x.Attempts, 0)
                                    .SetProperty(x => x.FailureCode, (string?)null)
                                    .SetProperty(x => x.CompletedAt, (DateTimeOffset?)null)
                                    .SetProperty(x => x.AvailableAt, now)
                                    .SetProperty(x => x.Version, x => x.Version + 1)
                                    .SetProperty(x => x.CloudBudgetOperation, operation)
                                    .SetProperty(x => x.CloudBudgetSeconds, (long?)seconds),
                            ct
                        ) != 1
                )
                    throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
                return true;
            },
            ct
        );
    }

    public async Task CancelAsync(Guid id, Guid owner, long version, CancellationToken ct)
    {
        await InTransaction(
            async () =>
            {
                var job = await OwnedAsync(id, owner, ct);
                if (job.Version != version)
                    throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
                if (job.Status is not ("Queued" or "Processing"))
                    throw ApiException.Conflict(
                        "Only queued or processing analyses can be cancelled."
                    );
                var now = DateTimeOffset.UtcNow;
                if (
                    await db
                        .Jobs.Where(x =>
                            x.Id == id
                            && x.OwnerId == owner
                            && x.Version == version
                            && (x.Status == "Queued" || x.Status == "Processing")
                        )
                        .ExecuteUpdateAsync(
                            update =>
                                update
                                    .SetProperty(x => x.Status, "Cancelled")
                                    .SetProperty(x => x.LeaseToken, (Guid?)null)
                                    .SetProperty(x => x.LeaseExpiresAt, (DateTimeOffset?)null)
                                    .SetProperty(x => x.CompletedAt, now)
                                    .SetProperty(x => x.Version, x => x.Version + 1),
                            ct
                        ) != 1
                )
                    throw new ApiException(
                        412,
                        "VERSION_CONFLICT",
                        "The analysis changed before cancellation."
                    );
                if (cloudBudget != null)
                    await cloudBudget.ReleaseAsync(owner, job.CloudBudgetOperation, ct);
                return true;
            },
            ct
        );
    }

    private async Task<T> InTransaction<T>(Func<Task<T>> action, CancellationToken ct)
    {
        if (transaction != null)
            return await transaction.RunAsync(_ => action(), ct);
        using var legacy = new TransactionScope(
            TransactionScopeOption.Required,
            new TransactionOptions
            {
                IsolationLevel = IsolationLevel.ReadCommitted,
                Timeout = TimeSpan.FromSeconds(30),
            },
            TransactionScopeAsyncFlowOption.Enabled
        );
        var result = await action();
        legacy.Complete();
        return result;
    }

    public async Task<AnalysisResult> ResultAsync(
        Guid id,
        Guid owner,
        int? repetition,
        int maxPoints,
        CancellationToken ct
    )
    {
        var job =
            await db
                .Jobs.AsNoTracking()
                .Where(x => x.Id == id && x.OwnerId == owner)
                .Select(x => new { x.Status, x.Result })
                .SingleOrDefaultAsync(ct)
            ?? throw ApiException.NotFound();
        return SelectResult(job.Status, job.Result, repetition, maxPoints);
    }

    private static AnalysisResult SelectResult(
        string status,
        string? result,
        int? repetition,
        int maxPoints
    )
    {
        if (status != "Completed" || result == null)
            throw new ApiException(
                409,
                "ANALYSIS_NOT_COMPLETED",
                "The analysis has no completed result."
            );
        return AnalysisResults.Select(
            JsonSerializer.Deserialize<AnalysisResult>(result, AnalysisResults.Json)!,
            repetition,
            maxPoints
        );
    }

    public async Task<AnalysisComparison> CompareAsync(
        Guid leftId,
        Guid rightId,
        Guid owner,
        int? leftRepetition,
        int? rightRepetition,
        int maxPoints,
        CancellationToken ct
    )
    {
        var jobs = await db
            .Jobs.AsNoTracking()
            .Where(x => x.OwnerId == owner && (x.Id == leftId || x.Id == rightId))
            .Select(x => new
            {
                x.Id,
                x.Status,
                x.Result,
            })
            .ToListAsync(ct);
        // Resolve both owners before exposing completion state; each large result is fetched once.
        var leftJob = jobs.SingleOrDefault(x => x.Id == leftId) ?? throw ApiException.NotFound();
        var rightJob = jobs.SingleOrDefault(x => x.Id == rightId) ?? throw ApiException.NotFound();
        var left = SelectResult(leftJob.Status, leftJob.Result, leftRepetition, maxPoints);
        var right = SelectResult(rightJob.Status, rightJob.Result, rightRepetition, maxPoints);
        AnalysisResults.RequireCompatible(left, right);
        return new AnalysisComparison(left, right);
    }
}
