using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.BuildingBlocks;
using TrainFlow.Notifications;
using TrainFlow.Notifications.Contracts;
namespace TrainFlow.IntegrationTests;

public sealed class NotificationsTests
{
    private static string Database => Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
    private static HttpClient Client(ApiFactory f, Guid user)
    {
        var h = f.CreateClient();
        h.DefaultRequestHeaders.Authorization = new("Bearer", f.Token(user));
        return h;
    }
    private static async Task Onboard(ApiFactory factory, Guid id)
    {
        using var http = Client(factory, id);
        var response = await http.PutAsJsonAsync("/api/v1/me/onboarding", new
        {
            username = "notification" + id.ToString("N")[..15],
            displayName = "Notification test",
            birthDate = "1990-01-01",
            acceptedTerms = true,
            locale = "en",
            timeZone = "UTC",
            role = "Client"
        });
        response.EnsureSuccessStatusCode();
    }
    private static async Task Publish(ApiFactory f, NotificationEvent e)
    {
        using var scope = f.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<INotificationPublisher>().PublishAsync(e, default);
    }
    [CatalogPostgresFact]
    public async Task Concurrent_retries_and_rollback_preserve_one_durable_event()
    {
        using var f = new ApiFactory(Database);
        var user = Guid.NewGuid();
        var e = new NotificationEvent(user, "test:" + Guid.NewGuid(), "PaymentConfirmed", "Billing", "Billing", Guid.NewGuid(), "/app/subscription", Required: true);
        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Publish(f, e)));
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
        Assert.Equal(1, await db.Notifications.CountAsync(x => x.RecipientUserId == user));
        var rollback = e with
        {
            EventKey = "rollback:" + Guid.NewGuid()
        };
        await Assert.ThrowsAsync<InvalidOperationException>(() => scope.ServiceProvider.GetRequiredService<ModuleTransaction>().RunAsync(async ct => { await scope.ServiceProvider.GetRequiredService<INotificationPublisher>().PublishAsync(rollback, ct); throw new InvalidOperationException("rollback"); }, default));
        Assert.False(await db.Notifications.AnyAsync(x => x.EventKey == rollback.EventKey));
    }
    [CatalogPostgresFact]
    public async Task Read_readall_count_and_pagination_are_recipient_scoped()
    {
        using var f = new ApiFactory(Database);
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        await Onboard(f, a);
        await Onboard(f, b);
        using var ha = Client(f, a);
        using var hb = Client(f, b);
        await Publish(f, new(a, "own:" + Guid.NewGuid(), "MessageCreated", "Messaging", "Messaging", Guid.NewGuid(), "/app/messages"));
        await Publish(f, new(b, "other:" + Guid.NewGuid(), "MessageCreated", "Messaging", "Messaging", Guid.NewGuid(), "/app/messages"));
        var list = await ha.GetFromJsonAsync<NotificationPage>("/api/v1/me/notifications?page=1&pageSize=1");
        var own = Assert.Single(list!.Items);
        Assert.Null(own.ReadAt);
        Assert.Equal(HttpStatusCode.NotFound, (await hb.PostAsync($"/api/v1/me/notifications/{own.Id}/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await hb.PostAsync("/api/v1/me/notifications/read-all", null)).StatusCode);
        Assert.Equal(1, (await ha.GetFromJsonAsync<NotificationCountDto>("/api/v1/me/notifications/unread-count"))!.Count);
        await ha.PostAsync($"/api/v1/me/notifications/{own.Id}/read", null);
        Assert.Equal(0, (await ha.GetFromJsonAsync<NotificationCountDto>("/api/v1/me/notifications/unread-count"))!.Count);
        using var anonymous = f.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/me/notifications")).StatusCode);
    }
    [CatalogPostgresFact]
    public async Task Future_reminders_are_persisted_offline_and_submission_cancels_them()
    {
        using var f = new ApiFactory(Database);
        var user = Guid.NewGuid();
        var source = Guid.NewGuid();
        await Publish(f, new(user, "future:" + Guid.NewGuid(), "CheckInOverdue", "CheckIns", "CheckIns", source, "/app/check-ins/" + source, DateTimeOffset.UtcNow.AddDays(1)));
        await Onboard(f, user);
        using var h = Client(f, user);
        Assert.Equal(0, (await h.GetFromJsonAsync<NotificationCountDto>("/api/v1/me/notifications/unread-count"))!.Count);
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
        Assert.Equal(1, await db.Notifications.CountAsync(x => x.SourceId == source));
        await scope.ServiceProvider.GetRequiredService<INotificationPublisher>().CancelScheduledAsync("CheckIns", source, default);
        Assert.True(await db.Notifications.Where(x => x.SourceId == source).Select(x => x.Cancelled).SingleAsync());
    }
    [CatalogPostgresFact]
    public async Task Suppressed_events_keep_dedupe_identity_and_billing_cannot_be_muted()
    {
        using var f = new ApiFactory(Database);
        var user = Guid.NewGuid();
        await Onboard(f, user);
        using var h = Client(f, user);
        Assert.Equal(HttpStatusCode.NoContent, (await h.PatchAsJsonAsync("/api/v1/me/notification-preferences", new PreferenceRequest(false, false, false, false))).StatusCode);
        var e = new NotificationEvent(user, "muted:" + Guid.NewGuid(), "MessageCreated", "Messaging", "Messaging", Guid.NewGuid());
        await Publish(f, e);
        await h.PatchAsJsonAsync("/api/v1/me/notification-preferences", new PreferenceRequest(true, true, true, true));
        await Publish(f, e);
        Assert.Equal(0, (await h.GetFromJsonAsync<NotificationCountDto>("/api/v1/me/notifications/unread-count"))!.Count);
        await Publish(f, e with
        {
            EventKey = "bill:" + Guid.NewGuid(),
            Type = "PaymentConfirmed",
            Category = "Billing",
            Required = true
        });
        Assert.Equal(1, (await h.GetFromJsonAsync<NotificationCountDto>("/api/v1/me/notifications/unread-count"))!.Count);
    }
    [CatalogPostgresFact]
    public async Task Genuine_messages_notify_only_current_authorized_members_and_never_store_body()
    {
        using var f = new ApiFactory(Database);
        async Task<(Guid Id, HttpClient Http)> User()
        {
            var id = Guid.NewGuid();
            var h = Client(f, id);
            var response = await h.PutAsJsonAsync("/api/v1/me/onboarding", new
            {
                username = "n" + id.ToString("N")[..25],
                displayName = "Notification test",
                birthDate = "1990-01-01",
                acceptedTerms = true,
                locale = "en",
                timeZone = "UTC",
                role = "Coach"
            });
            response.EnsureSuccessStatusCode();
            return (id, h);
        }
        var a = await User();
        var b = await User();
        var c = await User();
        var create = await a.Http.PostAsJsonAsync("/api/v1/messaging/conversations/group", new
        {
            title = "Private",
            userIds = new[] { b.Id, c.Id }
        });
        create.EnsureSuccessStatusCode();
        var chat = (await create.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        async Task Send()
        {
            var r = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/messaging/conversations/{chat}/messages") { Content = JsonContent.Create(new { type = "Text", body = "Sensitive body must never enter notification", mediaIds = Array.Empty<Guid>() }) };
            r.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
            (await a.Http.SendAsync(r)).EnsureSuccessStatusCode();
        }
        await Send();
        (await a.Http.DeleteAsync($"/api/v1/messaging/conversations/{chat}/members/{c.Id}")).EnsureSuccessStatusCode();
        await Send();
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
        var rows = await db.Notifications.AsNoTracking().Where(x => x.SourceId == chat && x.Type == "MessageCreated").ToArrayAsync();
        Assert.DoesNotContain(rows, x => x.RecipientUserId == a.Id);
        Assert.Equal(2, rows.Count(x => x.RecipientUserId == b.Id));
        Assert.Single(rows, x => x.RecipientUserId == c.Id);
        var json = System.Text.Json.JsonSerializer.Serialize(rows);
        Assert.DoesNotContain("Sensitive body", json);
        Assert.Equal(0, (await b.Http.GetFromJsonAsync<NotificationCountDto>($"/api/v1/me/notifications/unread-count?activeConversation={chat}"))!.Count);
    }

    [CatalogPostgresFact]
    public async Task Persisted_outbox_delivers_to_authenticated_live_subscriber_after_restart()
    {
        using var f = new ApiFactory(Database);
        var user = Guid.NewGuid();
        var source = Guid.NewGuid();
        await Onboard(f, user);
        var client = f.Server.CreateWebSocketClient();
        using var socket = await client.ConnectAsync(new Uri("ws://localhost/api/v1/notifications/hub?access_token=" + Uri.EscapeDataString(f.Token(user))), default);
        var handshake = System.Text.Encoding.UTF8.GetBytes("{\"protocol\":\"json\",\"version\":1}\u001e");
        await socket.SendAsync(handshake, System.Net.WebSockets.WebSocketMessageType.Text, true, default);
        async Task<string> Receive()
        {
            var buffer = new byte[8192];
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var frame = await socket.ReceiveAsync(buffer, timeout.Token);
            return System.Text.Encoding.UTF8.GetString(buffer, 0, frame.Count);
        }
        Assert.Contains("{}", await Receive());
        await Publish(f, new(user, "live:" + source, "PaymentConfirmed", "Billing", "Billing", source, "/app/subscription", Required: true));
        for (var i = 0; i < 50; i++)
        {
            using var scope = f.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<NotificationsDelivery>().DeliverAsync(default);
            if (await scope.ServiceProvider.GetRequiredService<NotificationsDbContext>().Notifications.AnyAsync(x => x.SourceId == source && x.DeliveredAt != null))
                break;
        }
        var payload = await Receive();
        Assert.Contains("NotificationCreated", payload);
        Assert.Contains(source.ToString(), payload);
        Assert.DoesNotContain("recipientUserId", payload);
        using (var scope = f.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<NotificationsDelivery>().DeliverAsync(default);
            Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<NotificationsDbContext>().Notifications.CountAsync(x => x.SourceId == source));
        }
    }

    [CatalogPostgresFact]
    public async Task Notification_routes_require_active_onboarded_account_without_role_specific_restriction()
    {
        using var factory = new ApiFactory(Database);
        var user = Guid.NewGuid();
        using var http = Client(factory, user);
        foreach (var path in new[] { "/api/v1/me/notifications", "/api/v1/me/notifications/unread-count", "/api/v1/me/notification-preferences" })
        {
            var response = await http.GetAsync(path);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Contains("ONBOARDING_REQUIRED", await response.Content.ReadAsStringAsync());
        }
        await Onboard(factory, user);
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/api/v1/me/notifications")).StatusCode);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<TrainFlow.Accounts.Infrastructure.AccountsDbContext>().Profiles.Where(x => x.Id == user).ExecuteUpdateAsync(s => s.SetProperty(x => x.Active, false));
        foreach (var path in new[] { "/api/v1/me/notifications", "/api/v1/me/notifications/unread-count", "/api/v1/me/notification-preferences" })
        {
            var response = await http.GetAsync(path);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Contains("ACCOUNT_DISABLED", await response.Content.ReadAsStringAsync());
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await http.PostAsync("/api/v1/me/notifications/read-all", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await http.PatchAsJsonAsync("/api/v1/me/notification-preferences", new PreferenceRequest(true, true, true, true))).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Notification_hub_rejects_unonboarded_and_disabled_connections()
    {
        using var factory = new ApiFactory(Database);
        var user = Guid.NewGuid();
        async Task Rejected()
        {
            var client = factory.Server.CreateWebSocketClient();
            using var socket = await client.ConnectAsync(new Uri("ws://localhost/api/v1/notifications/hub?access_token=" + Uri.EscapeDataString(factory.Token(user))), default);
            var handshake = System.Text.Encoding.UTF8.GetBytes("{\"protocol\":\"json\",\"version\":1}\u001e");
            await socket.SendAsync(handshake, System.Net.WebSockets.WebSocketMessageType.Text, true, default);
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var buffer = new byte[8192];
            var closed = false;
            for (var i = 0; i < 3 && !closed; i++)
            {
                var frame = await socket.ReceiveAsync(buffer, timeout.Token);
                var payload = System.Text.Encoding.UTF8.GetString(buffer, 0, frame.Count);
                Assert.DoesNotContain("NotificationCreated", payload);
                closed = frame.MessageType == System.Net.WebSockets.WebSocketMessageType.Close || payload.Contains("\"type\":7", StringComparison.Ordinal);
            }
            Assert.True(closed);
        }
        await Rejected();
        await Onboard(factory, user);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<TrainFlow.Accounts.Infrastructure.AccountsDbContext>().Profiles.Where(x => x.Id == user).ExecuteUpdateAsync(s => s.SetProperty(x => x.Active, false));
        await Rejected();
    }

}
