using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Notifications.Contracts;

namespace Metrivum.Notifications;

/// <summary>Contains the configured expo push settings and bounds for Notifications; does not itself access the database.</summary>
public sealed class ExpoPushOptions
{
    public bool Enabled { get; set; }
    public string? AccessToken { get; set; }
}
/// <summary>Represents persisted push device state in Notifications; mapped and saved by the owning module's EF services.</summary>
public sealed class PushDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid InstallationId { get; set; }
    public string Token { get; set; } = "";
    public string Platform { get; set; } = "";
    public bool Enabled { get; set; }
    public Guid? ActiveConversationId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ActiveUntil { get; set; }
}
/// <summary>Represents persisted push delivery state in Notifications; mapped and saved by the owning module's EF services.</summary>
public sealed class PushDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid NotificationId { get; set; }
    public Guid DeviceId { get; set; }
    public string Token { get; set; } = "";
    public string? TicketId { get; set; }
    public string Status { get; set; } = "Pending";
    public int Attempts { get; set; }
    public DateTimeOffset AvailableAt { get; set; }
    public DateTimeOffset? SentAt { get; set; }
}
public sealed record RegisterPushDeviceRequest(string ExpoPushToken, string Platform, bool Enabled, Guid? ActiveConversationId = null);
public sealed record PushDeviceDto(Guid InstallationId, string Platform, bool Enabled);
/// <summary>Registers and revokes account-owned mobile push devices in the notification database.</summary>
public sealed class PushDevices(NotificationsDbContext db, ModuleTransaction tx, IAccountContext accounts, TimeProvider clock)
{
    public Task<PushDeviceDto> RegisterAsync(Guid installation, RegisterPushDeviceRequest input, CancellationToken ct) => tx.RunAsync(async token =>
    {
        if (installation == Guid.Empty || input.Platform is not ("ios" or "android") || input.ExpoPushToken == null
            || input.ExpoPushToken.Length > 256 || !Regex.IsMatch(input.ExpoPushToken, @"\A(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{1,200}\]\z", RegexOptions.CultureInvariant))
            throw ApiException.Invalid("Invalid installation, platform or Expo push token.");
        await LockAsync(installation, token);
        var row = await db.PushDevices.SingleOrDefaultAsync(x => x.UserId == accounts.UserId && x.InstallationId == installation, token);
        if (row == null)
        {
            if (await db.PushDevices.CountAsync(x => x.UserId == accounts.UserId, token) >= 20) throw new ApiException(429, "LIMIT_EXCEEDED", "Remove an old device registration first.");
            row = new() { UserId = accounts.UserId, InstallationId = installation };
            db.PushDevices.Add(row);
        }
        // Update only the authenticated account's binding; token ownership never transfers another account.
        if (row.Token != input.ExpoPushToken || !input.Enabled)
            await db.PushDeliveries.Where(x => x.DeviceId == row.Id && x.Status == "Pending").ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, "Cancelled"), token);
        row.Token = input.ExpoPushToken; row.Platform = input.Platform; row.Enabled = input.Enabled;
        row.ActiveConversationId = input.ActiveConversationId; row.UpdatedAt = clock.GetUtcNow();
        row.ActiveUntil = input.ActiveConversationId.HasValue ? clock.GetUtcNow().AddSeconds(90) : null;
        await db.SaveChangesAsync(token);
        return new PushDeviceDto(installation, row.Platform, row.Enabled);
    }, ct);
    public Task RemoveAsync(Guid installation, CancellationToken ct) => tx.RunAsync(async token =>
    {
        await LockAsync(installation, token);
        await db.PushDevices.Where(x => x.UserId == accounts.UserId && x.InstallationId == installation).ExecuteDeleteAsync(token);
    }, ct);
    private Task LockAsync(Guid installation, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"push-device:" + accounts.UserId}, 0))", ct);
}

public sealed record ExpoPushResult(string? TicketId, string? Error);
/// <summary>Sends push payloads to Expo over HTTP and interprets delivery results.</summary>
public sealed class ExpoPushTransport(HttpClient http, IOptions<ExpoPushOptions> options)
{
    public async Task<ExpoPushResult> SendAsync(string token, Notification notification, CancellationToken ct)
    {
        using var response = await PostAsync("send", new
        {
            to = token, title = "Metrivum", body = "You have a new notification.", sound = "default",
            data = new { notificationId = notification.Id, accountId = notification.RecipientUserId, resourceType = notification.SourceModule, resourceId = notification.SourceId }
        }, ct);
        var data = Data(response);
        if (data.ValueKind == JsonValueKind.Array) data = data.GetArrayLength() == 1 ? data[0] : throw new JsonException("Invalid Expo ticket count.");
        return Parse(data);
    }
    public async Task<ExpoPushResult?> ReceiptAsync(string id, CancellationToken ct)
    {
        using var response = await PostAsync("getReceipts", new { ids = new[] { id } }, ct);
        var data = Data(response);
        if (data.ValueKind != JsonValueKind.Object) throw new JsonException("Invalid Expo receipts response.");
        return data.TryGetProperty(id, out var receipt) ? Parse(receipt) : null;
    }
    private async Task<JsonDocument> PostAsync(string endpoint, object body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://exp.host/--/api/v2/push/" + endpoint) { Content = JsonContent.Create(body) };
        if (!string.IsNullOrWhiteSpace(options.Value.AccessToken)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.AccessToken);
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
    }
    private static JsonElement Data(JsonDocument document) => document.RootElement.ValueKind == JsonValueKind.Object
        && document.RootElement.TryGetProperty("data", out var data) && data.ValueKind is JsonValueKind.Object or JsonValueKind.Array
            ? data : throw new JsonException("Invalid Expo response.");
    private static ExpoPushResult Parse(JsonElement data)
    {
        if (data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("status", out var status) || status.ValueKind != JsonValueKind.String)
            throw new JsonException("Invalid Expo response.");
        return status.GetString() == "ok"
            ? new(data.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String ? id.GetString() : null, null)
            : new(null, data.TryGetProperty("details", out var details) && details.ValueKind == JsonValueKind.Object
                && details.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.String ? error.GetString() : "PushRejected");
    }
}

