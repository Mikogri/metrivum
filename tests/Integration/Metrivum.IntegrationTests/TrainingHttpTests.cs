using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Metrivum.IntegrationTests;

public sealed class TrainingHttpTests
{
    [TrainingPostgresFact]
    public async Task Endpoints_enforce_ownership_etags_and_revision_exports()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var owner = await Coach(factory);
        using var other = await Coach(factory);
        await TestPlans.ActivateProAsync(owner);
        await TestPlans.ActivateProAsync(other);
        var create = await owner.PostAsJsonAsync(
            "/api/v1/training/programs",
            new
            {
                name = "Zażółć gęślą jaźń",
                description = "Private",
                kind = "Program",
                folderId = (Guid?)null,
                document = new
                {
                    schemaVersion = 1,
                    // One empty workout: a plan needs at least one before its changes can be applied.
                    blocks = new object[]
                    {
                        new
                        {
                            id = Guid.NewGuid(),
                            name = "Block",
                            description = "",
                            cycles = new object[]
                            {
                                new
                                {
                                    id = Guid.NewGuid(),
                                    name = "Cycle",
                                    description = "",
                                    dayCount = 7,
                                    days = new object[]
                                    {
                                        new
                                        {
                                            id = Guid.NewGuid(),
                                            dayNumber = 1,
                                            workouts = new object[]
                                            {
                                                new
                                                {
                                                    id = Guid.NewGuid(),
                                                    name = "Workout",
                                                    description = "",
                                                    exercises = Array.Empty<object>(),
                                                    groups = Array.Empty<object>(),
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }
        );
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        Assert.Equal("\"1\"", create.Headers.ETag?.Tag);
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id")
            .GetGuid();
        var body = new
        {
            name = "Updated",
            description = "",
            folderId = (Guid?)null,
            document = new { schemaVersion = 1, blocks = Array.Empty<object>() },
        };
        Assert.Equal(
            (HttpStatusCode)428,
            (await owner.PutAsJsonAsync($"/api/v1/training/programs/{id}/draft", body)).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await other.GetAsync($"/api/v1/training/programs/{id}")).StatusCode
        );
        using var foreignSave = new HttpRequestMessage(
            HttpMethod.Put,
            $"/api/v1/training/programs/{id}/draft"
        )
        {
            Content = JsonContent.Create(body),
        };
        foreignSave.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(foreignSave)).StatusCode);
        using var publish = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/training/programs/{id}/revisions"
        );
        publish.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        publish.Headers.Add("Idempotency-Key", "snapshot");
        Assert.Equal(HttpStatusCode.OK, (await owner.SendAsync(publish)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await other.GetAsync(
                    $"/api/v1/training/programs/{id}/revisions/1/export?format=csv"
                )
            ).StatusCode
        );
        var pdf = await owner.GetAsync(
            $"/api/v1/training/programs/{id}/revisions/1/export?format=pdf"
        );
        Assert.Equal(HttpStatusCode.OK, pdf.StatusCode);
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
        Assert.True(pdf.Headers.CacheControl?.NoStore);
        Assert.StartsWith(
            "%PDF-",
            System.Text.Encoding.ASCII.GetString(await pdf.Content.ReadAsByteArrayAsync())
        );
        using var update = new HttpRequestMessage(
            HttpMethod.Put,
            $"/api/v1/training/programs/{id}/draft"
        )
        {
            Content = JsonContent.Create(body),
        };
        update.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        Assert.Equal(HttpStatusCode.OK, (await owner.SendAsync(update)).StatusCode);
        using var stale = new HttpRequestMessage(
            HttpMethod.Put,
            $"/api/v1/training/programs/{id}/draft"
        )
        {
            Content = JsonContent.Create(body),
        };
        stale.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        var conflict = await owner.SendAsync(stale);
        Assert.Equal(HttpStatusCode.PreconditionFailed, conflict.StatusCode);
        Assert.Equal(
            "VERSION_CONFLICT",
            (await conflict.Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("code")
                .GetString()
        );
    }

    [TrainingPostgresFact]
    public async Task Lists_have_optional_defaults_and_requests_reject_owner_injection_and_null_text()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var coach = await Coach(factory);
        var list = await coach.GetAsync("/api/v1/training/programs");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Equal(
            25,
            (await list.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("pageSize").GetInt32()
        );
        var payload = new
        {
            name = "Injected",
            description = "",
            kind = "Program",
            document = new { schemaVersion = 1, blocks = Array.Empty<object>() },
            ownerId = Guid.NewGuid(),
        };
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await coach.PostAsJsonAsync("/api/v1/training/programs", payload)).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (
                await coach.PostAsJsonAsync(
                    "/api/v1/training/programs",
                    new
                    {
                        name = "Null",
                        description = (string?)null,
                        kind = "Program",
                        document = new { schemaVersion = 1, blocks = Array.Empty<object>() },
                    }
                )
            ).StatusCode
        );
    }

    [TrainingPostgresFact]
    public async Task Delete_requires_owner_and_current_etag_and_removes_only_unused_documents()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var owner = await Coach(factory);
        using var other = await Coach(factory);
        await TestPlans.ActivateProAsync(owner);
        await TestPlans.ActivateProAsync(other);
        var created = await owner.PostAsJsonAsync(
            "/api/v1/training/programs",
            new
            {
                name = "Unused",
                description = "",
                kind = "Program",
                document = new { schemaVersion = 1, blocks = Array.Empty<object>() },
            }
        );
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id")
            .GetGuid();
        Assert.Equal(
            (HttpStatusCode)428,
            (await owner.DeleteAsync($"/api/v1/training/programs/{id}")).StatusCode
        );
        async Task<HttpResponseMessage> Delete(HttpClient client, int version)
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Delete,
                $"/api/v1/training/programs/{id}"
            );
            request.Headers.TryAddWithoutValidation("If-Match", $"\"{version}\"");
            return await client.SendAsync(request);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await Delete(other, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Delete(owner, 2)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Delete(owner, 1)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await owner.GetAsync($"/api/v1/training/programs/{id}")).StatusCode
        );
        Assert.Equal(HttpStatusCode.NotFound, (await Delete(owner, 1)).StatusCode);
    }

    private static async Task<HttpClient> Coach(ApiFactory factory)
    {
        var user = Guid.NewGuid();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(user));
        var onboard = await client.PutAsJsonAsync(
            "/api/v1/me/onboarding",
            new
            {
                username = $"t{user:N}"[..30],
                displayName = "Coach",
                birthDate = "1990-01-01",
                acceptedTerms = true,
                locale = "pl",
                timeZone = "Europe/Warsaw",
            }
        );
        Assert.Equal(HttpStatusCode.OK, onboard.StatusCode);
        return client;
    }
}
