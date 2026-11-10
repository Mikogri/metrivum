using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.CheckIns.Domain;
using Metrivum.CheckIns.Features;
using Metrivum.ClientDocumentation.Contracts;
using Metrivum.Coaching.Contracts;
using Metrivum.Forms.Contracts;
using Metrivum.Forms.Features;
using Metrivum.Training.Delivery;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

/// <summary>
/// Someone who opens a link to another person's plan, workout or activity gets nothing back. A coach, a client and
/// that client's workouts are set up; then an unrelated coach, an unrelated client and another client of the same
/// coach request every one of those resources by id. Each request must be refused (403/404) or, for filtered lists,
/// come back without any of the owner's data.
/// </summary>
public sealed class CrossAccountAccessTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [TrainingPostgresFact]
    public async Task Training_plans_workouts_and_activity_are_never_visible_to_unrelated_accounts()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        var coachId = Guid.NewGuid();
        var clientId = Guid.NewGuid();
        var siblingId = Guid.NewGuid();
        var strangerCoachId = Guid.NewGuid();
        var strangerClientId = Guid.NewGuid();
        using var coach = await Onboard(factory, coachId, "Coach");
        using var client = await Onboard(factory, clientId, "Client");
        using var sibling = await Onboard(factory, siblingId, "Client");
        using var strangerCoach = await Onboard(factory, strangerCoachId, "Coach");
        using var strangerClient = await Onboard(factory, strangerClientId, "Client");
        Guid relationship;
        using (var scope = factory.Services.CreateScope())
        {
            var activation = scope.ServiceProvider.GetRequiredService<IRelationshipActivation>();
            relationship = await activation.ActivateDevFixtureAsync(coachId, clientId, default);
            await activation.ActivateDevFixtureAsync(coachId, siblingId, default);
            // The stranger coach coaches someone else, so they hold every coach permission, just not for this client.
            await activation.ActivateDevFixtureAsync(strangerCoachId, strangerClientId, default);
        }

        var canary = "Canary " + Guid.NewGuid().ToString("N");
        var exerciseId = (
            await Body(
                await coach.PostAsJsonAsync("/api/v1/exercises/", new { name = canary + " squat" })
            )
        )
            .GetProperty("id")
            .GetGuid();
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
                            "Week",
                            "",
                            7,
                            [
                                new(
                                    Guid.NewGuid(),
                                    1,
                                    [
                                        new(
                                            Guid.NewGuid(),
                                            canary + " session",
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
        var programId = (
            await Body(
                await coach.PostAsJsonAsync(
                    "/api/v1/training/programs",
                    new CreatePlanRequest(
                        canary + " program",
                        "",
                        DocumentKind.Program,
                        null,
                        document
                    )
                )
            )
        )
            .GetProperty("id")
            .GetGuid();
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
        // The library says the plan is published, and from which draft.
        var listed = (await Body(await coach.GetAsync("/api/v1/training/programs?sort=updated")))
            .GetProperty("items")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == programId);
        Assert.Equal(1, listed.GetProperty("publishedNumber").GetInt32());
        Assert.Equal(
            listed.GetProperty("version").GetInt64(),
            listed.GetProperty("publishedDraftVersion").GetInt64()
        );
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = today.AddDays(-7);
        var to = today.AddDays(7);
        var assign = new AssignProgramRequest(null, [relationship], [], today.AddDays(-1), "UTC");
        var batch = await Body(
            await Send(
                coach,
                HttpMethod.Post,
                $"/api/v1/training/programs/{programId}/assignments",
                assign,
                null,
                "assign-canary"
            )
        );
        var assignmentId = batch.GetProperty("assignments")[0].GetProperty("id").GetGuid();
        var schedule = await Body(
            await client.GetAsync(
                $"/api/v1/training/schedule?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}"
            )
        );
        var occurrenceId = schedule.GetProperty("items")[0].GetProperty("id").GetGuid();
        var otherOccurrenceId = schedule.GetProperty("items")[1].GetProperty("id").GetGuid();
        var started = await Body(
            await client.PostAsync($"/api/v1/training/workouts/{occurrenceId}/start", null)
        );
        var executionId = started.GetProperty("id").GetGuid();
        var actual = new SaveExecutionRequest(
            today,
            canary + " log",
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
        var saved = await Body(
            await Send(
                client,
                HttpMethod.Put,
                $"/api/v1/training/executions/{executionId}",
                actual,
                1
            )
        );
        var completed = await Body(
            await Send(
                client,
                HttpMethod.Post,
                $"/api/v1/training/executions/{executionId}/complete",
                null,
                saved.GetProperty("version").GetInt64()
            )
        );
        var version = completed.GetProperty("version").GetInt64();

        // Anything identifying the owner's data: if one of these comes back, it leaked.
        string[] secrets =
        [
            canary,
            programId.ToString(),
            assignmentId.ToString(),
            occurrenceId.ToString(),
            otherOccurrenceId.ToString(),
            executionId.ToString(),
            exerciseId.ToString(),
        ];
        var period = $"from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}";
        var reads = new[]
        {
            $"/api/v1/training/programs/{programId}",
            $"/api/v1/training/programs/{programId}/revisions",
            $"/api/v1/training/programs/{programId}/revisions/1",
            $"/api/v1/training/programs/{programId}/revisions/1/export?format=csv",
            $"/api/v1/training/programs/{programId}/generation",
            $"/api/v1/training/assignments/{assignmentId}",
            $"/api/v1/training/assignments/{assignmentId}/formula-snapshot",
            $"/api/v1/training/assignments?relationshipId={relationship}",
            $"/api/v1/training/assignments?programId={programId}",
            $"/api/v1/training/activity-options?relationshipId={relationship}",
            $"/api/v1/training/activity-options?relationshipId={relationship}&programId={programId}",
            $"/api/v1/training/last-activity?relationshipId={relationship}",
            $"/api/v1/training/assignment-summary?relationshipId={relationship}",
            $"/api/v1/training/analysis-set-options?relationshipId={relationship}",
            $"/api/v1/training/schedule?{period}&relationshipId={relationship}",
            $"/api/v1/training/schedule?{period}&programId={programId}",
            $"/api/v1/training/comparison-report?{period}&relationshipId={relationship}",
            $"/api/v1/training/comparison-report?{period}&programId={programId}",
            $"/api/v1/training/progress?{period}&relationshipId={relationship}",
            $"/api/v1/training/progress?{period}&programId={programId}",
            $"/api/v1/training/progress?{period}&exerciseId={exerciseId}",
            $"/api/v1/training/workouts/{occurrenceId}",
            $"/api/v1/training/workouts/{occurrenceId}?relationshipId={relationship}",
            $"/api/v1/training/executions/{executionId}/comparison",
            $"/api/v1/training/clients/{relationship}/variables",
            $"/api/v1/coaching/relationships/{relationship}",
            // (The exercise catalog is shared by design: everyone can read every exercise; only its author edits it.)
        };
        var failures = new List<string>();
        foreach (
            var (name, http) in new[]
            {
                ("unrelated coach", strangerCoach),
                ("unrelated client", strangerClient),
                ("other client of the same coach", sibling),
            }
        )
        {
            foreach (var path in reads)
                await Expect(failures, name, "GET " + path, await http.GetAsync(path), secrets);
            // Writes: none may act on the owner's plan, workouts or log.
            await Expect(
                failures,
                name,
                "POST start",
                await http.PostAsync($"/api/v1/training/workouts/{otherOccurrenceId}/start", null),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST skip",
                await http.PostAsJsonAsync(
                    $"/api/v1/training/workouts/{otherOccurrenceId}/skip",
                    new { reason = "x" }
                ),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "PUT execution",
                await Send(
                    http,
                    HttpMethod.Put,
                    $"/api/v1/training/executions/{executionId}",
                    actual,
                    version
                ),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST complete",
                await Send(
                    http,
                    HttpMethod.Post,
                    $"/api/v1/training/executions/{executionId}/complete",
                    null,
                    version
                ),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "PUT feedback",
                await Send(
                    http,
                    HttpMethod.Put,
                    $"/api/v1/training/executions/{executionId}/feedback",
                    new { rating = 1 },
                    version
                ),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "PUT draft",
                await Send(
                    http,
                    HttpMethod.Put,
                    $"/api/v1/training/programs/{programId}/draft",
                    new
                    {
                        name = "stolen",
                        description = "",
                        document,
                    },
                    2
                ),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST copy",
                await Send(
                    http,
                    HttpMethod.Post,
                    $"/api/v1/training/programs/{programId}/copy",
                    new { name = "stolen" },
                    null,
                    "copy-" + name
                ),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "PUT archive",
                await Send(
                    http,
                    HttpMethod.Put,
                    $"/api/v1/training/programs/{programId}/archive",
                    new { archived = true },
                    2
                ),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST client-preview",
                await http.PostAsJsonAsync(
                    $"/api/v1/training/programs/{programId}/client-preview",
                    new { relationshipId = relationship }
                ),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "PUT assignment status",
                await Send(
                    http,
                    HttpMethod.Put,
                    $"/api/v1/training/assignments/{assignmentId}/status",
                    new { status = "Cancelled", reason = "x" },
                    1
                ),
                secrets,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST assign foreign client",
                await Send(
                    http,
                    HttpMethod.Post,
                    $"/api/v1/training/programs/{programId}/assignments/preview",
                    assign,
                    null
                ),
                secrets,
                readOnly: false
            );
        }
        Assert.True(failures.Count == 0, "Cross-account access:\n" + string.Join("\n", failures));

        // The owner still sees everything, so the refusals above are about who asks, not broken endpoints.
        Assert.Contains(
            canary,
            (
                await Body(await coach.GetAsync($"/api/v1/training/programs/{programId}"))
            ).GetRawText()
        );
        Assert.Contains(
            canary,
            (
                await Body(await client.GetAsync($"/api/v1/training/workouts/{occurrenceId}"))
            ).GetRawText()
        );
        Assert.Contains(
            canary,
            (
                await Body(
                    await coach.GetAsync(
                        $"/api/v1/training/schedule?{period}&relationshipId={relationship}"
                    )
                )
            ).GetRawText()
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await coach.GetAsync($"/api/v1/training/executions/{executionId}/comparison")
            ).StatusCode
        );
        // The coach's list says how much of each logged workout was done, and when.
        var row = (
            await Body(
                await coach.GetAsync(
                    $"/api/v1/training/schedule?{period}&relationshipId={relationship}"
                )
            )
        )
            .GetProperty("items")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == occurrenceId);
        Assert.Equal(1, row.GetProperty("plannedSets").GetInt32());
        Assert.Equal(1, row.GetProperty("performedSets").GetInt32());
        Assert.Equal(JsonValueKind.String, row.GetProperty("completedAt").ValueKind);

        // After the coaching ends, the coach keeps read access to the workouts from that time; strangers still get nothing.
        var relationshipVersion = (
            await Body(await coach.GetAsync($"/api/v1/coaching/relationships/{relationship}"))
        )
            .GetProperty("version")
            .GetInt64();
        await Body(
            await Send(
                coach,
                HttpMethod.Post,
                $"/api/v1/coaching/relationships/{relationship}/complete",
                new { internalReason = "finished" },
                relationshipVersion
            )
        );
        Assert.Contains(
            canary,
            (
                await Body(
                    await coach.GetAsync(
                        $"/api/v1/training/workouts/{occurrenceId}?relationshipId={relationship}"
                    )
                )
            ).GetRawText()
        );
        Assert.Contains(
            canary,
            (
                await Body(await coach.GetAsync($"/api/v1/training/workouts/{occurrenceId}"))
            ).GetRawText()
        );
        Assert.Contains(
            canary,
            (
                await Body(
                    await coach.GetAsync(
                        $"/api/v1/training/schedule?{period}&relationshipId={relationship}"
                    )
                )
            ).GetRawText()
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await coach.GetAsync($"/api/v1/training/executions/{executionId}/comparison")
            ).StatusCode
        );
        Assert.Contains(
            canary,
            (
                await Body(await client.GetAsync($"/api/v1/training/workouts/{occurrenceId}"))
            ).GetRawText()
        );
        // Nothing can be logged any more.
        Assert.False(
            (
                await Send(
                    client,
                    HttpMethod.Post,
                    $"/api/v1/training/workouts/{otherOccurrenceId}/start",
                    null
                )
            ).IsSuccessStatusCode
        );
        var after = new List<string>();
        foreach (
            var (name, http) in new[]
            {
                ("unrelated coach", strangerCoach),
                ("unrelated client", strangerClient),
                ("other client of the same coach", sibling),
            }
        )
            await Expect(
                after,
                name,
                "GET workout after the coaching ended",
                await http.GetAsync($"/api/v1/training/workouts/{occurrenceId}"),
                secrets
            );
        Assert.True(after.Count == 0, string.Join("\n", after));
    }

    [TrainingPostgresFact]
    public async Task Check_ins_calendar_documentation_forms_messages_and_billing_are_never_visible_to_unrelated_accounts()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        var coachId = Guid.NewGuid();
        var clientId = Guid.NewGuid();
        var siblingId = Guid.NewGuid();
        var strangerCoachId = Guid.NewGuid();
        var strangerClientId = Guid.NewGuid();
        using var coach = await Onboard(factory, coachId, "Coach");
        using var client = await Onboard(factory, clientId, "Client");
        using var sibling = await Onboard(factory, siblingId, "Client");
        using var strangerCoach = await Onboard(factory, strangerCoachId, "Coach");
        using var strangerClient = await Onboard(factory, strangerClientId, "Client");
        Guid relationship;
        using (var scope = factory.Services.CreateScope())
        {
            var activation = scope.ServiceProvider.GetRequiredService<IRelationshipActivation>();
            relationship = await activation.ActivateDevFixtureAsync(coachId, clientId, default);
            await activation.ActivateDevFixtureAsync(coachId, siblingId, default);
            await activation.ActivateDevFixtureAsync(strangerCoachId, strangerClientId, default);
        }
        var canary = "Canary " + Guid.NewGuid().ToString("N");

        // A private check-in form, a schedule for the client and the client's submitted answers.
        var form = await Body(
            await coach.PostAsJsonAsync(
                "/api/v1/forms",
                new FormTemplateRequest(
                    FormPurpose.CheckIn,
                    canary + " form",
                    "Private check-in",
                    new([
                        new(
                            "main",
                            "Main",
                            0,
                            [new("answer", canary + " question", QuestionType.ShortText, true)]
                        ),
                    ])
                )
            )
        );
        var formId = form.GetProperty("id").GetGuid();
        var published = await Body(
            await Send(coach, HttpMethod.Post, $"/api/v1/forms/{formId}/publish", null, 1)
        );
        var schedule = await Body(
            await coach.PostAsJsonAsync(
                "/api/v1/check-ins/schedules",
                new ScheduleRequest(
                    formId,
                    canary + " schedule",
                    "Private",
                    "UTC",
                    new(
                        RecurrenceKind.OneTime,
                        1,
                        DateOnly.FromDateTime(DateTime.UtcNow),
                        new(0, 0)
                    ),
                    24,
                    [relationship],
                    []
                )
            )
        );
        var scheduleId = schedule.GetProperty("id").GetGuid();
        // The background job that opens due check-ins, run once here.
        using (var scope = factory.Services.CreateScope())
            await scope
                .ServiceProvider.GetRequiredService<CheckInsService>()
                .GenerateDueAsync(100, default);
        var request = (
            await Body(await client.GetAsync("/api/v1/check-ins/requests?role=client"))
        ).GetProperty("items")[0];
        var requestId = request.GetProperty("id").GetGuid();
        var answers = new SubmitCheckInRequest(
            new Dictionary<string, JsonElement>
            {
                ["answer"] = JsonSerializer.SerializeToElement(canary + " answer"),
            }
        );
        await Body(
            await Send(
                client,
                HttpMethod.Post,
                $"/api/v1/check-ins/requests/{requestId}/submit",
                answers,
                request.GetProperty("version").GetInt64()
            )
        );

        // A calendar event, a private note and a measurement for the client.
        var calendarEvent = await Body(
            await coach.PostAsJsonAsync(
                "/api/v1/calendar/events",
                new
                {
                    kind = "Meeting",
                    title = canary + " meeting",
                    description = "Private",
                    timeZone = "UTC",
                    startsAtUtc = DateTime.UtcNow.Date.AddDays(3).AddHours(10),
                    endsAtUtc = DateTime.UtcNow.Date.AddDays(3).AddHours(11),
                    relationshipIds = new[] { relationship },
                    groupIds = Array.Empty<Guid>(),
                }
            )
        );
        var eventId = calendarEvent.GetProperty("id").GetGuid();
        var documentation = $"/api/v1/coaching/relationships/{relationship}/documentation";
        var note = await Body(
            await coach.PostAsJsonAsync(
                documentation + "/notes",
                new NoteInput(canary + " note", canary + " title")
            )
        );
        var noteId = note.GetProperty("id").GetGuid();
        var measurement = await Body(
            await coach.PostAsJsonAsync(
                documentation + "/measurements",
                new MeasurementInput(
                    "weight",
                    "kg",
                    81.7m,
                    DateTimeOffset.UtcNow.AddHours(-1),
                    canary + " weigh-in"
                )
            )
        );
        var measurementId = measurement.GetProperty("id").GetGuid();

        // A direct message between coach and client.
        // Coach and client may message directly; this opens (or returns) their conversation.
        await coach.PostAsJsonAsync(
            "/api/v1/messaging/conversations/direct",
            new { userId = clientId }
        );
        var conversations = await Body(await coach.GetAsync("/api/v1/messaging/conversations"));
        Guid? conversationId = null;
        foreach (
            var item in (
                conversations.ValueKind == JsonValueKind.Array
                    ? conversations
                    : conversations.GetProperty("items")
            ).EnumerateArray()
        )
            if (item.GetRawText().Contains(clientId.ToString(), StringComparison.OrdinalIgnoreCase))
                conversationId = item.GetProperty("id").GetGuid();
        if (conversationId is { } cid)
            await Body(
                await Send(
                    coach,
                    HttpMethod.Post,
                    $"/api/v1/messaging/conversations/{cid}/messages",
                    new
                    {
                        type = "Text",
                        body = canary + " message",
                        mediaIds = Array.Empty<Guid>(),
                    },
                    null,
                    Guid.NewGuid().ToString()
                )
            );

        var secrets = new List<string>
        {
            canary,
            formId.ToString(),
            scheduleId.ToString(),
            requestId.ToString(),
            eventId.ToString(),
            noteId.ToString(),
            measurementId.ToString(),
        };
        if (conversationId is { } secret)
            secrets.Add(secret.ToString());
        var range =
            $"from={DateTime.UtcNow.AddDays(-2):yyyy-MM-dd}&to={DateTime.UtcNow.AddDays(10):yyyy-MM-dd}";
        var stamp = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(-2).ToString("O"));
        var stampTo = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(2).ToString("O"));
        var reads = new List<string>
        {
            $"/api/v1/forms/{formId}",
            $"/api/v1/forms/versions/{published.GetProperty("currentPublishedVersionId").GetGuid()}",
            $"/api/v1/check-ins/schedules/{scheduleId}",
            $"/api/v1/check-ins/requests/{requestId}",
            $"/api/v1/check-ins/requests?relationshipId={relationship}",
            $"/api/v1/check-ins/requests?scheduleId={scheduleId}",
            $"/api/v1/check-ins/requests?formTemplateId={formId}",
            $"/api/v1/check-ins/relationships/{relationship}/requests/{requestId}",
            $"/api/v1/check-ins/relationships/{relationship}/summary",
            $"/api/v1/calendar/events/{eventId}",
            $"/api/v1/calendar/events/{eventId}?role=coach",
            $"/api/v1/calendar/events?{range}",
            documentation,
            documentation + "/notes",
            documentation + $"/measurements?from={stamp}&to={stampTo}",
            documentation + $"/measurements/trend?key=weight&from={stamp}&to={stampTo}",
            documentation + "/documents",
            $"/api/v1/coaching/relationships/{relationship}",
            $"/api/v1/coaching/clients/{relationship}",
            $"/api/v1/coaching/relationships/{relationship}/billing",
        };
        if (conversationId is { } conv)
        {
            reads.Add($"/api/v1/messaging/conversations/{conv}");
            reads.Add($"/api/v1/messaging/conversations/{conv}/messages");
            reads.Add($"/api/v1/messaging/conversations/{conv}/members");
        }
        var hidden = secrets.ToArray();
        var failures = new List<string>();
        foreach (
            var (name, http) in new[]
            {
                ("unrelated coach", strangerCoach),
                ("unrelated client", strangerClient),
                ("other client of the same coach", sibling),
            }
        )
        {
            foreach (var path in reads)
                await Expect(failures, name, "GET " + path, await http.GetAsync(path), hidden);
            await Expect(
                failures,
                name,
                "POST submit check-in",
                await Send(
                    http,
                    HttpMethod.Post,
                    $"/api/v1/check-ins/requests/{requestId}/submit",
                    answers,
                    2
                ),
                hidden,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST review check-in",
                await Send(
                    http,
                    HttpMethod.Post,
                    $"/api/v1/check-ins/requests/{requestId}/review",
                    new { note = "x" },
                    2
                ),
                hidden,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST pause schedule",
                await Send(
                    http,
                    HttpMethod.Post,
                    $"/api/v1/check-ins/schedules/{scheduleId}/pause",
                    null,
                    1
                ),
                hidden,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST cancel event",
                await Send(
                    http,
                    HttpMethod.Post,
                    $"/api/v1/calendar/events/{eventId}/cancel",
                    new { reason = "x" },
                    1
                ),
                hidden,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST unpublish form",
                await Send(http, HttpMethod.Post, $"/api/v1/forms/{formId}/unpublish", null, 2),
                hidden,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "PATCH form",
                await Send(
                    http,
                    HttpMethod.Patch,
                    $"/api/v1/forms/{formId}",
                    new FormTemplateRequest(
                        FormPurpose.CheckIn,
                        "stolen",
                        "",
                        new([
                            new(
                                "main",
                                "Main",
                                0,
                                [new("answer", "q", QuestionType.ShortText, true)]
                            ),
                        ])
                    ),
                    2
                ),
                hidden,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST note",
                await http.PostAsJsonAsync(documentation + "/notes", new NoteInput("planted")),
                hidden,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "PATCH note",
                await Send(
                    http,
                    HttpMethod.Patch,
                    documentation + $"/notes/{noteId}",
                    new NoteInput("changed"),
                    1
                ),
                hidden,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST measurement",
                await http.PostAsJsonAsync(
                    documentation + "/measurements",
                    new MeasurementInput("weight", "kg", 50m, DateTimeOffset.UtcNow, null)
                ),
                hidden,
                readOnly: false
            );
            await Expect(
                failures,
                name,
                "POST suspend relationship",
                await Send(
                    http,
                    HttpMethod.Post,
                    $"/api/v1/coaching/relationships/{relationship}/suspend",
                    new { internalReason = "x" },
                    1
                ),
                hidden,
                readOnly: false
            );
            if (conversationId is { } target)
                await Expect(
                    failures,
                    name,
                    "POST message",
                    await Send(
                        http,
                        HttpMethod.Post,
                        $"/api/v1/messaging/conversations/{target}/messages",
                        new
                        {
                            type = "Text",
                            body = "planted",
                            mediaIds = Array.Empty<Guid>(),
                        },
                        null,
                        Guid.NewGuid().ToString()
                    ),
                    hidden,
                    readOnly: false
                );
        }
        Assert.True(failures.Count == 0, "Cross-account access:\n" + string.Join("\n", failures));
        Assert.True(conversationId != null, "The coach and client should share a conversation.");
        // The owner can take the form out of use and publish it again.
        var unpublished = await Body(
            await Send(
                coach,
                HttpMethod.Post,
                $"/api/v1/forms/{formId}/unpublish",
                null,
                published.GetProperty("version").GetInt64()
            )
        );
        Assert.Equal(
            JsonValueKind.Null,
            unpublished.GetProperty("currentPublishedVersionId").ValueKind
        );
        var republished = await Body(
            await Send(
                coach,
                HttpMethod.Post,
                $"/api/v1/forms/{formId}/publish",
                null,
                unpublished.GetProperty("version").GetInt64()
            )
        );
        Assert.Equal(
            JsonValueKind.String,
            republished.GetProperty("currentPublishedVersionId").ValueKind
        );
        Assert.Contains(
            canary,
            (
                await Body(await client.GetAsync($"/api/v1/check-ins/requests/{requestId}"))
            ).GetRawText()
        );
        Assert.Contains(
            canary,
            (await Body(await coach.GetAsync(documentation + "/notes"))).GetRawText()
        );
        Assert.Contains(
            canary,
            (
                await Body(await coach.GetAsync($"/api/v1/calendar/events/{eventId}?role=coach"))
            ).GetRawText()
        );
        Assert.Contains(
            canary,
            (
                await Body(
                    await client.GetAsync(
                        $"/api/v1/messaging/conversations/{conversationId}/messages"
                    )
                )
            ).GetRawText()
        );
    }

    /// <summary>A refusal, or (for reads of filtered lists) a success that contains none of the owner's data.</summary>
    private static async Task Expect(
        List<string> failures,
        string who,
        string what,
        HttpResponseMessage response,
        string[] secrets,
        bool readOnly = true
    )
    {
        var status = (int)response.StatusCode;
        var text = await response.Content.ReadAsStringAsync();
        // Error bodies may echo the requested path; only a successful body can carry the owner's data.
        var leaked = response.IsSuccessStatusCode
            ? secrets.FirstOrDefault(secret =>
                text.Contains(secret, StringComparison.OrdinalIgnoreCase)
            )
            : null;
        if (leaked != null)
            failures.Add($"{who} · {what} → {status}, response contains {leaked}");
        else if (!readOnly && response.IsSuccessStatusCode)
            failures.Add($"{who} · {what} → {status}, the write was accepted");
        else if (status >= 500)
            failures.Add($"{who} · {what} → {status} (server error)");
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
                    username = "xa" + id.ToString("N")[..20],
                    displayName = "Access " + id.ToString("N")[..10],
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
                        idempotencyKey = "access-fixture-pro",
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
