using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Options;
using Npgsql;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.ClientDocumentation;
using TrainFlow.ClientDocumentation.Contracts;
using TrainFlow.ClientDocumentation.Infrastructure;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Coaching.Domain;
using TrainFlow.Coaching.Features;
using TrainFlow.Coaching.Infrastructure;
using TrainFlow.Media;
using TrainFlow.Media.Contracts;
using TrainFlow.Media.Infrastructure;
using TrainFlow.Notifications.Contracts;

namespace TrainFlow.IntegrationTests;

public sealed class DocumentationTests
{
    [MediaPostgresFact]
    public async Task Measurement_extremes_return_validation_errors_before_unit_conversion()
    {
        await using var f = await Fixture.Create();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        foreach (var value in new[] { decimal.MaxValue, decimal.MinValue })
            Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => coach.AddMeasurement(
                f.Relationship, new("height", "in", value, f.Now, null), default))).Status);
        var row = await coach.AddMeasurement(f.Relationship, new("height", "in", 100, f.Now, null), default);
        Assert.Equal(254m, row.Value);
        Assert.Equal("cm", row.Unit);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => coach.EditMeasurement(
            f.Relationship, row.Id, new("height", "in", decimal.MaxValue, f.Now, null), row.Version, default))).Status);
        Assert.Equal(254m, (await f.Docs.Measurements.AsNoTracking().SingleAsync(x => x.Id == row.Id)).Value);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => coach.AddMeasurement(
            f.Relationship, new("height", "in", 119, f.Now, null), default))).Status);
    }

    [MediaPostgresFact]
    public async Task Deleting_a_document_revokes_reads_and_notifications_but_retains_private_storage()
    {
        await using var f = await Fixture.Create();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        var client = f.Service(f.Client, AccountRole.Client);
        var upload = await coach.Upload(f.Relationship, new("photo.png", "image/png", f.Storage.Bytes.Length), default);
        await coach.FinalizeUpload(f.Relationship, upload.MediaId, default);
        var doc = await coach.AddDocument(f.Relationship, new("Photo", null, "ProgressPhoto", "SharedWithClient", null, upload.MediaId, f.Now), default);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.DeleteDocument(f.Relationship, doc.Id, doc.Version, default))).Status);
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => coach.DeleteDocument(f.Relationship, doc.Id, doc.Version + 1, default))).Status);
        await coach.DeleteDocument(f.Relationship, doc.Id, doc.Version, default);
        Assert.Empty((await coach.Documents(f.Relationship, null, null, 1, 25, default)).Items);
        Assert.Empty((await client.Documents(f.Relationship, null, null, 1, 25, default)).Items);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.ReadFile(f.Relationship, doc.Id, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => coach.ReadFile(f.Relationship, doc.Id, default))).Status);
        Assert.False(await coach.CanDeliverAsync(Assert.Single(f.Notifications.Events), default));
        Assert.NotNull((await f.Docs.Documents.SingleAsync(x => x.Id == doc.Id)).DeletedAt);
        Assert.True((await f.MediaDb.Files.AsNoTracking().SingleAsync(x => x.Id == upload.MediaId)).Pinned);
    }

    [MediaPostgresFact]
    public async Task Additive_migration_preserves_historical_measurements_and_initializes_edit_versions()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        Assert.Contains(connection.Host, new[] { "localhost", "127.0.0.1", "::1" });
        var name = "tf_docs_migration_" + Guid.NewGuid().ToString("N");
        await using var admin = NpgsqlDataSource.Create(connection.ConnectionString);
        await using (var create = admin.CreateCommand($"CREATE DATABASE {name}")) await create.ExecuteNonQueryAsync();
        connection.Database = name;
        try
        {
            await using var db = new DocumentationDbContext(new DbContextOptionsBuilder<DocumentationDbContext>().UseNpgsql(connection.ConnectionString).Options);
            var migrator = db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
            await migrator.MigrateAsync("20261008135028_ClientDocumentationInitial");
            var id = Guid.NewGuid(); var relationship = Guid.NewGuid(); var author = Guid.NewGuid(); var observed = DateTimeOffset.UtcNow;
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO client_documentation.measurements (\"Id\", \"RelationshipId\", \"AuthorId\", \"Source\", \"Key\", \"Unit\", \"Value\", \"ObservedAt\", \"CreatedAt\", \"UpdatedAt\") VALUES ({id}, {relationship}, {author}, 'Coach', 'weight', 'kg', 80, {observed}, {observed}, {observed})");
            await migrator.MigrateAsync();
            var row = await db.Measurements.SingleAsync();
            Assert.Equal(id, row.Id); Assert.Equal(80, row.Value); Assert.Equal(1, row.Version);
            Assert.False(db.Database.HasPendingModelChanges());
        }
        finally
        {
            NpgsqlConnection.ClearAllPools();
            await using var drop = admin.CreateCommand($"DROP DATABASE {name} WITH (FORCE)"); await drop.ExecuteNonQueryAsync();
        }
    }

    [MediaPostgresFact]
    public async Task Manual_measurements_can_be_corrected_with_concurrency_and_scope_checks()
    {
        await using var f = await Fixture.Create();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        var row = await coach.AddMeasurement(f.Relationship, new("body-fat", "%", 20, f.Now, null), default);
        var imperial = await coach.AddMeasurement(f.Relationship, new("weight", "lb", 100, f.Now, null), default);
        Assert.Equal("kg", imperial.Unit); Assert.Equal(45.359237m, imperial.Value);
        var changed = await coach.EditMeasurement(f.Relationship, row.Id, new("body-fat", "%", 18, f.Now, "Corrected"), row.Version, default);
        Assert.Equal(18, changed.Value);
        Assert.Equal("Manual", changed.Source);
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => coach.EditMeasurement(f.Relationship, row.Id, new("body-fat", "%", 19, f.Now, null), row.Version, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => coach.EditMeasurement(f.OtherClientRelationship, row.Id, new("body-fat", "%", 19, f.Now, null), changed.Version, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.Service(f.Client, AccountRole.Client).EditMeasurement(f.Relationship, row.Id, new("body-fat", "%", 19, f.Now, null), changed.Version, default))).Status);
        Assert.Equal(18, Assert.Single((await coach.Trend(f.Relationship, "body-fat", "%", f.Now.AddDays(-1), f.Now.AddDays(1), default)).Points).Value);
        foreach (var key in new[] { "weight", "waist", "chest", "arm", "thigh", "hip" })
            Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => coach.AddMeasurement(f.Relationship, new(key, key == "weight" ? "kg" : "cm", 0, f.Now, null), default))).Status);
    }

    [MediaPostgresFact]
    public async Task Notes_by_a_previous_coach_remain_author_private()
    {
        await using var f = await Fixture.Create();
        var foreign = new PrivateCoachNote { Id = Guid.NewGuid(), RelationshipId = f.Relationship, AuthorId = f.OtherCoach, Text = "Previous coach private", CreatedAt = f.Now, UpdatedAt = f.Now };
        f.Docs.Notes.Add(foreign);
        await f.Docs.SaveChangesAsync();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        Assert.Empty((await coach.Notes(f.Relationship, null, 1, 25, default)).Items);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => coach.SaveNote(f.Relationship, foreign.Id, new("Intrusion"), 1, default))).Status);
    }

    [MediaPostgresFact]
    public async Task Client_uploaded_file_cannot_be_rebound_or_downloaded_after_coach_makes_it_private()
    {
        await using var f = await Fixture.Create();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        var client = f.Service(f.Client, AccountRole.Client);
        var upload = await client.Upload(f.Relationship, new("Client.png", "image/png", f.Storage.Bytes.Length), default);
        await client.FinalizeUpload(f.Relationship, upload.MediaId, default);
        var input = new DocumentInput("Client photo", null, "ProgressPhoto", "SharedWithClient", null, upload.MediaId, f.Now);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => coach.AddDocument(f.OtherClientRelationship, input, default))).Status);
        var doc = await client.AddDocument(f.Relationship, input, default);
        await client.ReadFile(f.Relationship, doc.Id, default);
        await coach.Share(f.Relationship, doc.Id, new("CoachPrivate"), doc.Version, default);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.ReadFile(f.Relationship, doc.Id, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.Media.ReadUrlAsync(upload.MediaId, f.Client, default))).Status);
        Assert.Empty((await client.Documents(f.Relationship, "Client photo", null, 1, 25, default)).Items);
        Assert.DoesNotContain(await f.Media.ListAsync(f.Client, null, null, null, 1, 25, default), x => x.Id == upload.MediaId);
        Assert.Equal(1, f.Storage.ReadUrls);
    }

    [MediaPostgresFact]
    public async Task Two_database_contexts_cannot_overwrite_a_concurrently_changed_note()
    {
        await using var f = await Fixture.Create();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        var note = await coach.SaveNote(f.Relationship, null, new("Before"), 0, default);
        await using var secondDb = new DocumentationDbContext(new DbContextOptionsBuilder<DocumentationDbContext>().UseNpgsql(f.Docs.Database.GetConnectionString()).Options);
        await secondDb.Notes.SingleAsync(x => x.Id == note.Id);
        await coach.SaveNote(f.Relationship, note.Id, new("First tab saved"), 1, default);
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => f.Service(f.Coach, AccountRole.Coach, secondDb).SaveNote(f.Relationship, note.Id, new("Second tab stale"), 1, default))).Status);
        Assert.Equal("First tab saved", (await coach.Notes(f.Relationship, null, 1, 25, default)).Items.Single().Text);
    }

    [MediaPostgresFact]
    public async Task Private_notes_documents_and_measurements_are_relationship_scoped_and_completed_is_readonly()
    {
        await using var f = await Fixture.Create();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        var client = f.Service(f.Client, AccountRole.Client);
        var note = await coach.SaveNote(f.Relationship, null, new("Coach secret"), 0, default);
        var privateDoc = await coach.AddDocument(f.Relationship, TextDocument("Private title", "CoachPrivate"), default);
        var sharedDoc = await coach.AddDocument(f.Relationship, TextDocument("Shared title"), default);
        await coach.AddMeasurement(f.Relationship, new("waist", "cm", 81, f.Now, "Measured by coach"), default);
        await client.AddMeasurement(f.Relationship, new("weight", "kg", 70, f.Now, null), default);
        Assert.Equal(new[] { sharedDoc.Id }, (await client.Documents(f.Relationship, null, null, 1, 25, default)).Items.Select(x => x.Id));
        Assert.Equal(0, (await client.Documents(f.Relationship, "Private title", null, 1, 25, default)).Total);
        Assert.Equal(2, (await client.Measurements(f.Relationship, f.Now.AddDays(-1), f.Now.AddDays(1), 1, 25, default)).Total);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.Notes(f.Relationship, null, 1, 25, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.SaveNote(f.Relationship, note.Id, new("intrusion"), 1, default))).Status);
        var otherCoach = f.Service(f.OtherCoach, AccountRole.Coach);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => otherCoach.Documents(f.Relationship, null, null, 1, 25, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => otherCoach.Notes(f.Relationship, null, 1, 25, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.Documents(f.OtherClientRelationship, null, null, 1, 25, default))).Status);
        var changed = await coach.Share(f.Relationship, sharedDoc.Id, new("CoachPrivate"), sharedDoc.Version, default);
        Assert.Empty((await client.Documents(f.Relationship, null, null, 1, 25, default)).Items);
        await coach.Share(f.Relationship, changed.Id, new("SharedWithClient"), changed.Version, default);
        await f.Status(RelationshipStatus.Suspended);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => client.Documents(f.Relationship, null, null, 1, 25, default))).Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => client.Measurements(f.Relationship, f.Now.AddDays(-1), f.Now.AddDays(1), 1, 25, default))).Status);
        Assert.Equal(2, (await coach.Documents(f.Relationship, null, null, 1, 25, default)).Total);
        await f.Status(RelationshipStatus.Completed);
        Assert.Single((await client.Documents(f.Relationship, null, null, 1, 25, default)).Items);
        Assert.Empty((await client.Access(f.Relationship, default)).AllowedActions);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => client.AddMeasurement(f.Relationship, new("weight", "kg", 69, f.Now, null), default))).Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => coach.EditDocument(f.Relationship, sharedDoc.Id, new("edit", null, "General", "text", f.Now), 3, default))).Status);
        Assert.Equal("Coach secret", (await coach.Notes(f.Relationship, null, 1, 25, default)).Items.Single().Text);
        Assert.Equal(privateDoc.Id, (await coach.Documents(f.Relationship, "Private title", null, 1, 25, default)).Items.Single().Id);
    }

    [MediaPostgresFact]
    public async Task Private_media_rechecks_visibility_status_scope_and_owner_before_signing()
    {
        await using var f = await Fixture.Create();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        var client = f.Service(f.Client, AccountRole.Client);
        var upload = await coach.Upload(f.Relationship, new("Progress.png", "image/png", f.Storage.Bytes.Length), default);
        await coach.FinalizeUpload(f.Relationship, upload.MediaId, default);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.FinalizeUpload(f.Relationship, upload.MediaId, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.Media.RequireDocumentAsync(f.OtherClientRelationship, f.Coach, upload.MediaId, default))).Status);
        var input = new DocumentInput("Progress", "Dated photo", "ProgressPhoto", "CoachPrivate", null, upload.MediaId, f.Now);
        var document = await coach.AddDocument(f.Relationship, input, default);
        Assert.True((await f.MediaDb.Files.AsNoTracking().SingleAsync(x => x.Id == upload.MediaId)).Pinned);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.ReadFile(f.Relationship, document.Id, default))).Status);
        Assert.Equal(0, f.Storage.ReadUrls);
        foreach (var operation in new Func<Task>[] { async () => { await f.Media.ReadUrlAsync(upload.MediaId, f.Coach, default); }, async () => { await f.Media.RequireReadyAsync(upload.MediaId, f.Coach, default); }, async () => { await f.Media.GetAsync(upload.MediaId, f.Coach, default); }, async () => { await f.Media.FinalizeAsync(upload.MediaId, f.Coach, default); } })
            Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(operation)).Status);
        var shared = await coach.Share(f.Relationship, document.Id, new("SharedWithClient"), document.Version, default);
        Assert.Contains("signed-read", (await client.ReadFile(f.Relationship, document.Id, default)).Url);
        Assert.Equal(1, f.Storage.ReadUrls);
        await coach.Share(f.Relationship, document.Id, new("CoachPrivate"), shared.Version, default);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.ReadFile(f.Relationship, document.Id, default))).Status);
        Assert.Equal(1, f.Storage.ReadUrls);
        await coach.Share(f.Relationship, document.Id, new("SharedWithClient"), 3, default);
        await f.Status(RelationshipStatus.Suspended);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => client.ReadFile(f.Relationship, document.Id, default))).Status);
        Assert.Equal(1, f.Storage.ReadUrls);
        await f.Status(RelationshipStatus.Completed);
        await client.ReadFile(f.Relationship, document.Id, default);
        Assert.Equal(2, f.Storage.ReadUrls);
        var otherCoach = f.Service(f.OtherCoach, AccountRole.Coach);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => otherCoach.ReadFile(f.Relationship, document.Id, default))).Status);
    }

    [MediaPostgresFact]
    public async Task Charts_convert_compatible_units_in_SQL_and_keep_keys_separate_and_edits_conflict()
    {
        await using var f = await Fixture.Create();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        var client = f.Service(f.Client, AccountRole.Client);
        await coach.AddMeasurement(f.Relationship, new("weight", "kg", 45.359237m, f.Now, null), default);
        await client.AddMeasurement(f.Relationship, new("weight", "lb", 100, f.Now, null), default);
        await coach.AddMeasurement(f.Relationship, new("waist", "cm", 91, f.Now, null), default);
        await coach.AddMeasurement(f.Relationship, new("arm", "cm", 31, f.Now, null), default);
        var trend = await client.Trend(f.Relationship, "weight", "kg", f.Now.AddDays(-1), f.Now.AddDays(1), default);
        Assert.Equal(45.359237m, Assert.Single(trend.Points).Value);
        Assert.Equal(91, Assert.Single((await client.Trend(f.Relationship, "waist", "cm", f.Now.AddDays(-1), f.Now.AddDays(1), default)).Points).Value);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => client.Trend(f.Relationship, "weight", "cm", f.Now.AddDays(-1), f.Now.AddDays(1), default))).Status);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => client.AddMeasurement(f.Relationship, new("waist", "kg", 90, f.Now, null), default))).Status);
        var note = await coach.SaveNote(f.Relationship, null, new("Original"), 0, default);
        await coach.SaveNote(f.Relationship, note.Id, new("Updated"), 1, default);
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => coach.SaveNote(f.Relationship, note.Id, new("Stale"), 1, default))).Status);
        var own = await client.AddDocument(f.Relationship, TextDocument("Client provided"), default);
        await client.EditDocument(f.Relationship, own.Id, new("Updated", null, "General", "Plain <script> text", f.Now), 1, default);
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => client.EditDocument(f.Relationship, own.Id, new("Stale", null, "General", "stale", f.Now), 1, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.Share(f.Relationship, own.Id, new("CoachPrivate"), 2, default))).Status);
        var coachDocument = await coach.AddDocument(f.Relationship, TextDocument("Coach provided"), default);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => client.EditDocument(f.Relationship, coachDocument.Id, new("Intrusion", null, "General", "intrusion", f.Now), 1, default))).Status);
        Assert.Equal(2, (await client.Documents(f.Relationship, null, null, 1, 1, default)).Total);
        Assert.Single((await client.Documents(f.Relationship, null, null, 1, 1, default)).Items);
    }

    [MediaPostgresFact]
    public async Task Notification_payload_contains_no_private_data_and_delivery_rechecks_current_visibility()
    {
        await using var f = await Fixture.Create();
        var coach = f.Service(f.Coach, AccountRole.Coach);
        await coach.SaveNote(f.Relationship, null, new("Secret never sent"), 0, default);
        var privateDoc = await coach.AddDocument(f.Relationship, TextDocument("Sensitive private title", "CoachPrivate"), default);
        Assert.Empty(f.Notifications.Events);
        var shared = await coach.Share(f.Relationship, privateDoc.Id, new("SharedWithClient"), 1, default);
        var notification = Assert.Single(f.Notifications.Events);
        Assert.True(await coach.CanDeliverAsync(notification, default));
        Assert.DoesNotContain("Sensitive", System.Text.Json.JsonSerializer.Serialize(notification));
        await coach.Share(f.Relationship, privateDoc.Id, new("CoachPrivate"), shared.Version, default);
        Assert.False(await coach.CanDeliverAsync(notification, default));
        await coach.Share(f.Relationship, privateDoc.Id, new("SharedWithClient"), 3, default);
        await f.Status(RelationshipStatus.Suspended);
        Assert.False(await coach.CanDeliverAsync(notification, default));
    }

    private static DocumentInput TextDocument(string title, string visibility = "SharedWithClient") => new(title, null, "General", visibility, "Plain text body", null, DateTimeOffset.UtcNow.AddHours(-1));
    private sealed class Fixture : IAsyncDisposable
    {
        private readonly NpgsqlDataSource admin; private readonly string name;
        public Guid Coach = Guid.NewGuid(), Client = Guid.NewGuid(), OtherCoach = Guid.NewGuid(), OtherClient = Guid.NewGuid(), Relationship = Guid.NewGuid(), OtherClientRelationship = Guid.NewGuid();
        public DateTimeOffset Now = DateTimeOffset.UtcNow.AddHours(-1);
        public DocumentationDbContext Docs
        {
            get;
        }
        public CoachingDbContext Coaching
        {
            get;
        }
        public MediaDbContext MediaDb
        {
            get;
        }
        public Storage Storage { get; } = new();
        public Publisher Notifications { get; } = new();
        public MediaLibrary Media
        {
            get;
        }
        private Fixture(NpgsqlDataSource admin, string name, string connection)
        {
            this.admin = admin;
            this.name = name;
            Docs = new(new DbContextOptionsBuilder<DocumentationDbContext>().UseNpgsql(connection).Options);
            Coaching = new(new DbContextOptionsBuilder<CoachingDbContext>().UseNpgsql(connection).Options);
            MediaDb = new(new DbContextOptionsBuilder<MediaDbContext>().UseNpgsql(connection).Options);
            Media = new(MediaDb, Storage, Options.Create(new StorageOptions { Bucket = "private-test" }));
        }
        public DocumentationService Service(Guid user, AccountRole role, DocumentationDbContext? docs = null)
        {
            var account = new Account(user, role);
            var features = new Features();
            return new(docs ?? Docs, account, new RelationshipRecipients(Coaching), new CoachingService(Coaching, account, null!, features, TimeProvider.System, null!), features, Media, TimeProvider.System, Notifications);
        }
        public async Task Status(RelationshipStatus status)
        {
            await Coaching.Relationships.Where(x => x.Id == Relationship).ExecuteUpdateAsync(x => x.SetProperty(r => r.Status, status));
        }
        public static async Task<Fixture> Create()
        {
            var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
            Assert.Contains(connection.Host, new[] { "localhost", "127.0.0.1", "::1" });
            var name = "tf_documentation_" + Guid.NewGuid().ToString("N");
            var admin = NpgsqlDataSource.Create(connection.ConnectionString);
            await using (var create = admin.CreateCommand($"CREATE DATABASE {name}"))
                await create.ExecuteNonQueryAsync();
            connection.Database = name;
            var f = new Fixture(admin, name, connection.ConnectionString);
            try
            {
                await using var setup = new NpgsqlConnection(connection.ConnectionString);
                await setup.OpenAsync();
                foreach (var context in new DbContext[] { f.Docs, f.Coaching, f.MediaDb })
                {
                    await using var command = new NpgsqlCommand(context.Database.GenerateCreateScript(), setup);
                    await command.ExecuteNonQueryAsync();
                }
                f.Coaching.Relationships.AddRange(new Relationship { Id = f.Relationship, CoachId = f.Coach, ClientId = f.Client, WorkspaceId = f.Coach }, new Relationship { CoachId = f.OtherCoach, ClientId = f.Client, WorkspaceId = f.OtherCoach }, new Relationship { Id = f.OtherClientRelationship, CoachId = f.Coach, ClientId = f.OtherClient, WorkspaceId = f.Coach });
                await f.Coaching.SaveChangesAsync();
                foreach (var groupName in new[] { "Strength", "Conditioning" })
                {
                    var group = new ClientGroup { Id = Guid.NewGuid(), CoachId = f.Coach, WorkspaceId = f.Coach, Name = groupName, Color = "#112233" };
                    f.Coaching.Groups.Add(group);
                    foreach (var relation in new[] { f.Relationship, f.OtherClientRelationship })
                        f.Coaching.Memberships.Add(new GroupMembership { GroupId = group.Id, RelationshipId = relation, CoachId = f.Coach, WorkspaceId = f.Coach });
                }
                await f.Coaching.SaveChangesAsync();
                return f;
            }
            catch { await f.DisposeAsync(); throw; }
        }
        public async ValueTask DisposeAsync()
        {
            await Docs.DisposeAsync();
            await Coaching.DisposeAsync();
            await MediaDb.DisposeAsync();
            NpgsqlConnection.ClearAllPools();
            await using var drop = admin.CreateCommand($"DROP DATABASE {name} WITH (FORCE)");
            await drop.ExecuteNonQueryAsync();
            await admin.DisposeAsync();
        }
    }
    private sealed class Account(Guid user, AccountRole role) : IAccountContext
    {
        public Guid UserId => user;
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<AccountRole>>([role]);
        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(user, user));
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(user, user));
        public Task RequireAdminAsync(string permission, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Features : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => Task.CompletedTask;
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => Task.FromResult(new AccessSnapshot("test", new[] { "coaching.clients.manage", "coaching.clients.view", "coaching.relationships.read-own" }.Select(x => new FeatureDecision(x, true, "ALLOWED")).ToArray(), []));
    }
    private sealed class Publisher : INotificationPublisher
    {
        public List<NotificationEvent> Events { get; } = [];
        public Task PublishAsync(NotificationEvent notification, CancellationToken ct)
        {
            Events.Add(notification);
            return Task.CompletedTask;
        }
        public Task CancelScheduledAsync(string sourceModule, Guid sourceId, CancellationToken ct) => Task.CompletedTask;
    }
    private sealed class Storage : IPrivateObjectStorage
    {
        public byte[] Bytes = [137, 80, 78, 71, 13, 10, 26, 10]; public int ReadUrls;
        public Task<string> CreateUploadUrlAsync(string bucket, string key, CancellationToken ct) => Task.FromResult("https://private.invalid/signed-upload");
        public Task<string> CreateReadUrlAsync(string bucket, string key, CancellationToken ct)
        {
            ReadUrls++;
            return Task.FromResult("https://private.invalid/signed-read");
        }
        public Task<StoredObject> InspectAsync(string bucket, string key, CancellationToken ct) => Task.FromResult(new StoredObject(Bytes.Length, "image/png", Bytes));
        public Task<Stream> OpenReadAsync(string bucket, string key, CancellationToken ct) => Task.FromResult<Stream>(new MemoryStream(Bytes));
        public Task DeleteAsync(string bucket, string key, CancellationToken ct) => Task.CompletedTask;
    }
}
