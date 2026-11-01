using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using Metrivum.BuildingBlocks;
using Metrivum.Notifications.Contracts;

namespace Metrivum.Notifications;

public sealed class NotificationReadStore(NotificationsDbContext db, TimeProvider clock, ModuleTransaction tx, IHubContext<NotificationsHub> hub) : INotificationReadStore
{
    public Task<string[]> UnreadEventKeysAsync(Guid recipient, string module, Guid source, string type, CancellationToken ct) =>
        db.Notifications.Where(n => n.RecipientUserId == recipient && n.SourceModule == module && n.SourceId == source && n.Type == type && n.ReadAt == null && !n.Cancelled)
            .Select(n => n.EventKey).ToArrayAsync(ct);

    public Task MarkReadAsync(Guid recipient, string[] eventKeys, CancellationToken ct) => tx.RunAsync(async token =>
    {
        if (eventKeys.Length == 0) return;
        var changed = await db.Notifications.Where(n => n.RecipientUserId == recipient && n.ReadAt == null && eventKeys.Contains(n.EventKey))
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, clock.GetUtcNow()), token);
        if (changed > 0) tx.OnCommitted(async _ =>
        {
            try { await hub.Clients.User(recipient.ToString()).SendAsync("UnreadCountChanged", CancellationToken.None); }
            catch { /* The committed read state remains authoritative if the realtime hint fails. */ }
        });
    }, ct);
}
