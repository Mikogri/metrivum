using Microsoft.EntityFrameworkCore;
using TrainFlow.BuildingBlocks;
using TrainFlow.Notifications.Contracts;
namespace TrainFlow.Notifications;

public sealed class NotificationPublisher(NotificationsDbContext db, ModuleTransaction tx, TimeProvider clock) : INotificationPublisher
{
    public Task PublishAsync(NotificationEvent n, CancellationToken ct) => tx.RunAsync(async token =>
    {
        if (n.RecipientUserId == Guid.Empty || n.SourceId == Guid.Empty || n.EventKey.Length is < 1 or > 200 || n.Type.Length is < 1 or > 100 || n.Category is not ("Messaging" or "CheckIns" or "Coaching" or "Billing" or "System") || n.SourceModule.Length is < 1 or > 30 || n.DeepLink != null && (!n.DeepLink.StartsWith("/app/", StringComparison.Ordinal) || n.DeepLink.Length > 300))
            throw ApiException.Invalid("Invalid notification event.");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"notification:" + n.RecipientUserId + ":" + n.EventKey},0))", token);
        if (await db.Notifications.AnyAsync(x => x.RecipientUserId == n.RecipientUserId && x.EventKey == n.EventKey, token))
            return;
        var p = await db.Preferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == n.RecipientUserId, token);
        var suppressed = !NotificationsService.Enabled(p, n.Category, n.Required);
        var now = clock.GetUtcNow();
        db.Notifications.Add(new()
        {
            RecipientUserId = n.RecipientUserId,
            EventKey = n.EventKey,
            Type = n.Type,
            Category = n.Category,
            SourceModule = n.SourceModule,
            SourceId = n.SourceId,
            DeepLink = n.DeepLink,
            CreatedAt = now,
            AvailableAt = n.AvailableAt ?? now,
            Required = n.Required,
            Cancelled = suppressed
        });
        await db.SaveChangesAsync(token);
    }, ct);
    public Task CancelScheduledAsync(string module, Guid source, CancellationToken ct) => db.Notifications.Where(x => x.SourceModule == module && x.SourceId == source && x.AvailableAt > clock.GetUtcNow()).ExecuteUpdateAsync(s => s.SetProperty(x => x.Cancelled, true), ct);
}
