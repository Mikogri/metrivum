using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.Coaching.Contracts;
using Metrivum.Training.Delivery;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;
using Metrivum.VideoAnalysis;

namespace Metrivum.IntegrationTests;

public sealed class MobileWorkoutAnalysisTests
{
    [CatalogPostgresFact]
    public async Task Local_result_links_only_owners_execution_and_its_actual_set_without_changing_training()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        var coachId = Guid.NewGuid(); var owner = Guid.NewGuid();
        using var coach = await Client(factory, coachId, "Coach");
        using var client = await Client(factory, owner, "Client");
        using var other = await Client(factory, Guid.NewGuid(), "Client");
        Guid relationship;
        using (var scope = factory.Services.CreateScope()) relationship = await scope.ServiceProvider.GetRequiredService<IRelationshipActivation>().ActivateDevFixtureAsync(coachId, owner, default);
        var exercise = await Body(await coach.PostAsJsonAsync("/api/v1/exercises/", new { name = "Mobile squat " + Guid.NewGuid() }));
        var exerciseId = exercise.GetProperty("id").GetGuid(); var instance = Guid.NewGuid(); var set = Guid.NewGuid();
        var document = new TrainingDocument(1, [new(Guid.NewGuid(), "Block", "", [new(Guid.NewGuid(), "Cycle", "", 1,
            [new(Guid.NewGuid(), 1, [new(Guid.NewGuid(), "Workout", "", [new(instance, exerciseId, "", [new(set, SetKind.Standard, new(Reps: new(5, 8)))])], [])])])])]);
        var plan = await Body(await coach.PostAsJsonAsync("/api/v1/training/programs", new CreatePlanRequest("Mobile", "", DocumentKind.Program, null, document)));
        var planId = plan.GetProperty("id").GetGuid();
        coach.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", "\"1\"");
        coach.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        await Body(await coach.PostAsync($"/api/v1/training/programs/{planId}/revisions", null));
        coach.DefaultRequestHeaders.Remove("If-Match");
        coach.DefaultRequestHeaders.Remove("Idempotency-Key");
        coach.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await Body(await coach.PostAsJsonAsync($"/api/v1/training/programs/{planId}/assignments", new AssignProgramRequest(null, [relationship], [], today, "UTC")));
        var schedule = await client.GetFromJsonAsync<JsonElement>($"/api/v1/training/schedule?from={today:yyyy-MM-dd}&to={today:yyyy-MM-dd}");
        var occurrence = schedule.GetProperty("items")[0].GetProperty("id").GetGuid();
        var started = await Body(await client.PostAsync($"/api/v1/training/workouts/{occurrence}/start", null));
        var execution = started.GetProperty("id").GetGuid();
        client.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", "\"1\"");
        var saved = await Body(await client.PutAsJsonAsync($"/api/v1/training/executions/{execution}", new SaveExecutionRequest(today, "", 60,
            [new(instance, exerciseId, "", [new(set, null, false, 6, 40, "kg", LoadMeaning.TotalExternal, null, null, null, null, null, null, "")])])));
        client.DefaultRequestHeaders.Remove("If-Match");
        var actualSet = saved.GetProperty("exercises")[0].GetProperty("sets")[0].GetProperty("id").GetGuid();
        SaveClientAnalysisRequest Analysis(Guid? linkedSet) => new(Guid.NewGuid(), "client", "Lift", null, [], new(), new("local", 10, 1920, 1080),
            new(1, "engine", "model", "tracking", "px", null, [], [new(1, 2, 3, null, 1, false)], []), WorkoutExecutionId: execution, SetId: linkedSet);
        client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var result = await Body(await client.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(actualSet)));
        Assert.Equal(execution, result.GetProperty("workoutExecutionId").GetGuid());
        other.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(actualSet))).StatusCode);
        client.DefaultRequestHeaders.Remove("Idempotency-Key"); client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(Guid.NewGuid()))).StatusCode);
        var workoutAfter = await client.GetFromJsonAsync<JsonElement>($"/api/v1/training/workouts/{occurrence}");
        var after = workoutAfter.GetProperty("execution");
        Assert.Equal(saved.GetProperty("version").GetInt64(), after.GetProperty("version").GetInt64());
        Assert.Equal("InProgress", after.GetProperty("status").GetString());
    }
    [CatalogPostgresFact]
    public async Task Coach_links_own_analysis_to_a_clients_logged_set_and_other_coaches_cannot()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        var coachId = Guid.NewGuid(); var owner = Guid.NewGuid();
        using var coach = await Client(factory, coachId, "Coach");
        using var client = await Client(factory, owner, "Client");
        using var stranger = await Client(factory, Guid.NewGuid(), "Coach");
        Guid relationship;
        using (var scope = factory.Services.CreateScope()) relationship = await scope.ServiceProvider.GetRequiredService<IRelationshipActivation>().ActivateDevFixtureAsync(coachId, owner, default);
        var exercise = await Body(await coach.PostAsJsonAsync("/api/v1/exercises/", new { name = "Linked squat " + Guid.NewGuid() }));
        var exerciseId = exercise.GetProperty("id").GetGuid(); var instance = Guid.NewGuid(); var set = Guid.NewGuid();
        var document = new TrainingDocument(1, [new(Guid.NewGuid(), "Block", "", [new(Guid.NewGuid(), "Cycle", "", 1,
            [new(Guid.NewGuid(), 1, [new(Guid.NewGuid(), "Workout", "", [new(instance, exerciseId, "", [new(set, SetKind.Standard, new(Reps: new(5, 8)))])], [])])])])]);
        var plan = await Body(await coach.PostAsJsonAsync("/api/v1/training/programs", new CreatePlanRequest("Linked", "", DocumentKind.Program, null, document)));
        var planId = plan.GetProperty("id").GetGuid();
        coach.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", "\"1\"");
        coach.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        await Body(await coach.PostAsync($"/api/v1/training/programs/{planId}/revisions", null));
        coach.DefaultRequestHeaders.Remove("If-Match");
        coach.DefaultRequestHeaders.Remove("Idempotency-Key");
        coach.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await Body(await coach.PostAsJsonAsync($"/api/v1/training/programs/{planId}/assignments", new AssignProgramRequest(null, [relationship], [], today, "UTC")));
        var schedule = await client.GetFromJsonAsync<JsonElement>($"/api/v1/training/schedule?from={today:yyyy-MM-dd}&to={today:yyyy-MM-dd}");
        var occurrence = schedule.GetProperty("items")[0].GetProperty("id").GetGuid();
        var execution = (await Body(await client.PostAsync($"/api/v1/training/workouts/{occurrence}/start", null))).GetProperty("id").GetGuid();
        client.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", "\"1\"");
        var saved = await Body(await client.PutAsJsonAsync($"/api/v1/training/executions/{execution}", new SaveExecutionRequest(today, "", 60,
            [new(instance, exerciseId, "", [new(set, null, false, 6, 40, "kg", LoadMeaning.TotalExternal, null, null, null, null, null, null, "")])])));
        var actualSet = saved.GetProperty("exercises")[0].GetProperty("sets")[0].GetProperty("id").GetGuid();

        // The coach's own analysis (recorded by the coach), not linked yet.
        coach.DefaultRequestHeaders.Remove("Idempotency-Key"); coach.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var analysis = await Body(await coach.PostAsJsonAsync("/api/v1/analyses/client-results", new SaveClientAnalysisRequest(Guid.NewGuid(), "client", "Coach lift", null, [], new(), new("local", 10, 1920, 1080),
            new(1, "engine", "model", "tracking", "px", null, [], [new(1, 2, 3, null, 1, false)], []))));
        var analysisId = analysis.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await coach.GetAsync($"/api/v1/analyses/{analysisId}/workout-link")).StatusCode);

        // The client's logged set is offered to the coach.
        var options = await coach.GetFromJsonAsync<JsonElement>($"/api/v1/training/analysis-set-options?relationshipId={relationship}");
        var offered = options.GetProperty("workouts")[0];
        Assert.Equal(execution, offered.GetProperty("executionId").GetGuid());
        Assert.Equal(actualSet, offered.GetProperty("exercises")[0].GetProperty("sets")[0].GetProperty("id").GetGuid());
        var summaries = await coach.GetFromJsonAsync<JsonElement>($"/api/v1/training/analysis-set-options?relationshipId={relationship}&includeSets=false");
        var summary = summaries.GetProperty("workouts")[0];
        Assert.Equal(execution, summary.GetProperty("executionId").GetGuid());
        Assert.Empty(summary.GetProperty("exercises").EnumerateArray());
        Assert.True(summaries.GetRawText().Length < options.GetRawText().Length);
        var detail = await coach.GetFromJsonAsync<JsonElement>($"/api/v1/training/analysis-set-options?executionId={execution}&relationshipId={relationship}&includeSets=true");
        Assert.Equal(offered.GetRawText(), Assert.Single(detail.GetProperty("workouts").EnumerateArray()).GetRawText());
        foreach (var suffix in new[] { "&includeSets=false", "&includeSets=true" })
        {
            var denied = await stranger.GetFromJsonAsync<JsonElement>($"/api/v1/training/analysis-set-options?executionId={execution}{suffix}");
            Assert.Empty(denied.GetProperty("workouts").EnumerateArray());
        }
        var missing = await coach.GetFromJsonAsync<JsonElement>($"/api/v1/training/analysis-set-options?executionId={Guid.NewGuid()}");
        Assert.Empty(missing.GetProperty("workouts").EnumerateArray());
        Assert.Equal(0, (await stranger.GetFromJsonAsync<JsonElement>("/api/v1/training/analysis-set-options")).GetProperty("workouts").GetArrayLength());

        var link = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/analyses/{analysisId}/workout-link") { Content = JsonContent.Create(new AnalysisWorkoutLinkRequest(execution, actualSet, ShareWithClient: true)) };
        link.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        var linked = await Body(await coach.SendAsync(link));
        Assert.True(linked.GetProperty("sharedWithClient").GetBoolean());
        Assert.Equal(1, linked.GetProperty("set").GetProperty("setNumber").GetInt32());
        Assert.Equal(6, linked.GetProperty("set").GetProperty("reps").GetInt32());
        Assert.Equal(actualSet, (await Body(await coach.GetAsync($"/api/v1/analyses/{analysisId}/workout-link"))).GetProperty("set").GetProperty("setId").GetGuid());

        // The client corrects the log (heavier load): the set keeps its id, so the link stays.
        client.DefaultRequestHeaders.Remove("If-Match");
        var correction = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/training/executions/{execution}") { Content = JsonContent.Create(new SaveExecutionRequest(today, "", 60,
            [new(instance, exerciseId, "", [new(set, null, false, 6, 45, "kg", LoadMeaning.TotalExternal, null, null, null, null, null, null, "")])])) };
        correction.Headers.TryAddWithoutValidation("If-Match", "\"2\"");
        var corrected = await Body(await client.SendAsync(correction));
        Assert.Equal(actualSet, corrected.GetProperty("exercises")[0].GetProperty("sets")[0].GetProperty("id").GetGuid());
        Assert.Equal(45, (await Body(await coach.GetAsync($"/api/v1/analyses/{analysisId}/workout-link"))).GetProperty("set").GetProperty("load").GetDecimal());

        // The client sees it at that workout and can open it read-only; nobody else can.
        var fromCoach = await client.GetFromJsonAsync<JsonElement>($"/api/v1/analyses/from-coach?executionId={execution}");
        Assert.Equal(analysisId, fromCoach[0].GetProperty("analysis").GetProperty("id").GetGuid());
        Assert.Equal(actualSet, fromCoach[0].GetProperty("set").GetProperty("setId").GetGuid());
        await Body(await client.GetAsync($"/api/v1/analyses/from-coach/{analysisId}/result"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/analyses/{analysisId}")).StatusCode);
        using var otherClient = await Client(factory, Guid.NewGuid(), "Client");
        Assert.Equal(HttpStatusCode.NotFound, (await otherClient.GetAsync($"/api/v1/analyses/from-coach/{analysisId}")).StatusCode);
        Assert.Equal(0, (await otherClient.GetFromJsonAsync<JsonElement>("/api/v1/analyses/from-coach")).GetArrayLength());

        // Another coach cannot link their analysis to this client's workout, and a set from elsewhere is refused.
        stranger.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var foreign = await Body(await stranger.PostAsJsonAsync("/api/v1/analyses/client-results", new SaveClientAnalysisRequest(Guid.NewGuid(), "client", "Other", null, [], new(), new("local", 10, 1920, 1080),
            new(1, "engine", "model", "tracking", "px", null, [], [new(1, 2, 3, null, 1, false)], []))));
        var steal = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/analyses/{foreign.GetProperty("id").GetGuid()}/workout-link") { Content = JsonContent.Create(new AnalysisWorkoutLinkRequest(execution, actualSet)) };
        steal.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.SendAsync(steal)).StatusCode);
        var wrongSet = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/analyses/{analysisId}/workout-link") { Content = JsonContent.Create(new AnalysisWorkoutLinkRequest(execution, Guid.NewGuid())) };
        wrongSet.Headers.TryAddWithoutValidation("If-Match", "\"2\"");
        Assert.Equal(HttpStatusCode.NotFound, (await coach.SendAsync(wrongSet)).StatusCode);

        // Linked but no longer shared: the client loses access.
        var keep = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/analyses/{analysisId}/workout-link") { Content = JsonContent.Create(new AnalysisWorkoutLinkRequest(execution, actualSet)) };
        keep.Headers.TryAddWithoutValidation("If-Match", "\"2\"");
        Assert.False((await Body(await coach.SendAsync(keep))).GetProperty("sharedWithClient").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/analyses/from-coach/{analysisId}")).StatusCode);

        var unlink = new HttpRequestMessage(HttpMethod.Delete, $"/api/v1/analyses/{analysisId}/workout-link");
        unlink.Headers.TryAddWithoutValidation("If-Match", "\"3\"");
        Assert.Equal(HttpStatusCode.NoContent, (await coach.SendAsync(unlink)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await coach.GetAsync($"/api/v1/analyses/{analysisId}/workout-link")).StatusCode);
    }
    [CatalogPostgresFact]
    public async Task Shared_analysis_can_be_kept_by_others_only_when_allowed_and_is_never_copied()
    {
        using var factory = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var owner = await Client(factory, Guid.NewGuid(), "Coach");
        using var viewer = await Client(factory, Guid.NewGuid(), "Coach");
        owner.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var analysis = await Body(await owner.PostAsJsonAsync("/api/v1/analyses/client-results", new SaveClientAnalysisRequest(Guid.NewGuid(), "client", "Shared lift", null, [], new(), new("local", 10, 1920, 1080),
            new(1, "engine", "model", "tracking", "px", null, [], [new(1, 2, 3, null, 1, false)], []))));
        var id = analysis.GetProperty("id").GetGuid();

        var link = await Body(await owner.PostAsJsonAsync($"/api/v1/analyses/{id}/share", new ShareRequest(false)));
        var token = link.GetProperty("token").GetString()!;
        Assert.False(link.GetProperty("allowSave").GetBoolean());
        var seen = await Body(await viewer.GetAsync($"/api/v1/analyses/shared/{token}"));
        Assert.False(seen.GetProperty("allowSave").GetBoolean());
        Assert.False(seen.GetProperty("own").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PostAsync($"/api/v1/analyses/shared/{token}/save", null)).StatusCode);

        // The owner allows keeping it: the same link now lets the viewer save a reference.
        Assert.True((await Body(await owner.PostAsJsonAsync($"/api/v1/analyses/{id}/share", new ShareRequest(true)))).GetProperty("allowSave").GetBoolean());
        Assert.Equal(HttpStatusCode.NoContent, (await viewer.PostAsync($"/api/v1/analyses/shared/{token}/save", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await viewer.PostAsync($"/api/v1/analyses/shared/{token}/save", null)).StatusCode);
        var saved = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/analyses/saved");
        Assert.Equal(1, saved.GetArrayLength());
        Assert.Equal(id, saved[0].GetProperty("analysisId").GetGuid());
        Assert.True((await Body(await viewer.GetAsync($"/api/v1/analyses/shared/{token}"))).GetProperty("saved").GetBoolean());
        // No copy: the viewer's own library stays empty and the result is read through the link.
        Assert.Equal(0, (await viewer.GetFromJsonAsync<JsonElement>("/api/v1/analyses")).GetArrayLength());
        await Body(await viewer.GetAsync($"/api/v1/analyses/shared/{token}/result"));

        // Revoking the link removes it from everyone's library.
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/v1/analyses/{id}/share")).StatusCode);
        Assert.Equal(0, (await viewer.GetFromJsonAsync<JsonElement>("/api/v1/analyses/saved")).GetArrayLength());
    }

    private static async Task<HttpClient> Client(ApiFactory factory, Guid id, string role)
    {
        var http = factory.CreateClient(); http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
        await Body(await http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = "mwork" + id.ToString("N")[..16], displayName = "Mobile workout", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role }));
        if (role == "Coach") await TestPlans.ActivateProAsync(http);
        return http;
    }
    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync(); Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {body}");
        return JsonSerializer.Deserialize<JsonElement>(body);
    }
}
