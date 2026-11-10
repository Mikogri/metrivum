using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Coaching.Contracts;
using Metrivum.Notifications;
using Metrivum.Training.Delivery;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class TrainingDeliveryHttpTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [TrainingPostgresFact]
    public async Task Authenticated_coach_assigns_client_logs_and_real_coaching_catalog_notifications_and_reports_remain_scoped()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        var coachId = Guid.NewGuid();
        var clientId = Guid.NewGuid();
        var otherId = Guid.NewGuid();
        using var coach = await Onboard(factory, coachId, "Coach");
        using var client = await Onboard(factory, clientId, "Client");
        await Body(
            await client.PutAsJsonAsync(
                "/api/v1/me/roles/coach/onboarding",
                new
                {
                    username = "td" + clientId.ToString("N")[..20],
                    displayName = "Delivery " + clientId.ToString("N")[..10],
                    birthDate = "1990-01-01",
                    acceptedTerms = true,
                    locale = "en",
                    timeZone = "UTC",
                }
            )
        );
        using var other = await Onboard(factory, otherId, "Coach");
        var secondClientId = Guid.NewGuid();
        using var secondClient = await Onboard(factory, secondClientId, "Client");
        Guid relationship;
        Guid secondRelationship;
        using (var scope = factory.Services.CreateScope())
        {
            var activation = scope.ServiceProvider.GetRequiredService<IRelationshipActivation>();
            relationship = await activation.ActivateDevFixtureAsync(coachId, clientId, default);
            secondRelationship = await activation.ActivateDevFixtureAsync(
                coachId,
                secondClientId,
                default
            );
            await activation.ActivateDevFixtureAsync(otherId, clientId, default);
        }
        var exercise = await Body(
            await coach.PostAsJsonAsync(
                "/api/v1/exercises/",
                new { name = "HTTP delivery squat " + Guid.NewGuid().ToString("N") }
            )
        );
        var exerciseId = exercise.GetProperty("id").GetGuid();
        var instanceId = Guid.NewGuid();
        var setId = Guid.NewGuid();
        var document = new TrainingDocument(
            1,
            [
                new(
                    Guid.NewGuid(),
                    "Block",
                    "",
                    [
                        new(
                            Guid.NewGuid(),
                            "Ten days",
                            "",
                            10,
                            [
                                new(
                                    Guid.NewGuid(),
                                    1,
                                    [
                                        new(
                                            Guid.NewGuid(),
                                            "Session",
                                            "",
                                            [
                                                new(
                                                    instanceId,
                                                    exerciseId,
                                                    "prescription",
                                                    [
                                                        new(
                                                            setId,
                                                            SetKind.Standard,
                                                            new(Reps: new(5, 8))
                                                        ),
                                                    ]
                                                ),
                                            ],
                                            []
                                        ),
                                    ]
                                ),
                            ]
                        ),
                    ]
                ),
            ]
        );
        var plan = await Body(
            await coach.PostAsJsonAsync(
                "/api/v1/training/programs",
                new CreatePlanRequest("HTTP program", "", DocumentKind.Program, null, document)
            )
        );
        var programId = plan.GetProperty("id").GetGuid();
        await Body(
            await Send(
                coach,
                HttpMethod.Post,
                $"/api/v1/training/programs/{programId}/revisions",
                null,
                1,
                "publish"
            )
        );
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var yesterday = today.AddDays(-1);
        var assign = new AssignProgramRequest(
            null,
            [relationship, secondRelationship, relationship],
            [],
            yesterday,
            "UTC"
        );
        var preview = await Body(
            await coach.PostAsJsonAsync(
                $"/api/v1/training/programs/{programId}/assignments/preview",
                assign
            )
        );
        Assert.Equal(2, preview.GetArrayLength());
        Assert.Equal(
            2,
            preview
                .EnumerateArray()
                .Select(x => x.GetProperty("displayName").GetString())
                .Distinct()
                .Count()
        );
        Assert.All(
            preview.EnumerateArray(),
            x => Assert.False(string.IsNullOrWhiteSpace(x.GetProperty("username").GetString()))
        );
        var batch = await Body(
            await Send(
                coach,
                HttpMethod.Post,
                $"/api/v1/training/programs/{programId}/assignments",
                assign,
                null,
                "assign"
            )
        );
        Assert.Equal(
            batch.GetProperty("id").GetGuid(),
            (
                await Body(
                    await Send(
                        coach,
                        HttpMethod.Post,
                        $"/api/v1/training/programs/{programId}/assignments",
                        assign,
                        null,
                        "assign"
                    )
                )
            )
                .GetProperty("id")
                .GetGuid()
        );
        var assignmentId = batch
            .GetProperty("assignments")
            .EnumerateArray()
            .Single(x => x.GetProperty("relationshipId").GetGuid() == relationship)
            .GetProperty("id")
            .GetGuid();
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await other.GetAsync($"/api/v1/training/assignments/{assignmentId}")).StatusCode
        );
        var schedule = await Body(
            await client.GetAsync(
                $"/api/v1/training/schedule?from={yesterday:yyyy-MM-dd}&to={today:yyyy-MM-dd}"
            )
        );
        Assert.Equal(
            1,
            (await Body(await client.GetAsync("/api/v1/training/assignments?view=client")))
                .GetProperty("total")
                .GetInt32()
        );
        Assert.Equal(
            0,
            (await Body(await client.GetAsync("/api/v1/training/assignments?view=coach")))
                .GetProperty("total")
                .GetInt32()
        );
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.GetAsync("/api/v1/training/assignments?view=admin")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await secondClient.GetAsync("/api/v1/training/assignments?view=coach")).StatusCode
        );
        var occurrenceId = schedule.GetProperty("items")[0].GetProperty("id").GetGuid();
        var started = await Body(
            await client.PostAsync($"/api/v1/training/workouts/{occurrenceId}/start", null)
        );
        Assert.Empty(started.GetProperty("exercises").EnumerateArray());
        var executionId = started.GetProperty("id").GetGuid();
        var actual = new SaveExecutionRequest(
            yesterday,
            "actual log",
            1200,
            [
                new(
                    instanceId,
                    exerciseId,
                    "",
                    [
                        new(
                            setId,
                            null,
                            false,
                            8,
                            40,
                            "kg",
                            LoadMeaning.TotalExternal,
                            7,
                            null,
                            null,
                            null,
                            90,
                            null,
                            ""
                        ),
                    ]
                ),
            ]
        );
        var save = await Send(
            client,
            HttpMethod.Put,
            $"/api/v1/training/executions/{executionId}",
            actual,
            1
        );
        var saved = await Body(save);
        Assert.Equal("\"2\"", save.Headers.ETag?.Tag);
        await Body(
            await Send(
                client,
                HttpMethod.Post,
                $"/api/v1/training/executions/{executionId}/complete",
                null,
                saved.GetProperty("version").GetInt64()
            )
        );
        var finished = (
            await Body(await client.GetAsync($"/api/v1/training/workouts/{occurrenceId}"))
        ).GetProperty("execution");
        var feedbackVersion = finished.GetProperty("version").GetInt64();
        var feedback = new
        {
            rating = 4,
            sessionRpe = 7.5m,
            wellbeing = 4,
            sleepQuality = 3,
            note = "Good workout",
        };
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await Send(
                    coach,
                    HttpMethod.Put,
                    $"/api/v1/training/executions/{executionId}/feedback",
                    feedback,
                    feedbackVersion
                )
            ).StatusCode
        );
        await Body(
            await Send(
                client,
                HttpMethod.Put,
                $"/api/v1/training/executions/{executionId}/feedback",
                feedback,
                feedbackVersion
            )
        );
        Assert.Equal(
            HttpStatusCode.Conflict,
            (
                await Send(
                    client,
                    HttpMethod.Put,
                    $"/api/v1/training/executions/{executionId}/feedback",
                    feedback,
                    feedbackVersion
                )
            ).StatusCode
        );
        var comparison = await Body(
            await coach.GetAsync($"/api/v1/training/executions/{executionId}/comparison")
        );
        Assert.Equal(
            7.5m,
            comparison.GetProperty("feedback").GetProperty("sessionRpe").GetDecimal()
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await other.GetAsync($"/api/v1/training/executions/{executionId}/comparison")
            ).StatusCode
        );
        var report = await Body(
            await coach.GetAsync(
                $"/api/v1/training/progress?from={yesterday:yyyy-MM-dd}&to={today:yyyy-MM-dd}&relationshipId={relationship}"
            )
        );
        Assert.Equal(1, report.GetProperty("completed").GetInt32());
        Assert.Equal(100, report.GetProperty("completionPercentage").GetDecimal());
        Assert.Equal(320, report.GetProperty("volumeKg").GetDecimal());
        Assert.Equal(
            1,
            (
                await Body(
                    await client.GetAsync(
                        $"/api/v1/training/progress?from={yesterday:yyyy-MM-dd}&to={today:yyyy-MM-dd}&view=client"
                    )
                )
            )
                .GetProperty("completed")
                .GetInt32()
        );
        Assert.Equal(
            0,
            (
                await Body(
                    await client.GetAsync(
                        $"/api/v1/training/progress?from={yesterday:yyyy-MM-dd}&to={today:yyyy-MM-dd}&view=coach"
                    )
                )
            )
                .GetProperty("completed")
                .GetInt32()
        );
        var analysis = await Body(
            await coach.GetAsync(
                $"/api/v1/analyze/training?from={yesterday:yyyy-MM-dd}&to={today:yyyy-MM-dd}&timeZone=UTC"
            )
        );
        Assert.True(analysis.GetProperty("available").GetBoolean());
        Assert.Equal(1, analysis.GetProperty("progress").GetProperty("completed").GetInt32());
        var foreignAnalysis = await Body(
            await other.GetAsync(
                $"/api/v1/analyze/training?from={yesterday:yyyy-MM-dd}&to={today:yyyy-MM-dd}&timeZone=UTC"
            )
        );
        Assert.Equal(
            0,
            foreignAnalysis.GetProperty("progress").GetProperty("completed").GetInt32()
        );
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (
                await client.GetAsync(
                    $"/api/v1/analyze/training?from={yesterday:yyyy-MM-dd}&to={today:yyyy-MM-dd}&timeZone=UTC"
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await other.GetAsync($"/api/v1/training/workouts/{occurrenceId}")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await other.GetAsync(
                    $"/api/v1/training/progress?from={yesterday:yyyy-MM-dd}&to={today:yyyy-MM-dd}&relationshipId={relationship}"
                )
            ).StatusCode
        );
        using (var scope = factory.Services.CreateScope())
        {
            var notifications = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
            Assert.Equal(
                1,
                await notifications.Notifications.CountAsync(x =>
                    x.RecipientUserId == clientId
                    && x.EventKey == $"training-assigned:{assignmentId}"
                )
            );
            Assert.Equal(
                1,
                await notifications.Notifications.CountAsync(x =>
                    x.RecipientUserId == coachId
                    && x.EventKey == $"training-completed:{executionId}"
                )
            );
        }
        var relationshipDto = await Body(
            await coach.GetAsync($"/api/v1/coaching/relationships/{relationship}")
        );
        await Body(
            await Send(
                coach,
                HttpMethod.Post,
                $"/api/v1/coaching/relationships/{relationship}/suspend",
                new { internalReason = "test" },
                relationshipDto.GetProperty("version").GetInt64()
            )
        );
        var suspendedAssignment = await Body(
            await coach.GetAsync($"/api/v1/training/assignments/{assignmentId}")
        );
        Assert.Equal(
            ["status"],
            suspendedAssignment
                .GetProperty("allowedActions")
                .EnumerateArray()
                .Select(x => x.GetString())
        );
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.GetAsync($"/api/v1/training/workouts/{occurrenceId}")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (
                await Send(
                    client,
                    HttpMethod.Put,
                    $"/api/v1/training/executions/{executionId}",
                    actual,
                    3
                )
            ).StatusCode
        );
    }

    private static async Task<HttpClient> Onboard(ApiFactory factory, Guid id, string role)
    {
        var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
        await Body(
            await http.PutAsJsonAsync(
                "/api/v1/me/onboarding",
                new
                {
                    username = "td" + id.ToString("N")[..20],
                    displayName = "Delivery " + id.ToString("N")[..10],
                    birthDate = "1990-01-01",
                    acceptedTerms = true,
                    locale = "en",
                    timeZone = "UTC",
                    role,
                }
            )
        );
        if (role == "Coach")
        {
            var checkout = await Body(
                await http.PostAsJsonAsync(
                    "/api/v1/me/platform-subscription/checkout",
                    new { planId = "Pro", priceVersion = "eur-monthly-v3-Pro" }
                )
            );
            await Body(
                await http.PostAsJsonAsync(
                    "/api/v1/me/platform-subscription/confirm-payment",
                    new
                    {
                        dueId = checkout.GetProperty("pendingDue").GetProperty("id").GetGuid(),
                        idempotencyKey = "delivery-fixture-pro",
                    }
                )
            );
        }
        return http;
    }

    private static async Task<HttpResponseMessage> Send(
        HttpClient client,
        HttpMethod method,
        string path,
        object? body,
        long? version = null,
        string? key = null
    )
    {
        using var request = new HttpRequestMessage(method, path);
        if (body != null)
            request.Content = JsonContent.Create(body, options: Json);
        if (version != null)
            request.Headers.TryAddWithoutValidation("If-Match", $"\"{version}\"");
        if (key != null)
            request.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {text}");
        return JsonSerializer.Deserialize<JsonElement>(text, Json);
    }
}
