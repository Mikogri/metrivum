using System.Data.Common;
using System.Net.WebSockets;
using System.Text;
using Metrivum.Accounts.Infrastructure;
using Metrivum.Notifications;
using Metrivum.Notifications.Contracts;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class NotificationAccountRevocationTests
{
    [CatalogPostgresFact]
    public async Task Delivery_rechecks_account_after_live_connection_and_batches_current_recipients()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        var commands = new AccountCommands();
        using var factory = original.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.AddSingleton<TimeProvider>(new DeliveryClock());
                services.AddDbContext<AccountsDbContext>(options =>
                    options.AddInterceptors(commands)
                );
            })
        );
        var user = Guid.NewGuid();
        var offline = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var accounts = scope.ServiceProvider.GetRequiredService<AccountsDbContext>();
            foreach (var id in new[] { user, offline })
            {
                accounts.Profiles.Add(
                    new()
                    {
                        Id = id,
                        Active = true,
                        Onboarded = true,
                    }
                );
                accounts.Workspaces.Add(new() { Id = Guid.NewGuid(), OwnerId = id });
                accounts.Roles.Add(new() { UserId = id, Role = "Client" });
            }
            await accounts.SaveChangesAsync();
        }
        var client = factory.Server.CreateWebSocketClient();
        using var socket = await client.ConnectAsync(
            new Uri(
                "ws://localhost/api/v1/notifications/hub?access_token="
                    + Uri.EscapeDataString(original.Token(user))
            ),
            default
        );
        await socket.SendAsync(
            Encoding.UTF8.GetBytes("{\"protocol\":\"json\",\"version\":1}\u001e"),
            WebSocketMessageType.Text,
            true,
            default
        );
        async Task<string> Receive()
        {
            var buffer = new byte[8192];
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var frame = await socket.ReceiveAsync(buffer, timeout.Token);
            return Encoding.UTF8.GetString(buffer, 0, frame.Count);
        }
        Assert.Contains("{}", await Receive());
        using (var scope = factory.Services.CreateScope())
        {
            var publisher = scope.ServiceProvider.GetRequiredService<INotificationPublisher>();
            await publisher.PublishAsync(
                new(
                    user,
                    "before:" + user,
                    "PaymentConfirmed",
                    "Billing",
                    "Billing",
                    Guid.NewGuid(),
                    Required: true
                ),
                default
            );
            await scope
                .ServiceProvider.GetRequiredService<NotificationsDelivery>()
                .DeliverAsync(default);
        }
        Assert.Contains("NotificationCreated", await Receive());
        using (var scope = factory.Services.CreateScope())
        {
            await scope
                .ServiceProvider.GetRequiredService<AccountsDbContext>()
                .Profiles.Where(x => x.Id == user)
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.Active, false));
            var publisher = scope.ServiceProvider.GetRequiredService<INotificationPublisher>();
            foreach (var id in new[] { user, offline })
            {
                await publisher.PublishAsync(
                    new(
                        id,
                        "after-one:" + id,
                        "PaymentConfirmed",
                        "Billing",
                        "Billing",
                        Guid.NewGuid(),
                        Required: true
                    ),
                    default
                );
                await publisher.PublishAsync(
                    new(
                        id,
                        "after-two:" + id,
                        "PaymentConfirmed",
                        "Billing",
                        "Billing",
                        Guid.NewGuid(),
                        Required: true
                    ),
                    default
                );
            }
        }
        commands.Count = 0;
        using (var scope = factory.Services.CreateScope())
        {
            await scope
                .ServiceProvider.GetRequiredService<NotificationsDelivery>()
                .DeliverAsync(default);
            var rows = await scope
                .ServiceProvider.GetRequiredService<NotificationsDbContext>()
                .Notifications.AsNoTracking()
                .Where(x =>
                    (x.RecipientUserId == user || x.RecipientUserId == offline)
                    && x.EventKey.StartsWith("after-")
                )
                .ToArrayAsync();
            Assert.Equal(4, rows.Length);
            Assert.All(
                rows.Where(x => x.RecipientUserId == user),
                x =>
                {
                    Assert.True(x.Cancelled);
                    Assert.Null(x.DeliveredAt);
                }
            );
            Assert.All(
                rows.Where(x => x.RecipientUserId == offline),
                x =>
                {
                    Assert.False(x.Cancelled);
                    Assert.NotNull(x.DeliveredAt);
                }
            );
        }
        Assert.Equal(1, commands.Count);
    }

    private sealed class DeliveryClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => DateTimeOffset.UnixEpoch.AddDays(1);
    }

    private sealed class AccountCommands : DbCommandInterceptor
    {
        public int Count { get; set; }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default
        )
        {
            Count++;
            return ValueTask.FromResult(result);
        }
    }
}
