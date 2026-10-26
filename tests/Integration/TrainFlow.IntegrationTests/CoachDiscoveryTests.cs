using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TrainFlow.IntegrationTests;

public sealed class CoachDiscoveryTests
{
    [CatalogPostgresFact]
    public async Task Matching_paid_coach_ranks_first_and_refund_removes_priority_without_hiding_the_profile()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!);
        using var free = factory.CreateClient();
        using var premium = factory.CreateClient();
        var ids = new[] { Guid.NewGuid(), Guid.NewGuid() }.Order().ToArray();
        var marker = "rank" + Guid.NewGuid().ToString("N")[..12];
        foreach (var (http, id) in new[] { (free, ids[0]), (premium, ids[1]) })
        {
            http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
            (await http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = "r" + id.ToString("N")[..20], displayName = marker, birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role = "Coach" })).EnsureSuccessStatusCode();
            (await http.PutAsJsonAsync("/api/v1/me/discovery", new { published = true, specializations = new[] { "Strength" }, languages = new[] { "en" }, modes = new[] { "Online" }, version = 0 })).EnsureSuccessStatusCode();
        }
        var plans = await premium.GetFromJsonAsync<JsonElement>("/api/v1/subscriptions/plans");
        var priceVersion = plans.EnumerateArray().Single(plan => plan.GetProperty("id").GetString() == "Pro").GetProperty("priceVersion").GetString();
        var checkoutResponse = await premium.PostAsJsonAsync("/api/v1/me/platform-subscription/checkout", new { planId = "Pro", priceVersion });
        checkoutResponse.EnsureSuccessStatusCode();
        var checkout = await checkoutResponse.Content.ReadFromJsonAsync<JsonElement>();
        (await premium.PostAsJsonAsync("/api/v1/me/platform-subscription/confirm-payment", new { dueId = checkout.GetProperty("pendingDue").GetProperty("id").GetGuid(), idempotencyKey = "discovery-" + marker })).EnsureSuccessStatusCode();
        var path = "/api/v1/discovery/coaches?search=" + marker + "&pageSize=1";
        var first = await free.GetFromJsonAsync<JsonElement>(path);
        Assert.Equal(2, first.GetProperty("total").GetInt32());
        Assert.Equal(ids[1], Assert.Single(first.GetProperty("items").EnumerateArray()).GetProperty("coachId").GetGuid());
        var second = await free.GetFromJsonAsync<JsonElement>(path + "&page=2");
        Assert.Equal(ids[0], Assert.Single(second.GetProperty("items").EnumerateArray()).GetProperty("coachId").GetGuid());
        Assert.Empty((await free.GetFromJsonAsync<JsonElement>(path + "&specialization=unrelated")).GetProperty("items").EnumerateArray());
        var history = await premium.GetFromJsonAsync<JsonElement>("/api/v1/me/platform-subscription/history");
        var paymentId = Assert.Single(history.GetProperty("payments").EnumerateArray()).GetProperty("id").GetGuid();
        (await premium.PostAsJsonAsync($"/api/v1/me/platform-payments/{paymentId}/simulated-refund", new { idempotencyKey = "refund-" + marker })).EnsureSuccessStatusCode();
        var after = await free.GetFromJsonAsync<JsonElement>(path.Replace("pageSize=1", "pageSize=2"));
        Assert.Equal(2, after.GetProperty("total").GetInt32());
        Assert.All(after.GetProperty("items").EnumerateArray(), item => Assert.False(item.GetProperty("featured").GetBoolean()));
        Assert.Equal(ids[0], after.GetProperty("items")[0].GetProperty("coachId").GetGuid());
    }

    [CatalogPostgresFact]
    public async Task Discovery_is_opt_in_available_to_both_roles_and_withdraws_immediately()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!);
        using var coach = factory.CreateClient();
        using var client = factory.CreateClient();
        var coachId = Guid.NewGuid();
        var clientId = Guid.NewGuid();
        var marker = "discovery" + coachId.ToString("N")[..12];
        foreach (var (http, id, role) in new[] { (coach, coachId, "Coach"), (client, clientId, "Client") })
        {
            http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
            (await http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = "d" + id.ToString("N")[..20], displayName = marker, birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role })).EnsureSuccessStatusCode();
        }
        var path = "/api/v1/discovery/coaches?search=" + marker;
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>(path)).GetProperty("items").EnumerateArray());
        var publish = new { published = true, specializations = new[] { "Strength" }, languages = new[] { "en", "pl" }, modes = new[] { "Online" }, location = "Warsaw", version = 0 };
        (await coach.PutAsJsonAsync("/api/v1/me/discovery", publish)).EnsureSuccessStatusCode();
        foreach (var http in new[] { coach, client })
        {
            var page = await http.GetFromJsonAsync<JsonElement>(path);
            var item = Assert.Single(page.GetProperty("items").EnumerateArray());
            Assert.Equal(coachId, item.GetProperty("coachId").GetGuid());
            Assert.False(item.TryGetProperty("phone", out _));
            Assert.False(item.TryGetProperty("birthDate", out _));
            Assert.False(item.TryGetProperty("clients", out _));
            Assert.False(item.GetProperty("featured").GetBoolean());
        }
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>(path + "&language=de")).GetProperty("items").EnumerateArray());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>(path + "&mode=Offline")).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/v1/me/discovery", publish)).StatusCode);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await coach.PutAsJsonAsync("/api/v1/me/discovery", publish)).StatusCode);
        (await coach.PutAsJsonAsync("/api/v1/me/discovery", new { published = false, version = 1 })).EnsureSuccessStatusCode();
        Assert.Empty((await client.GetFromJsonAsync<JsonElement>(path)).GetProperty("items").EnumerateArray());
    }
}
