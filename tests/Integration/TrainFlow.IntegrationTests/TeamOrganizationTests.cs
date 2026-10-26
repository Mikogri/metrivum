using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.Billing.Features;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;

namespace TrainFlow.IntegrationTests;

public sealed partial class OffersBillingTests
{
    [CatalogPostgresFact]
    public async Task Disabled_account_cannot_accept_pending_team_ownership()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var member = Guid.NewGuid();
        var clock = new Clock(DateTimeOffset.UtcNow);
        await using var services = TeamServices(owner, isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var billing = TeamBilling(scope);
        var quote = await billing.QuoteAsync(new("Ownership authorization", 3, "eur-monthly-v3-Team"), default);
        var paid = await billing.ConfirmAsync(new(quote.Id, "create"), default);
        var admin = Organization(scope, owner, clock);
        var invite = await admin.RequestAsync(paid.TeamId, new(member.ToString()), default);
        await Organization(scope, member, clock).DecideAsync(invite.Id, true, default);
        var current = (await admin.HomeAsync(default)).Teams.Single();
        await admin.RequestOwnershipAsync(paid.TeamId, new(member, current.Version), Recent(clock), default);
        current = (await admin.HomeAsync(default)).Teams.Single();

        await using var accounts = new TrainFlow.Accounts.Infrastructure.AccountsDbContext(
            new DbContextOptionsBuilder<TrainFlow.Accounts.Infrastructure.AccountsDbContext>()
                .UseNpgsql(isolated.Connection, options => options.MigrationsHistoryTable("__EFMigrationsHistory", "accounts")).Options);
        await accounts.Database.MigrateAsync();
        accounts.Profiles.Add(new() { Id = member, Active = false, Onboarded = true });
        accounts.Workspaces.Add(new() { Id = Guid.NewGuid(), OwnerId = member });
        accounts.Roles.Add(new() { UserId = member, Role = "Coach" });
        await accounts.SaveChangesAsync();
        var http = new Microsoft.AspNetCore.Http.HttpContextAccessor
        {
            HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity([new("sub", member.ToString())], "test"))
            }
        };
        var account = new TrainFlow.Accounts.Infrastructure.AccountContext(http, accounts);
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        var recipient = new TeamService(db, account, new OrganizationDirectory(),
            scope.ServiceProvider.GetRequiredService<ModuleTransaction>(), clock);
        var error = await Assert.ThrowsAsync<ApiException>(() => recipient.AcceptOwnershipAsync(paid.TeamId, current.Version, Recent(clock), default));
        Assert.Equal("ACCOUNT_DISABLED", error.Code);
        var unchanged = await db.Teams.AsNoTracking().SingleAsync(x => x.Id == paid.TeamId);
        Assert.Equal(owner, unchanged.OwnerId);
        Assert.Equal(member, unchanged.PendingOwnerId);
        Assert.Equal(current.Version, unchanged.Version);
        Assert.Equal("Member", (await db.TeamMemberships.AsNoTracking().SingleAsync(x => x.TeamId == paid.TeamId && x.UserId == member)).Role);

        (await accounts.Profiles.SingleAsync(x => x.Id == member)).Active = true;
        await accounts.SaveChangesAsync();
        await recipient.AcceptOwnershipAsync(paid.TeamId, current.Version, Recent(clock), default);
        Assert.Equal(member, (await db.Teams.AsNoTracking().SingleAsync(x => x.Id == paid.TeamId)).OwnerId);
    }

    private sealed class OrganizationDirectory : IAccountDirectory
    {
        public Task<IReadOnlyDictionary<Guid, AccountDirectoryEntry>> GetAccountsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
            Task.FromResult<IReadOnlyDictionary<Guid, AccountDirectoryEntry>>(ids.ToDictionary(x => x, x => new AccountDirectoryEntry(x, x, x.ToString("N"), "Coach", [AccountRole.Coach])));
        public Task<AccountDirectoryEntry?> ResolveExactUsernameAsync(string name, CancellationToken ct) =>
            Task.FromResult<AccountDirectoryEntry?>(Guid.TryParse(name, out var id) ? new(id, id, name, "Coach", [AccountRole.Coach]) : null);
    }
    private sealed class OrganizationLifecycle : ITeamLifecycle
    {
        public int Closed
        {
            get; private set;
        }
        public Guid? BlockedTeam
        {
            get; set;
        }
        public Task CheckDissolutionAsync(Guid teamId, CancellationToken ct) => Task.CompletedTask;
        public Task EndAsync(Guid teamId, CancellationToken ct)
        {
            if (BlockedTeam == teamId)
                throw ApiException.Conflict("Unresolved service obligation");
            Closed++;
            return Task.CompletedTask;
        }
        public Task RemoveCoachAsync(Guid teamId, Guid userId, CancellationToken ct) => Task.CompletedTask;
    }
    private static TeamService Organization(AsyncServiceScope scope, Guid user, Clock clock, OrganizationLifecycle? lifecycle = null) =>
        new(scope.ServiceProvider.GetRequiredService<BillingDbContext>(), new Account(user), new OrganizationDirectory(),
            scope.ServiceProvider.GetRequiredService<ModuleTransaction>(), clock, lifecycle: lifecycle);
    private static ClaimsPrincipal Recent(Clock clock) => new(new ClaimsIdentity([new("auth_time", clock.Now.ToUnixTimeSeconds().ToString())], "test"));

    [CatalogPostgresFact]
    public async Task Team_last_paid_seat_is_atomic_and_members_cannot_administer()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var clock = new Clock(DateTimeOffset.UtcNow);
        await using var services = TeamServices(owner, isolated.Connection, clock);
        Guid teamId, inviteA, inviteB;
        await using (var scope = services.CreateAsyncScope())
        {
            var billing = TeamBilling(scope);
            var quote = await billing.QuoteAsync(new("Atomic seats", 3, "eur-monthly-v3-Team"), default);
            teamId = (await billing.ConfirmAsync(new(quote.Id, "create"), default)).TeamId;
            var team = Organization(scope, owner, clock);
            var occupiedUser = Guid.NewGuid();
            var occupiedInvite = await team.RequestAsync(teamId, new(occupiedUser.ToString()), default);
            await Organization(scope, occupiedUser, clock).DecideAsync(occupiedInvite.Id, true, default);
            inviteA = (await team.RequestAsync(teamId, new(a.ToString()), default)).Id;
            inviteB = (await team.RequestAsync(teamId, new(b.ToString()), default)).Id;
        }
        async Task<bool> Accept(Guid user, Guid invite)
        {
            await using var provider = TeamServices(user, isolated.Connection, clock);
            await using var scope = provider.CreateAsyncScope();
            try
            {
                await Organization(scope, user, clock).DecideAsync(invite, true, default);
                return true;
            }
            catch (ApiException error) { Assert.Equal("TEAM_SEATS_FULL", error.Code); return false; }
        }
        var accepted = await Task.WhenAll(Accept(a, inviteA), Accept(b, inviteB));
        Assert.Single(accepted, x => x);
        var winner = accepted[0] ? a : b;
        await using var verify = services.CreateAsyncScope();
        var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Equal(3, await db.TeamMemberships.CountAsync(x => x.TeamId == teamId && x.Status == "Active"));
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => Organization(verify, winner, clock).RequestAsync(teamId, new(Guid.NewGuid().ToString()), default))).Status);
        var context = await new TeamContext(db, clock).GetForUserAsync(winner, default);
        Assert.True(context!.IsActive);
        Assert.Equal("Member", context.Role);
    }

    [CatalogPostgresFact]
    public async Task Team_owner_transfer_requires_recipient_acceptance_and_revokes_old_billing_authority()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var member = Guid.NewGuid();
        var clock = new Clock(DateTimeOffset.UtcNow);
        await using var services = TeamServices(owner, isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var billing = TeamBilling(scope);
        var quote = await billing.QuoteAsync(new("Ownership", 3, "eur-monthly-v3-Team"), default);
        var paid = await billing.ConfirmAsync(new(quote.Id, "create"), default);
        var admin = Organization(scope, owner, clock);
        var recipient = Organization(scope, member, clock);
        var invite = await admin.RequestAsync(paid.TeamId, new(member.ToString()), default);
        await recipient.DecideAsync(invite.Id, true, default);
        var current = (await admin.HomeAsync(default)).Teams.Single();
        await Assert.ThrowsAsync<ApiException>(() => admin.RequestOwnershipAsync(paid.TeamId, new(member, current.Version), new ClaimsPrincipal(), default));
        await admin.RequestOwnershipAsync(paid.TeamId, new(member, current.Version), Recent(clock), default);
        current = (await recipient.HomeAsync(default)).Teams.Single();
        await Assert.ThrowsAsync<ApiException>(() => admin.AcceptOwnershipAsync(paid.TeamId, current.Version, Recent(clock), default));
        await recipient.AcceptOwnershipAsync(paid.TeamId, current.Version, Recent(clock), default);
        Assert.Equal("Owner", (await recipient.HomeAsync(default)).Teams.Single().Role);
        Assert.Equal("Admin", (await admin.HomeAsync(default)).Teams.Single().Role);
        await Assert.ThrowsAsync<ApiException>(() => billing.BillingAsync(paid.TeamId, default));
    }

    [CatalogPostgresFact]
    public async Task Team_dissolution_is_delayed_cancellable_and_idempotent_after_restart()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var clock = new Clock(DateTimeOffset.UtcNow);
        var lifecycle = new OrganizationLifecycle();
        await using var services = TeamServices(owner, isolated.Connection, clock);
        Guid id;
        DateTimeOffset end;
        await using (var scope = services.CreateAsyncScope())
        {
            var billing = TeamBilling(scope);
            var quote = await billing.QuoteAsync(new("Lifecycle", 3, "eur-monthly-v3-Team"), default);
            var paid = await billing.ConfirmAsync(new(quote.Id, "create"), default);
            id = paid.TeamId;
            end = paid.PeriodEnd;
            var teams = Organization(scope, owner, clock, lifecycle);
            var current = (await teams.HomeAsync(default)).Teams.Single();
            await Assert.ThrowsAsync<ApiException>(() => teams.RemoveAsync(id, owner, current.Version, default));
            var scheduled = await teams.ScheduleDissolutionAsync(id, new(current.Version, true), Recent(clock), default);
            Assert.Equal(end, scheduled.DissolutionAt);
            Assert.Equal(0, await teams.ProcessTransitionsAsync(10, default));
            var cancelled = await teams.CancelDissolutionAsync(id, new(scheduled.Version), default);
            Assert.Null(cancelled.DissolutionAt);
            Assert.False((await billing.BillingAsync(id, default)).AutoRenew);
            await teams.ScheduleDissolutionAsync(id, new(cancelled.Version, true), Recent(clock), default);
        }
        clock.Now = end.AddSeconds(1);
        async Task Run()
        {
            await using var scope = services.CreateAsyncScope();
            await Organization(scope, owner, clock, lifecycle).ProcessTransitionsAsync(10, default);
        }
        await Task.WhenAll(Run(), Run());
        await Run();
        Assert.Equal(1, lifecycle.Closed);
        await using var verify = services.CreateAsyncScope();
        var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Equal("Dissolved", (await db.Teams.SingleAsync()).Status);
        Assert.All(await db.TeamMemberships.ToArrayAsync(), x => Assert.Equal("Ended", x.Status));
        Assert.Single(await db.Payments.ToArrayAsync());
    }

    [CatalogPostgresFact]
    public async Task Unresolved_dissolution_does_not_block_another_team()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(DateTimeOffset.UtcNow);
        var lifecycle = new OrganizationLifecycle();
        var ids = new List<Guid>();
        DateTimeOffset end = default;
        foreach (var owner in new[] { Guid.NewGuid(), Guid.NewGuid() })
        {
            await using var provider = TeamServices(owner, isolated.Connection, clock);
            await using var scope = provider.CreateAsyncScope();
            var billing = TeamBilling(scope);
            var quote = await billing.QuoteAsync(new("Independent lifecycle", 3, "eur-monthly-v3-Team"), default);
            var paid = await billing.ConfirmAsync(new(quote.Id, "create"), default);
            ids.Add(paid.TeamId);
            end = paid.PeriodEnd;
            var team = Organization(scope, owner, clock, lifecycle);
            var current = (await team.HomeAsync(default)).Teams.Single();
            await team.ScheduleDissolutionAsync(paid.TeamId, new(current.Version, true), Recent(clock), default);
        }
        lifecycle.BlockedTeam = ids[0];
        clock.Now = end.AddSeconds(1);
        await using var services = TeamServices(Guid.NewGuid(), isolated.Connection, clock);
        await using var run = services.CreateAsyncScope();
        Assert.Equal(1, await Organization(run, Guid.NewGuid(), clock, lifecycle).ProcessTransitionsAsync(10, default));
        var db = run.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Equal("DissolutionScheduled", (await db.Teams.AsNoTracking().SingleAsync(x => x.Id == ids[0])).Status);
        Assert.Equal("Dissolved", (await db.Teams.AsNoTracking().SingleAsync(x => x.Id == ids[1])).Status);
    }
}
