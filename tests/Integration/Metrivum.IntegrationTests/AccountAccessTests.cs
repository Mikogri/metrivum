using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.Access.Domain;
using Metrivum.Access.Infrastructure;
using Metrivum.Accounts.Domain;
using Metrivum.Accounts.Infrastructure;

namespace Metrivum.IntegrationTests;

public sealed class AccountAccessTests
{
    [CatalogPostgresFact]
    public async Task Signed_session_provisions_one_profile_and_requires_onboarding_for_tools()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        var response = await client.GetAsync("/api/v1/me");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = await Json(response);
        Assert.Equal(user, profile.GetProperty("id").GetGuid());
        Assert.False(profile.GetProperty("onboarded").GetBoolean());
        Assert.NotEqual(Guid.Empty, profile.GetProperty("workspaceId").GetGuid());
        Assert.NotNull(response.Headers.ETag);
        var denied = await client.GetAsync("/api/v1/exercises");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal("ONBOARDING_REQUIRED", (await Json(denied)).GetProperty("code").GetString());
        await Onboard(client, user);
        await SeedDefault(factory);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/exercises")).StatusCode);
        using var db = Accounts();
        Assert.Equal(1, await db.Profiles.CountAsync(x => x.Id == user));
        Assert.Equal(1, await db.Workspaces.CountAsync(x => x.OwnerId == user));
    }

    [CatalogPostgresFact]
    public async Task Parallel_onboarding_creates_one_workspace_and_coach_role()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        var body = Onboarding(user);
        var results = await Task.WhenAll(client.PutAsJsonAsync("/api/v1/me/onboarding", body), client.PutAsJsonAsync("/api/v1/me/onboarding", body));
        Assert.All(results, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));
        using var db = Accounts();
        Assert.Equal(1, await db.Profiles.CountAsync(x => x.Id == user && x.Onboarded));
        Assert.Equal(1, await db.Workspaces.CountAsync(x => x.OwnerId == user));
        Assert.Equal(1, await db.Roles.CountAsync(x => x.UserId == user && x.Role == "Coach"));
    }

    [CatalogPostgresFact]
    public async Task User_metadata_does_not_grant_admin_or_feature_access()
    {
        using var factory = new ApiFactory(Database);
        var user = Guid.NewGuid();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(user, metadataAdmin: true));
        await Onboard(client, user);
        var response = await client.GetAsync("/api/v1/admin/access");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("ADMIN_PERMISSION_REQUIRED", (await Json(response)).GetProperty("code").GetString());
        using var db = Accounts();
        Assert.Equal(new[] { "Coach" }, await db.Roles.Where(x => x.UserId == user).Select(x => x.Role).ToArrayAsync());
        using var accessDb = Access();
        var configId = $"test-{Guid.NewGuid():N}";
        accessDb.Configurations.Add(new AccessConfiguration { Id = configId, GrantedFeatures = [] });
        accessDb.Assignments.Add(new AccessAssignment { UserId = user, ConfigurationId = configId });
        await accessDb.SaveChangesAsync();
        var denied = await client.GetAsync("/api/v1/exercises");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal("FEATURE_UNAVAILABLE", (await Json(denied)).GetProperty("code").GetString());
    }

    [CatalogPostgresFact]
    public async Task Public_onboarding_rejects_server_owned_fields()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        var original = JsonSerializer.SerializeToElement(Onboarding(user));
        foreach (var field in new[] { "ownerId", "workspaceId", "roles", "admin", "capabilities", "configurationId" })
        {
            var body = original.EnumerateObject().ToDictionary(x => x.Name, x => (object?)x.Value);
            body[field] = field is "roles" or "capabilities" ? new[] { "Admin" } : "forged";
            var response = await client.PutAsJsonAsync("/api/v1/me/onboarding", body);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        using var db = Accounts();
        Assert.False(await db.Roles.AnyAsync(x => x.UserId == user));
    }

    [CatalogPostgresFact]
    public async Task Disabling_account_blocks_an_existing_valid_session()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        await Onboard(client, user);
        using var db = Accounts();
        await db.Profiles.Where(x => x.Id == user).ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Active, false));
        foreach (var endpoint in new[] { "/api/v1/me", "/api/v1/me/access", "/api/v1/exercises", "/api/v1/admin/access" })
        {
            var response = await client.GetAsync(endpoint);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Equal("ACCOUNT_DISABLED", (await Json(response)).GetProperty("code").GetString());
        }
    }

    [CatalogPostgresFact]
    public async Task Access_configuration_and_overrides_change_on_the_same_api_instance()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        using var admin = Client(factory, out var adminId);
        await Onboard(client, user);
        await Onboard(admin, adminId);
        await MakeAdmin(adminId);
        var id = $"test-{Guid.NewGuid():N}";
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/v1/admin/access/configurations/{id}", new
        {
            expectedVersion = 0,
            grantedFeatures = Array.Empty<string>()
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/v1/admin/access/users/{user}/configuration", new
        {
            expectedVersion = 0,
            configurationId = id
        })).StatusCode);
        var before = await Json(await client.GetAsync("/api/v1/me/access"));
        Assert.Equal("not_granted", Decision(before, "exercises.browse").GetProperty("reason").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/exercises")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/v1/admin/access/configurations/{id}", new
        {
            expectedVersion = 1,
            grantedFeatures = new[] { "exercises.browse", "exercises.create" }
        })).StatusCode);
        var after = await Json(await client.GetAsync("/api/v1/me/access"));
        Assert.True(Decision(after, "exercises.browse").GetProperty("available").GetBoolean());
        Assert.NotEqual(before.GetProperty("version").GetString(), after.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/exercises")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/v1/admin/access/users/{user}/features/exercises.browse", new
        {
            expectedVersion = 0,
            granted = false
        })).StatusCode);
        var denied = await Json(await client.GetAsync("/api/v1/me/access"));
        Assert.Equal("explicit_deny", Decision(denied, "exercises.browse").GetProperty("reason").GetString());
        Assert.Equal("dependency_unavailable", Decision(denied, "exercises.create").GetProperty("reason").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/exercises")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/v1/admin/access/users/{user}/features/exercises.browse", new
        {
            expectedVersion = 1,
            granted = true
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/exercises")).StatusCode);
        using var db = Access();
        Assert.Equal(5, await db.Audit.CountAsync(x => x.ActorId == adminId));
    }

    [CatalogPostgresFact]
    public async Task Explicit_null_feature_list_is_validation_error()
    {
        using var factory = new ApiFactory(Database);
        using var admin = Client(factory, out var user);
        await Onboard(admin, user);
        await MakeAdmin(user);
        var response = await admin.PutAsJsonAsync($"/api/v1/admin/access/configurations/test-{Guid.NewGuid():N}", new
        {
            expectedVersion = 0,
            grantedFeatures = (string[]?)null
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static JsonElement Decision(JsonElement snapshot, string key) => snapshot.GetProperty("features").EnumerateArray().Single(x => x.GetProperty("key").GetString() == key);
    private static string Database => Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
    private static AccountsDbContext Accounts() => new(new DbContextOptionsBuilder<AccountsDbContext>().UseNpgsql(Database).Options);
    private static AccessDbContext Access() => new(new DbContextOptionsBuilder<AccessDbContext>().UseNpgsql(Database).Options);
    private static HttpClient Client(ApiFactory factory, out Guid user)
    {
        user = Guid.NewGuid();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(user));
        return client;
    }
    private static object Onboarding(Guid user) => new { username = $"u{user:N}"[..30], displayName = "Test Coach", birthDate = "1990-01-01", acceptedTerms = true, locale = "pl", timeZone = "Europe/Warsaw" };
    private static async Task Onboard(HttpClient client, Guid user)
    {
        var response = await client.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(user));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
    private static async Task MakeAdmin(Guid user)
    {
        using var db = Accounts();
        db.Roles.Add(new UserRole { UserId = user, Role = "AccessAdmin" });
        await db.SaveChangesAsync();
    }
    private static async Task SeedDefault(ApiFactory factory)
    {
        using var db = Access();
        var keys = factory.Services.GetRequiredService<FeatureCatalog>().Definitions.Keys.Order().ToArray();
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO access.configurations (\"Id\", \"GrantedFeatures\", \"Version\") VALUES ('v1-default', {keys}, 1) ON CONFLICT (\"Id\") DO NOTHING");
    }
    private static async Task<JsonElement> Json(HttpResponseMessage response) => await response.Content.ReadFromJsonAsync<JsonElement>();
}
