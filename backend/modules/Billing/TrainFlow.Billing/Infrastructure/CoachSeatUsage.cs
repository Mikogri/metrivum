using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Contracts;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Billing.Infrastructure;

public sealed class CoachSeatUsage(BillingDbContext db) : ILimitUsageProvider
{
    public Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<LimitDecision>>([new("organization.coach_seats", null, 1)]);

    public async Task<IReadOnlyList<LimitDecision>> GetScopedUsageAsync(Guid ownerId, Guid? teamId, CancellationToken ct)
    {
        if (teamId == null) return await GetUsageAsync(ownerId, ct);
        if (!await db.TeamMemberships.AsNoTracking().AnyAsync(x => x.TeamId == teamId && x.UserId == ownerId && x.Status == "Active", ct))
            throw ApiException.NotFound();
        var occupied = await db.TeamMemberships.AsNoTracking().CountAsync(x => x.TeamId == teamId && x.Status == "Active", ct);
        return [new("organization.coach_seats", null, occupied)];
    }
}
