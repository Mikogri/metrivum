using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using TrainFlow.Billing.Features;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Coaching.Contracts;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.IntegrationTests;

public sealed class PlanSystemHttpTests
{
    [CatalogPostgresFact]
    public async Task Free_coach_can_save_supersets_and_basic_set_markers_without_advanced_access()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var coach = await Onboard(factory, "Coach");
        var first = Guid.NewGuid(); var second = Guid.NewGuid();
        var catalogId = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var catalog = scope.ServiceProvider.GetRequiredService<TrainFlow.ExerciseCatalog.Infrastructure.ExerciseCatalogDbContext>();
            catalog.Exercises.Add(new() { Id = catalogId, AuthorId = Guid.Empty, Name = "Shared marker " + catalogId, NormalizedName = "shared marker " + catalogId, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            await catalog.SaveChangesAsync();
        }
        var workout = new TrainFlow.Training.Domain.Workout(Guid.NewGuid(), "Superset", "", [
            new(first, catalogId, "", [new(Guid.NewGuid(), TrainFlow.Training.Domain.SetKind.Warmup, new(Reps: new(5, 5)))]),
            new(second, catalogId, "", [new(Guid.NewGuid(), TrainFlow.Training.Domain.SetKind.BackOff, new(Reps: new(8, 8)))])
        ], [new(Guid.NewGuid(), TrainFlow.Training.Domain.GroupKind.Superset, [first, second], 1, 90)]);
        var document = new TrainFlow.Training.Domain.TrainingDocument(1, [new(Guid.NewGuid(), "Block", "", [new(Guid.NewGuid(), "Cycle", "", 7, [new(Guid.NewGuid(), 1, [workout])])])]);
        var response = await coach.PostAsJsonAsync("/api/v1/training/programs", new TrainFlow.Training.Features.CreatePlanRequest("Basic set markers", "", TrainFlow.Training.Domain.DocumentKind.Program, null, document));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var plan = await response.Content.ReadFromJsonAsync<TrainFlow.Training.Features.PlanDto>();
        Assert.Equal(TrainFlow.Training.Domain.SetKind.Warmup, plan!.Document.Blocks[0].Cycles[0].Days[0].Workouts[0].Exercises[0].Sets[0].Kind);
    }
    [CatalogPostgresFact]
    public async Task Parallel_client_acceptance_uses_one_capacity_and_keeps_existing_clients_readable()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var coach = await Onboard(factory, "Coach");
        var coachId = (await coach.GetFromJsonAsync<JsonElement>("/api/v1/me")).GetProperty("id").GetGuid();
        var clientIds = new List<Guid>();
        for (var i = 0; i < 4; i++)
        {
            using var client = await Onboard(factory, "Client");
            clientIds.Add((await client.GetFromJsonAsync<JsonElement>("/api/v1/me")).GetProperty("id").GetGuid());
        }
        var results = await Task.WhenAll(clientIds.Select(async client =>
        {
            using var scope = factory.Services.CreateScope();
            try { await scope.ServiceProvider.GetRequiredService<IRelationshipActivation>().ActivateDevFixtureAsync(coachId, client, default); return true; }
            catch (ApiException error) when (error.Code == "LIMIT_EXCEEDED") { return false; }
        }));
        Assert.Equal(3, results.Count(x => x));
        var response = await coach.GetAsync("/api/v1/coaching/clients?page=1&pageSize=25");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var list = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(3, list.GetProperty("total").GetInt32());
    }
    [CatalogPostgresFact]
    public async Task Deleting_a_saved_analysis_does_not_make_its_successful_usage_receipt_reusable_for_new_content()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var coach = await Onboard(factory, "Coach");
        var localId = Guid.NewGuid(); var permit = Guid.NewGuid();
        (await coach.PostAsJsonAsync("/api/v1/analyses/local-authorizations", new { localAnalysisId = permit, durationSeconds = 1 })).EnsureSuccessStatusCode();
        var input = new TrainFlow.VideoAnalysis.SaveClientAnalysisRequest(localId, "client", "Original", null, [], new(), new("local", 1, 100, 100),
            new(1, "local", "local", "tracking", "px", null, [], [new(0, 0, 0, null, 1, false), new(1, 1, 1, null, 1, false)], []), AuthorizationId: permit);
        async Task<HttpResponseMessage> Save(TrainFlow.VideoAnalysis.SaveClientAnalysisRequest value)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/analyses/client-results") { Content = JsonContent.Create(value) };
            request.Headers.Add("Idempotency-Key", localId.ToString());
            return await coach.SendAsync(request);
        }
        var savedResponse = await Save(input);
        Assert.True(savedResponse.IsSuccessStatusCode, await savedResponse.Content.ReadAsStringAsync());
        var saved = await savedResponse.Content.ReadFromJsonAsync<TrainFlow.VideoAnalysis.AnalysisDto>();
        using var delete = new HttpRequestMessage(HttpMethod.Delete, $"/api/v1/analyses/{saved!.Id}");
        delete.Headers.TryAddWithoutValidation("If-Match", $"\"{saved.Version}\"");
        Assert.Equal(HttpStatusCode.NoContent, (await coach.SendAsync(delete)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Save(input with { Name = "Different inference" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Save(input)).StatusCode);
    }
    [CatalogPostgresFact]
    public async Task Free_quota_is_server_enforced_and_failed_work_can_release_a_hold()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var coach = await Onboard(factory, "Coach");
        var first = Guid.NewGuid(); var second = Guid.NewGuid();
        foreach (var id in new[] { first, second, second })
            Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync("/api/v1/analyses/local-authorizations", new { localAnalysisId = id, durationSeconds = 30 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await coach.PostAsJsonAsync("/api/v1/analyses/local-authorizations", new { localAnalysisId = Guid.NewGuid(), durationSeconds = 30 })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await coach.DeleteAsync($"/api/v1/analyses/local-authorizations/{first}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync("/api/v1/analyses/local-authorizations", new { localAnalysisId = Guid.NewGuid(), durationSeconds = 30 })).StatusCode);
        using var other = await Onboard(factory, "Client");
        Assert.Equal(HttpStatusCode.Conflict, (await other.DeleteAsync($"/api/v1/analyses/local-authorizations/{second}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await other.PostAsJsonAsync("/api/v1/analyses/local-authorizations", new { localAnalysisId = Guid.NewGuid(), durationSeconds = 61 })).StatusCode);
        var denied = await coach.PostAsJsonAsync("/api/v1/exercises", new { name = "New", description = "", instructions = "", tagIds = Array.Empty<Guid>() });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal("FEATURE_NOT_IN_PLAN", (await denied.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [CatalogPostgresFact]
    public async Task Paid_simulated_lifecycle_history_refund_and_cross_owner_reads_use_one_source_of_truth()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var coach = await Onboard(factory, "Coach");
        using var stranger = await Onboard(factory, "Coach");
        var checkoutResponse = await coach.PostAsJsonAsync("/api/v1/me/platform-subscription/checkout", new PlatformCheckoutRequest("Pro", "eur-monthly-v3-Pro"));
        var checkout = await checkoutResponse.Content.ReadFromJsonAsync<PlatformSubscriptionDto>();
        Assert.Equal(HttpStatusCode.OK, checkoutResponse.StatusCode);
        var confirmation = new PlatformConfirmRequest(checkout!.PendingDue!.Id, "initial-confirm");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync("/api/v1/me/platform-subscription/confirm-payment", confirmation)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync("/api/v1/me/platform-subscription/confirm-payment", confirmation)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync("/api/v1/me/platform-subscription/confirm-payment", confirmation)).StatusCode);
        // The whole history (every branch of the union, including dues with a date) and its summary translate to SQL.
        var allResponse = await coach.GetAsync("/api/v1/me/transactions");
        Assert.True(allResponse.IsSuccessStatusCode, await allResponse.Content.ReadAsStringAsync());
        var summaryResponse = await coach.GetAsync("/api/v1/me/transactions/summary");
        Assert.True(summaryResponse.IsSuccessStatusCode, await summaryResponse.Content.ReadAsStringAsync());
        var summary = await summaryResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(24, Assert.Single(summary.GetProperty("currencies").EnumerateArray()).GetProperty("paid").GetDecimal());
        var historyResponse = await coach.GetAsync("/api/v1/me/transactions?Type=PlatformSubscription&Status=Succeeded");
        Assert.True(historyResponse.IsSuccessStatusCode, await historyResponse.Content.ReadAsStringAsync());
        var history = await historyResponse.Content.ReadFromJsonAsync<JsonElement>();
        var payment = Assert.Single(history.GetProperty("items").EnumerateArray());
        Assert.Equal("Simulated", payment.GetProperty("mode").GetString());
        Assert.Equal("Outgoing", payment.GetProperty("direction").GetString());
        Assert.Equal(24, payment.GetProperty("grossAmount").GetDecimal());
        Assert.Equal("EUR", payment.GetProperty("currency").GetString());
        Assert.Equal(0, payment.GetProperty("feeAmount").GetDecimal());
        var paymentId = payment.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/v1/me/transactions/{paymentId}")).StatusCode);
        var refund = await coach.PostAsJsonAsync($"/api/v1/me/platform-payments/{paymentId}/simulated-refund", new { idempotencyKey = "refund-test" });
        Assert.True(refund.IsSuccessStatusCode, await refund.Content.ReadAsStringAsync());
        var reversed = await coach.GetFromJsonAsync<JsonElement>("/api/v1/me/transactions?Status=Refunded");
        Assert.Equal("Incoming", Assert.Single(reversed.GetProperty("items").EnumerateArray()).GetProperty("direction").GetString());
        var access = await coach.GetFromJsonAsync<JsonElement>("/api/v1/me/access");
        Assert.Contains(access.GetProperty("features").EnumerateArray(), f => f.GetProperty("key").GetString() == "training.export.csv" && !f.GetProperty("available").GetBoolean());
        var plans = await coach.GetFromJsonAsync<JsonElement>("/api/v1/subscriptions/plans");
        Assert.Equal(5, plans.GetArrayLength());
    }

    private static async Task<HttpClient> Onboard(ApiFactory factory, string role)
    {
        var user = Guid.NewGuid(); var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(user));
        var result = await http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = "plans" + user.ToString("N")[..20], displayName = "Plan test", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role });
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        return http;
    }
}
