using System.Text.Json;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Accounts.Domain;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.BuildingBlocks;
using TrainFlow.Forms.Contracts;
using TrainFlow.Forms.Features;
using TrainFlow.Forms.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class FormsTests
{
    [CatalogPostgresFact]
    public async Task Http_routes_enforce_identity_role_strong_etags_and_profile_privacy()
    {
        using var original = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var factory = original.WithWebHostBuilder(builder => builder.ConfigureServices(services => services.AddScoped<IFeatureAccessService>(_ => new Features(true))));
        async Task<HttpClient> User(string role)
        {
            var id = Guid.NewGuid();
            var http = factory.CreateClient();
            http.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(id));
            Assert.Equal(HttpStatusCode.OK, (await http.PutAsJsonAsync("/api/v1/me/onboarding", new
            {
                username = "f" + id.ToString("N")[..20],
                displayName = "Forms HTTP",
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
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync("/api/v1/forms?purpose=Application")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/forms", Request())).StatusCode);
        var created = await owner.PostAsJsonAsync("/api/v1/forms", Request());
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        Assert.Equal("\"1\"", created.Headers.ETag?.Tag);
        var form = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/v1/forms/{form}")).StatusCode);
        Assert.Equal((HttpStatusCode)428, (await owner.PostAsync($"/api/v1/forms/{form}/publish", null)).StatusCode);
        using var weak = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/forms/{form}/publish");
        weak.Headers.TryAddWithoutValidation("If-Match", "W/\"1\"");
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(weak)).StatusCode);
        using var publish = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/forms/{form}/publish");
        publish.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        var published = await owner.SendAsync(publish);
        Assert.Equal(HttpStatusCode.OK, published.StatusCode);
        var version = (await published.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("currentPublishedVersionId").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/v1/forms/versions/{version}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/forms/versions/{version}")).StatusCode);
        var fields = await client.GetAsync("/api/v1/me/profile-fields");
        Assert.Equal("EUR", (await fields.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("currency").GetString());
        using var save = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/me/profile-fields") { Content = JsonContent.Create(new { values = new { Weight = 80, InjuriesLimitationsPainNotes = "Private notes" } }) };
        save.Headers.TryAddWithoutValidation("If-Match", fields.Headers.ETag!.Tag);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(save)).StatusCode);
        Assert.Equal(JsonValueKind.Object, (await (await owner.GetAsync("/api/v1/me/profile-fields")).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("values").ValueKind);
        Assert.Empty((await (await owner.GetAsync("/api/v1/me/profile-fields")).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("values").EnumerateObject());
        using var invalid = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/me/profile-fields") { Content = JsonContent.Create(new { values = new { Email = "forbidden@example.test" } }) };
        invalid.Headers.TryAddWithoutValidation("If-Match", "\"3\"");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(invalid)).StatusCode);
    }
    private static FormTemplateRequest Request(string name = "Intake") => new(FormPurpose.Application, name, "Private intake", new([new("main", "Main", 0, [new("weight", "Weight", QuestionType.Number, true, Min: 1, Max: 600, SystemField: SystemFieldKey.Weight)])]));
    private static Dictionary<string, JsonElement> Answers(decimal weight = 80) => new() { ["weight"] = JsonSerializer.SerializeToElement(weight) };
    private static ServiceProvider Provider(Guid user, bool features = true)
    {
        var services = new ServiceCollection();
        services.AddSingleton(NpgsqlDataSource.Create(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!));
        services.AddModuleDatabase<FormsDbContext>("forms");
        services.AddModuleDatabase<AccountsDbContext>("accounts");
        services.AddSingleton<IAccountContext>(new Account(user));
        services.AddSingleton<IFeatureAccessService>(new Features(features));
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<FormsService>();
        services.AddScoped<IAccountProfileFields, AccountProfileFieldsService>();
        services.AddScoped<IAccountDirectory, AccountDirectory>();
        return services.BuildServiceProvider();
    }
    [CatalogPostgresFact]
    public async Task Publishing_keeps_versions_immutable_and_retries_only_the_same_unchanged_draft()
    {
        await using var provider = Provider(Guid.NewGuid());
        await using var scope = provider.CreateAsyncScope();
        var forms = scope.ServiceProvider.GetRequiredService<FormsService>();
        var draft = await forms.CreateAsync(Request(), default);
        var published = await forms.PublishAsync(draft.Id, draft.Version, default);
        var retry = await forms.PublishAsync(draft.Id, draft.Version, default);
        Assert.Equal(published.CurrentPublishedVersionId, retry.CurrentPublishedVersionId);
        Assert.Equal(published.Version, retry.Version);
        var version = await forms.GetVersionAsync(published.CurrentPublishedVersionId!.Value, default);
        var edited = await forms.UpdateAsync(draft.Id, Request("Changed"), published.Version, default);
        Assert.Equal("Intake", (await forms.GetVersionAsync(version.Id, default)).Name);
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => forms.PublishAsync(draft.Id, draft.Version, default))).Status);
        var second = await forms.PublishAsync(draft.Id, edited.Version, default);
        Assert.NotEqual(version.Id, second.CurrentPublishedVersionId);
        var db = scope.ServiceProvider.GetRequiredService<FormsDbContext>();
        Assert.Equal(2, await db.Versions.CountAsync(x => x.TemplateId == draft.Id));
        await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE forms.versions SET \"Name\"='tampered' WHERE \"Id\"={version.Id}"));
    }
    [CatalogPostgresFact]
    public async Task Ownership_feature_and_list_bounds_are_enforced_and_duplicate_archive_are_retry_safe()
    {
        var owner = Guid.NewGuid();
        await using var provider = Provider(owner);
        await using var scope = provider.CreateAsyncScope();
        var forms = scope.ServiceProvider.GetRequiredService<FormsService>();
        var draft = await forms.CreateAsync(Request(), default);
        await using var stranger = Provider(Guid.NewGuid());
        await using var strangerScope = stranger.CreateAsyncScope();
        var other = strangerScope.ServiceProvider.GetRequiredService<FormsService>();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => other.DetailAsync(draft.Id, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => other.UpdateAsync(draft.Id, Request("Stolen"), draft.Version, default))).Status);
        await using var denied = Provider(owner, false);
        await using var deniedScope = denied.CreateAsyncScope();
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => deniedScope.ServiceProvider.GetRequiredService<FormsService>().DetailAsync(draft.Id, default))).Status);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => forms.ListAsync(1, 101, FormPurpose.Application, false, null, "updated", default))).Status);
        var copy = await forms.DuplicateAsync(draft.Id, "duplicate-1", draft.Version, default);
        Assert.Equal(copy.Id, (await forms.DuplicateAsync(draft.Id, "duplicate-1", draft.Version, default)).Id);
        Assert.Null(copy.CurrentPublishedVersionId);
        var archived = await forms.ArchiveAsync(draft.Id, true, draft.Version, default);
        Assert.Equal(archived.Version, (await forms.ArchiveAsync(draft.Id, true, draft.Version, default)).Version);
        Assert.DoesNotContain((await forms.ListAsync(1, 100, FormPurpose.Application, false, null, "updated", default)).Items, x => x.Id == draft.Id);
        Assert.Equal(412, (await Assert.ThrowsAsync<ApiException>(() => forms.ArchiveAsync(draft.Id, false, draft.Version, default))).Status);
    }
    [CatalogPostgresFact]
    public async Task Concurrent_publication_and_submission_create_one_immutable_result()
    {
        var owner = Guid.NewGuid();
        await using var provider = Provider(owner);
        Guid id;
        await using (var scope = provider.CreateAsyncScope())
            id = (await scope.ServiceProvider.GetRequiredService<FormsService>().CreateAsync(Request(), default)).Id;
        async Task<FormTemplateDto> Publish()
        {
            await using var scope = provider.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<FormsService>().PublishAsync(id, 1, default);
        }
        var publications = await Task.WhenAll(Publish(), Publish());
        Assert.Equal(publications[0].CurrentPublishedVersionId, publications[1].CurrentPublishedVersionId);
        var source = "application:" + Guid.NewGuid();
        var user = Guid.NewGuid();
        async Task<FormSubmissionDto> Submit()
        {
            await using var scope = provider.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<FormsService>().SubmitAsync(new(publications[0].CurrentPublishedVersionId!.Value, user, source, Answers()), default);
        }
        var submissions = await Task.WhenAll(Submit(), Submit());
        Assert.Equal(submissions[0].Id, submissions[1].Id);
        await using var verify = provider.CreateAsyncScope();
        var forms = verify.ServiceProvider.GetRequiredService<FormsService>();
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => forms.SubmitAsync(new(publications[0].CurrentPublishedVersionId!.Value, user, source, Answers(90)), default))).Status);
        var db = verify.ServiceProvider.GetRequiredService<FormsDbContext>();
        Assert.Equal(1, await db.Submissions.CountAsync(x => x.SourceKey == source));
        await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM forms.submissions WHERE \"Id\"={submissions[0].Id}"));
        var exponentSource = "numeric:" + Guid.NewGuid();
        var exponent = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>("{\"weight\":8e1}")!;
        var first = await forms.SubmitAsync(new(publications[0].CurrentPublishedVersionId!.Value, user, exponentSource, exponent), default);
        Assert.Equal(first.Id, (await forms.SubmitAsync(new(first.FormVersionId, user, exponentSource, exponent), default)).Id);
        Assert.Equal(first.Id, (await forms.SubmitAsync(new(first.FormVersionId, user, exponentSource, Answers()), default)).Id);
    }
    [CatalogPostgresFact]
    public async Task Submission_validates_issued_version_even_after_draft_changes_and_archive()
    {
        await using var provider = Provider(Guid.NewGuid());
        await using var scope = provider.CreateAsyncScope();
        var forms = scope.ServiceProvider.GetRequiredService<FormsService>();
        var draft = await forms.CreateAsync(Request(), default);
        var published = await forms.PublishAsync(draft.Id, draft.Version, default);
        var changed = await forms.UpdateAsync(draft.Id, Request("Edited") with
        {
            Draft = new([new("other", "Other", 0, [new("notes", "Notes", QuestionType.LongText, true)])])
        }, published.Version, default);
        await forms.ArchiveAsync(draft.Id, true, changed.Version, default);
        await Assert.ThrowsAsync<ApiException>(() => forms.GetCurrentVersionAsync(draft.Id, default));
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => forms.RequireUsableVersionAsync(published.CurrentPublishedVersionId!.Value, published.CoachId, FormPurpose.Application, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => forms.RequireUsableVersionAsync(published.CurrentPublishedVersionId!.Value, Guid.NewGuid(), FormPurpose.Application, default))).Status);
        var submission = await forms.SubmitAsync(new(published.CurrentPublishedVersionId!.Value, Guid.NewGuid(), "issued:" + Guid.NewGuid(), Answers()), default);
        Assert.Equal(80, submission.Answers["weight"].GetDecimal());
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => forms.SubmitAsync(new(published.CurrentPublishedVersionId!.Value, submission.RespondentId, "bad:" + Guid.NewGuid(), new Dictionary<string, JsonElement> { ["notes"] = JsonSerializer.SerializeToElement("wrong version") }), default))).Status);
    }
    [CatalogPostgresFact]
    public async Task Outer_transaction_rolls_back_forms_submission_and_profile_update_together()
    {
        var user = Guid.NewGuid();
        await using var provider = Provider(user);
        Guid version;
        await using (var seed = provider.CreateAsyncScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<AccountsDbContext>();
            db.Profiles.Add(new Profile { Id = user, DisplayName = "Forms Test", Username = "f" + user.ToString("N")[..20], NormalizedUsername = "F" + user.ToString("N")[..20].ToUpperInvariant(), Onboarded = true });
            db.Workspaces.Add(new Workspace { Id = Guid.NewGuid(), OwnerId = user });
            await db.SaveChangesAsync();
            var f = seed.ServiceProvider.GetRequiredService<FormsService>();
            var draft = await f.CreateAsync(Request(), default);
            version = (await f.PublishAsync(draft.Id, draft.Version, default)).CurrentPublishedVersionId!.Value;
        }
        var source = "atomic:" + Guid.NewGuid();
        await using (var action = provider.CreateAsyncScope())
        {
            var services = action.ServiceProvider;
            var forms = services.GetRequiredService<FormsService>();
            var profiles = services.GetRequiredService<IAccountProfileFields>();
            await Assert.ThrowsAsync<InvalidOperationException>(() => services.GetRequiredService<ModuleTransaction>().RunAsync(async ct =>
            {
                await forms.SubmitAsync(new(version, user, source, Answers()), ct);
                await profiles.UpdateOwnAsync(new Dictionary<SystemFieldKey, JsonElement> { [SystemFieldKey.Weight] = JsonSerializer.SerializeToElement(80) }, 1, ct);
                throw new InvalidOperationException("Force rollback after both module writes.");
            }, default));
        }
        await using var verify = provider.CreateAsyncScope();
        Assert.False(await verify.ServiceProvider.GetRequiredService<FormsDbContext>().Submissions.AnyAsync(x => x.SourceKey == source));
        var profile = await verify.ServiceProvider.GetRequiredService<IAccountProfileFields>().GetOwnAsync(default);
        Assert.Empty(profile.Values);
        Assert.Equal(1, profile.Version);
        Assert.Equal("EUR", profile.Currency);
        var directory = verify.ServiceProvider.GetRequiredService<IAccountDirectory>();
        var dbProfile = await verify.ServiceProvider.GetRequiredService<AccountsDbContext>().Profiles.AsNoTracking().SingleAsync(x => x.Id == user);
        Assert.Equal(user, (await directory.ResolveExactUsernameAsync(dbProfile.Username!.ToLowerInvariant(), default))!.UserId);
        Assert.Null(await directory.ResolveExactUsernameAsync(dbProfile.Username[..3], default));
    }
    private sealed class Account(Guid user) : IAccountContext
    {
        public Guid UserId => user;
        public Task<AccountIdentity> RequireClientAsync(CancellationToken cancellationToken) => Task.FromResult(new AccountIdentity(user, user));
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken cancellationToken) => Task.FromResult(new AccountIdentity(user, user));
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<AccountRole>>([AccountRole.Coach, AccountRole.Client]);
        public Task RequireAdminAsync(string permission, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
    private sealed class Features(bool available) : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken cancellationToken) => available ? Task.CompletedTask : Task.FromException(new ApiException(403, "FEATURE_UNAVAILABLE", "Feature revoked."));
        public Task<AccessSnapshot> GetAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
