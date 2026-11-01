using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using System.Data.Common;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.Accounts.Domain;
using Metrivum.Accounts.Infrastructure;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Features;
using Metrivum.Coaching.Infrastructure;

namespace Metrivum.IntegrationTests;

public sealed class CoachingQueryPerformanceTests
{
    [CatalogPostgresFact]
    public async Task Client_team_write_decisions_batch_representatives_without_reusing_foreign_team_access()
    {
        var commands = new Commands();
        await using var db = new CoachingDbContext(new DbContextOptionsBuilder<CoachingDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!).AddInterceptors(commands).Options);
        var actor = new TestAccount(Guid.NewGuid(), Guid.NewGuid(), AccountRole.Client);
        var representative = Guid.NewGuid();
        var teams = new Teams(Guid.NewGuid(), representative);
        var ids = new List<Guid>();
        for (var scope = 0; scope < 3; scope++)
        {
            var item = new TeamClientCase { TeamId = scope == 0 ? teams.Id : Guid.NewGuid(), ClientId = actor.UserId, CreatedAt = DateTimeOffset.UtcNow };
            db.Add(item);
            if (scope < 2)
                db.Add(new TeamCoachAssignment { TeamId = item.TeamId, TeamClientCaseId = item.Id, CoachId = representative, AssignedBy = representative, StartedAt = item.CreatedAt });
            for (var i = 0; i < (scope == 0 ? 12 : 1); i++)
            {
                var relationship = new Relationship { TeamId = item.TeamId, TeamClientCaseId = item.Id, CoachId = Guid.NewGuid(), WorkspaceId = Guid.NewGuid(), ClientId = actor.UserId, StartedAt = item.CreatedAt, CreatedAt = item.CreatedAt, UpdatedAt = item.CreatedAt };
                db.Add(relationship);
                ids.Add(relationship.Id);
            }
        }
        await db.SaveChangesAsync();
        var service = new CoachingService(db, actor, null!, new Features(), TimeProvider.System, null!, teams: teams);
        commands.Count = 0;
        var decisions = await service.DecideManyAsync(ids, RelationshipOperation.ProtectedWrite, default);
        Assert.All(ids.Take(12), id => Assert.True(decisions[id].Allowed));
        Assert.All(ids.Skip(12), id => Assert.False(decisions[id].Allowed));
        Assert.Equal(3, commands.Count);
        Assert.Equal(3, teams.Calls);
        teams.Active = false;
        Assert.All((await service.DecideManyAsync(ids, RelationshipOperation.ProtectedWrite, default)).Values, x => Assert.False(x.Allowed));
    }

    [CatalogPostgresFact]
    public async Task Batched_team_write_decisions_keep_query_count_constant_and_recheck_access()
    {
        var database = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        var commands = new Commands();
        await using var db = new CoachingDbContext(new DbContextOptionsBuilder<CoachingDbContext>().UseNpgsql(database).AddInterceptors(commands).Options);
        var actor = new TestAccount(Guid.NewGuid(), Guid.NewGuid());
        var team = new Teams(Guid.NewGuid(), actor.UserId);
        var ids = new List<Guid>();
        for (var i = 0; i < 12; i++)
        {
            var item = new TeamClientCase { TeamId = team.Id, ClientId = Guid.NewGuid(), CreatedAt = DateTimeOffset.UtcNow };
            db.Add(item);
            db.Add(new TeamCoachAssignment { TeamId = team.Id, TeamClientCaseId = item.Id, CoachId = actor.UserId, AssignedBy = actor.UserId, StartedAt = item.CreatedAt });
            var relationship = new Relationship { TeamId = team.Id, TeamClientCaseId = item.Id, CoachId = actor.UserId, WorkspaceId = actor.Workspace, ClientId = item.ClientId, StartedAt = item.CreatedAt, CreatedAt = item.CreatedAt, UpdatedAt = item.CreatedAt, Status = i == 11 ? RelationshipStatus.Suspended : RelationshipStatus.Active };
            db.Add(relationship);
            ids.Add(relationship.Id);
        }
        var personal = new Relationship { CoachId = actor.UserId, WorkspaceId = actor.Workspace, ClientId = Guid.NewGuid(), StartedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        db.Add(personal);
        ids.Add(personal.Id);
        await db.SaveChangesAsync();
        var features = new Features();
        var service = new CoachingService(db, actor, null!, features, TimeProvider.System, null!, teams: team);
        commands.Count = 0;
        var decisions = await service.DecideManyAsync(ids, RelationshipOperation.ProtectedWrite, default);
        Assert.Equal(12, decisions.Count(x => x.Value.Allowed));
        Assert.False(decisions[ids[11]].Allowed);
        Assert.Equal(2, commands.Count);
        var firstCase = await db.Relationships.Where(x => x.Id == ids[0]).Select(x => x.TeamClientCaseId).SingleAsync();
        await db.Set<TeamCoachAssignment>().Where(x => x.TeamClientCaseId == firstCase).ExecuteUpdateAsync(s => s.SetProperty(x => x.EndedAt, DateTimeOffset.UtcNow));
        decisions = await service.DecideManyAsync(ids, RelationshipOperation.ProtectedWrite, default);
        Assert.False(decisions[ids[0]].Allowed);
        Assert.True(decisions[ids[1]].Allowed);
        team.Active = false;
        decisions = await service.DecideManyAsync(ids, RelationshipOperation.ProtectedWrite, default);
        Assert.True(decisions[personal.Id].Allowed);
        Assert.All(ids.Take(12), id => Assert.False(decisions[id].Allowed));
        var stranger = new CoachingService(db, new TestAccount(Guid.NewGuid(), Guid.NewGuid()), null!, new Features(), TimeProvider.System, null!, teams: team);
        Assert.All((await stranger.DecideManyAsync(ids, RelationshipOperation.ProtectedWrite, default)).Values, x => Assert.False(x.Allowed));
        features.Granted = false;
        Assert.All((await service.DecideManyAsync(ids, RelationshipOperation.ProtectedWrite, default)).Values, x => Assert.False(x.Allowed));
    }

    [CatalogPostgresFact]
    public async Task Name_search_materializes_profiles_only_for_the_page_and_matches_literal_wildcards()
    {
        var database = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        await using var accounts = new AccountsDbContext(new DbContextOptionsBuilder<AccountsDbContext>().UseNpgsql(database).Options);
        await using var coaching = new CoachingDbContext(new DbContextOptionsBuilder<CoachingDbContext>().UseNpgsql(database).Options);
        var actor = new TestAccount(Guid.NewGuid(), Guid.NewGuid());
        var at = DateTimeOffset.UtcNow;
        var expected = new List<Guid>();
        for (var i = 0; i < 120; i++)
        {
            var client = Guid.NewGuid();
            accounts.Profiles.Add(new Profile { Id = client, DisplayName = i >= 110 ? "Prefix NEEDLE_% suffix" : "NeedleXY", Onboarded = true });
            accounts.Workspaces.Add(new() { Id = Guid.NewGuid(), OwnerId = client });
            var relationship = new Relationship { CoachId = actor.UserId, WorkspaceId = actor.Workspace, ClientId = client, StartedAt = at, CreatedAt = at, UpdatedAt = at.AddMinutes(-i) };
            coaching.Relationships.Add(relationship);
            if (i >= 110) expected.Add(relationship.Id);
        }
        await accounts.SaveChangesAsync();
        await coaching.SaveChangesAsync();
        var directory = new CountingDirectory(new AccountDirectory(accounts));
        var service = new CoachingService(coaching, actor, directory, new Features(), TimeProvider.System, null!);
        var result = await service.ClientsAsync(new() { Search = " needle_% ", PageSize = 3, Page = 2 }, default);
        Assert.Equal(10, result.Total);
        Assert.Equal(expected.Skip(3).Take(3), result.Items.Select(x => x.Id));
        Assert.Equal(3, directory.MaterializedAccounts);
    }

    private sealed class CountingDirectory(IAccountDirectory inner) : IAccountDirectory
    {
        public int MaterializedAccounts { get; private set; }
        public Task<Guid[]> FindNameMatchesAsync(IReadOnlyCollection<Guid> ids, string search, CancellationToken ct) => inner.FindNameMatchesAsync(ids, search, ct);
        public async Task<IReadOnlyDictionary<Guid, AccountDirectoryEntry>> GetAccountsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct)
        {
            var result = await inner.GetAccountsAsync(ids, ct);
            MaterializedAccounts += result.Count;
            return result;
        }
    }

    private sealed class TestAccount(Guid user, Guid workspace, AccountRole role = AccountRole.Coach) : IAccountContext
    {
        public Guid UserId => user;
        public Guid Workspace => workspace;
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(user, workspace));
        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) => throw new NotSupportedException();
        public Task RequireAdminAsync(string permission, CancellationToken ct) => throw new NotSupportedException();
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<AccountRole>>([role]);
    }

    private sealed class Features : IFeatureAccessService
    {
        public bool Granted { get; set; } = true;
        public Task RequireAsync(string key, CancellationToken ct) => Task.CompletedTask;
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => Task.FromResult(new AccessSnapshot("test", new[] { "coaching.clients.manage", "coaching.clients.view", "coaching.relationships.read-own" }.Select(x => new FeatureDecision(x, Granted, "test")).ToArray(), []));
    }

    private sealed class Teams(Guid id, Guid user) : ITeamContext
    {
        public Guid Id => id;
        public bool Active { get; set; } = true;
        public int Calls { get; private set; }
        public Task<TeamAccess?> GetForUserAsync(Guid userId, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult<TeamAccess?>(userId == user ? new(id, user, "Member", "Active", Active) : null);
        }
        public Task<TeamAccess> RequireAsync(Guid teamId, Guid userId, bool administrative, CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class Commands : DbCommandInterceptor
    {
        public int Count { get; set; }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData data, InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        {
            Count++;
            return ValueTask.FromResult(result);
        }
    }
}
