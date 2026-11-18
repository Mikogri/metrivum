using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Coaching.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class CalendarTests
{
    [CatalogPostgresFact]
    public async Task List_groups_attendees_per_event_and_keeps_client_rosters_private()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        var coach = await User(factory, "Coach");
        var first = await User(factory, "Client");
        var second = await User(factory, "Client");
        using var coachHttp = coach.Http;
        using var firstHttp = first.Http;
        using var secondHttp = second.Http;
        Guid firstRelationship;
        Guid secondRelationship;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var activation = scope.ServiceProvider.GetRequiredService<IRelationshipActivation>();
            firstRelationship = await activation.ActivateDevFixtureAsync(
                coach.Id,
                first.Id,
                default
            );
            secondRelationship = await activation.ActivateDevFixtureAsync(
                coach.Id,
                second.Id,
                default
            );
        }
        var expected = new Dictionary<Guid, Guid[]>();
        foreach (
            var recipients in new[]
            {
                new[] { firstRelationship },
                new[] { secondRelationship },
                new[] { firstRelationship, secondRelationship },
                Array.Empty<Guid>(),
            }
        )
        {
            using var created = await coach.Http.PostAsJsonAsync(
                "/api/v1/calendar/events",
                new
                {
                    kind = "Meeting",
                    title = "Roster test",
                    timeZone = "UTC",
                    startsAtUtc = "2026-11-04T12:00:00Z",
                    endsAtUtc = "2026-11-04T13:00:00Z",
                    relationshipIds = recipients,
                    groupIds = Array.Empty<Guid>(),
                }
            );
            created.EnsureSuccessStatusCode();
            var item = await created.Content.ReadFromJsonAsync<JsonElement>();
            expected.Add(item.GetProperty("id").GetGuid(), recipients);
        }
        const string query =
            "/api/v1/calendar/events?from=2026-11-04T00:00:00Z&to=2026-11-05T00:00:00Z&timeZone=UTC&pageSize=100&role=";
        var coachList = await coach.Http.GetFromJsonAsync<JsonElement>(query + "coach");
        Assert.Equal(4, coachList.GetProperty("total").GetInt32());
        foreach (var item in coachList.GetProperty("items").EnumerateArray())
        {
            Assert.Equal(
                expected[item.GetProperty("id").GetGuid()].Order(),
                item.GetProperty("attendees")
                    .EnumerateArray()
                    .Select(a => a.GetProperty("relationshipId").GetGuid())
                    .Order()
            );
        }
        foreach (
            var (http, relationship) in new[]
            {
                (first.Http, firstRelationship),
                (second.Http, secondRelationship),
            }
        )
        {
            var clientList = await http.GetFromJsonAsync<JsonElement>(query + "client");
            Assert.Equal(2, clientList.GetProperty("total").GetInt32());
            foreach (var item in clientList.GetProperty("items").EnumerateArray())
            {
                Assert.Contains(relationship, expected[item.GetProperty("id").GetGuid()]);
                Assert.Equal("Pending", item.GetProperty("response").GetString());
                Assert.False(
                    item.TryGetProperty("attendees", out var roster)
                        && roster.ValueKind == JsonValueKind.Array
                        && roster.GetArrayLength() > 0
                );
            }
        }
    }

    [CatalogPostgresFact]
    public async Task Events_persist_invites_are_private_and_stale_responses_fail()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        var coach = await User(factory, "Coach");
        var client = await User(factory, "Client");
        var stranger = await User(factory, "Client");
        Guid relationship;
        await using (var scope = factory.Services.CreateAsyncScope())
            relationship = await scope
                .ServiceProvider.GetRequiredService<IRelationshipActivation>()
                .ActivateDevFixtureAsync(coach.Id, client.Id, default);
        object Write(int hour) =>
            new
            {
                kind = "Meeting",
                title = "Technique review",
                description = "Discuss progress",
                timeZone = "Europe/Warsaw",
                startsAtUtc = $"2026-11-04T{hour:00}:00:00Z",
                endsAtUtc = $"2026-11-04T{hour + 1:00}:00:00Z",
                relationshipIds = new[] { relationship },
                groupIds = Array.Empty<Guid>(),
            };
        var created = await coach.Http.PostAsJsonAsync("/api/v1/calendar/events", Write(10));
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var value = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = value.GetProperty("id").GetGuid();
        var path = $"/api/v1/calendar/events/{id}";
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.Http.GetAsync(path + "?role=client")).StatusCode
        );
        var detail = await client.Http.GetFromJsonAsync<JsonElement>(path + "?role=client");
        Assert.Equal("Pending", detail.GetProperty("response").GetString());
        Assert.False(
            detail.TryGetProperty("attendees", out var peers)
                && peers.ValueKind == JsonValueKind.Array
                && peers.GetArrayLength() > 0
        );
        async Task<HttpResponseMessage> Mutate(
            HttpClient http,
            HttpMethod method,
            string url,
            object body,
            string version
        )
        {
            using var request = new HttpRequestMessage(method, url)
            {
                Content = JsonContent.Create(body),
            };
            request.Headers.TryAddWithoutValidation("If-Match", version);
            return await http.SendAsync(request);
        }
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    client.Http,
                    HttpMethod.Post,
                    path + "/response",
                    new { status = "Accepted" },
                    "\"1\""
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (await Mutate(coach.Http, HttpMethod.Patch, path, Write(11), "\"1\"")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.PreconditionFailed,
            (
                await Mutate(
                    client.Http,
                    HttpMethod.Post,
                    path + "/response",
                    new { status = "Accepted" },
                    "\"2\""
                )
            ).StatusCode
        );
        detail = await client.Http.GetFromJsonAsync<JsonElement>(path + "?role=client");
        Assert.Equal("Pending", detail.GetProperty("response").GetString());
        var range = await client.Http.GetFromJsonAsync<JsonElement>(
            "/api/v1/calendar/events?role=client&from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z"
        );
        Assert.Contains(
            range.GetProperty("items").EnumerateArray(),
            e => e.GetProperty("id").GetGuid() == id
        );
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.Http.PostAsJsonAsync("/api/v1/calendar/events", Write(10))).StatusCode
        );
        Assert.Equal(
            (HttpStatusCode)428,
            (await coach.Http.PostAsync(path + "/cancel", null)).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (
                await coach.Http.GetAsync(
                    "/api/v1/calendar/events?role=coach&from=2026-01-01&to=2028-01-01"
                )
            ).StatusCode
        );
        var race = await Task.WhenAll(
            Mutate(
                client.Http,
                HttpMethod.Post,
                path + "/response",
                new { status = "Accepted" },
                "\"3\""
            ),
            Mutate(
                client.Http,
                HttpMethod.Post,
                path + "/response",
                new { status = "Declined" },
                "\"3\""
            )
        );
        Assert.Single(race, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(race, r => r.StatusCode == HttpStatusCode.PreconditionFailed);
        var allDay = await coach.Http.PostAsJsonAsync(
            "/api/v1/calendar/events",
            new
            {
                kind = "Event",
                title = "DST day",
                timeZone = "Europe/Warsaw",
                startDate = "2026-03-29",
                endDateExclusive = "2026-03-30",
                relationshipIds = Array.Empty<Guid>(),
                groupIds = Array.Empty<Guid>(),
            }
        );
        Assert.Equal(HttpStatusCode.OK, allDay.StatusCode);
        var day = await allDay.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(
            TimeSpan.FromHours(23),
            day.GetProperty("endsAtUtc").GetDateTimeOffset()
                - day.GetProperty("startsAtUtc").GetDateTimeOffset()
        );

        var group = await (
            await coach.Http.PostAsJsonAsync(
                "/api/v1/coaching/groups",
                new
                {
                    name = "Calendar group",
                    description = "",
                    color = "#123456",
                }
            )
        ).Content.ReadFromJsonAsync<JsonElement>();
        var groupId = group.GetProperty("id").GetGuid();
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    HttpMethod.Put,
                    $"/api/v1/coaching/groups/{groupId}/members/{relationship}",
                    new { },
                    "\"1\""
                )
            ).StatusCode
        );
        var groupEvent = await coach.Http.PostAsJsonAsync(
            "/api/v1/calendar/events",
            new
            {
                kind = "Meeting",
                title = "Group session",
                timeZone = "UTC",
                startsAtUtc = "2026-11-04T12:00:00Z",
                endsAtUtc = "2026-11-04T13:00:00Z",
                relationshipIds = new[] { relationship },
                groupIds = new[] { groupId },
            }
        );
        Assert.Equal(HttpStatusCode.OK, groupEvent.StatusCode);
        var groupDto = await groupEvent.Content.ReadFromJsonAsync<JsonElement>();
        var groupEventId = groupDto.GetProperty("id").GetGuid();
        Assert.Single(groupDto.GetProperty("attendees").EnumerateArray());
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    HttpMethod.Delete,
                    $"/api/v1/coaching/groups/{groupId}/members/{relationship}",
                    new { },
                    "\"2\""
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await client.Http.GetAsync($"/api/v1/calendar/events/{groupEventId}?role=client")
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    HttpMethod.Post,
                    $"/api/v1/coaching/relationships/{relationship}/suspend",
                    new { internalReason = "Private" },
                    "\"1\""
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    HttpMethod.Patch,
                    $"/api/v1/calendar/events/{groupEventId}",
                    Write(12),
                    "\"1\""
                )
            ).StatusCode
        );
        var historical = await client.Http.GetFromJsonAsync<JsonElement>(
            $"/api/v1/calendar/events/{groupEventId}?role=client"
        );
        Assert.Equal("Calendar test", historical.GetProperty("organizerName").GetString());
        Assert.Equal(
            HttpStatusCode.Conflict,
            (
                await Mutate(
                    client.Http,
                    HttpMethod.Post,
                    $"/api/v1/calendar/events/{groupEventId}/response",
                    new { status = "Accepted" },
                    "\"2\""
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    HttpMethod.Patch,
                    $"/api/v1/calendar/events/{groupEventId}",
                    new
                    {
                        kind = "Meeting",
                        title = "Private event",
                        timeZone = "UTC",
                        startsAtUtc = "2026-11-04T12:00:00Z",
                        endsAtUtc = "2026-11-04T13:00:00Z",
                        relationshipIds = Array.Empty<Guid>(),
                        groupIds = Array.Empty<Guid>(),
                    },
                    "\"2\""
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await client.Http.GetAsync($"/api/v1/calendar/events/{groupEventId}?role=client")
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(coach.Http, HttpMethod.Post, path + "/cancel", new { }, "\"2\"")
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.Conflict,
            (
                await Mutate(
                    client.Http,
                    HttpMethod.Post,
                    path + "/response",
                    new { status = "Accepted" },
                    "\"4\""
                )
            ).StatusCode
        );
        Assert.Equal(
            (HttpStatusCode)412,
            (
                await Mutate(coach.Http, HttpMethod.Post, path + "/restore", new { }, "\"2\"")
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(coach.Http, HttpMethod.Post, path + "/restore", new { }, "\"3\"")
            ).StatusCode
        );
        var restored = await (
            await client.Http.GetAsync(path + "?role=client")
        ).Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(restored.GetProperty("cancelled").GetBoolean());
        Assert.Equal("Pending", restored.GetProperty("response").GetString());
    }

    private static async Task<(HttpClient Http, Guid Id)> User(ApiFactory factory, string role)
    {
        var id = Guid.NewGuid();
        var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
        var result = await http.PutAsJsonAsync(
            "/api/v1/me/onboarding",
            new
            {
                username = "cal" + id.ToString("N")[..18],
                displayName = "Calendar test",
                birthDate = "1990-01-01",
                acceptedTerms = true,
                locale = "en",
                timeZone = "UTC",
                role,
            }
        );
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        return (http, id);
    }
}
