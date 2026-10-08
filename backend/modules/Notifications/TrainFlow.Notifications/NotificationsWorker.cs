using TrainFlow.Accounts.Contracts;
using TrainFlow.Notifications.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TrainFlow.BuildingBlocks;
namespace TrainFlow.Notifications;

[Authorize]
public sealed class NotificationsHub(IAccountContext accounts) : Hub
{
    public override async Task OnConnectedAsync()
    {
        await accounts.GetRolesAsync(Context.ConnectionAborted);
        await base.OnConnectedAsync();
    }
}
public sealed class NotificationsWorker(IServiceScopeFactory scopes, ILogger<NotificationsWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(3));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<NotificationsDelivery>().DeliverAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogWarning(ex, "Notification delivery will retry; REST remains authoritative"); }
        }
    }
}
public sealed class NotificationsDelivery(NotificationsDbContext db, ModuleTransaction tx, IHubContext<NotificationsHub> hub, TimeProvider clock, IEnumerable<INotificationDeliveryPolicy> policies)
{
    public Task DeliverAsync(CancellationToken ct) => tx.RunAsync(async token =>
    {
        var now = clock.GetUtcNow();
        var rows = await db.Notifications.FromSqlInterpolated($"""
            SELECT * FROM notifications."Notifications"
            WHERE "DeliveredAt" IS NULL AND NOT "Cancelled" AND "AvailableAt" <= {now}
            ORDER BY "AvailableAt" LIMIT 100 FOR UPDATE SKIP LOCKED
            """).ToArrayAsync(token);
        var users = rows.Select(x => x.RecipientUserId).Distinct().ToArray();
        var preferences = await db.Preferences.AsNoTracking().Where(x => users.Contains(x.UserId)).ToDictionaryAsync(x => x.UserId, token);
        foreach (var n in rows)
        {
            if (!NotificationsService.Enabled(preferences.GetValueOrDefault(n.RecipientUserId), n.Category, n.Required))
            {
                n.Cancelled = true;
                continue;
            }
            var policy = policies.FirstOrDefault(x => x.SourceModule == n.SourceModule);
            if (policy != null && !await policy.CanDeliverAsync(new(n.RecipientUserId, n.EventKey, n.Type, n.Category, n.SourceModule, n.SourceId, n.DeepLink, n.AvailableAt, n.Required), token))
            {
                n.Cancelled = true;
                continue;
            }
            await hub.Clients.User(n.RecipientUserId.ToString()).SendAsync("NotificationCreated", new NotificationDto(n.Id, n.Type, n.Category, n.SourceModule, n.SourceId, n.DeepLink, n.AvailableAt, n.ReadAt), token);
            await hub.Clients.User(n.RecipientUserId.ToString()).SendAsync("UnreadCountChanged", token);
            n.DeliveredAt = now;
        }
        await db.SaveChangesAsync(token);
    }, ct);
}
