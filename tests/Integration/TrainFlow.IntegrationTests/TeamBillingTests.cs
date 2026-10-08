using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.Billing.Features;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.BuildingBlocks;
namespace TrainFlow.IntegrationTests;

public sealed partial class OffersBillingTests
{
    private static ServiceProvider TeamServices(Guid user, string connection, Clock clock, IPaymentProvider? provider = null)
    {
        var services = PlatformServices(user, connection, clock, provider, amount: "100");
        var config = services.GetRequiredService<IConfiguration>();
        config["Billing:PlatformPlans:Pro:Currency"] = "PLN";
        config["Billing:PlatformPlans:Team:Amount"] = "100";
        config["Billing:PlatformPlans:Team:Currency"] = "PLN";
        config["Billing:PlatformPlans:Team:PriceVersion"] = "team-v1";
        ((Profiles)services.GetRequiredService<IAccountProfileFields>()).Currency = "PLN";
        return services;
    }
    private static TeamBillingService TeamBilling(AsyncServiceScope scope) => ActivatorUtilities.CreateInstance<TeamBillingService>(scope.ServiceProvider);

    [CatalogPostgresFact]
    public async Task Team_pro_credit_100_50_300_250_settles_once_with_full_new_period()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(Guid.NewGuid(), isolated.Connection, clock);
        await using (var scope = services.CreateAsyncScope())
        {
            var pro = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
            var checkout = await pro.CheckoutAsync(new("Pro", "test-v1"), default);
            await pro.ConfirmAsync(new(checkout.PendingDue!.Id, "pro"), default);
        }
        clock.Now = clock.Now.AddDays(14);
        TeamBillingQuoteDto quote;
        TeamBillingQuoteDto other;
        await using (var scope = services.CreateAsyncScope())
        {
            var team = TeamBilling(scope);
            quote = await team.QuoteAsync(new("Coaches", 3, "team-v1"), default);
            other = await team.QuoteAsync(new("Other tab", 3, "team-v1"), default);
            Assert.Equal(300m, quote.GrossAmount);
            Assert.Equal(50m, quote.CreditAmount);
            Assert.Equal(250m, quote.AmountDue);
            Assert.Empty(await scope.ServiceProvider.GetRequiredService<BillingDbContext>().Teams.ToArrayAsync());
        }
        clock.Now = clock.Now.AddMinutes(1);
        async Task<TeamBillingDto> Confirm(string key)
        {
            await using var scope = services.CreateAsyncScope();
            return await TeamBilling(scope).ConfirmAsync(new(quote.Id, key), default);
        }
        var results = await Task.WhenAll(Confirm("first"), Confirm("second"));
        Assert.All(results, x => { Assert.Equal(clock.Now, x.PeriodStart); Assert.Equal(clock.Now.AddMonths(1), x.PeriodEnd); Assert.Equal(1, x.OccupiedSeats); });
        await using var verify = services.CreateAsyncScope();
        var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Single(await db.Teams.ToArrayAsync());
        Assert.Equal(2, await db.Payments.CountAsync());
        Assert.Equal(50m, (await db.Set<ProrationCredit>().SingleAsync()).Amount);
        var individual = await db.PlatformSubscriptions.SingleAsync();
        Assert.Equal("Upgraded", individual.Status);
        Assert.Equal("Free", individual.PlanId);
        Assert.False(individual.AutoRenew);
        Assert.Equal(clock.Now, individual.PeriodEnd);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => TeamBilling(verify).ConfirmAsync(new(other.Id, "other"), default))).Status);
        Assert.Empty(await verify.ServiceProvider.GetRequiredService<BillingService>().EarningsAsync(default));
    }

    [CatalogPostgresFact]
    public async Task Team_seat_adjustments_keep_paid_end_and_cancellation_expires_without_dissolution()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(Guid.NewGuid(), isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var service = TeamBilling(scope);
        var quote = await service.QuoteAsync(new("Seats", 2, "team-v1"), default);
        Assert.Equal(0m, quote.CreditAmount);
        var active = await service.ConfirmAsync(new(quote.Id, "initial"), default);
        var end = active.PeriodEnd;
        clock.Now = clock.Now.AddDays(14);
        var increase = await service.SeatQuoteAsync(active.TeamId, new(4, active.Version), default);
        Assert.Equal(100m, increase.AmountDue);
        active = await service.SeatConfirmAsync(active.TeamId, new(increase.Id, "seats"), default);
        Assert.Equal(end, active.PeriodEnd);
        Assert.Equal(4, active.PurchasedSeats);
        var decrease = await service.SeatQuoteAsync(active.TeamId, new(1, active.Version), default);
        Assert.Null((await service.BillingAsync(active.TeamId, default)).PendingSeats);
        active = await service.SeatConfirmAsync(active.TeamId, new(decrease.Id, "decrease"), default);
        Assert.Equal(4, active.PurchasedSeats);
        Assert.Equal(1, active.PendingSeats);
        active = await service.RenewalAsync(active.TeamId, new(active.Version, false), default);
        Assert.Equal("Active", active.Status);
        clock.Now = end;
        await service.ProcessRenewalsAsync(10, default);
        Assert.Equal("BillingInactive", (await service.BillingAsync(active.TeamId, default)).Status);
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Equal("BillingInactive", (await db.Teams.SingleAsync()).Status);
        Assert.Equal(2, await db.Payments.CountAsync());
        var renew = await service.RenewalQuoteAsync(active.TeamId, default);
        Assert.Equal(100m, renew.AmountDue);
        active = await service.SeatConfirmAsync(active.TeamId, new(renew.Id, "renew"), default);
        Assert.Equal("Active", active.Status);
        Assert.Equal(1, active.PurchasedSeats);
    }

    [CatalogPostgresFact]
    public async Task Pro_confirmation_begins_full_cycle_and_free_change_preserves_paid_pro()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(Guid.NewGuid(), isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var pro = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        var quote = await pro.CheckoutAsync(new("Pro", "test-v1"), default);
        clock.Now = clock.Now.AddDays(2);
        var active = await pro.ConfirmAsync(new(quote.PendingDue!.Id, "confirm"), default);
        Assert.Equal(clock.Now, active.PeriodStart);
        Assert.Equal(clock.Now.AddMonths(1), active.PeriodEnd);
        var scheduled = await pro.ChangeAsync(new("Free", active.Version), default);
        Assert.Equal("Pro", scheduled.PlanId);
        Assert.Equal("Free", scheduled.PendingPlanId);
        clock.Now = clock.Now.AddDays(14);
        Assert.True((await TeamBilling(scope).QuoteAsync(new("Paid cancelled Pro", 3, "team-v1"), default)).CreditAmount > 0);
    }

    [CatalogPostgresFact]
    public async Task Team_missing_price_currency_mismatch_excess_credit_and_expired_quotes_are_blocked()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(Guid.NewGuid(), isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var team = TeamBilling(scope);
        var config = services.GetRequiredService<IConfiguration>();
        config["Billing:PlatformPlans:Team:Amount"] = null;
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => team.QuoteAsync(new("Missing", 1, "team-v1"), default))).Status);
        config["Billing:PlatformPlans:Team:Amount"] = "100";
        var freeQuote = await team.QuoteAsync(new("Expired", 1, "team-v1"), default);
        clock.Now = clock.Now.AddMinutes(16);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => team.ConfirmAsync(new(freeQuote.Id, "expired"), default))).Status);
        var pro = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        var checkout = await pro.CheckoutAsync(new("Pro", "test-v1"), default);
        await pro.ConfirmAsync(new(checkout.PendingDue!.Id, "pro"), default);
        ((Profiles)services.GetRequiredService<IAccountProfileFields>()).Currency = "EUR";
        config["Billing:PlatformPlans:Team:Currency"] = "EUR";
        config["Billing:PlatformPlans:Team:PriceVersion"] = "team-eur";
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => team.QuoteAsync(new("FX", 1, "team-eur"), default))).Status);
        ((Profiles)services.GetRequiredService<IAccountProfileFields>()).Currency = "PLN";
        config["Billing:PlatformPlans:Team:Currency"] = "PLN";
        config["Billing:PlatformPlans:Team:Amount"] = "10";
        config["Billing:PlatformPlans:Team:PriceVersion"] = "team-low";
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => team.QuoteAsync(new("Credit", 1, "team-low"), default))).Status);
    }

    [CatalogPostgresFact]
    public async Task Team_billing_is_owner_only_and_zero_due_credit_is_settled_without_bank_transaction()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(Guid.NewGuid(), isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var pro = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        var checkout = await pro.CheckoutAsync(new("Pro", "test-v1"), default);
        await pro.ConfirmAsync(new(checkout.PendingDue!.Id, "pro"), default);
        var service = TeamBilling(scope);
        var quote = await service.QuoteAsync(new("Credit funded", 1, "team-v1"), default);
        Assert.Equal(0m, quote.AmountDue);
        Assert.Equal(100m, quote.CreditAmount);
        var active = await service.ConfirmAsync(new(quote.Id, "credit"), default);
        Assert.Equal("Active", active.Status);
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Equal(2, await db.Payments.CountAsync());
        Assert.Equal(1, await db.Transactions.CountAsync());
        Assert.Equal(2, await db.Attempts.CountAsync());
        await using var stranger = TeamServices(Guid.NewGuid(), isolated.Connection, clock);
        await using var strangerScope = stranger.CreateAsyncScope();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => TeamBilling(strangerScope).BillingAsync(active.TeamId, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => TeamBilling(strangerScope).ConfirmAsync(new(quote.Id, "steal"), default))).Status);
    }

    [CatalogPostgresFact]
    public async Task Team_automatic_renewal_is_concurrent_safe_and_uses_next_cycle_seats()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(Guid.NewGuid(), isolated.Connection, clock);
        await using (var scope = services.CreateAsyncScope())
        {
            var method = await scope.ServiceProvider.GetRequiredService<BillingService>().AddMethodAsync(new("Explicit renewal"), default);
            var service = TeamBilling(scope);
            var quote = await service.QuoteAsync(new("Renew", 3, "team-v1", true, method.Id), default);
            var active = await service.ConfirmAsync(new(quote.Id, "first", method.Id), default);
            var decrease = await service.SeatQuoteAsync(active.TeamId, new(1, active.Version), default);
            await service.SeatConfirmAsync(active.TeamId, new(decrease.Id, "decrease"), default);
        }
        clock.Now = clock.Now.AddMonths(1);
        async Task Work()
        {
            await using var scope = services.CreateAsyncScope();
            await TeamBilling(scope).ProcessRenewalsAsync(10, default);
        }
        await Task.WhenAll(Work(), Work());
        await Work();
        await using var verify = services.CreateAsyncScope();
        var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
        var subscription = await db.Set<TeamPlatformSubscription>().SingleAsync();
        Assert.Equal(1, subscription.PurchasedSeats);
        Assert.Equal(clock.Now.AddMonths(1), subscription.PeriodEnd);
        Assert.Equal(2, await db.Payments.CountAsync());
        Assert.Equal(400m, await db.Payments.SumAsync(x => x.GrossAmount));
    }

    [CatalogPostgresFact]
    public async Task Team_finance_keeps_private_and_other_teams_and_platform_revenue_out_of_totals()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var coach = Guid.NewGuid();
        var team = Guid.NewGuid();
        var clock = new Clock(new(2026, 2, 15, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(coach, isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        foreach (var item in new[] { (Team: (Guid?)null, Amount: 100m, Context: BillingContext.CoachingService), (Team: (Guid?)team, Amount: 40m, Context: BillingContext.CoachingService), (Team: (Guid?)Guid.NewGuid(), Amount: 999m, Context: BillingContext.CoachingService), (Team: (Guid?)team, Amount: 777m, Context: BillingContext.Platform) })
        {
            var client = Guid.NewGuid();
            var caseId = item.Team == null ? (Guid?)null : Guid.NewGuid();
            var order = new Order { OptionSnapshot = "{\"Model\":\"PerSession\"}", Id = Guid.NewGuid(), TeamId = item.Team, TeamClientCaseId = caseId, Context = item.Context, ServiceId = Guid.NewGuid(), RelationshipId = Guid.NewGuid(), CoachId = coach, ClientId = client, Amount = item.Amount, CoachNetAmount = item.Amount, Currency = "PLN", CreatedAt = clock.Now, StartedAt = clock.Now };
            var due = new PaymentDue { Id = Guid.NewGuid(), TeamId = item.Team, TeamClientCaseId = caseId, Context = item.Context, OrderId = order.Id, ServiceId = order.ServiceId, RelationshipId = order.RelationshipId, CoachId = coach, ClientId = client, Amount = item.Amount, CoachNetAmount = item.Amount, Currency = "PLN", CreatedAt = clock.Now, PeriodStart = clock.Now, DueAt = clock.Now, Status = DueStatus.Paid, SettledAt = clock.Now };
            db.Orders.Add(order);
            db.Dues.Add(due);
            db.Payments.Add(new Payment { Id = Guid.NewGuid(), TeamId = item.Team, TeamClientCaseId = caseId, Context = item.Context, DueId = due.Id, CoachId = coach, ClientId = client, GrossAmount = item.Amount, CoachNetAmount = item.Amount, Currency = "PLN", SettledAt = clock.Now });
        }
        await db.SaveChangesAsync();
        var analytics = new BillingAnalytics(db);
        var window = new TrainFlow.Analytics.Contracts.AnalysisWindow(new(2026, 2, 1), new(2026, 2, 28), "UTC", clock.Now.AddDays(-14), clock.Now.AddDays(14));
        var personal = new TrainFlow.Analytics.Contracts.AnalysisScope(coach, coach, window, null, null);
        Assert.Equal(100m, Assert.Single((await analytics.QueryAsync(personal, default)).Totals).Gross);
        Assert.Equal(40m, Assert.Single((await analytics.QueryAsync(personal with
        {
            TeamId = team
        }, default)).Totals).Gross);
        Assert.Empty((await analytics.QueryAsync(personal with
        {
            TeamId = team,
            MemberId = Guid.NewGuid()
        }, default)).Totals);
    }

    [CatalogPostgresFact]
    public async Task Team_declined_payment_keeps_credit_and_organization_unactivated_until_retry_succeeds()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(Guid.NewGuid(), isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var pro = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        var checkout = await pro.CheckoutAsync(new("Pro", "test-v1"), default);
        await pro.ConfirmAsync(new(checkout.PendingDue!.Id, "pro"), default);
        clock.Now = clock.Now.AddDays(14);
        var service = TeamBilling(scope);
        var quote = await service.QuoteAsync(new("Retry", 3, "team-v1"), default);
        var method = await scope.ServiceProvider.GetRequiredService<BillingService>().AddMethodAsync(new("Declined", SimulatedOutcome.Decline), default);
        var failed = await service.ConfirmAsync(new(quote.Id, "decline", method.Id), default);
        Assert.Equal("PaymentFailed", failed.Status);
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Empty(await db.Teams.ToArrayAsync());
        Assert.Empty(await db.Set<ProrationCredit>().ToArrayAsync());
        Assert.Equal("Pro", (await db.PlatformSubscriptions.SingleAsync()).PlanId);
        var due = failed.History.Single().DueId;
        var retry = await service.ConfirmAsync(new(quote.Id, "success"), default);
        Assert.Equal("Active", retry.Status);
        Assert.Equal(due, retry.History.Single().DueId);
        Assert.Single(await db.Teams.ToArrayAsync());
        Assert.Single(await db.Set<ProrationCredit>().ToArrayAsync());
        Assert.Equal(2, await db.Attempts.CountAsync(x => x.DueId == due));
        Assert.Equal(1, await db.Payments.CountAsync(x => x.DueId == due));
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => service.ConfirmAsync(new(quote.Id, "success", method.Id), default))).Status);
    }

    private sealed class AdvancingPaymentProvider(Clock clock) : IPaymentProvider
    {
        public Task<ProviderResult> ChargeAsync(ProviderCharge charge, CancellationToken ct)
        {
            clock.Now = clock.Now.AddMinutes(7);
            return new SimulatedPaymentProvider().ChargeAsync(charge, ct);
        }
    }

    [CatalogPostgresFact]
    public async Task Team_and_pro_cycles_begin_at_actual_settlement_when_provider_completes_later()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(Guid.NewGuid(), isolated.Connection, clock, new AdvancingPaymentProvider(clock));
        await using var scope = services.CreateAsyncScope();
        var pro = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        var checkout = await pro.CheckoutAsync(new("Pro", "test-v1"), default);
        var paidPro = await pro.ConfirmAsync(new(checkout.PendingDue!.Id, "pro-delayed"), default);
        Assert.Equal(clock.Now, paidPro.PeriodStart);
        Assert.Equal(clock.Now.AddMonths(1), paidPro.PeriodEnd);
        clock.Now = clock.Now.AddDays(14);
        var billing = TeamBilling(scope);
        var quote = await billing.QuoteAsync(new("Delayed settlement", 3, "team-v1"), default);
        Assert.Equal(50m, quote.CreditAmount);
        var paidTeam = await billing.ConfirmAsync(new(quote.Id, "team-delayed"), default);
        Assert.Equal(clock.Now, paidTeam.PeriodStart);
        Assert.Equal(clock.Now.AddMonths(1), paidTeam.PeriodEnd);
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        var dueId = paidTeam.History.Single().DueId;
        var due = await db.Dues.AsNoTracking().SingleAsync(x => x.Id == dueId);
        var payment = await db.Payments.AsNoTracking().SingleAsync(x => x.DueId == dueId);
        Assert.Equal(payment.SettledAt, due.PeriodStart);
        Assert.Equal(payment.SettledAt, (await db.PlatformSubscriptions.AsNoTracking().SingleAsync()).PeriodEnd);
    }

    [CatalogPostgresFact]
    public async Task Team_seat_reduction_and_renewal_changes_publish_durable_owner_notifications()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(owner, isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var billing = TeamBilling(scope);
        var quote = await billing.QuoteAsync(new("Notified", 3, "team-v1"), default);
        var paid = await billing.ConfirmAsync(new(quote.Id, "paid"), default);
        var decrease = await billing.SeatQuoteAsync(paid.TeamId, new(1, paid.Version), default);
        paid = await billing.SeatConfirmAsync(paid.TeamId, new(decrease.Id, "decrease"), default);
        var cancelDecrease = await billing.SeatQuoteAsync(paid.TeamId, new(3, paid.Version), default);
        paid = await billing.SeatConfirmAsync(paid.TeamId, new(cancelDecrease.Id, "cancel-decrease"), default);
        paid = await billing.RenewalAsync(paid.TeamId, new(paid.Version, false), default);
        var method = await scope.ServiceProvider.GetRequiredService<BillingService>().AddMethodAsync(new("Renew"), default);
        await billing.RenewalAsync(paid.TeamId, new(paid.Version, true, method.Id), default);
        var notifications = await scope.ServiceProvider.GetRequiredService<TrainFlow.Notifications.NotificationsDbContext>().Notifications
            .Where(x => x.SourceId == paid.TeamId && x.Type != "TeamPaymentConfirmed").ToArrayAsync();
        Assert.Equal(4, notifications.Length);
        Assert.All(notifications, x => { Assert.Equal(owner, x.RecipientUserId); Assert.True(x.Required); });
        Assert.Contains(notifications, x => x.Type == "TeamSeatReductionScheduled");
        Assert.Contains(notifications, x => x.Type == "TeamSeatReductionCancelled");
        Assert.Contains(notifications, x => x.Type == "TeamRenewalCancelled");
        Assert.Contains(notifications, x => x.Type == "TeamRenewalEnabled");
    }
}
