using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Training.Delivery;
using TrainFlow.Training.Domain;
using TrainFlow.Training.Features;
using TrainFlow.VideoAnalysis;

namespace TrainFlow.IntegrationTests;

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
    private static async Task<HttpClient> Client(ApiFactory factory, Guid id, string role)
    {
        var http = factory.CreateClient(); http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
        await Body(await http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = "mwork" + id.ToString("N")[..16], displayName = "Mobile workout", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role }));
        return http;
    }
    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync(); Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {body}");
        return JsonSerializer.Deserialize<JsonElement>(body);
    }
}
