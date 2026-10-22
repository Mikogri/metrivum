using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using TrainFlow.BuildingBlocks;
using TrainFlow.Media;
using TrainFlow.Media.Contracts;
using TrainFlow.Media.Infrastructure;
using TrainFlow.VideoAnalysis;
using TrainFlow.VideoAnalysis.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class MediaAnalysisPostgresTests
{
    [MediaPostgresFact]
    public async Task Metadata_reads_exclude_results_and_comparison_loads_each_result_once()
    {
        await using var test = await Database.CreateAsync();
        var left = await test.EnqueueAsync();
        await using var db = test.Analysis();
        await using var files = test.Media();
        var job = await db.Jobs.SingleAsync(x => x.Id == left);
        var right = Guid.NewGuid();
        db.Jobs.Add(new AnalysisJob
        {
            Id = right,
            OwnerId = job.OwnerId,
            MediaId = job.MediaId,
            Name = "Other",
            Configuration = job.Configuration,
            IdempotencyKey = "other",
            RequestHash = "other",
            CreatedAt = job.CreatedAt,
            AvailableAt = job.AvailableAt
        });
        await db.SaveChangesAsync();
        await db.Jobs.Where(x => x.OwnerId == job.OwnerId).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.Status, "Completed").SetProperty(x => x.Result, JsonSerializer.Serialize(Result(), AnalysisResults.Json)));
        var library = test.AnalysisLibrary(db, files);

        test.Counter.Commands.Clear();
        Assert.Equal(left, (await library.GetAsync(left, job.OwnerId, default)).Id);
        Assert.Single(test.Counter.Commands);
        Assert.DoesNotContain("\"Result\"", test.Counter.Commands[0]);

        test.Counter.Commands.Clear();
        var comparison = await library.CompareAsync(left, right, job.OwnerId, null, null, 2, default);
        Assert.NotNull(comparison);
        Assert.InRange(test.Counter.Commands.Count, 1, 2);

        await db.Jobs.Where(x => x.Id == left).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, "Queued").SetProperty(x => x.Result, (string?)null));
        var foreign = await Assert.ThrowsAsync<ApiException>(() => library.CompareAsync(left, Guid.NewGuid(), job.OwnerId, null, null, 2, default));
        Assert.Equal(404, foreign.Status);
    }

    [MediaPostgresFact]
    public async Task Editing_relabels_the_movement_with_any_exercise_and_keeps_the_rest_of_the_configuration()
    {
        await using var test = await Database.CreateAsync();
        var id = await test.EnqueueAsync();
        await using var db = test.Analysis();
        await using var files = test.Media();
        var library = test.AnalysisLibrary(db, files);
        var job = await db.Jobs.AsNoTracking().SingleAsync(x => x.Id == id);
        var before = JsonSerializer.Deserialize<AnalysisConfiguration>(job.Configuration, AnalysisResults.Json)!;

        await library.UpdateAsync(id, job.OwnerId, job.Version, new("Renamed", null, [], "squat", " Front squat "), default);
        var edited = await library.GetAsync(id, job.OwnerId, default);
        Assert.Equal(("squat", "Front squat"), (edited.Configuration.Movement, edited.Configuration.Exercise));
        Assert.Equal(JsonSerializer.Serialize(before.Tracking, AnalysisResults.Json), JsonSerializer.Serialize(edited.Configuration.Tracking, AnalysisResults.Json));

        // Without a movement the label stays; an unknown engine movement is rejected.
        await library.UpdateAsync(id, job.OwnerId, edited.Version, new("Again", null, []), default);
        Assert.Equal("Front squat", (await library.GetAsync(id, job.OwnerId, default)).Configuration.Exercise);
        await Assert.ThrowsAsync<ApiException>(() => library.UpdateAsync(id, job.OwnerId, edited.Version + 1, new("Again", null, [], "overhead-press", "OHP"), default));
    }

    [MediaPostgresFact]
    public async Task Deleting_an_analysis_releases_its_video_only_when_no_other_analysis_uses_it()
    {
        await using var test = await Database.CreateAsync();
        var first = await test.EnqueueAsync();
        await using var db = test.Analysis();
        await using var files = test.Media();
        var library = test.AnalysisLibrary(db, files);
        var job = await db.Jobs.AsNoTracking().SingleAsync(x => x.Id == first);

        var second = Guid.NewGuid();
        db.Jobs.Add(new AnalysisJob { Id = second, OwnerId = job.OwnerId, MediaId = job.MediaId, Name = "Same video", Configuration = job.Configuration,
            IdempotencyKey = "second", RequestHash = "second", CreatedAt = job.CreatedAt, AvailableAt = job.AvailableAt });
        await db.SaveChangesAsync();
        await db.Jobs.Where(x => x.Id == second).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, "Failed"));

        // A queued (running) analysis can be deleted too; a stale version is refused.
        await Assert.ThrowsAsync<ApiException>(() => library.DeleteAsync(first, job.OwnerId, job.Version + 5, default));
        await library.DeleteAsync(first, job.OwnerId, job.Version, default);
        Assert.False(await db.Jobs.AnyAsync(x => x.Id == first));
        Assert.Equal("Ready", (await files.Files.AsNoTracking().SingleAsync(x => x.Id == job.MediaId)).State);

        var last = await db.Jobs.AsNoTracking().SingleAsync(x => x.Id == second);
        await library.DeleteAsync(second, job.OwnerId, last.Version, default);
        var file = await files.Files.AsNoTracking().SingleAsync(x => x.Id == job.MediaId);
        Assert.Equal(("Deleting", false), (file.State, file.Pinned));
    }

    [MediaPostgresFact]
    public async Task A_failed_server_analysis_can_be_queued_again_once()
    {
        await using var test = await Database.CreateAsync();
        var id = await test.EnqueueAsync();
        await using var db = test.Analysis();
        await using var files = test.Media();
        var library = test.AnalysisLibrary(db, files);
        var job = await db.Jobs.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => library.RetryAsync(id, job.OwnerId, job.Version, default))).Status);

        await db.Jobs.Where(x => x.Id == id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, "Failed").SetProperty(x => x.Attempts, 3)
            .SetProperty(x => x.FailureCode, "ANALYSIS_TIMEOUT").SetProperty(x => x.CompletedAt, DateTimeOffset.UtcNow));
        var failed = await db.Jobs.AsNoTracking().SingleAsync(x => x.Id == id);
        await library.RetryAsync(id, job.OwnerId, failed.Version, default);
        var queued = await db.Jobs.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal(("Queued", 0, (string?)null, (DateTimeOffset?)null), (queued.Status, queued.Attempts, queued.FailureCode, queued.CompletedAt));
        // The same version cannot queue it twice.
        await Assert.ThrowsAsync<ApiException>(() => library.RetryAsync(id, job.OwnerId, failed.Version, default));
    }

    [MediaPostgresFact]
    public async Task Media_read_ticket_uses_one_owned_lookup_and_still_validates_stored_bytes()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        var id = await test.ReadyAsync(owner);
        await using var db = test.Media();
        test.Counter.Commands.Clear();
        Assert.NotNull(await test.Library(db).ReadUrlAsync(id, owner, default));
        Assert.Single(test.Counter.Commands);
        test.Storage.Bytes = new byte[24];
        Assert.Equal("MEDIA_FORMAT_INVALID", (await Assert.ThrowsAsync<ApiException>(() => test.Library(db).ReadUrlAsync(id, owner, default))).Code);
    }

    [MediaPostgresFact]
    public async Task Valid_mov_upload_can_enter_analysis_queue()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        test.Storage.ContentType = "video/quicktime";
        test.Storage.Bytes[8] = (byte)'q';
        test.Storage.Bytes[9] = (byte)'t';
        test.Storage.Bytes[10] = (byte)' ';
        test.Storage.Bytes[11] = (byte)' ';
        await using var files = test.Media();
        var ticket = await test.Library(files).CreateAsync(owner, new("Lift.mov", "video/quicktime", 24), default);
        await test.Library(files).FinalizeAsync(ticket.File.Id, owner, default);
        await using var db = test.Analysis();
        Assert.Equal("Queued", (await test.AnalysisLibrary(db, files).CreateAsync(owner, "mov", Request(ticket.File.Id), default)).Status);
    }

    [MediaPostgresFact]
    public async Task ForeignFilesCannotBeFinalizedReadOrDeleted()
    {
        await using var test = await Database.CreateAsync();
        await using var db = test.Media();
        var media = test.Library(db);
        var ticket = await media.CreateAsync(Guid.NewGuid(), new("Private", "video/mp4", 24), default);
        var stranger = Guid.NewGuid();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => media.FinalizeAsync(ticket.File.Id, stranger, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => media.ReadUrlAsync(ticket.File.Id, stranger, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => media.DeleteAsync(ticket.File.Id, stranger, 1, default))).Status);
        Assert.Equal(0, test.Storage.Inspections);
    }

    [MediaPostgresFact]
    public async Task FalseCompletionCannotMakeArbitraryBytesReady()
    {
        await using var test = await Database.CreateAsync();
        await using var db = test.Media();
        var media = test.Library(db);
        var owner = Guid.NewGuid();
        var ticket = await media.CreateAsync(owner, new("Bad", "video/mp4", 24), default);
        test.Storage.Bytes = new byte[24];
        Assert.Equal("MEDIA_FORMAT_INVALID", (await Assert.ThrowsAsync<ApiException>(() => media.FinalizeAsync(ticket.File.Id, owner, default))).Code);
        Assert.Equal("Pending", (await db.Files.AsNoTracking().SingleAsync()).State);
    }

    [MediaPostgresFact]
    public async Task ConcurrentUploadReservationsRespectGlobalLimit()
    {
        await using var test = await Database.CreateAsync();
        test.StorageOptions.MaxPendingUploadsPerOwner = 1;
        var owner = Guid.NewGuid();
        async Task<bool> Create()
        {
            await using var db = test.Media();
            try
            {
                await test.Library(db).CreateAsync(owner, new("One", "video/mp4", 24), default);
                return true;
            }
            catch (ApiException error) when (error.Status == 429) { return false; }
        }
        Assert.Single(await Task.WhenAll(Create(), Create()), x => x);
    }

    [MediaPostgresFact]
    public async Task DeletingPendingUploadKeepsQuotaReservedUntilCapabilityExpires()
    {
        await using var test = await Database.CreateAsync();
        test.StorageOptions.MaxPendingUploadsPerOwner = 1;
        var owner = Guid.NewGuid();
        await using var db = test.Media();
        var media = test.Library(db);
        var ticket = await media.CreateAsync(owner, new("First", "video/mp4", 24), default);
        await media.DeleteAsync(ticket.File.Id, owner, ticket.File.Version, default);

        var error = await Assert.ThrowsAsync<ApiException>(() => media.CreateAsync(owner, new("Second", "video/mp4", 24), default));
        Assert.Equal("LIMIT_EXCEEDED", error.Code);
        Assert.Equal(0, await media.CleanupAsync(default));

        await db.Files.Where(x => x.Id == ticket.File.Id).ExecuteUpdateAsync(update =>
            update.SetProperty(x => x.UploadExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        var replacement = await media.CreateAsync(owner, new("Second", "video/mp4", 24), default);
        Assert.NotEqual(ticket.File.Id, replacement.File.Id);
    }

    [MediaPostgresFact]
    public async Task DeletedPendingUploadRemainsInReportedUsageUntilCapabilityExpires()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        await using var db = test.Media();
        var media = test.Library(db);
        var usage = new MediaLimitUsage(db, Options.Create(test.StorageOptions));
        var ticket = await media.CreateAsync(owner, new("First", "video/mp4", 24), default);
        await media.DeleteAsync(ticket.File.Id, owner, ticket.File.Version, default);

        Assert.Equal(1, (await usage.GetUsageAsync(owner, default)).Single(x => x.Key == "media.maxPendingUploads").Used);
        Assert.Equal(0, (await usage.GetUsageAsync(Guid.NewGuid(), default)).Single(x => x.Key == "media.maxPendingUploads").Used);

        await db.Files.Where(x => x.Id == ticket.File.Id).ExecuteUpdateAsync(update =>
            update.SetProperty(x => x.UploadExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        Assert.Equal(0, (await usage.GetUsageAsync(owner, default)).Single(x => x.Key == "media.maxPendingUploads").Used);
    }

    [MediaPostgresFact]
    public async Task DeletionWaitsForUploadTokenAndStorageFailuresRetry()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        var id = await test.ReadyAsync(owner);
        await using var db = test.Media();
        var media = test.Library(db);
        await media.DeleteAsync(id, owner, 2, default);
        Assert.Equal(0, await media.CleanupAsync(default));
        Assert.Equal(0, test.Storage.Deletes);
        await db.Files.Where(x => x.Id == id).ExecuteUpdateAsync(u => u.SetProperty(x => x.DeleteAfter, DateTimeOffset.UtcNow.AddMinutes(-1)));
        test.Storage.FailDelete = true;
        Assert.Equal(0, await media.CleanupAsync(default));
        Assert.Equal(1, (await db.Files.AsNoTracking().SingleAsync()).DeleteAttempts);
        test.Storage.FailDelete = false;
        await db.Files.Where(x => x.Id == id).ExecuteUpdateAsync(u => u.SetProperty(x => x.DeleteAfter, DateTimeOffset.UtcNow.AddMinutes(-1)));
        Assert.Equal(1, await media.CleanupAsync(default));
    }

    [MediaPostgresFact]
    public async Task ConcurrentIdempotentRequestsCreateOneJobAndPin()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        var id = await test.ReadyAsync(owner);
        var request = Request(id);
        async Task<AnalysisDto> Create()
        {
            await using var db = test.Analysis();
            await using var mediaDb = test.Media();
            return await test.AnalysisLibrary(db, mediaDb).CreateAsync(owner, "same", request, default);
        }
        var jobs = await Task.WhenAll(Create(), Create());
        Assert.Equal(jobs[0].Id, jobs[1].Id);
        await using var check = test.Analysis();
        await using var files = test.Media();
        Assert.Equal(1, await check.Jobs.CountAsync());
        Assert.True((await files.Files.SingleAsync()).Pinned);
        Assert.Equal("MEDIA_IN_USE", (await Assert.ThrowsAsync<ApiException>(() => test.Library(files).DeleteAsync(id, owner, 3, default))).Code);
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ApiException>(() => test.AnalysisLibrary(check, files).CreateAsync(owner, "same", request with { Name = "different" }, default))).Code);
    }

    [MediaPostgresFact]
    public async Task DefaultAdmissionHasTheSameTechnicalLimitForEveryOwner()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        var id = await test.ReadyAsync(owner);
        await using var db = test.Analysis();
        await using var mediaDb = test.Media();
        for (var i = 0; i < 2; i++)
            await test.AnalysisLibrary(db, mediaDb).CreateAsync(owner, "technical-" + i, Request(id), default);
        var error = await Assert.ThrowsAsync<ApiException>(() => test.AnalysisLibrary(db, mediaDb).CreateAsync(owner, "third", Request(id), default));
        Assert.Equal(429, error.Status);
        Assert.Equal(2, await db.Jobs.CountAsync());
        Assert.Single(await new AnalysisLimitUsage(db, Options.Create(test.AnalysisOptions)).GetUsageAsync(owner, default));
    }

    [MediaPostgresFact]
    public async Task ParallelAdmissionCannotExceedOwnerQuota()
    {
        await using var test = await Database.CreateAsync();
        test.AnalysisOptions.MaxConcurrentPerOwner = 1;
        var owner = Guid.NewGuid();
        var id = await test.ReadyAsync(owner);
        async Task<bool> Create(string key)
        {
            await using var db = test.Analysis();
            await using var mediaDb = test.Media();
            try
            {
                await test.AnalysisLibrary(db, mediaDb).CreateAsync(owner, key, Request(id), default);
                return true;
            }
            catch (ApiException error) when (error.Status == 429) { return false; }
        }
        Assert.Single(await Task.WhenAll(Create("a"), Create("b")), x => x);
    }

    [MediaPostgresFact]
    public async Task PinAndJobRollbackTogetherWhenAdmissionFails()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        var id = await test.ReadyAsync(owner);
        await using var db = test.Analysis();
        await using var mediaDb = test.Media();
        var service = new AnalysisLibrary(db, new ThrowAfterPin(test.Library(mediaDb)), new FakeAnalyzer(), Options.Create(test.AnalysisOptions));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync(owner, "rollback", Request(id), default));
        Assert.False((await mediaDb.Files.AsNoTracking().SingleAsync()).Pinned);
        Assert.Empty(await db.Jobs.AsNoTracking().ToListAsync());
    }

    [MediaPostgresFact]
    public async Task ExpiredLeaseCanBeReclaimedButCannotWriteTwice()
    {
        await using var test = await Database.CreateAsync();
        var id = await test.EnqueueAsync();
        await using var db = test.Analysis();
        var queue = test.Queue(db);
        var first = (await queue.ClaimAsync(default))!;
        Assert.Equal(id, first.Id);
        Assert.Null(await queue.ClaimAsync(default));
        await db.Jobs.Where(x => x.Id == id).ExecuteUpdateAsync(u => u.SetProperty(x => x.LeaseExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        var second = (await queue.ClaimAsync(default))!;
        Assert.NotEqual(first.LeaseToken, second.LeaseToken);
        Assert.False(await queue.HeartbeatAsync(id, first.LeaseToken!.Value, default));
        Assert.False(await queue.CompleteAsync(id, first.LeaseToken.Value, Result(), default));
        Assert.True(await queue.CompleteAsync(id, second.LeaseToken!.Value, Result(), default));
        Assert.False(await queue.CompleteAsync(id, second.LeaseToken.Value, Result(), default));
        Assert.Equal("Completed", (await db.Jobs.AsNoTracking().SingleAsync()).Status);
    }

    [MediaPostgresFact]
    public async Task ConcurrentWorkersClaimDistinctJobs()
    {
        await using var test = await Database.CreateAsync();
        await test.EnqueueAsync();
        await test.EnqueueAsync();
        async Task<Guid> Claim()
        {
            await using var db = test.Analysis();
            return (await test.Queue(db).ClaimAsync(default))!.Id;
        }
        var claimed = await Task.WhenAll(Claim(), Claim());
        Assert.NotEqual(claimed[0], claimed[1]);
    }

    [MediaPostgresFact]
    public async Task CancellationFencesActiveWorkerAndCrossOwnerReads()
    {
        await using var test = await Database.CreateAsync();
        var id = await test.EnqueueAsync();
        await using var db = test.Analysis();
        await using var files = test.Media();
        var job = (await test.Queue(db).ClaimAsync(default))!;
        var library = test.AnalysisLibrary(db, files);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => library.GetAsync(id, Guid.NewGuid(), default))).Status);
        await library.CancelAsync(id, job.OwnerId, job.Version, default);
        Assert.False(await test.Queue(db).CompleteAsync(id, job.LeaseToken!.Value, Result(), default));
        Assert.False(await test.Queue(db).HeartbeatAsync(id, job.LeaseToken.Value, default));
    }

    [MediaPostgresFact]
    public async Task MissingAnalyzerRejectsAdmissionAndWorkerDoesNotComplete()
    {
        await using var test = await Database.CreateAsync();
        await using var db = test.Analysis();
        await using var files = test.Media();
        var library = new AnalysisLibrary(db, test.Library(files), new UnavailableVideoAnalyzer(), Options.Create(test.AnalysisOptions));
        Assert.Equal("ANALYZER_NOT_CONFIGURED", (await Assert.ThrowsAsync<ApiException>(() => library.CreateAsync(Guid.NewGuid(), "missing", Request(Guid.NewGuid()), default))).Code);
        Assert.Empty(await db.Jobs.AsNoTracking().ToListAsync());
        var id = await test.EnqueueAsync();
        await using var services = test.WorkerServices(new UnavailableVideoAnalyzer());
        Assert.True(await services.GetRequiredService<AnalysisWorkerRunner>().RunOnceAsync(default));
        var job = await db.Jobs.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal("Failed", job.Status);
        Assert.Equal("ANALYZER_NOT_CONFIGURED", job.FailureCode);
        Assert.Null(job.Result);
    }

    [MediaPostgresFact]
    public async Task TestOnlyAdapterExercisesWorkerAndBoundedResultRead()
    {
        await using var test = await Database.CreateAsync();
        var id = await test.EnqueueAsync();
        await using var services = test.WorkerServices(new FakeAnalyzer());
        Assert.True(await services.GetRequiredService<AnalysisWorkerRunner>().RunOnceAsync(default));
        await using var db = test.Analysis();
        await using var files = test.Media();
        var job = await db.Jobs.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal("Completed", job.Status);
        var result = await test.AnalysisLibrary(db, files).ResultAsync(id, job.OwnerId, null, 2, default);
        Assert.Equal(2, result.Trajectory.Length);
        Assert.Equal("px", result.PositionUnit);
    }

    [MediaPostgresFact]
    public async Task ExhaustedCrashedLeaseBecomesFailed()
    {
        await using var test = await Database.CreateAsync();
        test.AnalysisOptions.MaxAttempts = 1;
        var id = await test.EnqueueAsync();
        await using var db = test.Analysis();
        await test.Queue(db).ClaimAsync(default);
        await db.Jobs.Where(x => x.Id == id).ExecuteUpdateAsync(u => u.SetProperty(x => x.LeaseExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        Assert.Null(await test.Queue(db).ClaimAsync(default));
        Assert.Equal("WORKER_ATTEMPTS_EXHAUSTED", (await db.Jobs.AsNoTracking().SingleAsync()).FailureCode);
    }

    [MediaPostgresFact]
    public async Task Queue_admission_is_atomic_across_owners_and_idempotent_retries_do_not_enqueue()
    {
        await using var test = await Database.CreateAsync();
        test.AnalysisOptions.MaxQueuedJobs = 1;
        var owners = new[] { Guid.NewGuid(), Guid.NewGuid() };
        var videos = new[] { await test.ReadyAsync(owners[0]), await test.ReadyAsync(owners[1]) };
        async Task<bool> Enqueue(int index)
        {
            await using var db = test.Analysis(); await using var files = test.Media();
            try { await test.AnalysisLibrary(db, files).CreateAsync(owners[index], "bounded", Request(videos[index]), default); return true; }
            catch (ApiException error) when (error.Status == 429) { return false; }
        }
        var results = await Task.WhenAll(Enqueue(0), Enqueue(1));
        Assert.Single(results, x => x);
        var winner = Array.IndexOf(results, true);
        Assert.True(await Enqueue(winner));
        await using var check = test.Analysis();
        Assert.Equal(1, await check.Jobs.CountAsync());
    }

    [MediaPostgresFact]
    public async Task Shared_link_reads_one_completed_analysis_until_revoked()
    {
        await using var test = await Database.CreateAsync();
        var id = await test.EnqueueAsync();
        await using var db = test.Analysis();
        await using var files = test.Media();
        var owner = (await db.Jobs.AsNoTracking().SingleAsync(x => x.Id == id)).OwnerId;
        var sharing = new AnalysisSharing(db, test.Library(files));

        // Only a completed analysis can be shared, and only by its owner.
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => sharing.ShareAsync(id, owner, default))).Status);
        await db.Jobs.Where(x => x.Id == id).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.Status, "Completed").SetProperty(x => x.Result, JsonSerializer.Serialize(Result(), AnalysisResults.Json)));
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => sharing.ShareAsync(id, Guid.NewGuid(), default))).Status);

        var link = await sharing.ShareAsync(id, owner, default);
        Assert.Equal(43, link.Token.Length);
        Assert.Equal(link.Token, (await sharing.ShareAsync(id, owner, default)).Token);
        Assert.Equal(link.Token, (await sharing.CurrentAsync(id, owner, default))!.Token);

        // Anyone with the token reads the analysis, its result and a video URL charged to them.
        var shared = await sharing.ReadAsync(link.Token, default);
        Assert.Equal("Analysis", shared.Name);
        Assert.True(shared.HasVideo);
        Assert.Equal(2, (await sharing.ResultAsync(link.Token, null, 2, default)).Trajectory.Length);
        Assert.False(string.IsNullOrEmpty((await sharing.VideoUrlAsync(link.Token, Guid.NewGuid(), default)).Url));

        // Guesses and revoked links look the same: not found.
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => sharing.ReadAsync(new string('a', 43), default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => sharing.ReadAsync("short", default))).Status);
        await sharing.RevokeAsync(id, owner, default);
        Assert.Null(await sharing.CurrentAsync(id, owner, default));
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => sharing.ResultAsync(link.Token, null, 2, default))).Status);

        // Sharing again issues a new link; the revoked one stays dead.
        var again = await sharing.ShareAsync(id, owner, default);
        Assert.NotEqual(link.Token, again.Token);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => sharing.ReadAsync(link.Token, default))).Status);
    }

    private static CreateAnalysisRequest Request(Guid id) => new("Analysis", null, ["test"], id, new());
    private static AnalysisResult Result() => new(1, "test-engine", "test-model", "test-only", "px", null, [],
        Enumerable.Range(0, 10).Select(x => new TrajectoryPoint(x, x, x, null, 1, false)).ToArray(), ["Test adapter only"]);
    private sealed class FakeAnalyzer : IVideoAnalyzer
    {
        public bool IsConfigured => true;
        public Task<AnalysisResult> AnalyzeAsync(Stream source, AnalysisConfiguration configuration, CancellationToken ct) => Task.FromResult(Result());
    }
    private sealed class ThrowAfterPin(IMediaLibrary inner) : IMediaLibrary
    {
        public Task<ReadyMedia> RequireReadyAsync(Guid id, Guid ownerId, CancellationToken ct) => inner.RequireReadyAsync(id, ownerId, ct);
        public Task<Stream> OpenReadAsync(Guid id, Guid ownerId, CancellationToken ct) => inner.OpenReadAsync(id, ownerId, ct);
        public async Task PinAsync(Guid id, Guid ownerId, CancellationToken ct)
        {
            await inner.PinAsync(id, ownerId, ct);
            throw new InvalidOperationException("Admission failure");
        }
    }
    private sealed class FakeStorage : IPrivateObjectStorage
    {
        public byte[] Bytes = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109, 0, 0, 0, 0];
        public int Inspections; public int Deletes; public bool FailDelete;
        public string ContentType = "video/mp4";
        public Task<string> CreateUploadUrlAsync(string bucket, string key, CancellationToken ct) => Task.FromResult("https://storage.invalid/upload");
        public Task<string> CreateReadUrlAsync(string bucket, string key, CancellationToken ct) => Task.FromResult("https://storage.invalid/read");
        public Task<StoredObject> InspectAsync(string bucket, string key, CancellationToken ct)
        {
            Interlocked.Increment(ref Inspections);
            return Task.FromResult(new StoredObject(Bytes.Length, ContentType, Bytes));
        }
        public Task<Stream> OpenReadAsync(string bucket, string key, CancellationToken ct) => Task.FromResult<Stream>(new MemoryStream(Bytes));
        public Task DeleteAsync(string bucket, string key, CancellationToken ct)
        {
            Interlocked.Increment(ref Deletes);
            if (FailDelete)
                throw new ApiException(503, "STORAGE_UNAVAILABLE", "Test failure");
            return Task.CompletedTask;
        }
    }

    private sealed class Database(NpgsqlDataSource source, string adminConnection, string name) : IAsyncDisposable
    {
        public FakeStorage Storage { get; } = new();
        public StorageOptions StorageOptions { get; } = new() { Bucket = "test-private" };
        public AnalysisOptions AnalysisOptions { get; } = new();
        public QueryCounter Counter { get; } = new();
        public MediaDbContext Media() => new(new DbContextOptionsBuilder<MediaDbContext>().UseNpgsql(source, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "media")).AddInterceptors(Counter).Options);
        public VideoAnalysisDbContext Analysis() => new(new DbContextOptionsBuilder<VideoAnalysisDbContext>().UseNpgsql(source, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "video_analysis")).AddInterceptors(Counter).Options);
        public MediaLibrary Library(MediaDbContext db) => new(db, Storage, Options.Create(StorageOptions));
        public AnalysisLibrary AnalysisLibrary(VideoAnalysisDbContext db, MediaDbContext files) => new(db, Library(files), new FakeAnalyzer(), Options.Create(AnalysisOptions));
        public AnalysisQueue Queue(VideoAnalysisDbContext db) => new(db, Options.Create(AnalysisOptions));
        public async Task<Guid> ReadyAsync(Guid owner)
        {
            await using var db = Media();
            var library = Library(db);
            var ticket = await library.CreateAsync(owner, new("Video", "video/mp4", Storage.Bytes.Length), default);
            await library.FinalizeAsync(ticket.File.Id, owner, default);
            return ticket.File.Id;
        }
        public async Task<Guid> EnqueueAsync()
        {
            var owner = Guid.NewGuid();
            var id = await ReadyAsync(owner);
            await using var db = Analysis();
            await using var files = Media();
            return (await AnalysisLibrary(db, files).CreateAsync(owner, Guid.NewGuid().ToString(), Request(id), default)).Id;
        }
        public ServiceProvider WorkerServices(IVideoAnalyzer analyzer)
        {
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddSingleton(Options.Create(AnalysisOptions));
            services.AddSingleton(analyzer);
            services.AddScoped(_ => Analysis());
            services.AddScoped(_ => Media());
            services.AddScoped<AnalysisQueue>();
            services.AddScoped<IMediaLibrary>(sp => Library(sp.GetRequiredService<MediaDbContext>()));
            services.AddSingleton<AnalysisWorkerRunner>();
            return services.BuildServiceProvider();
        }
        public static async Task<Database> CreateAsync()
        {
            var admin = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
            var name = "media_test_" + Guid.NewGuid().ToString("N");
            await using (var connection = new NpgsqlConnection(admin))
            {
                await connection.OpenAsync();
                await using var command = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", connection);
                await command.ExecuteNonQueryAsync();
            }
            var builder = new NpgsqlConnectionStringBuilder(admin) { Database = name };
            var test = new Database(NpgsqlDataSource.Create(builder.ConnectionString), admin, name);
            await using var media = test.Media();
            await media.Database.MigrateAsync();
            await using var analysis = test.Analysis();
            await analysis.Database.MigrateAsync();
            return test;
        }
        public async ValueTask DisposeAsync()
        {
            await source.DisposeAsync();
            await using var connection = new NpgsqlConnection(adminConnection);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand($"DROP DATABASE \"{name}\"", connection);
            await command.ExecuteNonQueryAsync();
        }
    }

    private sealed class QueryCounter : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            lock (Commands)
                Commands.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }
}

public sealed class MediaPostgresFactAttribute : FactAttribute
{
    public MediaPostgresFactAttribute()
    {
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")))
            Skip = "Set TRAINFLOW_TEST_DATABASE to a disposable PostgreSQL instance with CREATE DATABASE permission.";
    }
}
