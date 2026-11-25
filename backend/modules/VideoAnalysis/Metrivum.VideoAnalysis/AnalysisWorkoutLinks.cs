using Metrivum.BuildingBlocks;
using Metrivum.Media.Contracts;
using Metrivum.Training.Contracts;
using Metrivum.VideoAnalysis.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.VideoAnalysis;

public sealed record AnalysisWorkoutLinkRequest(
    Guid WorkoutExecutionId,
    Guid? SetId,
    bool ShareWithClient = false
);

public sealed record AnalysisWorkoutLinkDto(AnalysisSetReference Set, bool SharedWithClient);

/// <summary>An analysis the coach shared with this client, with the set it belongs to.</summary>
public sealed record CoachAnalysisDto(AnalysisDto Analysis, AnalysisSetReference Set);

public sealed record CoachAnalysisVideoUrl(string Url, DateTimeOffset ExpiresAt);

/// <summary>
/// Links an analysis the coach owns to one logged set (or a whole workout) of their client, and optionally lets that
/// client see it there. The training module decides who may see the workout; the analysis only stores the two ids,
/// so no copy of the log goes stale and an ended relationship hides the analysis again.
/// </summary>
public sealed class AnalysisWorkoutLinks(
    VideoAnalysisDbContext db,
    IAnalysisWorkoutReferences workouts,
    AnalysisLibrary library,
    IMediaLibrary media
)
{
    public async Task<AnalysisWorkoutLinkDto?> GetAsync(Guid id, Guid owner, CancellationToken ct)
    {
        var link =
            await db
                .Jobs.AsNoTracking()
                .Where(x => x.Id == id && x.OwnerId == owner)
                .Select(x => new
                {
                    x.WorkoutExecutionId,
                    x.SetId,
                    x.SharedWithClient,
                })
                .SingleOrDefaultAsync(ct)
            ?? throw ApiException.NotFound();
        if (link.WorkoutExecutionId is not { } execution)
            return null;
        var reference = await workouts.DescribeAsync(execution, link.SetId, ct);
        return reference == null ? null : new(reference, link.SharedWithClient);
    }

    public async Task<(AnalysisWorkoutLinkDto Link, long Version)> LinkAsync(
        Guid id,
        Guid owner,
        long version,
        AnalysisWorkoutLinkRequest input,
        CancellationToken ct
    )
    {
        if (input.WorkoutExecutionId == Guid.Empty || input.SetId == Guid.Empty)
            throw ApiException.Invalid("Choose a logged workout and, optionally, one of its sets.");
        await RequireVersionAsync(id, owner, version, ct);
        var reference = await workouts.RequireLinkableAsync(
            input.WorkoutExecutionId,
            input.SetId,
            ct
        );
        // Only the coach shares with a client: a client linking their own analysis has no one to share it with.
        var share = input.ShareWithClient && reference.ClientId != owner;
        await UpdateAsync(id, owner, version, input.WorkoutExecutionId, input.SetId, share, ct);
        return (new(reference, share), version + 1);
    }

    public async Task<long> UnlinkAsync(Guid id, Guid owner, long version, CancellationToken ct)
    {
        await RequireVersionAsync(id, owner, version, ct);
        await UpdateAsync(id, owner, version, null, null, false, ct);
        return version + 1;
    }

    /// <summary>Completed analyses coaches shared with the signed-in client, newest first; optionally for one logged workout.</summary>
    public async Task<CoachAnalysisDto[]> FromCoachAsync(
        Guid client,
        Guid? executionId,
        CancellationToken ct
    ) => (await ReadSharedAsync(client, executionId, null, ct)).Select(x => x.Dto).ToArray();

    private async Task<List<(CoachAnalysisDto Dto, Guid Owner)>> ReadSharedAsync(
        Guid client,
        Guid? executionId,
        Guid? analysisId,
        CancellationToken ct
    )
    {
        var executions = await workouts.ClientExecutionsAsync(executionId, ct);
        if (executions.Length == 0)
            return [];
        var jobs = await db
            .Jobs.AsNoTracking()
            .Where(x =>
                x.SharedWithClient
                && x.OwnerId != client
                && x.Status == "Completed"
                && (analysisId == null || x.Id == analysisId)
                && x.WorkoutExecutionId != null
                && executions.Contains(x.WorkoutExecutionId.Value)
            )
            .OrderByDescending(x => x.CreatedAt)
            .Take(100)
            .Select(x => new AnalysisJob
            {
                Id = x.Id,
                OwnerId = x.OwnerId,
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
                ExecutionLocation = x.ExecutionLocation,
                LocalAnalysisId = x.LocalAnalysisId,
                SourceVideo = x.SourceVideo,
                WorkoutExecutionId = x.WorkoutExecutionId,
                SetId = x.SetId,
            })
            .ToListAsync(ct);
        var shared = new List<(CoachAnalysisDto Dto, Guid Owner)>(jobs.Count);
        var references = new Dictionary<(Guid Execution, Guid? Set), AnalysisSetReference?>();
        foreach (var job in jobs)
        {
            var key = (Execution: job.WorkoutExecutionId!.Value, Set: job.SetId);
            if (!references.TryGetValue(key, out var reference))
            {
                reference = await workouts.DescribeAsync(key.Execution, key.Set, ct);
                references.Add(key, reference);
            }
            if (reference?.ClientId == client)
                shared.Add((new(AnalysisLibrary.Dto(job), reference), job.OwnerId));
        }
        return shared;
    }

    public async Task<CoachAnalysisDto> SharedAsync(Guid id, Guid client, CancellationToken ct) =>
        (await RequireSharedAsync(id, client, ct)).Dto;

    private async Task<(CoachAnalysisDto Dto, Guid Owner)> RequireSharedAsync(
        Guid id,
        Guid client,
        CancellationToken ct
    )
    {
        var execution = await SharedExecutionAsync(id, client, ct);
        var rows = await ReadSharedAsync(client, execution, id, ct);
        return rows.Count == 1 ? rows[0] : throw ApiException.NotFound();
    }

    public async Task<AnalysisResult> ResultAsync(
        Guid id,
        Guid client,
        int? repetition,
        int maxPoints,
        CancellationToken ct
    )
    {
        var (_, owner) = await RequireSharedAsync(id, client, ct);
        return await library.ResultAsync(id, owner, repetition, maxPoints, ct);
    }

    public async Task<CoachAnalysisVideoUrl> VideoUrlAsync(
        Guid id,
        Guid client,
        CancellationToken ct
    )
    {
        var (shared, owner) = await RequireSharedAsync(id, client, ct);
        if (shared.Analysis.MediaId is not { } mediaId)
            throw ApiException.NotFound();
        // Downloads count against the viewing client, like a shared link.
        var ticket = await media.ReadUrlForAsync(mediaId, owner, client, ct);
        return new(ticket.Url, ticket.ExpiresAt);
    }

    private async Task<Guid> SharedExecutionAsync(Guid id, Guid client, CancellationToken ct) =>
        await db
            .Jobs.AsNoTracking()
            .Where(x =>
                x.Id == id
                && x.SharedWithClient
                && x.OwnerId != client
                && x.WorkoutExecutionId != null
            )
            .Select(x => x.WorkoutExecutionId!.Value)
            .SingleOrDefaultAsync(ct)
            is var execution
        && execution != Guid.Empty
            ? execution
            : throw ApiException.NotFound();

    private async Task RequireVersionAsync(Guid id, Guid owner, long version, CancellationToken ct)
    {
        var current =
            await db
                .Jobs.AsNoTracking()
                .Where(x => x.Id == id && x.OwnerId == owner)
                .Select(x => (long?)x.Version)
                .SingleOrDefaultAsync(ct)
            ?? throw ApiException.NotFound();
        if (current != version)
            throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
    }

    private async Task UpdateAsync(
        Guid id,
        Guid owner,
        long version,
        Guid? execution,
        Guid? set,
        bool share,
        CancellationToken ct
    )
    {
        if (
            await db
                .Jobs.Where(x => x.Id == id && x.OwnerId == owner && x.Version == version)
                .ExecuteUpdateAsync(
                    update =>
                        update
                            .SetProperty(x => x.WorkoutExecutionId, execution)
                            .SetProperty(x => x.SetId, set)
                            .SetProperty(x => x.SharedWithClient, share)
                            .SetProperty(x => x.Version, x => x.Version + 1),
                    ct
                ) != 1
        )
            throw new ApiException(412, "VERSION_CONFLICT", "The analysis has changed.");
    }
}
