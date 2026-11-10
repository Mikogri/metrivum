using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.Analytics.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Features;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Notifications.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Metrivum.IntegrationTests;

public sealed class TeamCoachingTests
{
    [CatalogPostgresFact]
    public async Task Team_lists_page_authorized_rows_with_stable_ties_and_preserve_legacy_arrays()
    {
        await using var f = new Fixture();
        await f.Seed();
        await using var admin = f.Scope(f.Admin);
        var cases = Enumerable
            .Range(0, 3)
            .Select(_ => new TeamClientCase
            {
                TeamId = f.Team,
                ClientId = Guid.NewGuid(),
                CreatedAt = f.Clock.Now,
            })
            .ToArray();
        admin.Db.AddRange(cases);
        admin.Db.Add(
            new TeamClientCase
            {
                TeamId = Guid.NewGuid(),
                ClientId = Guid.NewGuid(),
                CreatedAt = f.Clock.Now.AddDays(1),
            }
        );
        foreach (var row in cases.Take(2))
            admin.Db.Add(
                new TeamCoachAssignment
                {
                    TeamId = f.Team,
                    TeamClientCaseId = row.Id,
                    CoachId = f.Coach,
                    AssignedBy = f.Admin,
                    StartedAt = f.Clock.Now,
                }
            );
        var requests = Enumerable
            .Range(0, 3)
            .Select(i => new ClientTransferRequest
            {
                RelationshipId = f.Personal,
                TeamId = f.Team,
                ClientId = f.Client,
                ProposedBy = i == 2 ? f.OtherCoach : f.Coach,
                Status = "Declined",
                CreatedAt = f.Clock.Now,
                ExpiresAt = f.Clock.Now.AddDays(1),
            })
            .ToArray();
        admin.Db.AddRange(requests);
        await admin.Db.SaveChangesAsync();

        var allCases = await admin.Service.ListAsync(f.Team, default);
        Assert.Equal(3, allCases.Length);
        Assert.Equal(
            allCases.Take(2).Select(x => x.Id),
            (await admin.Service.ListAsync(f.Team, default, 1, 2)).Select(x => x.Id)
        );
        Assert.Equal(
            allCases.Skip(2).Select(x => x.Id),
            (await admin.Service.ListAsync(f.Team, default, 2, 2)).Select(x => x.Id)
        );
        Assert.Empty(await admin.Service.ListAsync(f.Team, default, 3, 2));
        var allRequests = await admin.Service.RequestsAsync(f.Team, default);
        Assert.Equal(3, allRequests.Length);
        Assert.Equal(
            allRequests.Skip(2).Select(x => x.Id),
            (await admin.Service.RequestsAsync(f.Team, default, 2, 2)).Select(x => x.Id)
        );

        await using var coach = f.Scope(f.Coach);
        var visibleCases = await coach.Service.ListAsync(f.Team, default);
        Assert.Equal(2, visibleCases.Length);
        Assert.Equal(
            visibleCases.Skip(1).Select(x => x.Id),
            (await coach.Service.ListAsync(f.Team, default, 2, 1)).Select(x => x.Id)
        );
        var visibleRequests = await coach.Service.RequestsAsync(f.Team, default);
        Assert.Equal(2, visibleRequests.Length);
        Assert.Equal(
            visibleRequests.Skip(1).Select(x => x.Id),
            (await coach.Service.RequestsAsync(f.Team, default, 2, 1)).Select(x => x.Id)
        );
        await using var client = f.Scope(f.Client);
        var incoming = await client.Service.IncomingAsync(default);
        Assert.Equal(3, incoming.Length);
        Assert.Equal(
            incoming.Skip(2).Select(x => x.Id),
            (await client.Service.IncomingAsync(default, 2, 2)).Select(x => x.Id)
        );
        foreach (var (page, size) in new[] { (0, 25), (1000001, 25), (1, 0), (1, 101) })
        {
            Assert.Equal(
                400,
                (
                    await Assert.ThrowsAsync<ApiException>(() =>
                        admin.Service.ListAsync(f.Team, default, page, size)
                    )
                ).Status
            );
            Assert.Equal(
                400,
                (
                    await Assert.ThrowsAsync<ApiException>(() =>
                        admin.Service.RequestsAsync(f.Team, default, page, size)
                    )
                ).Status
            );
            Assert.Equal(
                400,
                (
                    await Assert.ThrowsAsync<ApiException>(() =>
                        client.Service.IncomingAsync(default, page, size)
                    )
                ).Status
            );
        }
    }

