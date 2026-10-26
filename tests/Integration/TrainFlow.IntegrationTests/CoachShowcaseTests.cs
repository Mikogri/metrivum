using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TrainFlow.IntegrationTests;

public sealed class CoachShowcaseTests
{
    [CatalogPostgresFact]
    public async Task Coach_edits_the_showcase_and_anyone_signed_in_reads_it()
    {
        var database = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        using var factory = new ApiFactory(database);
        using var coach = factory.CreateClient();
        using var viewer = factory.CreateClient();
        var coachId = Guid.NewGuid();
        var viewerId = Guid.NewGuid();
        coach.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(coachId));
        viewer.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(viewerId));
        (await coach.PutAsJsonAsync("/api/v1/me/onboarding", new { username = "s" + coachId.ToString("N")[..20], displayName = "Coach", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role = "Coach" })).EnsureSuccessStatusCode();
        (await viewer.PutAsJsonAsync("/api/v1/me/onboarding", new { username = "v" + viewerId.ToString("N")[..20], displayName = "Viewer", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role = "Client" })).EnsureSuccessStatusCode();

        // Empty before the first save.
        var empty = await viewer.GetFromJsonAsync<JsonElement>($"/api/v1/coaches/{coachId}/showcase");
        Assert.Equal(0, empty.GetProperty("version").GetInt64());
        Assert.Equal(0, empty.GetProperty("activeClients").GetInt32());
        Assert.Empty(empty.GetProperty("portfolio").EnumerateArray());

        var saved = await coach.PutAsJsonAsync("/api/v1/me/coach-showcase", new { headline = "  Strength and running  ", yearsExperience = 8, competencies = new[] { "Powerlifting", " powerlifting ", "Marathon", "" }, version = 0 });
        Assert.True(saved.IsSuccessStatusCode, await saved.Content.ReadAsStringAsync());

        var read = await viewer.GetFromJsonAsync<JsonElement>($"/api/v1/coaches/{coachId}/showcase");
        Assert.Equal("Strength and running", read.GetProperty("headline").GetString());
        Assert.Equal(8, read.GetProperty("yearsExperience").GetInt32());
        Assert.Equal(["Powerlifting", "Marathon"], read.GetProperty("competencies").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(1, read.GetProperty("version").GetInt64());

        // A stale version is refused; bad values are rejected; clients cannot edit; non-coaches have no showcase.
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await coach.PutAsJsonAsync("/api/v1/me/coach-showcase", new { headline = "x", version = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await coach.PutAsJsonAsync("/api/v1/me/coach-showcase", new { yearsExperience = 120, version = 1 })).StatusCode);
        Assert.False((await viewer.PutAsJsonAsync("/api/v1/me/coach-showcase", new { headline = "x", version = 0 })).IsSuccessStatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await coach.GetAsync($"/api/v1/coaches/{viewerId}/showcase")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.PostAsync($"/api/v1/coaches/{coachId}/showcase/portfolio/{Guid.NewGuid()}/read-url", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await coach.PostAsJsonAsync("/api/v1/me/coach-showcase/portfolio/uploads", new { name = "clip.mp4", contentType = "video/mp4", size = 100 })).StatusCode);

        // Anyone can pick an animated cover; others see it on the public profile, and null restores the default.
        var style = await coach.PutAsJsonAsync("/api/v1/me/cover-style", new { style = new { background = "Threads", props = new { amplitude = 1.5, color = "#ffffff" } } });
        Assert.True(style.IsSuccessStatusCode, await style.Content.ReadAsStringAsync());
        var person = await viewer.GetFromJsonAsync<JsonElement>($"/api/v1/accounts/people/s{coachId.ToString("N")[..20]}");
        Assert.Equal("Threads", person.GetProperty("coverStyle").GetProperty("background").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await coach.PutAsJsonAsync("/api/v1/me/cover-style", new { style = new { background = "Silk", props = new { imageSrc = "https://example.com/x.png" } } })).StatusCode);
        (await coach.PutAsJsonAsync("/api/v1/me/cover-style", new { style = (object?)null })).EnsureSuccessStatusCode();
        Assert.Equal(JsonValueKind.Null, (await viewer.GetFromJsonAsync<JsonElement>($"/api/v1/accounts/people/s{coachId.ToString("N")[..20]}")).GetProperty("coverStyle").ValueKind);

        // A custom cover needs Pro; without it there is no cover to read.
        Assert.False(read.GetProperty("hasCover").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.PostAsJsonAsync("/api/v1/me/coach-showcase/cover/uploads", new { name = "cover.jpg", contentType = "image/jpeg", size = 1000 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.PutAsJsonAsync("/api/v1/me/coach-showcase/cover", new { mediaId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.PostAsync($"/api/v1/coaches/{coachId}/showcase/cover/read-url", null)).StatusCode);
    }
}
