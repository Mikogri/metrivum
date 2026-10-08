using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Access.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.ClientDocumentation.Contracts;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Coaching.Infrastructure;
using TrainFlow.Media;
using TrainFlow.Media.Contracts;

namespace TrainFlow.IntegrationTests;

public sealed class DocumentationHttpTests
{
    [CatalogPostgresFact]
    public async Task Http_document_files_recheck_participant_visibility_feature_and_relationship_before_signing()
    {
        var features = new DocumentationFeatures();
        var storage = new DocumentStorage();
        using var original = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var factory = original.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.AddSingleton<IFeatureAccessService>(features);
            services.AddSingleton<IPrivateObjectStorage>(storage);
        }));
        async Task<(Guid Id, HttpClient Http)> User(string role)
        {
            var id = Guid.NewGuid();
            var http = factory.CreateClient();
            http.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(id));
            Assert.Equal(HttpStatusCode.OK, (await http.PutAsJsonAsync("/api/v1/me/onboarding", new
            {
                username = "doc" + id.ToString("N")[..20],
                displayName = "Documentation audit",
                birthDate = "1990-01-01",
                acceptedTerms = true,
                locale = "en",
                timeZone = "UTC",
                role
            })).StatusCode);
            return (id, http);
        }
        var owner = await User("Coach");
        var participant = await User("Client");
        var stranger = await User("Coach");
        using var coach = owner.Http;
        using var client = participant.Http;
        using var outsider = stranger.Http;
        Guid relationship;
        using (var scope = factory.Services.CreateScope())
            relationship = await scope.ServiceProvider.GetRequiredService<IRelationshipActivation>().ActivateDevFixtureAsync(owner.Id, participant.Id, default);
        var path = $"/api/v1/coaching/relationships/{relationship}/documentation";
        var uploadInput = new DocumentationUploadInput("private.txt", "text/plain", storage.Bytes.Length);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PostAsJsonAsync(path + "/uploads", uploadInput)).StatusCode);
        Assert.Equal(0, storage.UploadUrls);
        var ticketResponse = await coach.PostAsJsonAsync(path + "/uploads", uploadInput);
        Assert.Equal(HttpStatusCode.OK, ticketResponse.StatusCode);
        var ticket = (await ticketResponse.Content.ReadFromJsonAsync<DocumentUpload>())!;
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync(path + $"/uploads/{ticket.MediaId}/finalize", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await coach.PostAsync(path + $"/uploads/{ticket.MediaId}/finalize", null)).StatusCode);
        var response = await coach.PostAsJsonAsync(path + "/documents", new DocumentInput("Private", null, "General", "CoachPrivate", null, ticket.MediaId, DateTimeOffset.UtcNow.AddHours(-1)));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var document = (await response.Content.ReadFromJsonAsync<DocumentDto>())!;
        var readPath = path + $"/documents/{document.Id}/read-url";
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync(readPath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PostAsync(readPath, null)).StatusCode);
        Assert.Equal(0, storage.ReadUrls);
        async Task<HttpResponseMessage> Share(HttpClient actor, string visibility, long version)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, path + $"/documents/{document.Id}/share") { Content = JsonContent.Create(new VisibilityInput(visibility)) };
            request.Headers.TryAddWithoutValidation("If-Match", $"\"{version}\"");
            return await actor.SendAsync(request);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await Share(client, "SharedWithClient", 1)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Share(coach, "SharedWithClient", 1)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync(readPath, null)).StatusCode);
        Assert.Equal(1, storage.ReadUrls);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Share(coach, "CoachPrivate", 1)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Share(coach, "CoachPrivate", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync(readPath, null)).StatusCode);
        Assert.Equal(1, storage.ReadUrls);
        Assert.Equal(HttpStatusCode.OK, (await Share(coach, "SharedWithClient", 3)).StatusCode);
        features.DocumentationAllowed = false;
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(readPath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.PostAsJsonAsync(path + "/uploads", uploadInput)).StatusCode);
        features.DocumentationAllowed = true;
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<CoachingDbContext>().Relationships.Where(x => x.Id == relationship).ExecuteUpdateAsync(update => update.SetProperty(x => x.Status, RelationshipStatus.Suspended));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(readPath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path + "/uploads", uploadInput)).StatusCode);
        Assert.Equal(1, storage.ReadUrls);
        Assert.Equal(1, storage.UploadUrls);
    }

    [Theory]
    [InlineData(null, 428)]
    [InlineData("1", 400)]
    [InlineData("W/\"1\"", 400)]
    [InlineData("\"0\"", 400)]
    [InlineData("\"-1\"", 400)]
    [InlineData("\"+1\"", 400)]
    [InlineData("\" 1\"", 400)]
    [InlineData("\"1\",\"2\"", 400)]
    public async Task Note_edits_require_one_positive_strong_numeric_etag(string? header, int expected)
    {
        using var factory = new ApiFactory();
        using var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid()));
        using var request = new HttpRequestMessage(HttpMethod.Patch, $"/api/v1/coaching/relationships/{Guid.NewGuid()}/documentation/notes/{Guid.NewGuid()}") { Content = JsonContent.Create(new { text = "Private note" }) };
        if (header != null)
            request.Headers.TryAddWithoutValidation("If-Match", header);
        Assert.Equal((HttpStatusCode)expected, (await http.SendAsync(request)).StatusCode);
    }

    private sealed class DocumentationFeatures : IFeatureAccessService
    {
        public bool DocumentationAllowed { get; set; } = true;
        public Task RequireAsync(string key, CancellationToken ct) => !DocumentationAllowed && key.StartsWith("coaching.documentation.", StringComparison.Ordinal)
            ? Task.FromException(new ApiException(403, "FEATURE_UNAVAILABLE", "Documentation access revoked.")) : Task.CompletedTask;
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => Task.FromResult(new AccessSnapshot("test", new[] { "coaching.clients.manage", "coaching.clients.view", "coaching.relationships.read-own" }.Select(x => new FeatureDecision(x, true, "ALLOWED")).ToArray(), []));
    }
    private sealed class DocumentStorage : IPrivateObjectStorage
    {
        public byte[] Bytes { get; } = System.Text.Encoding.UTF8.GetBytes("Private document contents");
        public int ReadUrls
        {
            get; private set;
        }
        public int UploadUrls
        {
            get; private set;
        }
        public Task<string> CreateUploadUrlAsync(string bucket, string key, CancellationToken ct)
        {
            UploadUrls++;
            return Task.FromResult("https://private.invalid/signed-upload");
        }
        public Task<string> CreateReadUrlAsync(string bucket, string key, CancellationToken ct)
        {
            ReadUrls++;
            return Task.FromResult("https://private.invalid/signed-read");
        }
        public Task<StoredObject> InspectAsync(string bucket, string key, CancellationToken ct) => Task.FromResult(new StoredObject(Bytes.Length, "text/plain", Bytes));
        public Task<Stream> OpenReadAsync(string bucket, string key, CancellationToken ct) => Task.FromResult<Stream>(new MemoryStream(Bytes));
        public Task DeleteAsync(string bucket, string key, CancellationToken ct) => Task.CompletedTask;
    }
}
