using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Metrivum.BuildingBlocks;
using Metrivum.Access.Contracts;
using Metrivum.Media.Contracts;
using Metrivum.Training.Contracts;
using Metrivum.VideoAnalysis.Infrastructure;

namespace Metrivum.VideoAnalysis;

public sealed record AnalysisSourceVideo(string Origin, double DurationSeconds, int Width, int Height);
public sealed record SaveClientAnalysisRequest(Guid LocalAnalysisId, string ExecutionLocation, string Name, string? Note,
    string[] Tags, AnalysisConfiguration Configuration, AnalysisSourceVideo SourceVideo, AnalysisResult Result,
    Guid? MediaId = null, Guid? WorkoutExecutionId = null, Guid? SetId = null, Guid? AuthorizationId = null);

/// <summary>Reads analyses available through an authorized coach-client collaboration.</summary>
public sealed class ClientAnalysisLibrary(VideoAnalysisDbContext db, IMediaLibrary media, IAnalysisWorkoutReferences workouts,
    ModuleTransaction transaction, IOptions<AnalysisOptions> options, IUsageReservations? usage = null)
{
    public static void Validate(SaveClientAnalysisRequest input, AnalysisOptions options)
    {
        AnalysisLibrary.ValidateMetadata(input.Name, input.Note, input.Tags);
        var source = input.SourceVideo;
        if (input.LocalAnalysisId == Guid.Empty || input.ExecutionLocation != "client" || input.Configuration == null || source == null
            || source.Origin is not ("local" or "cloud") || (source.Origin == "cloud") != input.MediaId.HasValue
            || !double.IsFinite(source.DurationSeconds) || source.DurationSeconds is <= 0 or > 60
            || source.Width is < 1 or > 16384 || source.Height is < 1 or > 16384
            || !AnalysisLibrary.ValidMovement(input.Configuration.Movement, input.Configuration.Exercise)
            || input.Configuration.MetersPerPixel is { } scale && (!double.IsFinite(scale) || scale is <= 0 or > 100)
            || input.SetId.HasValue && !input.WorkoutExecutionId.HasValue
            || input.MediaId == Guid.Empty || input.WorkoutExecutionId == Guid.Empty || input.SetId == Guid.Empty)
            throw ApiException.Invalid("Invalid local analysis metadata or source video.");
        if (input.Result == null) throw Invalid();
        AnalysisResults.Validate(input.Result, options);
        if (input.Result.MetersPerPixel != input.Configuration.MetersPerPixel) throw Invalid();
        if (input.Configuration.Tracking is { } tracking &&
            (!double.IsFinite(tracking.TimestampSeconds) || tracking.TimestampSeconds < 0 || tracking.TimestampSeconds > source.DurationSeconds
             || tracking.VideoWidth != source.Width || tracking.VideoHeight != source.Height || tracking.Points is not { Length: 2 }
             || tracking.Points.Any(p => p == null || !double.IsFinite(p.X) || !double.IsFinite(p.Y) || p.X < 0 || p.X >= source.Width || p.Y < 0 || p.Y >= source.Height)
             || tracking.Points[0] == tracking.Points[1])) throw Invalid();
        if (input.Result.Trajectory.Any(p => p.Seconds > source.DurationSeconds)) throw Invalid();
        var end = -1d;
        foreach (var rep in input.Result.Repetitions)
        {
            if (rep.StartSeconds < end || rep.EndSeconds > source.DurationSeconds) throw Invalid();
            end = rep.EndSeconds;
        }
    }

    public Task<AnalysisDto> SaveAsync(Guid owner, string key, SaveClientAnalysisRequest input, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        Validate(input, options.Value);
        if (string.IsNullOrWhiteSpace(key) || key.Length > 100) throw ApiException.Invalid("Supply an Idempotency-Key of 1 to 100 characters.");
        var hash = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(input, AnalysisResults.Json)));
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"analysis-create:" + owner}, 0))", token);
        var matches = await db.Jobs.AsNoTracking().Where(x => x.OwnerId == owner && (x.IdempotencyKey == key || x.LocalAnalysisId == input.LocalAnalysisId)).Take(2).ToArrayAsync(token);
        if (matches.Length > 1) throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "This key and local ID refer to different results.");
        var previous = matches.SingleOrDefault();
        if (previous != null)
        {
            if (previous.RequestHash != hash || previous.ExecutionLocation != "client") throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "This key or local ID was used for different content.");
            return AnalysisLibrary.Dto(previous);
        }
        if (input.WorkoutExecutionId is { } execution) await workouts.RequireOwnedAsync(owner, execution, input.SetId, token);
        if (usage != null)
        {
            var operation = (input.AuthorizationId ?? input.LocalAnalysisId).ToString();
            // Legacy clients authorize at sync time. They cannot bypass the server's successful-result quota.
            if (input.AuthorizationId == null)
                await usage.ReserveAsync(owner, "video.local_analyses_per_period", operation, 1, TimeSpan.FromMinutes(5), token);
            // Bind the durable receipt to content as well as identity: deleting a library row
            // must not let a caller recycle its local ID/permit for a different inference.
            await usage.SettleAsync(owner, "video.local_analyses_per_period", operation, 1, token, "local:" + hash);
        }
        if (input.MediaId is { } mediaId)
        {
            var file = await media.RequireReadyAsync(mediaId, owner, token);
            if (file.ContentType is not ("video/mp4" or "video/webm" or "video/quicktime")) throw ApiException.Invalid("Source media must be a video.");
            await media.PinAsync(mediaId, owner, token);
        }
        var now = DateTimeOffset.UtcNow;
        var job = new AnalysisJob
        {
            Id = Guid.NewGuid(), OwnerId = owner, MediaId = input.MediaId, Name = input.Name.Trim(), Note = input.Note,
            Tags = AnalysisLibrary.ValidateMetadata(input.Name, input.Note, input.Tags), Configuration = JsonSerializer.Serialize(input.Configuration, AnalysisResults.Json),
            Result = JsonSerializer.Serialize(input.Result, AnalysisResults.Json), Status = "Completed", CreatedAt = now, CompletedAt = now, AvailableAt = now,
            IdempotencyKey = key, RequestHash = hash, LocalAnalysisId = input.LocalAnalysisId, ExecutionLocation = "client",
            SourceVideo = JsonSerializer.Serialize(input.SourceVideo, AnalysisResults.Json), WorkoutExecutionId = input.WorkoutExecutionId, SetId = input.SetId
        };
        db.Jobs.Add(job);
        await db.SaveChangesAsync(token);
        return AnalysisLibrary.Dto(job);
    }, ct);

    private static ApiException Invalid() => new(422, "ANALYSIS_RESULT_INVALID", "The local analysis result is invalid or exceeds the source duration.");
}
