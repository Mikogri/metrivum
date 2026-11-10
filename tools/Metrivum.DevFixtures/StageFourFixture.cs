using System.Security.Claims;
using Metrivum.Analytics;
using Metrivum.Billing.Features;
using Metrivum.Messaging.Domain;
using Metrivum.Messaging.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

internal static class StageFourFixture
{
    public static async Task RunAsync(IServiceProvider root, Guid[] ids)
    {
        async Task<T> As<T>(Guid actor, Func<IServiceProvider, Task<T>> action)
        {
            await using var scope = root.CreateAsyncScope();
            var accessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
            accessor.HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(
                    new ClaimsIdentity([new Claim("sub", actor.ToString())], "DevFixtureConsole")
                ),
            };
            try
            {
                return await action(scope.ServiceProvider);
            }
            finally
            {
                accessor.HttpContext = null;
            }
        }

        await As(
            ids[1],
            async services =>
            {
                var plan = await services
                    .GetRequiredService<PlatformSubscriptionService>()
                    .CurrentAsync(default);
                if (plan.PlanId != "Free")
                    throw new InvalidOperationException(
                        "Stage 04 requires Coach B to be a Free test account."
                    );
                return true;
            }
        );
        await As(
            ids[0],
            async services =>
            {
                var service = services.GetRequiredService<PlatformSubscriptionService>();
                var current = await service.CurrentAsync(default);
                if (current.PlanId == "Pro")
                    return true;
                var pro = (await service.PlansAsync(default)).Single(x => x.Id == "Pro");
                if (!pro.PriceConfigured)
                    throw new InvalidOperationException(
                        "Configure an explicit development Pro price before running Stage 04 fixtures."
                    );
                var checkout = await service.CheckoutAsync(new("Pro", pro.PriceVersion!), default);
                var confirmed = await service.ConfirmAsync(
                    new(
                        checkout.PendingDue!.Id,
                        "devfixture:stage04:pro:" + checkout.PendingDue.Id
                    ),
                    default
                );
                if (confirmed.PlanId != "Pro")
                    throw new InvalidOperationException("Simulated Pro confirmation failed.");
                return true;
            }
        );

        await StageTwoFixture.RunAsync(root, ids);
        await As(
            ids[0],
            async services =>
            {
                var messaging = services.GetRequiredService<MessagingService>();
                var conversation = await messaging.DirectAsync(ids[2], default);
                await messaging.SendAsync(
                    conversation.Id,
                    new(MessageType.Text, "Development fixture: Stage 04 notification", null, []),
                    "devfixture:stage04:message",
                    default
                );
                return true;
            }
        );
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var report = await As(
            ids[0],
            services =>
                services
                    .GetRequiredService<AnalysisService>()
                    .QueryAsync(
                        new AnalysisQuery
                        {
                            From = today.AddDays(-29),
                            To = today,
                            TimeZone = "UTC",
                        },
                        default
                    )
        );
        var eur = report.Finance.Totals.Single(x => x.Currency == "EUR");
        if (
            eur.Gross != 360m
            || eur.Fee != 4m
            || eur.Net != 356m
            || eur.Payments != 2
            || report.Clients.Active != 2
        )
            throw new InvalidOperationException(
                "Stage 04 fixture totals differ from the fresh-account baseline. Use dedicated empty test accounts and default fee policy; never rewrite historical payments."
            );
        if (report.Training.Available)
            throw new InvalidOperationException(
                "This fixture must not fabricate training execution data."
            );
        Console.WriteLine(
            "Stage 04 verified: Pro Coach A, Free Coach B; EUR gross 360, fee 4, net 356, 2 settlements, 2 unique active clients. Platform Pro purchase excluded. Check-in and chat records are development fixtures; no real funds moved."
        );
    }
}