/// <summary>Coordinates persisted mobile push deliveries and retries through the Expo transport.</summary>
public sealed class MobilePushDelivery(NotificationsDbContext db, ModuleTransaction tx, ExpoPushTransport transport,
    IOptions<ExpoPushOptions> options, TimeProvider clock, IAccountDirectory accounts, IEnumerable<INotificationDeliveryPolicy> policies)
{
    public async Task RunAsync(CancellationToken ct)
    {
        if (!options.Value.Enabled) return;
        await tx.RunAsync(async token =>
        {
            var now = clock.GetUtcNow();
            var rows = await db.PushDeliveries.FromSqlInterpolated($"""
                SELECT * FROM notifications."PushDeliveries" WHERE "Status" IN ('Pending', 'Receipt') AND "AvailableAt" <= {now}
                ORDER BY "AvailableAt" LIMIT 50 FOR UPDATE SKIP LOCKED
                """).ToArrayAsync(token);
            if (rows.Length == 0) return;
            var deviceIds = rows.Select(x => x.DeviceId).Distinct().ToArray();
            var devices = await db.PushDevices.AsNoTracking().Where(x => deviceIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, token);
            var notificationIds = rows.Where(x => x.Status == "Pending").Select(x => x.NotificationId).Distinct().ToArray();
            var notifications = await db.Notifications.AsNoTracking().Where(x => notificationIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, token);
            var recipients = notifications.Values.Select(x => x.RecipientUserId).Distinct().ToArray();
            var preferences = await db.Preferences.AsNoTracking().Where(x => recipients.Contains(x.UserId)).ToDictionaryAsync(x => x.UserId, token);
            var activeUsers = (await accounts.GetActiveUserIdsAsync(recipients, token)).ToHashSet();
            foreach (var row in rows)
            {
                var device = devices.GetValueOrDefault(row.DeviceId);
                if (device == null || !device.Enabled || device.Token != row.Token) { row.Status = "Cancelled"; continue; }
                try
                {
                    if (row.Status == "Receipt")
                    {
                        var receipt = await transport.ReceiptAsync(row.TicketId!, token);
                        if (receipt == null) row.Status = row.SentAt < now.AddHours(-23) ? "ReceiptExpired" : "Receipt";
                        else await CompleteAsync(row, receipt, "AcceptedByProvider", token);
                        row.AvailableAt = now.AddMinutes(15);
                        continue;
                    }
                    var n = notifications[row.NotificationId];
                    var preference = preferences.GetValueOrDefault(n.RecipientUserId);
                    var policy = policies.FirstOrDefault(x => x.SourceModule == n.SourceModule);
                    if (n.Cancelled || n.ReadAt.HasValue || device.UserId != n.RecipientUserId || !activeUsers.Contains(n.RecipientUserId)
                        || !NotificationsService.Enabled(preference, n.Category, n.Required)
                        || n.Type == "MessageCreated" && device.ActiveConversationId == n.SourceId && device.ActiveUntil > now
                        || policy != null && !await policy.CanDeliverAsync(new(n.RecipientUserId, n.EventKey, n.Type, n.Category, n.SourceModule, n.SourceId, n.DeepLink, n.AvailableAt, n.Required), token))
                    { row.Status = "Cancelled"; continue; }
                    row.Attempts++;
                    var ticket = await transport.SendAsync(row.Token, n, token);
                    if (ticket.Error == "MessageRateExceeded" && row.Attempts < 5) row.AvailableAt = now.AddMinutes(row.Attempts);
                    else if (ticket.Error != null) await CompleteAsync(row, ticket, "Failed", token);
                    else if (string.IsNullOrWhiteSpace(ticket.TicketId)) row.Status = "Failed";
                    else { row.TicketId = ticket.TicketId; row.Status = "Receipt"; row.SentAt = now; row.AvailableAt = now.AddMinutes(15); }
                }
                catch (Exception error) when (error is HttpRequestException or JsonException or TaskCanceledException && !token.IsCancellationRequested)
                {
                    if (row.Status == "Pending" && row.Attempts >= 5) row.Status = "Failed";
                    if (row.Status == "Receipt" && row.SentAt < now.AddHours(-23)) row.Status = "ReceiptExpired";
                    row.AvailableAt = now.AddMinutes(Math.Max(1, row.Attempts));
                }
            }
            await db.SaveChangesAsync(token);
        }, ct);
    }
    private async Task CompleteAsync(PushDelivery row, ExpoPushResult result, string success, CancellationToken ct)
    {
        if (result.Error == "DeviceNotRegistered")
            await db.PushDevices.Where(x => x.Token == row.Token).ExecuteUpdateAsync(s => s.SetProperty(x => x.Enabled, false), ct);
        row.Status = result.Error == null ? success : "Failed";
    }
}
