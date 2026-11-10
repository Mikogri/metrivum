using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.Offers.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Billing.Features;

public sealed record SimulatedRefundRequest(string IdempotencyKey);

public sealed record SimulatedRefundDto(
    Guid Id,
    Guid PaymentId,
    decimal Amount,
    string Currency,
    DateTimeOffset CreatedAt,
    bool Simulated = true
);

/// <summary>Processes simulated platform refunds and records the corresponding Billing state transitions.</summary>
public sealed class PlatformRefundService(
    BillingDbContext db,
    IAccountContext account,
    ModuleTransaction transaction,
    TimeProvider clock
)
{
    public Task<SimulatedRefundDto> RefundAsync(
        Guid paymentId,
        SimulatedRefundRequest request,
        CancellationToken ct
    ) =>
        transaction.RunAsync(
            async token =>
            {
                await account.GetRolesAsync(token);
                if (
                    string.IsNullOrWhiteSpace(request.IdempotencyKey)
                    || request.IdempotencyKey.Length > 100
                )
                    throw ApiException.Invalid("A bounded idempotency key is required.");
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"SELECT pg_advisory_xact_lock(hashtextextended({"team:user:" + account.UserId}, 0))",
                    token
                );
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"SELECT pg_advisory_xact_lock(hashtextextended({"billing:platform:" + account.UserId}, 0))",
                    token
                );
                var payment =
                    await db
                        .Payments.AsNoTracking()
                        .SingleOrDefaultAsync(
                            x =>
                                x.Id == paymentId
                                && x.ClientId == account.UserId
                                && x.Context == BillingContext.Platform
                                && x.Mode == SettlementMode.Simulated,
                            token
                        )
                    ?? throw ApiException.NotFound();
                var existing = await db.Set<SimulatedRefund>()
                    .AsNoTracking()
                    .SingleOrDefaultAsync(x => x.PaymentId == paymentId, token);
                if (existing != null)
                    return Dto(existing);
                var at = clock.GetUtcNow();
                var due = await db
                    .Dues.AsNoTracking()
                    .SingleAsync(x => x.Id == payment.DueId, token);
                var quote = await db.Set<TeamBillingQuote>()
                    .SingleOrDefaultAsync(x => x.DueId == due.Id, token);
                if (quote != null)
                {
                    await db.Database.ExecuteSqlInterpolatedAsync(
                        $"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + quote.TeamId}, 0))",
                        token
                    );
                    var team =
                        await db.Teams.SingleOrDefaultAsync(
                            x => x.Id == quote.TeamId && x.OwnerId == account.UserId,
                            token
                        ) ?? throw ApiException.NotFound();
                    var subscription = await db.Set<TeamPlatformSubscription>()
                        .SingleAsync(x => x.TeamId == team.Id, token);
                    if (
                        subscription.AcceptedPriceId == quote.PriceId
                        && subscription.PeriodStart == due.PeriodStart
                        && subscription.PeriodEnd == due.PeriodEnd
                    )
                    {
                        subscription.Status = "BillingInactive";
                        subscription.AutoRenew = false;
                        subscription.PendingPlanId = null;
                        subscription.PendingSeats = null;
                        subscription.Version++;
                        if (team.Status == "Active")
                            team.Status = "BillingInactive";
                        team.Version++;
                    }
                    // A confirmed quote remains immutable. Refund state belongs to the refund ledger.
                    db.Set<TeamAudit>()
                        .Add(
                            new()
                            {
                                Id = Guid.NewGuid(),
                                TeamId = team.Id,
                                ActorId = account.UserId,
                                Action = "SimulatedPaymentRefunded",
                                CreatedAt = at,
                                Version = team.Version,
                            }
                        );
                }
                else
                {
                    var subscription = await db.PlatformSubscriptions.SingleOrDefaultAsync(
                        x => x.OwnerId == account.UserId,
                        token
                    );
                    if (subscription != null)
                    {
                        var acceptedPrice = await db
                            .PlanPrices.AsNoTracking()
                            .SingleOrDefaultAsync(x => x.Id == subscription.AcceptedPriceId, token);
                        var order = await db
                            .Orders.AsNoTracking()
                            .SingleAsync(x => x.Id == due.OrderId, token);
                        using var snapshot = System.Text.Json.JsonDocument.Parse(
                            order.OptionSnapshot
                        );
                        var samePrice =
                            acceptedPrice != null
                            && snapshot.RootElement.TryGetProperty("PlanId", out var planId)
                            && planId.GetString() == acceptedPrice.PlanId
                            && snapshot.RootElement.TryGetProperty("Version", out var version)
                            && version.GetString() == acceptedPrice.Version;
                        if (
                            samePrice
                            && subscription.PeriodStart == due.PeriodStart
                            && subscription.PeriodEnd == due.PeriodEnd
                        )
                        {
                            subscription.PlanId = "Free";
                            subscription.Status = "Active";
                            subscription.PeriodStart = null;
                            subscription.PeriodEnd = null;
                            subscription.NextDueAt = null;
                            subscription.AutoRenew = false;
                            subscription.PendingPlanId = null;
                            subscription.PendingDueId = null;
                            subscription.PendingPriceId = null;
                            subscription.Version++;
                            subscription.UpdatedAt = at;
                        }
                        db.PlanChanges.Add(
                            new()
                            {
                                Id = Guid.NewGuid(),
                                SubscriptionId = subscription.Id,
                                Type = "SimulatedPaymentRefunded",
                                PlanId = subscription.PlanId,
                                DueId = due.Id,
                                CreatedAt = at,
                                EffectiveAt = at,
                            }
                        );
                    }
                }
                var refund = new SimulatedRefund
                {
                    Id = Guid.NewGuid(),
                    PaymentId = payment.Id,
                    OwnerId = account.UserId,
                    IdempotencyKey = request.IdempotencyKey,
                    Amount = payment.GrossAmount,
                    Currency = payment.Currency,
                    CreatedAt = at,
                };
                db.Set<SimulatedRefund>().Add(refund);
                await db.SaveChangesAsync(token);
                return Dto(refund);
            },
            ct
        );

    internal static SimulatedRefundDto Dto(SimulatedRefund refund) =>
        new(refund.Id, refund.PaymentId, refund.Amount, refund.Currency, refund.CreatedAt);
}
