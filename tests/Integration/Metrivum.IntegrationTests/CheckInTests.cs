using Metrivum.Training.Features;
using Metrivum.ExerciseCatalog.Contracts;
using Metrivum.Training.Contracts;
using Metrivum.Training.Delivery;
using Metrivum.Training.Infrastructure;
using Metrivum.Training.Domain;
using Metrivum.Notifications;
using Metrivum.Notifications.Contracts;
using System.Text.Json;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.Accounts.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.CheckIns.Domain;
using Metrivum.CheckIns.Contracts;
using Metrivum.CheckIns.Features;
using Metrivum.CheckIns.Infrastructure;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Features;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Forms.Contracts;
using Metrivum.Forms.Features;
using Metrivum.Forms.Infrastructure;

namespace Metrivum.IntegrationTests;

public sealed class CheckInTests
{
    [CatalogPostgresFact]
    public async Task Mcp_checkins_isolate_two_coaches_of_one_client_and_preview_never_assigns()
    {
        await using var a = await Fixture.CreateAsync();
        await using var b = await Fixture.CreateAsync();
        var formA = await a.FormAsync();
        var formB = await b.FormAsync();
        var relationshipA = await a.RelationshipAsync();
        var relationshipB = await b.RelationshipAsync(clientId: relationshipA.ClientId);
        await using (var shared = a.Provider.CreateAsyncScope())
        {
            var db = shared.ServiceProvider.GetRequiredService<CoachingDbContext>();
            var relationships = await db.Relationships.AsNoTracking().Where(x => x.ClientId == relationshipA.ClientId).ToArrayAsync();
            Assert.Equal(2, relationships.Length);
            Assert.Contains(relationships, x => x.Id == relationshipA.Id && x.CoachId == a.CoachId);
            Assert.Contains(relationships, x => x.Id == relationshipB.Id && x.CoachId == b.CoachId);
        }
        var groupA = await a.GroupAsync(relationshipA);
        var groupB = await b.GroupAsync(relationshipB);
        var proposal = new McpCheckInAssignment(formA.Id, "Preview", "Private proposal", "UTC",
            new(McpRecurrenceKind.EveryNDays, 1, DateOnly.FromDateTime(a.Clock.GetUtcNow().DateTime), new(9, 0)), 24,
            [relationshipA.Id], [groupA.Id]);
        await using (var previewScope = a.Provider.CreateAsyncScope())
        {
            var adapter = new McpCheckInOperations(previewScope.ServiceProvider.GetRequiredService<CheckInsService>(), a.Account);
            var preview = await adapter.ProposeAssignmentAsync(proposal, default);
            Assert.Equal(relationshipA.Id, Assert.Single(preview.RelationshipIds));
            Assert.False(preview.Executed);
            var db = previewScope.ServiceProvider.GetRequiredService<CheckInsDbContext>();
            Assert.False(await db.Schedules.AnyAsync(x => x.CoachId == a.CoachId));
            Assert.False(await db.Requests.AnyAsync(x => x.CoachId == a.CoachId));
            Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => adapter.ProposeAssignmentAsync(proposal with { GroupIds = [groupB.Id] }, default))).Status);
        }
        var scheduleA = await a.Coach(s => s.CreateAsync(a.Schedule(formA.Id, [relationshipA.Id], []), default));
        var scheduleB = await b.Coach(s => s.CreateAsync(b.Schedule(formB.Id, [relationshipB.Id], []), default));
        await a.Coach(s => s.GenerateDueAsync(100, default));
        await b.Coach(s => s.GenerateDueAsync(100, default));
        var requestA = Assert.Single(await a.RequestsAsync(scheduleA.Id));
        var requestB = Assert.Single(await b.RequestsAsync(scheduleB.Id));
        a.Account.UserId = relationshipA.ClientId;
        await a.InScope(s => s.SubmitAsync(requestA.Id, new(Answers()), requestA.Version, default));
        b.Account.UserId = relationshipA.ClientId;
        await b.InScope(s => s.SubmitAsync(requestB.Id, new(Answers()), requestB.Version, default));
        a.Account.UserId = a.CoachId;
        await using var readScope = a.Provider.CreateAsyncScope();
        var reads = new McpCheckInOperations(readScope.ServiceProvider.GetRequiredService<CheckInsService>(), a.Account);
        Assert.Equal("Good", (await reads.SubmissionAsync(requestA.Id, default)).Answers!["answer"].GetString());
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => reads.SubmissionAsync(requestB.Id, default))).Status);
        var page = await reads.ListAsync(null, a.Clock.GetUtcNow().AddDays(-1), a.Clock.GetUtcNow().AddDays(1), null, 1, 25, default);
        Assert.Equal(requestA.Id, Assert.Single(page.Items).Id);
        // A dual-role account may read its own answers through REST, but the coach MCP tool stays coach-owned.
        a.Account.UserId = relationshipA.ClientId;
        Assert.NotNull((await a.InScope(s => s.DetailAsync(requestA.Id, default))).Submission);
        await using var dualScope = a.Provider.CreateAsyncScope();
        var dual = new McpCheckInOperations(dualScope.ServiceProvider.GetRequiredService<CheckInsService>(), a.Account);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => dual.SubmissionAsync(requestA.Id, default))).Status);
    }

    [CatalogPostgresFact]
    public async Task Metadata_only_schedule_edits_preserve_a_pending_release()
    {
        await using var f = await Fixture.CreateAsync();
        var form = await f.FormAsync();
        var person = await f.RelationshipAsync();
        var request = f.Schedule(form.Id, [person.Id], []);
        var schedule = await f.Coach(s => s.CreateAsync(request, default));
        var renamed = await f.Coach(s => s.UpdateAsync(schedule.Id, request with { Name = "Renamed" }, schedule.Version, default));
        Assert.Equal(schedule.NextAvailableAtUtc, renamed.NextAvailableAtUtc);
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var issued = Assert.Single(await f.RequestsAsync(schedule.Id));
        Assert.Equal(schedule.NextAvailableAtUtc, issued.AvailableAtUtc);
        Assert.Equal("Renamed", issued.ScheduleName);
    }

    [CatalogPostgresFact]
    public async Task Applying_shorter_cycles_realigns_future_checkins_and_pause_resume_preserves_history()
    {
        await using var f = await Fixture.CreateAsync();
        f.Clock.Set(DateTimeOffset.Parse("2026-10-16T10:00:00Z"));
        var form = await f.FormAsync();
        var person = await f.RelationshipAsync();
        var assignment = await f.AssignmentAsync(person);
        var request = f.Schedule(form.Id, [person.Id], []) with { TimeZone = "Europe/Warsaw", Recurrence = new(RecurrenceKind.AssignedProgramCycle, 1, new(2026, 10, 16), new(9, 0), AssignmentId: assignment.Id, CycleDays: [1]) };
        var schedule = await f.Coach(s => s.CreateAsync(request, default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var first = Assert.Single(await f.RequestsAsync(schedule.Id));
        Assert.Equal(DateTimeOffset.Parse("2026-10-26T08:00:00Z"), (await f.Coach(s => s.ScheduleAsync(schedule.Id, default))).NextAvailableAtUtc);
        f.Clock.Set(DateTimeOffset.Parse("2026-10-17T10:00:00Z"));
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<TrainingService>();
            var plan = await service.GetAsync(assignment.ProgramId, default);
            var block = plan.Document.Blocks[0];
            var updated = plan.Document with { Blocks = [block with { Cycles = [block.Cycles[0] with { DayCount = 5 }, block.Cycles[1]] }] };
            var saved = await service.SaveAsync(plan.Id, new(plan.Name, "", null, updated), plan.Version, default);
            var key = Guid.NewGuid().ToString();
            await Assert.ThrowsAsync<InvalidOperationException>(() => scope.ServiceProvider.GetRequiredService<ModuleTransaction>().RunAsync(async ct =>
            {
                await service.ApplyAsync(plan.Id, saved.Version, key, ct);
                throw new InvalidOperationException("Roll back publication and observer together.");
            }, default));
            Assert.Equal(DateTimeOffset.Parse("2026-10-26T08:00:00Z"), (await f.Coach(s => s.ScheduleAsync(schedule.Id, default))).NextAvailableAtUtc);
            var applied = await service.ApplyAsync(plan.Id, saved.Version, key, default);
            var aligned = await f.Coach(s => s.ScheduleAsync(schedule.Id, default));
            Assert.Equal(applied.Id, (await service.ApplyAsync(plan.Id, saved.Version, key, default)).Id);
            Assert.Equal(aligned.Version, (await f.Coach(s => s.ScheduleAsync(schedule.Id, default))).Version);
        }
        Assert.Equal(DateTimeOffset.Parse("2026-10-21T07:00:00Z"), (await f.Coach(s => s.ScheduleAsync(schedule.Id, default))).NextAvailableAtUtc);
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<TrainingDeliveryService>();
            var current = await service.GetAsync(assignment.Id, default);
            await service.SetStatusAsync(assignment.Id, AssignmentStatus.Paused, current.Version, default);
        }
        Assert.Null((await f.Coach(s => s.ScheduleAsync(schedule.Id, default))).NextAvailableAtUtc);
        f.Clock.Set(DateTimeOffset.Parse("2026-10-21T06:00:00Z"));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        Assert.Single(await f.RequestsAsync(schedule.Id));
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<TrainingDeliveryService>();
            var current = await service.GetAsync(assignment.Id, default);
            await service.SetStatusAsync(assignment.Id, AssignmentStatus.Active, current.Version, default);
        }
        Assert.Equal(DateTimeOffset.Parse("2026-10-21T07:00:00Z"), (await f.Coach(s => s.ScheduleAsync(schedule.Id, default))).NextAvailableAtUtc);
        f.Clock.Advance(TimeSpan.FromHours(2));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var issued = await f.RequestsAsync(schedule.Id);
        Assert.Equal(2, issued.Length);
        Assert.Equal(first.AvailableAtUtc, issued.Single(x => x.Id == first.Id).AvailableAtUtc);
        Assert.Null((await f.Coach(s => s.ScheduleAsync(schedule.Id, default))).NextAvailableAtUtc);
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<TrainingService>();
            var plan = await service.GetAsync(assignment.ProgramId, default);
            var block = plan.Document.Blocks[0];
            var extended = plan.Document with { Blocks = [block with { Cycles = [.. block.Cycles, new(Guid.NewGuid(), "Extension", "", 10, [])] }] };
            var saved = await service.SaveAsync(plan.Id, new(plan.Name, "", null, extended), plan.Version, default);
            await service.ApplyAsync(plan.Id, saved.Version, Guid.NewGuid().ToString(), default);
        }
        Assert.Equal(DateTimeOffset.Parse("2026-10-31T08:00:00Z"), (await f.Coach(s => s.ScheduleAsync(schedule.Id, default))).NextAvailableAtUtc);
        Assert.Equal(2, (await f.RequestsAsync(schedule.Id)).Length);
    }

    [CatalogPostgresFact]
    public async Task Assigned_cycle_releases_real_days_deduplicates_ticks_and_edits_preserve_issued_requests()
    {
        await using var f = await Fixture.CreateAsync();
        f.Clock.Set(DateTimeOffset.Parse("2026-10-16T10:00:00Z"));
        var form = await f.FormAsync();
        var person = await f.RelationshipAsync();
        var assignment = await f.AssignmentAsync(person);
        var request = f.Schedule(form.Id, [person.Id], []) with { TimeZone = "Europe/Warsaw", Recurrence = new(RecurrenceKind.AssignedProgramCycle, 1, new(2026, 10, 16), new(2, 30), AssignmentId: assignment.Id, CycleDays: [1, 10]) };
        var options = await f.Coach(s => s.AssignedProgramsAsync(person.Id, default));
        Assert.Equal(new DateOnly(2026, 10, 26), Assert.Single(options).Cycles[1].StartDate);
        var schedule = await f.Coach(s => s.CreateAsync(request, default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var first = Assert.Single(await f.RequestsAsync(schedule.Id));
        Assert.Equal(DateTimeOffset.Parse("2026-10-16T00:30:00Z"), first.AvailableAtUtc);
        var current = await f.Coach(s => s.ScheduleAsync(schedule.Id, default));
        await f.Coach(s => s.UpdateAsync(schedule.Id, request with { Recurrence = request.Recurrence with { ReleaseTime = new(18, 0) } }, current.Version, default));
        f.Clock.Set(DateTimeOffset.Parse("2026-10-16T20:00:00Z"));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        Assert.Single(await f.RequestsAsync(schedule.Id));
        f.Clock.Set(DateTimeOffset.Parse("2026-10-26T20:00:00Z"));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var issued = await f.RequestsAsync(schedule.Id);
        Assert.Equal(3, issued.Length);
        Assert.Contains(issued, x => x.AvailableAtUtc == DateTimeOffset.Parse("2026-10-25T17:00:00Z"));
        Assert.Contains(issued, x => x.AvailableAtUtc == DateTimeOffset.Parse("2026-10-26T17:00:00Z"));
        Assert.Equal(first.AvailableAtUtc, issued.Single(x => x.Id == first.Id).AvailableAtUtc);
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrainingDbContext>();
            var row = await db.Set<ProgramAssignment>().SingleAsync(a => a.Id == assignment.Id);
            row.Status = AssignmentStatus.Cancelled;
            await db.SaveChangesAsync();
        }
        f.Clock.Set(DateTimeOffset.Parse("2026-11-05T20:00:00Z"));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        Assert.Equal(3, (await f.RequestsAsync(schedule.Id)).Length);
        Assert.Equal(ScheduleStatus.Ended, (await f.Coach(s => s.ScheduleAsync(schedule.Id, default))).Status);
    }

    [CatalogPostgresFact]
    public async Task Cycle_schedule_rejects_foreign_assignments_wrong_client_zone_and_out_of_range_days()
    {
        await using var f = await Fixture.CreateAsync();
        var form = await f.FormAsync();
        var person = await f.RelationshipAsync();
        var other = await f.RelationshipAsync();
        var assignment = await f.AssignmentAsync(person);
        var request = f.Schedule(form.Id, [person.Id], []) with { TimeZone = "Europe/Warsaw", Recurrence = new(RecurrenceKind.AssignedProgramCycle, 1, new(2026, 10, 16), new(9, 0), AssignmentId: assignment.Id, CycleDays: [1, 10]) };
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.CreateAsync(request with { TimeZone = "UTC" }, default)))).Status);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.CreateAsync(request with { Recurrence = request.Recurrence with { CycleDays = [11] } }, default)))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.CreateAsync(request with { RelationshipIds = [other.Id] }, default)))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.CreateAsync(request with { Recurrence = request.Recurrence with { AssignmentId = Guid.NewGuid() } }, default)))).Status);
        await f.StatusAsync(person.Id, RelationshipStatus.Completed);
        await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.CreateAsync(request, default)));
    }

    [CatalogPostgresFact]
    public async Task Http_authentication_roles_feature_revocation_and_strong_etags_are_enforced()
    {
        using var original = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        var features = new Features();
        using var factory = original.WithWebHostBuilder(builder => builder.ConfigureServices(services => services.AddSingleton<IFeatureAccessService>(features)));
        async Task<HttpClient> User(string role)
        {
            var id = Guid.NewGuid();
            var http = factory.CreateClient();
            http.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(id));
            Assert.Equal(HttpStatusCode.OK, (await http.PutAsJsonAsync("/api/v1/me/onboarding", new
            {
                username = "ci" + id.ToString("N")[..20],
                displayName = "Check-in HTTP",
                birthDate = "1990-01-01",
                acceptedTerms = true,
                locale = "en",
                timeZone = "UTC",
                role
            })).StatusCode);
            return http;
        }
        using var owner = await User("Coach");
        using var stranger = await User("Coach");
        using var client = await User("Client");
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync("/api/v1/check-ins/requests")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/check-ins/schedules")).StatusCode);
        var formResponse = await owner.PostAsJsonAsync("/api/v1/forms", FormRequest());
        Assert.Equal(HttpStatusCode.OK, formResponse.StatusCode);
        var form = (await formResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var publish = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/forms/{form}/publish");
        publish.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        Assert.Equal(HttpStatusCode.OK, (await owner.SendAsync(publish)).StatusCode);
        var coachProfile = await (await owner.GetAsync("/api/v1/me")).Content.ReadFromJsonAsync<JsonElement>();
        var clientProfile = await (await client.GetAsync("/api/v1/me")).Content.ReadFromJsonAsync<JsonElement>();
        Guid relationship;
        await using (var scope = factory.Services.CreateAsyncScope())
            relationship = await scope.ServiceProvider.GetRequiredService<IRelationshipActivation>().ActivateDevFixtureAsync(coachProfile.GetProperty("id").GetGuid(), clientProfile.GetProperty("id").GetGuid(), default);
        var request = new ScheduleRequest(form, "HTTP check-in", "Private", "UTC", new(RecurrenceKind.OneTime, 1, DateOnly.FromDateTime(DateTime.UtcNow), new(0, 0)), 24, [relationship], []);
        var created = await owner.PostAsJsonAsync("/api/v1/check-ins/schedules", request);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        Assert.Equal("\"1\"", created.Headers.ETag!.Tag);
        var schedule = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/v1/check-ins/schedules/{schedule}")).StatusCode);
        Assert.Equal((HttpStatusCode)428, (await owner.PostAsync($"/api/v1/check-ins/schedules/{schedule}/pause", null)).StatusCode);
        using var weak = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/check-ins/schedules/{schedule}/pause");
        weak.Headers.TryAddWithoutValidation("If-Match", "W/\"1\"");
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(weak)).StatusCode);
        using var pause = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/check-ins/schedules/{schedule}/pause");
        pause.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        Assert.Equal(HttpStatusCode.OK, (await owner.SendAsync(pause)).StatusCode);
        var calendarRange = $"from={DateTime.UtcNow.AddDays(-1):yyyy-MM-dd}&to={DateTime.UtcNow.AddDays(30):yyyy-MM-dd}";
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/v1/check-ins/calendar?role=coach&kind=Planned&" + calendarRange)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/check-ins/calendar?role=client&kind=Planned&" + calendarRange)).StatusCode);
        features.Allowed = false;
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/v1/check-ins/schedules")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/check-ins/requests?role=client")).StatusCode);
    }
    [PrivilegeDatabaseFact]
    public async Task Clean_and_stage1_upgrade_migrations_preserve_relationship_and_group_data()
    {
        var source = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        var name = "trainflow_checkins_" + Guid.NewGuid().ToString("N");
        await using var admin = NpgsqlDataSource.Create(source);
        await using (var create = admin.CreateCommand($"CREATE DATABASE {name}"))
            await create.ExecuteNonQueryAsync();
        try
        {
            var connection = new NpgsqlConnectionStringBuilder(source) { Database = name };
            await using var dbSource = NpgsqlDataSource.Create(connection.ConnectionString);
            await using var coaching = new CoachingDbContext(new DbContextOptionsBuilder<CoachingDbContext>().UseNpgsql(dbSource, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "coaching")).Options);
            await coaching.GetService<IMigrator>().MigrateAsync("20261006210339_InitialCoaching");
            var coach = Guid.NewGuid();
            var r = new Relationship { CoachId = coach, WorkspaceId = coach, ClientId = Guid.NewGuid(), StartedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            var g = new ClientGroup { CoachId = coach, WorkspaceId = coach, Name = "Existing Stage 1", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            // Seed the historical schema with its original columns, then test the real upgrade.
            await coaching.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO coaching."Relationships" ("Id","CoachId","ClientId","WorkspaceId","Status","ActivationSource","StartedAt","CreatedAt","UpdatedAt","Version")
                VALUES ({r.Id},{coach},{r.ClientId},{coach},'Active','DevFixture',{r.StartedAt},{r.CreatedAt},{r.UpdatedAt},1);
                INSERT INTO coaching."Groups" ("Id","CoachId","WorkspaceId","Name","Description","Color","Archived","CreatedAt","UpdatedAt","Version")
                VALUES ({g.Id},{coach},{coach},{g.Name},'','#123456',false,{g.CreatedAt},{g.UpdatedAt},1);
                INSERT INTO coaching."Memberships" ("GroupId","RelationshipId","CoachId","WorkspaceId","CreatedAt")
                VALUES ({g.Id},{r.Id},{coach},{coach},{g.CreatedAt});
                """);
            await coaching.Database.MigrateAsync();
            await using var forms = new FormsDbContext(new DbContextOptionsBuilder<FormsDbContext>().UseNpgsql(dbSource, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "forms")).Options);
            await forms.Database.MigrateAsync();
            await using var checkins = new CheckInsDbContext(new DbContextOptionsBuilder<CheckInsDbContext>().UseNpgsql(dbSource, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "checkins")).Options);
            await checkins.Database.MigrateAsync();
            Assert.Equal(r.ClientId, (await coaching.Relationships.AsNoTracking().SingleAsync()).ClientId);
            Assert.Equal("Existing Stage 1", (await coaching.Groups.AsNoTracking().SingleAsync()).Name);
            Assert.Single(await coaching.Memberships.AsNoTracking().ToArrayAsync());
            Assert.Empty(await checkins.Requests.ToArrayAsync());
            await using var constraints = dbSource.CreateCommand("SELECT count(*) FROM pg_constraint WHERE conname IN ('FK_Targets_Coaching_Relationship','FK_Targets_Coaching_Group','FK_Requests_Coaching_Relationship','CK_Request_Submission')");
            Assert.Equal(4L, await constraints.ExecuteScalarAsync());
        }
        finally { await using var drop = admin.CreateCommand($"DROP DATABASE {name}"); await drop.ExecuteNonQueryAsync(); }
    }
    [CatalogPostgresFact]
    public async Task Concurrent_submission_is_duplicate_safe_and_DST_occurrences_persist_unique_UTC_dates()
    {
        await using var f = await Fixture.CreateAsync();
        f.Clock.Set(DateTimeOffset.Parse("2026-10-24T05:00:00Z"));
        var form = await f.FormAsync();
        var a = await f.RelationshipAsync();
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(form.Id, [a.Id], []) with { TimeZone = "Europe/Warsaw", Recurrence = new(RecurrenceKind.EveryNDays, 1, new(2026, 10, 24), new(2, 30)) }, default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        f.Clock.Advance(TimeSpan.FromDays(1));
        await Task.WhenAll(f.Coach(s => s.GenerateDueAsync(100, default)), f.Coach(s => s.GenerateDueAsync(100, default)));
        var rows = await f.RequestsAsync(schedule.Id);
        Assert.Equal(2, rows.Length);
        Assert.Equal(DateTimeOffset.Parse("2026-10-25T00:30:00Z"), rows[1].AvailableAtUtc);
        f.Account.UserId = a.ClientId;
        async Task<ApiException?> Submit()
        {
            try
            {
                await f.InScope(s => s.SubmitAsync(rows[1].Id, new(Answers()), 1, default));
                return null;
            }
            catch (ApiException error) { return error; }
        }
        var outcomes = await Task.WhenAll(Submit(), Submit());
        Assert.Single(outcomes, x => x == null);
        Assert.Equal(412, Assert.Single(outcomes, x => x != null)!.Status);
        await using (var scope = f.Provider.CreateAsyncScope())
            Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<FormsDbContext>().Submissions.CountAsync(x => x.SourceKey == "checkin:" + rows[1].Id));
        var latest = await f.Coach(s => s.ScheduleAsync(schedule.Id, default));
        await f.Coach(s => s.ChangeStatusAsync(schedule.Id, ScheduleStatus.Ended, latest.Version, default));
    }
    [CatalogPostgresFact]
    public async Task Calendar_overlaps_preserve_visibility_and_preview_matches_generation()
    {
        await using var f = await Fixture.CreateAsync();
        f.Clock.Set(DateTimeOffset.Parse("2026-10-24T05:00:00Z"));
        var form = await f.FormAsync();
        var client = await f.RelationshipAsync();
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(form.Id, [client.Id], []) with { TimeZone = "Europe/Warsaw", Recurrence = new(RecurrenceKind.EveryNDays, 1, new(2026, 10, 24), new(2, 30)), ResponseWindowHours = 48 }, default));
        var from = DateTimeOffset.Parse("2026-10-25T00:00:00Z");
        var until = from.AddDays(1);
        var preview = await f.Coach(s => s.CalendarAsync("coach", "Planned", from, until, 1, 100, default));
        var future = Assert.Single(preview.Items, x => x.ScheduleId == schedule.Id);
        Assert.Equal(DateTimeOffset.Parse("2026-10-25T00:30:00Z"), future.AvailableAtUtc);
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var overlap = await f.Coach(s => s.CalendarAsync("coach", "Request", from, until, 1, 100, default));
        Assert.Contains(overlap.Items, x => x.ScheduleId == schedule.Id && x.AvailableAtUtc < from && x.DueAtUtc > from);
        f.Clock.Advance(TimeSpan.FromDays(1));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var issued = await f.RequestsAsync(schedule.Id);
        Assert.Contains(issued, x => x.AvailableAtUtc == future.AvailableAtUtc);
        var remaining = await f.Coach(s => s.CalendarAsync("coach", "Planned", from, until, 1, 100, default));
        Assert.DoesNotContain(remaining.Items, x => x.AvailableAtUtc == future.AvailableAtUtc);
    }
    [CatalogPostgresFact]
    public async Task Group_overlap_is_deduplicated_and_membership_and_status_changes_apply_only_to_future_occurrences()
    {
        await using var f = await Fixture.CreateAsync();
        var forms = await f.FormAsync();
        var a = await f.RelationshipAsync();
        var b = await f.RelationshipAsync();
        var suspended = await f.RelationshipAsync(RelationshipStatus.Suspended);
        var completed = await f.RelationshipAsync(RelationshipStatus.Completed);
        var g1 = await f.GroupAsync(a, b, suspended, completed);
        var g2 = await f.GroupAsync(a);
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(forms.Id, [a.Id], [g1.Id, g2.Id]), default));
        await Task.WhenAll(f.Coach(s => s.GenerateDueAsync(100, default)), f.Coach(s => s.GenerateDueAsync(100, default)));
        var first = await f.RequestsAsync(schedule.Id);
        Assert.Equal(2, first.Length);
        Assert.Equal("Direct", first.Single(x => x.RelationshipId == a.Id).AssignmentSource);
        Assert.Equal("Group", first.Single(x => x.RelationshipId == b.Id).AssignmentSource);
        Assert.Contains(g1.Name, first.Single(x => x.RelationshipId == b.Id).AssignmentGroupsJson!);
        Assert.Single(first, x => x.RelationshipId == a.Id);
        Assert.DoesNotContain(first, x => x.RelationshipId == suspended.Id || x.RelationshipId == completed.Id);
        var c = await f.RelationshipAsync();
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
            db.Memberships.Add(new()
            {
                GroupId = g1.Id,
                RelationshipId = c.Id,
                CoachId = f.CoachId,
                WorkspaceId = f.CoachId,
                CreatedAt = f.Clock.GetUtcNow()
            });
            db.Memberships.Remove(await db.Memberships.SingleAsync(x => x.GroupId == g1.Id && x.RelationshipId == b.Id));
            await db.SaveChangesAsync();
        }
        f.Clock.Advance(TimeSpan.FromDays(1));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var all = await f.RequestsAsync(schedule.Id);
        Assert.Equal(4, all.Length);
        Assert.Contains(all, x => x.RelationshipId == b.Id);
        Assert.Single(all, x => x.RelationshipId == b.Id);
        Assert.Single(all, x => x.RelationshipId == c.Id);
        await f.Coach(s => s.ChangeStatusAsync(schedule.Id, ScheduleStatus.Ended, 3, default));
    }
    [CatalogPostgresFact]
    public async Task Exact_issued_forms_late_submission_explicit_review_and_private_notes_are_preserved()
    {
        await using var f = await Fixture.CreateAsync();
        var form = await f.FormAsync();
        var otherForm = await f.FormAsync("Other template");
        var a = await f.RelationshipAsync();
        var b = await f.RelationshipAsync();
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(form.Id, [a.Id], []) with { ResponseWindowHours = 1, Recurrence = f.Once() }, default));
        var other = await f.Coach(s => s.CreateAsync(f.Schedule(otherForm.Id, [b.Id], []) with { Recurrence = f.Once() }, default));
        var simultaneous = await f.Coach(s => s.CreateAsync(f.Schedule(otherForm.Id, [a.Id], []) with { Recurrence = f.Once() }, default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var issued = Assert.Single(await f.RequestsAsync(schedule.Id));
        Assert.Single(await f.RequestsAsync(other.Id));
        Assert.Single(await f.RequestsAsync(simultaneous.Id));
        var detail = await f.Coach(s => s.DetailAsync(issued.Id, default));
        Assert.Equal(RequestStatus.Available, detail.Request.Status);
        Assert.Null(detail.Request.ReviewedAt);
        Assert.Equal("Direct", detail.Request.AssignmentSource);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.RelationshipDetailAsync(b.Id, issued.Id, default)))).Status);
        var filtered = await f.Coach(s => s.RequestsAsync(1, 1, null, "latest", null, a.Id, null, "coach", default, formTemplateId: form.Id));
        Assert.Equal(1, filtered.Total);
        Assert.Equal(issued.Id, Assert.Single(filtered.Items).Id);
        var summary = await f.Coach(s => s.SummaryAsync(a.Id, default));
        Assert.Equal(0, summary.AwaitingReview);
        Assert.Equal(0, summary.Overdue);
        Assert.NotNull(summary.NextDueAtUtc);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.SummaryAsync(Guid.NewGuid(), default)))).Status);
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<FormsService>();
            var edited = await service.UpdateAsync(form.Id, FormRequest("Updated", "new-answer"), form.Version, default);
            await service.PublishAsync(form.Id, edited.Version, default);
        }
        f.Clock.Advance(TimeSpan.FromHours(2));
        f.Account.UserId = a.ClientId;
        Assert.Equal(RequestStatus.Overdue, (await f.InScope(s => s.DetailAsync(issued.Id, default))).Request.Status);
        var overdueSummary = await f.Coach(s => s.SummaryAsync(a.Id, default));
        Assert.Equal(1, overdueSummary.Overdue);
        f.Account.UserId = a.ClientId;

        var wrong = await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.SubmitAsync(issued.Id, new(Answers("new-answer")), 1, default)));
        Assert.Equal(400, wrong.Status);
        var submitted = await f.InScope(s => s.SubmitAsync(issued.Id, new(Answers()), 1, default));
        Assert.True(submitted.Request.WasLate);
        Assert.Equal(issued.FormVersionId, submitted.Form.Id);
        var retry = await f.InScope(s => s.SubmitAsync(issued.Id, new(Answers()), submitted.Request.Version, default));
        Assert.Equal(submitted.Submission!.Id, retry.Submission!.Id);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.SubmitAsync(issued.Id, new(new Dictionary<string, JsonElement> { ["answer"] = JsonSerializer.SerializeToElement("changed") }), submitted.Request.Version, default)))).Status);
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.SubmitAsync(issued.Id, new(Answers()), 1, default)))).Status);
        f.Account.UserId = b.ClientId;
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.DetailAsync(issued.Id, default)))).Status);
        f.Account.UserId = Guid.NewGuid();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.DetailAsync(issued.Id, default)))).Status);
        var reviewed = await f.Coach(s => s.ReviewAsync(issued.Id, new("Thank you", "Private injury observation"), submitted.Request.Version, default));
        Assert.Equal(RequestStatus.Reviewed, reviewed.Request.Status);
        Assert.Equal(f.CoachId, reviewed.Request.ReviewedBy);
        var reviewedSummary = await f.Coach(s => s.SummaryAsync(a.Id, default));
        Assert.Equal(0, reviewedSummary.AwaitingReview);
        Assert.Equal(1, reviewedSummary.Reviewed);
        Assert.Equal(0, reviewedSummary.Overdue);
        await using (var notificationScope = f.Provider.CreateAsyncScope())
        {
            var notifications = await notificationScope.ServiceProvider.GetRequiredService<NotificationsDbContext>().Notifications.AsNoTracking().Where(x => x.SourceId == issued.Id).ToArrayAsync();
            Assert.Single(notifications, x => x.Type == "CheckInAvailable" && x.RecipientUserId == issued.ClientId);
            Assert.Single(notifications, x => x.Type == "CheckInSubmitted" && x.RecipientUserId == issued.CoachId);
            Assert.Single(notifications, x => x.Type == "CheckInReviewed" && x.RecipientUserId == issued.ClientId);
            Assert.DoesNotContain("Private injury observation", JsonSerializer.Serialize(notifications));
        }
        Assert.NotNull(reviewed.Request.ReviewedAt);
        var repeat = await f.Coach(s => s.ReviewAsync(issued.Id, new("Thank you", "Private injury observation"), reviewed.Request.Version, default));
        Assert.Equal(reviewed.Request.Version, repeat.Request.Version);
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.ReviewAsync(issued.Id, new("Thank you", "Private injury observation"), submitted.Request.Version, default)))).Status);
        f.Account.UserId = a.ClientId;
        var client = await f.InScope(s => s.DetailAsync(issued.Id, default));
        Assert.Null(client.CoachPrivateNotes);
        Assert.Equal("Thank you", client.Request.ClientReply);
        Assert.DoesNotContain("Private injury", JsonSerializer.Serialize(client));
        Assert.Equal("Original", client.Form.Name);
    }
    [CatalogPostgresFact]
    public async Task New_form_publication_only_changes_future_occurrences_and_archival_failure_survives_restart()
    {
        await using var f = await Fixture.CreateAsync();
        var form = await f.FormAsync();
        var a = await f.RelationshipAsync();
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(form.Id, [a.Id], []), default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var first = Assert.Single(await f.RequestsAsync(schedule.Id));
        long formVersion;
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var forms = scope.ServiceProvider.GetRequiredService<FormsService>();
            var edited = await forms.UpdateAsync(form.Id, FormRequest("Second", "new-answer"), form.Version, default);
            var published = await forms.PublishAsync(form.Id, edited.Version, default);
            formVersion = published.Version;
            await forms.ArchiveAsync(form.Id, true, formVersion, default);
            formVersion++;
        }
        f.Clock.Advance(TimeSpan.FromDays(1));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var failed = await f.Coach(s => s.ScheduleAsync(schedule.Id, default));
        Assert.NotNull(failed.LastFailure);
        Assert.Equal(1, failed.FailureCount);
        Assert.NotNull(failed.RetryAtUtc);
        Assert.Equal(Assert.Single(await f.RequestsAsync(schedule.Id)).AvailableAtUtc.AddDays(1), failed.NextAvailableAtUtc);
        await using (var scope = f.Provider.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<FormsService>().ArchiveAsync(form.Id, false, formVersion, default);
        await f.Coach(s => s.GenerateDueAsync(100, default));
        Assert.Single(await f.RequestsAsync(schedule.Id));
        f.Clock.Advance(TimeSpan.FromMinutes(1));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var rows = await f.RequestsAsync(schedule.Id);
        Assert.Equal(2, rows.Length);
        Assert.NotEqual(first.FormVersionId, rows.Single(x => x.Id != first.Id).FormVersionId);
        var recovered = await f.Coach(s => s.ScheduleAsync(schedule.Id, default));
        Assert.Null(recovered.LastFailure);
        Assert.Equal(0, recovered.FailureCount);
        await f.Coach(s => s.ChangeStatusAsync(schedule.Id, ScheduleStatus.Ended, recovered.Version, default));
    }
    [CatalogPostgresFact]
    public async Task Current_relationship_status_protects_read_submit_history_and_future_generation()
    {
        await using var f = await Fixture.CreateAsync();
        var form = await f.FormAsync();
        var a = await f.RelationshipAsync();
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(form.Id, [a.Id], []), default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var issued = Assert.Single(await f.RequestsAsync(schedule.Id));
        await f.StatusAsync(a.Id, RelationshipStatus.Suspended);
        f.Account.UserId = a.ClientId;
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.DetailAsync(issued.Id, default)))).Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.SubmitAsync(issued.Id, new(Answers()), 1, default)))).Status);
        Assert.Empty((await f.InScope(s => s.RequestsAsync(1, 25, null, "due", null, null, null, "client", default))).Items);
        await f.Coach(s => s.DetailAsync(issued.Id, default));
        f.Clock.Advance(TimeSpan.FromDays(1));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        Assert.Single(await f.RequestsAsync(schedule.Id));
        await f.StatusAsync(a.Id, RelationshipStatus.Active);
        f.Account.UserId = a.ClientId;
        var submitted = await f.InScope(s => s.SubmitAsync(issued.Id, new(Answers()), 1, default));
        Assert.True(submitted.Request.WasLate);
        await f.StatusAsync(a.Id, RelationshipStatus.Completed);
        Assert.Equal(RequestStatus.Submitted, (await f.InScope(s => s.DetailAsync(issued.Id, default))).Request.Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.SubmitAsync(issued.Id, new(Answers()), 2, default)))).Status);
        f.Clock.Advance(TimeSpan.FromDays(1));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        Assert.Single(await f.RequestsAsync(schedule.Id));
        var end = await f.Coach(s => s.ScheduleAsync(schedule.Id, default));
        await f.Coach(s => s.ChangeStatusAsync(schedule.Id, ScheduleStatus.Ended, end.Version, default));
    }
    [CatalogPostgresFact]
    public async Task Schedule_ownership_concurrency_cancellation_and_server_lists_are_enforced()
    {
        await using var f = await Fixture.CreateAsync();
        var form = await f.FormAsync();
        var a = await f.RelationshipAsync();
        var g = await f.GroupAsync(a);
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(form.Id, [a.Id], [g.Id]) with { Recurrence = f.Once() }, default));
        f.Account.UserId = Guid.NewGuid();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.ScheduleAsync(schedule.Id, default)))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.CreateAsync(f.Schedule(form.Id, [a.Id], []), default)))).Status);
        f.Account.UserId = f.CoachId;
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.CreateAsync(f.Schedule(form.Id, [Guid.NewGuid()], []), default)))).Status);
        var paused = await f.Coach(s => s.ChangeStatusAsync(schedule.Id, ScheduleStatus.Paused, 1, default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        Assert.Empty(await f.RequestsAsync(schedule.Id));
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.ChangeStatusAsync(schedule.Id, ScheduleStatus.Active, 1, default)))).Status);
        var resume = await f.Coach(s => s.ChangeStatusAsync(schedule.Id, ScheduleStatus.Active, paused.Version, default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var issued = Assert.Single(await f.RequestsAsync(schedule.Id));
        var list = await f.Coach(s => s.SchedulesAsync(1, 1, schedule.Name, "name", null, default));
        Assert.Single(list.Items);
        Assert.Equal(1, list.Total);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.SchedulesAsync(1, 101, null, "name", null, default)))).Status);
        var cancelled = await f.Coach(s => s.CancelAsync(issued.Id, 1, default));
        Assert.Equal(RequestStatus.Cancelled, cancelled.Request.Status);
        f.Account.UserId = a.ClientId;
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => f.InScope(s => s.SubmitAsync(issued.Id, new(Answers()), cancelled.Request.Version, default)))).Status);
        var dualRole = await f.InScope(s => s.RequestsAsync(1, 25, null, "due", RequestStatus.Cancelled, null, schedule.Id, "client", default));
        Assert.Single(dualRole.Items);
        await f.Coach(s => s.ChangeStatusAsync(schedule.Id, ScheduleStatus.Ended, resume.Version + 1, default));
    }
    [CatalogPostgresFact]
    public async Task Submission_rolls_back_with_outer_workflow_and_database_rejects_foreign_targets_or_snapshot_mutation()
    {
        await using var f = await Fixture.CreateAsync();
        var form = await f.FormAsync();
        var a = await f.RelationshipAsync();
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(form.Id, [a.Id], []) with { Recurrence = f.Once() }, default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var issued = Assert.Single(await f.RequestsAsync(schedule.Id));
        f.Account.UserId = a.ClientId;
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<CheckInsService>();
            var tx = scope.ServiceProvider.GetRequiredService<ModuleTransaction>();
            await Assert.ThrowsAsync<InvalidOperationException>(() => tx.RunAsync(async ct => { await service.SubmitAsync(issued.Id, new(Answers()), 1, ct); throw new InvalidOperationException("Force downstream rollback."); }, default));
        }
        Assert.Null(Assert.Single(await f.RequestsAsync(schedule.Id)).FormSubmissionId);
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var forms = scope.ServiceProvider.GetRequiredService<FormsDbContext>();
            Assert.False(await forms.Submissions.AnyAsync(x => x.SourceKey == "checkin:" + issued.Id));
            var db = scope.ServiceProvider.GetRequiredService<CheckInsDbContext>();
            db.Targets.Add(new()
            {
                ScheduleId = schedule.Id,
                TargetId = Guid.NewGuid(),
                CoachId = f.CoachId,
                WorkspaceId = f.CoachId
            });
            var failure = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, ((PostgresException)failure.InnerException!).SqlState);
        }
        await using (var scope = f.Provider.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CheckInsDbContext>();
            var row = await db.Requests.SingleAsync(x => x.Id == issued.Id);
            row.AvailableAtUtc = row.AvailableAtUtc.AddMinutes(1);
            var failure = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            Assert.Equal(PostgresErrorCodes.CheckViolation, ((PostgresException)failure.InnerException!).SqlState);
        }
    }
    [CatalogPostgresFact]
    public async Task Team_closure_cancels_open_requests_keeps_submissions_and_private_schedules()
    {
        await using var f = await Fixture.CreateAsync();
        var form = await f.FormAsync();
        var organizational = await f.RelationshipAsync();
        var personal = await f.RelationshipAsync();
        var teamSchedule = await f.Coach(service => service.CreateAsync(f.Schedule(form.Id, [organizational.Id], []), default));
        var privateSchedule = await f.Coach(service => service.CreateAsync(f.Schedule(form.Id, [personal.Id], []), default));
        await f.Coach(service => service.GenerateDueAsync(100, default));
        var first = Assert.Single(await f.RequestsAsync(teamSchedule.Id));
        f.Account.UserId = organizational.ClientId;
        await f.InScope(service => service.SubmitAsync(first.Id, new(Answers()), first.Version, default));
        f.Clock.Advance(TimeSpan.FromDays(1));
        await f.Coach(service => service.GenerateDueAsync(100, default));
        await using var scope = f.Provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CheckInsDbContext>();
        var lifecycle = new TeamCheckInLifecycle(db, scope.ServiceProvider.GetRequiredService<INotificationPublisher>());
        await scope.ServiceProvider.GetRequiredService<ModuleTransaction>().RunAsync(async ct =>
        {
            await lifecycle.CloseAsync(Guid.NewGuid(), [organizational.Id], f.CoachId, f.Clock.GetUtcNow(), ct);
            await lifecycle.CloseAsync(Guid.NewGuid(), [organizational.Id], f.CoachId, f.Clock.GetUtcNow(), ct);
        }, default);
        var requests = await f.RequestsAsync(teamSchedule.Id);
        Assert.Equal(RequestStatus.Submitted, requests[0].Status);
        Assert.NotNull(requests[0].FormSubmissionId);
        Assert.Equal(RequestStatus.Cancelled, requests[1].Status);
        Assert.Equal(ScheduleStatus.Ended, (await db.Schedules.AsNoTracking().SingleAsync(x => x.Id == teamSchedule.Id)).Status);
        Assert.Equal(ScheduleStatus.Active, (await db.Schedules.AsNoTracking().SingleAsync(x => x.Id == privateSchedule.Id)).Status);
        Assert.All(await f.RequestsAsync(privateSchedule.Id), x => Assert.Equal(RequestStatus.Scheduled, x.Status));
    }

    [CatalogPostgresFact]
    public async Task Generator_waits_for_team_closure_before_claiming_due_schedule()
    {
        var team = new GenerationTeamContext();
        await using var f = await Fixture.CreateAsync(team);
        var form = await f.FormAsync();
        var relationship = await f.RelationshipAsync();
        var schedule = await f.Coach(service => service.CreateAsync(f.Schedule(form.Id, [relationship.Id], []), default));
        await using var scope = f.Provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CheckInsDbContext>();
        Task<int>? generating = null;
        await scope.ServiceProvider.GetRequiredService<ModuleTransaction>().RunAsync(async ct =>
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + team.TeamId}, 0))", ct);
            team.Observe = true;
            generating = f.Coach(service => service.GenerateDueAsync(100, default));
            await team.Observed.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.NotSame(generating, await Task.WhenAny(generating, Task.Delay(150)));
            await new TeamCheckInLifecycle(db, scope.ServiceProvider.GetRequiredService<INotificationPublisher>())
                .CloseAsync(team.TeamId, [relationship.Id], f.CoachId, f.Clock.GetUtcNow(), ct);
        }, default);
        await generating!.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Empty(await f.RequestsAsync(schedule.Id));
        Assert.Equal(ScheduleStatus.Ended, (await db.Schedules.AsNoTracking().SingleAsync(x => x.Id == schedule.Id)).Status);
    }

    [CatalogPostgresFact]
    public async Task Expired_team_checkins_remain_readable_but_cannot_be_reviewed_or_cancelled()
    {
        var team = new GenerationTeamContext();
        await using var f = await Fixture.CreateAsync(team);
        var form = await f.FormAsync();
        var relationship = await f.RelationshipAsync(teamId: team.TeamId);
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(form.Id, [relationship.Id], []), default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var first = Assert.Single(await f.RequestsAsync(schedule.Id));
        f.Account.UserId = relationship.ClientId;
        var submitted = await f.InScope(s => s.SubmitAsync(first.Id, new(Answers()), first.Version, default));
        f.Clock.Advance(TimeSpan.FromDays(1));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var pending = (await f.RequestsAsync(schedule.Id)).Single(x => x.Id != first.Id);
        team.Active = false;

        Assert.Equal(RequestStatus.Submitted, (await f.Coach(s => s.DetailAsync(first.Id, default))).Request.Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.ReviewAsync(first.Id, new("Reply", "Private"), submitted.Request.Version, default)))).Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.CancelAsync(pending.Id, pending.Version, default)))).Status);
        var rows = await f.RequestsAsync(schedule.Id);
        Assert.Equal(RequestStatus.Submitted, rows.Single(x => x.Id == first.Id).Status);
        Assert.Equal(RequestStatus.Scheduled, rows.Single(x => x.Id == pending.Id).Status);
        team.Active = true;
        Assert.Equal(RequestStatus.Reviewed, (await f.Coach(s => s.ReviewAsync(first.Id, new("Reply", "Private"), submitted.Request.Version, default))).Request.Status);
        Assert.Equal(RequestStatus.Cancelled, (await f.Coach(s => s.CancelAsync(pending.Id, pending.Version, default))).Request.Status);
    }

    [CatalogPostgresFact]
    public async Task Coach_with_history_access_cannot_review_or_cancel_after_manage_feature_revocation()
    {
        await using var f = await Fixture.CreateAsync();
        var form = await f.FormAsync();
        var relationship = await f.RelationshipAsync();
        var schedule = await f.Coach(s => s.CreateAsync(f.Schedule(form.Id, [relationship.Id], []), default));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var first = Assert.Single(await f.RequestsAsync(schedule.Id));
        f.Account.UserId = relationship.ClientId;
        var submitted = await f.InScope(s => s.SubmitAsync(first.Id, new(Answers()), first.Version, default));
        f.Clock.Advance(TimeSpan.FromDays(1));
        await f.Coach(s => s.GenerateDueAsync(100, default));
        var pending = (await f.RequestsAsync(schedule.Id)).Single(x => x.Id != first.Id);
        var features = (Features)f.Provider.GetRequiredService<IFeatureAccessService>();
        features.ManageAllowed = false;

        Assert.Equal(RequestStatus.Submitted, (await f.Coach(s => s.DetailAsync(first.Id, default))).Request.Status);
        Assert.Equal("FEATURE_UNAVAILABLE", (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.ReviewAsync(first.Id, new("Reply", "Private"), submitted.Request.Version, default)))).Code);
        Assert.Equal("FEATURE_UNAVAILABLE", (await Assert.ThrowsAsync<ApiException>(() => f.Coach(s => s.CancelAsync(pending.Id, pending.Version, default)))).Code);
        var rows = await f.RequestsAsync(schedule.Id);
        Assert.Equal(submitted.Request.Version, rows.Single(x => x.Id == first.Id).Version);
        Assert.Equal(RequestStatus.Submitted, rows.Single(x => x.Id == first.Id).Status);
        Assert.Equal(pending.Version, rows.Single(x => x.Id == pending.Id).Version);
        Assert.Equal(RequestStatus.Scheduled, rows.Single(x => x.Id == pending.Id).Status);

        features.ManageAllowed = true;
        Assert.Equal(RequestStatus.Reviewed, (await f.Coach(s => s.ReviewAsync(first.Id, new("Reply", "Private"), submitted.Request.Version, default))).Request.Status);
        Assert.Equal(RequestStatus.Cancelled, (await f.Coach(s => s.CancelAsync(pending.Id, pending.Version, default))).Request.Status);
    }

    private sealed class GenerationTeamContext : ITeamContext
    {
        public Guid TeamId { get; } = Guid.NewGuid();
        public bool Observe
        {
            get; set;
        }
        public bool Active { get; set; } = true;
        public TaskCompletionSource Observed { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task<TeamAccess?> GetForUserAsync(Guid userId, CancellationToken ct)
        {
            if (Observe)
                Observed.TrySetResult();
            return Task.FromResult<TeamAccess?>(new(TeamId, userId, "Owner", Active ? "Active" : "BillingInactive", Active));
        }
        public Task<TeamAccess> RequireAsync(Guid teamId, Guid userId, bool administrative, CancellationToken ct) =>
            Task.FromResult(new TeamAccess(TeamId, userId, "Owner", "Active", true));
    }

    private static FormTemplateRequest FormRequest(string name = "Original", string key = "answer") => new(FormPurpose.CheckIn, name, "Private check-in", new([new("main", "Main", 0, [new(key, "Your response", QuestionType.ShortText, true)])]));
    private static IReadOnlyDictionary<string, JsonElement> Answers(string key = "answer") => new Dictionary<string, JsonElement> { [key] = JsonSerializer.SerializeToElement("Good") };
    private sealed class Fixture : IAsyncDisposable
    {
        public Guid CoachId { get; } = Guid.NewGuid();
        public Account Account
        {
            get;
        }
        public Clock Clock { get; } = new();
        public ServiceProvider Provider
        {
            get;
        }
        private Fixture(ITeamContext? teams = null)
        {
            Account = new(CoachId);
            var services = new ServiceCollection();
            services.AddSingleton(NpgsqlDataSource.Create(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!));
            services.AddSingleton<IAccountContext>(Account);
            if (teams != null)
                services.AddSingleton<ITeamContext>(teams);
            services.AddSingleton<IFeatureAccessService>(new Features());
            services.AddSingleton<TimeProvider>(Clock);
            services.AddSingleton<IHostEnvironment>(new EnvironmentStub());
            services.AddModuleDatabase<TrainingDbContext>("training");
            services.AddScoped<IAssignedProgramCycles, AssignedProgramCyclesReader>();
            services.AddScoped<IAssignedProgramScheduleObserver, AssignedProgramScheduleObserver>();
            services.AddOptions<TrainingOptions>();
            services.AddSingleton<IExerciseCatalog, EmptyCatalog>();
            services.AddScoped<TrainingService>();
            services.AddScoped<TrainingDeliveryService>();
            services.AddModuleDatabase<CheckInsDbContext>("checkins");
            services.AddModuleDatabase<NotificationsDbContext>("notifications");
            services.AddScoped<INotificationPublisher, NotificationPublisher>();
            services.AddModuleDatabase<FormsDbContext>("forms");
            services.AddModuleDatabase<CoachingDbContext>("coaching");
            services.AddModuleDatabase<AccountsDbContext>("accounts");
            services.AddScoped<IAccountDirectory, AccountDirectory>();
            services.AddScoped<CoachingService>();
            services.AddScoped<IRelationshipAccessPolicy>(p => p.GetRequiredService<CoachingService>());
            services.AddScoped<IRelationshipRecipients, RelationshipRecipients>();
            services.AddScoped<FormsService>();
            services.AddScoped<IFormLibrary>(p => p.GetRequiredService<FormsService>());
            services.AddScoped<CheckInsService>();
            Provider = services.BuildServiceProvider();
        }
        public static Task<Fixture> CreateAsync(ITeamContext? teams = null) => Task.FromResult(new Fixture(teams));
        public async Task<T> InScope<T>(Func<CheckInsService, Task<T>> action)
        {
            await using var scope = Provider.CreateAsyncScope();
            return await action(scope.ServiceProvider.GetRequiredService<CheckInsService>());
        }
        public Task<T> Coach<T>(Func<CheckInsService, Task<T>> action)
        {
            Account.UserId = CoachId;
            return InScope(action);
        }
        public async Task<ProgramAssignment> AssignmentAsync(Relationship person)
        {
            await using var scope = Provider.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<TrainingDbContext>();
            var document = new TrainingDocument(1, [new(Guid.NewGuid(), "Block", "", [new(Guid.NewGuid(), "First", "", 10, [new(Guid.NewGuid(), 1, [new(Guid.NewGuid(), "Workout", "", [], [])])]), new(Guid.NewGuid(), "Second", "", 10, [])])]);
            var plan = new TrainingPlan { Id = Guid.NewGuid(), OwnerId = CoachId, WorkspaceId = CoachId, Name = "Ten day plan", Draft = document, CreatedAt = Clock.GetUtcNow(), UpdatedAt = Clock.GetUtcNow() };
            var revision = new TrainingRevision { Id = Guid.NewGuid(), PlanId = plan.Id, Number = 1, DraftVersion = 1, PublishedAt = Clock.GetUtcNow(), IdempotencyKey = Guid.NewGuid().ToString(), RequestHash = "fixture", Snapshot = new(1, plan.Name, "", DocumentKind.Program, document, [], []) };
            var batch = new AssignmentBatch { Id = Guid.NewGuid(), CoachId = CoachId, IdempotencyKey = Guid.NewGuid().ToString(), RequestHash = "fixture", CreatedAt = Clock.GetUtcNow() };
            var assignment = new ProgramAssignment { Id = Guid.NewGuid(), BatchId = batch.Id, RelationshipId = person.Id, CoachId = CoachId, ClientId = person.ClientId, ProgramId = plan.Id, OriginalRevisionId = revision.Id, EffectiveRevisionId = revision.Id, StartDate = new(2026, 10, 16), TimeZone = "Europe/Warsaw", ProgramName = plan.Name, CreatedAt = Clock.GetUtcNow(), UpdatedAt = Clock.GetUtcNow() };
            db.AddRange(plan, revision, batch, assignment);
            await db.SaveChangesAsync();
            return assignment;
        }
        public async Task<FormTemplateDto> FormAsync(string name = "Original")
        {
            Account.UserId = CoachId;
            await using var scope = Provider.CreateAsyncScope();
            var service = scope.ServiceProvider.GetRequiredService<FormsService>();
            var draft = await service.CreateAsync(FormRequest(name), default);
            return await service.PublishAsync(draft.Id, draft.Version, default);
        }
        public async Task<Relationship> RelationshipAsync(RelationshipStatus status = RelationshipStatus.Active, Guid? teamId = null, Guid? clientId = null)
        {
            await using var scope = Provider.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
            var r = new Relationship { CoachId = CoachId, ClientId = clientId ?? Guid.NewGuid(), WorkspaceId = CoachId, Status = status, ActivationSource = ActivationSource.DevFixture, StartedAt = Clock.GetUtcNow(), CreatedAt = Clock.GetUtcNow(), UpdatedAt = Clock.GetUtcNow() };
            if (teamId is { } organization)
            {
                var clientCase = new TeamClientCase { TeamId = organization, ClientId = r.ClientId, CreatedAt = Clock.GetUtcNow() };
                db.Set<TeamClientCase>().Add(clientCase);
                db.Set<TeamCoachAssignment>().Add(new()
                {
                    TeamClientCaseId = clientCase.Id,
                    TeamId = organization,
                    CoachId = CoachId,
                    AssignedBy = CoachId,
                    StartedAt = Clock.GetUtcNow()
                });
                r.TeamId = organization;
                r.TeamClientCaseId = clientCase.Id;
                r.ActivationSource = ActivationSource.TeamConsent;
            }
            db.Relationships.Add(r);
            await db.SaveChangesAsync();
            return r;
        }
        public async Task<ClientGroup> GroupAsync(params Relationship[] people)
        {
            await using var scope = Provider.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
            var g = new ClientGroup { CoachId = CoachId, WorkspaceId = CoachId, Name = "Check-in group", CreatedAt = Clock.GetUtcNow(), UpdatedAt = Clock.GetUtcNow() };
            db.Groups.Add(g);
            db.Memberships.AddRange(people.Select(x => new GroupMembership { GroupId = g.Id, RelationshipId = x.Id, CoachId = CoachId, WorkspaceId = CoachId, CreatedAt = Clock.GetUtcNow() }));
            await db.SaveChangesAsync();
            return g;
        }
        public Recurrence Once() => new(RecurrenceKind.OneTime, 1, DateOnly.FromDateTime(Clock.GetUtcNow().DateTime), new(9, 0));
        public ScheduleRequest Schedule(Guid form, Guid[] relationships, Guid[] groups) => new(form, "Schedule " + Guid.NewGuid(), "Check-in schedule", "UTC", new(RecurrenceKind.EveryNDays, 1, DateOnly.FromDateTime(Clock.GetUtcNow().DateTime), new(9, 0)), 24, relationships, groups);
        public async Task<CheckInRequest[]> RequestsAsync(Guid id)
        {
            await using var scope = Provider.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<CheckInsDbContext>().Requests.AsNoTracking().Where(x => x.ScheduleId == id).OrderBy(x => x.AvailableAtUtc).ToArrayAsync();
        }
        public async Task StatusAsync(Guid id, RelationshipStatus status)
        {
            await using var scope = Provider.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
            var r = await db.Relationships.SingleAsync(x => x.Id == id);
            r.Status = status;
            r.Version++;
            await db.SaveChangesAsync();
        }
        public async ValueTask DisposeAsync()
        {
            // A shared test database must not leave recurring fixtures competing with later worker batches.
            await using (var scope = Provider.CreateAsyncScope())
                await scope.ServiceProvider.GetRequiredService<CheckInsDbContext>().Schedules.Where(s => s.CoachId == CoachId && s.Status == ScheduleStatus.Active).ExecuteUpdateAsync(update => update.SetProperty(s => s.Status, ScheduleStatus.Ended));
            await Provider.DisposeAsync();
        }
    }
    private sealed class EmptyCatalog : IExerciseCatalog
    {
        public Task<IReadOnlyDictionary<Guid, ExerciseSnapshot>> SnapshotAsync(IEnumerable<Guid> ids, CancellationToken ct) => Task.FromResult<IReadOnlyDictionary<Guid, ExerciseSnapshot>>(new Dictionary<Guid, ExerciseSnapshot>());
        public Task<IReadOnlyDictionary<string, ExerciseSnapshot>> MatchNamesAsync(IEnumerable<string> names, CancellationToken ct) => Task.FromResult<IReadOnlyDictionary<string, ExerciseSnapshot>>(new Dictionary<string, ExerciseSnapshot>());
    }
    private sealed class Clock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.Parse("2030-01-07T10:00:00Z"); public override DateTimeOffset GetUtcNow() => now; public void Advance(TimeSpan amount) => now += amount; public void Set(DateTimeOffset value) => now = value;
    }
    private sealed class Account(Guid coach) : IAccountContext
    {
        public Guid UserId { get; set; } = coach;
        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(UserId, UserId));
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(UserId, UserId));
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<AccountRole>>([AccountRole.Client, AccountRole.Coach]);
        public Task RequireAdminAsync(string permission, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Features : IFeatureAccessService
    {
        public bool Allowed { get; set; } = true;
        public bool ManageAllowed { get; set; } = true;
        public Task RequireAsync(string key, CancellationToken ct) => Allowed ? Task.CompletedTask : Task.FromException(new ApiException(403, "FEATURE_UNAVAILABLE", "Feature revoked."));
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => Task.FromResult(new AccessSnapshot("test", [new("coaching.clients.view", true, "ALLOWED"), new("coaching.clients.manage", ManageAllowed, ManageAllowed ? "ALLOWED" : "FEATURE_UNAVAILABLE"), new("coaching.relationships.read-own", true, "ALLOWED")], []));
    }
    private sealed class EnvironmentStub : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Testing"; public string ApplicationName { get; set; } = "CheckInTests"; public string ContentRootPath { get; set; } = ""; public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
