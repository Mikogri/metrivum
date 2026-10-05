using System.Security.Cryptography;
using System.Text.Json;
using System.Transactions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TrainFlow.BuildingBlocks;
using TrainFlow.Media.Contracts;
using TrainFlow.VideoAnalysis.Infrastructure;

namespace TrainFlow.VideoAnalysis;

public sealed class AnalysisLibrary(VideoAnalysisDbContext db, IMediaLibrary media, IVideoAnalyzer analyzer, IOptions<AnalysisOptions> configured)
{
    private readonly AnalysisOptions options = configured.Value;
    private static AnalysisDto Dto(AnalysisJob job) => new(job.Id, job.Name, job.Note, job.Tags, job.MediaId,
        JsonSerializer.Deserialize<AnalysisConfiguration>(job.Configuration, AnalysisResults.Json)!, job.Status,
        job.CreatedAt, job.CompletedAt, job.FailureCode, job.Attempts, job.Version);

    public static string[] ValidateMetadata(string name, string? note, string[]? tags)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 200 || note?.Length > 10000 || tags == null || tags.Length > 20 || tags.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 50))
            throw ApiException.Invalid("Name, note or analysis tags are invalid.");
        return tags.Select(x => x.Normalize().Trim().ToLowerInvariant()).Distinct().Order().ToArray();
    }

    public async Task<AnalysisDto> CreateAsync(Guid owner, string idempotencyKey, CreateAnalysisRequest input, CancellationToken ct)
    {
        var tags = ValidateMetadata(input.Name, input.Note, input.Tags);
        if (string.IsNullOrWhiteSpace(idempotencyKey) || idempotencyKey.Length > 100)
            throw ApiException.Invalid("Supply an Idempotency-Key of 1 to 100 characters.");
        if (input.Configuration == null || input.Configuration.Movement is not ("unspecified" or "squat" or "deadlift" or "bench-press")
            || (input.Configuration.MetersPerPixel.HasValue && (!double.IsFinite(input.Configuration.MetersPerPixel.Value) || input.Configuration.MetersPerPixel is <= 0 or > 100)))
            throw ApiException.Invalid("Invalid analysis configuration.");
        var hash = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(input, AnalysisResults.Json)));

        // All operations use the same data source and close connections between statements. Npgsql reuses the
        // connection enlisted in this ambient transaction, including Media's pin; no distributed transaction is needed.
        using var transaction = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted, Timeout = TimeSpan.FromSeconds(30) }, TransactionScopeAsyncFlowOption.Enabled);
        var lockKey = "analysis-create:" + owner;
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", ct);
        var previous = await db.Jobs.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == owner && x.IdempotencyKey == idempotencyKey, ct);
        if (previous != null)
        {
            if (previous.RequestHash != hash)
                throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "This key was already used for different content.");
            transaction.Complete();
            return Dto(previous);
        }
        if (!analyzer.IsConfigured)
            throw new ApiException(503, "ANALYZER_NOT_CONFIGURED", "No video analysis engine is configured.");
        if (await db.Jobs.CountAsync(x => x.OwnerId == owner && (x.Status == "Queued" || x.Status == "Processing"), ct) >= options.MaxConcurrentPerOwner)
            throw new ApiException(429, "LIMIT_EXCEEDED", "The concurrent analysis limit has been reached.");
        await media.RequireReadyAsync(input.MediaId, owner, ct);
        // Verify the actual storage object before queue admission, without buffering the video in memory.
        await using (await media.OpenReadAsync(input.MediaId, owner, ct))
        {
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
            Configuration = JsonSerializer.Serialize(input.Configuration, AnalysisResults.Json),
            IdempotencyKey = idempotencyKey,
            RequestHash = hash,
            CreatedAt = now,
            AvailableAt = now
        };
        db.Jobs.Add(job);
        await db.SaveChangesAsync(ct);
        transaction.Complete();
        return Dto(job);
    }

    public async Task<AnalysisDto> GetAsync(Guid id, Guid owner, CancellationToken ct) => Dto(await OwnedAsync(id, owner, ct));

    private async Task<AnalysisJob> OwnedAsync(Guid id, Guid owner, CancellationToken ct) =>
        await db.Jobs.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == owner, ct) ?? throw ApiException.NotFound();

    public async Task<IReadOnlyList<AnalysisDto>> ListAsync(Guid owner, string? search, string? status, string? tag, string? sort, int page, int pageSize, CancellationToken ct)
    {
        if (page is < 1 or > 100000 || pageSize is < 1 or > 100 || search?.Length > 200 || tag?.Length > 50
            || status is not (null or "Queued" or "Processing" or "Completed" or "Failed" or "Cancelled"))
            throw ApiException.Invalid("Invalid list filters or pagination.");
        var query = db.Jobs.AsNoTracking().Where(x => x.OwnerId == owner);
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
            _ => throw ApiException.Invalid("Unknown sort order.")
        };
        // The projection deliberately excludes the potentially large Result column.
        var jobs = await ordered.Skip((page - 1) * pageSize).Take(pageSize).Select(x => new AnalysisJob
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
            Version = x.Version
        }).ToListAsync(ct);
        return jobs.Select(Dto).ToArray();
    }

    public async Task UpdateAsync(Guid id, Guid owner, long version, UpdateAnalysisRequest input, CancellationToken ct)
    {
        var tags = ValidateMetadata(input.Name, input.Note, input.Tags);
        var job = await OwnedAsync(id, owner, ct);
        if (job.Version != version)
            throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
        if (await db.Jobs.Where(x => x.Id == id && x.OwnerId == owner && x.Version == version).ExecuteUpdateAsync(update => update
            .SetProperty(x => x.Name, input.Name.Trim()).SetProperty(x => x.Note, input.Note).SetProperty(x => x.Tags, tags).SetProperty(x => x.Version, x => x.Version + 1), ct) != 1)
            throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
    }

    public async Task CancelAsync(Guid id, Guid owner, long version, CancellationToken ct)
    {
        var job = await OwnedAsync(id, owner, ct);
        if (job.Version != version)
            throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
        if (job.Status is not ("Queued" or "Processing"))
            throw ApiException.Conflict("Only queued or processing analyses can be cancelled.");
        var now = DateTimeOffset.UtcNow;
        if (await db.Jobs.Where(x => x.Id == id && x.OwnerId == owner && x.Version == version && (x.Status == "Queued" || x.Status == "Processing"))
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.Status, "Cancelled").SetProperty(x => x.LeaseToken, (Guid?)null)
                .SetProperty(x => x.LeaseExpiresAt, (DateTimeOffset?)null).SetProperty(x => x.CompletedAt, now).SetProperty(x => x.Version, x => x.Version + 1), ct) != 1)
            throw new ApiException(412, "VERSION_CONFLICT", "The analysis changed before cancellation.");
    }

    public async Task<AnalysisResult> ResultAsync(Guid id, Guid owner, int? repetition, int maxPoints, CancellationToken ct)
    {
        var job = await OwnedAsync(id, owner, ct);
        if (job.Status != "Completed" || job.Result == null)
            throw new ApiException(409, "ANALYSIS_NOT_COMPLETED", "The analysis has no completed result.");
        return AnalysisResults.Select(JsonSerializer.Deserialize<AnalysisResult>(job.Result, AnalysisResults.Json)!, repetition, maxPoints);
    }

    public async Task<AnalysisComparison> CompareAsync(Guid leftId, Guid rightId, Guid owner, int? leftRepetition, int? rightRepetition, int maxPoints, CancellationToken ct)
    {
        // Check both owners before revealing either result's state.
        await OwnedAsync(leftId, owner, ct);
        await OwnedAsync(rightId, owner, ct);
        var left = await ResultAsync(leftId, owner, leftRepetition, maxPoints, ct);
        var right = await ResultAsync(rightId, owner, rightRepetition, maxPoints, ct);
        AnalysisResults.RequireCompatible(left, right);
        return new AnalysisComparison(left, right);
    }
}
