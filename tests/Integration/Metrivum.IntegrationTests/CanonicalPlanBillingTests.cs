using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.Access.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Features;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;

namespace Metrivum.IntegrationTests;

public sealed partial class OffersBillingTests
{
    [CatalogPostgresFact]
    public async Task Canonical_migrations_preserve_legacy_paid_period_price_and_commission_snapshots()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var clock = new Clock(new(2026, 2, 15, 0, 0, 0, TimeSpan.Zero));
        await using var services = PlatformServices(owner, isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        var price = new PlanPrice { Id = Guid.NewGuid(), PlanId = "Pro", Amount = 49.90m, Currency = "EUR", Version = "legacy-paid", TermsVersion = "v1", CreatedAt = clock.Now };
        db.PlanPrices.Add(price);
        db.PlatformSubscriptions.Add(new() { Id = Guid.NewGuid(), OwnerId = owner, PlanId = "Pro", AcceptedPriceId = price.Id, PeriodStart = clock.Now.AddDays(-10), PeriodEnd = clock.Now.AddDays(20), CreatedAt = clock.Now.AddDays(-10), UpdatedAt = clock.Now });
        var order = new Order { Id = Guid.NewGuid(), ServiceId = Guid.NewGuid(), RelationshipId = Guid.NewGuid(), CoachId = owner, ClientId = Guid.NewGuid(), Amount = 100, FeeRate = 0.05m, FeeAmount = 5, CoachNetAmount = 95, Currency = "EUR", OptionSnapshot = "{\"Model\":\"PerSession\"}", StartedAt = clock.Now, CreatedAt = clock.Now };
        var due = new PaymentDue { Id = Guid.NewGuid(), OrderId = order.Id, ServiceId = order.ServiceId, RelationshipId = order.RelationshipId, CoachId = owner, ClientId = order.ClientId, Amount = 100, FeeRate = 0.05m, FeeAmount = 5, CoachNetAmount = 95, Currency = "EUR", Status = DueStatus.Paid, SettledAt = clock.Now, PeriodStart = clock.Now, DueAt = clock.Now, CreatedAt = clock.Now };
        var payment = new Payment { Id = Guid.NewGuid(), DueId = due.Id, CoachId = owner, ClientId = order.ClientId, GrossAmount = 100, FeeRate = 0.05m, FeeAmount = 5, CoachNetAmount = 95, Currency = "EUR", SettledAt = clock.Now };
        db.Orders.Add(order); db.Dues.Add(due); db.Payments.Add(payment);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        await db.GetService<IMigrator>().MigrateAsync("20261020181746_PagedTeamReadIndexes");
        await db.Database.MigrateAsync();
        var plan = await scope.ServiceProvider.GetRequiredService<IPlanEntitlementsProvider>().GetAsync(owner, default);
        Assert.Equal("Pro", plan.PlanId);
        Assert.Equal(clock.Now.AddDays(20), plan.PeriodEnd);
        Assert.Equal(49.90m, (await db.PlanPrices.AsNoTracking().SingleAsync(x => x.Id == price.Id)).Amount);
        Assert.Equal(0.05m, (await db.Payments.AsNoTracking().SingleAsync(x => x.Id == payment.Id)).FeeRate);
        Assert.Equal(5, await db.PlatformPlans.CountAsync());
    }

