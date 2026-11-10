using Metrivum.Billing.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Features;
using Metrivum.Billing.Infrastructure;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed partial class OffersBillingTests
{
    [CatalogPostgresFact]
    public async Task Free_subscription_renews_without_payment_method_and_keeps_frozen_price()
    {
        await using var database = await IsolatedDatabase.CreateAsync();
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        var clock = new Clock(new(2026, 1, 31, 12, 0, 0, TimeSpan.Zero));
        var provider = new CountingProvider();
        await using var services = Services(
            coach,
            database: database.Connection,
            clock: clock,
            provider: provider
        );
        await using var scope = services.CreateAsyncScope();
        var offers = scope.ServiceProvider.GetRequiredService<OffersService>();
        var draft = await CreateOffer(scope);
        var option = draft.BillingOptions.Single(x =>
            x.Model == BillingModel.PeriodSubscription
        ) with
        {
            Price = 0,
        };
        var request = new OfferRequest(
            draft.Name,
            draft.Description,
            draft.Category,
            draft.CoachingMode,
            draft.ApplicationFormVersionId,
            draft.Tags,
            [option]
        );
        draft = await offers.UpdateAsync(draft.Id, request, draft.Version, default);
        var published = await offers.PublishAsync(draft.Id, draft.Version, default);
        var billing = scope.ServiceProvider.GetRequiredService<BillingService>();
        var order = await billing.CreateForServiceAsync(
            new(
                Guid.NewGuid(),
                Guid.NewGuid(),
                coach,
                client,
                published.CurrentPublishedRevisionId!.Value,
                option.Id,
                null,
                clock.Now
            ),
            default
        );
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.Equal(DueStatus.Free, (await db.Dues.AsNoTracking().SingleAsync()).Status);
        var subscription = await db.Subscriptions.AsNoTracking().SingleAsync();
        Assert.Null(subscription.PaymentMethodId);
        Assert.False(subscription.AutoRenew);

        draft = await offers.UpdateAsync(
            draft.Id,
            request with
            {
                BillingOptions = [option with { Price = 50 }],
            },
            published.Version,
            default
        );
        await offers.PublishAsync(draft.Id, draft.Version, default);
        clock.Now = clock.Now.AddMonths(1);
        Assert.Equal(1, await billing.GenerateRenewalsAsync(100, default));
        Assert.Equal(0, await billing.GenerateRenewalsAsync(100, default));
        var renewal = await db
            .Dues.AsNoTracking()
            .SingleAsync(x => x.OrderId == order.OrderId && x.Sequence == 1);
        Assert.Equal(0, renewal.Amount);
        Assert.Equal(DueStatus.Free, renewal.Status);
        Assert.Equal("ZeroPrice", renewal.SettlementSource);
        Assert.Equal(clock.Now, renewal.SettledAt);
        Assert.Equal(new DateTimeOffset(2026, 3, 31, 12, 0, 0, TimeSpan.Zero), renewal.PeriodEnd);
        Assert.Equal(2, await db.Payments.CountAsync());
        Assert.False(await db.Attempts.AnyAsync());
        Assert.Equal(0, provider.Calls);
    }
}