    [Fact]
    public void Organizational_cases_are_separate_from_unique_personal_relationships()
    {
        using var db = new CoachingDbContext(
            new DbContextOptionsBuilder<CoachingDbContext>()
                .UseNpgsql("Host=localhost;Database=model_only;Username=model_only")
                .Options
        );
        Assert.Contains(db.Model.GetEntityTypes(), x => x.GetTableName() == "TeamClientCases");
        var personal = db.Model.FindEntityType(typeof(Metrivum.Coaching.Domain.Relationship))!;
        Assert.Contains(
            personal.GetIndexes(),
            x =>
                x.IsUnique
                && x.Properties.Select(p => p.Name).SequenceEqual(new[] { "CoachId", "ClientId" })
        );
    }

    [CatalogPostgresFact]
    public async Task Consent_preserves_private_identity_and_creates_distinct_team_delivery_scope()
    {
        await using var f = new Fixture();
        await f.Seed();
        TeamClientTransferDto request;
        await using (var coach = f.Scope(f.Coach))
            request = await coach.Service.RequestAsync(f.Team, new(f.Personal), default);
        await using (var admin = f.Scope(f.Admin))
        {
            Assert.Empty(await admin.Service.ListAsync(f.Team, default));
            Assert.False(
                (
                    await admin.Policy.DecideAsync(
                        f.Personal,
                        RelationshipOperation.ProtectedRead,
                        default
                    )
                ).Allowed
            );
            Assert.Equal(
                404,
                (
                    await Assert.ThrowsAsync<ApiException>(() =>
                        admin.Service.DecideAsync(request.Id, true, request.Version, default)
                    )
                ).Status
            );
        }
        await using (var client = f.Scope(f.Client))
        {
            var accepted = await client.Service.DecideAsync(
                request.Id,
                true,
                request.Version,
                default
            );
            Assert.Equal("Accepted", accepted.Status);
            Assert.Equal("team-future-scope-v1", accepted.ConsentVersion);
            Assert.Equal("Team test", accepted.TeamName);
            Assert.Equal(
                412,
                (
                    await Assert.ThrowsAsync<ApiException>(() =>
                        client.Service.DecideAsync(request.Id, true, request.Version, default)
                    )
                ).Status
            );
            Assert.Equal(
                accepted.Status,
                (
                    await client.Service.DecideAsync(request.Id, true, accepted.Version, default)
                ).Status
            );
        }
        await using var verify = f.Scope(f.Coach);
        var original = await verify.Db.Relationships.SingleAsync(x => x.Id == f.Personal);
        Assert.Null(original.TeamId);
        Assert.Equal(RelationshipStatus.Completed, original.Status);
        var team = Assert.Single(await verify.Service.ListAsync(f.Team, default));
        Assert.NotNull(team.RelationshipId);
        Assert.NotEqual(f.Personal, team.RelationshipId);
        var delivery = await verify.Db.Relationships.SingleAsync(x => x.Id == team.RelationshipId);
        Assert.Equal(f.Team, delivery.TeamId);
        Assert.Equal(team.Id, delivery.TeamClientCaseId);
        Assert.Equal(f.Coach, delivery.CoachId);
        Assert.Equal(f.Client, delivery.ClientId);
        Assert.True(
            (
                await verify.Policy.DecideAsync(
                    f.Personal,
                    RelationshipOperation.HistoricalSharedRead,
                    default
                )
            ).Allowed
        );
        await using var adminAgain = f.Scope(f.Admin);
        Assert.False(
            (
                await adminAgain.Policy.DecideAsync(
                    f.Personal,
                    RelationshipOperation.HistoricalSharedRead,
                    default
                )
            ).Allowed
        );
        Assert.True(
            (
                await adminAgain.Policy.DecideAsync(
                    delivery.Id,
                    RelationshipOperation.ProtectedRead,
                    default
                )
            ).Allowed
        );
        Assert.Equal(
            2,
            await verify
                .Db.Set<TeamTransferChange>()
                .CountAsync(x => x.TransferRequestId == request.Id)
        );
    }

