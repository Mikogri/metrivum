using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Billing.Infrastructure;

public sealed class PlanEntitlementsProvider : IPlanEntitlementsProvider
{
    private readonly BillingDbContext db;
    private readonly ITeamContext teams;
    private readonly TimeProvider clock;
    private readonly Dictionary<(Guid User, Guid? Team, bool Features, Guid? Transaction), PlanEntitlements> cache = [];
    public PlanEntitlementsProvider(BillingDbContext db, ITeamContext teams, TimeProvider clock)
    {
        this.db = db; this.teams = teams; this.clock = clock;
        db.SavedChanges += (_, _) => cache.Clear();
    }
    // Request-local, keyed by transaction as well as account/scope. Rolled-back state is never
    // reused outside its transaction; billing writes and period expiry invalidate the snapshot.
    private async Task<PlanEntitlements> Cached(Guid user, Guid? team, bool features, Func<Task<PlanEntitlements>> load)
    {
        var key = (user, team, features, db.Database.CurrentTransaction?.TransactionId);
        var now = clock.GetUtcNow();
        if (cache.TryGetValue(key, out var previous) && previous.PeriodStart <= now && previous.PeriodEnd > now) return previous;
        return cache[key] = await load();
    }
    public Task<PlanEntitlements> GetAsync(Guid userId, CancellationToken ct) => Cached(userId, null, false, () => PersonalAsync(userId, ct));
    public Task<PlanEntitlements> GetForFeaturesAsync(Guid userId, CancellationToken ct) => Cached(userId, null, true, () => FeaturesAsync(userId, ct));
    public Task<PlanEntitlements> GetForTeamAsync(Guid userId, Guid teamId, CancellationToken ct) => Cached(userId, teamId, false, () => TeamAsync(userId, teamId, ct));
    private async Task<PlanEntitlements> PersonalAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var subscription = await db.PlatformSubscriptions.AsNoTracking().Where(x => x.OwnerId == userId)
            .Select(x => new { x.PlanId, x.Status, x.PeriodStart, x.PeriodEnd }).SingleOrDefaultAsync(ct);
        if (subscription is { PeriodStart: { } start, PeriodEnd: { } end } && end > now && start <= now
            && subscription.PlanId != "Free" && subscription.Status is "Active" or "AwaitingPayment")
            return Create(subscription.PlanId, userId, start, end);
        var period = PlanCatalog.FreePeriod(now);
        return Create("Free", userId, period.Start, period.End);
    }

    private async Task<PlanEntitlements> FeaturesAsync(Guid userId, CancellationToken ct)
    {
        var personal = await GetAsync(userId, ct);
        var membership = await teams.GetForUserAsync(userId, ct);
        if (membership is { IsActive: true })
        {
            var organization = await GetForTeamAsync(userId, membership.TeamId, ct);
            if (PlanCatalog.Get(organization.PlanId).IsProfessional) return organization;
        }
        return personal;
    }

    private async Task<PlanEntitlements> TeamAsync(Guid userId, Guid teamId, CancellationToken ct)
    {
        var membership = await teams.GetForUserAsync(userId, ct);
        if (membership?.TeamId != teamId)
            throw ApiException.NotFound();
        var now = clock.GetUtcNow();
        var subscription = await db.Set<TeamPlatformSubscription>().AsNoTracking().Where(x => x.TeamId == teamId)
            .Select(x => new { x.Status, x.PeriodStart, x.PeriodEnd, x.AcceptedPriceId }).SingleOrDefaultAsync(ct);
        if (membership.IsActive && subscription is { Status: "Active" } && subscription.PeriodStart <= now && subscription.PeriodEnd > now)
        {
            var planId = await db.PlanPrices.AsNoTracking().Where(x => x.Id == subscription.AcceptedPriceId).Select(x => x.PlanId).SingleAsync(ct);
            return Create(planId, teamId, subscription.PeriodStart, subscription.PeriodEnd);
        }
        var period = PlanCatalog.FreePeriod(now);
        return Create("Free", teamId, period.Start, period.End);
    }

    private static PlanEntitlements Create(string id, Guid scope, DateTimeOffset start, DateTimeOffset end)
    {
        var plan = PlanCatalog.Get(id);
        var allowed = plan.IsProfessional
            ? PlanFeaturePolicy.PremiumKeys.Where(key => key != "organization.workspace.manage" || plan.IsWorkspace).ToHashSet(StringComparer.Ordinal)
            : new HashSet<string>(StringComparer.Ordinal);
        return new(id, scope, start, end, allowed, plan.Limits);
    }
}
