using Metrivum.Billing.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Features;
using Metrivum.Billing.Infrastructure;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Metrivum.IntegrationTests;

public sealed partial class OffersBillingTests
{
    [CatalogPostgresFact]
    public async Task Session_validity_starts_at_settlement_and_retries_cannot_extend_it()
    {
        await VerifySessionValidity(BillingModel.PerSession, false, false);
        await VerifySessionValidity(BillingModel.CustomPackage, true, false);
        await VerifySessionValidity(BillingModel.FixedPackage, false, true);
    }

    private static async Task VerifySessionValidity(BillingModel model, bool external, bool free)
    {
        await using var database = await IsolatedDatabase.CreateAsync();
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        var clock = new Clock(DateTimeOffset.Parse("2026-03-20T12:00:00Z"));
        await using var owner = Services(coach, database: database.Connection, clock: clock);
        await using var buyer = Services(client, database: database.Connection, clock: clock);
        await using var scope = owner.CreateAsyncScope();
        var offers = scope.ServiceProvider.GetRequiredService<OffersService>();
        var draft = await CreateOffer(scope);
        var option = draft.BillingOptions.Single(x => x.Model == model) with
        {
            ValidityDays = 30,
            Price = free ? 0 : 10,
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
        var revision = await offers.GetCurrentAsync(draft.Id, default);
        Assert.Equal(30, revision.BillingOptions.Single().ValidityDays);
        var billing = scope.ServiceProvider.GetRequiredService<BillingService>();
        var command = new CreateServiceOrderCommand(
            Guid.NewGuid(),
            Guid.NewGuid(),
            coach,
            client,
            revision.Id,
            option.Id,
            model == BillingModel.CustomPackage ? 2 : null,
            clock.Now.AddDays(10),
            external ? SettlementMode.External : SettlementMode.Simulated
        );
        var order = await billing.CreateForServiceAsync(command, default);
        var dues = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        var dueBefore = await dues.Dues.AsNoTracking().SingleAsync(x => x.Id == order.PaymentDueId);
        if (!free)
            Assert.Null(dueBefore.ValidUntil);
        else
        {
            Assert.Equal(DueStatus.Free, dueBefore.Status);
            Assert.Equal(clock.Now, dueBefore.SettledAt);
            Assert.Equal(clock.Now.AddDays(30), dueBefore.ValidUntil);
            Assert.Equal("ZeroPrice", dueBefore.SettlementSource);
            Assert.False(await dues.Attempts.AnyAsync(x => x.DueId == order.PaymentDueId));
        }
        var changed = await offers.UpdateAsync(
            draft.Id,
            request with
            {
                BillingOptions = [option with { ValidityDays = 5 }],
            },
            published.Version,
            default
        );
        await offers.PublishAsync(draft.Id, changed.Version, default);
        Assert.Equal(
            30,
            (await offers.GetRevisionAsync(revision.Id, default))
                .BillingOptions.Single()
                .ValidityDays
        );
        await using var buyerScope = buyer.CreateAsyncScope();
        var buyerBilling = buyerScope.ServiceProvider.GetRequiredService<BillingService>();
        Task<PaymentResultDto> Pay() =>
            external
                ? billing.ExternalAsync(
                    order.PaymentDueId,
                    new("Bank", "validity-payment"),
                    default
                )
                : buyerBilling.PayAsync(order.PaymentDueId, new(null, "validity-payment"), default);
        if (!free)
            clock.Now = clock.Now.AddDays(2);
        var paid = await Pay();
        var expected = clock.Now.AddDays(30);
        Assert.Equal(expected, paid.Due.ValidUntil);
        Assert.False(paid.Due.IsExpired);
        Assert.Equal(
            expected,
            (await billing.GetServiceStatesAsync([command.ServiceId], default))[
                command.ServiceId
            ].ValidUntil
        );
        clock.Now = expected.AddTicks(-10);
        Assert.False(
            (await billing.GetServiceStatesAsync([command.ServiceId], default))[
                command.ServiceId
            ].IsExpired
        );
        clock.Now = expected;
        Assert.True(
            (await billing.GetServiceStatesAsync([command.ServiceId], default))[
                command.ServiceId
            ].IsExpired
        );
        Assert.Equal(expected, (await Pay()).Due.ValidUntil);
        await Assert.ThrowsAsync<PostgresException>(() =>
            dues.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE billing.payment_dues SET \"ValidityDays\"=31 WHERE \"Id\"={order.PaymentDueId}"
            )
        );
    }
}
