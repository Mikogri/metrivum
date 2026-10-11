using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using TrainFlow.Coaching.Features;
using TrainFlow.Offers.Contracts;

namespace TrainFlow.IntegrationTests;
public sealed partial class CoachingIntakeTests
{
    [CatalogPostgresFact]
    public async Task Client_role_can_manage_owned_training_without_coach_creation_or_formulas()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        var client = await Onboard(factory, factory, "Client");
        var features = (await Get(client.Http, "/api/v1/me/access")).GetProperty("features").EnumerateArray().ToDictionary(x => x.GetProperty("key").GetString()!);
        foreach (var key in new[] { "training.programs.read", "training.programs.manage", "training.sets.advanced", "training.export.csv", "training.export.pdf" })
            Assert.NotEqual("role_required", features[key].GetProperty("reason").GetString());
        foreach (var key in new[] { "training.programs.create", "training.templates.manage", "training.formulas.custom", "training.assignments.manage" })
            Assert.Equal("role_required", features[key].GetProperty("reason").GetString());
    }

    [CatalogPostgresFact]
    public async Task Plan_sale_http_does_not_activate_coaching_and_unlocks_only_the_buyers_copy()
    {
        using var original = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var stranger = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http, "Plan sale", 25, OfferPurpose.TrainingPlan);
        var sourceResponse = await coach.Http.PostAsJsonAsync("/api/v1/training/programs", new { name = "Private source", description = "Private draft", kind = "Program", document = new { schemaVersion = 1, blocks = Array.Empty<object>() } });
        Assert.Equal(HttpStatusCode.OK, sourceResponse.StatusCode);
        var source = await Body(sourceResponse);
        var sourceId = source.GetProperty("id").GetGuid();
        using var apply = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/training/programs/{sourceId}/apply");
        apply.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        apply.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var appliedResponse = await coach.Http.SendAsync(apply);
        Assert.Equal(HttpStatusCode.OK, appliedResponse.StatusCode);
        var revision = (await Body(appliedResponse)).GetProperty("id").GetGuid();
        var app = await Submitted(client.Http, offer);
        var appId = app.GetProperty("id").GetGuid();
        var accept = await Mutate(coach.Http, $"{Root}/applications/{appId}/accept", app.GetProperty("version").GetInt64(), new AcceptApplicationRequest(TrainingPlanRevisionId: revision));
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);
        var accepted = await Body(accept);
        Assert.Equal(JsonValueKind.Null, accepted.GetProperty("relationshipId").ValueKind);
        Assert.Equal(JsonValueKind.Null, accepted.GetProperty("serviceId").ValueKind);
        var pending = await Get(client.Http, "/api/v1/training/purchases");
        var purchase = Assert.Single(pending.GetProperty("items").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, purchase.GetProperty("planId").ValueKind);
        Assert.False(purchase.TryGetProperty("snapshot", out _));
        foreach (var suffix in new[] { "", "/revisions/1", "/revisions/1/export?format=csv" })
            Assert.Equal(HttpStatusCode.NotFound, (await client.Http.GetAsync($"/api/v1/training/programs/{sourceId}{suffix}")).StatusCode);
        var orderId = purchase.GetProperty("orderId").GetGuid();
        var due = await Get(client.Http, $"/api/v1/me/plan-purchases/{orderId}/due");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.Http.GetAsync($"/api/v1/me/plan-purchases/{orderId}/due")).StatusCode);
        var payment = await client.Http.PostAsJsonAsync($"/api/v1/me/payment-dues/{due.GetProperty("id").GetGuid()}/pay", new { paymentMethodId = (Guid?)null, idempotencyKey = "purchase" });
        Assert.Equal(HttpStatusCode.OK, payment.StatusCode);
        var delivered = Assert.Single((await Get(client.Http, "/api/v1/training/purchases")).GetProperty("items").EnumerateArray());
        var copyId = delivered.GetProperty("planId").GetGuid();
        Assert.NotEqual(sourceId, copyId);
        var copy = await Get(client.Http, $"/api/v1/training/programs/{copyId}");
        Assert.Equal(HttpStatusCode.NotFound, (await coach.Http.GetAsync($"/api/v1/training/programs/{copyId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.Http.GetAsync($"/api/v1/training/programs/{copyId}")).StatusCode);
        using var edit = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/training/programs/{copyId}/draft") { Content = JsonContent.Create(new { name = "My edited copy", description = "", folderId = (Guid?)null, document = copy.GetProperty("document") }) };
        edit.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        Assert.Equal(HttpStatusCode.OK, (await client.Http.SendAsync(edit)).StatusCode);
        Assert.Equal("Private source", (await Get(coach.Http, $"/api/v1/training/programs/{sourceId}")).GetProperty("name").GetString());
        Assert.Empty((await Get(client.Http, "/api/v1/training/assignments?view=client")).GetProperty("items").EnumerateArray());
    }
}
