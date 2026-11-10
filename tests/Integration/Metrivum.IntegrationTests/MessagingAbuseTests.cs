using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Messaging.Contracts;
using Metrivum.Messaging.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class MessagingAbuseTests
{
    private const string Root = "/api/v1/messaging";
    private static string Database =>
        Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;

    [CatalogPostgresFact]
    public async Task New_sender_distinct_contacts_are_atomic_and_survive_host_restart()
    {
        Guid senderId;
        using var first = new ApiFactory(Database);
        var sender = await User(first);
        senderId = sender.Id;
        var recipients = new List<Guid>();
        for (var i = 0; i < 5; i++)
            recipients.Add((await User(first)).Id);
        var responses = await Task.WhenAll(
            recipients.Select(id =>
                sender.Http.PostAsJsonAsync(
                    Root + "/requests",
                    new { userId = id, body = "Introduction" }
                )
            )
        );
        Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.OK));
        Assert.Equal(2, responses.Count(x => x.StatusCode == HttpStatusCode.TooManyRequests));
        await using var db = Db();
        Assert.Equal(
            3,
            await db.AbuseRecords.CountAsync(x => x.UserId == senderId && x.Kind == "contact")
        );
        Assert.Equal(3, await db.Messages.CountAsync(x => x.SenderUserId == senderId));
        using var restarted = new ApiFactory(Database);
        using var retry = restarted.CreateClient();
        retry.DefaultRequestHeaders.Authorization = new("Bearer", restarted.Token(senderId));
        var deniedRecipient = recipients[
            Array.FindIndex(responses, x => x.StatusCode == HttpStatusCode.TooManyRequests)
        ];
        var denied = await retry.PostAsJsonAsync(
            Root + "/requests",
            new { userId = deniedRecipient, body = "After restart" }
        );
        Assert.Equal(HttpStatusCode.TooManyRequests, denied.StatusCode);
        Assert.NotNull(denied.Headers.RetryAfter);
    }

    [CatalogPostgresFact]
    public async Task Existing_relationship_is_exempt_and_established_sender_has_five_strangers_per_hour()
    {
        using var factory = new ApiFactory(Database);
        var sender = await User(factory, "Coach");
        var client = await User(factory);
        using (var scope = factory.Services.CreateScope())
            await scope
                .ServiceProvider.GetRequiredService<IRelationshipActivation>()
                .ActivateDevFixtureAsync(sender.Id, client.Id, default);
        for (var i = 0; i < 5; i++)
        {
            var stranger = await User(factory);
            await Ok(
                sender.Http.PostAsJsonAsync(
                    Root + "/requests",
                    new { userId = stranger.Id, body = "Introduction" }
                )
            );
        }
        var sixth = await User(factory);
        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            (
                await sender.Http.PostAsJsonAsync(
                    Root + "/requests",
                    new { userId = sixth.Id, body = "Denied" }
                )
            ).StatusCode
        );
        await Ok(
            sender.Http.PostAsJsonAsync(
                Root + "/requests",
                new { userId = client.Id, body = "Active client" }
            )
        );
        await using var db = Db();
        Assert.Equal(
            5,
            await db.AbuseRecords.CountAsync(x => x.UserId == sender.Id && x.Kind == "contact")
        );
    }

    [CatalogPostgresFact]
    public async Task Sender_message_bucket_is_shared_by_conversations_and_MCP_and_idempotent_retries_are_free()
    {
        using var factory = new ApiFactory(Database);
        var sender = await User(factory, "Coach");
        var recipient = await User(factory);
        var chat = (
            await Ok(
                sender.Http.PostAsJsonAsync(
                    Root + "/conversations/direct",
                    new { userId = recipient.Id }
                )
            )
        )
            .GetProperty("id")
            .GetGuid();
        var otherChat = (
            await Ok(
                sender.Http.PostAsJsonAsync(
                    Root + "/conversations/group",
                    new { title = "Own notes", userIds = Array.Empty<Guid>() }
                )
            )
        )
            .GetProperty("id")
            .GetGuid();
        var key = Guid.NewGuid().ToString();
        var policy = factory
            .Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<AbuseProtectionOptions>>()
            .Value.Policies[AbusePolicies.Message];
        Assert.Equal(40, policy.Permits);
        Assert.Equal(60, policy.WindowSeconds);
        Assert.Equal(30, policy.Refill);
        // The shared-budget assertion must not race gradual token replenishment during real SQL writes.
        // Keep the production defaults asserted above, but lengthen this isolated host's test window.
        policy.WindowSeconds = 3600;
        Assert.Same(
            factory.Services.GetRequiredService<AbuseProtection>(),
            factory.Services.GetRequiredService<IAbuseProtection>()
        );
        for (var i = 0; i < 40; i++)
            await Ok(
                Send(
                    sender.Http,
                    i % 2 == 0 ? chat : otherChat,
                    i == 0 ? key : Guid.NewGuid().ToString()
                )
            );
        await Ok(Send(sender.Http, chat, key));
        await using (var verify = Db())
            Assert.Equal(40, await verify.Messages.CountAsync(x => x.SenderUserId == sender.Id));
        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            (await Send(sender.Http, otherChat, Guid.NewGuid().ToString())).StatusCode
        );
        using var scope = factory.Services.CreateScope();
        // Resolve under a verified account through HTTP above; a direct scoped call needs the same account principal.
        var context =
            scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Http.IHttpContextAccessor>();
        context.HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext
        {
            User = new System.Security.Claims.ClaimsPrincipal(
                new System.Security.Claims.ClaimsIdentity(
                    [
                        new("sub", sender.Id.ToString()),
                        new(System.Security.Claims.ClaimTypes.NameIdentifier, sender.Id.ToString()),
                    ],
                    "test"
                )
            ),
        };
        var mcp = scope.ServiceProvider.GetRequiredService<IMcpMessageOperations>();
        var publisher = scope.ServiceProvider.GetRequiredService<ICoachingChatPublisher>();
        var publisherError = await Assert.ThrowsAsync<Metrivum.BuildingBlocks.ApiException>(() =>
            publisher.PublishAsync(
                recipient.Id,
                "share:" + Guid.NewGuid(),
                new("Offer", null, Guid.NewGuid(), sender.Id, Guid.NewGuid(), null, "Shared offer"),
                null,
                default
            )
        );
        Assert.Equal(429, publisherError.Status);
        var preview = await mcp.PreviewAsync(chat, default);
        var error = await Assert.ThrowsAsync<Metrivum.BuildingBlocks.ApiException>(() =>
            mcp.SendAsync(chat, "Hello", preview.ContextHash, Guid.NewGuid().ToString(), default)
        );
        Assert.Equal(429, error.Status);
        await using var db = Db();
        Assert.Equal(40, await db.Messages.CountAsync(x => x.SenderUserId == sender.Id));
    }

    [CatalogPostgresFact]
    public async Task Group_daily_budget_is_durable_and_duplicate_recipients_do_not_consume_distinct_contacts()
    {
        using var factory = new ApiFactory(Database);
        var sender = await User(factory, "Coach");
        var recipient = await User(factory);
        for (var i = 0; i < 20; i++)
            await Ok(
                sender.Http.PostAsJsonAsync(
                    Root + "/conversations/group",
                    new { title = "Group", userIds = new[] { recipient.Id, recipient.Id } }
                )
            );
        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            (
                await sender.Http.PostAsJsonAsync(
                    Root + "/conversations/group",
                    new { title = "Denied", userIds = Array.Empty<Guid>() }
                )
            ).StatusCode
        );
        var coachingGroup = (
            await Ok(
                sender.Http.PostAsJsonAsync(
                    "/api/v1/coaching/groups",
                    new
                    {
                        name = "Linked budget",
                        description = "",
                        color = "#123456",
                    }
                )
            )
        ).GetProperty("id").GetGuid();
        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            (
                await sender.Http.PostAsync(
                    $"/api/v1/coaching/groups/{coachingGroup}/conversation",
                    null
                )
            ).StatusCode
        );
        await using var db = Db();
        Assert.Equal(
            20,
            await db.AbuseRecords.CountAsync(x => x.UserId == sender.Id && x.Kind == "group")
        );
        Assert.Equal(
            1,
            await db.AbuseRecords.CountAsync(x => x.UserId == sender.Id && x.Kind == "contact")
        );
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (
                await sender.Http.PostAsJsonAsync(
                    Root + "/conversations/group",
                    new
                    {
                        title = "Too many",
                        userIds = Enumerable.Range(0, 101).Select(_ => Guid.NewGuid()).ToArray(),
                    }
                )
            ).StatusCode
        );
    }

    private static MessagingDbContext Db() =>
        new(new DbContextOptionsBuilder<MessagingDbContext>().UseNpgsql(Database).Options);

    private static Task<HttpResponseMessage> Send(HttpClient http, Guid chat, string key)
    {
        var request = new HttpRequestMessage(
            HttpMethod.Post,
            Root + $"/conversations/{chat}/messages"
        )
        {
            Content = JsonContent.Create(
                new
                {
                    type = "Text",
                    body = "Hello",
                    mediaIds = Array.Empty<Guid>(),
                }
            ),
        };
        request.Headers.Add("Idempotency-Key", key);
        return http.SendAsync(request);
    }

    private static async Task<(Guid Id, HttpClient Http)> User(
        ApiFactory factory,
        string role = "Client"
    )
    {
        var id = Guid.NewGuid();
        var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
        await Ok(
            http.PutAsJsonAsync(
                "/api/v1/me/onboarding",
                new
                {
                    username = $"ab{id:N}"[..30],
                    displayName = "Synthetic abuse test",
                    birthDate = "1990-01-01",
                    acceptedTerms = true,
                    locale = "en",
                    timeZone = "UTC",
                    role,
                }
            )
        );
        return (id, http);
    }

    private static async Task<JsonElement> Ok(Task<HttpResponseMessage> operation)
    {
        using var response = await operation;
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {body}");
        return JsonSerializer.Deserialize<JsonElement>(body);
    }
}
