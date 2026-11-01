using System.Data.Common;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Metrivum.Access.Contracts;
using Metrivum.Access.Domain;
using Metrivum.Access.Infrastructure;
using Metrivum.Accounts.Domain;
using Metrivum.Accounts.Infrastructure;
using Metrivum.BuildingBlocks;

namespace Metrivum.IntegrationTests;

public sealed class AccountQueryTests
{
    [CatalogPostgresFact]
    public async Task Existing_account_and_repeated_feature_checks_use_four_reads_and_no_provisioning_writes()
    {
        var user = Guid.NewGuid();
        var counter = new CommandCounter();
        using var accounts = Accounts(counter);
        using var access = Access(counter);
        await Seed(accounts, access, user);
        counter.Commands.Clear();
        var account = Context(accounts, user);
        var features = Features(access, account);

        await account.RequireCoachAsync(default);
        await features.RequireAsync("exercises.browse", default);
        await features.RequireAsync("exercises.browse", default);
        await account.RequireClientAsync(default);
        var snapshot = await features.GetAsync(default);

        Assert.True(snapshot.Features.Single().Available);
        Assert.DoesNotContain(counter.Commands, sql => sql.Contains("INSERT INTO", StringComparison.OrdinalIgnoreCase));
        Assert.True(counter.Commands.Count <= 4, $"Expected <= 4 commands, got {counter.Commands.Count}");
        Assert.DoesNotContain(counter.Commands, sql => sql.Contains("SystemValues") || sql.Contains("BirthDate"));
    }

    [CatalogPostgresFact]
    public async Task Saving_roles_or_access_invalidates_request_local_reads()
    {
        var user = Guid.NewGuid();
        using var accounts = Accounts(new());
        using var access = Access(new());
        await Seed(accounts, access, user);
        var account = Context(accounts, user);
        var features = Features(access, account);
        var before = await features.GetAsync(default);
        access.Overrides.Add(new FeatureOverride { UserId = user, Key = "exercises.browse", Granted = false });
        await access.SaveChangesAsync();
        var after = await features.GetAsync(default);
        Assert.False(after.Features.Single().Available);
        Assert.NotEqual(before.Version, after.Version);
        accounts.Roles.Remove(await accounts.Roles.SingleAsync(x => x.UserId == user && x.Role == "Coach"));
        await accounts.SaveChangesAsync();
        var error = await Assert.ThrowsAsync<ApiException>(() => account.RequireCoachAsync(default));
        Assert.Equal("ONBOARDING_REQUIRED", error.Code);
        var profile = await accounts.Profiles.SingleAsync(x => x.Id == user);
        profile.Active = false;
        await accounts.SaveChangesAsync();
        error = await Assert.ThrowsAsync<ApiException>(() => account.GetRolesAsync(default));
        Assert.Equal("ACCOUNT_DISABLED", error.Code);
    }

    private static async Task Seed(AccountsDbContext accounts, AccessDbContext access, Guid user)
    {
        accounts.Profiles.Add(new Profile { Id = user, Onboarded = true });
        accounts.Workspaces.Add(new Workspace { Id = Guid.NewGuid(), OwnerId = user });
        accounts.Roles.AddRange(new UserRole { UserId = user, Role = "Coach" }, new UserRole { UserId = user, Role = "Client" });
        await accounts.SaveChangesAsync();
        var id = $"query-{user:N}";
        access.Configurations.Add(new AccessConfiguration { Id = id, GrantedFeatures = ["exercises.browse"] });
        access.Assignments.Add(new AccessAssignment { UserId = user, ConfigurationId = id });
        await access.SaveChangesAsync();
        accounts.ChangeTracker.Clear();
        access.ChangeTracker.Clear();
    }

    private static AccountContext Context(AccountsDbContext db, Guid user) => new(new HttpContextAccessor
    {
        HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", user.ToString())], "test")) }
    }, db);
    private static FeatureAccessService Features(AccessDbContext db, AccountContext account) => new(db,
        new FeatureCatalog([new FeatureDefinition("exercises.browse", "Exercises", "title", "description", [], [])]), account, []);
    private static AccountsDbContext Accounts(CommandCounter counter) => new(new DbContextOptionsBuilder<AccountsDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")).AddInterceptors(counter).Options);
    private static AccessDbContext Access(CommandCounter counter) => new(new DbContextOptionsBuilder<AccessDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")).AddInterceptors(counter).Options);

    private sealed class CommandCounter : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }
}
