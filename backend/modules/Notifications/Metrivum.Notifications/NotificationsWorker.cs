using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Notifications.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Metrivum.Notifications;

/// <summary>Provides authenticated, account-scoped SignalR notification delivery.</summary>
[Authorize]
public sealed class NotificationsHub(IAccountContext accounts) : Hub
{
    public override async Task OnConnectedAsync()
    {
        await accounts.GetRolesAsync(Context.ConnectionAborted);
        await base.OnConnectedAsync();
    }
}

/// <summary>Processes durable notifications in the background and schedules delivery attempts.</summary>
public sealed class NotificationsWorker(
    IServiceScopeFactory scopes,
    ILogger<NotificationsWorker> logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(3));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope
                    .ServiceProvider.GetRequiredService<NotificationsDelivery>()
                    .DeliverAsync(stoppingToken);
                await scope
                    .ServiceProvider.GetRequiredService<MobilePushDelivery>()
                    .RunAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Notification delivery will retry; REST remains authoritative"
                );
            }
        }
    }
}

/// <summary>Delivers eligible notification records through the configured realtime and push channels.</summary>
public sealed class NotificationsDelivery(
    NotificationsDbContext db,
    ModuleTransaction tx,
    IHubContext<NotificationsHub> hub,
    TimeProvider clock,
    IEnumerable<INotificationDeliveryPolicy> policies,
    IAccountDirectory accounts,
    IOptions<ExpoPushOptions> pushOptions
)
{
    public Task DeliverAsync(CancellationToken ct) =>
        tx.RunAsync(
            async token =>
            {
                var now = clock.GetUtcNow();
                var rows = await db
                    .Notifications.FromSqlInterpolated(
                        $"""
                        SELECT * FROM notifications."Notifications"
                        WHERE "DeliveredAt" IS NULL AND NOT "Cancelled" AND "AvailableAt" <= {now}
                        ORDER BY "AvailableAt" LIMIT 100 FOR UPDATE SKIP LOCKED
                        """
                    )
                    .ToArrayAsync(token);
                if (rows.Length == 0)
                    return;
                var users = rows.Select(x => x.RecipientUserId).Distinct().ToArray();
                var activeUsers = (await accounts.GetActiveUserIdsAsync(users, token)).ToHashSet();
                var preferences = await db
                    .Preferences.AsNoTracking()
                    .Where(x => users.Contains(x.UserId))
                    .ToDictionaryAsync(x => x.UserId, token);
                var pushUsers = pushOptions.Value.Enabled
                    ? rows.Where(n => n.ReadAt == null && activeUsers.Contains(n.RecipientUserId))
                        .Select(n => n.RecipientUserId)
                        .Distinct()
                        .ToArray()
                    : [];
                var devicesByUser = (
                    pushUsers.Length == 0
                        ? []
                        : await db
                            .PushDevices.AsNoTracking()
                            .Where(x => pushUsers.Contains(x.UserId) && x.Enabled)
                            .ToArrayAsync(token)
                ).ToLookup(x => x.UserId);
                foreach (var n in rows)
                {
                    if (
                        !activeUsers.Contains(n.RecipientUserId)
                        || !NotificationsService.Enabled(
                            preferences.GetValueOrDefault(n.RecipientUserId),
                            n.Category,
                            n.Required
                        )
                    )
                    {
                        n.Cancelled = true;
                        continue;
                    }
                    var policy = policies.FirstOrDefault(x => x.SourceModule == n.SourceModule);
                    if (
                        policy != null
                        && !await policy.CanDeliverAsync(
                            new(
                                n.RecipientUserId,
                                n.EventKey,
                                n.Type,
                                n.Category,
                                n.SourceModule,
                                n.SourceId,
                                n.DeepLink,
                                n.AvailableAt,
                                n.Required
                            ),
                            token
                        )
                    )
                    {
                        n.Cancelled = true;
                        continue;
                    }
                    await hub
                        .Clients.User(n.RecipientUserId.ToString())
                        .SendAsync(
                            "NotificationCreated",
                            new NotificationDto(
                                n.Id,
                                n.Type,
                                n.Category,
                                n.SourceModule,
                                n.SourceId,
                                n.DeepLink,
                                n.AvailableAt,
                                n.ReadAt
                            ),
                            token
                        );
                    await hub
                        .Clients.User(n.RecipientUserId.ToString())
                        .SendAsync("UnreadCountChanged", token);
                    if (pushOptions.Value.Enabled && n.ReadAt == null)
                    {
                        foreach (var device in devicesByUser[n.RecipientUserId])
                            if (
                                !(
                                    n.Type == "MessageCreated"
                                    && device.ActiveConversationId == n.SourceId
                                    && device.ActiveUntil > now
                                )
                            )
                                db.PushDeliveries.Add(
                                    new()
                                    {
                                        NotificationId = n.Id,
                                        DeviceId = device.Id,
                                        Token = device.Token,
                                        AvailableAt = now,
                                    }
                                );
                    }
                    n.DeliveredAt = now;
                }
                await db.SaveChangesAsync(token);
            },
            ct
        );
}
