using Microsoft.EntityFrameworkCore;
using Metrivum.BuildingBlocks;
using Metrivum.Notifications.Contracts;
namespace Metrivum.Notifications;

/// <summary>Persists durable notification events for later account-scoped delivery.</summary>
public sealed class NotificationPublisher(NotificationsDbContext db, ModuleTransaction tx, TimeProvider clock) : INotificationPublisher
{
    public Task PublishAsync(NotificationEvent n, CancellationToken ct) => tx.RunAsync(async token =>
    {
        if (n.RecipientUserId == Guid.Empty || n.SourceId == Guid.Empty || n.EventKey.Length is < 1 or > 200 || n.Type.Length is < 1 or > 100 || n.Category is not ("Messaging" or "CheckIns" or "Coaching" or "Billing" or "System") || n.SourceModule.Length is < 1 or > 30 || n.DeepLink != null && (!n.DeepLink.StartsWith("/app/", StringComparison.Ordinal) || n.DeepLink.Length > 300))
            throw ApiException.Invalid("Invalid notification event.");
        var p = await db.Preferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == n.RecipientUserId, token);
        var suppressed = !NotificationsService.Enabled(p, n.Category, n.Required);
        var now = clock.GetUtcNow();
        // The unique event identity arbitrates retries across API/worker instances in the caller's transaction.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO notifications."Notifications"
                ("Id", "RecipientUserId", "EventKey", "Type", "Category", "SourceModule", "SourceId", "DeepLink", "CreatedAt", "AvailableAt", "Required", "Cancelled")
            VALUES ({Guid.NewGuid()}, {n.RecipientUserId}, {n.EventKey}, {n.Type}, {n.Category}, {n.SourceModule}, {n.SourceId}, {n.DeepLink}, {now}, {n.AvailableAt ?? now}, {n.Required}, {suppressed})
            ON CONFLICT ("RecipientUserId", "EventKey") DO NOTHING
            """, token);
    }, ct);
    public Task CancelScheduledAsync(string module, Guid source, CancellationToken ct) => db.Notifications.Where(x => x.SourceModule == module && x.SourceId == source && x.AvailableAt > clock.GetUtcNow()).ExecuteUpdateAsync(s => s.SetProperty(x => x.Cancelled, true), ct);
}
