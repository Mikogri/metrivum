using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Options;
using Npgsql;
using TrainFlow.BuildingBlocks;
using TrainFlow.Media;
using TrainFlow.Media.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class MediaQuotaTests
{
    [MediaPostgresFact]
    public async Task Three_parallel_uploads_share_all_routes_and_survive_new_service_instances()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        var outcomes = await Task.WhenAll(Enumerable.Range(0, 12).Select(async index =>
        {
            await using var db = test.Context();
            var library = test.Library(db);
            try
            {
                if (index % 3 == 0) await library.CreateAsync(owner, new("Video", "video/mp4", 24), default);
                else if (index % 3 == 1) await library.CreateMessagingAsync(owner, new("Chat", "text/plain", 24), default);
                else await library.CreateDocumentUploadAsync(Guid.NewGuid(), owner, "Document", "text/plain", 24, default);
                return true;
            }
            catch (ApiException error) when (error.Status == 429) { Assert.NotNull(error.RetryAfter); return false; }
        }));
        Assert.Equal(3, outcomes.Count(x => x));
        await using var verify = test.Context();
        Assert.Equal(3, await verify.Files.CountAsync(x => x.OwnerId == owner));
        Assert.All(await verify.Files.ToArrayAsync(), file => Assert.Equal(524288000, file.ReservedStorageBytes));
        await test.Library(verify).CreateAsync(Guid.NewGuid(), new("Other user", "video/mp4", 24), default);
    }

    [MediaPostgresFact]
    public async Task Exactly_two_GiB_daily_boundary_is_durable_and_deletion_cannot_refund_it()
    {
        await using var test = await Database.CreateAsync();
        test.StorageOptions.MaxVideoBytes = test.StorageOptions.MaxAttachmentBytes = 24;
        var owner = Guid.NewGuid();
        await using (var setup = test.Context())
        {
            setup.Files.Add(File(owner, test.Quotas.DailyBytes - 24, "Deleted"));
            await setup.SaveChangesAsync();
        }
        await using (var firstProcess = test.Context())
            await test.Library(firstProcess).CreateDocumentUploadAsync(Guid.NewGuid(), owner, "Boundary", "text/plain", 24, default);
        await using var restarted = test.Context();
        var error = await Assert.ThrowsAsync<ApiException>(() => test.Library(restarted).CreateMessagingAsync(owner, new("Over", "text/plain", 1), default));
        Assert.Equal(429, error.Status);
        Assert.Equal(2, await restarted.Files.CountAsync());
    }

    [MediaPostgresFact]
    public async Task Hourly_thirtieth_is_allowed_and_thirty_first_is_rejected_after_restart()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        await using (var setup = test.Context())
        {
            setup.Files.AddRange(Enumerable.Range(0, 29).Select(_ => File(owner, 1, "Deleted")));
            await setup.SaveChangesAsync();
        }
        await using (var first = test.Context())
            await test.Library(first).CreateAsync(owner, new("Thirtieth", "video/mp4", 24), default);
        await using var restarted = test.Context();
        Assert.Equal(429, (await Assert.ThrowsAsync<ApiException>(() => test.Library(restarted).CreateAsync(owner, new("Blocked", "video/mp4", 24), default))).Status);
    }

    [MediaPostgresFact]
    public async Task Global_budget_is_atomic_across_owners_and_reserves_bucket_maximum()
    {
        await using var test = await Database.CreateAsync();
        test.Quotas.GlobalStorageBytes = 524288000;
        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(async _ =>
        {
            await using var db = test.Context();
            try { await test.Library(db).CreateMessagingAsync(Guid.NewGuid(), new("Tiny", "text/plain", 1), default); return true; }
            catch (ApiException error) when (error.Status == 429) { return false; }
        }));
        Assert.Single(results, x => x);
    }

    [MediaPostgresFact]
    public async Task Parallel_daily_reservations_cannot_exceed_remaining_bytes()
    {
        await using var test = await Database.CreateAsync();
        test.StorageOptions.MaxVideoBytes = test.StorageOptions.MaxAttachmentBytes = 24;
        var owner = Guid.NewGuid();
        await using (var setup = test.Context())
        {
            setup.Files.Add(File(owner, test.Quotas.DailyBytes - 24, "Deleted"));
            await setup.SaveChangesAsync();
        }
        var accepted = await Task.WhenAll(Enumerable.Range(0, 8).Select(async _ =>
        {
            await using var db = test.Context();
            try { await test.Library(db).CreateMessagingAsync(owner, new("Bytes", "text/plain", 16), default); return true; }
            catch (ApiException error) when (error.Status == 429) { return false; }
        }));
        Assert.Single(accepted, x => x);
    }

    [MediaPostgresFact]
    public async Task Underdeclared_failed_uploads_cannot_recycle_daily_bucket_liability_after_deletion()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        test.Storage.Actual = new(test.StorageOptions.MaxVideoBytes, "video/mp4", Storage.Mp4);
        for (var index = 0; index < 4; index++)
        {
            await using var db = test.Context();
            var library = test.Library(db);
            var ticket = await library.CreateAsync(owner, new("Underdeclared", "video/mp4", 1), default);
            Assert.Equal("MEDIA_SIZE_INVALID", (await Assert.ThrowsAsync<ApiException>(() => library.FinalizeAsync(ticket.File.Id, owner, default))).Code);
            await library.DeleteAsync(ticket.File.Id, owner, ticket.File.Version, default);
            // Simulate expired capability and completed cleanup within the same rolling day.
            await db.Files.Where(x => x.Id == ticket.File.Id).ExecuteUpdateAsync(update => update
                .SetProperty(x => x.UploadExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1))
                .SetProperty(x => x.DeleteAfter, DateTimeOffset.UtcNow.AddMinutes(-1)));
            Assert.Equal(1, await library.CleanupAsync(default));
        }
        await using var restarted = test.Context();
        Assert.Equal(429, (await Assert.ThrowsAsync<ApiException>(() => test.Library(restarted).CreateAsync(owner, new("Blocked", "video/mp4", 1), default))).Status);
        Assert.Equal(4, test.Storage.Signs);
        Assert.All(await restarted.Files.ToArrayAsync(), file =>
        {
            Assert.Equal("Deleted", file.State);
            Assert.Null(file.AcceptedAt);
            Assert.Equal(524288000, file.ReservedStorageBytes);
        });
    }

    [MediaPostgresFact]
    public async Task Verified_small_file_settles_daily_liability_to_actual_bytes()
    {
        await using var test = await Database.CreateAsync();
        test.Quotas.DailyBytes = test.StorageOptions.MaxVideoBytes + 24;
        var owner = Guid.NewGuid();
        await using var db = test.Context();
        var library = test.Library(db);
        var first = await library.CreateAsync(owner, new("Valid", "video/mp4", 24), default);
        Assert.Equal(429, (await Assert.ThrowsAsync<ApiException>(() => library.CreateAsync(owner, new("Wait", "video/mp4", 24), default))).Status);
        await library.FinalizeAsync(first.File.Id, owner, default);
        await using var restarted = test.Context();
        await test.Library(restarted).CreateAsync(owner, new("Now allowed", "video/mp4", 24), default);
        Assert.Equal(2, test.Storage.Signs);
        Assert.Equal(2 * 524288000L, await restarted.Files.SumAsync(x => x.ReservedStorageBytes));
    }

    [MediaPostgresFact]
    public async Task Upgrade_preserves_rows_and_reserves_legacy_capability_maximum()
    {
        await using var test = await Database.CreateAsync(latest: false);
        await using var db = test.Context();
        var owner = Guid.NewGuid();
        var id = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO media.files ("Id","OwnerId","Purpose","Name","Bucket","ObjectKey","ContentType","Size","State","Pinned","CreatedAt","UploadExpiresAt","DeleteAttempts","Version")
            VALUES ({id},{owner},'Video','Legacy','test-private','legacy.mp4','video/mp4',24,'Pending',false,{now},{now.AddHours(2)},0,1)
            """);
        await db.Database.MigrateAsync();
        var legacy = await db.Files.SingleAsync();
        Assert.Equal(id, legacy.Id);
        Assert.Equal(24, legacy.Size);
        Assert.Equal(2147483648, legacy.ReservedStorageBytes);
        Assert.Null(legacy.AcceptedAt);
    }

    [MediaPostgresFact]
    public async Task Failed_signer_retains_reservation_and_cleanup_is_bounded_and_retries_failed_deletes()
    {
        await using var test = await Database.CreateAsync();
        test.Storage.FailSign = true;
        test.Quotas.CleanupBatchSize = 2;
        var owner = Guid.NewGuid();
        await using var db = test.Context();
        for (var index = 0; index < 3; index++)
            Assert.Equal(503, (await Assert.ThrowsAsync<ApiException>(() => test.Library(db).CreateAsync(owner, new("Fail", "video/mp4", 24), default))).Status);
        Assert.Equal(429, (await Assert.ThrowsAsync<ApiException>(() => test.Library(db).CreateAsync(owner, new("Fourth", "video/mp4", 24), default))).Status);
        await db.Files.ExecuteUpdateAsync(update => update.SetProperty(x => x.UploadExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        test.Storage.FailDelete = true;
        Assert.Equal(0, await test.Library(db).CleanupAsync(default));
        Assert.Equal(2, test.Storage.Deletes);
        Assert.Equal(1, await db.Files.CountAsync(x => x.State == "Pending"));
        Assert.Equal(2, await db.Files.CountAsync(x => x.State == "Deleting" && x.DeleteAttempts == 1));
        test.Storage.FailDelete = false;
        await db.Files.Where(x => x.State == "Deleting").ExecuteUpdateAsync(update => update.SetProperty(x => x.DeleteAfter, DateTimeOffset.UtcNow.AddMinutes(-1)));
        Assert.Equal(2, await test.Library(db).CleanupAsync(default));
        Assert.Equal(3, await db.Files.CountAsync()); // History remains charged for the daily budget.
    }

    [MediaPostgresFact]
    public async Task Finalization_checks_actual_size_MIME_and_magic_before_accepting_bytes()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        await using var db = test.Context();
        var library = test.Library(db);
        var ticket = await library.CreateAsync(owner, new("Video", "video/mp4", 24), default);
        test.Storage.Actual = new(25, "video/mp4", Storage.Mp4);
        Assert.Equal("MEDIA_SIZE_INVALID", (await Assert.ThrowsAsync<ApiException>(() => library.FinalizeAsync(ticket.File.Id, owner, default))).Code);
        test.Storage.Actual = new(24, "text/plain", Storage.Mp4);
        Assert.Equal("MEDIA_FORMAT_INVALID", (await Assert.ThrowsAsync<ApiException>(() => library.FinalizeAsync(ticket.File.Id, owner, default))).Code);
        test.Storage.Actual = new(24, "video/mp4", new byte[24]);
        Assert.Equal("MEDIA_FORMAT_INVALID", (await Assert.ThrowsAsync<ApiException>(() => library.FinalizeAsync(ticket.File.Id, owner, default))).Code);
        Assert.Null((await db.Files.AsNoTracking().SingleAsync()).AcceptedAt);
        test.Storage.Actual = new(24, "video/mp4", Storage.Mp4);
        Assert.Equal("Ready", (await library.FinalizeAsync(ticket.File.Id, owner, default)).State);
        var ready = await db.Files.AsNoTracking().SingleAsync();
        Assert.NotNull(ready.AcceptedAt);
        Assert.Equal(524288000, ready.ReservedStorageBytes); // Capability must expire before physical liability shrinks.
    }

    [MediaPostgresFact]
    public async Task Recent_acceptance_of_old_ticket_still_counts_toward_rolling_day()
    {
        await using var test = await Database.CreateAsync();
        var owner = Guid.NewGuid();
        await using var db = test.Context();
        var file = File(owner, test.Quotas.DailyBytes, "Ready");
        file.CreatedAt = DateTimeOffset.UtcNow.AddDays(-2);
        file.AcceptedAt = DateTimeOffset.UtcNow;
        db.Files.Add(file);
        await db.SaveChangesAsync();
        Assert.Equal(429, (await Assert.ThrowsAsync<ApiException>(() => test.Library(db).CreateAsync(owner, new("Blocked", "video/mp4", 24), default))).Status);
    }

    [MediaPostgresFact]
    public async Task Failed_database_reservation_never_issues_storage_capability()
    {
        await using var test = await Database.CreateAsync();
        await using var db = test.Context();
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION media.reject_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'synthetic reservation failure'; END $$;
            CREATE TRIGGER reject_reservation BEFORE INSERT ON media.files FOR EACH ROW EXECUTE FUNCTION media.reject_reservation();
            """);
        await Assert.ThrowsAsync<DbUpdateException>(() => test.Library(db).CreateAsync(Guid.NewGuid(), new("Failure", "video/mp4", 24), default));
        Assert.Equal(0, test.Storage.Signs);
        Assert.Equal(0, await db.Files.CountAsync());
    }

    private static MediaFile File(Guid owner, long size, string state) => new()
    {
        Id = Guid.NewGuid(), OwnerId = owner, Name = "Fixture", Bucket = "test-private", ObjectKey = Guid.NewGuid().ToString("N"),
        Size = size, State = state, ContentType = "video/mp4", CreatedAt = DateTimeOffset.UtcNow,
        UploadExpiresAt = DateTimeOffset.UtcNow.AddHours(-1), ReservedStorageBytes = size
    };

    private sealed class Storage : IPrivateObjectStorage
    {
        internal static readonly byte[] Mp4 = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109, 0, 0, 0, 0];
        internal StoredObject Actual = new(24, "video/mp4", Mp4);
        internal bool FailSign, FailDelete;
        internal int Deletes, Signs;
        public Task<string> CreateUploadUrlAsync(string bucket, string key, CancellationToken ct)
        {
            Interlocked.Increment(ref Signs);
            return FailSign ? throw new ApiException(503, "STORAGE_UNAVAILABLE", "Test failure") : Task.FromResult("https://storage.invalid/upload");
        }
        public Task<string> CreateReadUrlAsync(string bucket, string key, CancellationToken ct) => Task.FromResult("https://storage.invalid/read");
        public Task<StoredObject> InspectAsync(string bucket, string key, CancellationToken ct) => Task.FromResult(Actual);
        public Task<Stream> OpenReadAsync(string bucket, string key, CancellationToken ct) => Task.FromResult<Stream>(new MemoryStream(Mp4));
        public Task DeleteAsync(string bucket, string key, CancellationToken ct)
        {
            Deletes++;
            if (FailDelete) throw new ApiException(503, "STORAGE_UNAVAILABLE", "Test failure");
            return Task.CompletedTask;
        }
    }

    private sealed class Database(NpgsqlDataSource source, string admin, string name) : IAsyncDisposable
    {
        internal Storage Storage { get; } = new();
        internal StorageOptions StorageOptions { get; } = new() { Bucket = "test-private" };
        internal MediaQuotaOptions Quotas { get; } = new();
        internal MediaDbContext Context() => new(new DbContextOptionsBuilder<MediaDbContext>()
            .UseNpgsql(source, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "media")).Options);
        internal MediaLibrary Library(MediaDbContext db) => new(db, Storage, Options.Create(StorageOptions), Options.Create(Quotas));
        internal static async Task<Database> CreateAsync(bool latest = true)
        {
            var admin = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
            var name = "media_quota_test_" + Guid.NewGuid().ToString("N");
            await using var connection = new NpgsqlConnection(admin);
            await connection.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", connection);
            await create.ExecuteNonQueryAsync();
            var database = new Database(NpgsqlDataSource.Create(new NpgsqlConnectionStringBuilder(admin) { Database = name }.ConnectionString), admin, name);
            await using var db = database.Context();
            if (latest) await db.Database.MigrateAsync();
            else await db.GetService<IMigrator>().MigrateAsync("20261007153121_MessagingAttachments");
            return database;
        }
        public async ValueTask DisposeAsync()
        {
            await source.DisposeAsync();
            await using var connection = new NpgsqlConnection(admin);
            await connection.OpenAsync();
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{name}\"", connection);
            await drop.ExecuteNonQueryAsync();
        }
    }
}
