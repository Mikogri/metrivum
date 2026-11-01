using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Metrivum.Access.Domain;
using Metrivum.Access.Infrastructure;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Accounts.Infrastructure;
using Metrivum.Accounts.Contracts;
using Metrivum.Access.Contracts;
using Metrivum.Coaching.Features;
using Microsoft.Extensions.Hosting;
using Metrivum.BuildingBlocks;

namespace Metrivum.IntegrationTests;

public sealed class CoachingTests
{
    [CatalogPostgresFact]
    public async Task Client_phone_is_shared_only_with_own_coach_after_explicit_visibility()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        var client = await User(factory, "Client");
        var outsider = await User(factory, "Coach");
        var id = await Activate(factory, coach.Id, client.Id);
        var profile = await Get(client.Http, "/api/v1/me");
        var update = await Mutate(client.Http, HttpMethod.Patch, "/api/v1/me", profile.GetProperty("version").GetInt64(),
            new
            {
                displayName = "Private phone",
                locale = "en",
                timeZone = "UTC",
                phone = "+48123456789",
                phoneVisibleToCoach = false
            });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await Get(coach.Http, Root + $"/clients/{id}")).GetProperty("clientPhone").ValueKind);
        profile = await Get(client.Http, "/api/v1/me");
        update = await Mutate(client.Http, HttpMethod.Patch, "/api/v1/me", profile.GetProperty("version").GetInt64(),
            new
            {
                displayName = "Shared phone",
                locale = "en",
                timeZone = "UTC",
                phoneVisibleToCoach = true
            });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal("+48123456789", (await Get(coach.Http, Root + $"/clients/{id}")).GetProperty("clientPhone").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.Http.GetAsync(Root + $"/clients/{id}")).StatusCode);
        Assert.False((await Get(client.Http, Root + $"/relationships/{id}")).TryGetProperty("clientPhone", out _));
    }

    private const string Root = "/api/v1/coaching";
    private static string Database => Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
    private static CoachingDbContext Db() => new(new DbContextOptionsBuilder<CoachingDbContext>().UseNpgsql(Database).Options);
    private static AccessDbContext Access() => new(new DbContextOptionsBuilder<AccessDbContext>().UseNpgsql(Database).Options);

    [CatalogPostgresFact]
    public async Task Internal_policy_checks_identity_role_feature_and_status_without_endpoint_decorators()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        var client = await User(factory, "Client");
        var id = await Activate(factory, coach.Id, client.Id);
        using var scope = factory.Services.CreateScope();
        using var db = Db();
        var directory = scope.ServiceProvider.GetRequiredService<IAccountDirectory>();
        CoachingService Policy(Guid user, AccountRole role, bool grant = true) => new(db, new PolicyAccount(user, role), directory, new PolicyFeatures(grant), TimeProvider.System, scope.ServiceProvider.GetRequiredService<IHostEnvironment>());
        Assert.True((await Policy(client.Id, AccountRole.Client).DecideAsync(id, RelationshipOperation.ProtectedWrite, default)).Allowed);
        Assert.False((await Policy(client.Id, AccountRole.Client).DecideAsync(id, RelationshipOperation.Manage, default)).Allowed);
        Assert.False((await Policy(coach.Id, AccountRole.Coach, false).DecideAsync(id, RelationshipOperation.Manage, default)).Allowed);
        Assert.False((await Policy(client.Id, AccountRole.Coach).DecideAsync(id, RelationshipOperation.OrganizationalRead, default)).Allowed);
        Assert.False((await Policy(Guid.NewGuid(), AccountRole.Coach).DecideAsync(id, RelationshipOperation.Manage, default)).Allowed);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(coach.Http, HttpMethod.Post, $"{Root}/relationships/{id}/suspend", 1)).StatusCode);
        Assert.True((await Policy(client.Id, AccountRole.Client).DecideAsync(id, RelationshipOperation.OrganizationalRead, default)).Allowed);
        Assert.False((await Policy(client.Id, AccountRole.Client).DecideAsync(id, RelationshipOperation.ProtectedRead, default)).Allowed);
        Assert.False((await Policy(client.Id, AccountRole.Client).DecideAsync(id, RelationshipOperation.ProtectedWrite, default)).Allowed);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(coach.Http, HttpMethod.Post, $"{Root}/relationships/{id}/resume", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(coach.Http, HttpMethod.Post, $"{Root}/relationships/{id}/complete", 3)).StatusCode);
        Assert.False((await Policy(client.Id, AccountRole.Client).DecideAsync(id, RelationshipOperation.ProtectedRead, default)).Allowed);
        Assert.True((await Policy(client.Id, AccountRole.Client).DecideAsync(id, RelationshipOperation.HistoricalSharedRead, default)).Allowed);
        Assert.False((await Policy(client.Id, AccountRole.Client).DecideAsync(id, RelationshipOperation.ProtectedWrite, default)).Allowed);
    }

    [CatalogPostgresFact]
    public async Task Client_role_activation_preserves_coach_workspace_and_does_not_create_relationships()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        var client = await User(factory, "Client");
        var before = await Get(coach.Http, "/api/v1/me");
        var workspace = before.GetProperty("workspaceId").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await coach.Http.GetAsync("/api/v1/training/programs")).StatusCode);
        foreach (var i in Enumerable.Range(0, 2))
            Assert.Equal(HttpStatusCode.OK, (await coach.Http.PostAsync("/api/v1/me/roles/client", null)).StatusCode);
        var after = await Get(coach.Http, "/api/v1/me");
        Assert.Equal(workspace, after.GetProperty("workspaceId").GetGuid());
        Assert.Equal(new[] { "Client", "Coach" }, after.GetProperty("roles").EnumerateArray().Select(x => x.GetString()).Order().ToArray());
        Assert.Equal(HttpStatusCode.OK, (await coach.Http.GetAsync("/api/v1/training/programs")).StatusCode);
        var clientPrograms = await Get(client.Http, "/api/v1/training/programs");
        Assert.Empty(clientPrograms.GetProperty("items").EnumerateArray());
        foreach (var path in new[] { Root + "/groups", Root + "/clients" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.Http.GetAsync(path)).StatusCode);
        var snapshot = await Get(client.Http, "/api/v1/me/access");
        Assert.False(snapshot.GetProperty("features").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "coaching.groups.manage").GetProperty("available").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await coach.Http.PutAsJsonAsync("/api/v1/me/onboarding", new
        {
            username = "invalid",
            displayName = "Invalid",
            birthDate = "1990-01-01",
            acceptedTerms = true,
            locale = "pl",
            timeZone = "Europe/Warsaw",
            role = "Admin"
        })).StatusCode);
        using var accounts = new AccountsDbContext(new DbContextOptionsBuilder<AccountsDbContext>().UseNpgsql(Database).Options);
        Assert.Equal(2, await accounts.Roles.CountAsync(x => x.UserId == coach.Id));
        using var db = Db();
        Assert.False(await db.Relationships.AnyAsync(x => x.CoachId == coach.Id || x.ClientId == coach.Id));
    }

    [CatalogPostgresFact]
    public async Task Lists_and_group_inputs_validate_bounds_and_reject_server_owned_fields()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        foreach (var query in new[] { "page=0", "pageSize=101", "sort=unsafe", "status=999" })
            Assert.Equal(HttpStatusCode.BadRequest, (await coach.Http.GetAsync(Root + "/clients?" + query)).StatusCode);
        foreach (var body in new object[] { new { name = "", description = "", color = "#123456" }, new { name = "Invalid", description = "", color = "red;background:url(x)" }, new { name = "Invalid", description = new string('x', 4001), color = "#123456" }, new { name = "Injected", description = "", color = "#123456", coachId = Guid.NewGuid() } })
            Assert.Equal(HttpStatusCode.BadRequest, (await coach.Http.PostAsJsonAsync(Root + "/groups", body)).StatusCode);
        Assert.Equal(0, (await Get(coach.Http, Root + "/groups")).GetProperty("total").GetInt64());
    }

    [CatalogPostgresFact]
    public async Task Concurrent_activation_is_unique_ordered_and_rejects_self()
    {
        using var factory = new ApiFactory(Database);
        var a = await User(factory, "Coach");
        var b = await User(factory, "Coach");
        Assert.Equal(HttpStatusCode.OK, (await a.Http.PostAsync("/api/v1/me/roles/client", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await b.Http.PostAsync("/api/v1/me/roles/client", null)).StatusCode);
        var ids = await Task.WhenAll(Activate(factory, a.Id, b.Id), Activate(factory, a.Id, b.Id));
        Assert.Equal(ids[0], ids[1]);
        var reverse = await Activate(factory, b.Id, a.Id);
        Assert.NotEqual(ids[0], reverse);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => Activate(factory, a.Id, a.Id))).Status);
        using var db = Db();
        Assert.Equal(1, await db.Relationships.CountAsync(x => x.CoachId == a.Id && x.ClientId == b.Id));
        Assert.False(await db.Relationships.AnyAsync(x => x.CoachId == a.Id && x.ClientId == a.Id));
    }

    [CatalogPostgresFact]
    public async Task Two_coaches_have_private_relationships_and_client_projection_is_minimal()
    {
        using var factory = new ApiFactory(Database);
        var a = await User(factory, "Coach");
        var b = await User(factory, "Coach");
        var c = await User(factory, "Client");
        var outsider = await User(factory, "Coach");
        var ac = await Activate(factory, a.Id, c.Id);
        var bc = await Activate(factory, b.Id, c.Id);
        Assert.Equal(1, (await Get(a.Http, Root + "/clients")).GetProperty("total").GetInt64());
        Assert.Equal(1, (await Get(b.Http, Root + "/clients")).GetProperty("total").GetInt64());
        Assert.Equal(2, (await Get(c.Http, Root + "/my-coaches")).GetProperty("total").GetInt64());
        foreach (var http in new[] { b.Http, outsider.Http })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"{Root}/clients/{ac}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await Mutate(http, HttpMethod.Post, $"{Root}/relationships/{ac}/suspend", 1, new
            {
                internalReason = "stolen"
            })).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Http.GetAsync(Root + "/clients")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Post, $"{Root}/relationships/{ac}/suspend", 1, new
        {
            internalReason = "private reason"
        })).StatusCode);
        var own = await Get(c.Http, $"{Root}/relationships/{ac}");
        Assert.Equal(new[] { "allowedActions", "coach", "id", "status", "teamClientCaseId", "teamId" }, own.EnumerateObject().Select(x => x.Name).Order().ToArray());
        Assert.Equal(JsonValueKind.Null, own.GetProperty("teamId").ValueKind);
        Assert.Equal(JsonValueKind.Null, own.GetProperty("teamClientCaseId").ValueKind);
        Assert.Equal("Suspended", own.GetProperty("status").GetString());
        Assert.Equal(new[] { "displayName", "id", "username" }, own.GetProperty("coach").EnumerateObject().Select(x => x.Name).Order().ToArray());
        Assert.Empty(own.GetProperty("allowedActions").EnumerateArray());
        Assert.DoesNotContain("private reason", own.GetRawText());
        foreach (var foreignId in new[] { bc, Guid.NewGuid() })
            Assert.Equal(HttpStatusCode.Forbidden, (await outsider.Http.GetAsync($"{Root}/relationships/{foreignId}")).StatusCode);
        foreach (var foreignId in new[] { bc, Guid.NewGuid() })
            Assert.Equal(HttpStatusCode.NotFound, (await a.Http.GetAsync($"{Root}/clients/{foreignId}")).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Transitions_check_version_before_idempotence_and_preserve_durable_history()
    {
        using var factory = new ApiFactory(Database);
        var a = await User(factory, "Coach");
        var c = await User(factory, "Client");
        var id = await Activate(factory, a.Id, c.Id);
        var path = $"{Root}/relationships/{id}";
        Assert.Equal((HttpStatusCode)428, (await a.Http.PostAsJsonAsync(path + "/suspend", new
        {
            internalReason = "manual"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Post, path + "/suspend", 1, new
        {
            internalReason = "manual"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Mutate(a.Http, HttpMethod.Post, path + "/suspend", 1)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Post, path + "/suspend", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Mutate(a.Http, HttpMethod.Post, path + "/complete", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Post, path + "/resume", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Mutate(a.Http, HttpMethod.Post, path + "/suspend", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Post, path + "/complete", 3)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Mutate(a.Http, HttpMethod.Post, path + "/resume", 4)).StatusCode);
        using var db = Db();
        var history = await db.StatusChanges.Where(x => x.RelationshipId == id).OrderBy(x => x.Version).ToArrayAsync();
        Assert.Equal(new[] { RelationshipStatus.Suspended, RelationshipStatus.Active, RelationshipStatus.Completed }, history.Select(x => x.NewStatus));
        Assert.All(history, x => { Assert.Equal(a.Id, x.ActorId); Assert.NotEqual(default, x.OccurredAt); });
        Assert.Equal("manual", history[0].InternalReason);
        Assert.Equal(RelationshipStatus.Completed, (await db.Relationships.SingleAsync(x => x.Id == id)).Status);
        var program = await a.Http.PostAsJsonAsync("/api/v1/training/programs", new
        {
            name = "Private library",
            description = "",
            kind = "Program",
            document = new
            {
                schemaVersion = 1,
                blocks = Array.Empty<object>()
            }
        });
        Assert.Equal(HttpStatusCode.OK, program.StatusCode);
        var programId = (await program.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        // Clients can own purchased copies, but private coach plans must remain indistinguishable from missing ones.
        Assert.Equal(HttpStatusCode.NotFound, (await c.Http.GetAsync($"/api/v1/training/programs/{programId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.Http.GetAsync($"/api/v1/training/programs/{Guid.NewGuid()}")).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Groups_are_many_to_many_any_filter_is_distinct_and_membership_audit_is_idempotent()
    {
        using var factory = new ApiFactory(Database);
        var a = await User(factory, "Coach");
        var c = await User(factory, "Client");
        var d = await User(factory, "Client");
        var ac = await Activate(factory, a.Id, c.Id);
        var ad = await Activate(factory, a.Id, d.Id);
        var g1 = await Group(a.Http, "First");
        var unchanged = await Mutate(a.Http, HttpMethod.Patch, $"{Root}/groups/{g1}", 1,
            new
            {
                name = "First",
                description = "private",
                color = "#123456"
            });
        Assert.Equal(HttpStatusCode.OK, unchanged.StatusCode);
        Assert.Equal(1, (await unchanged.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetInt64());
        var g2 = await Group(a.Http, "Second");
        Assert.Equal(HttpStatusCode.OK, (await Member(a.Http, g1, ac, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Member(a.Http, g1, ac, 2)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Member(a.Http, g2, ac, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Member(a.Http, g2, ad, 2)).StatusCode);
        var access = await Get(a.Http, "/api/v1/me/access");
        Assert.Equal(2, access.GetProperty("limits").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "coaching.active-clients").GetProperty("used").GetInt64());
        var list = await Get(a.Http, $"{Root}/clients?groupIds={g1}&groupIds={g2}&pageSize=1");
        Assert.Equal(2, list.GetProperty("total").GetInt64());
        Assert.Single(list.GetProperty("items").EnumerateArray());
        var page2 = await Get(a.Http, $"{Root}/clients?groupIds={g1}&groupIds={g2}&pageSize=1&page=2");
        Assert.NotEqual(list.GetProperty("items")[0].GetProperty("id").GetGuid(), page2.GetProperty("items")[0].GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Http.GetAsync($"{Root}/groups/{g1}/members")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Post, $"{Root}/relationships/{ac}/suspend", 1)).StatusCode);
        Assert.Equal(1, (await Get(a.Http, $"{Root}/groups/{g1}/members?status=Suspended")).GetProperty("total").GetInt64());
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Post, $"{Root}/groups/{g1}/archive", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Member(a.Http, g1, ad, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Post, $"{Root}/groups/{g1}/restore", 3)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Delete, $"{Root}/groups/{g1}/members/{ac}", 4)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Mutate(a.Http, HttpMethod.Delete, $"{Root}/groups/{g1}/members/{ac}", 5)).StatusCode);
        using var db = Db();
        Assert.Equal(2, await db.MembershipChanges.CountAsync(x => x.GroupId == g1));
        Assert.Equal(1, await db.Memberships.CountAsync(x => x.RelationshipId == ac));
        Assert.Equal(RelationshipStatus.Suspended, (await db.Relationships.SingleAsync(x => x.Id == ac)).Status);
    }

    [CatalogPostgresFact]
    public async Task Cross_owner_membership_is_rejected_by_http_and_postgres_foreign_key()
    {
        using var factory = new ApiFactory(Database);
        var a = await User(factory, "Coach");
        var b = await User(factory, "Coach");
        var c = await User(factory, "Client");
        var bc = await Activate(factory, b.Id, c.Id);
        var group = await Group(a.Http, "Private");
        Assert.Equal(HttpStatusCode.NotFound, (await Member(a.Http, group, bc, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Http.GetAsync($"{Root}/groups/{group}")).StatusCode);
        using var db = Db();
        var g = await db.Groups.SingleAsync(x => x.Id == group);
        db.Memberships.Add(new GroupMembership { GroupId = group, RelationshipId = bc, CoachId = a.Id, WorkspaceId = g.WorkspaceId, CreatedAt = DateTimeOffset.UtcNow });
        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, Assert.IsType<PostgresException>(error.InnerException).SqlState);
    }

    [CatalogPostgresFact]
    public async Task Database_rejects_duplicate_pair_and_self_relationship_even_without_activation_service()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        var client = await User(factory, "Client");
        var id = await Activate(factory, coach.Id, client.Id);
        using var read = Db();
        var existing = await read.Relationships.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal(ActivationSource.DevFixture, existing.ActivationSource);
        foreach (var self in new[] { false, true })
        {
            using var write = Db();
            var now = DateTimeOffset.UtcNow;
            write.Relationships.Add(new Relationship { CoachId = coach.Id, ClientId = self ? coach.Id : client.Id, WorkspaceId = existing.WorkspaceId, ActivationSource = ActivationSource.DevFixture, StartedAt = now, CreatedAt = now, UpdatedAt = now });
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => write.SaveChangesAsync());
            Assert.Equal(self ? PostgresErrorCodes.CheckViolation : PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(error.InnerException).SqlState);
        }
    }

    [CatalogPostgresFact]
    public async Task Parallel_group_updates_have_one_winner_and_feature_loss_is_immediate_across_hosts()
    {
        using var factory = new ApiFactory(Database);
        var a = await User(factory, "Coach");
        var group = await Group(a.Http, "Original");
        var results = await Task.WhenAll(Mutate(a.Http, HttpMethod.Patch, $"{Root}/groups/{group}", 1, new
        {
            name = "One",
            description = "private",
            color = "#123456"
        }), Mutate(a.Http, HttpMethod.Patch, $"{Root}/groups/{group}", 1, new
        {
            name = "Two",
            description = "private",
            color = "#123456"
        }));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.PreconditionFailed);
        using var otherHost = new ApiFactory(Database);
        using var second = otherHost.CreateClient();
        second.DefaultRequestHeaders.Authorization = new("Bearer", otherHost.Token(a.Id));
        Assert.Equal(HttpStatusCode.OK, (await second.GetAsync(Root + "/groups")).StatusCode);
        using var db = Access();
        await db.Overrides.Where(x => x.UserId == a.Id && x.Key == "coaching.groups.manage").ExecuteUpdateAsync(set => set.SetProperty(x => x.Granted, false).SetProperty(x => x.Version, x => x.Version + 1));
        foreach (var http in new[] { a.Http, second })
            Assert.Equal(HttpStatusCode.Forbidden, (await http.GetAsync(Root + "/groups")).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Switching_identity_is_isolated_and_openapi_has_no_activation_route()
    {
        using var factory = new ApiFactory(Database);
        var a = await User(factory, "Coach");
        var b = await User(factory, "Coach");
        var c = await User(factory, "Client");
        await Activate(factory, a.Id, c.Id);
        Assert.Equal(1, (await Get(a.Http, Root + "/clients")).GetProperty("total").GetInt64());
        a.Http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(b.Id));
        Assert.Equal(0, (await Get(a.Http, Root + "/clients")).GetProperty("total").GetInt64());
        a.Http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(a.Id));
        Assert.Equal(1, (await Get(a.Http, Root + "/clients")).GetProperty("total").GetInt64());
        var paths = (await Get(a.Http, "/openapi/v1.json")).GetProperty("paths");
        Assert.Equal(2, paths.GetProperty(Root + "/relationships/{id}").GetProperty("get").GetProperty("responses").GetProperty("200").GetProperty("content").GetProperty("application/json").GetProperty("schema").GetProperty("oneOf").GetArrayLength());
        Assert.DoesNotContain(paths.EnumerateObject(), x => x.Name.StartsWith(Root) && (x.Name.Contains("activate") || x.Name.Contains("fixture")));
        Assert.False(paths.TryGetProperty(Root + "/relationships", out var create) && create.TryGetProperty("post", out _));
    }

    private static async Task<(Guid Id, HttpClient Http)> User(ApiFactory factory, string role)
    {
        var id = Guid.NewGuid();
        var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
        var response = await http.PutAsJsonAsync("/api/v1/me/onboarding", new
        {
            username = $"c{id:N}"[..30],
            displayName = "Test " + role,
            birthDate = "1990-01-01",
            acceptedTerms = true,
            locale = "pl",
            timeZone = "Europe/Warsaw",
            role
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var db = Access();
        foreach (var key in factory.Services.GetRequiredService<FeatureCatalog>().Definitions.Keys)
            db.Overrides.Add(new FeatureOverride { UserId = id, Key = key, Granted = true });
        await db.SaveChangesAsync();
        return (id, http);
    }
    private static async Task<Guid> Activate(ApiFactory factory, Guid coach, Guid client)
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IRelationshipActivation>().ActivateDevFixtureAsync(coach, client, default);
    }
    private static async Task<JsonElement> Get(HttpClient http, string path)
    {
        var result = await http.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        return await result.Content.ReadFromJsonAsync<JsonElement>();
    }
    private static async Task<Guid> Group(HttpClient http, string name)
    {
        var result = await http.PostAsJsonAsync(Root + "/groups", new
        {
            name,
            description = "private",
            color = "#123456"
        });
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        return (await result.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }
    private static Task<HttpResponseMessage> Member(HttpClient http, Guid group, Guid relation, long version) => Mutate(http, HttpMethod.Put, $"{Root}/groups/{group}/members/{relation}", version);
    private static async Task<HttpResponseMessage> Mutate(HttpClient http, HttpMethod method, string path, long version, object? body = null)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body ?? new { internalReason = (string?)null }) };
        request.Headers.TryAddWithoutValidation("If-Match", $"\"{version}\"");
        return await http.SendAsync(request);
    }
    private sealed class PolicyAccount(Guid user, AccountRole role) : IAccountContext
    {
        public Guid UserId => user;
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<AccountRole>>([role]);
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) => throw new NotSupportedException();
        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) => throw new NotSupportedException();
        public Task RequireAdminAsync(string permission, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class PolicyFeatures(bool granted) : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => throw new NotSupportedException();
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => Task.FromResult(new AccessSnapshot("test", new[] { "coaching.clients.view", "coaching.clients.manage", "coaching.relationships.read-own" }.Select(x => new FeatureDecision(x, granted, "test")).ToArray(), []));
    }
}
