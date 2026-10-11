using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Notifications;
using TrainFlow.VideoAnalysis.Infrastructure;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.Notifications.Contracts;

namespace TrainFlow.IntegrationTests;

[CollectionDefinition("Mobile notification delivery", DisableParallelization = true)]
public sealed class MobileNotificationCollection;

[Collection("Mobile notification delivery")]
public sealed class MobileBackendTests
{
    [CatalogPostgresFact]
    public async Task Push_delivery_uses_existing_notifications_suppresses_open_chat_and_invalidates_receipt_token()
    {
        using var original = new ApiFactory(Database);
        var user = Guid.NewGuid(); var conversation = Guid.NewGuid();
        var deviceToken = "ExpoPushToken[" + user.ToString("N") + "]";
        var handler = new ExpoHandler(deviceToken);
        using var app = original.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.Configure<ExpoPushOptions>(o => o.Enabled = true);
            services.AddSingleton(new ExpoPushTransport(new HttpClient(handler), Options.Create(new ExpoPushOptions { Enabled = true })));
        }));
        Guid deviceId;
        using (var scope = app.Services.CreateScope())
        {
            var accounts = scope.ServiceProvider.GetRequiredService<AccountsDbContext>();
            accounts.Profiles.Add(new() { Id = user, Active = true, Onboarded = true });
            accounts.Workspaces.Add(new() { Id = Guid.NewGuid(), OwnerId = user });
            accounts.Roles.Add(new() { UserId = user, Role = "Client" });
            await accounts.SaveChangesAsync();
            var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
            var backlogTime = DateTimeOffset.UtcNow.AddDays(-1);
            var inactiveRecipient = Guid.NewGuid();
            db.Notifications.AddRange(Enumerable.Range(0, 101).Select(index => new Notification
            {
                RecipientUserId = inactiveRecipient, EventKey = $"mobile-backlog:{index}", Type = "NewItem",
                Category = "System", SourceModule = "MobileTest", SourceId = Guid.NewGuid(),
                CreatedAt = backlogTime, AvailableAt = backlogTime
            }));
            var device = new PushDevice { UserId = user, InstallationId = Guid.NewGuid(), Platform = "ios", Token = deviceToken, Enabled = true, ActiveConversationId = conversation, ActiveUntil = DateTimeOffset.UtcNow.AddMinutes(5) };
            deviceId = device.Id; db.PushDevices.Add(device); await db.SaveChangesAsync();
            var publisher = scope.ServiceProvider.GetRequiredService<INotificationPublisher>();
            await publisher.PublishAsync(new(user, "mobile:" + Guid.NewGuid(), "MessageCreated", "Messaging", "MobileTest", conversation), default);
            await publisher.PublishAsync(new(user, "mobile:" + Guid.NewGuid(), "NewItem", "System", "MobileTest", Guid.NewGuid()), default);
            // The shared outbox delivers at most 100 rows per worker pass.
            var dueAt = DateTimeOffset.UtcNow;
            var maxPasses = await db.Notifications.CountAsync(x => x.DeliveredAt == null && !x.Cancelled && x.AvailableAt <= dueAt) / 100 + 1;
            for (var pass = 0; pass < maxPasses; pass++)
            {
                await scope.ServiceProvider.GetRequiredService<NotificationsDelivery>().DeliverAsync(default);
                if (!await db.Notifications.AnyAsync(x => x.RecipientUserId == user && x.DeliveredAt == null))
                    break;
            }
            Assert.Equal(2, await db.Notifications.CountAsync(x => x.RecipientUserId == user && x.DeliveredAt != null));
        }
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
            Assert.Equal(1, await db.PushDeliveries.CountAsync(x => x.DeviceId == deviceId));
            await scope.ServiceProvider.GetRequiredService<MobilePushDelivery>().RunAsync(default);
            Assert.Equal(1, handler.Sends);
            Assert.Equal("Receipt", (await db.PushDeliveries.SingleAsync(x => x.DeviceId == deviceId)).Status);
            Assert.All(await db.Notifications.Where(x => x.RecipientUserId == user).ToArrayAsync(), n => Assert.Null(n.ReadAt));
            await db.PushDeliveries.Where(x => x.DeviceId == deviceId).ExecuteUpdateAsync(s => s.SetProperty(x => x.AvailableAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        }
        using (var scope = app.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<MobilePushDelivery>().RunAsync(default);
            var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
            Assert.False((await db.PushDevices.SingleAsync(x => x.Id == deviceId)).Enabled);
            Assert.Equal("Failed", (await db.PushDeliveries.SingleAsync(x => x.DeviceId == deviceId)).Status);
        }
    }
    private sealed class ExpoHandler(string deviceToken) : HttpMessageHandler
    {
        public int Sends;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var receipt = request.RequestUri!.AbsolutePath.EndsWith("getReceipts");
            if (!receipt)
            {
                var payload = await request.Content!.ReadFromJsonAsync<JsonElement>(ct);
                if (payload.GetProperty("to").GetString() == deviceToken) Sends++;
            }
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(receipt
                ? "{\"data\":{\"receipt-1\":{\"status\":\"error\",\"details\":{\"error\":\"DeviceNotRegistered\"}}}}"
                : "{\"data\":{\"status\":\"ok\",\"id\":\"receipt-1\"}}", Encoding.UTF8, "application/json") };
        }
    }
    private static string Database => Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
    private static async Task<HttpClient> Client(ApiFactory factory, Guid id)
    {
        var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
        (await http.PutAsJsonAsync("/api/v1/me/onboarding", new
        {
            username = "mobile" + id.ToString("N")[..16], displayName = "Mobile test", birthDate = "1990-01-01",
            acceptedTerms = true, locale = "en", timeZone = "UTC", role = "Client"
        })).EnsureSuccessStatusCode();
        return http;
    }

    private static object Analysis(Guid local, double seconds = 1, Guid? mediaId = null, Guid? workoutExecutionId = null) => new
    {
        localAnalysisId = local, executionLocation = "client", name = "Local lift", note = (string?)null, tags = Array.Empty<string>(),
        configuration = new { movement = "squat" }, sourceVideo = new { origin = mediaId == null ? "local" : "cloud", durationSeconds = 10, width = 1920, height = 1080 },
        mediaId, workoutExecutionId,
        result = new { schemaVersion = 1, engineVersion = "test-1", modelVersion = "test-1", method = "tracking", positionUnit = "px",
            repetitions = Array.Empty<object>(), trajectory = new[] { new { seconds, x = 2, y = 3, quality = 1, occluded = false } }, warnings = Array.Empty<string>() }
    };

    [CatalogPostgresFact]
    public async Task Client_results_without_video_are_idempotent_owned_and_bounded()
    {
        using var factory = new ApiFactory(Database);
        var owner = Guid.NewGuid(); var other = Guid.NewGuid();
        using var a = await Client(factory, owner);
        using var b = await Client(factory, other);
        var local = Guid.NewGuid();
        a.DefaultRequestHeaders.Add("Idempotency-Key", local.ToString());
        var first = await a.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(local));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var body = await first.Content.ReadFromJsonAsync<JsonElement>();
        var id = body.GetProperty("id").GetGuid();
        Assert.Equal("client", body.GetProperty("executionLocation").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("mediaId").ValueKind);
        var retry = await a.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(local));
        Assert.Equal(id, (await retry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict, (await a.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(local, 2))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await a.GetAsync($"/api/v1/analyses/{id}/result")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync($"/api/v1/analyses/{id}/result")).StatusCode);
        a.DefaultRequestHeaders.Remove("Idempotency-Key");
        a.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await a.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(Guid.NewGuid(), 11))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(Guid.NewGuid(), mediaId: Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(Guid.NewGuid(), workoutExecutionId: Guid.NewGuid()))).StatusCode);
        using var scope = factory.Services.CreateScope();
        var media = scope.ServiceProvider.GetRequiredService<TrainFlow.Media.Infrastructure.MediaDbContext>();
        var foreignMedia = Guid.NewGuid();
        media.Files.Add(new() { Id = foreignMedia, OwnerId = other, Name = "Foreign", State = "Ready", ContentType = "video/mp4", Size = 100, Bucket = "test", ObjectKey = foreignMedia.ToString(), CreatedAt = DateTimeOffset.UtcNow, UploadExpiresAt = DateTimeOffset.UtcNow });
        await media.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await a.PostAsJsonAsync("/api/v1/analyses/client-results", Analysis(Guid.NewGuid(), mediaId: foreignMedia))).StatusCode);
        var db = scope.ServiceProvider.GetRequiredService<VideoAnalysisDbContext>();
        var historical = new AnalysisJob { Id = Guid.NewGuid(), OwnerId = owner, MediaId = Guid.NewGuid(), Name = "Historical", Configuration = "{\"movement\":\"squat\"}", IdempotencyKey = Guid.NewGuid().ToString(), CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow };
        db.Jobs.Add(historical); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync($"/api/v1/analyses/{historical.Id}")).StatusCode);
        var listed = await a.GetFromJsonAsync<JsonElement>("/api/v1/analyses/");
        Assert.DoesNotContain(listed.EnumerateArray(), item => item.GetProperty("id").GetGuid() == historical.Id);
        (await a.PutAsJsonAsync("/api/v1/me/roles/coach/onboarding", new { username = "mobile" + owner.ToString("N")[..16], displayName = "Mobile test", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await a.GetAsync($"/api/v1/analyses/{historical.Id}")).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Device_bindings_support_two_accounts_rotation_and_scoped_logout()
    {
        using var factory = new ApiFactory(Database);
        var owner = Guid.NewGuid(); var other = Guid.NewGuid();
        using var a = await Client(factory, owner); using var b = await Client(factory, other);
        var installation = Guid.NewGuid();
        var path = $"/api/v1/me/notifications/devices/{installation}";
        var token = "ExpoPushToken[" + Guid.NewGuid().ToString("N") + "]";
        object Registration(string value) => new { expoPushToken = value, platform = "ios", enabled = true };
        Assert.Equal(HttpStatusCode.OK, (await a.PutAsJsonAsync(path, Registration(token))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await b.PutAsJsonAsync(path, Registration(token))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await a.PutAsJsonAsync(path, Registration("ExpoPushToken[rotated]"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await a.DeleteAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await b.PutAsJsonAsync(path, Registration("https://untrusted.invalid"))).StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
        var count = await db.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM notifications.\"PushDevices\" WHERE \"UserId\" = {other} AND \"InstallationId\" = {installation} AND \"Enabled\"").SingleAsync();
        Assert.Equal(1, count);
    }
}
