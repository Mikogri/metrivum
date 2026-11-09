using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Metrivum.Billing.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.BuildingBlocks;
using Metrivum.Offers.Contracts;

namespace Metrivum.Billing.Features;

/// <summary>Creates service orders and payment schedules and records simulated settlements in the Billing database.</summary>
public sealed partial class BillingService
{
    public Task<ServiceOrderSnapshot> CreateForPlanPurchaseAsync(CreatePlanPurchaseOrderCommand command, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        if (command.ApplicationId == Guid.Empty || command.TrainingPlanRevisionId == Guid.Empty || command.CoachId != accounts.UserId || command.CoachId == command.ClientId || !Enum.IsDefined(command.SettlementMode))
            throw ApiException.Invalid("Invalid plan purchase.");
        if (command.TeamId is { } team)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + team}, 0))", token);
        await RequirePlanSellerAsync(command.TeamId, token);
        await Lock("plan-purchase:" + command.ApplicationId, token);
        var existing = await db.Orders.AsNoTracking().SingleOrDefaultAsync(x => x.ApplicationId == command.ApplicationId, token);
        if (existing != null)
        {
            if (existing.CoachId != command.CoachId || existing.ClientId != command.ClientId || existing.OfferRevisionId != command.OfferRevisionId || existing.BillingOptionId != command.BillingOptionId || existing.TrainingPlanRevisionId != command.TrainingPlanRevisionId || existing.TeamId != command.TeamId || existing.SettlementMode != command.SettlementMode)
                throw ApiException.Conflict("Purchase is already bound to different terms.");
            return await Snapshot(existing, token);
        }
        var quote = await offers.QuoteAsync(command.OfferRevisionId, command.BillingOptionId, null, token);
        if (quote.Purpose != OfferPurpose.TrainingPlan || quote.BillingOption.Model != BillingModel.OneTime || quote.CoachId != command.CoachId || quote.TeamId != command.TeamId)
            throw ApiException.NotFound();
        var rate = command.SettlementMode == SettlementMode.External ? 0 : await FeeRateAsync(command.CoachId, token, command.TeamId);
        var split = BillingRules.Split(quote.Amount, rate);
        var order = new Order { Id = Guid.NewGuid(), Context = BillingContext.TrainingPlan, ApplicationId = command.ApplicationId,
            TrainingPlanRevisionId = command.TrainingPlanRevisionId, CoachId = command.CoachId, ClientId = command.ClientId, TeamId = command.TeamId,
            OfferRevisionId = quote.RevisionId, BillingOptionId = quote.BillingOption.Id, Name = quote.Name, OptionSnapshot = JsonSerializer.Serialize(quote.BillingOption),
            Amount = quote.Amount, Currency = quote.Currency, FeeRate = rate, FeeAmount = split.Fee, CoachNetAmount = split.Net,
            SettlementMode = command.SettlementMode, StartedAt = clock.GetUtcNow(), CreatedAt = clock.GetUtcNow() };
        db.Orders.Add(order);
        var due = NewDue(order, 0);
        due.Context = BillingContext.TrainingPlan;
        db.Dues.Add(due);
        await (trainingPurchases ?? throw ApiException.Conflict("Plan delivery is unavailable.")).PrepareAsync(order.Id, command.ApplicationId, command.TrainingPlanRevisionId, command.CoachId, command.ClientId, command.TeamId, token);
        if (order.Amount == 0) await Settle(due, null, null, "ZeroPrice", "zero:" + due.Id, null, false);
        await db.SaveChangesAsync(token);
        await Publish(due, due.Status == DueStatus.AwaitingPayment ? "PaymentDue" : "PaymentConfirmed", token);
        return await Snapshot(order, token);
    }, ct);

    public async Task<PaymentDueDto> PlanPurchaseDueAsync(Guid orderId, CancellationToken ct)
    {
        var due = await db.Dues.AsNoTracking().SingleOrDefaultAsync(x => x.OrderId == orderId && x.Context == BillingContext.TrainingPlan &&
            (x.ClientId == accounts.UserId || x.CoachId == accounts.UserId), ct) ?? throw ApiException.NotFound();
        if (due.ClientId == accounts.UserId) await Client("billing.read-own", ct);
        else await RequirePlanSellerAsync(due.TeamId, ct);
        return DueDto(due);
    }
    private async Task RequirePlanSellerAsync(Guid? teamId, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        if (teamId is { } team)
            await (teams ?? throw ApiException.NotFound()).RequireAsync(team, accounts.UserId, true, ct);
    }

    public async Task<PaymentDueDto> PlanPurchaseApplicationDueAsync(Guid applicationId, CancellationToken ct)
    {
        var orderId = await db.Orders.Where(x => x.ApplicationId == applicationId && x.Context == BillingContext.TrainingPlan &&
            (x.CoachId == accounts.UserId || x.ClientId == accounts.UserId)).Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct) ?? throw ApiException.NotFound();
        return await PlanPurchaseDueAsync(orderId, ct);
    }
}
