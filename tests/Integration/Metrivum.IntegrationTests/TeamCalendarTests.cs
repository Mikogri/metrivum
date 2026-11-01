using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Calendar.Domain;
using Metrivum.Calendar.Features;
using Metrivum.Calendar.Infrastructure;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Notifications.Contracts;
namespace Metrivum.IntegrationTests;

public sealed class TeamCalendarTests
{
    [CatalogPostgresFact]
    public async Task Team_calendar_rejects_mixed_scope_revokes_departed_coach_and_cancels_only_future_team_events()
    {
        var owner = Guid.NewGuid();
        var teamId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var teamRow = new Relationship { CoachId = owner, WorkspaceId = owner, ClientId = Guid.NewGuid(), StartedAt = now, CreatedAt = now, UpdatedAt = now };
        var personalRow = new Relationship { CoachId = owner, WorkspaceId = owner, ClientId = Guid.NewGuid(), StartedAt = now, CreatedAt = now, UpdatedAt = now };
        var account = new Account(owner);
        var team = new TeamScope(teamId, owner);
        var notifications = new Notifications();
        var recipients = new Recipients([new(teamRow.Id, owner, owner, teamRow.ClientId, RelationshipStatus.Active, teamId, Guid.NewGuid()), new(personalRow.Id, owner, owner, personalRow.ClientId, RelationshipStatus.Active)]);
        var collection = new ServiceCollection();
        collection.AddSingleton(NpgsqlDataSource.Create(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!));
        collection.AddModuleDatabase<CalendarDbContext>("calendar");
        collection.AddModuleDatabase<CoachingDbContext>("coaching");
        await using var provider = collection.BuildServiceProvider();
        var db = provider.GetRequiredService<CalendarDbContext>();
        var coaching = provider.GetRequiredService<CoachingDbContext>();
        coaching.Relationships.AddRange(teamRow, personalRow);
        await coaching.SaveChangesAsync();
        var transaction = provider.GetRequiredService<ModuleTransaction>();
        var service = new CalendarService(db, account, new Features(), recipients, new Directory(), transaction, TimeProvider.System, notifications, team, new Policy());
        EventWrite Write(DateTimeOffset at, params Guid[] ids) => new("Meeting", "Scoped event", null, "UTC", at, at.AddHours(1), null, null, null, null, ids, []);
        await Assert.ThrowsAsync<ApiException>(() => service.Write(null, Write(now.AddDays(2), teamRow.Id, personalRow.Id), 0, default));
        var future = await service.Write(null, Write(now.AddDays(2), teamRow.Id), 0, default);
        var past = await service.Write(null, Write(now.AddDays(-2), teamRow.Id), 0, default);
        var personal = await service.Write(null, Write(now.AddDays(2), personalRow.Id), 0, default);
        Assert.Equal(teamId, future.TeamId);
        Assert.Null(personal.TeamId);
        var lifecycle = new TeamCalendarLifecycle(db, notifications);
        await transaction.RunAsync(async ct =>
        {
            await lifecycle.CloseAsync(teamId, [teamRow.Id], owner, now, ct);
            await lifecycle.CloseAsync(teamId, [teamRow.Id], owner, now, ct);
        }, default);
        Assert.True((await db.Events.AsNoTracking().SingleAsync(x => x.Id == future.Id)).Cancelled);
        Assert.False((await db.Events.AsNoTracking().SingleAsync(x => x.Id == past.Id)).Cancelled);
        Assert.False((await db.Events.AsNoTracking().SingleAsync(x => x.Id == personal.Id)).Cancelled);
        Assert.Single(await db.Audit.Where(x => x.EventId == future.Id && x.Action == "TeamRelationshipEnded").ToArrayAsync());
        team.Active = false;
        var delivery = new CalendarNotificationPolicy(db, recipients, team);
        Assert.False(await delivery.CanDeliverAsync(new(teamRow.ClientId, "pending", "CalendarInvitation", "System", "Calendar", past.Id), default));
        Assert.True(await delivery.CanDeliverAsync(new(teamRow.ClientId, "cancelled", "CalendarCancelled", "System", "Calendar", future.Id), default));
        await Assert.ThrowsAsync<ApiException>(() => service.Detail(past.Id, "coach", default));
        Assert.Equal(personal.Id, (await service.Detail(personal.Id, "coach", default)).Id);
        account.UserId = teamRow.ClientId;
        Assert.Equal(past.Id, (await service.Detail(past.Id, "client", default)).Id);
    }
    private sealed class Account(Guid user) : IAccountContext
    {
        public Guid UserId { get; set; } = user;
        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(UserId, UserId));
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(UserId, UserId));
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<AccountRole>>([AccountRole.Coach, AccountRole.Client]);
        public Task RequireAdminAsync(string permission, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class TeamScope(Guid id, Guid owner) : ITeamContext
    {
        public bool Active { get; set; } = true;
        public Task<TeamAccess?> GetForUserAsync(Guid userId, CancellationToken ct) => Task.FromResult<TeamAccess?>(Active ? new(id, owner, "Member", "Active", true) : null);
        public Task<TeamAccess> RequireAsync(Guid teamId, Guid userId, bool administrative, CancellationToken ct) => Active && teamId == id ? Task.FromResult(new TeamAccess(id, owner, "Member", "Active", true)) : Task.FromException<TeamAccess>(ApiException.NotFound());
    }
    private sealed class Recipients(RelationshipRecipient[] rows) : IRelationshipRecipients
    {
        public Task<RelationshipRecipient?> GetAsync(Guid id, CancellationToken ct) => Task.FromResult(rows.SingleOrDefault(x => x.Id == id));
        public Task<IReadOnlyList<RelationshipRecipient>> GetForUserAsync(Guid user, bool coach, CancellationToken ct) => Task.FromResult<IReadOnlyList<RelationshipRecipient>>(rows);
        public Task<IReadOnlyList<RelationshipRecipient>> ResolveActiveAsync(Guid coach, Guid workspace, IReadOnlyCollection<Guid> ids, IReadOnlyCollection<Guid> groups, CancellationToken ct) => Task.FromResult<IReadOnlyList<RelationshipRecipient>>(rows.Where(x => ids.Contains(x.Id)).ToArray());
    }
    private sealed class Features : IFeatureAccessService
    {
        public Task RequireAsync(string feature, CancellationToken ct) => Task.CompletedTask;
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Policy : IRelationshipAccessPolicy
    {
        public Task<RelationshipAccessDecision> DecideAsync(Guid id, RelationshipOperation operation, CancellationToken ct) => Task.FromResult(new RelationshipAccessDecision(true, "ALLOWED", RelationshipStatus.Active));
        public Task<IReadOnlyDictionary<Guid, RelationshipAccessDecision>> DecideManyAsync(IReadOnlyCollection<Guid> ids, RelationshipOperation operation, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Directory : IAccountDirectory
    {
        public Task<IReadOnlyDictionary<Guid, AccountDirectoryEntry>> GetAccountsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) => Task.FromResult<IReadOnlyDictionary<Guid, AccountDirectoryEntry>>(new Dictionary<Guid, AccountDirectoryEntry>());
    }
    private sealed class Notifications : INotificationPublisher
    {
        public Task PublishAsync(NotificationEvent notification, CancellationToken ct) => Task.CompletedTask;
        public Task CancelScheduledAsync(string module, Guid id, CancellationToken ct) => Task.CompletedTask;
    }
}
