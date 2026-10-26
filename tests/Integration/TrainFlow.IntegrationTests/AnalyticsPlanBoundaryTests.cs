using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TrainFlow.IntegrationTests;

public sealed class AnalyticsPlanBoundaryTests
{
    [CatalogPostgresFact]
    public async Task Free_coach_gets_basic_analysis_and_cannot_read_advanced_routes_directly()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!);
        using var coach = factory.CreateClient();
        var id = Guid.NewGuid();
        coach.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
        (await coach.PutAsJsonAsync("/api/v1/me/onboarding", new { username = "ab" + id.ToString("N")[..20], displayName = "Basic analysis", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role = "Coach" })).EnsureSuccessStatusCode();
        var basicResponse = await coach.GetAsync("/api/v1/analyze/basic");
        basicResponse.EnsureSuccessStatusCode();
        var json = await basicResponse.Content.ReadAsStringAsync();
        var basic = JsonSerializer.Deserialize<JsonElement>(json);
        Assert.Equal(0, basic.GetProperty("clients").GetProperty("active").GetInt32());
        Assert.False(basic.TryGetProperty("acquisition", out _));
        Assert.DoesNotContain("\"mrr\"", json);
        foreach (var section in new[] { "overview", "context", "financial", "clients", "acquisition", "training" })
        {
            var response = await coach.GetAsync("/api/v1/analyze/" + section);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Contains("feature_not_in_plan", await response.Content.ReadAsStringAsync());
        }
        foreach (var section in new[] { "check-ins", "messaging" })
            (await coach.GetAsync("/api/v1/analyze/" + section)).EnsureSuccessStatusCode();
    }
}