    [CatalogPostgresFact]
    public async Task Decline_and_outstanding_obligations_leave_personal_scope_unchanged()
    {
        await using var f = new Fixture();
        await f.Seed();
        await using var coach = f.Scope(f.Coach);
        f.Billing.Outstanding = true;
        Assert.Equal(
            "PERSONAL_OBLIGATIONS_REMAIN",
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.RequestAsync(f.Team, new(f.Personal), default)
                )
            ).Code
        );
        f.Billing.Outstanding = false;
        var request = await coach.Service.RequestAsync(f.Team, new(f.Personal), default);
        await using var client = f.Scope(f.Client);
        Assert.Equal(
            "Declined",
            (await client.Service.DecideAsync(request.Id, false, request.Version, default)).Status
        );
        Assert.Equal(
            RelationshipStatus.Active,
            (
                await client.Db.Relationships.AsNoTracking().SingleAsync(x => x.Id == f.Personal)
            ).Status
        );
        Assert.Empty(
            await client.Db.Set<TeamClientCase>().Where(x => x.TeamId == f.Team).ToArrayAsync()
        );
    }

    [CatalogPostgresFact]
    public async Task Multiple_coaches_count_one_client_and_removal_revokes_only_team_access()
    {
        await using var f = new Fixture();
        await f.Seed();
        var caseId = await f.Transfer();
        await using var admin = f.Scope(f.Admin);
        var row = await admin.Service.GetAsync(f.Team, caseId, default);
        row = await admin.Service.AssignAsync(
            f.Team,
            row.Id,
            new(f.OtherCoach, row.Version),
            default
        );
        Assert.Equal(2, row.AssignedCoachIds.Length);
        var assignedNotice = Assert.Single(
            f.Notifications.Events,
            x => x.Type == "TeamCoachAssigned"
        );
        Assert.Equal(f.Client, assignedNotice.RecipientUserId);
        Assert.True(assignedNotice.Required);
        Assert.Equal(
            $"team-case:{caseId}:{row.Version}:TeamCoachAssigned",
            assignedNotice.EventKey
        );
        await admin.Service.AssignAsync(f.Team, row.Id, new(f.OtherCoach, row.Version), default);
        Assert.Single(f.Notifications.Events, x => x.Type == "TeamCoachAssigned");
        Assert.True(await admin.Service.CanDeliverAsync(assignedNotice, default));
        Assert.False(
            await admin.Service.CanDeliverAsync(
                assignedNotice with
                {
                    RecipientUserId = f.OtherCoach,
                },
                default
            )
        );
        await using (var second = f.Scope(f.OtherCoach))
            Assert.Single(await second.Service.ListAsync(f.Team, default));
        var analytics = new CoachingAnalytics(admin.Db);
        var window = new AnalysisWindow(
            new(2026, 10, 1),
            new(2026, 10, 31),
            "UTC",
            new(2026, 10, 1, 0, 0, 0, TimeSpan.Zero),
            new(2026, 11, 1, 0, 0, 0, TimeSpan.Zero)
        );
        var ids = await analytics.ResolveTeamRelationshipsAsync(f.Team, null, null, null, default);
        var report = await analytics.ClientsAsync(
            new(f.Admin, f.Admin, window, null, ids, TeamId: f.Team),
            default
        );
        Assert.Equal(1, report.Active);
        Assert.Equal(1, report.NewClients);
        await admin.Service.RemoveCoachAsync(f.Team, f.Coach, default);
        f.Teams.Members.Remove(f.Coach);
        var leftNotice = Assert.Single(f.Notifications.Events, x => x.Type == "TeamCoachLeft");
        Assert.Equal(f.Client, leftNotice.RecipientUserId);
        Assert.True(leftNotice.Required);
        Assert.True(await admin.Service.CanDeliverAsync(leftNotice, default));
        await admin.Service.RemoveCoachAsync(f.Team, f.Coach, default);
        Assert.Single(f.Notifications.Events, x => x.Type == "TeamCoachLeft");
        await using var former = f.Scope(f.Coach);
        var formerTeamRelationship = await former.Db.Relationships.SingleAsync(x =>
            x.TeamId == f.Team && x.CoachId == f.Coach
        );
        Assert.False(
            (
                await former.Policy.DecideAsync(
                    formerTeamRelationship.Id,
                    RelationshipOperation.HistoricalSharedRead,
                    default
                )
            ).Allowed
        );
        Assert.True(
            (
                await former.Policy.DecideAsync(
                    f.Personal,
                    RelationshipOperation.HistoricalSharedRead,
                    default
                )
            ).Allowed
        );
        Assert.Single((await admin.Service.GetAsync(f.Team, caseId, default)).AssignedCoachIds);
    }

    [CatalogPostgresFact]
    public async Task Returning_member_assignment_counts_reactivation_without_duplicate_new_or_completed_client()
    {
        await using var f = new Fixture();
        await f.Seed();
        var caseId = await f.Transfer();
        await using var admin = f.Scope(f.Admin);
        var row = await admin.Service.GetAsync(f.Team, caseId, default);
        f.Clock.Now = new(2026, 10, 10, 12, 0, 0, TimeSpan.Zero);
        row = await admin.Service.UnassignAsync(f.Team, caseId, f.Coach, row.Version, default);
        var unassignedNotice = Assert.Single(
            f.Notifications.Events,
            x => x.Type == "TeamCoachUnassigned"
        );
        Assert.Equal(f.Client, unassignedNotice.RecipientUserId);
        Assert.True(unassignedNotice.Required);
        Assert.True(await admin.Service.CanDeliverAsync(unassignedNotice, default));
        f.Clock.Now = new(2026, 10, 12, 12, 0, 0, TimeSpan.Zero);
        await admin.Service.AssignAsync(f.Team, caseId, new(f.Coach, row.Version), default);
        var analytics = new CoachingAnalytics(admin.Db);
        var ids = await analytics.ResolveTeamRelationshipsAsync(
            f.Team,
            f.Coach,
            null,
            null,
            default
        );
        var window = new AnalysisWindow(
            new(2026, 10, 9),
            new(2026, 10, 31),
            "UTC",
            new(2026, 10, 9, 0, 0, 0, TimeSpan.Zero),
            new(2026, 11, 1, 0, 0, 0, TimeSpan.Zero)
        );
        var member = await analytics.ClientsAsync(
            new(f.Coach, f.Coach, window, null, ids, TeamId: f.Team, MemberId: f.Coach),
            default
        );
        Assert.Equal(1, member.Active);
        Assert.Equal(0, member.Completed);
        Assert.Equal(0, member.NewClients);
        Assert.Equal(1, member.Reactivated);
        Assert.Equal(1, member.Departed);
        Assert.Equal(1, member.Series.Sum(x => x.Reactivated));
        Assert.Equal(0, member.Series.Sum(x => x.NewClients));
        var team = await analytics.ClientsAsync(
            new(f.Admin, f.Admin, window, null, ids, TeamId: f.Team),
            default
        );
        Assert.Equal(1, team.Active);
        Assert.Equal(0, team.Completed);
        Assert.Equal(0, team.NewClients);
        Assert.Equal(0, team.Reactivated);
        Assert.Equal(0, team.Departed);
    }

    [CatalogPostgresFact]
    public async Task Concurrent_consent_has_one_case_one_assignment_and_one_private_transition()
    {
        await using var f = new Fixture();
        await f.Seed();
        TeamClientTransferDto request;
        await using (var coach = f.Scope(f.Coach))
            request = await coach.Service.RequestAsync(f.Team, new(f.Personal), default);
        async Task<bool> Accept()
        {
            await using var client = f.Scope(f.Client);
            try
            {
                await client.Service.DecideAsync(request.Id, true, request.Version, default);
                return true;
            }
            catch (ApiException ex) when (ex.Status == 412)
            {
                return false;
            }
        }
        var results = await Task.WhenAll(Accept(), Accept());
        Assert.Single(results, x => x);
        await using var verify = f.Scope(f.Coach);
        Assert.Single(
            await verify.Db.Set<TeamClientCase>().Where(x => x.TeamId == f.Team).ToArrayAsync()
        );
        Assert.Single(
            await verify.Db.Set<TeamCoachAssignment>().Where(x => x.TeamId == f.Team).ToArrayAsync()
        );
        Assert.Single(
            await verify.Db.StatusChanges.Where(x => x.RelationshipId == f.Personal).ToArrayAsync()
        );
    }

    [CatalogPostgresFact]
    public async Task Dissolution_is_idempotent_and_does_not_end_unrelated_private_clients()
    {
        await using var f = new Fixture();
        await f.Seed();
        var caseId = await f.Transfer();
        await using var admin = f.Scope(f.Admin);
        var otherPrivate = new Relationship
        {
            CoachId = f.Coach,
            ClientId = Guid.NewGuid(),
            WorkspaceId = f.Coach,
            ActivationSource = ActivationSource.DevFixture,
            StartedAt = f.Clock.Now,
            CreatedAt = f.Clock.Now,
            UpdatedAt = f.Clock.Now,
        };
        admin.Db.Add(otherPrivate);
        await admin.Db.SaveChangesAsync();
        await admin.Service.EndAsync(f.Team, default);
        await admin.Service.EndAsync(f.Team, default);
        Assert.Equal("Ended", (await admin.Service.GetAsync(f.Team, caseId, default)).Status);
        Assert.Equal(
            RelationshipStatus.Active,
            (await admin.Db.Relationships.SingleAsync(x => x.Id == otherPrivate.Id)).Status
        );
        Assert.Empty(
            await admin
                .Db.Set<TeamCoachAssignment>()
                .Where(x => x.TeamId == f.Team && x.EndedAt == null)
                .ToArrayAsync()
        );
        Assert.Single(
            await admin
                .Db.Set<TeamCaseChange>()
                .Where(x => x.TeamClientCaseId == caseId && x.Kind == "TeamDissolved")
                .ToArrayAsync()
        );
        Assert.True(f.Lifecycle.Closed.ContainsKey(f.Team));
        var endedNotice = Assert.Single(f.Notifications.Events, x => x.Type == "TeamCoachingEnded");
        Assert.Equal(f.Client, endedNotice.RecipientUserId);
        Assert.Equal(caseId, endedNotice.SourceId);
        Assert.Equal("/app/my-coaches", endedNotice.DeepLink);
        Assert.True(endedNotice.Required);
        Assert.True(await admin.Service.CanDeliverAsync(endedNotice, default));
        Assert.False(
            await admin.Service.CanDeliverAsync(
                endedNotice with
                {
                    RecipientUserId = f.Coach,
                },
                default
            )
        );
    }

    [CatalogPostgresFact]
    public async Task Audit_history_and_scope_uniqueness_are_enforced_by_postgres()
    {
        await using var f = new Fixture();
        await f.Seed();
        var caseId = await f.Transfer();
        await using var scope = f.Scope(f.Admin);
        var error = await Assert.ThrowsAsync<PostgresException>(() =>
            scope.Db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE coaching.\"TeamCaseChanges\" SET \"Kind\"='tampered' WHERE \"TeamClientCaseId\"={caseId}"
            )
        );
        Assert.Equal("23000", error.SqlState);
        var copy = new Relationship
        {
            CoachId = f.Coach,
            ClientId = f.Client,
            WorkspaceId = f.Coach,
            ActivationSource = ActivationSource.DevFixture,
            StartedAt = f.Clock.Now,
            CreatedAt = f.Clock.Now,
            UpdatedAt = f.Clock.Now,
        };
        scope.Db.Add(copy);
        var duplicate = await Assert.ThrowsAsync<DbUpdateException>(() =>
            scope.Db.SaveChangesAsync()
        );
        Assert.Equal(
            PostgresErrorCodes.UniqueViolation,
            Assert.IsType<PostgresException>(duplicate.InnerException).SqlState
        );
    }

    [CatalogPostgresFact]
    public async Task Team_groups_keep_scope_immutable_reject_mixed_targets_and_archive_on_departure()
    {
        await using var f = new Fixture();
        await f.Seed();
        var caseId = await f.Transfer();
        await using var coach = f.Scope(f.Coach);
        var relationship = (await coach.Service.GetAsync(f.Team, caseId, default))
            .RelationshipId!
            .Value;
        var personal = await coach.Policy.CreateGroupAsync(new("Private", "", "#111111"), default);
        var team = await coach.Policy.CreateGroupAsync(
            new("Team clients", "", "#222222", f.Team),
            default
        );
        Assert.Equal(f.Team, team.TeamId);
        var messaging = new CoachingMessagingDirectory(
            coach.Db,
            new Account(f.Coach, f.Client),
            f.Teams
        );
        Assert.Equal(
            409,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    messaging.OwnedGroupAsync(team.Id, default)
                )
            ).Status
        );
        Assert.Equal(personal.Id, (await messaging.OwnedGroupAsync(personal.Id, default)).Id);
        Assert.Equal(
            400,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Policy.MembershipAsync(
                        personal.Id,
                        relationship,
                        true,
                        personal.Version,
                        default
                    )
                )
            ).Status
        );
        Assert.Equal(
            400,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Policy.MembershipAsync(team.Id, f.Personal, true, team.Version, default)
                )
            ).Status
        );
        team = await coach.Policy.MembershipAsync(
            team.Id,
            relationship,
            true,
            team.Version,
            default
        );
        var mismatch = await Assert.ThrowsAsync<PostgresException>(() =>
            coach.Db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO coaching.\"Memberships\" (\"GroupId\",\"RelationshipId\",\"CoachId\",\"WorkspaceId\",\"CreatedAt\") VALUES ({team.Id},{f.Personal},{f.Coach},{f.Coach},{f.Clock.Now})"
            )
        );
        Assert.Equal(PostgresErrorCodes.CheckViolation, mismatch.SqlState);
        Assert.Single(
            (await coach.Policy.GroupsAsync(1, 100, null, "updated", false, default)).Items
        );
        Assert.Single(
            (await coach.Policy.GroupsAsync(1, 100, null, "updated", false, default, f.Team)).Items
        );
        Assert.Single((await coach.Policy.MembersAsync(team.Id, new(), default)).Items);
        Assert.Equal(
            400,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Policy.UpdateGroupAsync(
                        team.Id,
                        new("Wrong", "", "#222222"),
                        team.Version,
                        default
                    )
                )
            ).Status
        );
        var recipients = new RelationshipRecipients(coach.Db, f.Teams);
        Assert.Single(
            await recipients.ResolveActiveAsync(f.Coach, f.Coach, [], [team.Id], default)
        );
        Assert.Equal(
            400,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    recipients.ResolveActiveAsync(
                        f.Coach,
                        f.Coach,
                        [],
                        [team.Id, personal.Id],
                        default
                    )
                )
            ).Status
        );
        await using var admin = f.Scope(f.Admin);
        await admin.Service.RemoveCoachAsync(f.Team, f.Coach, default);
        f.Teams.Members.Remove(f.Coach);
        Assert.True((await admin.Db.Groups.SingleAsync(x => x.Id == team.Id)).Archived);
        Assert.False((await admin.Db.Groups.SingleAsync(x => x.Id == personal.Id)).Archived);
        await using var former = f.Scope(f.Coach);
        Assert.Equal(
            404,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    former.Policy.GroupAsync(team.Id, default)
                )
            ).Status
        );
    }

    private sealed class Fixture : IAsyncDisposable
    {
        public Guid Coach { get; } = Guid.NewGuid();
        public Guid Client { get; } = Guid.NewGuid();
        public Guid Admin { get; } = Guid.NewGuid();
        public Guid OtherCoach { get; } = Guid.NewGuid();
        public Guid Team { get; } = Guid.NewGuid();
        public Guid Personal { get; } = Guid.NewGuid();
        public Clock Clock { get; } = new();
        public TeamDirectory Teams { get; }
        public Billing Billing { get; } = new();
        public Lifecycle Lifecycle { get; } = new();
        public Notifications Notifications { get; } = new();
        private readonly NpgsqlDataSource source = NpgsqlDataSource.Create(
            System.Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!
        );

        public Fixture()
        {
            Teams = new(
                Team,
                Admin,
                new()
                {
                    [Coach] = "Member",
                    [Admin] = "Owner",
                    [OtherCoach] = "Member",
                }
            );
        }

        public Scope Scope(Guid actor) => new(source, actor, this);

        public async Task Seed()
        {
            await using var scope = Scope(Coach);
            scope.Db.Relationships.Add(
                new()
                {
                    Id = Personal,
                    CoachId = Coach,
                    ClientId = Client,
                    WorkspaceId = Coach,
                    ActivationSource = ActivationSource.DevFixture,
                    StartedAt = Clock.Now,
                    CreatedAt = Clock.Now,
                    UpdatedAt = Clock.Now,
                }
            );
            await scope.Db.SaveChangesAsync();
        }

        public async Task<Guid> Transfer()
        {
            await using var coach = Scope(Coach);
            var request = await coach.Service.RequestAsync(Team, new(Personal), default);
            await using var client = Scope(Client);
            await client.Service.DecideAsync(request.Id, true, request.Version, default);
            return (await coach.Service.ListAsync(Team, default)).Single().Id;
        }

        public ValueTask DisposeAsync() => source.DisposeAsync();
    }

    private sealed class Scope : IAsyncDisposable
    {
        private readonly ServiceProvider provider;
        public CoachingDbContext Db { get; }
        public TeamClientsService Service { get; }
        public CoachingService Policy { get; }

        public Scope(NpgsqlDataSource source, Guid actor, Fixture f)
        {
            var services = new ServiceCollection();
            services.AddSingleton(source);
            services.AddModuleDatabase<CoachingDbContext>("coaching");
            provider = services.BuildServiceProvider();
            Db = provider.GetRequiredService<CoachingDbContext>();
            var account = new Account(actor, f.Client);
            var features = new Features();
            var directory = new People(f.Client);
            var notifications = f.Notifications;
            var transaction = provider.GetRequiredService<ModuleTransaction>();
            Policy = new(
                Db,
                account,
                directory,
                features,
                f.Clock,
                new Environment(),
                transaction,
                notifications: notifications,
                teams: f.Teams
            );
            Service = new(
                Db,
                account,
                directory,
                f.Teams,
                features,
                f.Billing,
                transaction,
                notifications,
                f.Clock,
                Policy,
                [f.Lifecycle]
            );
        }

        public ValueTask DisposeAsync() => provider.DisposeAsync();
    }

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class Account(Guid actor, Guid client) : IAccountContext
    {
        public Guid UserId => actor;

        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) =>
            actor != client
                ? Task.FromResult(new AccountIdentity(actor, actor))
                : throw ApiException.NotFound();

        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) =>
            Task.FromResult(new AccountIdentity(actor, actor));

        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<AccountRole>>(
                actor == client ? [AccountRole.Client] : [AccountRole.Coach]
            );

        public Task RequireAdminAsync(string permission, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private sealed class Features : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => Task.CompletedTask;

        public Task<AccessSnapshot> GetAsync(CancellationToken ct) =>
            Task.FromResult(
                new AccessSnapshot(
                    "test",
                    new[]
                    {
                        "coaching.clients.view",
                        "coaching.clients.manage",
                        "coaching.relationships.read-own",
                    }
                        .Select(x => new FeatureDecision(x, true, "test"))
                        .ToArray(),
                    []
                )
            );
    }

    private sealed class People(Guid client) : IAccountDirectory
    {
        public Task<IReadOnlyDictionary<Guid, AccountDirectoryEntry>> GetAccountsAsync(
            IReadOnlyCollection<Guid> ids,
            CancellationToken ct
        ) =>
            Task.FromResult<IReadOnlyDictionary<Guid, AccountDirectoryEntry>>(
                ids.Distinct()
                    .ToDictionary(
                        x => x,
                        x => new AccountDirectoryEntry(
                            x,
                            x,
                            x.ToString("N"),
                            "Person " + x,
                            x == client ? [AccountRole.Client] : [AccountRole.Coach]
                        )
                    )
            );
    }

    private sealed class TeamDirectory(Guid team, Guid owner, Dictionary<Guid, string> members)
        : ITeamContext
    {
        public Dictionary<Guid, string> Members => members;

        public Task<TeamAccess?> GetForUserAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult(
                members.TryGetValue(userId, out var role)
                    ? new TeamAccess(team, owner, role, "Active", true, "Team test")
                    : null
            );

        public async Task<TeamAccess> RequireAsync(
            Guid teamId,
            Guid userId,
            bool administrative,
            CancellationToken ct
        )
        {
            var value = await GetForUserAsync(userId, ct);
            if (
                value == null
                || teamId != team
                || administrative && value.Role is not ("Owner" or "Admin")
            )
                throw ApiException.NotFound();
            return value;
        }
    }

    private sealed class Billing : IBillingOrders
    {
        public bool Outstanding { get; set; }

        public Task<bool> HasOutstandingPersonalObligationsAsync(Guid id, CancellationToken ct) =>
            Task.FromResult(Outstanding);

        public Task<ServiceOrderSnapshot> CreateForServiceAsync(
            CreateServiceOrderCommand command,
            CancellationToken ct
        ) => throw new NotSupportedException();

        public Task EndServiceAsync(Guid serviceId, CancellationToken ct) => Task.CompletedTask;
    }

    private sealed class Notifications : INotificationPublisher
    {
        public System.Collections.Concurrent.ConcurrentQueue<NotificationEvent> Events { get; } =
            new();

        public Task PublishAsync(NotificationEvent e, CancellationToken ct)
        {
            Events.Enqueue(e);
            return Task.CompletedTask;
        }

        public Task CancelScheduledAsync(string module, Guid id, CancellationToken ct) =>
            Task.CompletedTask;
    }

    private sealed class Lifecycle : ITeamRelationshipLifecycle
    {
        public Dictionary<Guid, Guid[]> Closed { get; } = [];

        public Task CloseAsync(
            Guid teamId,
            Guid[] relationshipIds,
            Guid actorId,
            DateTimeOffset effectiveAt,
            CancellationToken ct
        )
        {
            Closed[teamId] = relationshipIds;
            return Task.CompletedTask;
        }
    }

    private sealed class Environment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Testing";
        public string ApplicationName { get; set; } = "test";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
