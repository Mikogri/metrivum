using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Domain;
using TrainFlow.Access.Infrastructure;
using TrainFlow.Accounts.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class ClientAccountTests
{
    [CatalogPostgresFact]
    public async Task Client_onboarding_blocks_authoring_even_with_explicit_feature_grants()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(user, "client"))).StatusCode);
        using var db = Access();
        var configuration = $"client-{Guid.NewGuid():N}";
        db.Configurations.Add(new AccessConfiguration { Id = configuration, GrantedFeatures = ["exercises.browse", "exercises.create", "coaching.relationships.read-own", "coaching.groups.manage"] });
        db.Assignments.Add(new AccessAssignment { UserId = user, ConfigurationId = configuration });
        db.Overrides.Add(new FeatureOverride { UserId = user, Key = "exercises.create", Granted = true });
        await db.SaveChangesAsync();
        var snapshot = await Json(await client.GetAsync("/api/v1/me/access"));
        foreach (var key in new[] { "exercises.create", "coaching.groups.manage" })
        {
            var feature = Decision(snapshot, key);
            Assert.False(feature.GetProperty("available").GetBoolean());
            Assert.Equal("role_required", feature.GetProperty("reason").GetString());
        }
        Assert.True(Decision(snapshot, "coaching.relationships.read-own").GetProperty("available").GetBoolean());
        Assert.True(Decision(snapshot, "exercises.browse").GetProperty("available").GetBoolean());
        Assert.Empty(snapshot.GetProperty("limits").EnumerateArray());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/exercises")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/exercises", new
        {
            name = "Client cannot author"
        })).StatusCode);
        using var accounts = Accounts();
        Assert.Equal(new[] { "Client" }, await accounts.Roles.Where(x => x.UserId == user).Select(x => x.Role).ToArrayAsync());
    }

    [CatalogPostgresFact]
    public async Task Legacy_coach_can_activate_client_idempotently_without_changing_workspace_or_other_accounts()
    {
        using var factory = new ApiFactory(Database);
        using var coach = Client(factory, out var user);
        using var other = Client(factory, out var otherUser);
        Assert.Equal(HttpStatusCode.OK, (await coach.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(user))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await other.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(otherUser))).StatusCode);
        var before = await Json(await coach.GetAsync("/api/v1/me"));
        var first = await Json(await coach.PostAsync("/api/v1/me/roles/client", null));
        var repeated = await Json(await coach.PostAsync("/api/v1/me/roles/client", null));
        Assert.Equal(before.GetProperty("workspaceId").GetGuid(), first.GetProperty("workspaceId").GetGuid());
        Assert.Equal(first.GetProperty("version").GetInt64(), repeated.GetProperty("version").GetInt64());
        Assert.Equal(new[] { "Coach", "Client" }, repeated.GetProperty("roles").EnumerateArray().Select(x => x.GetString()).ToArray());
        using var accounts = Accounts();
        Assert.Equal(1, await accounts.Workspaces.CountAsync(x => x.OwnerId == user));
        Assert.Equal(2, await accounts.Roles.CountAsync(x => x.UserId == user));
        Assert.False(await accounts.Roles.AnyAsync(x => x.UserId == otherUser && x.Role == "Client"));
        Assert.Equal(HttpStatusCode.BadRequest, (await coach.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(user, "admin"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await coach.PatchAsJsonAsync("/api/v1/me", new
        {
            displayName = "Forged",
            locale = "en",
            timeZone = "UTC",
            roles = new[] { "Admin" }
        })).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Client_adds_coach_only_through_explicit_validated_coach_onboarding()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        await client.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(user, "client"));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(user))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/me/roles/coach/onboarding", new
        {
            username = $"u{user:N}"[..30],
            displayName = "Test",
            birthDate = "1990-01-01",
            acceptedTerms = false,
            locale = "en",
            timeZone = "UTC"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/v1/me/roles/coach/onboarding", Onboarding(user))).StatusCode);
        var first = await Json(await client.GetAsync("/api/v1/me"));
        var repeat = await Json(await client.PutAsJsonAsync("/api/v1/me/roles/coach/onboarding", Onboarding(user)));
        Assert.Equal(first.GetProperty("version").GetInt64(), repeat.GetProperty("version").GetInt64());
        using var accounts = Accounts();
        Assert.Equal(2, await accounts.Roles.CountAsync(x => x.UserId == user));
    }

    [CatalogPostgresFact]
    public async Task Batch_directory_returns_only_active_onboarded_public_projections()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        using var pending = Client(factory, out var pendingUser);
        await client.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(user, "client"));
        await pending.GetAsync("/api/v1/me");
        using var accounts = Accounts();
        var directory = new AccountDirectory(accounts);
        var projections = await directory.GetAccountsAsync([user, pendingUser, Guid.NewGuid()], default);
        Assert.Equal(user, Assert.Single(projections).Key);
        Assert.Equal([TrainFlow.Accounts.Contracts.AccountRole.Client], projections[user].Roles);
        await accounts.Profiles.Where(x => x.Id == user).ExecuteUpdateAsync(x => x.SetProperty(p => p.Active, false));
        Assert.Empty(await directory.GetAccountsAsync([user], default));
    }

    [CatalogPostgresFact]
    public async Task Parallel_client_activation_has_one_role_and_one_version_increment()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        await client.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(user));
        var before = await Json(await client.GetAsync("/api/v1/me"));
        var responses = await Task.WhenAll(client.PostAsync("/api/v1/me/roles/client", null), client.PostAsync("/api/v1/me/roles/client", null));
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        var after = await Json(await client.GetAsync("/api/v1/me"));
        Assert.Equal(before.GetProperty("version").GetInt64() + 1, after.GetProperty("version").GetInt64());
        using var accounts = Accounts();
        Assert.Equal(1, await accounts.Roles.CountAsync(x => x.UserId == user && x.Role == "Client"));
    }

    [CatalogPostgresFact]
    public async Task Legacy_settings_patch_preserves_phone_and_visibility_when_omitted()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        await client.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(user, "client"));
        var before = await client.GetAsync("/api/v1/me");
        client.DefaultRequestHeaders.IfMatch.Add(before.Headers.ETag!);
        var updated = await client.PatchAsJsonAsync("/api/v1/me", new
        {
            displayName = "Test",
            locale = "pl",
            timeZone = "UTC",
            phone = "+48 123456789",
            phoneVisibleToCoach = true
        });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        client.DefaultRequestHeaders.IfMatch.Clear();
        client.DefaultRequestHeaders.IfMatch.Add(updated.Headers.ETag!);
        var legacyPatch = await Json(await client.PatchAsJsonAsync("/api/v1/me", new
        {
            displayName = "Updated",
            locale = "en",
            timeZone = "UTC"
        }));
        Assert.Equal("+48 123456789", legacyPatch.GetProperty("phone").GetString());
        Assert.True(legacyPatch.GetProperty("phoneVisibleToCoach").GetBoolean());
    }

    private static string Database => Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
    private static AccountsDbContext Accounts() => new(new DbContextOptionsBuilder<AccountsDbContext>().UseNpgsql(Database).Options);
    private static AccessDbContext Access() => new(new DbContextOptionsBuilder<AccessDbContext>().UseNpgsql(Database).Options);
    private static object Onboarding(Guid user, string? role = null) => role is null
        ? new
        {
            username = $"u{user:N}"[..30],
            displayName = "Test Coach",
            birthDate = "1990-01-01",
            acceptedTerms = true,
            locale = "en",
            timeZone = "UTC"
        }
        : new
        {
            username = $"u{user:N}"[..30],
            displayName = "Test Client",
            birthDate = "1990-01-01",
            acceptedTerms = true,
            locale = "en",
            timeZone = "UTC",
            role
        };
    private static HttpClient Client(ApiFactory factory, out Guid user)
    {
        user = Guid.NewGuid();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(user));
        return client;
    }
    private static JsonElement Decision(JsonElement snapshot, string key) => snapshot.GetProperty("features").EnumerateArray().Single(x => x.GetProperty("key").GetString() == key);
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}
