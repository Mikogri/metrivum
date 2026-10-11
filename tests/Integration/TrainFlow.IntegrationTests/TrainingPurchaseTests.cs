using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Billing.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.Billing.Features;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.Offers.Contracts;
using TrainFlow.Offers.Features;
using TrainFlow.Training.Domain;
using TrainFlow.Training.Infrastructure;
using TrainFlow.Training.Purchases;

namespace TrainFlow.IntegrationTests;
public sealed partial class OffersBillingTests
{
    [CatalogPostgresFact]
    public async Task Purchased_plan_is_withheld_until_payment_and_delivered_once_as_an_independent_copy()
    {
        await VerifyPlanPurchase(false, false);
        await VerifyPlanPurchase(true, false);
        await VerifyPlanPurchase(false, true);
    }
    private static async Task VerifyPlanPurchase(bool external, bool free)
    {
        await using var database = await IsolatedDatabase.CreateAsync();
        var coach = Guid.NewGuid(); var client = Guid.NewGuid();
        await using var seller = Services(coach, database: database.Connection);
        await using var buyer = Services(client, database: database.Connection);
        await using var sellerScope = seller.CreateAsyncScope();
        await using var buyerScope = buyer.CreateAsyncScope();
        var offers = sellerScope.ServiceProvider.GetRequiredService<OffersService>();
        var offer = await CreateOffer(sellerScope);
        var option = new BillingOptionSnapshot(Guid.NewGuid(), "Plan copy", BillingModel.OneTime, free ? 0 : 25);
        offer = await offers.UpdateAsync(offer.Id, new(offer.Name, offer.Description, offer.Category, offer.CoachingMode, offer.ApplicationFormVersionId, [], [option], Purpose: OfferPurpose.TrainingPlan), offer.Version, default);
        offer = await offers.PublishAsync(offer.Id, offer.Version, default);
        Assert.Equal(OfferPurpose.TrainingPlan, (await offers.GetCurrentAsync(offer.Id, default)).Purpose);
        var training = sellerScope.ServiceProvider.GetRequiredService<TrainingDbContext>();
        var setId = Guid.NewGuid();
        var exercise = new ExerciseInstance(Guid.NewGuid(), Guid.NewGuid(), "", [new(setId, SetKind.Standard, new(LoadFormula: new(Guid.NewGuid(), 1, null, [])))]);
        var document = new TrainingDocument(1, [new(Guid.NewGuid(), "B", "", [new(Guid.NewGuid(), "C", "", 1, [new(Guid.NewGuid(), 1, [new(Guid.NewGuid(), "W", "", [exercise], [])])])])]);
        var plan = new TrainingPlan { Id = Guid.NewGuid(), OwnerId = coach, WorkspaceId = coach, Name = "Sold plan", Draft = document };
        var revision = new TrainingRevision { Id = Guid.NewGuid(), PlanId = plan.Id, Number = 1, DraftVersion = 1, IdempotencyKey = "sale", RequestHash = "sale", Snapshot = new(1, "Sold plan", "Accepted content", DocumentKind.Program, plan.Draft, [], new() { [setId] = new("privateExpression", 1, [], new(70, Unit.Kg)) }) };
        training.AddRange(plan, revision); await training.SaveChangesAsync();
        var billing = sellerScope.ServiceProvider.GetRequiredService<BillingService>();
        await using var strangerProvider = Services(Guid.NewGuid(), database: database.Connection);
        await using var stranger = strangerProvider.CreateAsyncScope();

        var command = new CreatePlanPurchaseOrderCommand(Guid.NewGuid(), coach, client, offer.CurrentPublishedRevisionId!.Value, option.Id, revision.Id, external ? SettlementMode.External : SettlementMode.Simulated);
        var order = await billing.CreateForPlanPurchaseAsync(command, default);
        Assert.Equal(order.OrderId, (await billing.CreateForPlanPurchaseAsync(command, default)).OrderId);
        Assert.Equal(404, (await Assert.ThrowsAsync<TrainFlow.BuildingBlocks.ApiException>(() => stranger.ServiceProvider.GetRequiredService<BillingService>().PlanPurchaseDueAsync(order.OrderId, default))).Status);
        Assert.Empty((await stranger.ServiceProvider.GetRequiredService<TrainingPurchaseService>().ListAsync(1, 20, default)).Items);
        Assert.Equal(404, (await Assert.ThrowsAsync<TrainFlow.BuildingBlocks.ApiException>(() => billing.CreateForPlanPurchaseAsync(command with { ApplicationId = Guid.NewGuid(), TrainingPlanRevisionId = Guid.NewGuid() }, default))).Status);

        if (external)
        {
            // A stored seller id must not retain Team authority after membership is removed.
            var billingDb = sellerScope.ServiceProvider.GetRequiredService<BillingDbContext>();
            var teamOrder = await billingDb.Orders.AsNoTracking().SingleAsync(x => x.Id == order.OrderId);
            teamOrder.Id = Guid.NewGuid(); teamOrder.ApplicationId = Guid.NewGuid(); teamOrder.TeamId = Guid.NewGuid(); teamOrder.ClientId = Guid.NewGuid();
            var teamDue = await billingDb.Dues.AsNoTracking().SingleAsync(x => x.Id == order.PaymentDueId);
            teamDue.Id = Guid.NewGuid(); teamDue.OrderId = teamOrder.Id; teamDue.TeamId = teamOrder.TeamId; teamDue.ClientId = teamOrder.ClientId;
            billingDb.AddRange(teamOrder, teamDue); await billingDb.SaveChangesAsync();
            var receipt = await training.Set<TrainingPurchase>().AsNoTracking().SingleAsync(x => x.OrderId == order.OrderId);
            receipt.OrderId = teamOrder.Id; receipt.ApplicationId = teamOrder.ApplicationId.Value; receipt.TeamId = teamOrder.TeamId; receipt.BuyerId = teamOrder.ClientId;
            training.Add(receipt); await training.SaveChangesAsync();
            Assert.Equal(404, (await Assert.ThrowsAsync<TrainFlow.BuildingBlocks.ApiException>(() => billing.PlanPurchaseDueAsync(teamOrder.Id, default))).Status);
            Assert.Equal(404, (await Assert.ThrowsAsync<TrainFlow.BuildingBlocks.ApiException>(() => billing.ExternalAsync(teamDue.Id, new("Bank", "revoked"), default))).Status);
            Assert.False(await billingDb.Payments.AnyAsync(x => x.DueId == teamDue.Id));
        }

        var owned = buyerScope.ServiceProvider.GetRequiredService<TrainingPurchaseService>();
        if (!free) Assert.Null(Assert.Single((await owned.ListAsync(1, 20, default)).Items).PlanId);
        var buyerBilling = buyerScope.ServiceProvider.GetRequiredService<BillingService>();
        if (!free && !external)
        {
            var decline = await buyerBilling.AddMethodAsync(new("Decline", SimulatedOutcome.Decline), default);
            var failed = await buyerBilling.PayAsync(order.PaymentDueId, new(decline.Id, "decline"), default);
            Assert.Equal(DueStatus.AwaitingPayment, failed.Due.Status);
            Assert.Null(Assert.Single((await owned.ListAsync(1, 20, default)).Items).PlanId);
        }
        async Task<PaymentResultDto> Pay()
        {
            await using var retryScope = (external ? seller : buyer).CreateAsyncScope();
            var service = retryScope.ServiceProvider.GetRequiredService<BillingService>();
            return external ? await service.ExternalAsync(order.PaymentDueId, new("Bank", "paid"), default) : await service.PayAsync(order.PaymentDueId, new(null, "paid"), default);
        }
        var attempts = await Task.WhenAll(Pay(), Pay());
        var paid = attempts[0];
        Assert.Equal(free ? DueStatus.Free : external ? DueStatus.PaidExternally : DueStatus.Paid, paid.Due.Status);
        Assert.Null(paid.Due.ServiceId); Assert.Null(paid.Due.RelationshipId);
        await Pay();
        var received = Assert.Single((await owned.ListAsync(1, 20, default)).Items);
        Assert.NotNull(received.PlanId);
        var copy = await training.Plans.AsNoTracking().SingleAsync(x => x.Id == received.PlanId);
        Assert.Equal(client, copy.OwnerId); Assert.NotEqual(plan.Id, copy.Id);
        var prescription = Assert.Single(DocumentRules.Sets(copy.Draft)).Prescription;
        Assert.Null(prescription.LoadFormula); Assert.Equal(new Quantity(70, Unit.Kg), prescription.Load!.Minimum);
        Assert.Empty((await training.Revisions.SingleAsync(x => x.PlanId == copy.Id)).Snapshot.Formulas);
        var immutable = await Assert.ThrowsAsync<Npgsql.PostgresException>(() => training.Database.ExecuteSqlInterpolatedAsync($"UPDATE training.purchases SET \"Name\"='tampered' WHERE \"OrderId\"={order.OrderId}"));
        Assert.Equal("23514", immutable.SqlState);
        plan.Name = "Changed source"; plan.Archived = true; await training.SaveChangesAsync();
        Assert.Equal("Sold plan", (await training.Plans.AsNoTracking().SingleAsync(x => x.Id == received.PlanId)).Name);
        Assert.Equal(1, await training.Plans.CountAsync(x => x.OwnerId == client));
        Assert.Equal(1, await sellerScope.ServiceProvider.GetRequiredService<BillingDbContext>().Payments.CountAsync(x => x.DueId == order.PaymentDueId));
    }
}