    [CatalogPostgresFact]
    public async Task Canonical_personal_upgrade_downgrade_renewal_and_refunds_preserve_immutable_settlements()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = PlatformServices(owner, isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<PlatformSubscriptionService>();
        var plans = scope.ServiceProvider.GetRequiredService<IPlanEntitlementsProvider>();
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        var method = await scope.ServiceProvider.GetRequiredService<BillingService>().AddMethodAsync(new("Simulated renewal"), default);
        Assert.Equal("Free", (await plans.GetAsync(owner, default)).PlanId);
        var checkout = await service.CheckoutAsync(new("Starter", PlanCatalog.PriceVersion("Starter"), true, method.Id), default);
        Assert.Equal("Free", (await plans.GetAsync(owner, default)).PlanId);
        var starter = await service.ConfirmAsync(new(checkout.PendingDue!.Id, "starter", method.Id), default);
        Assert.Equal(5, (await plans.GetAsync(owner, default)).Limits["video.local_analyses_per_period"]);
        var oldStarter = await db.Payments.AsNoTracking().SingleAsync();
        clock.Now = clock.Now.AddDays(1);
        checkout = await service.CheckoutAsync(new("Pro", PlanCatalog.PriceVersion("Pro"), true, method.Id), default);
        Assert.Equal("Starter", (await plans.GetAsync(owner, default)).PlanId);
        var pro = await service.ConfirmAsync(new(checkout.PendingDue!.Id, "pro", method.Id), default);
        Assert.Equal(clock.Now, pro.PeriodStart);
        Assert.Equal(clock.Now.AddMonths(1), pro.PeriodEnd);
        Assert.True((await plans.GetAsync(owner, default)).PremiumFeatures.Contains("training.export.pdf"));
        var refund = scope.ServiceProvider.GetRequiredService<PlatformRefundService>();
        var refundedOld = await refund.RefundAsync(oldStarter.Id, new("old-period"), default);
        Assert.Equal(refundedOld.Id, (await refund.RefundAsync(oldStarter.Id, new("retry"), default)).Id);
        Assert.Equal("Pro", (await plans.GetAsync(owner, default)).PlanId);
        await service.ChangeAsync(new("Starter", pro.Version), default);
        clock.Now = pro.PeriodEnd!.Value;
        await service.ProcessRenewalsAsync(10, default);
        await service.ProcessRenewalsAsync(10, default);
        Assert.Equal("Starter", (await plans.GetAsync(owner, default)).PlanId);
        Assert.Equal(3, await db.Payments.CountAsync());
        Assert.All(await db.Payments.ToArrayAsync(), payment => Assert.Equal(0, payment.FeeAmount));
        var current = await db.Payments.AsNoTracking().OrderByDescending(x => x.SettledAt).FirstAsync();
        await refund.RefundAsync(current.Id, new("current-period"), default);
        Assert.Equal("Free", (await plans.GetAsync(owner, default)).PlanId);
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<IPlatformPlans>().GetPriorityCoachIdsAsync([owner], default));
        Assert.Equal(3, await db.Payments.CountAsync());
        Assert.Equal(2, (await service.HistoryAsync(default)).Refunds!.Count);
        Assert.Equal(starter.PeriodEnd, (await db.Dues.AsNoTracking().SingleAsync(x => x.Id == oldStarter.DueId)).PeriodEnd);
    }

    [CatalogPostgresFact]
    public async Task Canonical_workspace_allowances_are_shared_and_downgrade_preserves_over_seat_members()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var clock = new Clock(new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));
        await using var services = TeamServices(owner, isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var billing = TeamBilling(scope);
        var method = await scope.ServiceProvider.GetRequiredService<BillingService>().AddMethodAsync(new("Simulated renewal"), default);
        var quote = await billing.QuoteAsync(new("Studio", 10, PlanCatalog.PriceVersion("Studio"), true, method.Id, "Studio"), default);
        Assert.Equal(159, quote.GrossAmount); // Studio, euro catalog
        var active = await billing.ConfirmAsync(new(quote.Id, "studio", method.Id), default);
        var organization = Organization(scope, owner, clock);
        var members = new[] { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid() };
        foreach (var member in members)
        {
            var invite = await organization.RequestAsync(active.TeamId, new(member.ToString()), default);
            await Organization(scope, member, clock).DecideAsync(invite.Id, true, default);
        }
        var entitlements = scope.ServiceProvider.GetRequiredService<IPlanEntitlementsProvider>();
        Assert.Equal("Free", (await entitlements.GetAsync(members[0], default)).PlanId);
        Assert.Equal("Studio", (await entitlements.GetForFeaturesAsync(members[0], default)).PlanId);
        var shared = await entitlements.GetForTeamAsync(members[0], active.TeamId, default);
        Assert.Equal("Studio", shared.PlanId);
        Assert.Equal(active.TeamId, shared.ScopeId);
        Assert.Equal(90000, shared.Limits["video.cloud_gpu_seconds_per_period"]);
        var otherMember = await entitlements.GetForTeamAsync(members[1], active.TeamId, default);
        Assert.Equal(shared.ScopeId, otherMember.ScopeId);
        Assert.Equal(shared.PeriodStart, otherMember.PeriodStart);
        Assert.Equal(shared.PeriodEnd, otherMember.PeriodEnd);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => entitlements.GetForTeamAsync(Guid.NewGuid(), active.TeamId, default))).Status);
        var priority = await scope.ServiceProvider.GetRequiredService<IPlatformPlans>().GetPriorityCoachIdsAsync(members.Append(owner).ToArray(), default);
        Assert.Equal(4, priority.Count);
        var downgrade = await billing.SeatQuoteAsync(active.TeamId, new(3, active.Version, "Team"), default);
        active = await billing.SeatConfirmAsync(active.TeamId, new(downgrade.Id, "downgrade"), default);
        Assert.Equal(10, active.PurchasedSeats);
        Assert.Equal("Studio", (await entitlements.GetForTeamAsync(owner, active.TeamId, default)).PlanId);
        clock.Now = active.PeriodEnd;
        await billing.ProcessRenewalsAsync(10, default);
        active = await billing.BillingAsync(active.TeamId, default);
        Assert.Equal(3, active.PurchasedSeats);
        Assert.Equal(4, active.OccupiedSeats);
        Assert.True(active.OverSeatLimit);
        Assert.Equal("Team", active.PlanId);
        Assert.Equal(30000, (await entitlements.GetForTeamAsync(owner, active.TeamId, default)).Limits["video.cloud_gpu_seconds_per_period"]);
        Assert.Equal("TEAM_SEATS_FULL", (await Assert.ThrowsAsync<ApiException>(() => organization.RequestAsync(active.TeamId, new(Guid.NewGuid().ToString()), default))).Code);
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        var currentPayment = await db.Payments.AsNoTracking().OrderByDescending(x => x.SettledAt).FirstAsync();
        var bypass = await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO billing.team_memberships (\"TeamId\", \"UserId\", \"JoinedAt\", \"Role\", \"Status\") VALUES ({active.TeamId}, {Guid.NewGuid()}, {clock.Now}, 'Member', 'Active')"));
        Assert.Equal("23514", bypass.SqlState);
        await scope.ServiceProvider.GetRequiredService<PlatformRefundService>().RefundAsync(currentPayment.Id, new("workspace-refund"), default);
        Assert.Equal("Free", (await entitlements.GetForFeaturesAsync(members[0], default)).PlanId);
        Assert.Equal("Free", (await entitlements.GetForTeamAsync(owner, active.TeamId, default)).PlanId);
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<IPlatformPlans>().GetPriorityCoachIdsAsync(members.Append(owner).ToArray(), default));
        Assert.Equal(4, await db.TeamMemberships.CountAsync(x => x.TeamId == active.TeamId && x.Status == "Active"));
    }
}
