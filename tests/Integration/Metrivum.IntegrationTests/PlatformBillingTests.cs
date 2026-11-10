using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.Billing;
using Metrivum.Billing.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Features;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Forms;
using Metrivum.Notifications;
using Metrivum.Offers;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Features;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Metrivum.IntegrationTests;

public sealed partial class OffersBillingTests
{
    [CatalogPostgresFact]
    public async Task Platform_upgrade_keeps_identical_me_access_and_rejects_cross_owner_confirmation()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = original.WithWebHostBuilder(builder =>
            builder
                .UseSetting("Billing:PlatformPlans:Pro:Amount", "59.99")
                .UseSetting("Billing:PlatformPlans:Pro:PriceVersion", "http-stage4")
                .UseSetting("Billing:PlatformPlans:Pro:Currency", "EUR")
        );
        async Task<HttpClient> Coach()
        {
            var id = Guid.NewGuid();
            var http = factory.CreateClient();
            http.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(id));
            Assert.Equal(
                HttpStatusCode.OK,
                (
                    await http.PutAsJsonAsync(
                        "/api/v1/me/onboarding",
                        new
                        {
                            username = "pb" + id.ToString("N")[..20],
                            displayName = "Platform Billing",
                            birthDate = "1990-01-01",
                            acceptedTerms = true,
                            locale = "en",
                            timeZone = "UTC",
                            role = "Coach",
                        }
                    )
                ).StatusCode
            );
            return http;
        }
        using var owner = await Coach();
        using var stranger = await Coach();
        var before = await owner.GetFromJsonAsync<JsonElement>("/api/v1/me/access");
        Assert.DoesNotContain(
            before.GetProperty("features").EnumerateArray(),
            feature =>
                feature.GetProperty("reason").GetString()
                    is "not_granted"
                        or "dependency_unavailable"
        );
        var checkout = await owner.PostAsJsonAsync(
            "/api/v1/me/platform-subscription/checkout",
            new PlatformCheckoutRequest("Pro", "eur-monthly-v3-Pro")
        );
        Assert.Equal(HttpStatusCode.OK, checkout.StatusCode);
        var due = (await checkout.Content.ReadFromJsonAsync<PlatformSubscriptionDto>())!
            .PendingDue!
            .Id;
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await stranger.PostAsJsonAsync(
                    "/api/v1/me/platform-subscription/confirm-payment",
                    new PlatformConfirmRequest(due, "alien")
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await owner.PostAsJsonAsync(
                    "/api/v1/me/platform-subscription/confirm-payment",
                    new PlatformConfirmRequest(due, "owner")
                )
            ).StatusCode
        );
        var after = await owner.GetFromJsonAsync<JsonElement>("/api/v1/me/access");
        Assert.Contains(
            after.GetProperty("features").EnumerateArray(),
            x =>
                x.GetProperty("key").GetString() == "training.export.pdf"
                && x.GetProperty("available").GetBoolean()
        );
    }

    [CatalogPostgresFact]
    public async Task Platform_price_versions_are_immutable_and_cancelled_checkout_cannot_be_confirmed()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        await using var services = PlatformServices(Guid.NewGuid(), isolated.Connection);
        await using var scope = services.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        Assert.Equal(
            409,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    service.CheckoutAsync(new("Pro", "outdated"), default)
                )
            ).Status
        );
        var checkout = await service.CheckoutAsync(new("Pro", "eur-monthly-v3-Pro"), default);
        var due = checkout.PendingDue!.Id;
        var cancelled = await service.ChangeAsync(new("Free", checkout.Version), default);
        Assert.Equal("Free", cancelled.PlanId);
        Assert.Null(cancelled.PendingDue);
        Assert.Equal(
            409,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    service.ConfirmAsync(new(due, "stale"), default)
                )
            ).Status
        );
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        config["Billing:PlatformPlans:Pro:Amount"] = "99.99";
        Assert.Equal(24m, (await service.PlansAsync(default)).Single(x => x.Id == "Pro").Amount);
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Empty(await db.Payments.ToArrayAsync());
        var price = Assert.Single(await db.PlanPrices.Where(x => x.PlanId == "Pro").ToArrayAsync());
        await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE billing.plan_prices SET \"Amount\"=99.99 WHERE \"Id\"={price.Id}"
            )
        );
    }

    [CatalogPostgresFact]
    public async Task Platform_unconfigured_price_is_honest_and_free_creates_no_charge()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var provider = new CountingProvider();
        await using var services = PlatformServices(
            Guid.NewGuid(),
            isolated.Connection,
            provider: provider,
            amount: null
        );
        await using var scope = services.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        var plans = await service.PlansAsync(default);
        Assert.Equal(plans[0].Capabilities, plans[1].Capabilities);
        Assert.True(plans[1].PriceConfigured);
        Assert.Equal(9m, plans[1].Amount);
        Assert.Equal("Free", (await service.CurrentAsync(default)).PlanId);
        Assert.Equal(
            409,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    service.CheckoutAsync(new("Pro", "unknown"), default)
                )
            ).Status
        );
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Empty(await db.Orders.ToArrayAsync());
        Assert.Empty(await db.Attempts.ToArrayAsync());
        Assert.Equal(0, provider.Calls);
    }

    [CatalogPostgresFact]
    public async Task Platform_manual_concurrent_confirmation_has_one_settlement_and_atomic_notifications()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var provider = new CountingProvider();
        await using var services = PlatformServices(owner, isolated.Connection, provider: provider);
        Guid due;
        await using (var scope = services.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
            Assert.Equal(
                24m,
                (await service.PlansAsync(default)).Single(x => x.Id == "Pro").Amount
            );
            due = (await service.CheckoutAsync(new("Pro", "eur-monthly-v3-Pro"), default))
                .PendingDue!
                .Id;
        }
        async Task<PlatformSubscriptionDto> Confirm(string key)
        {
            await using var scope = services.CreateAsyncScope();
            return await scope
                .ServiceProvider.GetRequiredService<PlatformSubscriptionService>()
                .ConfirmAsync(new(due, key), default);
        }
        var results = await Task.WhenAll(Confirm("first-click"), Confirm("second-click"));
        Assert.All(results, result => Assert.Equal("Pro", result.PlanId));
        await Confirm("first-click");
        Assert.Equal(1, provider.Calls);
        await using var verify = services.CreateAsyncScope();
        var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
        var payment = Assert.Single(await db.Payments.ToArrayAsync());
        Assert.Equal(BillingContext.Platform, payment.Context);
        Assert.Equal(24m, payment.GrossAmount);
        Assert.Equal(0m, payment.FeeAmount);
        Assert.Null(Assert.Single(await db.Attempts.ToArrayAsync()).PaymentMethodId);
        Assert.Equal("Simulated", Assert.Single(await db.Transactions.ToArrayAsync()).Provider);
        Assert.Empty(
            await verify.ServiceProvider.GetRequiredService<BillingService>().EarningsAsync(default)
        );
        var notifications = verify.ServiceProvider.GetRequiredService<NotificationsDbContext>();
        Assert.Single(
            await notifications
                .Notifications.Where(x =>
                    x.RecipientUserId == owner && x.Type == "PaymentConfirmed"
                )
                .ToArrayAsync()
        );
        Assert.Single(
            await notifications
                .Notifications.Where(x => x.RecipientUserId == owner && x.Type == "PlanActivated")
                .ToArrayAsync()
        );
        var reminder = Assert.Single(
            await notifications
                .Notifications.Where(x => x.RecipientUserId == owner && x.Type == "PaymentOverdue")
                .ToArrayAsync()
        );
        Assert.True(reminder.Cancelled);
        var policy = verify
            .ServiceProvider.GetServices<Metrivum.Notifications.Contracts.INotificationDeliveryPolicy>()
            .Single(x => x.SourceModule == "Billing");
        Assert.False(
            await policy.CanDeliverAsync(
                new(owner, "reminder", "PaymentOverdue", "Billing", "Billing", due),
                default
            )
        );
        // Failure after publication rolls both ledger and durable notification back.
        var count = await notifications.Notifications.CountAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            verify
                .ServiceProvider.GetRequiredService<ModuleTransaction>()
                .RunAsync(
                    async ct =>
                    {
                        await verify
                            .ServiceProvider.GetRequiredService<Metrivum.Notifications.Contracts.INotificationPublisher>()
                            .PublishAsync(
                                new(
                                    owner,
                                    "rollback",
                                    "PaymentDue",
                                    "Billing",
                                    "Billing",
                                    due,
                                    Required: true
                                ),
                                ct
                            );
                        throw new InvalidOperationException("rollback");
                    },
                    default
                )
        );
        Assert.Equal(count, await notifications.Notifications.CountAsync());
    }

    [CatalogPostgresFact]
    public async Task Platform_expiry_waits_for_manual_payment_even_with_saved_method_and_workers_are_retry_safe()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 1, 15, 0, 0, 0, TimeSpan.Zero));
        var provider = new CountingProvider();
        await using var services = PlatformServices(
            Guid.NewGuid(),
            isolated.Connection,
            clock,
            provider
        );
        await using (var scope = services.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
            await scope
                .ServiceProvider.GetRequiredService<BillingService>()
                .AddMethodAsync(new("Optional"), default);
            var checkout = await service.CheckoutAsync(new("Pro", "eur-monthly-v3-Pro"), default);
            await service.ConfirmAsync(new(checkout.PendingDue!.Id, "initial"), default);
        }
        clock.Now = clock.Now.AddMonths(1);
        async Task Work()
        {
            await using var scope = services.CreateAsyncScope();
            await scope
                .ServiceProvider.GetRequiredService<PlatformSubscriptionService>()
                .ProcessRenewalsAsync(10, default);
        }
        await Task.WhenAll(Work(), Work());
        await Work();
        await using var verify = services.CreateAsyncScope();
        var service2 = verify.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        var current = await service2.CurrentAsync(default);
        Assert.Equal("Free", current.PlanId);
        Assert.Equal("AwaitingPayment", current.Status);
        Assert.NotNull(current.PendingDue);
        Assert.Equal(1, provider.Calls);
        var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Equal(2, await db.Dues.CountAsync());
        Assert.Equal(1, await db.Payments.CountAsync());
        Assert.Equal(
            "Pro",
            (
                await service2.ConfirmAsync(new(current.PendingDue!.Id, "renew-manually"), default)
            ).PlanId
        );
    }

    [CatalogPostgresFact]
    public async Task Platform_explicit_autorenew_and_scheduled_downgrade_preserve_paid_history()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 1, 15, 0, 0, 0, TimeSpan.Zero));
        var provider = new CountingProvider();
        await using var services = PlatformServices(
            Guid.NewGuid(),
            isolated.Connection,
            clock,
            provider
        );
        await using (var scope = services.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
            Assert.Equal(
                400,
                (
                    await Assert.ThrowsAsync<ApiException>(() =>
                        service.CheckoutAsync(new("Pro", "eur-monthly-v3-Pro", true), default)
                    )
                ).Status
            );
            var method = await scope
                .ServiceProvider.GetRequiredService<BillingService>()
                .AddMethodAsync(new("Explicit renewal"), default);
            var checkout = await service.CheckoutAsync(
                new("Pro", "eur-monthly-v3-Pro", true, method.Id),
                default
            );
            await service.ConfirmAsync(new(checkout.PendingDue!.Id, "initial"), default);
        }
        clock.Now = clock.Now.AddMonths(1);
        async Task Work()
        {
            await using var scope = services.CreateAsyncScope();
            await scope
                .ServiceProvider.GetRequiredService<PlatformSubscriptionService>()
                .ProcessRenewalsAsync(10, default);
        }
        await Task.WhenAll(Work(), Work());
        await Work();
        await using (var scope = services.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
            var current = await service.CurrentAsync(default);
            Assert.Equal("Pro", current.PlanId);
            Assert.Equal(2, provider.Calls);
            var scheduled = await service.ChangeAsync(new("Free", current.Version), default);
            Assert.Equal("Pro", scheduled.PlanId);
            Assert.Equal("Free", scheduled.PendingPlanId);
            Assert.Equal(
                409,
                (
                    await Assert.ThrowsAsync<ApiException>(() =>
                        service.CancelAsync(new(current.Version), default)
                    )
                ).Status
            );
        }
        clock.Now = clock.Now.AddMonths(1);
        await Work();
        await using var verify = services.CreateAsyncScope();
        var service2 = verify.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        Assert.Equal("Free", (await service2.CurrentAsync(default)).PlanId);
        Assert.Equal(2, provider.Calls);
        Assert.Equal(2, (await service2.HistoryAsync(default)).Payments.Count);
    }

    [CatalogPostgresFact]
    public async Task Service_settlement_fee_uses_free_or_pro_at_payment_and_historical_snapshot_stays_fixed()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        await using var coachServices = PlatformServices(coach, isolated.Connection);
        await using var buyerServices = PlatformServices(client, isolated.Connection);
        Guid revision,
            option;
        await using (var scope = coachServices.CreateAsyncScope())
        {
            var offer = await CreateOffer(scope);
            var published = await scope
                .ServiceProvider.GetRequiredService<OffersService>()
                .PublishAsync(offer.Id, 1, default);
            revision = published.CurrentPublishedRevisionId!.Value;
            option = published.BillingOptions.Single(x => x.Model == BillingModel.PerSession).Id;
        }
        async Task<ServiceOrderSnapshot> Order()
        {
            await using var scope = coachServices.CreateAsyncScope();
            return await scope
                .ServiceProvider.GetRequiredService<BillingService>()
                .CreateForServiceAsync(
                    new(
                        Guid.NewGuid(),
                        Guid.NewGuid(),
                        coach,
                        client,
                        revision,
                        option,
                        null,
                        DateTimeOffset.UtcNow
                    ),
                    default
                );
        }
        var first = await Order();
        var second = await Order();
        PaymentResultDto freePayment;
        await using (var scope = buyerServices.CreateAsyncScope())
            freePayment = await scope
                .ServiceProvider.GetRequiredService<BillingService>()
                .PayAsync(first.PaymentDueId, new(null, "free-fee"), default);
        Assert.Equal(0.10m, freePayment.Payment!.FeeRate);
        Assert.Equal(1m, freePayment.Payment.FeeAmount);
        await using (var scope = coachServices.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
            var checkout = await service.CheckoutAsync(new("Pro", "eur-monthly-v3-Pro"), default);
            await service.ConfirmAsync(new(checkout.PendingDue!.Id, "upgrade"), default);
        }
        await using (var scope = buyerServices.CreateAsyncScope())
        {
            var billing = scope.ServiceProvider.GetRequiredService<BillingService>();
            var proPayment = await billing.PayAsync(
                second.PaymentDueId,
                new(null, "pro-fee"),
                default
            );
            Assert.Equal(0.10m, proPayment.Payment!.FeeRate);
            Assert.Equal(1m, proPayment.Payment.FeeAmount);
            Assert.Equal(
                0.10m,
                (await billing.PayAsync(first.PaymentDueId, new(null, "free-fee"), default))
                    .Payment!
                    .FeeRate
            );
        }
    }

    [CatalogPostgresFact]
    public async Task Team_invitations_require_owner_and_only_recipient_can_accept()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var member = Guid.NewGuid();
        var outsider = Guid.NewGuid();
        var clock = new Clock(DateTimeOffset.UtcNow);
        await using var services = TeamServices(owner, isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var billing = TeamBilling(scope);
        var quote = await billing.QuoteAsync(
            new("Private team", 3, "eur-monthly-v3-Team"),
            default
        );
        var paid = await billing.ConfirmAsync(new(quote.Id, "initial"), default);
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        var directory = new TeamDirectory(member);
        TeamService For(Guid id) =>
            new(
                db,
                new Account(id),
                directory,
                scope.ServiceProvider.GetRequiredService<ModuleTransaction>(),
                clock
            );
        Assert.Equal(
            404,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    For(outsider).RequestAsync(paid.TeamId, new("member"), default)
                )
            ).Status
        );
        var invite = await For(owner).RequestAsync(paid.TeamId, new("member"), default);
        Assert.Equal(1, await db.TeamMemberships.CountAsync());
        Assert.Equal(
            404,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    For(outsider).DecideAsync(invite.Id, true, default)
                )
            ).Status
        );
        Assert.Equal("Accepted", (await For(member).DecideAsync(invite.Id, true, default)).Status);
        await For(member).DecideAsync(invite.Id, true, default);
        Assert.Equal(2, await db.TeamMemberships.CountAsync());
        Assert.Empty(await db.PlatformSubscriptions.ToArrayAsync());
        Assert.Equal(
            409,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    For(outsider).RequestAsync(paid.TeamId, null, default)
                )
            ).Status
        );
    }

    private sealed class TeamDirectory(Guid member) : IAccountDirectory
    {
        public Task<IReadOnlyDictionary<Guid, AccountDirectoryEntry>> GetAccountsAsync(
            IReadOnlyCollection<Guid> ids,
            CancellationToken ct
        ) =>
            Task.FromResult<IReadOnlyDictionary<Guid, AccountDirectoryEntry>>(
                new Dictionary<Guid, AccountDirectoryEntry>()
            );

        public Task<AccountDirectoryEntry?> ResolveExactUsernameAsync(
            string username,
            CancellationToken ct
        ) =>
            Task.FromResult<AccountDirectoryEntry?>(
                username == "member"
                    ? new(member, member, "member", "Member", [AccountRole.Coach])
                    : null
            );
    }

    private sealed class TestPlatformCurrencyConverter : IPlatformCurrencyConverter
    {
        public Task<PlatformCurrencyQuote> ConvertAsync(
            decimal amount,
            string baseCurrency,
            string targetCurrency,
            CancellationToken ct
        ) =>
            Task.FromResult(
                new PlatformCurrencyQuote(
                    amount,
                    targetCurrency,
                    baseCurrency == targetCurrency ? "" : "test-fx",
                    "Test",
                    "2026-10-08"
                )
            );
    }

    [CatalogPostgresFact]
    public async Task Team_checkout_requires_explicit_organization_quote()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        await using var services = PlatformServices(Guid.NewGuid(), isolated.Connection);
        await using var scope = services.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        await Assert.ThrowsAsync<ApiException>(() =>
            service.CheckoutAsync(new("Team", "legacy", TeamName: "Test team"), default)
        );
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Empty(await db.Teams.ToArrayAsync());
        Assert.Empty(await db.Payments.ToArrayAsync());
    }

    private static ServiceProvider PlatformServices(
        Guid user,
        string connection,
        Clock? clock = null,
        IPaymentProvider? provider = null,
        string? amount = "39.99"
    )
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["Billing:PlatformPlans:Pro:Amount"] = amount,
                    ["Billing:PlatformPlans:Pro:PriceVersion"] = "eur-monthly-v3-Pro",
                    ["Billing:PlatformPlans:Pro:Currency"] = "EUR",
                }
            )
            .Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(NpgsqlDataSource.Create(connection));
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton<IAccountContext>(new Account(user));
        services.AddSingleton<IFeatureAccessService>(new Features());
        services.AddSingleton<IAccountProfileFields>(new Profiles());
        services.AddSingleton<IRelationshipAccessPolicy>(new Policy());
        services.AddSingleton<TimeProvider>(clock ?? new Clock(DateTimeOffset.UtcNow));
        if (provider != null)
            services.AddSingleton(provider);
        services.AddForms(config);
        services.AddOffers(config);
        services.AddBilling(config);
        services.AddNotifications(config);
        services.AddSingleton<IPlatformCurrencyConverter>(new TestPlatformCurrencyConverter());
        return services.BuildServiceProvider();
    }
}
